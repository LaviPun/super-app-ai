import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuthenticateWebhook, prismaMock } = vi.hoisted(() => ({
  mockAuthenticateWebhook: vi.fn(),
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
  shopify: { authenticate: { webhook: mockAuthenticateWebhook } },
  default: { authenticate: { webhook: mockAuthenticateWebhook } },
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

import { action as appScopesUpdateAction } from '../routes/webhooks.app.scopes_update';
import { action as appUninstalledAction } from '../routes/webhooks.app.uninstalled';
import { action as customersDataRequestAction } from '../routes/webhooks.customers.data_request';
import { action as customersRedactAction } from '../routes/webhooks.customers.redact';
import { action as shopRedactAction } from '../routes/webhooks.shop.redact';

function postRequest(path: string) {
  const request = new Request(`https://app.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const jsonSpy = vi.spyOn(request, 'json').mockRejectedValue(new Error('body already consumed'));
  return { request, jsonSpy };
}

function authenticateWithPayload(payload: Record<string, unknown>) {
  mockAuthenticateWebhook.mockResolvedValue({
    payload,
    shop: String(payload.shop_domain ?? payload.myshopify_domain ?? 'demo.myshopify.com'),
    topic: 'test/topic',
  });
}

describe('webhook payload handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.shop.findUnique.mockResolvedValue({ id: 'shop-1', shopDomain: 'demo.myshopify.com' });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.appSubscription.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.job.create.mockResolvedValue({});
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.dataCapture.findMany.mockResolvedValue([{ id: 'capture-1', captureType: 'FORM', createdAt: new Date() }]);
    prismaMock.dataCapture.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.moduleEvent.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.moduleMetricsDaily.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.attributionLink.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('uses authenticated payload for customers/data_request without reparsing the consumed body', async () => {
    authenticateWithPayload({
      shop_domain: 'demo.myshopify.com',
      customer: { id: 123 },
    });
    const { request, jsonSpy } = postRequest('/webhooks/customers/data_request');

    const response = await customersDataRequestAction({ request });

    expect(response.status).toBe(200);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(prismaMock.dataCapture.findMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1' },
      select: { id: true, captureType: true, createdAt: true },
      take: 1000,
    });
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });

  it('uses authenticated payload for customers/redact without reparsing the consumed body', async () => {
    authenticateWithPayload({
      shop_domain: 'demo.myshopify.com',
      customer: { id: 456 },
    });
    const { request, jsonSpy } = postRequest('/webhooks/customers/redact');

    const response = await customersRedactAction({ request });

    expect(response.status).toBe(200);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(prismaMock.dataCapture.deleteMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-1',
        payload: { contains: '"customer_id":456' },
      },
    });
  });

  it('uses authenticated payload for shop/redact without reparsing the consumed body', async () => {
    authenticateWithPayload({ shop_domain: 'demo.myshopify.com' });
    const { request, jsonSpy } = postRequest('/webhooks/shop/redact');

    const response = await shopRedactAction({ request });

    expect(response.status).toBe(200);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(prismaMock.dataCapture.deleteMany).toHaveBeenCalledWith({ where: { shopId: 'shop-1' } });
    expect(prismaMock.moduleEvent.deleteMany).toHaveBeenCalledWith({ where: { shopId: 'shop-1' } });
    expect(prismaMock.moduleMetricsDaily.deleteMany).toHaveBeenCalledWith({ where: { shopId: 'shop-1' } });
    expect(prismaMock.attributionLink.deleteMany).toHaveBeenCalledWith({ where: { shopId: 'shop-1' } });
  });

  it('uses authenticated payload for app/uninstalled without reparsing the consumed body', async () => {
    authenticateWithPayload({ myshopify_domain: 'demo.myshopify.com' });
    const { request, jsonSpy } = postRequest('/webhooks/app/uninstalled');

    const response = await appUninstalledAction({ request });

    expect(response.status).toBe(200);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { shop: 'demo.myshopify.com' } });
    expect(prismaMock.job.create).toHaveBeenCalled();
  });

  it('uses authenticated payload for app/scopes_update without reparsing the consumed body', async () => {
    authenticateWithPayload({
      myshopify_domain: 'demo.myshopify.com',
      app_scopes: ['read_products'],
    });
    const { request, jsonSpy } = postRequest('/webhooks/app/scopes_update');

    const response = await appScopesUpdateAction({ request });

    expect(response.status).toBe(200);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'APP_SCOPES_UPDATE',
        details: JSON.stringify({ shopDomain: 'demo.myshopify.com', appScopes: ['read_products'] }),
      }),
    });
  });
});
