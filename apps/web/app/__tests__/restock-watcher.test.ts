import { describe, it, expect, vi } from 'vitest';
import type { Connector } from '@superapp/core';
import {
  RestockWatcherService,
  parseProductEvent,
  parseCapturePayload,
  isWaiting,
  restockTriggered,
  priceDropTriggered,
  BACK_IN_STOCK_CAPTURE_TYPE,
  PRICE_DROP_CAPTURE_TYPE,
} from '~/services/messaging/restock-watcher.server';

/**
 * The back-in-stock / price-drop watcher: reacts to products/update, notifies WAITING
 * DataCapture subscriptions via the SAME email connector the messaging runner uses,
 * marks them notified (dedupe), and refuses to fake a send when unconfigured or when
 * the recipient email is unresolvable. Everything is DI-mocked (no DB, no network).
 */

type FakeConnector = Connector & { invoke: ReturnType<typeof vi.fn> };

function fakeEmailConnector(result: { ok: boolean; message?: string } = { ok: true }): FakeConnector {
  return {
    manifest: () => ({}) as never,
    validate: () => ({ ok: true }),
    invoke: vi.fn(async () =>
      result.ok
        ? ({ ok: true, output: { messageId: 'm1', accepted: true } } as never)
        : ({ ok: false, code: 'UPSTREAM', message: result.message ?? 'boom', retryable: false } as never),
    ),
  };
}

function fakePrisma(opts: { captures?: CaptureRow[]; shop?: { id: string } | null }) {
  const updateMock = vi.fn(async (_args: { where: { id: string }; data: { payload: string } }) => ({}));
  const findManyMock = vi.fn(async () => opts.captures ?? []);
  return {
    prisma: {
      shop: { findUnique: vi.fn(async () => (opts.shop === undefined ? { id: 'shop_1' } : opts.shop)) },
      dataCapture: { findMany: findManyMock, update: updateMock },
    } as never,
    updateMock,
    findManyMock,
  };
}

type CaptureRow = { id: string; customerId: string | null; captureType: string; payload: string };

function capture(id: string, captureType: string, payload: Record<string, unknown>, customerId: string | null = null): CaptureRow {
  return { id, customerId, captureType, payload: JSON.stringify(payload) };
}

/** A products/update event: one variant, configurable qty + price. */
function productEvent(opts: { variantId?: string; qty?: number; price?: string }) {
  return {
    admin_graphql_api_id: 'gid://shopify/Product/100',
    id: 100,
    title: 'Aurora Jacket',
    handle: 'aurora-jacket',
    variants: [
      {
        admin_graphql_api_id: opts.variantId ?? 'gid://shopify/ProductVariant/200',
        id: 200,
        inventory_quantity: opts.qty ?? 0,
        price: opts.price ?? '80.00',
      },
    ],
  };
}

const ENV_READY = { EMAIL_API_KEY: 'key_123', EMAIL_FROM: 'store@example.com' };

