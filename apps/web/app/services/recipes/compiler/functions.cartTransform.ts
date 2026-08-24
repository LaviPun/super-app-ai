import type { CompileResult, DeployOperation } from './types';
import type { RecipeSpec } from '@superapp/core';
import { lowerPricingToCartTransform } from './pricing/lower';

/**
 * Compile a cart-transform Function. When pricing is present (R2.2) — per-bundle
 * (`bundles[].pricing`) or root (`config.pricing`) — the compiler lowers it onto
 * the affected bundle(s), attaching a `price` (single) or `tiers[]` price table
 * (tiered) to the merged line so the discount survives to checkout. Per-bundle
 * pricing takes precedence over root pricing for that bundle. When no pricing is
 * present, bundles are emitted exactly as before (back-compat, byte-identical).
 */
export function compileCartTransform(spec: Extract<RecipeSpec, { type: 'functions.cartTransform' }>): CompileResult {
  const base = spec.config;
  const ops: DeployOperation[] = [];

  const rootPricing = base.pricing;
  const anyPricing = rootPricing || base.bundles.some((b) => b.pricing);

  let config: unknown = base;
  if (anyPricing) {
    const bundles = base.bundles.map((b) => {
      const effective = b.pricing ?? rootPricing;
      if (!effective) {
        return { title: b.title, componentSkus: [...b.componentSkus], bundleSku: b.bundleSku };
      }
      return lowerPricingToCartTransform(effective, b);
    });
    config = { ...base, bundles };
    ops.push({ kind: 'AUDIT', action: 'compile.functions.cartTransform.pricing.lowered' });
    // Mechanism sanity check: this is the cart-transform path.
    const wrongMechanism = [rootPricing, ...base.bundles.map((b) => b.pricing)].some(
      (p) => p?.mechanism === 'shopify-function-discount',
    );
    if (wrongMechanism) {
      ops.push({
        kind: 'AUDIT',
        action: 'compile.functions.cartTransform.mechanism.mismatch',
        details: `pricing.mechanism='shopify-function-discount' on a functions.cartTransform recipe; lowering to cart-transform pricing anyway`,
      });
    }
  }

  return {
    ops: [
      { kind: 'AUDIT', action: 'compile.functions.cartTransform' },
      ...ops,
    ],
    // WS-E: the wasm reads $app:bundle_config on the CartTransform object — the old
    // superapp-fn-cartTransform metaobject was a second config source it never read
    // and is no longer written. The lowered config rides compiledJson to the
    // publish-time bundle wiring (PublishService.publishCartTransform).
    compiledJson: JSON.stringify({ cartTransform: config }),
  };
}
