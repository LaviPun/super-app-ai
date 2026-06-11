import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  shop: { findFirst: vi.fn() },
  errorLog: { findMany: vi.fn() },
  apiLog: { findMany: vi.fn(), count: vi.fn() },
  aiUsage: { aggregate: vi.fn() },
  module: { count: vi.fn() },
};

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

describe('runAssistantTool scoping + redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.shop.findFirst.mockResolvedValue({ id: 'shop-1' });
    prismaMock.errorLog.findMany.mockResolvedValue([
      {
        id: 'err-1',
        level: 'ERROR',
        message: 'Customer email bob@example.com failed',
        source: 'api',
        route: '/apps/demo/orders?email=bob@example.com',
        createdAt: new Date('2026-05-17T00:00:00.000Z'),
      },
    ]);
    prismaMock.apiLog.findMany.mockResolvedValue([
      {
        id: 'api-1',
        actor: 'shopify-webhook',
        path: '/apps/demo/orders?email=bob@example.com',
        method: 'GET',
        status: 500,
        durationMs: 90,
        createdAt: new Date('2026-05-17T00:00:00.000Z'),
      },
    ]);
    prismaMock.apiLog.count.mockResolvedValue(1);
    prismaMock.aiUsage.aggregate.mockResolvedValue({ _sum: { tokensIn: 0, tokensOut: 0, costCents: 0 } });
    prismaMock.module.count.mockResolvedValue(0);
  });

  it('returns aggregated getRecentErrors data when no shop scope is provided', async () => {
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('getRecentErrors');
    expect(result.data.scopedToShopDomain).toBeNull();
    expect(result.data.note).toBeDefined();
    expect(result.data.recent).toBeUndefined();
  });

  it('returns scoped + redacted rows when shop domain is provided', async () => {
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('fetchLogs', { shopDomain: 'demo.myshopify.com' });
    expect(result.data.scopedToShopDomain).toBe('demo.myshopify.com');
    const rows = (result.data.recent as Array<{ path: string }>) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.path ?? '').not.toContain('bob@example.com');
  });
});
