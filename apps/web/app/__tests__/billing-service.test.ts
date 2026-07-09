/**
 * Unit tests for the paid-billing path: BillingService.createSubscription.
 *
 * A bug here mischarges paying merchants, so we assert the exact GraphQL
 * mutation variables (name, line-item pricing, returnUrl), the trialDays
 * handling (present when >0, null when 0), and the `test` flag wiring to
 * isBillingTestModeEnabled — plus userError / top-level-error surfacing.
 *
 * All I/O is mocked: no Shopify network call, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  const upsert = vi.fn(async () => ({}));
  const update = vi.fn(async () => ({}));
  const getPlanConfig = vi.fn();
  const isBillingTestModeEnabled = vi.fn(() => false);
  return { upsert, update, getPlanConfig, isBillingTestModeEnabled };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSubscription: { upsert: hoisted.upsert, updateMany: vi.fn(), findUnique: vi.fn() },
    shop: { update: hoisted.update },
  }),
}));

vi.mock('~/services/billing/plan-config.service', () => ({
  getPlanConfig: hoisted.getPlanConfig,
}));

vi.mock('~/env.server', () => ({
  isBillingTestModeEnabled: hoisted.isBillingTestModeEnabled,
}));

import { BillingService, type PlanConfig } from '~/services/billing/billing.service';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeConfig(over: Partial<PlanConfig> = {}): PlanConfig {
  return {
    name: 'STARTER',
    displayName: 'Starter',
    price: 19,
    trialDays: 14,
    quotas: {
      aiRequestsPerMonth: 200,
      publishOpsPerMonth: 50,
      workflowRunsPerMonth: 1000,
      connectorCallsPerMonth: 5000,
      modulesTotal: 20,
    },
    ...over,
  };
}

/** Build a fake admin whose graphql() returns the given JSON response. */
function makeAdmin(response: unknown) {
  const graphql = vi.fn(async () => ({ json: async () => response }));
  return { admin: { graphql } as any, graphql };
}

function okResponse(over: Record<string, unknown> = {}) {
  return {
    data: {
      appSubscriptionCreate: {
        appSubscription: { id: 'gid://shopify/AppSubscription/1', status: 'PENDING' },
        confirmationUrl: 'https://shop.myshopify.com/confirm/1',
        userErrors: [],
        ...over,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.isBillingTestModeEnabled.mockReturnValue(false);
});

// ─── free plan: no Shopify charge ───────────────────────────────────────────────

describe('createSubscription — free plan', () => {
  it('records the subscription and skips the GraphQL charge', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig({ name: 'FREE', displayName: 'Free', price: 0, trialDays: 0 }));
    const { admin, graphql } = makeAdmin(okResponse());
    const svc = new BillingService();

    const res = await svc.createSubscription(admin, 'shop_1', 'FREE', 'https://return.example/app');

    expect(graphql).not.toHaveBeenCalled();
    expect(res).toEqual({ confirmationUrl: 'https://return.example/app', subscriptionId: 'free' });
    expect(hoisted.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── paid plan: mutation variables ──────────────────────────────────────────────

describe('createSubscription — paid plan mutation variables', () => {
  it('sends name, USD recurring line item at the plan price, and returnUrl', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig({ displayName: 'Growth', price: 79, trialDays: 14 }));
    const { admin, graphql } = makeAdmin(okResponse());
    const svc = new BillingService();

    await svc.createSubscription(admin, 'shop_1', 'GROWTH', 'https://return.example/app');

    expect(graphql).toHaveBeenCalledTimes(1);
    const [, opts] = graphql.mock.calls[0] as unknown as [string, { variables: any }];
    const v = opts.variables;
    expect(v.name).toBe('SuperApp Growth');
    expect(v.returnUrl).toBe('https://return.example/app');
    expect(v.lineItems).toHaveLength(1);
    const pricing = v.lineItems[0].plan.appRecurringPricingDetails;
    expect(pricing.price).toEqual({ amount: '79.00', currencyCode: 'USD' });
    expect(pricing.interval).toBe('EVERY_30_DAYS');
  });

  it('formats the price with two decimals (toFixed)', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig({ price: 299 }));
    const { admin, graphql } = makeAdmin(okResponse());
    await new BillingService().createSubscription(admin, 'shop_1', 'PRO', 'https://r');
    const [, opts] = graphql.mock.calls[0] as unknown as [string, { variables: any }];
    expect(opts.variables.lineItems[0].plan.appRecurringPricingDetails.price.amount).toBe('299.00');
  });
});

// ─── trialDays ──────────────────────────────────────────────────────────────────

describe('createSubscription — trialDays', () => {
  it('passes trialDays when the plan has a positive trial', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig({ trialDays: 14 }));
    const { admin, graphql } = makeAdmin(okResponse());
    await new BillingService().createSubscription(admin, 'shop_1', 'STARTER', 'https://r');
    const [, opts] = graphql.mock.calls[0] as unknown as [string, { variables: any }];
    expect(opts.variables.trialDays).toBe(14);
  });

  it('sends null (not 0) when the plan has no trial', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig({ trialDays: 0 }));
    const { admin, graphql } = makeAdmin(okResponse());
    await new BillingService().createSubscription(admin, 'shop_1', 'STARTER', 'https://r');
    const [, opts] = graphql.mock.calls[0] as unknown as [string, { variables: any }];
    expect(opts.variables.trialDays).toBeNull();
  });
});

