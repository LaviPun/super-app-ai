import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassifyResult } from '~/services/ai/classify.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';
import {
  buildPromptRouterDecision,
  getPromptRouterMetricsSnapshot,
  getReleaseGateState,
  resetPromptRouterInternalsForTests,
} from '~/services/ai/prompt-router.server';
import { ActivityLogService } from '~/services/activity/activity.service';

function makeClassification(confidenceScore: number): ClassifyResult {
  return {
    moduleType: 'theme.popup',
    intent: 'promo.popup',
    surface: 'home',
    confidence: confidenceScore >= 0.8 ? 'high' : confidenceScore >= 0.55 ? 'medium' : 'low',
    confidenceScore,
    alternatives: [],
    reasons: ['test'],
  };
}

function routerPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    moduleType: 'theme.popup',
    confidence: 0.99,
    intent: 'promo.popup',
    surface: 'home',
    settingsRequired: [] as string[],
    includeFlags: {
      includeSettingsPack: true,
      includeIntentPacket: true,
      includeCatalog: true,
      includeFullSchema: true,
      includeStyleSchema: true,
    },
    needsClarification: false,
    reasonCode: 'internal_router_ok',
    reasoning: 'model',
    ...overrides,
  };
}

beforeEach(() => {
  resetPromptRouterInternalsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('buildPromptRouterDecision', () => {
  it('uses high-confidence gating for compact prompts', async () => {
    const classification = makeClassification(0.9);
    const packet = buildIntentPacket('show a popup', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });

    const decision = await buildPromptRouterDecision({
      prompt: 'show a popup',
      classification,
      intentPacket: packet,
    });

    expect(decision.reasonCode).toBe('deterministic_high_confidence');
    expect(decision.includeFlags.includeCatalog).toBe(false);
    expect(decision.includeFlags.includeFullSchema).toBe(false);
    expect(decision.includeFlags.includeStyleSchema).toBe(false);
    expect(decision.includeFlags.includeIntentPacket).toBe(false);
  });

  it('uses medium-confidence gating with targeted catalog', async () => {
    const classification = makeClassification(0.65);
    const packet = buildIntentPacket('some popup with discount', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });

    const decision = await buildPromptRouterDecision({
      prompt: 'some popup with discount',
      classification,
      intentPacket: packet,
    });

    expect(decision.reasonCode).toBe('deterministic_medium_confidence');
    expect(decision.includeFlags.includeCatalog).toBe(true);
    expect(decision.includeFlags.includeFullSchema).toBe(false);
    expect(decision.includeFlags.includeStyleSchema).toBe(false);
    expect(decision.catalogFilters?.limit).toBe(8);
  });

  it('uses low-confidence gating with full schema and style schema', async () => {
    const classification = makeClassification(0.4);
    const packet = buildIntentPacket('make something for engagement', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });

    const decision = await buildPromptRouterDecision({
      prompt: 'make something for engagement',
      classification,
      intentPacket: packet,
    });

    expect(decision.reasonCode).toBe('deterministic_low_confidence');
    expect(decision.includeFlags.includeCatalog).toBe(true);
    expect(decision.includeFlags.includeFullSchema).toBe(true);
    expect(decision.includeFlags.includeStyleSchema).toBe(true);
    expect(decision.includeFlags.includeIntentPacket).toBe(true);
  });
});

