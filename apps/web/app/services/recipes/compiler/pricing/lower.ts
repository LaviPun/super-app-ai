/**
 * Pricing lowering (R2.2) — the deterministic translation layer that connects the
 * merchant-facing `pricing` vocabulary (packages/core/.../pricing.pack.ts) to the
 * ALREADY-SHIPPED Function config shapes that `functions.discountRules` /
 * `functions.cartTransform` publish via `FUNCTION_CONFIG_UPSERT`.
 *
 * Pure + no I/O: nothing here calls Shopify. It produces the same
 * `config` object `PublishService` already writes to the
 * `$app:superapp_function_config` metaobject the live wasm Functions read.
 *
 * Design notes:
 * - `percentage` / `fixed-amount` lower to the LEGACY `apply` keys
 *   (`percentageOff` / `fixedAmountOff`) the shipped wasm handler already reads,
 *   so those work at checkout immediately.
 * - `fixed-price` / `cheapest-free` / `free-shipping` / `buyXGetY` / `freeGift`
 *   lower to NEW additive `apply` keys. The handler ignores unknown keys today, so
 *   emitting them is ship-safe; they become real at checkout once the wasm crate
 *   learns them (fast-follow — see discount-packs.md §5.5 / plan X-6).
 * - Tiered lowering emits ONE rule per tier row, HIGHEST-THRESHOLD-FIRST, so a
 *   first-match handler picks the best qualifying tier. Each tier lowers
 *   independently — this is exactly how MIXED KINDS in one set survive.
 */
import type { PricingPack, Discount } from '@superapp/core';

// ─── Lowered wire types (the Function config contract) ───────────────────────

/** `apply` fragment — legacy keys + additive new keys. Superset of the shipped shape. */
export interface LoweredApply {
  percentageOff?: number;
  fixedAmountOff?: number;
  /** New: final price the applicable set is sold for. */
  fixedPrice?: number;
  /** New: N cheapest applicable lines become free. */
  cheapestFree?: number;
  /** New: waive shipping. */
  freeShipping?: boolean;
  /** New: Buy-X-Get-Y reward on the "get" arm. */
  buyXGetY?: {
    buyQty: number;
    buyProductIds: string[];
    buyCollectionIds: string[];
    getQty: number;
    getProductIds: string[];
    getCollectionIds: string[];
    reward: LoweredApply;
  };
  /**
   * New: gift-with-purchase — the presentation/auto-add half. The storefront reads
   * this to auto-add (or offer) the gift line; the shipped discount handler does NOT
   * parse `freeGift`, so the CHECKOUT-side "make the gift free" is carried by the
   * co-emitted `buyXGetY` fragment below (get arm = gift products @ 100% off). See
   * lower.ts §free-gift note and discount-packs.md §9.
   */
  freeGift?: {
    productIds: string[];
    threshold: number;
    basis: 'quantity' | 'cart-value';
    selectable: boolean;
    autoAdd: boolean;
  };
  /** New: post-calc rounding hint (round discounted price DOWN to nearest x.<ending>). */
  priceEnding?: number;
}

/** `when` fragment — mirrors the legacy `when` shape + new min-qty / prerequisites. */
export interface LoweredWhen {
  customerTags?: string[];
  minSubtotal?: number;
  /** New: minimum item quantity (legacy only had minSubtotal). */
  minQty?: number;
  /** New: prerequisite products/collections (Spring-26 BXGY). */
  prerequisiteProductIds?: string[];
  prerequisiteCollectionIds?: string[];
}

export interface LoweredRule {
  when: LoweredWhen;
  apply: LoweredApply;
}

export interface LoweredCombinesWith {
  orderDiscounts: boolean;
  productDiscounts: boolean;
  shippingDiscounts: boolean;
}

export interface LoweredDiscountRules {
  rules: LoweredRule[];
  /** Legacy top-level boolean kept populated for back-compat with the shipped shape. */
  combineWithOtherDiscounts: boolean;
  /** New: fine-grained discount-class stacking. */
  combinesWith: LoweredCombinesWith;
  /** New: apply before/after other discounts. */
  discountApplication: { order: 'before' | 'after' };
}

// ─── Discount-kind → apply mapping ───────────────────────────────────────────

/** Map one `Discount` primitive to a Function `apply` fragment. */
export function discountToApply(d: Discount): LoweredApply {
  const apply: LoweredApply = {};
  switch (d.kind) {
    case 'percentage':
      apply.percentageOff = d.value;
      break;
    case 'fixed-amount':
      apply.fixedAmountOff = d.value;
      break;
    case 'fixed-price':
      apply.fixedPrice = d.value;
      break;
    case 'cheapest-free':
      apply.cheapestFree = d.cheapestFreeCount ?? 1;
      break;
    case 'free-shipping':
      apply.freeShipping = true;
      break;
    case 'free-gift':
    case 'none':
      // free-gift is materialized via apply.freeGift on the gift model; `none`
      // is a presentation-only tier (no price change). Both emit an empty apply.
      break;
  }
  if (d.priceEnding != null) apply.priceEnding = d.priceEnding;
  return apply;
}

