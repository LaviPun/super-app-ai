/**
 * /billing/callback — App Pricing welcome-link landing.
 * Must authenticate the embedded request, sync plan state from the Partner
 * API (NEVER trusting plan_handle from the URL), and land on /billing.
 * A sync failure must not strand the merchant — still redirect, plan will
 * reconcile via cron.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 't.myshopify.com' } })),
  syncShop: vi.fn(async () => ({ plan: 'GROWTH', changed: true })),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/billing/plan-sync.service', () => ({
  PlanSyncService: class { syncShop = hoisted.syncShop; },
}));

import { loader } from '~/routes/billing.callback';

beforeEach(() => vi.clearAllMocks());

describe('billing.callback loader', () => {
  it('syncs from the Partner API (not the URL param) and redirects to /billing', async () => {
    const res = (await loader({
      request: new Request('https://app.example.com/billing/callback?plan_handle=growth'),
      params: {},
      context: {},
    } as never)) as Response;
    expect(hoisted.syncShop).toHaveBeenCalledWith('t.myshopify.com');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/billing');
  });

  it('still redirects when the sync fails (cron will reconcile)', async () => {
    hoisted.syncShop.mockRejectedValueOnce(new Error('partner down'));
    const res = (await loader({
      request: new Request('https://app.example.com/billing/callback?plan_handle=pro'),
      params: {},
      context: {},
    } as never)) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/billing');
  });
});