describe('internal router client', () => {
  it('clamps router confidence to the deterministic band', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    vi.stubEnv('INTERNAL_AI_ROUTER_SHADOW', '0');
    vi.stubEnv('ROUTER_CONFIDENCE_MAX_DELTA', '0.15');
    const classification = makeClassification(0.65);
    const packet = buildIntentPacket('popup', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(routerPayload({ confidence: 0.99 })), { status: 200 }),
    );

    const decision = await buildPromptRouterDecision({
      prompt: 'popup',
      classification,
      intentPacket: packet,
    });

    expect(decision.confidence).toBeCloseTo(0.8, 5);
    expect(getPromptRouterMetricsSnapshot().harnessConfidenceClamps).toBeGreaterThanOrEqual(1);
  });

  it('forces moduleType to match classification when router disagrees', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    vi.stubEnv('INTERNAL_AI_ROUTER_SHADOW', '0');
    const classification = makeClassification(0.65);
    const packet = buildIntentPacket('popup', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(routerPayload({ moduleType: 'theme.banner' })), { status: 200 }),
    );

    const decision = await buildPromptRouterDecision({
      prompt: 'popup',
      classification,
      intentPacket: packet,
    });

    expect(decision.moduleType).toBe('theme.popup');
    expect(decision.reasonCode).toBe('internal_router_module_type_corrected');
    expect(getPromptRouterMetricsSnapshot().harnessModuleTypeCorrections).toBeGreaterThanOrEqual(1);
  });

  it('opens the circuit after repeated failures and skips further calls', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    vi.stubEnv('INTERNAL_AI_ROUTER_CIRCUIT_FAILURE_THRESHOLD', '3');
    vi.stubEnv('INTERNAL_AI_ROUTER_CIRCUIT_COOLDOWN_MS', '60000');
    const classification = makeClassification(0.65);
    const packet = buildIntentPacket('popup', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    for (let i = 0; i < 3; i += 1) {
      await buildPromptRouterDecision({ prompt: 'popup', classification, intentPacket: packet });
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    await buildPromptRouterDecision({ prompt: 'popup', classification, intentPacket: packet });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(getPromptRouterMetricsSnapshot().circuitSkips).toBeGreaterThanOrEqual(1);
  });

  it('shadow mode keeps deterministic flags while exercising the router', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    vi.stubEnv('INTERNAL_AI_ROUTER_SHADOW', '1');
    const classification = makeClassification(0.9);
    const packet = buildIntentPacket('popup', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(routerPayload({ includeFlags: routerPayload().includeFlags })), {
        status: 200,
      }),
    );

    const decision = await buildPromptRouterDecision({
      prompt: 'popup',
      classification,
      intentPacket: packet,
    });

    expect(decision.reasonCode).toBe('deterministic_high_confidence');
    expect(decision.includeFlags.includeCatalog).toBe(false);
    expect(getPromptRouterMetricsSnapshot().shadowsRecorded).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('canary allowlist skips the router for non-listed shops', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    vi.stubEnv('INTERNAL_AI_ROUTER_CANARY_SHOPS', 'allowed.myshopify.com');
    const classification = makeClassification(0.65);
    const packet = buildIntentPacket('popup', classification, {
      storeContext: { shop_domain: 'other.myshopify.com', theme_os2: true },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    const decision = await buildPromptRouterDecision({
      prompt: 'popup',
      classification,
      intentPacket: packet,
      shopDomain: 'other.myshopify.com',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(decision.reasonCode).toBe('deterministic_medium_confidence');
    expect(getPromptRouterMetricsSnapshot().canarySkips).toBe(1);
  });

  it('rolls to dual-target fallback when the primary target errors and increments modalRemote attempts', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://primary.test');
    vi.stubEnv('INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED', '1');
    vi.stubEnv('MODAL_ROUTER_URL', 'http://fallback.test');
    vi.stubEnv('INTERNAL_AI_ROUTER_SHADOW', '0');
    vi.stubEnv('INTERNAL_AI_ROUTER_CIRCUIT_FAILURE_THRESHOLD', '99');
    const classification = makeClassification(0.65);
    const packet = buildIntentPacket('popup', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => {
        throw new Error('primary network error');
      })
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify(routerPayload({ moduleType: 'theme.popup', confidence: 0.7 })), {
            status: 200,
          }),
      );

    const decision = await buildPromptRouterDecision({
      prompt: 'popup',
      classification,
      intentPacket: packet,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const snap = getPromptRouterMetricsSnapshot();
    expect(snap.byTarget.localMachine.attempts).toBeGreaterThanOrEqual(1);
    expect(snap.byTarget.modalRemote.attempts).toBeGreaterThanOrEqual(1);
    expect(snap.byTarget.modalRemote.successes).toBeGreaterThanOrEqual(1);
    expect(snap.byTarget.localMachine.fallbacks).toBeGreaterThanOrEqual(1);
    // The fallback attempt itself may trip the release gate (one bad primary sample),
    // forcing shadow mode; either path returns a usable PromptRouterDecision.
    expect(decision.version).toBe('1.0');
  });
});

describe('release gate', () => {
  it('trips when schema-fail rate exceeds the configured max, emits the activity log event, and forces shadow on the next successful call', async () => {
    vi.stubEnv('INTERNAL_AI_ROUTER_URL', 'http://router.test');
    vi.stubEnv('INTERNAL_AI_ROUTER_SHADOW', '0');
    vi.stubEnv('INTERNAL_AI_ROUTER_CIRCUIT_FAILURE_THRESHOLD', '9999');
    const logSpy = vi
      .spyOn(ActivityLogService.prototype, 'log')
      .mockResolvedValue(undefined as unknown as void);
    const classification = makeClassification(0.65);
    const packet = buildIntentPacket('popup', classification, {
      storeContext: { shop_domain: 'shop.myshopify.com', theme_os2: true },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ not: 'a valid decision' }), { status: 200 }),
      );

    for (let i = 0; i < 3; i += 1) {
      await buildPromptRouterDecision({
        prompt: 'popup',
        classification,
        intentPacket: packet,
      });
    }

    const gate = getReleaseGateState();
    expect(gate.tripped).toBe(true);
    expect(gate.metric === 'schemaFailRate' || gate.metric === 'fallbackRate').toBe(true);
    expect(gate.target).toBe('localMachine');
    const tripped = logSpy.mock.calls.find(
      ([entry]) => entry.action === 'ROUTER_RELEASE_GATE_TRIPPED',
    );
    expect(tripped).toBeDefined();

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(routerPayload({ moduleType: 'theme.popup', confidence: 0.65 })), {
        status: 200,
      }),
    );
    const decision = await buildPromptRouterDecision({
      prompt: 'popup',
      classification,
      intentPacket: packet,
    });
    expect(decision.reasonCode).toMatch(/^deterministic_/);
    expect(getPromptRouterMetricsSnapshot().shadowsRecorded).toBeGreaterThanOrEqual(1);
  });
});
