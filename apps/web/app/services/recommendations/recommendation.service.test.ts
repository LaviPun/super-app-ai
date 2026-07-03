import { describe, it, expect, beforeEach } from 'vitest';
import { STATIC_RECOMMENDATION_STRATEGIES, RECOMMENDATION_STRATEGIES } from '@superapp/core';
import {
  resolveRecommendation,
  isStaticStrategy,
  __clearRecommendationCache,
} from './recommendation.service';
import type { AdminApiContext } from '~/types/shopify';

type AdminClient = AdminApiContext['admin'];

// ── Admin-client mock helpers ──────────────────────────────────────────────────
function product(id: string, opts: { title?: string; handle?: string; url?: string | null; price?: string; tags?: string[] } = {}) {
  return {
    id: `gid://shopify/Product/${id}`,
    title: opts.title ?? `Product ${id}`,
    handle: opts.handle ?? `product-${id}`,
    onlineStoreUrl: opts.url === undefined ? `https://shop.example/products/product-${id}` : opts.url,
    tags: opts.tags ?? [],
    featuredMedia: { preview: { image: { url: `https://cdn/${id}.jpg` } } },
    priceRangeV2: { minVariantPrice: { amount: opts.price ?? '10.00', currencyCode: 'USD' } },
  };
}

function order(createdAt: string, lines: Array<{ id: string; quantity: number; opts?: Parameters<typeof product>[1] }>) {
  return {
    id: `gid://shopify/Order/${Math.random().toString(36).slice(2)}`,
    createdAt,
    lineItems: { nodes: lines.map((l) => ({ quantity: l.quantity, product: product(l.id, l.opts) })) },
  };
}

/** Build a mock admin whose `graphql` returns one orders page (no next page). */
function mockOrdersAdmin(orders: unknown[], opts: { customer?: boolean } = {}): { admin: AdminClient } {
  const admin = {
    graphql: async () => {
      const conn = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: orders };
      const data = opts.customer ? { customer: { orders: conn } } : { orders: conn };
      return { json: async () => ({ data }) } as unknown as Response;
    },
  } as unknown as AdminClient;
  return { admin };
}

const NOW = new Date();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  __clearRecommendationCache();
});

describe('recommendation.service — the resolver-class split fence', () => {
  it('every STATIC strategy returns [] from the service (never depends on a backend)', async () => {
    for (const strategy of STATIC_RECOMMENDATION_STRATEGIES) {
      const products = await resolveRecommendation({ shop: 'test.myshopify.com', strategy, limit: 4 });
      expect(products).toEqual([]);
    }
  });

  it('isStaticStrategy matches the enum exactly', () => {
    for (const s of STATIC_RECOMMENDATION_STRATEGIES) {
      expect(isStaticStrategy(s)).toBe(true);
    }
    const staticSet = new Set<string>(STATIC_RECOMMENDATION_STRATEGIES);
    const dynamic = RECOMMENDATION_STRATEGIES.filter((s) => !staticSet.has(s));
    for (const s of dynamic) {
      expect(isStaticStrategy(s)).toBe(false);
    }
  });

  it('STATIC strategies stay [] even with an admin client (the split invariant)', async () => {
    const { admin } = mockOrdersAdmin([order(daysAgo(1), [{ id: '1', quantity: 5 }])]);
    for (const strategy of STATIC_RECOMMENDATION_STRATEGIES) {
      const products = await resolveRecommendation({ shop: 'test.myshopify.com', strategy, limit: 4, admin });
      expect(products).toEqual([]);
    }
  });
});

describe('recommendation.service — honest degradation', () => {
  it('dynamic strategies with NO admin client → [] (caller applies fallback)', async () => {
    for (const strategy of ['top-sellers', 'trending', 'buy-it-again'] as const) {
      const products = await resolveRecommendation({ shop: 'test.myshopify.com', strategy, limit: 4 });
      expect(products).toEqual([]);
    }
  });

  it('recently-viewed → [] even with an admin client (client-only strategy)', async () => {
    const { admin } = mockOrdersAdmin([order(daysAgo(1), [{ id: '1', quantity: 9 }])]);
    const products = await resolveRecommendation({ shop: 's', strategy: 'recently-viewed', limit: 4, admin });
    expect(products).toEqual([]);
  });

  it('buy-it-again with no customerId → [] (guest degrades to fallback)', async () => {
    const { admin } = mockOrdersAdmin([], { customer: true });
    const products = await resolveRecommendation({ shop: 's', strategy: 'buy-it-again', limit: 4, admin });
    expect(products).toEqual([]);
  });

  it('a thrown Admin error is swallowed → [] (never propagates to storefront)', async () => {
    const admin = {
      graphql: async () => {
        throw new Error('429 throttled');
      },
    } as unknown as AdminClient;
    const products = await resolveRecommendation({ shop: 's', strategy: 'top-sellers', limit: 4, admin });
    expect(products).toEqual([]);
  });
});

