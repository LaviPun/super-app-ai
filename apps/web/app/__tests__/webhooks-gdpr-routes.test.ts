import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the three App-Store-mandatory GDPR webhook routes:
 *   - webhooks.customers.data_request.tsx
 *   - webhooks.customers.redact.tsx
 *   - webhooks.shop.redact.tsx
 *
 * Each must: authenticate the webhook (HMAC), ack with 200, and write an audit
 * ActivityLog. Edge cases: reject non-POST (405), missing shop identifier (400),
 * unknown shop (200 no-op). Complements gdpr-redact.coverage.test.ts (which asserts
 * the row-deletion side effects) and gdpr-data-request-export.test.ts (which unit
 * tests the compile/deliver helpers) — here we assert the route wiring: the
 * customerId filter fix, the compile+deliver call, idempotency, and the loud
 * failed-delivery state when the mailer is unconfigured.
 */

const {
  authWebhookMock,
  sendEmailMock,
  resolveMailerStatusMock,
  adminGraphqlMock,
  unauthenticatedAdminMock,
  checkAndMarkWebhookEventMock,
  unmarkWebhookEventMock,
  errorLogErrorMock,
} = vi.hoisted(() => ({
  authWebhookMock: vi.fn(),
  sendEmailMock: vi.fn(),
  resolveMailerStatusMock: vi.fn(),
  adminGraphqlMock: vi.fn(),
  unauthenticatedAdminMock: vi.fn(),
  checkAndMarkWebhookEventMock: vi.fn(),
  unmarkWebhookEventMock: vi.fn(),
  errorLogErrorMock: vi.fn(),
}));

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      webhook: (...args: unknown[]) => authWebhookMock(...args),
    },
  },
  unauthenticated: {
    admin: (...args: unknown[]) => unauthenticatedAdminMock(...args),
  },
}));

vi.mock('~/services/notifications/mailer.server', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  resolveMailerStatus: (...args: unknown[]) => resolveMailerStatusMock(...args),
}));

vi.mock('~/services/flows/idempotency.server', () => ({
  checkAndMarkWebhookEvent: (...args: unknown[]) => checkAndMarkWebhookEventMock(...args),
  unmarkWebhookEvent: (...args: unknown[]) => unmarkWebhookEventMock(...args),
  extractWebhookEventId: (request: Request) => request.headers.get('x-shopify-webhook-id') ?? 'evt-fixed',
}));

vi.mock('~/services/observability/error-log.service', () => ({
  ErrorLogService: class {
    // Always returns a real Promise (matching the real async method) — the route's
    // catch-all-guarded bookkeeping-failure path chains .catch() off this call.
    error = (...args: unknown[]) => Promise.resolve(errorLogErrorMock(...args));
    warn = vi.fn(async () => undefined);
    info = vi.fn(async () => undefined);
  },
}));

const shopFindUniqueMock = vi.fn();
const activityLogCreateMock = vi.fn(async () => ({ id: 'act-1' }));
const dataCaptureFindManyMock = vi.fn(async () => [{ id: 'c1' }, { id: 'c2' }]);
const dataCaptureDeleteManyMock = vi.fn(async () => ({ count: 1 }));
const dataStoreRecordFindManyMock = vi.fn(async () => []);
const dataStoreRecordDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const dataStoreDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const moduleEventFindManyMock = vi.fn(async () => []);
const moduleEventDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const moduleMetricsDailyDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const attributionLinkFindManyMock = vi.fn(async () => []);
const attributionLinkDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const supportTicketFindManyMock = vi.fn(async () => []);

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    $transaction: <T>(queries: Promise<T>[]) => Promise.all(queries),
    shop: { findUnique: shopFindUniqueMock },
    activityLog: { create: activityLogCreateMock },
    dataCapture: { findMany: dataCaptureFindManyMock, deleteMany: dataCaptureDeleteManyMock },
    dataStoreRecord: { findMany: dataStoreRecordFindManyMock, deleteMany: dataStoreRecordDeleteManyMock },
    dataStore: { deleteMany: dataStoreDeleteManyMock },
    moduleEvent: { findMany: moduleEventFindManyMock, deleteMany: moduleEventDeleteManyMock },
    moduleMetricsDaily: { deleteMany: moduleMetricsDailyDeleteManyMock },
    attributionLink: { findMany: attributionLinkFindManyMock, deleteMany: attributionLinkDeleteManyMock },
    supportTicket: { findMany: supportTicketFindManyMock },
  }),
}));

