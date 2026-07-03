import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema } from '@superapp/core';
import { compileDiscountRules } from '~/services/recipes/compiler/functions.discountRules';
import { compileCartTransform } from '~/services/recipes/compiler/functions.cartTransform';

type DiscountRulesSpec = Extract<import('@superapp/core').RecipeSpec, { type: 'functions.discountRules' }>;
type CartTransformSpec = Extract<import('@superapp/core').RecipeSpec, { type: 'functions.cartTransform' }>;

/** Parse a recipe through the union so defaults/refinements match the real path. */
function parseRecipe<T>(raw: unknown): T {
  return RecipeSpecSchema.parse(raw) as T;
}

const upsertConfig = (result: { ops: Array<Record<string, unknown>> }) =>
  result.ops.find((o) => o.kind === 'FUNCTION_CONFIG_UPSERT')?.config as Record<string, unknown>;

const auditActions = (result: { ops: Array<Record<string, unknown>> }) =>
  result.ops.filter((o) => o.kind === 'AUDIT').map((o) => o.action as string);

// ─── T-C1 / T-C2 — pricing integration ───────────────────────────────────────

describe('compileDiscountRules — pricing lowering (T-C1)', () => {
  it('T-C1 config.pricing → upserted config.rules equals lowered rules; still one base AUDIT', () => {
    const spec = parseRecipe<DiscountRulesSpec>({
      type: 'functions.discountRules',
      name: 'Volume discount',
      config: {
        rules: [{ when: {}, apply: { percentageOff: 5 } }], // legacy coexists but is superseded
        pricing: {
          model: 'tiered',
          tiers: {
            basis: 'quantity',
            rows: [
              { threshold: 2, discount: { kind: 'percentage', value: 10 } },
              { threshold: 3, discount: { kind: 'fixed-price', value: 50 } },
            ],
          },
        },
      },
    });
    const result = compileDiscountRules(spec);
    const config = upsertConfig(result);
    const rules = config.rules as Array<Record<string, unknown>>;
    // Derived from pricing (highest-threshold-first), NOT the legacy single rule.
    expect(rules).toHaveLength(2);
    expect((rules[0]!.when as Record<string, unknown>).minQty).toBe(3);
    expect((rules[0]!.apply as Record<string, unknown>).fixedPrice).toBe(50);
    // combinesWith / discountApplication attached.
    expect(config.combinesWith).toBeDefined();
    expect(config.discountApplication).toEqual({ order: 'after' });
    // Exactly one FUNCTION_CONFIG_UPSERT.
    expect(result.ops.filter((o) => o.kind === 'FUNCTION_CONFIG_UPSERT')).toHaveLength(1);
    // The base compile audit is present alongside the pricing audit.
    expect(auditActions(result)).toContain('compile.functions.discountRules');
    expect(auditActions(result)).toContain('compile.functions.discountRules.pricing.lowered');
  });

  it('free-shipping discount kind → unenforced-kind warning AUDIT (never silently no-ops)', () => {
    const spec = parseRecipe<DiscountRulesSpec>({
      type: 'functions.discountRules',
      name: 'Free shipping over $50',
      config: {
        rules: [{ when: {}, apply: { percentageOff: 5 } }],
        pricing: {
          model: 'single',
          discount: { kind: 'free-shipping' },
          gate: { minSubtotal: 50 },
        },
      },
    });
    const result = compileDiscountRules(spec);
    const actions = auditActions(result);
    expect(actions).toContain('compile.functions.discountRules.kind.unenforced');
    const warning = result.ops.find(
      (o) => o.kind === 'AUDIT' && o.action === 'compile.functions.discountRules.kind.unenforced',
    ) as Record<string, unknown> | undefined;
    expect(warning?.details as string).toMatch(/free-shipping/);
    // Still compiles to exactly one upsert.
    expect(result.ops.filter((o) => o.kind === 'FUNCTION_CONFIG_UPSERT')).toHaveLength(1);
  });

  it('priceEnding rounding hint → unenforced-kind warning AUDIT', () => {
    const spec = parseRecipe<DiscountRulesSpec>({
      type: 'functions.discountRules',
      name: 'Charm pricing',
      config: {
        rules: [{ when: {}, apply: { percentageOff: 5 } }],
        pricing: {
          model: 'single',
          discount: { kind: 'fixed-price', value: 100, priceEnding: 0.99 },
        },
      },
    });
    const result = compileDiscountRules(spec);
    const warning = result.ops.find(
      (o) => o.kind === 'AUDIT' && o.action === 'compile.functions.discountRules.kind.unenforced',
    ) as Record<string, unknown> | undefined;
    expect(warning).toBeDefined();
    expect(warning?.details as string).toMatch(/priceEnding/);
  });

  it('free-gift kind does NOT warn (it is enforced via the co-emitted buyXGetY path)', () => {
    const spec = parseRecipe<DiscountRulesSpec>({
      type: 'functions.discountRules',
      name: 'Gift over $75',
      config: {
        rules: [{ when: {}, apply: { percentageOff: 5 } }],
        pricing: {
          model: 'gift',
          gift: { productIds: ['gid://shopify/Product/9'], threshold: 75, basis: 'cart-value' },
        },
      },
    });
    const result = compileDiscountRules(spec);
    expect(auditActions(result)).not.toContain('compile.functions.discountRules.kind.unenforced');
    // And the enforceable buyXGetY reached the upserted config.
    const config = upsertConfig(result);
    const rules = config.rules as Array<Record<string, unknown>>;
    const apply = rules[0]!.apply as Record<string, unknown>;
    expect(apply.buyXGetY).toBeDefined();
  });

  it('T-C2 mechanism mismatch (cart-transform mechanism on discount recipe) → warning AUDIT, still compiles', () => {
    const spec = parseRecipe<DiscountRulesSpec>({
      type: 'functions.discountRules',
      name: 'Mismatch',
      config: {
        rules: [{ when: {}, apply: { percentageOff: 5 } }],
        pricing: {
          model: 'single',
          mechanism: 'shopify-function-cart-transform',
          discount: { kind: 'percentage', value: 10 },
        },
      },
    });
    const result = compileDiscountRules(spec);
    expect(auditActions(result)).toContain('compile.functions.discountRules.mechanism.mismatch');
    // Still produces a valid single upsert.
    expect(result.ops.filter((o) => o.kind === 'FUNCTION_CONFIG_UPSERT')).toHaveLength(1);
  });
});