// ─── test flag ──────────────────────────────────────────────────────────────────

describe('createSubscription — test flag', () => {
  it('sets test:true when billing test mode is enabled', async () => {
    hoisted.isBillingTestModeEnabled.mockReturnValue(true);
    hoisted.getPlanConfig.mockResolvedValue(makeConfig());
    const { admin, graphql } = makeAdmin(okResponse());
    await new BillingService().createSubscription(admin, 'shop_1', 'STARTER', 'https://r');
    const [, opts] = graphql.mock.calls[0] as unknown as [string, { variables: any }];
    expect(opts.variables.test).toBe(true);
  });

  it('sets test:false when billing test mode is disabled (real charge)', async () => {
    hoisted.isBillingTestModeEnabled.mockReturnValue(false);
    hoisted.getPlanConfig.mockResolvedValue(makeConfig());
    const { admin, graphql } = makeAdmin(okResponse());
    await new BillingService().createSubscription(admin, 'shop_1', 'STARTER', 'https://r');
    const [, opts] = graphql.mock.calls[0] as unknown as [string, { variables: any }];
    expect(opts.variables.test).toBe(false);
  });
});

// ─── success result + recording ─────────────────────────────────────────────────

describe('createSubscription — success', () => {
  it('returns the confirmationUrl + subscriptionId and records the sub', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig());
    const { admin } = makeAdmin(okResponse());
    const res = await new BillingService().createSubscription(admin, 'shop_1', 'STARTER', 'https://r');
    expect(res).toEqual({
      confirmationUrl: 'https://shop.myshopify.com/confirm/1',
      subscriptionId: 'gid://shopify/AppSubscription/1',
    });
    expect(hoisted.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── error surfacing ────────────────────────────────────────────────────────────

describe('createSubscription — errors', () => {
  it('throws when appSubscriptionCreate returns userErrors', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig());
    const { admin } = makeAdmin(
      okResponse({ userErrors: [{ field: ['test'], message: 'Test charges not allowed on live app.' }], confirmationUrl: null, appSubscription: null })
    );
    await expect(
      new BillingService().createSubscription(admin, 'shop_1', 'STARTER', 'https://r')
    ).rejects.toThrow('Test charges not allowed on live app.');
    expect(hoisted.upsert).not.toHaveBeenCalled();
  });

  it('throws when the GraphQL response has top-level errors', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig());
    const { admin } = makeAdmin({ errors: [{ message: 'Throttled' }] });
    await expect(
      new BillingService().createSubscription(admin, 'shop_1', 'STARTER', 'https://r')
    ).rejects.toThrow('Throttled');
    expect(hoisted.upsert).not.toHaveBeenCalled();
  });

  it('throws when neither a confirmationUrl nor a subscription id is returned', async () => {
    hoisted.getPlanConfig.mockResolvedValue(makeConfig());
    const { admin } = makeAdmin(okResponse({ confirmationUrl: null, appSubscription: null }));
    await expect(
      new BillingService().createSubscription(admin, 'shop_1', 'STARTER', 'https://r')
    ).rejects.toThrow(/did not return a confirmation URL/);
  });
});
