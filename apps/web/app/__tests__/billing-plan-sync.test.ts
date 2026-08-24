/**
 * PlanSyncService — the ONLY writer of App Pricing plan state.
 * Covers: handle mapping, null contract → FREE, idempotent upsert,
 * missing Partner env → graceful no-op, shopGid lazy fetch, sweep batching,
 * ENTERPRISE override guard (syncShop mirrors sweep's), and the first-sync
 * BILLING_PLAN_CHANGED log guard (no spurious FREE→FREE event for new shops).
 * All I/O mocked (fetch, prisma, unauthenticated admin).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  shopUpdate: vi.fn(async () => ({})),
  subFindUnique: vi.fn(),
  subFindMany: vi.fn(
    async (): Promise<Array<{ shopId: string; shop: { shopDomain: string } }>> => [],
  ),
  subUpsert: vi.fn(async () => ({})),
  activityLog: vi.fn(async () => ({})),
  graphql: vi.fn(),
  partnerConfig: vi.fn(() => ({
    token: 'ptltkn_test',
    orgId: '1234567',
    appGid: 'gid://shopify/App/999',
  })),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: hoisted.shopFindUnique, update: hoisted.shopUpdate },
    appSubscription: {
      findUnique: hoisted.subFindUnique,
      findMany: hoisted.subFindMany,
      upsert: hoisted.subUpsert,
    },
  }),
}));
vi.mock('~/env.server', () => ({ getPartnerApiConfig: hoisted.partnerConfig }));
vi.mock('~/shopify.server', () => ({
  unauthenticated: {
    admin: vi.fn(async () => ({ admin: { graphql: hoisted.graphql } })),
  },
}));
vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class { log = hoisted.activityLog; },
}));

import { planFromHandle } from '~/services/billing/plan-handles';
import { PlanSyncService } from '~/services/billing/plan-sync.service';

function partnerResponse(items: Array<{ handle: string }> | null) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        activeSubscription:
          items === null
            ? null
            : {
                billingPeriod: 'EVERY_30_DAYS',
                cancelAtEndOfCycle: false,
                trialEndsAt: null,
                currentBillingCycle: {
                  startTime: '2026-08-01T00:00:00Z',
                  endTime: '2026-09-01T00:00:00Z',
                },
                items: items.map((i) => ({ ...i, price: { __typename: 'FlatRatePrice' } })),
                legacySubscriptionId: null,
              },
      },
    }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.shopFindUnique.mockResolvedValue({
    id: 'shop_1',
    shopDomain: 't.myshopify.com',
    shopGid: 'gid://shopify/Shop/42',
  });
  hoisted.subFindUnique.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn(async () => partnerResponse([{ handle: 'growth' }])));
});

describe('planFromHandle', () => {
  it('maps the four App Pricing handles', () => {
    expect(planFromHandle('free')).toBe('FREE');
    expect(planFromHandle('starter')).toBe('STARTER');
    expect(planFromHandle('growth')).toBe('GROWTH');
    expect(planFromHandle('pro')).toBe('PRO');
  });
  it('returns null for unknown/empty handles', () => {
    expect(planFromHandle('scale')).toBeNull();
    expect(planFromHandle(null)).toBeNull();
  });
});

describe('PlanSyncService.syncShop', () => {
  it('queries the Partner API with org endpoint + token and upserts the mapped plan', async () => {
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res.plan).toBe('GROWTH');
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://partners.shopify.com/1234567/api/2026-07/graphql.json');
    expect(init.headers['X-Shopify-Access-Token']).toBe('ptltkn_test');
    expect(JSON.parse(init.body).variables).toEqual({
      appId: 'gid://shopify/App/999',
      shopId: 'gid://shopify/Shop/42',
    });
    expect(hoisted.subUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop_1' },
        create: expect.objectContaining({ planName: 'GROWTH', planHandle: 'growth', status: 'ACTIVE' }),
        update: expect.objectContaining({ planName: 'GROWTH', planHandle: 'growth', status: 'ACTIVE' }),
      }),
    );
  });

  it('null contract → FREE', async () => {
    (fetch as any).mockResolvedValue(partnerResponse(null));
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res.plan).toBe('FREE');
    expect(hoisted.subUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ planName: 'FREE', planHandle: null, status: 'ACTIVE' }),
      }),
    );
  });

  it('unknown handle → FREE (never grants quota on an unmapped plan)', async () => {
    (fetch as any).mockResolvedValue(partnerResponse([{ handle: 'mystery' }]));
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res.plan).toBe('FREE');
  });

  it('fetches + persists the shop GID when missing', async () => {
    hoisted.shopFindUnique.mockResolvedValue({
      id: 'shop_1', shopDomain: 't.myshopify.com', shopGid: null,
    });
    hoisted.graphql.mockResolvedValue({
      json: async () => ({ data: { shop: { id: 'gid://shopify/Shop/42' } } }),
    });
    await new PlanSyncService().syncShop('t.myshopify.com');
    expect(hoisted.shopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { shopGid: 'gid://shopify/Shop/42' } }),
    );
  });

  it('no Partner env → keeps current DB plan and does not fetch', async () => {
    hoisted.partnerConfig.mockReturnValueOnce(null as never);
    hoisted.subFindUnique.mockResolvedValue({ planName: 'STARTER', status: 'ACTIVE' });
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res).toEqual({ plan: 'STARTER', changed: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('logs BILLING_PLAN_CHANGED only when the plan actually changed', async () => {
    hoisted.subFindUnique.mockResolvedValue({ planName: 'GROWTH', status: 'ACTIVE' });
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res.changed).toBe(false);
    expect(hoisted.activityLog).not.toHaveBeenCalled();
  });

  it('an existing ENTERPRISE override is never reconciled away by the Partner API', async () => {
    hoisted.subFindUnique.mockResolvedValue({ planName: 'ENTERPRISE', status: 'ACTIVE' });
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res).toEqual({ plan: 'ENTERPRISE', changed: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(hoisted.subUpsert).not.toHaveBeenCalled();
  });

  it('first-ever sync landing on FREE (no prior row) does not log BILLING_PLAN_CHANGED', async () => {
    hoisted.subFindUnique.mockResolvedValue(null);
    (fetch as any).mockResolvedValue(partnerResponse(null));
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res).toEqual({ plan: 'FREE', changed: false });
    expect(hoisted.activityLog).not.toHaveBeenCalled();
  });

  it('first-ever sync landing on a paid plan (no prior row) DOES log BILLING_PLAN_CHANGED', async () => {
    hoisted.subFindUnique.mockResolvedValue(null);
    (fetch as any).mockResolvedValue(partnerResponse([{ handle: 'growth' }]));
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res).toEqual({ plan: 'GROWTH', changed: true });
    expect(hoisted.activityLog).toHaveBeenCalledTimes(1);
  });
});

describe('PlanSyncService.sweep', () => {
  it('syncs the stalest subscriptions up to the limit and survives per-shop failures', async () => {
    hoisted.subFindMany.mockResolvedValue([
      { shopId: 'shop_1', shop: { shopDomain: 'a.myshopify.com' } },
      { shopId: 'shop_2', shop: { shopDomain: 'b.myshopify.com' } },
    ]);
    const svc = new PlanSyncService();
    const spy = vi
      .spyOn(svc, 'syncShop')
      .mockResolvedValueOnce({ plan: 'GROWTH', changed: false })
      .mockRejectedValueOnce(new Error('partner 429'));
    const res = await svc.sweep(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ synced: 1, failed: 1 });
  });
});
