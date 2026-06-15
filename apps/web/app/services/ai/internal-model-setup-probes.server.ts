import { PromptRouterDecisionSchema } from '~/schemas/prompt-router.server';
import type { RouterRuntimeConfig, RouterRuntimeTarget } from '~/schemas/router-runtime-config.server';
import {
  fetchWithTimeout,
  probeTargetLiveness,
  type AssistantChatProbeResult,
} from '~/services/ai/assistant-chat-target-probe.server';

type ProbeResult = AssistantChatProbeResult;

export async function runHealthProbe(
  config: RouterRuntimeConfig,
  target: RouterRuntimeTarget,
): Promise<ProbeResult> {
  const targetConfig = config.targets[target];
  const url = targetConfig.url?.trim();
  if (!url) return { ok: false, message: `${target} URL missing` };
  return probeTargetLiveness({
    backend: targetConfig.backend,
    url,
    token: targetConfig.token,
    timeoutMs: targetConfig.timeoutMs,
  });
}

export async function runRouteProbe(
  config: RouterRuntimeConfig,
  target: RouterRuntimeTarget,
): Promise<ProbeResult> {
  const targetConfig = config.targets[target];
  const url = targetConfig.url?.trim();
  if (!url) return { ok: false, message: `${target} URL missing` };
  try {
    const payload = {
      prompt: 'Create a popup with 10% discount.',
      classification: {
        moduleType: 'theme.section',
        intent: 'promo.popup',
        surface: 'home',
        confidence: 0.7,
        alternatives: [],
      },
      intentPacket: {
        classification: {
          intent: 'promo.popup',
          confidence: 0.7,
          evidence: [],
          moduleTypeHint: 'theme.section',
        },
        routing: {
          needCatalog: true,
          needSettings: true,
          needSchema: false,
          styleRichness: 'medium',
        },
      },
      fallback: {
        version: '1.0',
        moduleType: 'theme.section',
        confidence: 0.7,
        includeFlags: {
          includeSettingsPack: true,
          includeIntentPacket: true,
          includeCatalog: true,
          includeFullSchema: false,
          includeStyleSchema: false,
        },
        settingsRequired: ['title'],
        needsClarification: false,
        reasonCode: 'deterministic_medium_confidence',
        reasoning: 'probe_fallback',
      },
      operationClass: 'P0_CREATE',
    };
    const response = await fetchWithTimeout(
      `${url.replace(/\/+$/, '')}/route`,
      targetConfig.token,
      targetConfig.timeoutMs,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    if (!response.ok) return { ok: false, message: `/route returned ${response.status}` };
    const data = await response.json();
    const parsed = PromptRouterDecisionSchema.safeParse(data);
    if (!parsed.success) return { ok: false, message: '/route JSON failed PromptRouterDecisionSchema' };
    return { ok: true, message: `/route schema check passed (${parsed.data.reasonCode})` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'route probe failed' };
  }
}
