// WS P2-A Task 6: cache-hit stats are OBSERVABILITY — they ride along in the
// existing `meta` JSON column (no schema change, no billed-unit change).
import { describe, expect, it, vi } from 'vitest';

const create = vi.fn(async (args: any) => ({ id: 'usage_1', ...args.data }));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ aiUsage: { create } }),
}));

import { AiUsageService } from '~/services/observability/ai-usage.service';

describe('AiUsageService cache-hit meta (P2-A)', () => {
  it('merges cacheReadTokens/cacheCreationTokens into meta JSON alongside attempts/model', async () => {
    const svc = new AiUsageService();
    await svc.record({
      providerId: 'prov_1',
      action: 'RECIPE_GENERATION',
      tokensIn: 500,
      tokensOut: 200,
      costCents: 0.4,
      meta: { attempts: 1, model: 'claude-sonnet-5' },
      cacheReadTokens: 1800,
      cacheCreationTokens: 0,
    });
    const written = JSON.parse(create.mock.calls[0]![0].data.meta);
    expect(written).toMatchObject({ attempts: 1, model: 'claude-sonnet-5', cacheReadTokens: 1800, cacheCreationTokens: 0 });
  });

  it('omits the cache fields from meta entirely when neither is provided (non-Anthropic providers)', async () => {
    const svc = new AiUsageService();
    await svc.record({
      providerId: 'prov_2',
      action: 'RECIPE_GENERATION',
      tokensIn: 500,
      tokensOut: 200,
      costCents: 0.4,
      meta: { attempts: 1, model: 'gpt-4o-mini' },
    });
    const written = JSON.parse(create.mock.calls.at(-1)![0].data.meta);
    expect(written.cacheReadTokens).toBeUndefined();
    expect(written.cacheCreationTokens).toBeUndefined();
  });

  it('writes cache fields even when no other meta was provided', async () => {
    const svc = new AiUsageService();
    await svc.record({
      providerId: 'prov_3',
      action: 'RECIPE_HYDRATE',
      tokensIn: 100,
      tokensOut: 50,
      costCents: 0.1,
      cacheReadTokens: 900,
    });
    const written = JSON.parse(create.mock.calls.at(-1)![0].data.meta);
    expect(written).toEqual({ cacheReadTokens: 900 });
  });

  it('keeps meta null when there is no meta and no cache stats (pre-P2-A behavior)', async () => {
    const svc = new AiUsageService();
    await svc.record({
      providerId: 'prov_4',
      action: 'RECIPE_GENERATION',
      tokensIn: 10,
      tokensOut: 5,
      costCents: 0,
    });
    expect(create.mock.calls.at(-1)![0].data.meta).toBeNull();
  });
});
