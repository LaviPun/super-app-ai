/**
 * Deterministic Function preview simulation (WS4 / specs/025-live-preview-all-surfaces).
 *
 * Feeds a representative cart/checkout fixture through a compiled Function rule
 * config and returns concrete outcomes ("Cart $150 → tier 2, 10% off"; "method
 * 'Economy' hidden") including the non-Plus fallback. Pure + deterministic, so
 * the preview shows exactly what the deployed function would do for the fixture.
 *
 * The simulation is CONFIG-DRIVEN: for the pricing-carrying discount / cart-transform
 * surfaces it interprets `config.pricing` (the PricingPack — tiered / bogo / gift /
 * cheapest-free / fixed-price / single) and mirrors the Rust interpreters' decision
 * semantics (`extensions/superapp-discount/.../cart_lines_discounts_generate_run.rs`
 * `decide()` and `extensions/superapp-cart-transform/.../cart_transform_run.rs`
 * `resolve_merge_percentage`). Fixtures are ADAPTIVE — the demonstration cart is
 * synthesized from the template's own config (bundle component SKUs, tier thresholds,
 * fulfillment SKUs) so each template shows the function actually firing, with a
 * triggering AND a non-triggering scenario where it's cheap to contrast them.
 */
import type { RecipeSpec } from '@superapp/core';
import {
  PreviewSimulationResultSchema,
  defaultSimulationInput,
  type PreviewKind,
  type PreviewSimulationInput,
  type PreviewSimulationOutcome,
  type PreviewSimulationResult,
} from '@superapp/platform-contracts';

type FnSpec = Extract<RecipeSpec, { type: `functions.${string}` }>;

export const FUNCTION_PREVIEW_KINDS = new Set<string>([
  'functions.discountRules',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
  'functions.cartTransform',
  'functions.fulfillmentConstraints',
  'functions.orderRoutingLocationRule',
  'functions.shippingDiscount',
  'functions.localPickupDeliveryOption',
  'functions.pickupPointDeliveryOption',
]);

export function isFunctionPreviewKind(type: string): boolean {
  return FUNCTION_PREVIEW_KINDS.has(type);
}

// ─── Small deterministic helpers ─────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: 'CA$',
  AUD: 'A$',
  EUR: '€',
  GBP: '£',
};

function money(n: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency];
  return sym ? `${sym}${n.toFixed(2)}` : `${currency} ${n.toFixed(2)}`;
}

function cartSubtotal(input: PreviewSimulationInput): number {
  return input.lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);
}

function tagsMatchCI(gateTags: string[] | undefined, customerTags: string[]): boolean {
  if (!gateTags?.length) return true;
  const have = new Set(customerTags.map((t) => t.toLowerCase()));
  return gateTags.some((t) => have.has(t.toLowerCase()));
}

/** `.99` from a priceEnding of 0.99. */
function endingSuffix(pe: number): string {
  return pe.toFixed(2).slice(1);
}

/** Round a target price DOWN to a charm ending (mirrors the crate's apply_price_ending). */
function applyPriceEnding(value: number, ending?: number): number {
  if (ending === undefined) return value;
  let out = Math.floor(value) + ending;
  if (out > value) out -= 1;
  return Math.max(0, out);
}

type Discount = {
  kind: string;
  value: number;
  cheapestFreeCount?: number;
  priceEnding?: number;
};

/** Human wording for a discount primitive (percentage / fixed / cheapest-free …). */
function describeReward(d: Discount, currency: string): string {
  switch (d.kind) {
    case 'percentage':
      return `${d.value}% off`;
    case 'fixed-amount':
      return `${money(d.value, currency)} off${d.priceEnding !== undefined ? ` (ends in ${endingSuffix(d.priceEnding)})` : ''}`;
    case 'fixed-price':
      return `set price ${money(applyPriceEnding(d.value, d.priceEnding), currency)}`;
    case 'cheapest-free':
      return `cheapest ${d.cheapestFreeCount ?? 1} free`;
    case 'free-shipping':
      return 'free shipping';
    case 'free-gift':
      return 'free gift';
    default:
      return 'no price change';
  }
}

