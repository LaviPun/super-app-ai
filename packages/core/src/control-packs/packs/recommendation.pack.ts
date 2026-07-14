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
 * The `strategy` field IS a per-type enum (R2.5 / plan 3a). At the union level it
 * keeps the full closed `z.enum(RECOMMENDATION_STRATEGIES)` (all ten values) so
 * already-persisted specs — including checkout/post-purchase templates that lead
 * with a DYNAMIC strategy + `fallback` — keep validating. The TIGHT per-type
 * option-set is supplied by the catalog in `type-enums.ts`: buyer-facing surfaces
 * that CANNOT reach the App-Proxy recommendation service (`checkout.upsell`,
 * `checkout.block`, `postPurchase.offer`) resolve only the STATIC six — the four
 * DYNAMIC strategies (top-sellers / trending / buy-it-again / recently-viewed)
 * always degrade to `fallback` there (extensions/checkout-ui has no proxy access),
 * so generation must not emit a strategy that silently no-ops. `theme.section`
 * resolves the full set (an app-proxy widget CAN rank server-side). This mirrors
 * the pricing-`mechanism` honesty drop (declarative-only mechanisms no runtime
 * honours) — same mechanism, applied to strategies no checkout resolver honours.
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
import type { ControlPack, TypeEnumField } from '../types.js';

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

/**
 * The `strategy` per-type enum slot (R2.5 / plan 3a). `fallback` is the FULL
 * strategy set (kept single-source with allowed-values), covering
 * `theme.section` and any future recommendation-bearing type without a catalog
 * entry. Buyer-facing checkout/post-purchase types narrow this to the static six
 * via the catalog in `type-enums.ts`. `default` matches the schema default so a
 * catalog whose set still contains 'related' keeps it, and the generation-schema
 * default stays inside the tightened enum on every surface (static set includes
 * 'related').
 */
const strategyField: TypeEnumField = {
  kind: 'typeEnum',
  enumKey: 'strategy',
  fallback: RECOMMENDATION_STRATEGIES.map((value) => ({ value })),
  default: 'related',
};

export const recommendationPack: ControlPack<typeof RecommendationPackSchema> = {
  id: 'recommendation',
  namespace: 'recommendation',
  label: 'Recommendations',
  tier: 'basic',
  schema: RecommendationPackSchema,
  typeEnums: { strategy: strategyField },
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