function postRequest(url: string, body: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function parseDetails(call: unknown): Record<string, unknown> {
  const [arg] = call as [{ data: { details: string } }];
  return JSON.parse(arg.data.details) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  shopFindUniqueMock.mockResolvedValue({ id: 'shop-1', shopDomain: 'gdpr.myshopify.com' });
  // Real authenticate.webhook verifies HMAC then returns the parsed body as payload.
  authWebhookMock.mockImplementation(async (req: Request) => ({ payload: await req.json() }));
  checkAndMarkWebhookEventMock.mockResolvedValue(true);
  unauthenticatedAdminMock.mockResolvedValue({ admin: { graphql: adminGraphqlMock } });
  adminGraphqlMock.mockResolvedValue({ json: async () => ({ data: { shop: { email: 'owner@gdpr.test' } } }) });
  resolveMailerStatusMock.mockResolvedValue({ configured: true, provider: 'sendgrid', from: 'noreply@app.test' });
  sendEmailMock.mockResolvedValue({ sent: true });
  dataCaptureFindManyMock.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
  dataStoreRecordFindManyMock.mockResolvedValue([]);
  moduleEventFindManyMock.mockResolvedValue([]);
  attributionLinkFindManyMock.mockResolvedValue([]);
  supportTicketFindManyMock.mockResolvedValue([]);
});