/** `apply` has no price-changing key (presentation-only / `none` tier). */
function isEmptyApply(a: LoweredApply): boolean {
  return Object.keys(a).length === 0;
}

/**
 * free-gift → the ENFORCEABLE half. A gift-with-purchase is, at checkout, "once the
 * cart qualifies, make the gift line 100% off". The shipped discount handler cannot
 * parse `apply.freeGift`, but it DOES enforce `apply.buyXGetY` with a 100%-off reward
 * on the get arm. So we co-emit a `buyXGetY` fragment whose GET arm is the gift
 * product(s) at 100% off and whose BUY arm is EMPTY — the threshold gate
 * (`when.minQty`/`when.minSubtotal`, set from the gift's threshold) is what qualifies
 * the cart, so no specific buy product is required. The handler treats an empty buy
 * arm as "gate already qualified" (see cart_lines_discounts_generate_run.rs
 * `decide_bxgy`), frees the gift line, and attaches no prerequisites.
 *
 * Remaining gap (documented, NOT a Function concern): the handler can only discount a
 * gift line that is ALREADY in the cart. Auto-ADDING the gift line is a storefront
 * (theme/JS/Ajax-cart) concern driven by `apply.freeGift.autoAdd`; see
 * discount-packs.md §9. When `selectable` is true the shopper picks among gift
 * products — the get arm lists all candidate ids so whichever the shopper adds is
 * freed.
 */
function giftToBuyXGetY(productIds: string[]): NonNullable<LoweredApply['buyXGetY']> {
  return {
    buyQty: 0,
    buyProductIds: [],
    buyCollectionIds: [],
    getQty: 1,
    getProductIds: [...productIds],
    getCollectionIds: [],
    reward: { percentageOff: 100 },
  };
}

// ─── gate → when ─────────────────────────────────────────────────────────────

function gateToWhen(gate: PricingPack['gate'], thresholdOverride?: { minQty?: number; minSubtotal?: number }): LoweredWhen {
  const when: LoweredWhen = {};
  const minQty = thresholdOverride?.minQty ?? gate.minQuantity;
  const minSubtotal = thresholdOverride?.minSubtotal ?? gate.minSubtotal;
  if (minQty != null) when.minQty = minQty;
  if (minSubtotal != null) when.minSubtotal = minSubtotal;
  if (gate.customerTags.length > 0) when.customerTags = [...gate.customerTags];
  if (gate.prerequisiteProductIds.length > 0) when.prerequisiteProductIds = [...gate.prerequisiteProductIds];
  if (gate.prerequisiteCollectionIds.length > 0)
    when.prerequisiteCollectionIds = [...gate.prerequisiteCollectionIds];
  return when;
}

// ─── pricing → functions.discountRules ───────────────────────────────────────

/**
 * Lower a `pricing` block to the shipped `functions.discountRules` config shape.
 * `pricing` is authoritative — the caller uses this to DERIVE `rules`, so even if
 * a legacy `rules[]` coexists, output is deterministic.
 */
