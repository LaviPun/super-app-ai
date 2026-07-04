import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema } from '@superapp/core';
import type { PricingPack } from '@superapp/core';
import { compileShippingDiscount } from '~/services/recipes/compiler/functions.shippingDiscount';
import { lowerPricingToShippingDiscount } from '~/services/recipes/compiler/pricing/lower';

type ShippingDiscountSpec = Extract<
  import('@superapp/core').RecipeSpec,
  { type: 'functions.shippingDiscount' }
>;

/** Parse a recipe through the union so defaults/refinements match the real path. */
function parseRecipe<T>(raw: unknown): T {
  return RecipeSpecSchema.parse(raw) as T;
}

/** Parse a bare pricing block through the union (on a shippingDiscount recipe) so defaults fill in. */
function parsePricing(pricing: unknown): PricingPack {
  const spec = parseRecipe<ShippingDiscountSpec>({
    type: 'functions.shippingDiscount',
    name: 'pricing fixture',
    config: { rules: [{ when: {}, apply: { shippingPercentage: 100 } }], pricing },
  });
  return spec.config.pricing!;
}

const upsertOp = (result: { ops: Array<Record<string, unknown>> }) =>
  result.ops.find((o) => o.kind === 'FUNCTION_CONFIG_UPSERT') as Record<string, unknown> | undefined;

const upsertConfig = (result: { ops: Array<Record<string, unknown>> }) =>
  upsertOp(result)?.config as Record<string, unknown>;

const auditActions = (result: { ops: Array<Record<string, unknown>> }) =>
  result.ops.filter((o) => o.kind === 'AUDIT').map((o) => o.action as string);

// ─── Recipe schema ───────────────────────────────────────────────────────────

