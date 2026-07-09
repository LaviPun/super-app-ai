import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  priceFindFirst: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiModelPrice: { findFirst: hoisted.priceFindFirst },
  }),
}));

import { estimateCostCentsFromDbRates } from '~/services/ai/cost-estimate.server';

beforeEach(() => {
  vi.clearAllMocks();
});

const CLAUDE_PRICE = { inputPer1MTokensCents: 300, outputPer1MTokensCents: 1500 };

describe('estimateCostCentsFromDbRates', () => {
  it('returns 0 with no lookups when model is blank', async () => {
    const cents = await estimateCostCentsFromDbRates({ providerId: 'prov_1', model: '  ', tokensIn: 1000, tokensOut: 1000 });
    expect(cents).toBe(0);
    expect(hoisted.priceFindFirst).not.toHaveBeenCalled();
  });

  it('computes cents from a providerId-scoped active price row', async () => {
    hoisted.priceFindFirst.mockResolvedValue(CLAUDE_PRICE);
    const cents = await estimateCostCentsFromDbRates({
      providerId: 'prov_1',
      model: 'claude-sonnet-4-6',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    expect(cents).toBe(300 + 1500); // $3 in + $15 out per 1M tokens, at exactly 1M each
    expect(hoisted.priceFindFirst).toHaveBeenCalledTimes(1);
    expect(hoisted.priceFindFirst).toHaveBeenCalledWith({
      where: { providerId: 'prov_1', model: 'claude-sonnet-4-6', isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  });

  it('returns 0 for a providerId-scoped lookup with no matching price row', async () => {
    hoisted.priceFindFirst.mockResolvedValue(null);
    const cents = await estimateCostCentsFromDbRates({ providerId: 'prov_1', model: 'unknown-model', tokensIn: 100, tokensOut: 100 });
    expect(cents).toBe(0);
  });

  it('returns 0 with no lookups when no providerId and no providerKinds are given', async () => {
    const cents = await estimateCostCentsFromDbRates({ model: 'claude-sonnet-4-6', tokensIn: 100, tokensOut: 100 });
    expect(cents).toBe(0);
    expect(hoisted.priceFindFirst).not.toHaveBeenCalled();
  });

  it('kind-based lookup prefers a price attached to a routing-active provider', async () => {
    hoisted.priceFindFirst.mockResolvedValueOnce(CLAUDE_PRICE); // first call: active-provider-scoped query hits
    const cents = await estimateCostCentsFromDbRates({
      providerKinds: ['ANTHROPIC'],
      model: 'claude-sonnet-4-6',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    expect(cents).toBe(1800);
    expect(hoisted.priceFindFirst).toHaveBeenCalledTimes(1); // no need for the fallback query
    expect(hoisted.priceFindFirst).toHaveBeenCalledWith({
      where: { model: 'claude-sonnet-4-6', isActive: true, provider: { provider: { in: ['ANTHROPIC'] }, isActive: true } },
      orderBy: { effectiveFrom: 'desc' },
    });
  });

  it('kind-based lookup falls back to ANY priced provider of that kind when none is routing-active (env-key deployments)', async () => {
    hoisted.priceFindFirst
      .mockResolvedValueOnce(null) // active-provider-scoped query: nothing (env-key path has no active DB provider)
      .mockResolvedValueOnce(CLAUDE_PRICE); // fallback query: any provider of this kind

    const cents = await estimateCostCentsFromDbRates({
      providerKinds: ['ANTHROPIC'],
      model: 'claude-sonnet-4-6',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });

    expect(cents).toBe(1800);
    expect(hoisted.priceFindFirst).toHaveBeenCalledTimes(2);
    expect(hoisted.priceFindFirst).toHaveBeenNthCalledWith(2, {
      where: { model: 'claude-sonnet-4-6', isActive: true, provider: { provider: { in: ['ANTHROPIC'] } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  });

  it('returns 0 when truly no price row exists for the kind at all', async () => {
    hoisted.priceFindFirst.mockResolvedValue(null);
    const cents = await estimateCostCentsFromDbRates({ providerKinds: ['GEMINI'], model: 'gemini-2.5-flash', tokensIn: 500, tokensOut: 500 });
    expect(cents).toBe(0);
    expect(hoisted.priceFindFirst).toHaveBeenCalledTimes(2);
  });

  it('preserves sub-cent (fractional) precision instead of rounding to integer cents', async () => {
    hoisted.priceFindFirst.mockResolvedValue({ inputPer1MTokensCents: 25, outputPer1MTokensCents: 200 });
    const cents = await estimateCostCentsFromDbRates({ providerId: 'prov_1', model: 'gpt-5-mini', tokensIn: 4065, tokensOut: 1370 });
    // (4065/1e6)*25 + (1370/1e6)*200 = 0.101625 + 0.274 = 0.375625 cents.
    // Must NOT round to 0 — that would erase real spend once summed over many calls.
    expect(cents).toBeCloseTo(0.375625, 6);
    expect(cents).toBeGreaterThan(0);
  });
});