describe('customers/data_request', () => {
  it('acks 200, compiles + delivers the export, and records a GDPR_DATA_REQUEST audit log with the delivery outcome', async () => {
    const { action } = await import('~/routes/webhooks.customers.data_request');
    const res = await action({
      request: postRequest('https://x.test/webhooks/customers/data_request', {
        shop_domain: 'gdpr.myshopify.com',
        customer: { id: 555, email: 'a@b.com' },
        orders_requested: [1, 2],
      }),
    });

    expect(res.status).toBe(200);
    expect(dataCaptureFindManyMock).toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [sendArgs] = sendEmailMock.mock.calls[0] as [{ to: string }];
    expect(sendArgs.to).toBe('owner@gdpr.test');

    expect(activityLogCreateMock).toHaveBeenCalledTimes(1);
    const [logArg] = activityLogCreateMock.mock.calls[0] as unknown as [{ data: { action: string; resource: string; shopId: string } }];
    expect(logArg.data.action).toBe('GDPR_DATA_REQUEST');
    expect(logArg.data.resource).toBe('customer:555');
    expect(logArg.data.shopId).toBe('shop-1');

    const details = parseDetails(activityLogCreateMock.mock.calls[0]);
    expect((details.delivery as { emailSent: boolean }).emailSent).toBe(true);
  });

  it('fixes the no-op customerId filter — every customerId-scoped model is queried by BOTH shopId and the requesting customer', async () => {
    const { action } = await import('~/routes/webhooks.customers.data_request');
    await action({
      request: postRequest('https://x.test/webhooks/customers/data_request', {
        shop_domain: 'gdpr.myshopify.com',
        customer: { id: 555, email: 'a@b.com' },
      }),
    });

    expect(dataCaptureFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1', customerId: '555' }) }),
    );
    expect(dataStoreRecordFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: '555', dataStore: expect.objectContaining({ shopId: 'shop-1' }) }),
      }),
    );
    expect(moduleEventFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1', customerId: '555' }) }),
    );
    expect(attributionLinkFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1', customerId: '555' }) }),
    );
  });

  it('still returns 200 and records a loud failed-delivery state (ActivityLog + ErrorLog) when the mailer is unconfigured', async () => {
    resolveMailerStatusMock.mockResolvedValue({ configured: false, provider: null, from: null });
    const { action } = await import('~/routes/webhooks.customers.data_request');
    const res = await action({
      request: postRequest('https://x.test/webhooks/customers/data_request', {
        shop_domain: 'gdpr.myshopify.com',
        customer: { id: 555, email: 'a@b.com' },
      }),
    });

    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();

    const details = parseDetails(activityLogCreateMock.mock.calls[0]);
    const delivery = details.delivery as { emailSent: boolean; mailerConfigured: boolean };
    expect(delivery.emailSent).toBe(false);
    expect(delivery.mailerConfigured).toBe(false);

    // Loud, not silent: an ops-visible ErrorLog entry is written too.
    expect(errorLogErrorMock).toHaveBeenCalledTimes(1);
  });

  it('still returns 200 and does NOT release the WebhookEvent claim when post-delivery bookkeeping (ActivityLog write) throws', async () => {
    activityLogCreateMock.mockRejectedValueOnce(new Error('db down'));
    const { action } = await import('~/routes/webhooks.customers.data_request');
    const res = await action({
      request: postRequest('https://x.test/webhooks/customers/data_request', {
        shop_domain: 'gdpr.myshopify.com',
        customer: { id: 555, email: 'a@b.com' },
      }),
    });

    // Data was already compiled + delivered before the throw — the claim must NOT be
    // released (that would let Shopify's redelivery reprocess and double-email), and the
    // handler must still ack 200 rather than crash or bubble the bookkeeping error.
    expect(res.status).toBe(200);
    expect(unmarkWebhookEventMock).not.toHaveBeenCalled();
    // Best-effort, catch-all-guarded: a loud ErrorLog attempt is still made for the
    // bookkeeping failure itself.
    expect(errorLogErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('bookkeeping'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'SERVER',
    );
  });

  it('is idempotent — a duplicate webhook delivery is skipped (no re-query, no re-email)', async () => {
    checkAndMarkWebhookEventMock.mockResolvedValue(false);
    const { action } = await import('~/routes/webhooks.customers.data_request');
    const res = await action({
      request: postRequest(
        'https://x.test/webhooks/customers/data_request',
        { shop_domain: 'gdpr.myshopify.com', customer: { id: 555, email: 'a@b.com' } },
        { 'x-shopify-webhook-id': 'evt-dup' },
      ),
    });

    expect(res.status).toBe(200);
    expect(dataCaptureFindManyMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(activityLogCreateMock).not.toHaveBeenCalled();
  });

  it('returns 405 on non-POST', async () => {
    const { action } = await import('~/routes/webhooks.customers.data_request');
    const res = await action({
      request: new Request('https://x.test/webhooks/customers/data_request', { method: 'GET' }),
    });
    expect(res.status).toBe(405);
    expect(authWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 400 when no shop identifier is present', async () => {
    const { action } = await import('~/routes/webhooks.customers.data_request');
    const res = await action({
      request: postRequest('https://x.test/webhooks/customers/data_request', { customer: { id: 1 } }),
    });
    expect(res.status).toBe(400);
  });

  it('acks 200 without an audit log or email when the shop is unknown', async () => {
    shopFindUniqueMock.mockResolvedValue(null);
    const { action } = await import('~/routes/webhooks.customers.data_request');
    const res = await action({
      request: postRequest('https://x.test/webhooks/customers/data_request', {
        shop_domain: 'ghost.myshopify.com',
        customer: { id: 1 },
      }),
    });
    expect(res.status).toBe(200);
    expect(activityLogCreateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('customers/redact', () => {
  it('acks 200 and records a GDPR_CUSTOMER_REDACT audit log', async () => {
    const { action } = await import('~/routes/webhooks.customers.redact');
    const res = await action({
      request: postRequest('https://x.test/webhooks/customers/redact', {
        shop_domain: 'gdpr.myshopify.com',
        customer: { id: 777 },
      }),
    });

    expect(res.status).toBe(200);
    // Deletion runs inside a single $transaction across the indexed tables.
    expect(dataCaptureDeleteManyMock).toHaveBeenCalled();
    expect(dataStoreRecordDeleteManyMock).toHaveBeenCalled();
    expect(moduleEventDeleteManyMock).toHaveBeenCalled();
    expect(attributionLinkDeleteManyMock).toHaveBeenCalled();
    const [logArg] = activityLogCreateMock.mock.calls[0] as unknown as [{ data: { action: string; resource: string } }];
    expect(logArg.data.action).toBe('GDPR_CUSTOMER_REDACT');
    expect(logArg.data.resource).toBe('customer:777');
  });

  it('returns 405 on non-POST', async () => {
    const { action } = await import('~/routes/webhooks.customers.redact');
    const res = await action({
      request: new Request('https://x.test/webhooks/customers/redact', { method: 'GET' }),
    });
    expect(res.status).toBe(405);
  });

  it('returns 400 when no shop identifier is present', async () => {
    const { action } = await import('~/routes/webhooks.customers.redact');
    const res = await action({
      request: postRequest('https://x.test/webhooks/customers/redact', { customer: { id: 1 } }),
    });
    expect(res.status).toBe(400);
  });

  it('acks 200 no-op (no deletes, no log) for an unknown shop', async () => {
    shopFindUniqueMock.mockResolvedValue(null);
    const { action } = await import('~/routes/webhooks.customers.redact');
    const res = await action({
      request: postRequest('https://x.test/webhooks/customers/redact', {
        shop_domain: 'ghost.myshopify.com',
        customer: { id: 1 },
      }),
    });
    expect(res.status).toBe(200);
    expect(dataCaptureDeleteManyMock).not.toHaveBeenCalled();
    expect(activityLogCreateMock).not.toHaveBeenCalled();
  });
});

describe('shop/redact', () => {
  it('acks 200 and records a GDPR_SHOP_REDACT audit log after purging shop data', async () => {
    const { action } = await import('~/routes/webhooks.shop.redact');
    const res = await action({
      request: postRequest('https://x.test/webhooks/shop/redact', { shop_domain: 'gdpr.myshopify.com' }),
    });

    expect(res.status).toBe(200);
    expect(dataStoreRecordDeleteManyMock).toHaveBeenCalled();
    expect(dataStoreDeleteManyMock).toHaveBeenCalled();
    expect(dataCaptureDeleteManyMock).toHaveBeenCalled();
    expect(moduleEventDeleteManyMock).toHaveBeenCalled();
    expect(moduleMetricsDailyDeleteManyMock).toHaveBeenCalled();
    expect(attributionLinkDeleteManyMock).toHaveBeenCalled();
    const [logArg] = activityLogCreateMock.mock.calls[0] as unknown as [{ data: { action: string; resource: string } }];
    expect(logArg.data.action).toBe('GDPR_SHOP_REDACT');
    expect(logArg.data.resource).toBe('shop:shop-1');
  });

  it('returns 405 on non-POST', async () => {
    const { action } = await import('~/routes/webhooks.shop.redact');
    const res = await action({
      request: new Request('https://x.test/webhooks/shop/redact', { method: 'GET' }),
    });
    expect(res.status).toBe(405);
  });

  it('returns 400 when no shop identifier is present', async () => {
    const { action } = await import('~/routes/webhooks.shop.redact');
    const res = await action({
      request: postRequest('https://x.test/webhooks/shop/redact', {}),
    });
    expect(res.status).toBe(400);
  });

  it('acks 200 no-op for an unknown shop', async () => {
    shopFindUniqueMock.mockResolvedValue(null);
    const { action } = await import('~/routes/webhooks.shop.redact');
    const res = await action({
      request: postRequest('https://x.test/webhooks/shop/redact', { shop_domain: 'ghost.myshopify.com' }),
    });
    expect(res.status).toBe(200);
    expect(dataStoreDeleteManyMock).not.toHaveBeenCalled();
    expect(activityLogCreateMock).not.toHaveBeenCalled();
  });
});