/** Discount amount a tier's reward yields on a demo set (deterministic). */
function tierDiscountAmount(d: Discount, setSubtotal: number, unitPrice: number | undefined): number {
  switch (d.kind) {
    case 'percentage':
      return (setSubtotal * d.value) / 100;
    case 'fixed-amount':
      return Math.min(d.value, setSubtotal);
    case 'fixed-price':
      return Math.max(0, setSubtotal - applyPriceEnding(d.value, d.priceEnding));
    case 'cheapest-free':
      return (d.cheapestFreeCount ?? 1) * (unitPrice ?? 0);
    default:
      return 0;
  }
}

/** Percentage a bundle-merge price kind is expressible as (mirrors cart-transform crate). */
function expressibleMergePercentage(d: Discount): number | null {
  if (d.kind === 'percentage' && d.value > 0) return d.value;
  return null;
}

const push = (
  outcomes: PreviewSimulationOutcome[],
  label: string,
  detail: string,
  effect: PreviewSimulationOutcome['effect'],
) => {
  outcomes.push({ label, detail, effect });
};

// ─── Pricing-pack (config.pricing) simulation ────────────────────────────────

/** Interpret a PricingPack into concrete, contrast-scenario outcomes. */
function simulatePricing(
  pricing: Record<string, any>,
  input: PreviewSimulationInput,
  outcomes: PreviewSimulationOutcome[],
): void {
  const currency = input.currency;
  const model = pricing.model as string;

  if (model === 'tiered' && pricing.tiers?.rows?.length) {
    const isQty = pricing.tiers.basis === 'quantity';
    const rows: Array<Record<string, any>> = [...pricing.tiers.rows].sort(
      (a, b) => a.threshold - b.threshold,
    );
    const gateWord = (threshold: number) =>
      isQty ? `Buy ${threshold}` : `Spend ${money(threshold, currency)}`;

    // Full tier ladder (what each threshold unlocks).
    rows.forEach((r, i) => {
      const meta = [r.title, r.subtitle, r.badge && `badge: ${r.badge}`]
        .filter(Boolean)
        .join(' · ');
      push(
        outcomes,
        `${gateWord(r.threshold)} → ${describeReward(r.discount, currency)}`,
        meta || `Tier ${i + 1} of ${rows.length}`,
        'applied',
      );
    });

    // Non-triggering scenario: below the first tier.
    const lowest = rows[0]!.threshold;
    const below = Math.max(0, Math.floor(lowest * 0.6));
    push(
      outcomes,
      isQty ? `Cart of ${below} item(s) → no discount` : `Cart ${money(below, currency)} → no discount`,
      `Below the ${isQty ? `${lowest}-item` : money(lowest, currency)} first tier — nothing applies.`,
      'none',
    );

    // Triggering scenario: land the cart squarely in a representative tier.
    const demoIdx = rows.length >= 2 ? 1 : 0;
    const tier = rows[demoIdx]!;
    const UNIT = 20;
    const setSubtotal = isQty ? tier.threshold * UNIT : tier.threshold;
    const amount = tierDiscountAmount(tier.discount, setSubtotal, isQty ? UNIT : undefined);
    push(
      outcomes,
      `${isQty ? `Cart of ${tier.threshold} items` : `Cart ${money(tier.threshold, currency)}`} → tier ${demoIdx + 1}/${rows.length}: ${describeReward(tier.discount, currency)}`,
      `Discount ${money(amount, currency)} on a ${money(setSubtotal, currency)} set.`,
      'applied',
    );
    return;
  }

  if (model === 'bogo' && pricing.bogo) {
    const { buy, get, showAsFree } = pricing.bogo;
    const reward: Discount = get?.discount ?? { kind: 'percentage', value: 100 };
    const buyQty = buy?.quantity ?? 1;
    const getQty = get?.quantity ?? 1;
    const rewardDesc = showAsFree ? 'free' : describeReward(reward, currency);
    push(
      outcomes,
      `Buy ${buyQty}, get ${getQty} → ${rewardDesc}`,
      `Reward applies to the "get" set once the "buy" set (×${buyQty}) is present.`,
      'applied',
    );

    // Triggering scenario: buy arm satisfied + a get item in cart.
    const UNIT = 40;
    const getSubtotal = getQty * UNIT;
    const rewardPct = showAsFree ? 100 : reward.kind === 'percentage' ? reward.value : 0;
    const rewardFixed = reward.kind === 'fixed-amount' ? reward.value : 0;
    // Fixed-amount is applied ONCE across the get set (mirrors CandidateValue::FixedAmount).
    const disc = rewardPct > 0 ? (getSubtotal * rewardPct) / 100 : Math.min(rewardFixed, getSubtotal);
    push(
      outcomes,
      `Cart: ${buyQty} buy + ${getQty} get item(s) → ${rewardDesc}`,
      `${money(disc, currency)} off the get item(s) (each ${money(UNIT, currency)}).`,
      'applied',
    );

    // Non-triggering scenario: buy arm not satisfied.
    push(
      outcomes,
      `Cart: ${Math.max(0, buyQty - 1)} buy item(s), no get item → no reward`,
      `The buy arm (×${buyQty}) and a get item must both be present.`,
      'none',
    );
    return;
  }

  if (model === 'gift' && pricing.gift) {
    const g = pricing.gift;
    const isQty = g.basis === 'quantity';
    const nGifts: number = Array.isArray(g.productIds) ? g.productIds.length : 0;
    const chooseDesc =
      g.selectable && nGifts > 1 ? `choose 1 of ${nGifts} gifts` : g.autoAdd ? 'auto-added free gift' : 'free gift';
    const usageLimit = pricing.gate?.usageLimit;
    push(
      outcomes,
      `${isQty ? `Buy ${g.threshold}+ items` : `Spend ${money(g.threshold, currency)}+`} → ${chooseDesc}`,
      `Gift priced free at checkout${usageLimit ? ` (capped at ${usageLimit} uses)` : ''}.`,
      'applied',
    );

    const below = Math.max(0, Math.floor(g.threshold * 0.6));
    push(
      outcomes,
      `${isQty ? `Cart of ${below} items` : `Cart ${money(below, currency)}`} → no gift`,
      `Below the ${isQty ? `${g.threshold}-item` : money(g.threshold, currency)} gift threshold.`,
      'none',
    );
    push(
      outcomes,
      `${isQty ? `Cart of ${g.threshold} items` : `Cart ${money(g.threshold, currency)}`} → gift added ${money(0, currency)}`,
      `${nGifts > 1 ? `${nGifts} gift options` : '1 gift'} ${g.autoAdd ? 'auto-added' : 'offered'} at no charge.`,
      'applied',
    );
    return;
  }

  // model === 'single' (flat discount, optionally tag / spend gated).
  if (pricing.discount) {
    const d: Discount = pricing.discount;
    const gate = pricing.gate ?? {};
    const gateTags: string[] = gate.customerTags ?? [];
    const desc = describeReward(d, currency);

    if (gateTags.length) {
      const matches = tagsMatchCI(gateTags, input.customerTags);
      push(
        outcomes,
        `Tagged ${gateTags.join('/')} → ${desc}`,
        `Applies only to customers carrying one of these tags.`,
        'applied',
      );
      push(
        outcomes,
        `Untagged customer → no discount`,
        `The member perk degrades to no discount until the tag is present.`,
        'none',
      );
      push(
        outcomes,
        `Fixture customer [${input.customerTags.join(', ') || 'none'}] → ${matches ? desc : 'no discount'}`,
        matches ? `The fixture customer carries a matching tag.` : `The fixture customer has no matching tag.`,
        matches ? 'applied' : 'none',
      );
      return;
    }

    const minSub: number | undefined = gate.minSubtotal;
    const demoSubtotal = minSub ?? cartSubtotal(input) ?? 100;
    const amount = tierDiscountAmount(d, demoSubtotal, undefined);
    if (minSub !== undefined) {
      const below = Math.max(0, Math.floor(minSub * 0.6));
      push(
        outcomes,
        `Cart ${money(below, currency)} → no discount`,
        `Below the ${money(minSub, currency)} minimum.`,
        'none',
      );
    }
    push(
      outcomes,
      `Cart ${money(demoSubtotal, currency)} → ${desc}`,
      d.kind === 'fixed-price'
        ? `Set to ${money(applyPriceEnding(d.value, d.priceEnding), currency)} (saves ${money(amount, currency)}).`
        : `Discount ${money(amount, currency)} applied.`,
      'applied',
    );
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Simulate a compiled Function spec against a fixture. */
export function simulateFunction(
  spec: FnSpec,
  input: PreviewSimulationInput = defaultSimulationInput(),
): PreviewSimulationResult {
  const kind = spec.type as PreviewKind;
  const subtotal = cartSubtotal(input);
  const currency = input.currency;
  const outcomes: PreviewSimulationOutcome[] = [];
  let fallbackNote: string | undefined;
  const config = spec.config as Record<string, unknown>;
  const rules = Array.isArray(config.rules) ? (config.rules as Array<Record<string, any>>) : [];

  switch (spec.type) {
    case 'functions.discountRules': {
      // `config.pricing` SUPERSEDES `rules[]` (mirrors the compiler's lowering).
      const pricing = config.pricing as Record<string, any> | undefined;
      if (pricing) {
        simulatePricing(pricing, input, outcomes);
        break;
      }
      // Legacy rules[] path — tag matching is case-insensitive (the simulation
      // knows the fixture customer's tags, unlike the pure runtime Function).
      for (const rule of rules) {
        const when = rule.when ?? {};
        const tagOk = tagsMatchCI(when.customerTags, input.customerTags);
        const subtotalOk = when.minSubtotal === undefined || subtotal >= when.minSubtotal;
        if (!tagOk || !subtotalOk) continue;
        const pct = rule.apply?.percentageOff;
        const fixed = rule.apply?.fixedAmountOff;
        const tagSuffix = when.customerTags?.length ? `, ${when.customerTags.join('/')}` : '';
        if (pct) {
          push(
            outcomes,
            `Cart ${money(subtotal, currency)}${tagSuffix} → ${pct}% off`,
            `Discount ${money((subtotal * pct) / 100, currency)} applied.`,
            'applied',
          );
        } else if (fixed) {
          push(
            outcomes,
            `Cart ${money(subtotal, currency)}${tagSuffix} → ${money(fixed, currency)} off`,
            `Fixed discount ${money(fixed, currency)} applied.`,
            'applied',
          );
        }
      }
      break;
    }
    case 'functions.deliveryCustomization': {
      for (const rule of rules) {
        const cond = describeCheckoutWhen(rule.when ?? {}, currency);
        const actions = rule.actions ?? {};
        for (const m of actions.hideMethodsContaining ?? []) {
          const hit = input.methods.find((name) => name.toLowerCase().includes(String(m).toLowerCase()));
          push(
            outcomes,
            `Method '${hit ?? m}' hidden`,
            `Hidden when ${cond}.`,
            'hidden',
          );
        }
        if (actions.renameMethod) {
          const { contains, to } = actions.renameMethod;
          const hit = input.methods.find((name) => name.toLowerCase().includes(String(contains).toLowerCase()));
          push(outcomes, `Method '${hit ?? contains}' renamed → '${to}'`, `Renamed when ${cond}.`, 'renamed');
        }
        if (actions.reorderPriority !== undefined) {
          push(
            outcomes,
            `Methods reordered (priority ${actions.reorderPriority})`,
            `Reordered when ${cond}.`,
            'reordered',
          );
        }
      }
      break;
    }
    case 'functions.paymentCustomization': {
      for (const rule of rules) {
        const cond = describeCheckoutWhen(rule.when ?? {}, currency);
        const actions = rule.actions ?? {};
        for (const m of actions.hideMethodsContaining ?? []) {
          const hit = input.methods.find((name) => name.toLowerCase().includes(String(m).toLowerCase()));
          push(outcomes, `Payment method '${hit ?? m}' hidden`, `Hidden when ${cond}.`, 'hidden');
        }
        if (actions.renameMethod) {
          const { contains, to } = actions.renameMethod;
          push(outcomes, `Payment method '${contains}' renamed → '${to}'`, `Renamed when ${cond}.`, 'renamed');
        }
        if (actions.reorderPriority !== undefined) {
          push(outcomes, `Payment methods reordered (priority ${actions.reorderPriority})`, `Reordered when ${cond}.`, 'reordered');
        }
        if (actions.requireReview) {
          push(outcomes, 'Order flagged for manual review', `Flagged when ${cond}.`, 'constrained');
        }
      }
      break;
    }
    case 'functions.cartAndCheckoutValidation': {
      for (const rule of rules) {
        const when = rule.when ?? {};
        const msg = rule.errorMessage ?? 'Checkout blocked.';
        if (when.maxQuantityPerSku !== undefined) {
          push(outcomes, `Blocks checkout when any SKU qty > ${when.maxQuantityPerSku}`, msg, 'blocked');
        }
        if (when.maxQuantityPerProductType !== undefined) {
          push(outcomes, `Blocks checkout when a product type qty > ${when.maxQuantityPerProductType}`, msg, 'blocked');
        }
        if (when.minCartValue !== undefined) {
          push(outcomes, `Blocks checkout when cart < ${money(when.minCartValue, currency)}`, msg, 'blocked');
        }
        if (when.maxCartValue !== undefined) {
          push(outcomes, `Blocks checkout when cart > ${money(when.maxCartValue, currency)}`, msg, 'blocked');
        }
        if (when.blockCountryCodes?.length) {
          push(outcomes, `Blocks shipping to ${when.blockCountryCodes.join(', ')}`, msg, 'blocked');
        }
        if (when.blockProvinceCodes?.length) {
          push(outcomes, `Blocks provinces ${when.blockProvinceCodes.join(', ')}`, msg, 'blocked');
        }
      }
      break;
    }
    case 'functions.cartTransform': {
      const bundles = Array.isArray(config.bundles) ? (config.bundles as Array<Record<string, any>>) : [];
      if (!input.isPlus) {
        const fb = config.fallbackTheme as { enabled?: boolean; notificationMessage?: string } | undefined;
        fallbackNote = fb?.notificationMessage ?? 'Cart transforms require Shopify Plus; theme fallback shown instead.';
        push(outcomes, 'Non-Plus store: theme fallback', fallbackNote, 'none');
        break;
      }
      const rootPricing = config.pricing as Record<string, any> | undefined;
      for (const b of bundles) {
        const components: string[] = b.componentSkus ?? [];
        if (components.length === 0) continue;
        // Adaptive fixture: synthesize a cart holding this bundle's components so
        // the merge demonstrably fires (mirrors the storefront stamping the
        // `_superapp_bundle_id` line property on every component line).
        push(
          outcomes,
          `Bundle '${b.title}' formed → ${b.bundleSku}`,
          `Merges ${components.join(', ')} into one cart line.`,
          'bundled',
        );
        const pricing = (b.pricing as Record<string, any> | undefined) ?? rootPricing;
        if (pricing) describeBundlePricing(pricing, components.length, currency, outcomes, b.title);
      }
      break;
    }
    case 'functions.fulfillmentConstraints': {
      for (const rule of rules) {
        const when = rule.when ?? {};
        const apply = rule.apply ?? {};
        const skus: string[] = when.skuIn ?? [];
        // Adaptive fixture: synthesize a cart containing the first flagged SKU.
        const skuLabel = skus.length ? `SKU ${skus[0]}` : 'any line';
        const matchNote = skus.length ? ` (matches ${skus.join(', ')})` : '';
        if (apply.shipAlone) {
          push(outcomes, `${skuLabel} → must ship alone`, `Packed as its own parcel${matchNote}.`, 'constrained');
        }
        if (apply.groupWithTag) {
          push(outcomes, `${skuLabel} → grouped as '${apply.groupWithTag}'`, `Kept in one shipment${matchNote}.`, 'constrained');
        }
        if (apply.mustFulfillFromLocationIds?.length) {
          const locs = apply.mustFulfillFromLocationIds.map((id: string) => String(id).split('/').pop()).join(', ');
          push(outcomes, `${skuLabel} → fulfil from location ${locs}`, `Pinned to ${apply.mustFulfillFromLocationIds.length} location(s)${matchNote}.`, 'constrained');
        }
      }
      if (outcomes.length > 0) {
        push(outcomes, 'Cart without the flagged SKUs → no constraint', 'A normal cart ships unchanged; only the listed SKUs are constrained.', 'none');
      }
      break;
    }
    case 'functions.orderRoutingLocationRule': {
      let best: { loc: string; priority: number } | undefined;
      for (const rule of rules) {
        const when = rule.when ?? {};
        const apply = rule.apply ?? {};
        const loc = apply.preferLocationId ? String(apply.preferLocationId).split('/').pop()! : '—';
        const priority = apply.priority ?? 0;
        let cond: string;
        if (when.countryCode) cond = `Destination ${when.countryCode}`;
        else if (when.inventoryLocationIds?.length)
          cond = `Inventory at ${when.inventoryLocationIds.map((id: string) => String(id).split('/').pop()).join(', ')}`;
        else cond = 'Any order';
        push(outcomes, `${cond} → prefer location ${loc}`, `Priority ${priority}.`, 'routed');
        // Evaluate against the fixture destination (country) to pick the winner.
        const matchesFixture = when.countryCode ? when.countryCode === input.countryCode : !when.inventoryLocationIds?.length;
        if (matchesFixture && (!best || priority > best.priority)) best = { loc, priority };
      }
      if (best) {
        push(
          outcomes,
          `Fixture: ${input.countryCode} order → routed to location ${best.loc}`,
          `Highest-priority matching rule wins (priority ${best.priority}).`,
          'routed',
        );
      }
      break;
    }
    case 'functions.shippingDiscount': {
      const totalQty = input.lineItems.reduce((sum, li) => sum + li.quantity, 0);
      for (const rule of rules) {
        const when = rule.when ?? {};
        const subtotalOk = when.minSubtotal === undefined || subtotal >= when.minSubtotal;
        const qtyOk = when.minQty === undefined || totalQty >= when.minQty;
        const countryOk = !when.countryCodeIn?.length || when.countryCodeIn.includes(input.countryCode);
        // Tag gate: the simulation knows the fixture customer's tags, so it
        // evaluates them case-insensitively (degrades to "no match" otherwise).
        const tagOk = tagsMatchCI(when.customerTags, input.customerTags);
        if (!subtotalOk || !qtyOk || !countryOk || !tagOk) continue;
        const pct = rule.apply?.shippingPercentage ?? 0;
        if (pct <= 0) continue;
        const tagNote = when.customerTags?.length ? ` for ${when.customerTags.join('/')} customers` : '';
        const label =
          pct >= 100
            ? `Cart ${money(subtotal, currency)} → FREE shipping`
            : `Cart ${money(subtotal, currency)} → ${pct}% off shipping`;
        push(
          outcomes,
          label,
          pct >= 100
            ? `Delivery waived for ${input.countryCode}${tagNote}${when.minSubtotal !== undefined ? ` (over ${money(when.minSubtotal, currency)})` : ''}.`
            : `Delivery discounted ${pct}% for ${input.countryCode}${tagNote}.`,
          'applied',
        );
      }
      break;
    }
    case 'functions.localPickupDeliveryOption': {
      const locations = Array.isArray(config.locations) ? (config.locations as Array<Record<string, any>>) : [];
      for (const loc of locations) {
        if (!loc.locationId) continue;
        const cost = typeof loc.cost === 'number' ? loc.cost : 0;
        const title = loc.title || 'Local pickup';
        push(
          outcomes,
          cost > 0 ? `Pickup option '${title}' added (${money(cost, currency)})` : `Pickup option '${title}' added (free)`,
          `Local pickup generated for location ${String(loc.locationId).split('/').pop()}.`,
          'applied',
        );
      }
      break;
    }
    case 'functions.pickupPointDeliveryOption': {
      const points = Array.isArray(config.points) ? (config.points as Array<Record<string, any>>) : [];
      for (const pt of points) {
        const countries: string[] = pt.countryCodeIn ?? [];
        const applies = countries.length === 0 || countries.map((c) => c.toUpperCase()).includes(input.countryCode.toUpperCase());
        if (!applies) continue;
        if (!pt.externalId || !pt.name || !pt.provider?.logoUrl || !pt.address?.address1) continue;
        const cost = typeof pt.cost === 'number' ? pt.cost : undefined;
        push(
          outcomes,
          cost !== undefined && cost > 0 ? `Pickup point '${pt.name}' added (${money(cost, currency)})` : `Pickup point '${pt.name}' added`,
          `${pt.provider?.name ?? 'Provider'} point in ${pt.address?.city ?? '—'} offered for ${input.countryCode}.`,
          'applied',
        );
      }
      break;
    }
    default:
      break;
  }

  if (outcomes.length === 0) {
    push(
      outcomes,
      'No rule matched the fixture',
      `Cart ${money(subtotal, currency)} did not trigger any configured rule.`,
      'none',
    );
  }

  return PreviewSimulationResultSchema.parse({ kind, outcomes, fallbackNote });
}

/** Human wording for a delivery/payment `when` predicate set (all predicates ANDed). */
function describeCheckoutWhen(when: Record<string, any>, currency: string): string {
  const parts: string[] = [];
  if (when.countryCodeIn?.length) parts.push(`ships to ${when.countryCodeIn.join('/')}`);
  if (when.provinceCodeIn?.length) parts.push(`province in ${when.provinceCodeIn.join('/')}`);
  if (when.minSubtotal !== undefined) parts.push(`cart ≥ ${money(when.minSubtotal, currency)}`);
  if (when.currencyIn?.length) parts.push(`currency ${when.currencyIn.join('/')}`);
  if (when.productTypeIn?.length) parts.push(`product type ${when.productTypeIn.join('/')}`);
  if (when.vendorIn?.length) parts.push(`vendor ${when.vendorIn.join('/')}`);
  if (when.productIdIn?.length) parts.push(`${when.productIdIn.length} specific product(s)`);
  if (when.productVariantIdIn?.length) parts.push(`${when.productVariantIdIn.length} specific variant(s)`);
  if (when.customerIdIn?.length) parts.push(`${when.customerIdIn.length} specific customer(s)`);
  if (when.customerEmailIn?.length) parts.push(`${when.customerEmailIn.length} specific email(s)`);
  if (when.minCustomerOrders !== undefined) parts.push(`≥ ${when.minCustomerOrders} prior orders`);
  return parts.length ? parts.join(' & ') : 'any checkout';
}

/** Describe what a bundle's pricing does to the merged line (mirrors cart-transform crate). */
function describeBundlePricing(
  pricing: Record<string, any>,
  componentCount: number,
  currency: string,
  outcomes: PreviewSimulationOutcome[],
  title: string,
): void {
  const model = pricing.model as string;
  if (model === 'tiered' && pricing.tiers?.rows?.length) {
    const rows: Array<Record<string, any>> = [...pricing.tiers.rows].sort((a, b) => a.threshold - b.threshold);
    // Best qualifying tier by merged component quantity.
    let best: Record<string, any> | undefined;
    for (const r of rows) if (componentCount >= r.threshold && (!best || r.threshold >= best.threshold)) best = r;
    if (best) {
      const pct = expressibleMergePercentage(best.discount);
      push(
        outcomes,
        `'${title}' priced → ${describeReward(best.discount, currency)}`,
        pct !== null
          ? `Merged line takes ${pct}% off (${componentCount} components hit the "${best.title ?? `≥${best.threshold}`}" tier).`
          : `Tier reward is applied on the component lines, not the merge.`,
        'applied',
      );
    } else {
      push(outcomes, `'${title}' priced → no tier reached`, `${componentCount} components is below the first tier.`, 'none');
    }
    return;
  }
  const d: Discount | undefined = pricing.discount;
  if (!d) return;
  const pct = expressibleMergePercentage(d);
  if (pct !== null) {
    push(outcomes, `'${title}' priced → ${pct}% off`, `Merged bundle line takes ${pct}% off.`, 'applied');
  } else if (d.kind === 'fixed-price') {
    push(
      outcomes,
      `'${title}' priced → ${describeReward(d, currency)}`,
      `Components charm-priced to hit ${money(applyPriceEnding(d.value, d.priceEnding), currency)}.`,
      'applied',
    );
  } else {
    // fixed-amount / gift / cheapest-free are not expressible on a merged line.
    push(
      outcomes,
      `'${title}' pricing → not applied on merge`,
      `${describeReward(d, currency)} needs an order/product-discount Function; the merge itself is unpriced.`,
      'none',
    );
  }
}
