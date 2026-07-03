import type { CompileResult, DeployOperation } from './types';
import type { RecipeSpec } from '@superapp/core';
import { lowerPricingToShippingDiscount } from './pricing/lower';

/**
 * Compile a shipping-discount Function (unified Discount API, SHIPPING class). This is the
 * runtime the product-discount Function CANNOT provide: `cart.lines.discounts.generate.run`
 * has no shipping operation, so `free-shipping` is only ever enforced on THIS target
 * (`cart.delivery-options.discounts.generate.run`, backed by
 * extensions/superapp-shipping-discount). See discount-packs.md §9.2.
 *
 * Emits a REAL `FUNCTION_CONFIG_UPSERT` (functionKey `shippingDiscount`), so the config
 * reaches the `$app:superapp_function_config` metaobject (handle `superapp-fn-shippingDiscount`)
 * the live wasm Function reads — not a bare AUDIT.
 *
 * When `config.pricing` is present (R2.2) it is AUTHORITATIVE: the compiler lowers a
 * `free-shipping` (or discounted-delivery) pricing block into the Function's `rules[]`
 * config via `lowerPricingToShippingDiscount`. When absent, the explicit `rules[]` are
 * emitted byte-for-byte.
 */
export function compileShippingDiscount(
  spec: Extract<RecipeSpec, { type: 'functions.shippingDiscount' }>,
): CompileResult {
  const base = spec.config;
  const ops: DeployOperation[] = [];

  let config: unknown = base;
  if (base.pricing) {
    const lowered = lowerPricingToShippingDiscount(base.pricing);
    // pricing wins: it DERIVES `rules`. Keep the `pricing` block in the emitted config so
    // preview/render can read the presentation half.
    config = { ...base, rules: lowered.rules };
    ops.push({ kind: 'AUDIT', action: 'compile.functions.shippingDiscount.pricing.lowered' });
    // Honesty guard: a pricing block routed to the shipping-discount Function that carries
    // NO free-shipping kind lowers to zero rules — the Function would deploy an empty,
    // no-op config. Surface it so publishing never silently no-ops.
    if (lowered.rules.length === 0) {
      ops.push({
        kind: 'AUDIT',
        action: 'compile.functions.shippingDiscount.pricing.noShippingKind',
        details:
          "pricing has no 'free-shipping' discount kind, so the shipping-discount Function lowered to zero rules; it will not waive shipping. Use kind:'free-shipping' (or explicit config.rules) for this type.",
      });
    }
  }

  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'shippingDiscount', config },
      { kind: 'AUDIT', action: 'compile.functions.shippingDiscount' },
      ...ops,
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-shippingDiscount' }),
  };
}
