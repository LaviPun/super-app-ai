import { isInternalAiLocalOnlyEnabled } from '~/env.server';
import { DEFAULT_ROUTER_RUNTIME_CONFIG, type RouterRuntimeConfig } from '~/schemas/router-runtime-config.server';
import { getRouterRuntimeConfig } from '~/services/ai/router-runtime-config.server';
import {
  probeTargetLiveness,
  validateAssistantChatTarget,
  type AssistantChatProbeResult,
} from '~/services/ai/assistant-chat-target-probe.server';

export type ProbeRouteResult = {
  localMachine: {
    health: AssistantChatProbeResult;
    chatProbe: AssistantChatProbeResult;
  };
  modalRemote: {
    health: AssistantChatProbeResult;
    chatProbe: AssistantChatProbeResult;
  };
  parseError?: string;
};

function resolveConfig(runtime: unknown): { config: RouterRuntimeConfig; parseError?: string } {
  if (runtime && typeof runtime === 'object' && 'config' in runtime) {
    const wrapped = runtime as { config: RouterRuntimeConfig; parseError?: unknown };
    return {
      config: wrapped.config,
      parseError: typeof wrapped.parseError === 'string' ? wrapped.parseError : undefined,
    };
  }
  return { config: runtime as RouterRuntimeConfig };
}

export async function probeAssistantTargets(
  loadConfig: () => Promise<unknown> = getRouterRuntimeConfig,
): Promise<ProbeRouteResult> {
  let runtime: unknown = DEFAULT_ROUTER_RUNTIME_CONFIG;
  let parseError: string | undefined;
  try {
    runtime = await loadConfig();
  } catch (error) {
    parseError = `Runtime config unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
  const { config, parseError: configParseError } = resolveConfig(runtime);
  if (configParseError) parseError = configParseError;
  const assistantLocalOnly = isInternalAiLocalOnlyEnabled();

  const [localHealth, localChatProbe] = await Promise.all([
    probeTargetLiveness({
      backend: config.targets.localMachine.backend,
      url: config.targets.localMachine.url,
      token: config.targets.localMachine.token,
      timeoutMs: config.targets.localMachine.timeoutMs,
    }),
    validateAssistantChatTarget({
      target: 'localMachine',
      backend: config.targets.localMachine.backend,
      url: config.targets.localMachine.url,
      token: config.targets.localMachine.token,
      timeoutMs: config.targets.localMachine.timeoutMs,
    }),
  ]);
  const [modalHealth, modalChatProbe] = assistantLocalOnly
    ? [
        { ok: false, message: 'disabled (INTERNAL_AI_LOCAL_ONLY)' },
        { ok: false, message: 'disabled (INTERNAL_AI_LOCAL_ONLY)' },
      ]
    : await Promise.all([
        probeTargetLiveness({
          backend: config.targets.modalRemote.backend,
          url: config.targets.modalRemote.url,
          token: config.targets.modalRemote.token,
          timeoutMs: config.targets.modalRemote.timeoutMs,
        }),
        validateAssistantChatTarget({
          target: 'modalRemote',
          backend: config.targets.modalRemote.backend,
          url: config.targets.modalRemote.url,
          token: config.targets.modalRemote.token,
          timeoutMs: config.targets.modalRemote.timeoutMs,
        }),
      ]);

  return {
    localMachine: { health: localHealth, chatProbe: localChatProbe },
    modalRemote: { health: modalHealth, chatProbe: modalChatProbe },
    ...(parseError ? { parseError } : {}),
  };
}
