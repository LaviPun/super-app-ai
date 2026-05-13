import { beforeEach, describe, expect, it, vi } from 'vitest';

const AUTHENTICATED_SHOP_DOMAIN = 'verified-shop.myshopify.com';

const { authenticateWebhook, prismaMock } = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  prismaMock: {
    shop: { findUnique: vi.fn() },
    session: { deleteMany: vi.fn() },
    appSubscription: { updateMany: vi.fn() },
    job: { create: vi.fn() },
    activityLog: { create: vi.fn() },
    dataCapture: { findMany: vi.fn(), deleteMany: vi.fn() },
    moduleEvent: { deleteMany: vi.fn() },
    moduleMetricsDaily: { deleteMany: vi.fn() },
    attributionLink: { deleteMany: vi.fn() },
  },
}));

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      webhook: authenticateWebhook,
    },
  },
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

import { action as appScopesUpdateAction } from '../routes/webhooks.app.scopes_update';
import { action as appUninstalledAction } from '../routes/webhooks.app.uninstalled';
import { action as customerDataRequestAction } from '../routes/webhooks.customers.data_request';
import { action as customerRedactAction } from '../routes/webhooks.customers.redact';
import { action as shopRedactAction } from '../routes/webhooks.shop.redact';

function webhookRequest(payload: unknown) {
  return new Request('https://example.test/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('webhook payload handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateWebhook.mockImplementation(async (request: Request) => ({
      payload: await request.json(),
      shop: AUTHENTICATED_SHOP_DOMAIN,
      topic: 'test/topic',
      admin: undefined,
    }));
    prismaMock.shop.findUnique.mockResolvedValue({ id: 'shop-1' });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.appSubscription.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.job.create.mockResolvedValue({ id: 'job-1' });
    prismaMock.activityLog.create.mockResolvedValue({ id: 'log-1' });
    prismaMock.dataCapture.findMany.mockResolvedValue([]);
    prismaMock.dataCapture.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.moduleEvent.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.moduleMetricsDaily.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.attributionLink.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('app/uninstalled uses the authenticated payload instead of re-reading the request body', async () => {
    const response = await appUninstalledAction({
      request: webhookRequest({ myshopify_domain: 'Verified-Shop.myshopify.com' }),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({
      where: { shopDomain: AUTHENTICATED_SHOP_DOMAIN },
    });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: AUTHENTICATED_SHOP_DOMAIN },
    });
  });

  it('app/scopes_update uses the authenticated payload instead of re-reading the request body', async () => {
    const response = await appScopesUpdateAction({
      request: webhookRequest({ myshopify_domain: AUTHENTICATED_SHOP_DOMAIN, app_scopes: ['read_products'] }),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'APP_SCOPES_UPDATE',
          details: JSON.stringify({
            shopDomain: AUTHENTICATED_SHOP_DOMAIN,
            appScopes: ['read_products'],
          }),
        }),
      }),
    );
  });

  it('customers/data_request falls back to the authenticated shop when the payload omits shop_domain', async () => {
    const response = await customerDataRequestAction({
      request: webhookRequest({ customer: { id: 123 } }),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({
      where: { shopDomain: AUTHENTICATED_SHOP_DOMAIN },
    });
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'GDPR_DATA_REQUEST',
          resource: 'customer:123',
        }),
      }),
    );
  });

  it('customers/redact falls back to the authenticated shop when the payload omits shop_domain', async () => {
    const response = await customerRedactAction({
      request: webhookRequest({ customer: { id: 123 } }),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({
      where: { shopDomain: AUTHENTICATED_SHOP_DOMAIN },
    });
    expect(prismaMock.dataCapture.deleteMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-1',
        payload: { contains: '"customer_id":123' },
      },
    });
  });

  it('shop/redact falls back to the authenticated shop when the payload omits shop_domain', async () => {
    const response = await shopRedactAction({
      request: webhookRequest({}),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({
      where: { shopDomain: AUTHENTICATED_SHOP_DOMAIN },
    });
    expect(prismaMock.dataCapture.deleteMany).toHaveBeenCalledWith({ where: { shopId: 'shop-1' } });
  });
});
