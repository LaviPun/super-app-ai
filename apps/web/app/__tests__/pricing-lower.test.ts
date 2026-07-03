import { describe, it, expect } from 'vitest';
import { PricingPackSchema } from '@superapp/core';
import {
  lowerPricingToDiscountRules,
  lowerPricingToCartTransform,
  pricingToStorefrontJson,
  discountToApply,
} from '~/services/recipes/compiler/pricing/lower';

const parse = (v: unknown) => PricingPackSchema.parse(v);

describe('pricing lowering → functions.discountRules (T-L1..T-L5)', () => {
  it('T-L1 single percentage → one rule, percentageOff, combineWithOtherDiscounts from stacking', () => {
    const pricing = parse({
      model: 'single',
      discount: { kind: 'percentage', value: 20 },
      gate: { minQuantity: 3 },
      stacking: { combinable: false },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.rules).toHaveLength(1);
    expect(lowered.rules[0]!.apply).toEqual({ percentageOff: 20 });
    expect(lowered.rules[0]!.when.minQty).toBe(3);
    expect(lowered.combineWithOtherDiscounts).toBe(false);
  });

  it('T-L2 tiered mixed kinds → 4 rules, highest-threshold-first, each apply matches its kind (FLAGSHIP)', () => {
    const pricing = parse({
      model: 'tiered',
      tiers: {
        basis: 'quantity',
        rows: [
          { threshold: 2, discount: { kind: 'percentage', value: 10 } },
          { threshold: 3, discount: { kind: 'percentage', value: 20 } },
          { threshold: 5, discount: { kind: 'cheapest-free', cheapestFreeCount: 1 } },
          { threshold: 6, discount: { kind: 'fixed-price', value: 99.99 } },
        ],
      },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.rules).toHaveLength(4);
    // Highest threshold first.
    expect(lowered.rules.map((r) => r.when.minQty)).toEqual([6, 5, 3, 2]);
    // Each apply matches its tier's own kind — mixed kinds survive in one set.
    expect(lowered.rules[0]!.apply).toEqual({ fixedPrice: 99.99 });
    expect(lowered.rules[1]!.apply).toEqual({ cheapestFree: 1 });
    expect(lowered.rules[2]!.apply).toEqual({ percentageOff: 20 });
    expect(lowered.rules[3]!.apply).toEqual({ percentageOff: 10 });
  });

  it('tiered on cart-value basis lowers thresholds to minSubtotal', () => {
    const pricing = parse({
      model: 'tiered',
      tiers: {
        basis: 'cart-value',
        rows: [
          { threshold: 50, discount: { kind: 'percentage', value: 5 } },
          { threshold: 100, discount: { kind: 'percentage', value: 10 } },
        ],
      },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.rules.map((r) => r.when.minSubtotal)).toEqual([100, 50]);
    expect(lowered.rules.every((r) => r.when.minQty === undefined)).toBe(true);
  });

  it("a 'none' tier is presentation-only and emits no enforcement rule", () => {
    const pricing = parse({
      model: 'tiered',
      tiers: {
        basis: 'quantity',
        rows: [
          { threshold: 1, discount: { kind: 'none' } },
          { threshold: 2, discount: { kind: 'percentage', value: 10 } },
        ],
      },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.rules).toHaveLength(1);
    expect(lowered.rules[0]!.apply).toEqual({ percentageOff: 10 });
  });

  it('T-L3 bogo showAsFree:true → buyXGetY.reward = percentageOff:100', () => {
    const pricing = parse({
      model: 'bogo',
      bogo: {
        buy: { productIds: ['gid://shopify/Product/1'], quantity: 1 },
        get: { productIds: ['gid://shopify/Product/2'], quantity: 1 },
        showAsFree: true,
      },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.rules).toHaveLength(1);
    expect(lowered.rules[0]!.apply.buyXGetY?.reward).toEqual({ percentageOff: 100 });
    expect(lowered.rules[0]!.apply.buyXGetY?.buyProductIds).toEqual(['gid://shopify/Product/1']);
    expect(lowered.rules[0]!.apply.buyXGetY?.getProductIds).toEqual(['gid://shopify/Product/2']);
  });

  it('bogo showAsFree:false → reward from get.discount', () => {
    const pricing = parse({
      model: 'bogo',
      bogo: {
        buy: { quantity: 2 },
        get: { quantity: 1, discount: { kind: 'percentage', value: 50 } },
        showAsFree: false,
      },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.rules[0]!.apply.buyXGetY?.reward).toEqual({ percentageOff: 50 });
  });

  it('T-L4 gift → apply.freeGift = { productIds, threshold, basis }', () => {
    const pricing = parse({
      model: 'gift',
      gift: { productIds: ['gid://shopify/Product/9'], threshold: 75, basis: 'cart-value' },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.rules).toHaveLength(1);
    expect(lowered.rules[0]!.apply.freeGift).toMatchObject({
      productIds: ['gid://shopify/Product/9'],
      threshold: 75,
      basis: 'cart-value',
    });
    expect(lowered.rules[0]!.when.minSubtotal).toBe(75);
  });

  it('T-L5 stacking.combinesWith.productDiscounts:true survives + discountApplication.order', () => {
    const pricing = parse({
      model: 'single',
      discount: { kind: 'percentage', value: 10 },
      stacking: {
        combinable: true,
        order: 'before',
        combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: false },
      },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.combinesWith.productDiscounts).toBe(true);
    expect(lowered.discountApplication.order).toBe('before');
  });

  it('priceEnding lowers onto apply', () => {
    const pricing = parse({
      model: 'single',
      discount: { kind: 'fixed-price', value: 100, priceEnding: 0.99 },
    });
    const lowered = lowerPricingToDiscountRules(pricing);
    expect(lowered.rules[0]!.apply).toMatchObject({ fixedPrice: 100, priceEnding: 0.99 });
  });

  it('discountToApply maps every kind deterministically', () => {
    expect(discountToApply({ kind: 'percentage', value: 15 } as never)).toEqual({ percentageOff: 15 });
    expect(discountToApply({ kind: 'fixed-amount', value: 5 } as never)).toEqual({ fixedAmountOff: 5 });
    expect(discountToApply({ kind: 'free-shipping', value: 0 } as never)).toEqual({ freeShipping: true });
    expect(discountToApply({ kind: 'cheapest-free', value: 0, cheapestFreeCount: 2 } as never)).toEqual({ cheapestFree: 2 });
  });
});

describe('pricing lowering → functions.cartTransform (T-L6)', () => {
  const bundle = { title: 'Trio', componentSkus: ['A', 'B', 'C'], bundleSku: 'TRIO' };

  it('T-L6 per-bundle tiered pricing → bundle carries a tiers[] price table', () => {
    const pricing = parse({
      model: 'tiered',
      mechanism: 'shopify-function-cart-transform',
      tiers: {
        basis: 'quantity',
        rows: [
          { threshold: 2, discount: { kind: 'percentage', value: 10 } },
          { threshold: 3, discount: { kind: 'fixed-price', value: 50 } },
        ],
      },
    });
    const lowered = lowerPricingToCartTransform(pricing, bundle);
    expect(lowered.title).toBe('Trio');
    expect(lowered.componentSkus).toEqual(['A', 'B', 'C']);
    expect(lowered.tiers).toBeDefined();
    // Highest threshold first.
    expect(lowered.tiers!.map((t) => t.threshold)).toEqual([3, 2]);
    expect(lowered.tiers![0]!).toMatchObject({ threshold: 3, kind: 'fixed-price', value: 50 });
  });

  it('single pricing → flat price on the merged line', () => {
    const pricing = parse({ model: 'single', mechanism: 'shopify-function-cart-transform', discount: { kind: 'fixed-price', value: 79.99 } });
    const lowered = lowerPricingToCartTransform(pricing, bundle);
    expect(lowered.price).toEqual({ kind: 'fixed-price', value: 79.99 });
    expect(lowered.tiers).toBeUndefined();
  });
});

describe('pricingToStorefrontJson (T-L7)', () => {
  it('T-L7 drops raw value math and emits displayDiscount strings', () => {
    const pricing = parse({
      model: 'tiered',
      tiers: {
        basis: 'quantity',
        rows: [
          { threshold: 2, discount: { kind: 'percentage', value: 20 }, title: 'Buy 2' },
          { threshold: 5, discount: { kind: 'cheapest-free', cheapestFreeCount: 1 }, title: 'Buy 5' },
          { threshold: 6, discount: { kind: 'fixed-price', value: 99.99 }, title: 'Buy 6' },
        ],
      },
    });
    const sf = pricingToStorefrontJson(pricing);
    expect(sf.model).toBe('tiered');
    expect(sf.basis).toBe('quantity');
    expect(sf.tiers!.map((t) => t.displayDiscount)).toEqual(['Save 20%', 'Cheapest free', '$99.99']);
    // No raw numeric `value` leaks into the storefront payload.
    for (const t of sf.tiers!) {
      expect(t).not.toHaveProperty('value');
      expect(t).not.toHaveProperty('discount');
    }
  });

  it('non-tiered models emit just the model tag', () => {
    const pricing = parse({ model: 'single', discount: { kind: 'percentage', value: 10 } });
    expect(pricingToStorefrontJson(pricing)).toEqual({ model: 'single' });
  });
});
