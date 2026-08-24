/**
 * WS-C Task 8 (C8): `AiUsageService.hasBilledUnit` gains an optional
 * `{ action }` filter, additive to the WS-QF/AI-2 cross-leg-dedupe signature
 * — existing 1-arg callers (generation's `seedBillingStateForCorrelation`)
 * must see identical behavior.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ aiUsage: { findFirst } }),
}));

import { AiUsageService } from '~/services/observability/ai-usage.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiUsageService.hasBilledUnit', () => {
  it('with no opts (existing 1-arg call sites, unaffected): filters on correlationId + requestCount > 0 only', async () => {
    findFirst.mockResolvedValueOnce({ id: 'row_1' });
    const usage = new AiUsageService();
    const result = await usage.hasBilledUnit('corr_1');
    expect(result).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { correlationId: 'corr_1', requestCount: { gt: 0 } },
      select: { id: true },
    });
  });

  it('with { action }: adds the action to the where clause', async () => {
    findFirst.mockResolvedValueOnce(null);
    const usage = new AiUsageService();
    const result = await usage.hasBilledUnit('hydrate:job-1', { action: 'RECIPE_HYDRATE' });
    expect(result).toBe(false);
    expect(findFirst).toHaveBeenCalledWith({
      where: { correlationId: 'hydrate:job-1', requestCount: { gt: 0 }, action: 'RECIPE_HYDRATE' },
      select: { id: true },
    });
  });

  it('returns false when no matching row exists', async () => {
    findFirst.mockResolvedValueOnce(null);
    const usage = new AiUsageService();
    expect(await usage.hasBilledUnit('corr_none')).toBe(false);
  });
});
