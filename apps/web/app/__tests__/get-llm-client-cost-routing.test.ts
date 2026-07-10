import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * getLlmClient cost-based routing (getLlmClient in llm.server.ts).
 *
 * Cheapest-first routing is gated behind AI_COST_ROUTING_ENABLED (default OFF)
 * so seeding AiModelPrice for observability never silently reroutes traffic.
 * These tests exercise the routing behavior, so they opt the flag ON; the
 * flag-OFF safety (pricing present but routing stays legacy) is asserted below.
 *
 * Fixture providers, cheapest to most expensive by blended score (0.75*in + 0.25*out):
 *  - prov_openai:    $0.25 / $2.00 per 1M  -> score 68.75  (cheapest)
 *  - prov_gemini:    $0.30 / $2.50 per 1M  -> score 85.00
 *  - prov_anthropic: $3.00 / $15.00 per 1M -> score 600.00 (most expensive)
 */
const hoisted = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  providerFindMany: vi.fn(),
  providerFindFirst: vi.fn(),
  providerFindUniqueImpl: vi.fn(),
  priceFindFirst: vi.fn(),
  appSettingsFindUnique: vi.fn(),
  getApiKey: vi.fn(),
  openAiGenerateRecipe: vi.fn(),
  anthropicGenerateRecipe: vi.fn(),
  geminiGenerateRecipe: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: hoisted.shopFindUnique },
    aiProvider: {
      findMany: hoisted.providerFindMany,
      findFirst: hoisted.providerFindFirst,
      findUnique: hoisted.providerFindUniqueImpl,
    },
    aiModelPrice: { findFirst: hoisted.priceFindFirst },
    appSettings: { findUnique: hoisted.appSettingsFindUnique },
  }),
}));

vi.mock('~/services/internal/ai-provider.service', () => ({
  AiProviderService: class {
    async getApiKey(id: string) {
      return hoisted.getApiKey(id);
    }
  },
}));

vi.mock('~/services/ai/clients/openai-responses.client.server', () => ({
  openAiGenerateRecipe: (...args: unknown[]) => hoisted.openAiGenerateRecipe(...args),
}));
vi.mock('~/services/ai/clients/anthropic-messages.client.server', () => ({
  anthropicGenerateRecipe: (...args: unknown[]) => hoisted.anthropicGenerateRecipe(...args),
}));
vi.mock('~/services/ai/clients/gemini.client.server', () => ({
  geminiGenerateRecipe: (...args: unknown[]) => hoisted.geminiGenerateRecipe(...args),
}));

import { getLlmClient } from '~/services/ai/llm.server';

const PROVIDERS: Record<string, { id: string; provider: string; model: string; baseUrl: null; extraConfig: null }> = {
  prov_openai: { id: 'prov_openai', provider: 'OPENAI', model: 'gpt-5-mini', baseUrl: null, extraConfig: null },
  prov_gemini: { id: 'prov_gemini', provider: 'GEMINI', model: 'gemini-2.5-flash', baseUrl: null, extraConfig: null },
  prov_anthropic: { id: 'prov_anthropic', provider: 'ANTHROPIC', model: 'claude-sonnet-4-6', baseUrl: null, extraConfig: null },
};

const PRICES: Record<string, { inputPer1MTokensCents: number; outputPer1MTokensCents: number } | null> = {
  prov_openai: { inputPer1MTokensCents: 25, outputPer1MTokensCents: 200 },
  prov_gemini: { inputPer1MTokensCents: 30, outputPer1MTokensCents: 250 },
  prov_anthropic: { inputPer1MTokensCents: 300, outputPer1MTokensCents: 1500 },
};

const ok = { rawJson: '{"recipe":{}}', tokensIn: 1, tokensOut: 2, model: 'm' };

const originalFlag = process.env.AI_COST_ROUTING_ENABLED;
afterEach(() => {
  if (originalFlag === undefined) delete process.env.AI_COST_ROUTING_ENABLED;
  else process.env.AI_COST_ROUTING_ENABLED = originalFlag;
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_COST_ROUTING_ENABLED = 'true'; // opt into cost routing for these cases
  hoisted.shopFindUnique.mockResolvedValue(null);
  hoisted.appSettingsFindUnique.mockResolvedValue(null);
  hoisted.getApiKey.mockResolvedValue('sk-test');
  hoisted.providerFindUniqueImpl.mockImplementation(async ({ where }: { where: { id: string } }) => PROVIDERS[where.id] ?? null);
  hoisted.priceFindFirst.mockImplementation(async ({ where }: { where: { providerId: string } }) => {
    const p = PRICES[where.providerId];
    return p ? { ...p, isActive: true, effectiveFrom: new Date(0) } : null;
  });
  hoisted.openAiGenerateRecipe.mockResolvedValue(ok);
  hoisted.anthropicGenerateRecipe.mockResolvedValue(ok);
  hoisted.geminiGenerateRecipe.mockResolvedValue(ok);
});