describe('compileCartTransform — pricing lowering', () => {
  it('per-bundle pricing → bundle carries a tiers[] table', () => {
    const spec = parseRecipe<CartTransformSpec>({
      type: 'functions.cartTransform',
      name: 'Bundle',
      config: {
        bundles: [
          {
            title: 'Trio',
            componentSkus: ['A', 'B', 'C'],
            bundleSku: 'TRIO',
            pricing: {
              model: 'tiered',
              mechanism: 'shopify-function-cart-transform',
              tiers: {
                basis: 'quantity',
                rows: [
                  { threshold: 2, discount: { kind: 'percentage', value: 10 } },
                  { threshold: 3, discount: { kind: 'fixed-price', value: 50 } },
                ],
              },
            },
          },
        ],
      },
    });
    const result = compileCartTransform(spec);
    const config = upsertConfig(result);
    const bundle = (config.bundles as Array<Record<string, unknown>>)[0]!;
    expect(bundle.tiers).toBeDefined();
    expect((bundle.tiers as Array<Record<string, unknown>>).map((t) => t.threshold)).toEqual([3, 2]);
    expect(auditActions(result)).toContain('compile.functions.cartTransform.pricing.lowered');
  });
});

// ─── T-BC1 / T-BC2 — back-compat: legacy recipes emit byte-identical config ───

describe('back-compat — legacy configs emit byte-identical metaobject (T-BC1/T-BC2)', () => {
  it('T-BC1 legacy discountRules (rules[], no pricing) → upserted config deep-equals input config', () => {
    const spec = parseRecipe<DiscountRulesSpec>({
      type: 'functions.discountRules',
      name: 'Legacy',
      config: {
        rules: [
          { when: { customerTags: ['vip'], minSubtotal: 100 }, apply: { percentageOff: 15 } },
        ],
        combineWithOtherDiscounts: false,
      },
    });
    const result = compileDiscountRules(spec);
    const config = upsertConfig(result);
    // The compiler passes the config through verbatim when pricing is absent.
    expect(config).toEqual(spec.config);
    // No pricing audit was emitted.
    expect(auditActions(result)).toEqual(['compile.functions.discountRules']);
  });

  it('T-BC2 legacy cartTransform (bundles[], no pricing) → bundles emitted unchanged', () => {
    const spec = parseRecipe<CartTransformSpec>({
      type: 'functions.cartTransform',
      name: 'Legacy bundle',
      config: {
        bundles: [{ title: 'Combo', componentSkus: ['X', 'Y'], bundleSku: 'COMBO' }],
      },
    });
    const result = compileCartTransform(spec);
    const config = upsertConfig(result);
    expect(config).toEqual(spec.config);
    expect(auditActions(result)).toEqual(['compile.functions.cartTransform']);
  });

  it('legacy discountRules recipe still validates through the union', () => {
    const r = RecipeSpecSchema.safeParse({
      type: 'functions.discountRules',
      name: 'Legacy validate',
      config: { rules: [{ when: {}, apply: { fixedAmountOff: 5 } }] },
    });
    expect(r.success).toBe(true);
  });
});
