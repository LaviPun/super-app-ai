import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuthenticateWebhook, prismaMock } = vi.hoisted(() => ({
  mockAuthenticateWebhook: vi.fn(),
  prismaMock: {
    shop: { findUnique: vi.fn() },
    session: { deleteMany: vi.fn() },
    appSubscription: { updateMany: vi.fn() },
    job: { create: vi.fn() },
    activityLog: { create: vi.fn() },
    dataCapture: { deleteMany: vi.fn(), findMany: vi.fn() },
    moduleEvent: { deleteMany: vi.fn() },
    moduleMetricsDaily: { deleteMany: vi.fn() },
    attributionLink: { deleteMany: vi.fn() },
  },
}));

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      webhook: mockAuthenticateWebhook,
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

type WebhookAction = (args: { request: Request }) => Promise<Response>;

describe('webhook handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateWebhook.mockResolvedValue({
      payload: {
        app_scopes: ['read_products'],
        customer: { id: 123 },
      },
      shop: 'example.myshopify.com',
      topic: 'test/topic',
    });
    prismaMock.shop.findUnique.mockResolvedValue(null);
    prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.appSubscription.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.job.create.mockResolvedValue({});
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.dataCapture.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.dataCapture.findMany.mockResolvedValue([]);
    prismaMock.moduleEvent.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.moduleMetricsDaily.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.attributionLink.deleteMany.mockResolvedValue({ count: 0 });
  });

  it.each<[string, WebhookAction]>([
    ['shop redact', shopRedactAction],
    ['customer redact', customerRedactAction],
    ['customer data request', customerDataRequestAction],
    ['app uninstalled', appUninstalledAction],
    ['app scopes update', appScopesUpdateAction],
  ])('uses the authenticated payload for %s without reparsing the request body', async (_name, action) => {
    const request = new Request('https://app.example/webhook', { method: 'POST' });
    const jsonSpy = vi.spyOn(request, 'json').mockRejectedValue(new Error('body already consumed'));

    const response = await action({ request });

    expect(response.status).toBe(200);
    expect(mockAuthenticateWebhook).toHaveBeenCalledWith(request);
    expect(jsonSpy).not.toHaveBeenCalled();
  });
});
