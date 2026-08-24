/**
 * The ONE plan-aware cart-transform activation sequence (WS-E Task 8 fix round 1),
 * extracted verbatim from BlueprintService.publishBlueprint's post-publish member
 * block so the single-module publish path (`PublishService.publishCartTransform`)
 * and the blueprint co-deploy path produce the same end state through the same
 * implementation:
 *
 *   1. plan lookup (`CapabilityService.getPlanTier`) — the plan drives the split;
 *   2. `splitBundlePricingForPlan`: Plus/Enterprise keep the lineUpdate-based
 *      fixed price in the cart-transform config; non-Plus shops get a merge-only
 *      config plus a managed discount rule (cart transform's per-unit lineUpdate
 *      is Plus-only);
 *   3. `activateCartTransform` with the plan-correct config → `$app:bundle_config`
 *      (the ONLY config the wasm reads);
 *   4. the managed-discount fallback leg: ensure the discount activation node when
 *      there is a rule to serve, then `writeBundlePricingRules` UNCONDITIONALLY —
 *      an empty rule set clears any stale managed rule left by a prior non-Plus
 *      publish (e.g. after upgrading to Plus or dropping the price).
 *
 * Ordering (2→3→4) preserves the blueprint path's proven semantics exactly.
 * Returns the CartTransform GID so the caller can record it for unpublish.
 */
import type { AdminApiContext } from '~/types/shopify';
import { BundleProductService, type ResolvedBundle } from './bundle-product.service';
import { splitBundlePricingForPlan } from './bundle-pricing-split';
import { CapabilityService } from '~/services/shopify/capability.service';
import { ActivationService } from '~/services/publish/activation.service';
import { MetaobjectService } from '~/services/shopify/metaobject.service';

export async function activateBundleCartTransformForPlan(
  admin: AdminApiContext['admin'],
  args: { shopId: string; shopDomain: string; bundles: ResolvedBundle[] },
): Promise<string> {
  const plan = await new CapabilityService().getPlanTier(args.shopDomain);
  const split = splitBundlePricingForPlan(args.bundles, plan);
  const bundleSvc = new BundleProductService(admin);
  const cartTransformGid = await bundleSvc.activateCartTransform(split.cartTransformConfig);
  if (split.bundleDiscountRules.length > 0) {
    await new ActivationService(admin, args.shopId).ensureForFunctionKey('discountRules');
  }
  // Unconditional: an empty rule set clears any stale managed rule left by a
  // prior non-Plus publish (e.g. after upgrading to Plus or dropping the price).
  await bundleSvc.writeBundlePricingRules(new MetaobjectService(admin), split.bundleDiscountRules);
  return cartTransformGid;
}