describe('pure helpers', () => {
  it('parseProductEvent extracts product + variant states', () => {
    const parsed = parseProductEvent(productEvent({ qty: 5, price: '49.99' }));
    expect(parsed?.productGid).toBe('gid://shopify/Product/100');
    expect(parsed?.variants[0]).toEqual({
      variantGid: 'gid://shopify/ProductVariant/200',
      qty: 5,
      price: 49.99,
    });
  });

  it('parseProductEvent returns null for a non-object / no-id event', () => {
    expect(parseProductEvent(null)).toBeNull();
    expect(parseProductEvent({ variants: [] })).toBeNull();
  });

  it('isWaiting treats missing status as waiting, notified as done', () => {
    expect(isWaiting({})).toBe(true);
    expect(isWaiting({ status: 'waiting' })).toBe(true);
    expect(isWaiting({ status: 'notified' })).toBe(false);
  });

  it('restockTriggered only on positive qty', () => {
    expect(restockTriggered({ variantGid: 'v', qty: 0, price: null })).toBe(false);
    expect(restockTriggered({ variantGid: 'v', qty: 3, price: null })).toBe(true);
    expect(restockTriggered({ variantGid: 'v', qty: null, price: null })).toBe(false);
  });

  it('priceDropTriggered only when current price < priceAt', () => {
    const v = (price: number) => ({ variantGid: 'v', qty: null, price });
    expect(priceDropTriggered({ priceAt: 100 }, v(80))).toBe(true);
    expect(priceDropTriggered({ priceAt: 100 }, v(100))).toBe(false);
    expect(priceDropTriggered({ priceAt: 100 }, v(120))).toBe(false);
    expect(priceDropTriggered({}, v(80))).toBe(false); // no priceAt → no fire
  });

  it('parseCapturePayload tolerates malformed JSON', () => {
    expect(parseCapturePayload('not json')).toBeNull();
    expect(parseCapturePayload('{"a":1}')).toEqual({ a: 1 });
  });
});

