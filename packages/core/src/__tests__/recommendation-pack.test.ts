import { describe, it, expect } from 'vitest';
import {
  RecommendationPackSchema,
  recommendationPack,
  getPack,
  RECOMMENDATION_STRATEGIES,
  STATIC_RECOMMENDATION_STRATEGIES,
} from '../control-packs/index.js';

const VARIANT = 'gid://shopify/ProductVariant/123';
const PRODUCT = 'gid://shopify/Product/123';
const COLLECTION = 'gid://shopify/Collection/123';

describe('recommendation pack — registry', () => {
  it('registers with namespace `recommendation` and tier `basic`', () => {
    expect(getPack('recommendation')?.namespace).toBe('recommendation');
    expect(recommendationPack.tier).toBe('basic');
  });
});

describe('recommendation pack — schema defaults + parse', () => {
  it('parses {} to related defaults, limit 4, fallback related, empty arrays', () => {
    const parsed = RecommendationPackSchema.parse({});
    expect(parsed.strategy).toBe('related');
    expect(parsed.productLimit).toBe(4);
    expect(parsed.fallback).toBe('related');
    expect(parsed.manualVariantGids).toEqual([]);
    expect(parsed.excludeTags).toEqual([]);
    expect(parsed.collectionRandom).toBe(false);
    expect(parsed.hideCartProducts).toBe(false);
  });

  it("strategy:'manual' with an empty variant list FAILS (superRefine)", () => {
    const r = RecommendationPackSchema.safeParse({ strategy: 'manual' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'manualVariantGids')).toBe(true);
    }
  });

  it("strategy:'manual' with one valid variant GID passes", () => {
    const r = RecommendationPackSchema.safeParse({ strategy: 'manual', manualVariantGids: [VARIANT] });
    expect(r.success).toBe(true);
  });

  it("strategy:'collection' without collectionGid FAILS; with it passes", () => {
    expect(RecommendationPackSchema.safeParse({ strategy: 'collection' }).success).toBe(false);
    expect(
      RecommendationPackSchema.safeParse({ strategy: 'collection', collectionGid: COLLECTION }).success,
    ).toBe(true);
  });

  it('rejects a non-GID manual variant (regex)', () => {
    expect(RecommendationPackSchema.safeParse({ strategy: 'manual', manualVariantGids: ['not-a-gid'] }).success).toBe(
      false,
    );
    // A Product GID is NOT a ProductVariant GID.
    expect(RecommendationPackSchema.safeParse({ strategy: 'manual', manualVariantGids: [PRODUCT] }).success).toBe(false);
  });

  it("fallback:'manual' with no manual products FAILS", () => {
    const r = RecommendationPackSchema.safeParse({ strategy: 'related', fallback: 'manual' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'fallback')).toBe(true);
  });

  it("fallback:'collection' with no collectionGid FAILS", () => {
    expect(RecommendationPackSchema.safeParse({ strategy: 'related', fallback: 'collection' }).success).toBe(false);
  });

  it("fallback:'hide' is always allowed (no requirement)", () => {
    expect(RecommendationPackSchema.safeParse({ strategy: 'top-sellers', fallback: 'hide' }).success).toBe(true);
  });

  it('productLimit bounds: 99 fails (max 12), 0 fails (min 1)', () => {
    expect(RecommendationPackSchema.safeParse({ productLimit: 99 }).success).toBe(false);
    expect(RecommendationPackSchema.safeParse({ productLimit: 0 }).success).toBe(false);
    expect(RecommendationPackSchema.safeParse({ productLimit: 12 }).success).toBe(true);
  });

  it('accepts a valid seedProductGid; rejects a non-Product GID seed', () => {
    expect(RecommendationPackSchema.safeParse({ strategy: 'related', seedProductGid: PRODUCT }).success).toBe(true);
    expect(RecommendationPackSchema.safeParse({ strategy: 'related', seedProductGid: VARIANT }).success).toBe(false);
  });
});

describe('recommendation pack — the resolver-class split invariant', () => {
  it('STATIC_RECOMMENDATION_STRATEGIES is a subset of RECOMMENDATION_STRATEGIES', () => {
    for (const s of STATIC_RECOMMENDATION_STRATEGIES) {
      expect(RECOMMENDATION_STRATEGIES).toContain(s);
    }
  });

  it('the DYNAMIC set is EXACTLY the full set minus the static set (4 strategies)', () => {
    const staticSet = new Set<string>(STATIC_RECOMMENDATION_STRATEGIES);
    const dynamic = RECOMMENDATION_STRATEGIES.filter((s) => !staticSet.has(s));
    expect(dynamic).toEqual(['top-sellers', 'trending', 'buy-it-again', 'recently-viewed']);
    // No overlap, no leftover.
    expect(dynamic.length + STATIC_RECOMMENDATION_STRATEGIES.length).toBe(RECOMMENDATION_STRATEGIES.length);
  });
});
