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
 * the row-deletion side effects) — here we assert the ack + audit contract.
 */

const { authWebhookMock } = vi.hoisted(() => ({ authWebhookMock: vi.fn() }));

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      webhook: (...args: unknown[]) => authWebhookMock(...args),
    },
  },
}));

const shopFindUniqueMock = vi.fn();
const activityLogCreateMock = vi.fn(async () => ({ id: 'act-1' }));
const dataCaptureFindManyMock = vi.fn(async () => [{ id: 'c1' }, { id: 'c2' }]);
const dataCaptureDeleteManyMock = vi.fn(async () => ({ count: 1 }));
const dataStoreRecordDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const dataStoreDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const moduleEventDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const moduleMetricsDailyDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const attributionLinkDeleteManyMock = vi.fn(async () => ({ count: 0 }));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    $transaction: <T>(queries: Promise<T>[]) => Promise.all(queries),
    shop: { findUnique: shopFindUniqueMock },
    activityLog: { create: activityLogCreateMock },
    dataCapture: { findMany: dataCaptureFindManyMock, deleteMany: dataCaptureDeleteManyMock },
    dataStoreRecord: { deleteMany: dataStoreRecordDeleteManyMock },
    dataStore: { deleteMany: dataStoreDeleteManyMock },
    moduleEvent: { deleteMany: moduleEventDeleteManyMock },
    moduleMetricsDaily: { deleteMany: moduleMetricsDailyDeleteManyMock },
    attributionLink: { deleteMany: attributionLinkDeleteManyMock },
  }),
}));

function postRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  shopFindUniqueMock.mockResolvedValue({ id: 'shop-1', shopDomain: 'gdpr.myshopify.com' });
  // Real authenticate.webhook verifies HMAC then returns the parsed body as payload.
  authWebhookMock.mockImplementation(async (req: Request) => ({ payload: await req.json() }));
});

describe('customers/data_request', () => {
  it('acks 200 and records a GDPR_DATA_REQUEST audit log for the customer', async () => {
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
    expect(activityLogCreateMock).toHaveBeenCalledTimes(1);
    const [logArg] = activityLogCreateMock.mock.calls[0] as unknown as [{ data: { action: string; resource: string; shopId: string } }];
    expect(logArg.data.action).toBe('GDPR_DATA_REQUEST');
    expect(logArg.data.resource).toBe('customer:555');
    expect(logArg.data.shopId).toBe('shop-1');
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

  it('acks 200 without an audit log when the shop is unknown', async () => {
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
