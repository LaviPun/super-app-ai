/**
 * `recommendation` control pack (basic) — R2.3: the RECOMMENDATION-source
 * vocabulary. A strategy select (how offered/recommended products are chosen) plus
 * per-strategy config and a mandatory deterministic `fallback`.
 *
 * The core design is the RESOLVER SPLIT BY STRATEGY CLASS (see
 * `allowed-values.ts:RECOMMENDATION_STRATEGIES`):
 *   • STATIC  (manual / collection / related / complementary /
 *              most-expensive-in-cart / cheapest-in-cart) — resolve in Liquid
 *              (storefront) or the Storefront API (checkout) with NO backend.
 *   • DYNAMIC (top-sellers / trending / buy-it-again / recently-viewed) — need
 *              ranking over order/analytics data or per-session client state, so
 *              they route through the App-Proxy `recommendation.service` and
 *              DEGRADE to `fallback` where/until that service resolves them.
 *
 * Because the strategy option-set is identical across every product-widget type
 * (theme.section, checkout.upsell, …) it is a plain closed `z.enum` — NOT a
 * per-type `typeEnum` (the R2.5 mechanism, which exists for per-type *divergence*
 * like `layout`; the strategy set does not diverge by type).
 *
 * Flat-pin path (post R2.4 prune): the pack `schema` is pinned as an `.optional()`
 * `recommendation` key onto `theme.section.config` and the three checkout/offer
 * configs (`checkout.upsell`, `checkout.block`, `postPurchase.offer`) — see
 * recipe.ts. Optional everywhere → recipes that omit it validate + compile
 * byte-identically (back-compat). `strategy:'manual'` with one variant IS the
 * legacy `productVariantGid`; that field is kept indefinitely.
 */
import { z } from 'zod';
import {
  RECOMMENDATION_STRATEGIES,
  RECOMMENDATION_FALLBACKS,
  RECOMMENDATION_LIMITS,
  PRODUCT_VARIANT_GID_RE,
  PRODUCT_GID_RE,
  COLLECTION_GID_RE,
} from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

// Re-export the strategy enums so consumers can `import from the pack` (mirrors
// how pricing surfaces DISCOUNT_KINDS). Single source stays allowed-values.ts.
export {
  RECOMMENDATION_STRATEGIES,
  STATIC_RECOMMENDATION_STRATEGIES,
  RECOMMENDATION_FALLBACKS,
} from '../../allowed-values.js';
export type {
  RecommendationStrategy,
  StaticRecommendationStrategy,
  RecommendationFallback,
} from '../../allowed-values.js';

const variantGid = z.string().regex(PRODUCT_VARIANT_GID_RE, 'must be gid://shopify/ProductVariant/<id>');
const productGid = z.string().regex(PRODUCT_GID_RE, 'must be gid://shopify/Product/<id>');
const collectionGid = z.string().regex(COLLECTION_GID_RE, 'must be gid://shopify/Collection/<id>');

export const RecommendationPackSchema = z
  .object({
    /** How the offered/recommended products are chosen. */
    strategy: z.enum(RECOMMENDATION_STRATEGIES).default('related'),

    /** manual: explicit variant GIDs (also the deterministic fallback for any dynamic strategy). */
    manualVariantGids: z.array(variantGid).max(RECOMMENDATION_LIMITS.manualVariantsMax).default([]),

    /** related/complementary/buy-it-again seed. Optional: defaults to the current PDP product at render. */
    seedProductGid: productGid.optional(),

    /** collection: source collection + optional single-random pick. */
    collectionGid: collectionGid.optional(),
    collectionRandom: z.boolean().default(false),

    /** Common shaping. */
    productLimit: z
      .number()
      .int()
      .min(RECOMMENDATION_LIMITS.productLimitMin)
      .max(RECOMMENDATION_LIMITS.productLimitMax)
      .default(4),
    excludeTags: z
      .array(z.string().min(1).max(RECOMMENDATION_LIMITS.excludeTagLen))
      .max(RECOMMENDATION_LIMITS.excludeTagsMax)
      .default([]),
    hideCartProducts: z.boolean().default(false),

    /**
     * Deterministic fallback when a dynamic strategy yields nothing at render
     * (empty history, service unavailable, non-Plus). Never leaves an empty slot.
     */
    fallback: z.enum(RECOMMENDATION_FALLBACKS).default('related'),
  })
  .superRefine((v, ctx) => {
    if (v.strategy === 'manual' && v.manualVariantGids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manualVariantGids'],
        message: 'manual strategy requires at least one variant.',
      });
    }
    if (v.strategy === 'collection' && !v.collectionGid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['collectionGid'],
        message: 'collection strategy requires collectionGid.',
      });
    }
    if (v.fallback === 'manual' && v.manualVariantGids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallback'],
        message: 'fallback=manual requires manualVariantGids.',
      });
    }
    if (v.fallback === 'collection' && !v.collectionGid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallback'],
        message: 'fallback=collection requires collectionGid.',
      });
    }
  });

export type RecommendationPack = z.infer<typeof RecommendationPackSchema>;

export const recommendationPack: ControlPack<typeof RecommendationPackSchema> = {
  id: 'recommendation',
  namespace: 'recommendation',
  label: 'Recommendations',
  tier: 'basic',
  schema: RecommendationPackSchema,
  uiSchema: {
    groupLabel: 'Product recommendations',
    order: [
      'strategy',
      'manualVariantGids',
      'seedProductGid',
      'collectionGid',
      'collectionRandom',
      'productLimit',
      'excludeTags',
      'hideCartProducts',
      'fallback',
    ],
    fields: {
      manualVariantGids: {
        widget: 'product-picker',
        showWhen: { field: 'strategy', equals: 'manual' },
      },
      seedProductGid: {
        tier: 'advanced',
        widget: 'product-picker',
        help: 'Defaults to the current product on a PDP.',
      },
      collectionGid: {
        widget: 'collection-picker',
        showWhen: { field: 'strategy', equals: 'collection' },
      },
      collectionRandom: { showWhen: { field: 'strategy', equals: 'collection' } },
      excludeTags: { tier: 'advanced' },
      hideCartProducts: { tier: 'advanced' },
      fallback: {
        tier: 'advanced',
        help: 'Shown when a dynamic strategy has no result (empty history / service down).',
      },
    },
  },
};
