/**
 * `pricing` control pack (basic) — R2.2: the merchant-facing PRICING vocabulary.
 *
 * The atomic discount primitive (`kind / value / min / combinable`) plus its
 * relatives — tiers, BOGO, gift-with-purchase, and the enforcement mechanism.
 * The flagship requirement: a single tier set may **MIX discount kinds** across
 * rows (percentage / cheapest-free / fixed-price / free-shipping) — the Fast
 * Bundle / Kaching parity bar (fast-bundle.md:44, kaching-bundles.md:34).
 *
 * This pack is deliberately richer than any single Function config; a
 * deterministic **lowering** step (apps/web/.../compiler/pricing/lower.ts) then
 * translates it into the ALREADY-SHIPPED `functions.discountRules` /
 * `functions.cartTransform` config shapes those compilers publish via
 * `FUNCTION_CONFIG_UPSERT`. No new runtime — we wire authoring vocabulary into
 * the live one.
 *
 * Flat-pin path (post R2.4 prune): the pack `schema` is pinned as an `.optional()`
 * `pricing` key onto `functions.discountRules.config` and
 * `functions.cartTransform.config` (see recipe.ts). Optional everywhere → recipes
 * that omit it validate + compile byte-identically (back-compat).
 */
import { z } from 'zod';
import {
  DISCOUNT_KINDS,
  THRESHOLD_BASIS,
  PRICING_MECHANISMS,
  PRICING_MODELS,
  PRICING_LIMITS,
  PRODUCT_GID_RE,
  COLLECTION_GID_RE,
} from '../../allowed-values.js';
import type { ControlPack, TypeEnumField } from '../types.js';

// Re-export the manifest-centralized enums so consumers can `import from the pack`
// (mirrors how rule-engine surfaces its enums via the pack). Single source stays
// allowed-values.ts; these are convenience aliases.
export { DISCOUNT_KINDS, THRESHOLD_BASIS, PRICING_MECHANISMS as MECHANISMS } from '../../allowed-values.js';
export type { DiscountKind, ThresholdBasis, PricingMechanism, PricingModel } from '../../allowed-values.js';

const productGid = z.string().regex(PRODUCT_GID_RE, 'must be gid://shopify/Product/<id>');
const collectionGid = z.string().regex(COLLECTION_GID_RE, 'must be gid://shopify/Collection/<id>');

/**
 * Atomic discount primitive — pack #20. Reused by tiers, bogo.get, offers.
 * `value` meaning depends on `kind`; ignored for cheapest-free/free-shipping/
 * free-gift/none.
 */
export const DiscountSchema = z
  .object({
    kind: z.enum(DISCOUNT_KINDS).default('percentage'),
    /** Meaning depends on `kind`. percentage: 0..100; fixed-amount: money off; fixed-price: final price. */
    value: z.number().nonnegative().default(0),
    /** How many cheapest items become free (kind='cheapest-free'). */
    cheapestFreeCount: z.number().int().positive().max(PRICING_LIMITS.cheapestFreeMax).optional(),
    /** Force a price ending, e.g. 0.99 → prices round DOWN to x.99. Applied post-calc. */
    priceEnding: z.number().min(0).lt(1).optional(),
  })
  .refine((d) => d.kind !== 'percentage' || d.value <= 100, {
    message: 'percentage value must be 0..100',
    path: ['value'],
  });
export type Discount = z.infer<typeof DiscountSchema>;

/** Gate that must hold for the whole pricing block to apply (pack #20 min*). */
export const PricingGateSchema = z.object({
  minQuantity: z.number().int().positive().optional(),
  minSubtotal: z.number().nonnegative().optional(),
  /** Prerequisite products/collections (Spring-26 BXGY prerequisites). */
  prerequisiteProductIds: z.array(productGid).max(PRICING_LIMITS.prerequisiteProductsMax).default([]),
  prerequisiteCollectionIds: z
    .array(collectionGid)
    .max(PRICING_LIMITS.prerequisiteCollectionsMax)
    .default([]),
  /** Coarse audience gate; fine targeting is the rule-engine pack's job (R2.1). */
  customerTags: z.array(z.string().max(60)).max(PRICING_LIMITS.customerTagsMax).default([]),
  usageLimit: z.number().int().positive().optional(),
});
export type PricingGate = z.infer<typeof PricingGateSchema>;

/** Stacking / order-of-operations (pack #20 combinable + Spring-26 stacking). */
export const StackingSchema = z.object({
  /** Stack with Shopify native discount codes. Maps to the Function's combinesWith. */
  combinable: z.boolean().default(true),
  /** Which discount CLASSES this may combine with (Spring-26 multi-discount stacking). */
  combinesWith: z
    .object({
      orderDiscounts: z.boolean().default(false),
      productDiscounts: z.boolean().default(false),
      shippingDiscounts: z.boolean().default(false),
    })
    .default({ orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }),
  /** Apply before or after other discounts (Ultimate Special Offers). */
  order: z.enum(['before', 'after']).default('after'),
});
export type Stacking = z.infer<typeof StackingSchema>;

/**
 * One tier row. Carries BOTH pricing and per-tier presentation
 * (kaching-bundles.md:34). Each row has its OWN `discount` — kinds may differ per
 * tier within the same set (the mixed-kind requirement).
 */
export const TierSchema = z.object({
  /** Threshold at which this tier activates (interpreted per parent `tiers.basis`). */
  threshold: z.number().positive(),
  discount: DiscountSchema,
  /** Optional per-tier gift (kaching Tier.freeGift). */
  gift: z
    .object({ productId: productGid, quantity: z.number().int().positive().default(1) })
    .optional(),
  // Presentation (consumed by the storefront tier grid; ignored by the Function).
  title: z.string().max(60).optional(),
  subtitle: z.string().max(120).optional(),
  badge: z.string().max(40).optional(),
  highlighted: z.boolean().default(false),
  preSelected: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
});
export type Tier = z.infer<typeof TierSchema>;

