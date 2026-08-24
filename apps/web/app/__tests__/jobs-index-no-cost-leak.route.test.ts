import { describe, it, expect, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' } })),
  shopFindUnique: vi.fn(async () => ({ id: 'shop_1' })),
  jobFindMany: vi.fn(async () => [
    { id: 'job_1', type: 'AI_GENERATE', status: 'SUCCESS', attempts: 1, error: null,
      createdAt: new Date(), startedAt: new Date(), finishedAt: new Date(),
      correlationId: 'corr_1', requestId: 'req_1', payload: '{}', result: null },
  ]),
  activityFindMany: vi.fn(async () => []),
  moduleFindMany: vi.fn(async () => []),
}));
vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: hoisted.shopFindUnique },
    job: { findMany: hoisted.jobFindMany },
    activityLog: { findMany: hoisted.activityFindMany },
    module: { findMany: hoisted.moduleFindMany },
    // Deliberately NO `aiUsage` / `aiProvider` keys — if loader code still
    // reaches for prisma.aiUsage.*, this throws "Cannot read properties of
    // undefined" and the test fails, proving the cost query was removed.
  }),
}));

describe('jobs._index loader — WS-F: no AI-cost leak to merchants', () => {
  it('loads without touching prisma.aiUsage / prisma.aiProvider', async () => {
    const { loader } = await import('~/routes/jobs._index');
    const res = await loader({ request: new Request('https://app.test/jobs') } as never);
    const payload = await res.json();
    expect(payload).not.toHaveProperty('aiSummary30d');
    expect(payload).not.toHaveProperty('aiSummaryAllTime');
    expect(payload.jobs[0]).not.toHaveProperty('aiUsage');
  });
});
