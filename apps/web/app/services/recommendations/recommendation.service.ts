/**
 * Recommendation strategy resolver (R2.3) — the SINGLE seam where "which
 * strategies need a backend service" is answered.
 *
 * ## The resolver split (the core R2.3 design)
 *
 * STATIC strategies (`manual`, `collection`, `related`, `complementary`,
 * `most-expensive-in-cart`, `cheapest-in-cart`) resolve WITHOUT this service:
 *   • storefront → Liquid `recommendations`/`collections`/cart +
 *     native `/recommendations/products.json` (see
 *     `extensions/theme-app-extension/snippets/superapp-recommendations.liquid`
 *     and `assets/superapp-modules.js`).
 *   • checkout → Storefront-API `productRecommendations`/`collection`
 *     (`extensions/checkout-ui/src/hooks/useCheckoutConfig.ts`).
 * They MUST return `[]` from this service — that is the "renders without a
 * service" fence, asserted by `recommendation.service.test.ts`.
 *
 * DYNAMIC strategies (`top-sellers`, `trending`, `buy-it-again`,
 * `recently-viewed`) need ranking over order/analytics data or per-session
 * client state that Liquid/Storefront-API cannot compute, so they route here via
 * the App-Proxy route (`routes/proxy.recommend.tsx`).
 *
 * ## HONEST STATE (do NOT claim more than is wired) — the R2.2-style follow-up
 *
 * The ranking queries themselves (Admin GraphQL orders scan for
 * `top-sellers`/`trending`, customer order history for `buy-it-again`) are **not
 * yet implemented**. This resolver is the built, tested SEAM — it enforces the
 * split invariant and gives the proxy route + JS a stable contract — but every
 * dynamic strategy currently returns `[]`, which makes the storefront JS apply
 * the module's `fallback` (a STATIC strategy or `hide`). So the feature ships
 * USEFUL today (all six static strategies resolve for real) and the four dynamic
 * ones degrade gracefully to `fallback` until their queries land. `recently-viewed`
 * is client-only (localStorage) and never reaches this service at all.
 *
 * Mirrors R2.2's discipline: the wasm discount handler for the new `apply` keys
 * was tracked as a fast-follow rather than faked; here the analytics ranking
 * queries are the fast-follow, not faked.
 */
import {
  STATIC_RECOMMENDATION_STRATEGIES,
  type RecommendationStrategy,
} from '@superapp/core';

/** A product resolved for a recommendation slot (the JSON the proxy returns). */
export type ResolvedProduct = {
  id: string;
  title: string;
  url: string;
  price: string;
  featuredImage?: string;
};

const STATIC_SET: ReadonlySet<string> = new Set<string>(STATIC_RECOMMENDATION_STRATEGIES);

/** True for strategies that must resolve with no backend service. */
export function isStaticStrategy(strategy: string): boolean {
  return STATIC_SET.has(strategy);
}

export interface ResolveRecommendationArgs {
  shop: string;
  strategy: RecommendationStrategy;
  limit: number;
  /** Logged-in customer GID (App Proxy passes it); required for buy-it-again. */
  customerId?: string;
  /** Seed product GID for related/complementary/buy-it-again (unused for the ranked ones). */
  seedProductGid?: string;
}

/**
 * Resolve a DYNAMIC recommendation strategy to concrete products.
 *
 * INVARIANT: static strategies never reach here — they resolve in Liquid /
 * Storefront API — so this returns `[]` for them (the split fence). Dynamic
 * strategies currently also return `[]` (see "HONEST STATE" above): the ranking
 * queries are an open follow-up, so the caller degrades to `fallback`.
 */
export async function resolveRecommendation(args: ResolveRecommendationArgs): Promise<ResolvedProduct[]> {
  // Split fence: static strategies must be resolved by Liquid / Storefront API,
  // never by this service. Returning [] here is a design invariant, not a stub.
  if (isStaticStrategy(args.strategy)) return [];

  switch (args.strategy) {
    case 'top-sellers':
    case 'trending':
    case 'buy-it-again':
    case 'recently-viewed':
      // FOLLOW-UP (R2.3): the Admin-GraphQL / analytics ranking queries are not
      // yet built. Return [] so the storefront applies the module's `fallback`
      // (never render a fabricated result). Wire the real queries here — the
      // proxy route + JS contract already accommodate them.
      return [];
    default:
      return [];
  }
}
