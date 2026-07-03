import { describe, it, expect } from 'vitest';
import {
  PricingPackSchema,
  DiscountSchema,
  pricingPack,
  getPack,
  DISCOUNT_KINDS,
  MECHANISMS,
} from '../control-packs/index.js';

/** The §2.5 load-bearing example: four tiers, four different discount kinds, one set. */
const MIXED_KINDS_TIERED = {
  model: 'tiered',
  mechanism: 'shopify-function-discount',
  tiers: {
    basis: 'quantity',
    rows: [
      { threshold: 2, discount: { kind: 'percentage', value: 10 }, title: 'Buy 2', subtitle: 'Save 10%' },
      { threshold: 3, discount: { kind: 'percentage', value: 20 }, title: 'Buy 3', badge: 'Most Popular', highlighted: true, preSelected: true },
      { threshold: 5, discount: { kind: 'cheapest-free', cheapestFreeCount: 1 }, title: 'Buy 5', subtitle: 'Cheapest free' },
      { threshold: 6, discount: { kind: 'fixed-price', value: 99.99 }, title: 'Buy 6', badge: 'Best Value' },
    ],
  },
  gate: { minQuantity: 2, prerequisiteCollectionIds: [] },
  stacking: {
    combinable: true,
    order: 'after',
    combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: false },
  },
} as const;

describe('pricing pack — registry', () => {
  it('registers with namespace `pricing` and tier `basic`', () => {
    expect(getPack('pricing')?.namespace).toBe('pricing');
    expect(pricingPack.tier).toBe('basic');
  });

  it('exposes the corpus discount kinds and mechanisms', () => {
    expect(DISCOUNT_KINDS).toContain('cheapest-free');
    expect(DISCOUNT_KINDS).toContain('fixed-price');
    expect(MECHANISMS).toContain('shopify-function-discount');
    expect(MECHANISMS).toContain('shopify-function-cart-transform');
  });
});

describe('pricing pack — schema (T-S1..T-S5)', () => {
  it('T-S1 accepts the mixed-kinds tiered example', () => {
    const parsed = PricingPackSchema.parse(MIXED_KINDS_TIERED);
    expect(parsed.model).toBe('tiered');
    const kinds = parsed.tiers!.rows.map((r) => r.discount.kind);
    expect(kinds).toEqual(['percentage', 'percentage', 'cheapest-free', 'fixed-price']);
  });

  it("T-S2 model:'single' without discount → ZodError at ['discount']", () => {
    const r = PricingPackSchema.safeParse({ model: 'single' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'discount')).toBe(true);
  });

  it("T-S3 two preSelected tiers → ZodError at ['tiers','rows']", () => {
    const r = PricingPackSchema.safeParse({
      model: 'tiered',
      tiers: {
        basis: 'quantity',
        rows: [
          { threshold: 2, discount: { kind: 'percentage', value: 10 }, preSelected: true },
          { threshold: 3, discount: { kind: 'percentage', value: 20 }, preSelected: true },
        ],
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'tiers.rows')).toBe(true);
  });

  it("T-S4 percentage value 150 → ZodError at ['value']", () => {
    const r = DiscountSchema.safeParse({ kind: 'percentage', value: 150 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'value')).toBe(true);
  });

  it('T-S5 defaults: omitted stacking → combinable true, order after, combinesWith all false', () => {
    const parsed = PricingPackSchema.parse({ model: 'single', discount: { kind: 'percentage', value: 10 } });
    expect(parsed.stacking).toEqual({
      combinable: true,
      order: 'after',
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    });
    // Gate defaults to an object with empty arrays.
    expect(parsed.gate.prerequisiteProductIds).toEqual([]);
    expect(parsed.gate.customerTags).toEqual([]);
  });

  it('rejects a non-GID prerequisite product id', () => {
    const r = PricingPackSchema.safeParse({
      model: 'single',
      discount: { kind: 'percentage', value: 10 },
      gate: { prerequisiteProductIds: ['12345'] },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid Product GID prerequisite', () => {
    const r = PricingPackSchema.safeParse({
      model: 'single',
      discount: { kind: 'percentage', value: 10 },
      gate: { prerequisiteProductIds: ['gid://shopify/Product/123'] },
    });
    expect(r.success).toBe(true);
  });

  it("bogo defaults get.discount to percentage:100 and showAsFree true", () => {
    const parsed = PricingPackSchema.parse({
      model: 'bogo',
      bogo: { buy: { quantity: 1 }, get: { quantity: 1 } },
    });
    expect(parsed.bogo!.showAsFree).toBe(true);
    expect(parsed.bogo!.get.discount).toMatchObject({ kind: 'percentage', value: 100 });
  });

  it("gift model requires the gift body", () => {
    expect(PricingPackSchema.safeParse({ model: 'gift' }).success).toBe(false);
    expect(
      PricingPackSchema.safeParse({
        model: 'gift',
        gift: { productIds: ['gid://shopify/Product/9'], threshold: 75 },
      }).success,
    ).toBe(true);
  });
});