function activeProviders(ids: string[]) {
  hoisted.providerFindMany.mockResolvedValue(ids.map((id) => PROVIDERS[id]));
}

describe('getLlmClient cost-based routing', () => {
  it('routes to the cheapest active priced provider first', async () => {
    activeProviders(['prov_anthropic', 'prov_openai', 'prov_gemini']);

    const { client, providerId } = await getLlmClient(null);
    expect(providerId).toBe('prov_openai');

    await client.generateRecipe('prompt');

    expect(hoisted.openAiGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.geminiGenerateRecipe).not.toHaveBeenCalled();
    expect(hoisted.anthropicGenerateRecipe).not.toHaveBeenCalled();
  });

  it('falls through to the next-cheapest provider when the cheapest fails', async () => {
    activeProviders(['prov_anthropic', 'prov_openai', 'prov_gemini']);
    hoisted.openAiGenerateRecipe.mockRejectedValue(new Error('rate limited'));

    const { client } = await getLlmClient(null);
    const result = await client.generateRecipe('prompt');

    expect(hoisted.openAiGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.geminiGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.anthropicGenerateRecipe).not.toHaveBeenCalled();
    expect(result.rawJson).toBe(ok.rawJson);
  });

  it('an explicit per-shop provider override wins outright, skipping cost ranking entirely', async () => {
    activeProviders(['prov_anthropic', 'prov_openai', 'prov_gemini']);
    hoisted.shopFindUnique.mockResolvedValue({ aiProviderOverrideId: 'prov_anthropic' });

    const { client, providerId } = await getLlmClient('shop_1');
    expect(providerId).toBe('prov_anthropic');

    await client.generateRecipe('prompt');

    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.openAiGenerateRecipe).not.toHaveBeenCalled();
    // The cheaper providers were never even consulted for this pinned shop.
    expect(hoisted.providerFindMany).not.toHaveBeenCalled();
  });

  it('with the flag OFF, does NOT cost-rank even when pricing exists — stays on the legacy path', async () => {
    process.env.AI_COST_ROUTING_ENABLED = 'false';
    activeProviders(['prov_anthropic', 'prov_openai', 'prov_gemini']); // all priced
    hoisted.providerFindFirst.mockResolvedValue(PROVIDERS.prov_anthropic); // legacy resolveProviderIdForShop

    const { providerId } = await getLlmClient(null);

    // Legacy path chose the operator provider, NOT the cheapest (prov_openai).
    expect(providerId).toBe('prov_anthropic');
    // Cost ranking was never consulted — pricing data did not reroute traffic.
    expect(hoisted.providerFindMany).not.toHaveBeenCalled();
  });

  it('falls back to the legacy single active provider when no provider has pricing configured', async () => {
    activeProviders(['prov_anthropic']);
    hoisted.priceFindFirst.mockResolvedValue(null); // no AiModelPrice rows at all
    hoisted.providerFindFirst.mockResolvedValue(PROVIDERS.prov_anthropic); // legacy resolveProviderIdForShop path

    const { client, providerId } = await getLlmClient(null);
    expect(providerId).toBe('prov_anthropic');

    await client.generateRecipe('prompt');
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
  });

  it('does not double-call the operator fallback when it already appears in the cost chain', async () => {
    activeProviders(['prov_anthropic', 'prov_openai', 'prov_gemini']);
    // Operator manually pinned the cheapest provider as "the" fallback too — should be a no-op append.
    hoisted.appSettingsFindUnique.mockResolvedValue({ fallbackAiProviderId: 'prov_openai' });
    hoisted.openAiGenerateRecipe.mockRejectedValue(new Error('down'));
    hoisted.geminiGenerateRecipe.mockRejectedValue(new Error('down'));

    const { client } = await getLlmClient(null);
    await client.generateRecipe('prompt');

    expect(hoisted.openAiGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.geminiGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
  });
});
