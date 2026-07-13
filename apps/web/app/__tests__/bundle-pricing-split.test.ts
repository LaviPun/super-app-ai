import { describe, expect, it } from 'vitest';
import { splitBundlePricingForPlan } from '~/services/bundles/bundle-pricing-split';
import type { ResolvedBundle } from '~/services/bundles/bundle-product.service';

const fixedPriceBundle: ResolvedBundle = {
  bundleId: 'candle-trio',
  title: 'Candle Trio',
  parentVariantId: 'gid://shopify/ProductVariant/1',
  bundleSku: 'BUNDLE-CANDLE',
  discountPercentage: 0,
  components: [],
  price: { kind: 'fixed-price', value: 27 },
};

const percentageBundle: ResolvedBundle = {
  bundleId: 'soap-duo',
  title: 'Soap Duo',
  parentVariantId: 'gid://shopify/ProductVariant/2',
  bundleSku: 'BUNDLE-SOAP',
  discountPercentage: 0,
  components: [],
  price: { kind: 'percentage', value: 10 },
};

describe('splitBundlePricingForPlan', () => {
  it('PLUS keeps fixed-price on the cart transform, no discount rules', () => {
    const s = splitBundlePricingForPlan([fixedPriceBundle], 'PLUS');
    expect(s.cartTransformConfig.bundles[0]!.price).toEqual({ kind: 'fixed-price', value: 27 });
    expect(s.bundleDiscountRules).toEqual([]);
  });

  it('BASIC strips fixed-price from cart transform and emits a keyed discount rule', () => {
    const s = splitBundlePricingForPlan([fixedPriceBundle], 'BASIC');
    expect(s.cartTransformConfig.bundles[0]!.price).toBeUndefined();
    expect(s.bundleDiscountRules).toEqual([
      {
        id: 'bundle:candle-trio',
        when: { skuIn: ['BUNDLE-CANDLE'] },
        apply: { fixedPricePerUnit: 27 },
      },
    ]);
  });

  it('UNKNOWN plan is treated as non-Plus', () => {
    const s = splitBundlePricingForPlan([fixedPriceBundle], 'UNKNOWN');
    expect(s.bundleDiscountRules).toHaveLength(1);
  });

  it('percentage bundles are untouched on every plan (merge pricing works everywhere)', () => {
    for (const plan of ['BASIC', 'PLUS', 'UNKNOWN'] as const) {
      const s = splitBundlePricingForPlan([percentageBundle], plan);
      expect(s.cartTransformConfig.bundles[0]!.price).toEqual({ kind: 'percentage', value: 10 });
      expect(s.bundleDiscountRules).toEqual([]);
    }
  });

  it('fixed-price bundle without a bundleSku on non-Plus emits no rule (cannot target) and keeps lineUpdate config', () => {
    const noSku = { ...fixedPriceBundle, bundleSku: undefined };
    const s = splitBundlePricingForPlan([noSku], 'BASIC');
    // Honest degradation: without a SKU to target we leave behavior as-is
    // rather than silently mispricing.
    expect(s.cartTransformConfig.bundles[0]!.price).toEqual({ kind: 'fixed-price', value: 27 });
    expect(s.bundleDiscountRules).toEqual([]);
  });

  it('tiered fixed-price bundles are left unchanged on non-Plus (documented gap)', () => {
    const tiered: ResolvedBundle = {
      ...fixedPriceBundle,
      price: undefined,
      tiers: [{ threshold: 2, kind: 'fixed-price', value: 25 }],
    };
    const s = splitBundlePricingForPlan([tiered], 'BASIC');
    expect(s.cartTransformConfig.bundles[0]!.tiers).toHaveLength(1);
    expect(s.bundleDiscountRules).toEqual([]);
  });
});
