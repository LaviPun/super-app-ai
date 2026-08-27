/**
 * WS-C Task 13 (funnel spine). Two independent contracts:
 *  1. FunnelService.windowStats — set-intersects AI_GENERATE/AI_HYDRATE/PUBLISH
 *     jobs by shared correlationId to produce the classified→optioned→
 *     hydrated→published funnel + a recent-failures list with a friendly
 *     (AppErrorPayload-aware) message.
 *  2. The create-module-from-recipe route stamps the incoming form
 *     correlationId onto the newly created Module (or skips the update when
 *     the field is absent) — the first hop that carries the spine from
 *     generation into the module record.
 *
 * Both describe blocks share ONE `~/db.server` mock (vi.mock is hoisted and
 * module-scoped for the whole file — a second `vi.mock('~/db.server', ...)`
 * call would silently replace the first rather than layering) so `getPrisma()`
 * exposes both `job.findMany` (service 1) and `shop.upsert`/`module.update`
 * (route 2) from the same fake client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type JobFixture = { id: string; correlationId: string | null; status: string };

const GENERATE_JOBS: JobFixture[] = [
  { id: 'gen-a', correlationId: 'corr-A', status: 'SUCCESS' },
  { id: 'gen-b', correlationId: 'corr-B', status: 'SUCCESS' },
  { id: 'gen-c', correlationId: 'corr-C', status: 'FAILED' },
  { id: 'gen-d', correlationId: 'corr-D', status: 'SUCCESS' },
];

const HYDRATE_SUCCESS = [{ correlationId: 'corr-A' }, { correlationId: 'corr-B' }];
const PUBLISH_SUCCESS = [{ correlationId: 'corr-A' }];

const FAILED_JOB_ROW = {
  id: 'gen-c',
  type: 'AI_GENERATE',
  correlationId: 'corr-C',
  error: JSON.stringify({ error: 'PROVIDER_ERROR', message: 'Provider hiccup — please retry.', requestId: 'req-1' }),
  createdAt: new Date('2026-08-20T00:00:00Z'),
  shop: { shopDomain: 'failing-shop.myshopify.com' },
};

const hoisted = vi.hoisted(() => ({
  jobFindMany: vi.fn(async (args: any) => {
    const whereType = args?.where?.type;
    if (whereType === 'AI_GENERATE') return GENERATE_JOBS as unknown[];
    if (whereType === 'AI_HYDRATE') return HYDRATE_SUCCESS as unknown[];
    if (whereType === 'PUBLISH') return PUBLISH_SUCCESS as unknown[];
    if (whereType && typeof whereType === 'object' && Array.isArray(whereType.in)) return [FAILED_JOB_ROW];
    return [];
  }),
  shopUpsert: vi.fn(async () => ({ id: 'shop-1', planTier: 'BASIC' })),
  moduleUpdate: vi.fn(async (args: any) => args),
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' } })),
  enforceRateLimit: vi.fn(async () => {}),
  quotaEnforce: vi.fn(async () => {}),
  createDraft: vi.fn(async () => ({ id: 'mod-1' })),
  activityLog: vi.fn(async () => {}),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    job: { findMany: hoisted.jobFindMany },
    shop: { upsert: hoisted.shopUpsert },
    module: { update: hoisted.moduleUpdate },
  }),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/security/rate-limit.server', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('@superapp/core', () => ({
  RecipeSpecSchema: { parse: (x: unknown) => x },
}));
vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforce = hoisted.quotaEnforce;
  },
}));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    createDraft = hoisted.createDraft;
  },
}));
vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.activityLog;
  },
}));

// ---------------------------------------------------------------------------
// 1. FunnelService
// ---------------------------------------------------------------------------

describe('FunnelService.windowStats', () => {
  beforeEach(() => {
    hoisted.jobFindMany.mockClear();
  });

  it('set-intersects generate/hydrate/publish jobs by correlationId and rolls up rates', async () => {
    const { FunnelService } = await import('~/services/observability/funnel.service');
    const stats = await new FunnelService().windowStats(7);

    expect(stats.windowDays).toBe(7);
    expect(stats.classified).toBe(4);
    expect(stats.optioned).toBe(3);
    expect(stats.hydrated).toBe(2);
    expect(stats.published).toBe(1);
    expect(stats.optionedRate).toBeCloseTo(0.75);
    expect(stats.hydratedRate).toBeCloseTo(0.5);
    expect(stats.publishedRate).toBeCloseTo(0.25);
    expect(stats.endToEndRate).toBeCloseTo(0.25);

    expect(stats.recentFailures).toHaveLength(1);
    expect(stats.recentFailures[0]).toEqual({
      jobId: 'gen-c',
      type: 'AI_GENERATE',
      correlationId: 'corr-C',
      error: 'Provider hiccup — please retry.',
      createdAt: '2026-08-20T00:00:00.000Z',
      shopDomain: 'failing-shop.myshopify.com',
    });
  });

  it('defaults to a 7-day window and never divides by zero when there are no jobs', async () => {
    hoisted.jobFindMany.mockImplementation(async (args: any) => {
      const whereType = args?.where?.type;
      if (whereType && typeof whereType === 'object' && Array.isArray(whereType.in)) return [];
      return [];
    });
    const { FunnelService } = await import('~/services/observability/funnel.service');
    const stats = await new FunnelService().windowStats();

    expect(stats.windowDays).toBe(7);
    expect(stats.classified).toBe(0);
    expect(stats.optionedRate).toBe(0);
    expect(stats.hydratedRate).toBe(0);
    expect(stats.publishedRate).toBe(0);
    expect(stats.endToEndRate).toBe(0);
    expect(stats.recentFailures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. create-module-from-recipe route: generationCorrelationId stamping
// ---------------------------------------------------------------------------

describe('api.ai.create-module-from-recipe route — generationCorrelationId stamp', () => {
  beforeEach(() => {
    hoisted.moduleUpdate.mockClear();
    hoisted.createDraft.mockClear();
  });

  function makeRequest(fields: Record<string, string>): Request {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return new Request('https://app.example/api/ai/create-module-from-recipe', { method: 'POST', body: form });
  }

  it('stamps Module.generationCorrelationId when the form carries one', async () => {
    const { action } = await import('~/routes/api.ai.create-module-from-recipe');
    const spec = JSON.stringify({ type: 'theme.section', name: 'Test', category: 'STOREFRONT_UI' });
    const res = await action({ request: makeRequest({ spec, correlationId: 'corr-XYZ' }) } as any);
    expect(res.status).toBe(200);

    expect(hoisted.moduleUpdate).toHaveBeenCalledTimes(1);
    expect(hoisted.moduleUpdate).toHaveBeenCalledWith({
      where: { id: 'mod-1' },
      data: { generationCorrelationId: 'corr-XYZ' },
    });
  });

  it('omits the update when correlationId is absent from the form', async () => {
    const { action } = await import('~/routes/api.ai.create-module-from-recipe');
    const spec = JSON.stringify({ type: 'theme.section', name: 'Test', category: 'STOREFRONT_UI' });
    const res = await action({ request: makeRequest({ spec }) } as any);
    expect(res.status).toBe(200);

    expect(hoisted.moduleUpdate).not.toHaveBeenCalled();
  });
});