export const TiersSchema = z
  .object({
    basis: z.enum(THRESHOLD_BASIS).default('quantity'),
    rows: z.array(TierSchema).min(1).max(PRICING_LIMITS.tiersMax),
  })
  // At most one preselected row.
  .refine((t) => t.rows.filter((r) => r.preSelected).length <= 1, {
    message: 'At most one tier may be preSelected',
    path: ['rows'],
  });
export type Tiers = z.infer<typeof TiersSchema>;

/** Buy-X-Get-Y (pack #22, kaching-bundles.md:82). */
export const BogoSchema = z.object({
  buy: z.object({
    productIds: z.array(productGid).max(PRICING_LIMITS.bogoProductsMax).default([]),
    collectionIds: z.array(collectionGid).max(PRICING_LIMITS.bogoCollectionsMax).default([]),
    quantity: z.number().int().positive().default(1),
  }),
  get: z.object({
    productIds: z.array(productGid).max(PRICING_LIMITS.bogoProductsMax).default([]),
    collectionIds: z.array(collectionGid).max(PRICING_LIMITS.bogoCollectionsMax).default([]),
    quantity: z.number().int().positive().default(1),
    /** The reward on the "get" arm. showAsFree ⇔ kind:'percentage' value:100. */
    discount: DiscountSchema.default({ kind: 'percentage', value: 100 }),
  }),
  showAsFree: z.boolean().default(true),
});
export type Bogo = z.infer<typeof BogoSchema>;

/** Gift-with-purchase (pack #23). */
export const GiftSchema = z.object({
  productIds: z.array(productGid).min(1).max(PRICING_LIMITS.giftProductsMax),
  threshold: z.number().positive(),
  basis: z.enum(THRESHOLD_BASIS).default('cart-value'),
  autoAdd: z.boolean().default(true),
  /** >1 gift → customer chooses (slide-cart/Candy Rack/Moon). */
  selectable: z.boolean().default(false),
});
export type Gift = z.infer<typeof GiftSchema>;

export const PricingPackSchema = z
  .object({
    /** Which primitive drives this module. Exactly one body is authoritative. */
    model: z.enum(PRICING_MODELS).default('single'),
    mechanism: z.enum(PRICING_MECHANISMS).default('shopify-function-discount'),

    /** model:'single' — one flat discount. */
    discount: DiscountSchema.optional(),
    /** model:'tiered'. */
    tiers: TiersSchema.optional(),
    /** model:'bogo'. */
    bogo: BogoSchema.optional(),
    /** model:'gift' (also attachable per-tier via TierSchema.gift). */
    gift: GiftSchema.optional(),

    gate: PricingGateSchema.default({}),
    stacking: StackingSchema.default({}),
  })
  // The chosen model must carry its body.
  .superRefine((p, ctx) => {
    const need = { single: 'discount', tiered: 'tiers', bogo: 'bogo', gift: 'gift' } as const;
    const key = need[p.model];
    if ((p as Record<string, unknown>)[key] == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `model='${p.model}' requires config.pricing.${key}`,
      });
    }
  });
export type PricingPack = z.infer<typeof PricingPackSchema>;

/**
 * The `mechanism` field is a per-type enum (R2.5 / plan 1c). At the union level
 * `PricingPackSchema.mechanism` keeps the full `z.enum(PRICING_MECHANISMS)` (all
 * four values) so already-persisted specs — including declarative `discount-code`
 * / `draft-order` ones — keep validating. The TIGHT per-type option-set is supplied
 * by the catalog in `type-enums.ts`: `functions.discountRules` resolves
 * `['shopify-function-discount']` and `functions.cartTransform` resolves
 * `['shopify-function-cart-transform']`, so generation can only emit the ONE real
 * runtime each type lowers into — the declarative-only mechanisms are removed from
 * generation without touching `RecipeSpecSchema`.
 *
 * `fallback` (the two real runtime mechanisms) covers any pricing-bearing type that
 * lists this pack but supplies no catalog entry — it never includes the declarative
 * mechanisms. No `default` is set, so `resolveTypeEnumsForType` uses each type's
 * first resolved option as the default (correct per type).
 */
const mechanismField: TypeEnumField = {
  kind: 'typeEnum',
  enumKey: 'mechanism',
  fallback: [
    { value: 'shopify-function-discount', label: 'Shopify Function (discount)' },
    { value: 'shopify-function-cart-transform', label: 'Shopify Function (cart transform)' },
  ],
};

export const pricingPack: ControlPack<typeof PricingPackSchema> = {
  id: 'pricing',
  namespace: 'pricing',
  label: 'Pricing & Discounts',
  tier: 'basic',
  schema: PricingPackSchema,
  typeEnums: { mechanism: mechanismField },
  uiSchema: {
    groupLabel: 'Pricing & Discounts',
    order: ['model', 'discount', 'tiers', 'bogo', 'gift', 'mechanism', 'gate', 'stacking'],
    fields: {
      discount: { showWhen: { field: 'model', equals: 'single' } },
      tiers: { showWhen: { field: 'model', equals: 'tiered' } },
      bogo: { showWhen: { field: 'model', equals: 'bogo' } },
      gift: { showWhen: { field: 'model', equals: 'gift' } },
      mechanism: { tier: 'advanced', help: 'How the discount is enforced at checkout.' },
      stacking: { tier: 'advanced' },
    },
  },
};
