import type { CompileResult, DeployOperation } from './types';
import type { RecipeSpec } from '@superapp/core';
import { lowerPricingToDiscountRules } from './pricing/lower';

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
