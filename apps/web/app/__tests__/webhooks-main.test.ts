import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the main webhook action (app/routes/webhooks.tsx).
 *
 * Contract under test:
 *  - authenticate.webhook verifies HMAC; if it rejects (bad HMAC) the action must
 *    NOT process the event (no flow run) and must surface the failure.
 *  - A duplicate event (checkAndMarkWebhookEvent → false) returns 200 and does
 *    NOT re-process.
 *  - If processing (FlowRunnerService.runForTrigger) throws, the event claim is
 *    released (unmarkWebhookEvent) for Shopify redelivery and the action returns 500.
 */

const {
  authWebhookMock,
  checkAndMarkMock,
  unmarkMock,
  extractEventIdMock,
  flowRunMock,
  messagingRunMock,
  httpSyncRunMock,
  accrueForOrderMock,
  restockRunMock,
  loggerMock,
} = vi.hoisted(() => ({
  authWebhookMock: vi.fn(),
  checkAndMarkMock: vi.fn(),
  unmarkMock: vi.fn(),
  extractEventIdMock: vi.fn(() => 'wh_event_1'),
  flowRunMock: vi.fn(),
  messagingRunMock: vi.fn(),
  httpSyncRunMock: vi.fn(),
  accrueForOrderMock: vi.fn(),
  restockRunMock: vi.fn(),
  loggerMock: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      webhook: (...args: unknown[]) => authWebhookMock(...args),
    },
  },
}));

const shopFindUniqueMock = vi.fn(async () => ({ id: 'shop-1' }));
const sessionDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const appSubUpdateManyMock = vi.fn(async () => ({ count: 0 }));
const jobCreateMock = vi.fn(async () => ({ id: 'job-1' }));
const activityLogCreateMock = vi.fn(async () => ({ id: 'act-1' }));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: shopFindUniqueMock },
    session: { deleteMany: sessionDeleteManyMock },
    appSubscription: { updateMany: appSubUpdateManyMock },
    job: { create: jobCreateMock },
    activityLog: { create: activityLogCreateMock },
  }),
}));

vi.mock('~/services/flows/flow-runner.service', () => ({
  FlowRunnerService: class {
    runForTrigger = flowRunMock;
  },
}));

vi.mock('~/services/messaging/messaging-runner.service', () => ({
  MessagingRunnerService: class {
    runForTrigger = messagingRunMock;
  },
}));

vi.mock('~/services/integration/http-sync-runner.service', () => ({
  HttpSyncRunnerService: class {
    runForTrigger = httpSyncRunMock;
  },
}));

vi.mock('~/services/messaging/restock-watcher.server', () => ({
  RestockWatcherService: class {
    runForProductUpdate = restockRunMock;
  },
}));

vi.mock('~/services/composites/loyalty-accrual.server', () => ({
  accrueForOrder: accrueForOrderMock,
}));

vi.mock('~/services/flows/idempotency.server', () => ({
  checkAndMarkWebhookEvent: checkAndMarkMock,
  unmarkWebhookEvent: unmarkMock,
  extractWebhookEventId: extractEventIdMock,
}));

vi.mock('~/services/jobs/shopify-metaobject-cleanup.job', () => ({
  SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE: 'SHOPIFY_METAOBJECT_CLEANUP',
}));

vi.mock('~/services/observability/logger.server', () => ({
  logger: loggerMock,
}));

vi.mock('~/services/observability/redact.server', () => ({
  safeErrorMeta: (err: unknown) => ({ error: String(err) }),
}));

function webhookRequest() {
  return new Request('https://example.test/webhooks', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-webhook-id': 'wh_event_1' },
    body: JSON.stringify({ id: 1 }),
  });
}

