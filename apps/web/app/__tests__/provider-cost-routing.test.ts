import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  providerFindMany: vi.fn(),
  priceFindFirst: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiProvider: { findMany: hoisted.providerFindMany },
    aiModelPrice: { findFirst: hoisted.priceFindFirst },
  }),
}));

import { getCostRankedActiveProviders } from '~/services/ai/provider-cost-routing.server';

beforeEach(() => {
  vi.clearAllMocks();
});

function price(inputPer1MTokensCents: number, outputPer1MTokensCents: number) {
  return { inputPer1MTokensCents, outputPer1MTokensCents, isActive: true };
}

describe('getCostRankedActiveProviders', () => {
  it('ranks cheapest-first using a blended input/output score', async () => {
    hoisted.providerFindMany.mockResolvedValue([
      { id: 'prov_anthropic', model: 'claude-sonnet-4-6' },
      { id: 'prov_openai', model: 'gpt-5-mini' },
      { id: 'prov_gemini', model: 'gemini-2.5-flash' },
    ]);
    hoisted.priceFindFirst.mockImplementation(async ({ where }: { where: { providerId: string } }) => {
      switch (where.providerId) {
        case 'prov_anthropic': return price(300, 1500); // Sonnet: $3 / $15 per 1M
        case 'prov_openai': return price(25, 200); // GPT-5-mini: $0.25 / $2 per 1M
        case 'prov_gemini': return price(30, 250); // Gemini 2.5 Flash: $0.30 / $2.50 per 1M
        default: return null;
      }
    });

    const ranked = await getCostRankedActiveProviders();

    expect(ranked.map(r => r.providerId)).toEqual(['prov_openai', 'prov_gemini', 'prov_anthropic']);
  });

  it('excludes an active provider with no priced model', async () => {
    hoisted.providerFindMany.mockResolvedValue([
      { id: 'prov_priced', model: 'gpt-5-mini' },
      { id: 'prov_unpriced', model: 'some-custom-model' },
    ]);
    hoisted.priceFindFirst.mockImplementation(async ({ where }: { where: { providerId: string } }) =>
      where.providerId === 'prov_priced' ? price(25, 200) : null,
    );

    const ranked = await getCostRankedActiveProviders();

    expect(ranked.map(r => r.providerId)).toEqual(['prov_priced']);
  });

  it('excludes an active provider with no configured default model', async () => {
    hoisted.providerFindMany.mockResolvedValue([{ id: 'prov_no_model', model: null }]);

    const ranked = await getCostRankedActiveProviders();

    expect(ranked).toEqual([]);
    expect(hoisted.priceFindFirst).not.toHaveBeenCalled();
  });

  it('returns an empty list when no providers are active', async () => {
    hoisted.providerFindMany.mockResolvedValue([]);

    const ranked = await getCostRankedActiveProviders();

    expect(ranked).toEqual([]);
  });
});