describe('top-sellers — ranked by units over the window', () => {
  it('ranks products by total units sold, descending', async () => {
    const { admin } = mockOrdersAdmin([
      order(daysAgo(2), [{ id: 'A', quantity: 3 }, { id: 'B', quantity: 1 }]),
      order(daysAgo(5), [{ id: 'B', quantity: 1 }, { id: 'C', quantity: 10 }]),
    ]);
    const products = await resolveRecommendation({ shop: 's', strategy: 'top-sellers', limit: 4, admin });
    // C=10, A=3, B=2
    expect(products.map((p) => p.id)).toEqual([
      'gid://shopify/Product/C',
      'gid://shopify/Product/A',
      'gid://shopify/Product/B',
    ]);
    expect(products[0]).toMatchObject({ title: 'Product C', price: '10.00' });
    expect(products[0]?.url).toContain('/products/');
  });

  it('respects the limit', async () => {
    const { admin } = mockOrdersAdmin([
      order(daysAgo(1), [{ id: 'A', quantity: 5 }, { id: 'B', quantity: 4 }, { id: 'C', quantity: 3 }]),
    ]);
    const products = await resolveRecommendation({ shop: 's', strategy: 'top-sellers', limit: 2, admin });
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.id)).toEqual(['gid://shopify/Product/A', 'gid://shopify/Product/B']);
  });

  it('excludes products carrying an excludeTag', async () => {
    const { admin } = mockOrdersAdmin([
      order(daysAgo(1), [
        { id: 'A', quantity: 9, opts: { tags: ['hidden-upsell'] } },
        { id: 'B', quantity: 1 },
      ]),
    ]);
    const products = await resolveRecommendation({
      shop: 's',
      strategy: 'top-sellers',
      limit: 4,
      admin,
      excludeTags: ['Hidden-Upsell'], // case-insensitive
    });
    expect(products.map((p) => p.id)).toEqual(['gid://shopify/Product/B']);
  });

  it('drops line items with no product (custom/deleted) and unpublished products', async () => {
    const { admin } = mockOrdersAdmin([
      order(daysAgo(1), [
        { id: 'A', quantity: 4 },
        { id: 'B', quantity: 3, opts: { url: null, handle: '' } }, // no storefront URL → skipped
      ]),
    ]);
    const products = await resolveRecommendation({ shop: 's', strategy: 'top-sellers', limit: 4, admin });
    expect(products.map((p) => p.id)).toEqual(['gid://shopify/Product/A']);
  });

  it('too-few results (below limit) returns the short list → caller applies fallback', async () => {
    const { admin } = mockOrdersAdmin([order(daysAgo(1), [{ id: 'A', quantity: 2 }])]);
    const products = await resolveRecommendation({ shop: 's', strategy: 'top-sellers', limit: 4, admin });
    expect(products).toHaveLength(1); // < limit; storefront fills remainder from fallback
  });
});

describe('trending — recency-weighted velocity over a short window', () => {
  it('a recent burst outranks an older-but-larger volume', async () => {
    // B has more total units but all old; A is fewer but very recent → A trends higher.
    const { admin } = mockOrdersAdmin([
      order(daysAgo(0), [{ id: 'A', quantity: 3 }]),
      order(daysAgo(6), [{ id: 'B', quantity: 4 }]),
    ]);
    const products = await resolveRecommendation({ shop: 's', strategy: 'trending', limit: 4, admin });
    expect(products[0]?.id).toBe('gid://shopify/Product/A');
  });
});

describe('buy-it-again — the signed-in customer’s own products', () => {
  it('returns the customer’s purchased products, most-recent first', async () => {
    const { admin } = mockOrdersAdmin(
      [
        order(daysAgo(1), [{ id: 'NEW', quantity: 1 }]),
        order(daysAgo(30), [{ id: 'OLD', quantity: 5 }]),
      ],
      { customer: true },
    );
    const products = await resolveRecommendation({
      shop: 's',
      strategy: 'buy-it-again',
      limit: 4,
      admin,
      customerId: 'gid://shopify/Customer/1',
    });
    expect(products.map((p) => p.id)).toEqual([
      'gid://shopify/Product/NEW',
      'gid://shopify/Product/OLD',
    ]);
  });

  it('empty history → [] (nothing to reorder → fallback)', async () => {
    const { admin } = mockOrdersAdmin([], { customer: true });
    const products = await resolveRecommendation({
      shop: 's',
      strategy: 'buy-it-again',
      limit: 4,
      admin,
      customerId: 'gid://shopify/Customer/1',
    });
    expect(products).toEqual([]);
  });
});

describe('caching — one aggregation serves repeated hits', () => {
  it('a second call within TTL does not re-query Admin', async () => {
    let calls = 0;
    const admin = {
      graphql: async () => {
        calls++;
        return {
          json: async () => ({
            data: {
              orders: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [order(daysAgo(1), [{ id: 'A', quantity: 5 }])],
              },
            },
          }),
        } as unknown as Response;
      },
    } as unknown as AdminClient;

    await resolveRecommendation({ shop: 'cache.example', strategy: 'top-sellers', limit: 4, admin });
    await resolveRecommendation({ shop: 'cache.example', strategy: 'top-sellers', limit: 2, admin });
    expect(calls).toBe(1); // second call hit the in-process cache
  });

  it('different shops do not share a cache entry', async () => {
    let calls = 0;
    const admin = {
      graphql: async () => {
        calls++;
        return {
          json: async () => ({
            data: {
              orders: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [order(daysAgo(1), [{ id: 'A', quantity: 5 }])],
              },
            },
          }),
        } as unknown as Response;
      },
    } as unknown as AdminClient;

    await resolveRecommendation({ shop: 'a.example', strategy: 'top-sellers', limit: 4, admin });
    await resolveRecommendation({ shop: 'b.example', strategy: 'top-sellers', limit: 4, admin });
    expect(calls).toBe(2);
  });
});