describe('functions.shippingDiscount — recipe schema', () => {
  it('validates an explicit free-shipping rule through the union', () => {
    const r = RecipeSpecSchema.safeParse({
      type: 'functions.shippingDiscount',
      name: 'Free shipping over $50',
      config: {
        rules: [{ when: { minSubtotal: 50 }, apply: { shippingPercentage: 100 } }],
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a shippingPercentage above 100', () => {
    const r = RecipeSpecSchema.safeParse({
      type: 'functions.shippingDiscount',
      name: 'Bad',
      config: { rules: [{ when: {}, apply: { shippingPercentage: 150 } }] },
    });
    expect(r.success).toBe(false);
  });
});

// ─── Compiler: emits a REAL FUNCTION_CONFIG_UPSERT (not a bare AUDIT) ─────────

describe('compileShippingDiscount — real FUNCTION_CONFIG_UPSERT', () => {
  it('explicit rules → upserts config verbatim under functionKey shippingDiscount', () => {
    const spec = parseRecipe<ShippingDiscountSpec>({
      type: 'functions.shippingDiscount',
      name: 'Free shipping over $50',
      config: { rules: [{ when: { minSubtotal: 50 }, apply: { shippingPercentage: 100 } }] },
    });
    const result = compileShippingDiscount(spec);
    const op = upsertOp(result)!;
    expect(op.functionKey).toBe('shippingDiscount');
    // No pricing → config passed through byte-identically.
    expect(op.config).toEqual(spec.config);
    // Exactly one upsert + the base compile audit; no pricing audit.
    expect(result.ops.filter((o) => o.kind === 'FUNCTION_CONFIG_UPSERT')).toHaveLength(1);
    expect(auditActions(result)).toEqual(['compile.functions.shippingDiscount']);
    // Metaobject handle matches the crate's input-query handle.
    expect(result.compiledJson).toContain('superapp-fn-shippingDiscount');
  });

  it('config.pricing (single free-shipping) → lowered into config.rules; base + pricing audit', () => {
    const spec = parseRecipe<ShippingDiscountSpec>({
      type: 'functions.shippingDiscount',
      name: 'Free shipping over $75',
      config: {
        // A placeholder explicit rule that pricing supersedes.
        rules: [{ when: {}, apply: { shippingPercentage: 50 } }],
        pricing: {
          model: 'single',
          discount: { kind: 'free-shipping' },
          gate: { minSubtotal: 75 },
        },
      },
    });
    const result = compileShippingDiscount(spec);
    const config = upsertConfig(result);
    const rules = config.rules as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(1);
    expect((rules[0]!.when as Record<string, unknown>).minSubtotal).toBe(75);
    expect((rules[0]!.apply as Record<string, unknown>).shippingPercentage).toBe(100);
    expect(auditActions(result)).toContain('compile.functions.shippingDiscount.pricing.lowered');
    expect(auditActions(result)).toContain('compile.functions.shippingDiscount');
  });

  it('config.pricing tiered with a free-shipping tier → threshold becomes the rule gate', () => {
    const spec = parseRecipe<ShippingDiscountSpec>({
      type: 'functions.shippingDiscount',
      name: 'Tiered free shipping',
      config: {
        rules: [{ when: {}, apply: { shippingPercentage: 100 } }],
        pricing: {
          model: 'tiered',
          tiers: {
            basis: 'cart-value',
            rows: [
              { threshold: 100, discount: { kind: 'free-shipping' } },
              // A non-shipping tier is ignored by the shipping lowering.
              { threshold: 50, discount: { kind: 'percentage', value: 10 } },
            ],
          },
        },
      },
    });
    const result = compileShippingDiscount(spec);
    const rules = upsertConfig(result).rules as Array<Record<string, unknown>>;
    // Only the free-shipping tier lowers to a rule.
    expect(rules).toHaveLength(1);
    expect((rules[0]!.when as Record<string, unknown>).minSubtotal).toBe(100);
    expect((rules[0]!.apply as Record<string, unknown>).shippingPercentage).toBe(100);
  });

  it('pricing with NO free-shipping kind → zero rules + honesty warning AUDIT (never silently no-ops)', () => {
    const spec = parseRecipe<ShippingDiscountSpec>({
      type: 'functions.shippingDiscount',
      name: 'Mis-routed pricing',
      config: {
        rules: [{ when: {}, apply: { shippingPercentage: 100 } }],
        pricing: { model: 'single', discount: { kind: 'percentage', value: 20 } },
      },
    });
    const result = compileShippingDiscount(spec);
    const rules = upsertConfig(result).rules as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(0);
    expect(auditActions(result)).toContain('compile.functions.shippingDiscount.pricing.noShippingKind');
  });
});

// ─── Lowering: pricing → shipping-discount config ────────────────────────────

describe('lowerPricingToShippingDiscount', () => {
  it('single free-shipping with a subtotal gate → one 100% rule gated on minSubtotal', () => {
    const pricing = parsePricing({
      model: 'single',
      discount: { kind: 'free-shipping' },
      gate: { minSubtotal: 50 },
    });
    const lowered = lowerPricingToShippingDiscount(pricing);
    expect(lowered.rules).toEqual([
      { when: { minSubtotal: 50 }, apply: { shippingPercentage: 100 } },
    ]);
  });

  it('quantity-basis tiered free-shipping → threshold lowers to minQty', () => {
    const pricing = parsePricing({
      model: 'tiered',
      tiers: {
        basis: 'quantity',
        rows: [{ threshold: 3, discount: { kind: 'free-shipping' } }],
      },
    });
    const lowered = lowerPricingToShippingDiscount(pricing);
    expect(lowered.rules).toEqual([
      { when: { minQty: 3 }, apply: { shippingPercentage: 100 } },
    ]);
  });

  it('carries customer tags from the gate onto the rule', () => {
    const pricing = parsePricing({
      model: 'single',
      discount: { kind: 'free-shipping' },
      gate: { customerTags: ['vip'] },
    });
    const lowered = lowerPricingToShippingDiscount(pricing);
    expect(lowered.rules[0]!.when.customerTags).toEqual(['vip']);
  });

  it('a non-free-shipping pricing kind lowers to zero shipping rules', () => {
    const pricing = parsePricing({ model: 'single', discount: { kind: 'percentage', value: 20 } });
    expect(lowerPricingToShippingDiscount(pricing).rules).toEqual([]);
  });
});
