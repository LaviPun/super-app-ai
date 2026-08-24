/**
 * BillingService after the App Pricing migration: no charge creation —
 * Shopify owns charging. What's left: subscription reads, internal plan
 * override (which must NOT touch Shop.planTier — that's the Shopify shop
 * plan, not the billing plan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({})),
  updateMany: vi.fn(async () => ({})),
  findUnique: vi.fn(async () => ({ planName: 'GROWTH', status: 'ACTIVE' })),
  shopUpdate: vi.fn(async () => ({})),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSubscription: {
      upsert: hoisted.upsert,
      updateMany: hoisted.updateMany,
      findUnique: hoisted.findUnique,
    },
    shop: { update: hoisted.shopUpdate },
  }),
}));

import { BillingService } from '~/services/billing/billing.service';

beforeEach(() => vi.clearAllMocks());

describe('BillingService (App Pricing model)', () => {
  it('no longer exposes a charge-creation path', () => {
    expect((BillingService.prototype as unknown as Record<string, unknown>).createSubscription).toBeUndefined();
  });

  it('setPlanForShop records the override without touching Shop.planTier', async () => {
    await new BillingService().setPlanForShop('shop_1', 'ENTERPRISE');
    expect(hoisted.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop_1' },
        update: expect.objectContaining({ planName: 'ENTERPRISE', status: 'ACTIVE' }),
      }),
    );
    expect(hoisted.shopUpdate).not.toHaveBeenCalled();
  });

  it('cancelSubscription marks the row CANCELLED', async () => {
    await new BillingService().cancelSubscription('shop_1');
    expect(hoisted.updateMany).toHaveBeenCalledWith({
      where: { shopId: 'shop_1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('getActiveSubscription reads the row by shopId', async () => {
    const sub = await new BillingService().getActiveSubscription('shop_1');
    expect(hoisted.findUnique).toHaveBeenCalledWith({ where: { shopId: 'shop_1' } });
    expect(sub).toEqual({ planName: 'GROWTH', status: 'ACTIVE' });
  });
});
