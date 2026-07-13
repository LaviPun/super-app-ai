/**
 * Plan-aware bundle pricing split (Basic-plan fallback — the "NERD pattern").
 *
 * Cart Transform's `lineUpdate` operation (the only channel that can set an
 * absolute per-unit price on a line) runs ONLY on dev stores and Shopify Plus
 * (shopify.dev/docs/api/functions/latest/cart-transform). `linesMerge` and the
 * discount Function run on every plan. So on non-Plus shops a `fixed-price`
 * bundle is expressed as: merge-only cart-transform config (presentation) plus a
 * companion discount rule that reduces the merged parent line — targeted by the
 * parent variant's SKU — to `fixedPricePerUnit × quantity` at pricing time.
 * Cart transform runs before discount functions, so the discount sees the merged
 * line. Percentage bundles are untouched (merge `percentageDecrease` is
 * plan-universal). Tiered fixed-price stays Plus-only: post-merge quantity does
 * not reflect component count, so tier gates cannot be evaluated faithfully.
 */
import type { PlanTier } from '@superapp/core';
import type { BundleFunctionConfig, ResolvedBundle } from './bundle-product.service';
import { buildBundleRuntimeConfig } from './bundle-product.service';

export type BundlePricingRule = {
  /** Managed-rule key ("bundle:<bundleId>"); ignored by the wasm (serde drops it). */
  id: string;
  when: { skuIn: string[] };
  apply: { fixedPricePerUnit: number };
};

export type BundlePricingSplit = {
  cartTransformConfig: BundleFunctionConfig;
  bundleDiscountRules: BundlePricingRule[];
};

export function splitBundlePricingForPlan(
  bundles: ResolvedBundle[],
  plan: PlanTier,
): BundlePricingSplit {
  if (plan === 'PLUS' || plan === 'ENTERPRISE') {
    return { cartTransformConfig: buildBundleRuntimeConfig(bundles), bundleDiscountRules: [] };
  }

  const rules: BundlePricingRule[] = [];
  const rewritten = bundles.map((b) => {
    const isSingleFixedPrice =
      b.price?.kind === 'fixed-price' && (b.price.value ?? 0) > 0 && !(b.tiers && b.tiers.length);
    if (!isSingleFixedPrice || !b.bundleSku) return b;
    rules.push({
      id: `bundle:${b.bundleId}`,
      when: { skuIn: [b.bundleSku] },
      apply: { fixedPricePerUnit: b.price!.value },
    });
    // Strip the fixed price so the wasm takes the merge path (no lineUpdate).
    return { ...b, price: undefined };
  });

  return { cartTransformConfig: buildBundleRuntimeConfig(rewritten), bundleDiscountRules: rules };
}