export function lowerPricingToDiscountRules(pricing: PricingPack): LoweredDiscountRules {
  const rules: LoweredRule[] = [];

  switch (pricing.model) {
    case 'single': {
      const apply = pricing.discount ? discountToApply(pricing.discount) : {};
      rules.push({ when: gateToWhen(pricing.gate), apply });
      break;
    }
    case 'tiered': {
      const tiers = pricing.tiers;
      if (tiers) {
        // Highest-threshold-first so a first-match handler picks the best tier.
        const rows = [...tiers.rows].sort((a, b) => b.threshold - a.threshold);
        for (const row of rows) {
          const apply = discountToApply(row.discount);
          // `none`/free-gift-only rows are presentation-only → skip the enforcement rule.
          if (isEmptyApply(apply) && !row.gift) continue;
          if (row.gift) {
            apply.freeGift = {
              productIds: [row.gift.productId],
              threshold: row.threshold,
              basis: tiers.basis,
              selectable: false,
              autoAdd: true,
            };
            // Enforceable half: free the gift line at checkout via the BXGY
            // 100%-off path the handler already runs (empty buy arm = gate-qualified).
            apply.buyXGetY = giftToBuyXGetY([row.gift.productId]);
          }
          const thresholdOverride =
            tiers.basis === 'quantity'
              ? { minQty: row.threshold }
              : { minSubtotal: row.threshold };
          rules.push({ when: gateToWhen(pricing.gate, thresholdOverride), apply });
        }
      }
      break;
    }
    case 'bogo': {
      const bogo = pricing.bogo;
      if (bogo) {
        const reward = bogo.showAsFree
          ? { percentageOff: 100 }
          : discountToApply(bogo.get.discount);
        rules.push({
          when: gateToWhen(pricing.gate),
          apply: {
            buyXGetY: {
              buyQty: bogo.buy.quantity,
              buyProductIds: [...bogo.buy.productIds],
              buyCollectionIds: [...bogo.buy.collectionIds],
              getQty: bogo.get.quantity,
              getProductIds: [...bogo.get.productIds],
              getCollectionIds: [...bogo.get.collectionIds],
              reward,
            },
          },
        });
      }
      break;
    }
    case 'gift': {
      const gift = pricing.gift;
      if (gift) {
        const basis = gift.basis;
        rules.push({
          when: gateToWhen(
            pricing.gate,
            basis === 'quantity' ? { minQty: gift.threshold } : { minSubtotal: gift.threshold },
          ),
          apply: {
            freeGift: {
              productIds: [...gift.productIds],
              threshold: gift.threshold,
              basis,
              selectable: gift.selectable,
              autoAdd: gift.autoAdd,
            },
            // Enforceable half: free the gift line(s) at checkout via the BXGY
            // 100%-off path the handler already runs. Buy arm is empty — the
            // threshold gate (when.minQty/minSubtotal above) qualifies the cart.
            // When `selectable`, all candidate ids are the get arm so whichever
            // gift the shopper adds is freed.
            buyXGetY: giftToBuyXGetY([...gift.productIds]),
          },
        });
      }
      break;
    }
  }

  return {
    rules,
    combineWithOtherDiscounts: pricing.stacking.combinable,
    combinesWith: { ...pricing.stacking.combinesWith },
    discountApplication: { order: pricing.stacking.order },
  };
}

// ─── pricing → functions.shippingDiscount ────────────────────────────────────
//
// `free-shipping` (and discounted-delivery) is enforced ONLY on the shipping-discount
// Function (extensions/superapp-shipping-discount, target
// cart.delivery-options.discounts.generate.run) — the product-discount target has no
// shipping operation. This lowering routes a `free-shipping` pricing kind into that
// Function's `rules[]` config. See discount-packs.md §9.2.

/** One lowered shipping-discount rule — the wire format the wasm handler reads. */
export interface LoweredShippingRule {
  when: {
    minSubtotal?: number;
    minQty?: number;
    countryCodeIn?: string[];
    customerTags?: string[];
  };
  apply: {
    /** Percentage off shipping. 100 = free; a partial value = discounted delivery. */
    shippingPercentage: number;
  };
}

export interface LoweredShippingDiscount {
  rules: LoweredShippingRule[];
}

/** The `when` gate for a shipping rule, from the pricing gate + an optional threshold override. */
function gateToShippingWhen(
  gate: PricingPack['gate'],
  thresholdOverride?: { minQty?: number; minSubtotal?: number },
): LoweredShippingRule['when'] {
  const when: LoweredShippingRule['when'] = {};
  const minQty = thresholdOverride?.minQty ?? gate.minQuantity;
  const minSubtotal = thresholdOverride?.minSubtotal ?? gate.minSubtotal;
  if (minSubtotal != null) when.minSubtotal = minSubtotal;
  if (minQty != null) when.minQty = minQty;
  if (gate.customerTags.length > 0) when.customerTags = [...gate.customerTags];
  return when;
}

/** The shipping percentage a discount kind waives, or `null` if it does not touch shipping. */
function discountToShippingPercentage(d: Discount): number | null {
  if (d.kind === 'free-shipping') return 100;
  return null;
}

/**
 * Lower a `pricing` block to the shipped `functions.shippingDiscount` config shape. Only
 * `free-shipping` kinds produce rules — a pricing block with no free-shipping kind lowers
 * to an empty rule set (the compiler treats that as a no-op / mismatch). `single` and each
 * `tiered` row are inspected; a free-shipping tier's threshold becomes the rule gate so a
 * "free shipping over $X / N items" tier survives.
 */