describe('RestockWatcherService.runForProductUpdate', () => {
  it('notifies a waiting back_in_stock capture when the variant restocks (0→positive) and marks it notified', async () => {
    const { prisma, updateMock } = fakePrisma({
      captures: [
        capture('c1', BACK_IN_STOCK_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: 'buyer@example.com',
          status: 'waiting',
        }),
      ],
    });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({
      prisma,
      getConnector: () => connector,
      env: ENV_READY,
    });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ qty: 4 }));

    expect(res).toMatchObject({ matched: 1, notified: 1, waiting: 0, deferred: 0, connectorUnconfigured: false });
    expect(connector.invoke).toHaveBeenCalledTimes(1);
    const call = connector.invoke.mock.calls[0]![1];
    expect(call.inputs.to).toBe('buyer@example.com');
    expect(call.inputs.subject).toContain('Back in stock');
    // Marked notified.
    expect(updateMock).toHaveBeenCalledTimes(1);
    const written = JSON.parse(updateMock.mock.calls[0]![0].data.payload);
    expect(written.status).toBe('notified');
    expect(written.notifiedAt).toBeTruthy();
  });

  it('does NOT notify when the variant is still out of stock', async () => {
    const { prisma, updateMock } = fakePrisma({
      captures: [
        capture('c1', BACK_IN_STOCK_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: 'buyer@example.com',
        }),
      ],
    });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ qty: 0 }));

    expect(res).toMatchObject({ matched: 0, notified: 0 });
    expect(connector.invoke).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('dedupes: an already-notified capture is never re-sent', async () => {
    const { prisma } = fakePrisma({
      captures: [
        capture('c1', BACK_IN_STOCK_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: 'buyer@example.com',
          status: 'notified',
        }),
      ],
    });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ qty: 9 }));

    expect(res.matched).toBe(0);
    expect(connector.invoke).not.toHaveBeenCalled();
  });

  it('refuses to send when the email connector is unconfigured — capture stays waiting', async () => {
    const { prisma, updateMock } = fakePrisma({
      captures: [
        capture('c1', BACK_IN_STOCK_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: 'buyer@example.com',
        }),
      ],
    });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({
      prisma,
      getConnector: () => connector,
      env: {}, // no EMAIL_API_KEY / EMAIL_FROM
    });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ qty: 4 }));

    expect(res).toMatchObject({ matched: 1, notified: 0, waiting: 1, connectorUnconfigured: true });
    expect(connector.invoke).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled(); // never marked notified
  });

  it('price_drop notifies only when current price is below the subscription price', async () => {
    const { prisma } = fakePrisma({
      captures: [
        capture('drop', PRICE_DROP_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: 'buyer@example.com',
          priceAt: 100,
        }),
        capture('nodrop', PRICE_DROP_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: 'other@example.com',
          priceAt: 50, // current 80 is NOT below 50
        }),
      ],
    });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ price: '80.00' }));

    expect(res.notified).toBe(1);
    expect(connector.invoke).toHaveBeenCalledTimes(1);
    expect(connector.invoke.mock.calls[0]![1].inputs.subject).toContain('Price drop');
  });

  it('resolves a redacted-at-rest email from Shopify via customerId', async () => {
    const { prisma } = fakePrisma({
      captures: [
        capture(
          'c1',
          BACK_IN_STOCK_CAPTURE_TYPE,
          {
            variantGid: 'gid://shopify/ProductVariant/200',
            productGid: 'gid://shopify/Product/100',
            email: '[REDACTED_EMAIL]', // redaction at rest
          },
          '901', // customerId
        ),
      ],
    });
    const connector = fakeEmailConnector();
    const adminGraphql = vi.fn(async () => ({
      json: async () => ({
        data: { customer: { defaultEmailAddress: { emailAddress: 'resolved@example.com', marketingState: 'NOT_SUBSCRIBED' } } },
      }),
    })) as never;
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY });

    const res = await svc.runForProductUpdate('shop.myshopify.com', adminGraphql, productEvent({ qty: 3 }));

    expect(res.notified).toBe(1);
    expect(connector.invoke.mock.calls[0]![1].inputs.to).toBe('resolved@example.com');
  });

  it('stays waiting when the email is redacted and there is no resolvable customerId', async () => {
    const { prisma, updateMock } = fakePrisma({
      captures: [
        capture('c1', BACK_IN_STOCK_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: '[REDACTED_EMAIL]',
        }),
      ],
    });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ qty: 3 }));

    expect(res).toMatchObject({ matched: 1, notified: 0, waiting: 1 });
    expect(connector.invoke).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('leaves the capture waiting when the send fails (transient) — retried next update', async () => {
    const { prisma, updateMock } = fakePrisma({
      captures: [
        capture('c1', BACK_IN_STOCK_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: 'buyer@example.com',
        }),
      ],
    });
    const connector = fakeEmailConnector({ ok: false, message: 'smtp down' });
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ qty: 3 }));

    expect(res).toMatchObject({ matched: 1, notified: 0, waiting: 1 });
    expect(connector.invoke).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('skips a capture that explicitly opted out', async () => {
    const { prisma } = fakePrisma({
      captures: [
        capture('c1', BACK_IN_STOCK_CAPTURE_TYPE, {
          variantGid: 'gid://shopify/ProductVariant/200',
          productGid: 'gid://shopify/Product/100',
          email: 'buyer@example.com',
          consent: false,
        }),
      ],
    });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ qty: 3 }));

    expect(res).toMatchObject({ matched: 1, notified: 0, skipped: 1 });
    expect(connector.invoke).not.toHaveBeenCalled();
  });

  it('caps fan-out at batchCap and defers the overflow to the next update', async () => {
    const captures = Array.from({ length: 5 }, (_, i) =>
      capture(`c${i}`, BACK_IN_STOCK_CAPTURE_TYPE, {
        variantGid: 'gid://shopify/ProductVariant/200',
        productGid: 'gid://shopify/Product/100',
        email: `buyer${i}@example.com`,
      }),
    );
    const { prisma } = fakePrisma({ captures });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY, batchCap: 2 });

    const res = await svc.runForProductUpdate('shop.myshopify.com', undefined, productEvent({ qty: 3 }));

    expect(res).toMatchObject({ matched: 5, notified: 2, deferred: 3 });
    expect(connector.invoke).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when the shop is unknown', async () => {
    const { prisma, findManyMock } = fakePrisma({ shop: null });
    const connector = fakeEmailConnector();
    const svc = new RestockWatcherService({ prisma, getConnector: () => connector, env: ENV_READY });

    const res = await svc.runForProductUpdate('missing.myshopify.com', undefined, productEvent({ qty: 3 }));

    expect(res.matched).toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
