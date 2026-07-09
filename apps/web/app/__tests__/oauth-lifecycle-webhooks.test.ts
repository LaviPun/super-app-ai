import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * OAuth / session INSTALL–UNINSTALL lifecycle coverage.
 *
 * The install side of this app has no `afterAuth` hook and no seeding seam:
 * `shopifyApp()` in `~/shopify.server` is configured only with a Prisma session
 * storage, and Shop rows are created lazily via `prisma.shop.upsert` inside the
 * merchant/API routes — not at install time. So the unit-testable lifecycle
 * surface is the `app/uninstalled` (and neighbouring `app/scopes_update`) branch
 * of the `webhooks.tsx` action, which is what protects merchants from stale
 * sessions and broken reinstalls. These tests pin that contract.
 */

// --- Shopify webhook authentication ----------------------------------------
const authenticateWebhookMock = vi.fn();
vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      webhook: authenticateWebhookMock,
    },
  },
}));

// --- Prisma -----------------------------------------------------------------
const shopFindUniqueMock = vi.fn();
const sessionDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const appSubscriptionUpdateManyMock = vi.fn(async () => ({ count: 0 }));
const jobCreateMock = vi.fn(async () => ({ id: 'job_x' }));
const activityLogCreateMock = vi.fn(async () => ({ id: 'log_x' }));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: shopFindUniqueMock },
    session: { deleteMany: sessionDeleteManyMock },
    appSubscription: { updateMany: appSubscriptionUpdateManyMock },
    job: { create: jobCreateMock },
    activityLog: { create: activityLogCreateMock },
  }),
}));

// --- Heavy runner/service deps imported at module load (unused by the -------
//     uninstall/scopes branches, mocked so the import graph stays light) -----
const runForTriggerMock = vi.fn(async () => undefined);
vi.mock('~/services/flows/flow-runner.service', () => ({
  FlowRunnerService: class {
    runForTrigger = runForTriggerMock;
  },
}));
vi.mock('~/services/messaging/messaging-runner.service', () => ({
  MessagingRunnerService: class {
    runForTrigger = vi.fn(async () => undefined);
  },
}));
vi.mock('~/services/integration/http-sync-runner.service', () => ({
  HttpSyncRunnerService: class {
    runForTrigger = vi.fn(async () => undefined);
  },
}));
vi.mock('~/services/composites/loyalty-accrual.server', () => ({
  accrueForOrder: vi.fn(async () => undefined),
}));
const checkAndMarkWebhookEventMock = vi.fn(async () => true);
vi.mock('~/services/flows/idempotency.server', () => ({
  checkAndMarkWebhookEvent: checkAndMarkWebhookEventMock,
  extractWebhookEventId: vi.fn(() => 'evt_1'),
  unmarkWebhookEvent: vi.fn(async () => undefined),
}));
vi.mock('~/services/jobs/shopify-metaobject-cleanup.job', () => ({
  SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE: 'SHOPIFY_METAOBJECT_CLEANUP',
}));
vi.mock('~/services/observability/logger.server', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('~/services/observability/redact.server', () => ({
  safeErrorMeta: (err: unknown) => ({ err: String(err) }),
}));

const SHOP = 'lifecycle-shop.myshopify.com';

async function invoke(topic: string, payload: unknown = {}) {
  authenticateWebhookMock.mockResolvedValue({
    admin: {},
    payload,
    shop: SHOP,
    topic,
  });
  const mod = await import('~/routes/webhooks');
  return mod.action({
    request: new Request('http://test/webhooks', { method: 'POST' }),
  } as never);
}

describe('OAuth lifecycle — app/uninstalled webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionDeleteManyMock.mockResolvedValue({ count: 0 });
    appSubscriptionUpdateManyMock.mockResolvedValue({ count: 0 });
    jobCreateMock.mockResolvedValue({ id: 'job_x' });
    activityLogCreateMock.mockResolvedValue({ id: 'log_x' });
  });

  it('deletes ALL sessions for the uninstalled shop (prevents stale sessions / broken reinstall)', async () => {
    shopFindUniqueMock.mockResolvedValue({ id: 'shop_1', shopDomain: SHOP });
    sessionDeleteManyMock.mockResolvedValue({ count: 2 });

    const res = await invoke('app/uninstalled');

    expect(res.status).toBe(200);
    // The core lifecycle guarantee: every session row for this shop is purged,
    // scoped to the shop domain (never global).
    expect(sessionDeleteManyMock).toHaveBeenCalledTimes(1);
    expect(sessionDeleteManyMock).toHaveBeenCalledWith({ where: { shop: SHOP } });
  });

  it('cancels the shop subscription and queues metaobject cleanup on uninstall', async () => {
    shopFindUniqueMock.mockResolvedValue({ id: 'shop_1', shopDomain: SHOP });

    await invoke('app/uninstalled');

    expect(appSubscriptionUpdateManyMock).toHaveBeenCalledWith({
      where: { shopId: 'shop_1' },
      data: { status: 'CANCELLED' },
    });
    expect(jobCreateMock).toHaveBeenCalledTimes(1);
    const [jobArg] = jobCreateMock.mock.calls[0] as unknown as [{
      data: { shopId: string; type: string; status: string; payload: string };
    }];
    expect(jobArg.data.shopId).toBe('shop_1');
    expect(jobArg.data.type).toBe('SHOPIFY_METAOBJECT_CLEANUP');
    expect(jobArg.data.status).toBe('QUEUED');
    expect(JSON.parse(jobArg.data.payload)).toEqual({
      reason: 'APP_UNINSTALLED',
      shopDomain: SHOP,
    });
    expect(activityLogCreateMock).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for an already-clean shop: still deletes sessions, skips shop-scoped cleanup, does not throw', async () => {
    // Shop row already gone (uninstall redelivered, or never fully installed).
    shopFindUniqueMock.mockResolvedValue(null);

    const res = await invoke('app/uninstalled');

    expect(res.status).toBe(200);
    // Session purge STILL runs even with no Shop row — this is what actually
    // frees the merchant to reinstall cleanly.
    expect(sessionDeleteManyMock).toHaveBeenCalledWith({ where: { shop: SHOP } });
    // No Shop row → no subscription / job / activity side effects, no throw.
    expect(appSubscriptionUpdateManyMock).not.toHaveBeenCalled();
    expect(jobCreateMock).not.toHaveBeenCalled();
    expect(activityLogCreateMock).not.toHaveBeenCalled();
  });

  it('never invokes the flow runner for the uninstall topic', async () => {
    shopFindUniqueMock.mockResolvedValue({ id: 'shop_1', shopDomain: SHOP });
    await invoke('app/uninstalled');
    expect(runForTriggerMock).not.toHaveBeenCalled();
    expect(checkAndMarkWebhookEventMock).not.toHaveBeenCalled();
  });
});

