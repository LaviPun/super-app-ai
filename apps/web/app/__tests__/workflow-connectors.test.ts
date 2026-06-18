import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InvokeRequest, AuthContext } from '@superapp/core';
import { SuperAppConnector } from '~/services/workflows/connectors/superapp.connector';
import { ShopifyConnector } from '~/services/workflows/connectors/shopify.connector';

vi.mock('~/shopify-api.server', () => ({
  adminGraphqlUrl: () => 'https://test.myshopify.com/admin/api/2026-04/graphql.json',
}));

const req = (operation: string, inputs: Record<string, unknown>): InvokeRequest => ({
  runId: 'run1', stepId: 's1', tenantId: 'shop_1', operation, inputs, timeoutMs: 5000,
});
const shopifyAuth: AuthContext = { type: 'shopify', shop: 'test.myshopify.com', accessToken: 'tok' };

describe('SuperAppConnector — module I/O', () => {
  it('createRecord writes to a module store and returns the record id', async () => {
    const fakeData = {
      getStoreByKey: vi.fn(async () => ({ id: 'store_9' })),
      createRecord: vi.fn(async () => ({ id: 'rec_42' })),
      listRecords: vi.fn(),
    };
    const c = new SuperAppConnector(fakeData as never);
    const res = await c.invoke({ type: 'none' }, req('datastore.createRecord', {
      storeKey: 'module_ABC', payload: { rating: 5 }, title: 'Nice',
    }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.output.recordId).toBe('rec_42');
    // key normalized to module_abc when looking up the store
    expect(fakeData.getStoreByKey).toHaveBeenCalledWith('shop_1', 'module_abc');
  });

  it('query returns records + total', async () => {
    const fakeData = {
      getStoreByKey: vi.fn(),
      createRecord: vi.fn(),
      listRecords: vi.fn(async () => ({ records: [{ id: 'r1' }], total: 1, storeId: 's', storeKey: 'customer', label: 'C' })),
    };
    const c = new SuperAppConnector(fakeData as never);
    const res = await c.invoke({ type: 'none' }, req('datastore.query', { storeKey: 'customer', limit: 10 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.output.total).toBe(1);
      expect((res.output.records as unknown[]).length).toBe(1);
    }
  });

  it('returns NOT_FOUND when the store does not exist', async () => {
    const fakeData = { getStoreByKey: vi.fn(async () => null), createRecord: vi.fn(), listRecords: vi.fn() };
    const c = new SuperAppConnector(fakeData as never);
    const res = await c.invoke({ type: 'none' }, req('datastore.createRecord', { storeKey: 'nope', payload: {} }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_FOUND');
  });
});

describe('ShopifyConnector — order routing (our own)', () => {
  beforeEach(() => {
    const calls: string[] = [];
    (globalThis as { __calls?: string[] }).__calls = calls;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { query: string };
      calls.push(body.query);
      // First call: fulfillmentOrders query. Second: the move mutation.
      const isQuery = body.query.includes('fulfillmentOrders(first');
      const json = isQuery
        ? { data: { order: { fulfillmentOrders: { nodes: [{ id: 'gid://shopify/FulfillmentOrder/1', assignedLocation: { location: { id: 'gid://shopify/Location/A' } } }] } } } }
        : { data: { fulfillmentOrderMove: { movedFulfillmentOrder: { id: 'gid://shopify/FulfillmentOrder/1' }, userErrors: [] } } };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => json } as unknown as Response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the order’s fulfillment order, then moves it to the new location', async () => {
    const c = new ShopifyConnector();
    const res = await c.invoke(shopifyAuth, req('order.routeToLocation', {
      orderId: 'gid://shopify/Order/1', newLocationId: 'gid://shopify/Location/B',
    }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.output.movedFulfillmentOrderId).toBe('gid://shopify/FulfillmentOrder/1');
      expect(res.output.locationId).toBe('gid://shopify/Location/B');
    }
    const calls = (globalThis as { __calls?: string[] }).__calls!;
    expect(calls.length).toBe(2); // query + move
    expect(calls[1]).toContain('fulfillmentOrderMove');
  });

  it('exposes order.routeToLocation + inventory.adjust in the manifest', () => {
    const ops = new ShopifyConnector().manifest().operations.map((o) => o.name);
    expect(ops).toContain('order.routeToLocation');
    expect(ops).toContain('inventory.adjust');
    expect(ops).toContain('product.updateStatus');
  });
});
