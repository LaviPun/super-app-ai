import { describe, it, expect } from 'vitest';
import { STATIC_RECOMMENDATION_STRATEGIES, RECOMMENDATION_STRATEGIES } from '@superapp/core';
import { resolveRecommendation, isStaticStrategy } from './recommendation.service';

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

  it('buy-it-again with no customerId → [] (guest degrades to fallback)', async () => {
    const products = await resolveRecommendation({
      shop: 'test.myshopify.com',
      strategy: 'buy-it-again',
      limit: 4,
    });
    expect(products).toEqual([]);
  });

  it('dynamic strategies currently return [] (honest follow-up: ranking queries not yet built)', async () => {
    // This documents the honest state: the seam is built + tested, the analytics
    // ranking queries are the tracked follow-up. When they land, update this test.
    for (const strategy of ['top-sellers', 'trending', 'buy-it-again', 'recently-viewed'] as const) {
      const products = await resolveRecommendation({ shop: 'test.myshopify.com', strategy, limit: 4 });
      expect(products.length).toBeLessThanOrEqual(4);
      expect(products).toEqual([]);
    }
  });
});