describe('OAuth lifecycle — app/scopes_update webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a scopes-update activity log tied to the shop, without deleting sessions', async () => {
    shopFindUniqueMock.mockResolvedValue({ id: 'shop_1', shopDomain: SHOP });

    const res = await invoke('app/scopes_update', { app_scopes: ['read_products', 'write_products'] });

    expect(res.status).toBe(200);
    expect(sessionDeleteManyMock).not.toHaveBeenCalled();
    expect(activityLogCreateMock).toHaveBeenCalledTimes(1);
    const [logArg] = activityLogCreateMock.mock.calls[0] as unknown as [{
      data: { action: string; shopId?: string; resource: string; details: string };
    }];
    expect(logArg.data.action).toBe('APP_SCOPES_UPDATE');
    expect(logArg.data.shopId).toBe('shop_1');
    expect(JSON.parse(logArg.data.details)).toEqual({
      shopDomain: SHOP,
      appScopes: ['read_products', 'write_products'],
    });
  });

  it('tolerates a missing shop row and a non-array app_scopes payload', async () => {
    shopFindUniqueMock.mockResolvedValue(null);

    const res = await invoke('app/scopes_update', { app_scopes: 'not-an-array' });

    expect(res.status).toBe(200);
    const [logArg] = activityLogCreateMock.mock.calls[0] as unknown as [{
      data: { shopId?: string; resource: string; details: string };
    }];
    expect(logArg.data.shopId).toBeUndefined();
    expect(logArg.data.resource).toBe(`shop_domain:${SHOP}`);
    expect(JSON.parse(logArg.data.details).appScopes).toEqual([]);
  });
});

describe('OAuth lifecycle — unknown/unhandled topic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and performs no destructive side effects', async () => {
    shopFindUniqueMock.mockResolvedValue({ id: 'shop_1', shopDomain: SHOP });
    const res = await invoke('app/some_future_topic');
    expect(res.status).toBe(200);
    expect(sessionDeleteManyMock).not.toHaveBeenCalled();
    expect(jobCreateMock).not.toHaveBeenCalled();
  });
});