describe('webhooks.tsx main action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractEventIdMock.mockReturnValue('wh_event_1');
    checkAndMarkMock.mockResolvedValue(true);
    unmarkMock.mockResolvedValue(undefined);
    flowRunMock.mockResolvedValue(undefined);
    messagingRunMock.mockResolvedValue(undefined);
    httpSyncRunMock.mockResolvedValue(undefined);
    accrueForOrderMock.mockResolvedValue(undefined);
    restockRunMock.mockResolvedValue(undefined);
    shopFindUniqueMock.mockResolvedValue({ id: 'shop-1' });
  });

  it('rejects and does NOT process when authenticate.webhook throws (bad HMAC)', async () => {
    authWebhookMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const mod = await import('~/routes/webhooks');
    // Real @shopify/shopify-app-remix throws (a Response) on HMAC failure; the
    // action does not catch it, so the failure propagates and processing is skipped.
    await expect(mod.action({ request: webhookRequest() })).rejects.toBeDefined();

    expect(checkAndMarkMock).not.toHaveBeenCalled();
    expect(flowRunMock).not.toHaveBeenCalled();
  });

  it('duplicate event (dedupe → false) returns 200 and does NOT re-process', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 1 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    checkAndMarkMock.mockResolvedValue(false);

    const mod = await import('~/routes/webhooks');
    const res = await mod.action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(checkAndMarkMock).toHaveBeenCalledTimes(1);
    expect(flowRunMock).not.toHaveBeenCalled();
    expect(messagingRunMock).not.toHaveBeenCalled();
    expect(httpSyncRunMock).not.toHaveBeenCalled();
    expect(accrueForOrderMock).not.toHaveBeenCalled();
  });

  it('new event runs the flow trigger and returns 200', async () => {
    authWebhookMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });

    const mod = await import('~/routes/webhooks');
    const res = await mod.action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(checkAndMarkMock).toHaveBeenCalledWith({
      shopDomain: 'shop.example.myshopify.com',
      topic: 'orders/create',
      eventId: 'wh_event_1',
    });
    expect(flowRunMock).toHaveBeenCalledWith(
      'shop.example.myshopify.com',
      expect.anything(),
      'SHOPIFY_WEBHOOK_ORDER_CREATED',
      { id: 42 },
    );
    // orders/create also drives loyalty accrual.
    expect(accrueForOrderMock).toHaveBeenCalledWith('shop-1', { id: 42 });
    // The claim must NOT be released on success.
    expect(unmarkMock).not.toHaveBeenCalled();
  });

  it('releases the event claim and returns 500 when flow processing throws', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 7 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    flowRunMock.mockRejectedValue(new Error('flow boom'));

    const mod = await import('~/routes/webhooks');
    const res = await mod.action({ request: webhookRequest() });

    expect(res.status).toBe(500);
    expect(unmarkMock).toHaveBeenCalledWith({
      shopDomain: 'shop.example.myshopify.com',
      topic: 'orders/create',
      eventId: 'wh_event_1',
    });
    // Downstream best-effort fan-out must NOT run once the flow failed.
    expect(messagingRunMock).not.toHaveBeenCalled();
    expect(httpSyncRunMock).not.toHaveBeenCalled();
    expect(accrueForOrderMock).not.toHaveBeenCalled();
  });

  it('products/update drives the restock watcher (best-effort sibling) and returns 200', async () => {
    const graphqlFn = vi.fn();
    authWebhookMock.mockResolvedValue({
      admin: { graphql: graphqlFn },
      payload: { id: 100, admin_graphql_api_id: 'gid://shopify/Product/100', variants: [] },
      shop: 'shop.example.myshopify.com',
      topic: 'products/update',
    });

    const mod = await import('~/routes/webhooks');
    const res = await mod.action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(flowRunMock).toHaveBeenCalledWith(
      'shop.example.myshopify.com',
      expect.anything(),
      'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
      expect.objectContaining({ id: 100 }),
    );
    expect(restockRunMock).toHaveBeenCalledTimes(1);
    const [shopArg, adminGraphqlArg, eventArg] = restockRunMock.mock.calls[0]!;
    expect(shopArg).toBe('shop.example.myshopify.com');
    expect(typeof adminGraphqlArg).toBe('function'); // adapted graphql fn passed through
    expect(eventArg).toMatchObject({ admin_graphql_api_id: 'gid://shopify/Product/100' });
    expect(unmarkMock).not.toHaveBeenCalled();
  });

  it('a restock watcher failure does NOT 500 the webhook (best-effort)', async () => {
    authWebhookMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      payload: { id: 100, variants: [] },
      shop: 'shop.example.myshopify.com',
      topic: 'products/update',
    });
    restockRunMock.mockRejectedValue(new Error('watcher boom'));

    const mod = await import('~/routes/webhooks');
    const res = await mod.action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(unmarkMock).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('does NOT run the restock watcher on a non-product topic (orders/create)', async () => {
    authWebhookMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });

    const mod = await import('~/routes/webhooks');
    await mod.action({ request: webhookRequest() });

    expect(restockRunMock).not.toHaveBeenCalled();
  });

  it('app/uninstalled purges sessions and enqueues cleanup, returns 200', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: {},
      shop: 'shop.example.myshopify.com',
      topic: 'app/uninstalled',
    });

    const mod = await import('~/routes/webhooks');
    const res = await mod.action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(sessionDeleteManyMock).toHaveBeenCalledWith({ where: { shop: 'shop.example.myshopify.com' } });
    expect(jobCreateMock).toHaveBeenCalled();
    // A non-trigger topic must never touch the dedupe guard.
    expect(checkAndMarkMock).not.toHaveBeenCalled();
    expect(flowRunMock).not.toHaveBeenCalled();
  });
});
