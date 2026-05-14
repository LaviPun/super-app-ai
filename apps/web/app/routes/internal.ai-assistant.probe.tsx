import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { requireInternalAdmin } from '~/internal-admin/session.server';
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

  const [localHealth, modalHealth, localChatProbe, modalChatProbe] = await Promise.all([
    probeTargetLiveness({
      backend: config.targets.localMachine.backend,
      url: config.targets.localMachine.url,
      token: config.targets.localMachine.token,
      timeoutMs: config.targets.localMachine.timeoutMs,
    }),
    probeTargetLiveness({
      backend: config.targets.modalRemote.backend,
      url: config.targets.modalRemote.url,
      token: config.targets.modalRemote.token,
      timeoutMs: config.targets.modalRemote.timeoutMs,
    }),
    validateAssistantChatTarget({
      target: 'localMachine',
      backend: config.targets.localMachine.backend,
      url: config.targets.localMachine.url,
      token: config.targets.localMachine.token,
      timeoutMs: config.targets.localMachine.timeoutMs,
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

export async function loader({ request }: LoaderFunctionArgs) {
  await requireInternalAdmin(request);
  const result = await probeAssistantTargets();
  return json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function action({ request }: LoaderFunctionArgs) {
  await requireInternalAdmin(request);
  const result = await probeAssistantTargets();
  return json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
