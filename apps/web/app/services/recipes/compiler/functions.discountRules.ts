import type { CompileResult, DeployOperation } from './types';
import type { RecipeSpec } from '@superapp/core';
import { lowerPricingToDiscountRules, type LoweredRule } from './pricing/lower';

/**
 * Kinds the shipped discount Function cannot enforce, detected on the lowered
 * rules so the compiler can emit an honest warning AUDIT instead of a silent
 * no-op (discount-packs.md §9). Returns a de-duplicated, stable-ordered list.
 * `free-gift` is intentionally NOT here: it is enforced via the co-emitted
 * `buyXGetY` 100%-off path.
 */
function collectUnenforcedKinds(rules: LoweredRule[]): Array<'free-shipping' | 'priceEnding'> {
  let hasFreeShipping = false;
  let hasPriceEnding = false;
  for (const rule of rules) {
    if (rule.apply.freeShipping === true) hasFreeShipping = true;
    if (rule.apply.priceEnding != null) hasPriceEnding = true;
  }
  const out: Array<'free-shipping' | 'priceEnding'> = [];
  if (hasFreeShipping) out.push('free-shipping');
  if (hasPriceEnding) out.push('priceEnding');
  return out;
}

/**
 * Compile a discount-rules Function. When `config.pricing` is present (R2.2) it is
 * AUTHORITATIVE: the compiler deterministically lowers it into the shipped
 * Function config shape (`rules`/`combinesWith`/`discountApplication`), so the
 * rich pricing vocabulary survives to the `$app:superapp_function_config`
 * metaobject the live wasm Function reads. When absent the original `config` is
 * emitted byte-for-byte (legacy `rules[]` path untouched — back-compat).
 */
export function compileDiscountRules(spec: Extract<RecipeSpec, { type: 'functions.discountRules' }>): CompileResult {
  const base = spec.config;
  const ops: DeployOperation[] = [];

  let config: unknown = base;
  if (base.pricing) {
    const lowered = lowerPricingToDiscountRules(base.pricing);
    // pricing wins: it DERIVES rules + combineWithOtherDiscounts, and attaches the
    // additive combinesWith / discountApplication. The original `pricing` block is
    // kept in the emitted config so preview/render can read the presentation half.
    config = {
      ...base,
      rules: lowered.rules,
      combineWithOtherDiscounts: lowered.combineWithOtherDiscounts,
      combinesWith: lowered.combinesWith,
      discountApplication: lowered.discountApplication,
    };
    ops.push({ kind: 'AUDIT', action: 'compile.functions.discountRules.pricing.lowered' });
    // Mechanism sanity check: this compiler is the discount-Function path. A
    // pricing block that asks for cart-transform is a soft warning, not a failure.
    if (base.pricing.mechanism === 'shopify-function-cart-transform') {
      ops.push({
        kind: 'AUDIT',
        action: 'compile.functions.discountRules.mechanism.mismatch',
        details: `pricing.mechanism='${base.pricing.mechanism}' on a functions.discountRules recipe; lowering to discount rules anyway`,
      });
    }
    // Honesty guards (R2.2 close-out, discount-packs.md §9): the discount Function
    // target CANNOT enforce free-shipping (needs a SHIPPING_DISCOUNT crate) or
    // priceEnding (post-calc rounding is not a candidate value). Emit an
    // unenforced-kind warning AUDIT so publishing never SILENTLY no-ops for a kind
    // the merchant authored. free-gift is enforced via the co-emitted buyXGetY
    // 100%-off path, so it does NOT warn here.
    const unenforced = collectUnenforcedKinds(lowered.rules);
    for (const kind of unenforced) {
      ops.push({
        kind: 'AUDIT',
        action: 'compile.functions.discountRules.kind.unenforced',
        details:
          kind === 'free-shipping'
            ? "pricing emits a 'free-shipping' discount, but the shipped discount Function (cart.lines.discounts.generate.run) has no shipping operation; it requires a cart.delivery-options.transform.run SHIPPING_DISCOUNT crate (not shipped). This kind does NOT price at checkout yet — see discount-packs.md §9."
            : "pricing emits a 'priceEnding' rounding hint, but post-calc x.99 rounding is not expressible as a discount candidate value; the only Function path is a Plus-only cart-transform fixedPricePerUnit. This hint does NOT round the checkout price — see discount-packs.md §9.",
      });
    }
  }

  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'discountRules', config },
      { kind: 'AUDIT', action: 'compile.functions.discountRules' },
      ...ops,
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-discountRules' }),
  };
}