export function lowerPricingToShippingDiscount(pricing: PricingPack): LoweredShippingDiscount {
  const rules: LoweredShippingRule[] = [];

  const pushIfShipping = (d: Discount, thresholdOverride?: { minQty?: number; minSubtotal?: number }) => {
    const pct = discountToShippingPercentage(d);
    if (pct == null) return;
    rules.push({
      when: gateToShippingWhen(pricing.gate, thresholdOverride),
      apply: { shippingPercentage: pct },
    });
  };

  switch (pricing.model) {
    case 'single': {
      if (pricing.discount) pushIfShipping(pricing.discount);
      break;
    }
    case 'tiered': {
      const tiers = pricing.tiers;
      if (tiers) {
        // Highest-threshold-first so a merchant's best free-shipping tier is authoritative;
        // the handler picks the best qualifying rule per group regardless, so order is a
        // readability convenience here.
        const rows = [...tiers.rows].sort((a, b) => b.threshold - a.threshold);
        for (const row of rows) {
          const override =
            tiers.basis === 'quantity' ? { minQty: row.threshold } : { minSubtotal: row.threshold };
          pushIfShipping(row.discount, override);
        }
      }
      break;
    }
    case 'bogo':
    case 'gift':
      // BOGO / gift models do not carry a shipping kind; no shipping rules.
      break;
  }

  return { rules };
}

// ─── pricing → functions.cartTransform ───────────────────────────────────────

/** Price directive attached to a merged bundle line. */
export interface LoweredBundlePrice {
  kind: Discount['kind'];
  value: number;
  cheapestFreeCount?: number;
  priceEnding?: number;
}

/** One tier's price entry keyed by threshold (for tiered cart-transform pricing). */
export interface LoweredTierPrice extends LoweredBundlePrice {
  threshold: number;
}

export interface LoweredBundle {
  title: string;
  componentSkus: string[];
  bundleSku: string;
  /** Present when a single price governs the merged line. */
  price?: LoweredBundlePrice;
  /** Present for tiered pricing — the CT handler prices by selected tier. */
  tiers?: LoweredTierPrice[];
}

function discountToBundlePrice(d: Discount): LoweredBundlePrice {
  const price: LoweredBundlePrice = { kind: d.kind, value: d.value };
  if (d.cheapestFreeCount != null) price.cheapestFreeCount = d.cheapestFreeCount;
  if (d.priceEnding != null) price.priceEnding = d.priceEnding;
  return price;
}

/**
 * Lower a `pricing` block onto a cart-transform bundle. `single` → a flat `price`;
 * `tiered` → a `tiers[]` price table keyed by threshold. Returns the bundle
 * augmented with pricing; the base fields are preserved verbatim.
 */
export function lowerPricingToCartTransform(
  pricing: PricingPack,
  bundle: { title: string; componentSkus: string[]; bundleSku: string },
): LoweredBundle {
  const base: LoweredBundle = {
    title: bundle.title,
    componentSkus: [...bundle.componentSkus],
    bundleSku: bundle.bundleSku,
  };
  if (pricing.model === 'single' && pricing.discount) {
    base.price = discountToBundlePrice(pricing.discount);
  } else if (pricing.model === 'tiered' && pricing.tiers) {
    base.tiers = [...pricing.tiers.rows]
      .sort((a, b) => b.threshold - a.threshold)
      .map((row) => ({ threshold: row.threshold, ...discountToBundlePrice(row.discount) }));
  }
  return base;
}

// ─── pricing → storefront presentation JSON ──────────────────────────────────

export interface StorefrontTier {
  threshold: number;
  title?: string;
  subtitle?: string;
  badge?: string;
  highlighted: boolean;
  preSelected: boolean;
  imageUrl?: string;
  /** Human string derived deterministically so grid + Function agree on the promise. */
  displayDiscount: string;
}

export interface StorefrontPricing {
  model: PricingPack['model'];
  basis?: 'quantity' | 'cart-value';
  tiers?: StorefrontTier[];
}

/** Deterministic human string for a discount (grid label). */
export function displayDiscount(d: Discount): string {
  switch (d.kind) {
    case 'percentage':
      return `Save ${d.value}%`;
    case 'fixed-amount':
      return `Save $${d.value}`;
    case 'fixed-price':
      return `$${d.value}`;
    case 'cheapest-free':
      return (d.cheapestFreeCount ?? 1) > 1 ? `${d.cheapestFreeCount} cheapest free` : 'Cheapest free';
    case 'free-shipping':
      return 'Free shipping';
    case 'free-gift':
      return 'Free gift';
    case 'none':
      return '';
  }
}

/**
 * Strip pricing math and emit only what the storefront tier grid renders. Both
 * this and the enforcement lowering consume the SAME `pricing` object, so preview
 * and Function cannot drift (discount-packs.md §5.3).
 */
export function pricingToStorefrontJson(pricing: PricingPack): StorefrontPricing {
  if (pricing.model === 'tiered' && pricing.tiers) {
    return {
      model: 'tiered',
      basis: pricing.tiers.basis,
      tiers: pricing.tiers.rows.map((row) => ({
        threshold: row.threshold,
        title: row.title,
        subtitle: row.subtitle,
        badge: row.badge,
        highlighted: row.highlighted,
        preSelected: row.preSelected,
        imageUrl: row.imageUrl,
        displayDiscount: displayDiscount(row.discount),
      })),
    };
  }
  return { model: pricing.model };
}
