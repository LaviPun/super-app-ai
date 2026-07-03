/**
 * Recommendation strategy resolver (R2.3) — the SINGLE seam where "which
 * strategies need a backend service" is answered, PLUS the real ranking for the
 * three server-dynamic strategies.
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
 * `recently-viewed`) need ranking over order data or per-session client state
 * that Liquid/Storefront-API cannot compute, so they route here via the
 * App-Proxy route (`routes/proxy.recommend.tsx`).
 *
 * ## What is REAL vs. still honest-fallback (do NOT claim more than is wired)
 *
 * REAL (ranked over live Admin data):
 *   • `top-sellers`  — units sold over a 30-day window (bounded order scan).
 *   • `trending`     — units sold over a 7-day window, recency-weighted velocity.
 *   • `buy-it-again` — the signed-in customer's own previously-purchased products
 *                      (needs `customerId`; guests degrade honestly to `[]`).
 *
 * HONEST `[]` → fallback (cannot be computed here):
 *   • `recently-viewed` — client-only (localStorage); never reaches this service.
 *   • every static strategy — resolved in Liquid / Storefront API.
 *   • any dynamic strategy invoked without an `admin` client, or when the query
 *     yields too few products — the caller applies the module's `fallback`.
 *
 * ## Data source & why (the "no naive scan" decision)
 *
 * Admin GraphQL has NO shop-level "best sellers" sort (`BEST_SELLING` exists only
 * on `Collection.products`, not the top-level `products` query — verified against
 * 2026-04), and there is no synced order table in this app's DB (no Order/LineItem
 * Prisma model). So the only real source is the Admin `orders` connection. To keep
 * it performant we DO NOT scan every order:
 *   • time-box the query to a short recent window (`created_at:>=…`);
 *   • cap the pages walked (`MAX_ORDER_PAGES`) so cost is bounded regardless of
 *     store volume — a large store's top sellers are stable within the sampled
 *     window, so a bounded sample is representative;
 *   • cache each aggregation in-process for `CACHE_TTL_MS`, keyed by
 *     shop + strategy + window, so repeated storefront hits reuse one scan.
 * The App-Proxy route adds an HTTP `cache-control` on top for edge/browser reuse.
 *
 * Freshness: results are at most `CACHE_TTL_MS` (5 min) stale in-process, plus the
 * route's `max-age`. Acceptable for merchandising rank; not real-time.
 */
import {
  STATIC_RECOMMENDATION_STRATEGIES,
  type RecommendationStrategy,
} from '@superapp/core';
import type { AdminApiContext } from '~/types/shopify';

/** Just the graphql-capable admin client (mirrors BundleProductService). */
type AdminClient = AdminApiContext['admin'];

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
  /**
   * Admin GraphQL client (from `shopify.authenticate.public.appProxy`). Required
   * to rank the dynamic strategies. Absent (or in unit tests without a mock) →
   * dynamic strategies degrade honestly to `[]` and the caller applies fallback.
   */
  admin?: AdminClient;
  /** Logged-in customer GID (App Proxy passes it); required for buy-it-again. */
  customerId?: string;
  /** Seed product GID for related/complementary/buy-it-again (unused for the ranked ones). */
  seedProductGid?: string;
  /** Products carrying any of these tags are excluded from the result. */
  excludeTags?: string[];
}

// ── Tuning knobs (data + perf) ─────────────────────────────────────────────────
/** Best-sellers window: broad enough to be stable, recent enough to stay current. */
const TOP_SELLERS_WINDOW_DAYS = 30;
/** Trending window: short so it reflects *current* velocity, not all-time volume. */
const TRENDING_WINDOW_DAYS = 7;
/** Orders fetched per page (Shopify allows up to 250; 50 line items each). */
const ORDERS_PAGE_SIZE = 50;
/** Hard cap on pages walked per aggregation — bounds cost on high-volume stores. */
const MAX_ORDER_PAGES = 6; // ≤ 300 orders sampled per window
/** Customer order history pages for buy-it-again (their own orders are few). */
const MAX_CUSTOMER_ORDER_PAGES = 3;
/** In-process cache TTL for a completed aggregation. */
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── GraphQL (validated against Admin 2026-04) ──────────────────────────────────
const PRODUCT_FIELDS = `
  id
  title
  handle
  onlineStoreUrl
  tags
  featuredMedia { preview { image { url } } }
  priceRangeV2 { minVariantPrice { amount currencyCode } }
`;

const RECENT_ORDERS_QUERY = `#graphql
  query SuperAppRecentOrders($first: Int!, $query: String!, $after: String) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        createdAt
        lineItems(first: 50) {
          nodes {
            quantity
            product { ${PRODUCT_FIELDS} }
          }
        }
      }
    }
  }
`;

const CUSTOMER_ORDERS_QUERY = `#graphql
  query SuperAppCustomerOrders($customerId: ID!, $first: Int!, $after: String) {
    customer(id: $customerId) {
      id
      orders(first: $first, sortKey: CREATED_AT, reverse: true, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          createdAt
          lineItems(first: 50) {
            nodes {
              quantity
              product { ${PRODUCT_FIELDS} }
            }
          }
        }
      }
    }
  }
`;

// ── Response typing ────────────────────────────────────────────────────────────
type ProductNode = {
  id: string;
  title?: string | null;
  handle?: string | null;
  onlineStoreUrl?: string | null;
  tags?: string[] | null;
  featuredMedia?: { preview?: { image?: { url?: string | null } | null } | null } | null;
  priceRangeV2?: { minVariantPrice?: { amount?: string | null; currencyCode?: string | null } | null } | null;
};

type OrderNode = {
  id: string;
  createdAt?: string | null;
  lineItems?: { nodes?: Array<{ quantity?: number | null; product?: ProductNode | null }> } | null;
};

type OrdersConnection = {
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  nodes?: OrderNode[] | null;
};

/** Internal accumulator per product while aggregating a window. */
type ProductScore = {
  product: ProductNode;
  units: number;
  /** Recency-weighted units (for trending) and a recency tiebreaker for buy-it-again. */
  weighted: number;
  /** Most recent purchase timestamp seen (ms epoch) — buy-it-again ordering. */
  lastAt: number;
};

// ── In-process cache ───────────────────────────────────────────────────────────
type CacheEntry = { at: number; products: ResolvedProduct[] };
const rankCache = new Map<string, CacheEntry>();

function cacheKey(shop: string, strategy: string, extra = ''): string {
  return `${shop}::${strategy}::${extra}`;
}

function readCache(key: string): ResolvedProduct[] | undefined {
  const hit = rankCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    rankCache.delete(key);
    return undefined;
  }
  return hit.products;
}

function writeCache(key: string, products: ResolvedProduct[]): void {
  rankCache.set(key, { at: Date.now(), products });
}

/** Test-only: clear the aggregation cache between cases. */
export function __clearRecommendationCache(): void {
  rankCache.clear();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function windowQuery(days: number): string {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // `created_at:>=YYYY-MM-DDTHH:mm:ssZ` — Shopify search syntax on the orders connection.
  return `created_at:>=${since.toISOString()}`;
}

function toResolvedProduct(p: ProductNode): ResolvedProduct | null {
  if (!p?.id) return null;
  const url = p.onlineStoreUrl ?? (p.handle ? `/products/${p.handle}` : '');
  if (!url) return null; // unpublished / no storefront URL → cannot link, skip
  return {
    id: p.id,
    title: p.title ?? '',
    url,
    price: p.priceRangeV2?.minVariantPrice?.amount ?? '',
    featuredImage: p.featuredMedia?.preview?.image?.url ?? undefined,
  };
}

function hasExcludedTag(p: ProductNode, exclude: Set<string>): boolean {
  if (exclude.size === 0) return false;
  for (const t of p.tags ?? []) {
    if (exclude.has(t.toLowerCase())) return true;
  }
  return false;
}

/**
 * Fold an orders connection page into the score map. `now` anchors recency
 * weighting so trending favours the freshest sales; `windowDays` normalises the
 * decay so a product bought today outweighs one bought at the window's edge.
 */
function accumulate(
  scores: Map<string, ProductScore>,
  orders: OrderNode[],
  now: number,
  windowDays: number,
): void {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  for (const order of orders) {
    const at = order.createdAt ? Date.parse(order.createdAt) : now;
    const ageMs = Math.max(0, now - at);
    // Linear recency weight in [~0.1, 1]: newest orders ≈1, window-edge ≈0.1.
    const recency = Math.max(0.1, 1 - ageMs / windowMs);
    for (const li of order.lineItems?.nodes ?? []) {
      const p = li.product;
      if (!p?.id) continue; // custom/deleted line item
      const qty = Math.max(0, li.quantity ?? 0);
      if (qty === 0) continue;
      const cur = scores.get(p.id) ?? { product: p, units: 0, weighted: 0, lastAt: 0 };
      cur.product = p; // keep latest product snapshot
      cur.units += qty;
      cur.weighted += qty * recency;
      cur.lastAt = Math.max(cur.lastAt, at);
      scores.set(p.id, cur);
    }
  }
}

/** Rank the score map by the requested key, filter tags, map to ResolvedProduct. */
function finalize(
  scores: Map<string, ProductScore>,
  rankBy: 'units' | 'weighted' | 'recency',
  limit: number,
  excludeTags: string[],
): ResolvedProduct[] {
  const exclude = new Set(excludeTags.map((t) => t.toLowerCase()));
  const ranked = [...scores.values()]
    .filter((s) => !hasExcludedTag(s.product, exclude))
    .sort((a, b) => {
      if (rankBy === 'units') return b.units - a.units || b.weighted - a.weighted;
      if (rankBy === 'weighted') return b.weighted - a.weighted || b.units - a.units;
      // recency (buy-it-again): most recent first, then most-purchased
      return b.lastAt - a.lastAt || b.units - a.units;
    });
  const out: ResolvedProduct[] = [];
  for (const s of ranked) {
    const rp = toResolvedProduct(s.product);
    if (rp) out.push(rp);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Order-scan primitive (bounded) ─────────────────────────────────────────────
async function scanRecentOrders(
  admin: AdminClient,
  windowDays: number,
): Promise<Map<string, ProductScore>> {
  const scores = new Map<string, ProductScore>();
  const now = Date.now();
  const query = windowQuery(windowDays);
  let after: string | undefined;
  for (let page = 0; page < MAX_ORDER_PAGES; page++) {
    const res = await admin.graphql(RECENT_ORDERS_QUERY, {
      variables: { first: ORDERS_PAGE_SIZE, query, after: after ?? null },
    });
    const body = (await res.json()) as { data?: { orders?: OrdersConnection } };
    const conn = body?.data?.orders;
    if (!conn) break;
    accumulate(scores, conn.nodes ?? [], now, windowDays);
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return scores;
}

async function scanCustomerOrders(
  admin: AdminClient,
  customerId: string,
): Promise<Map<string, ProductScore>> {
  const scores = new Map<string, ProductScore>();
  const now = Date.now();
  let after: string | undefined;
  for (let page = 0; page < MAX_CUSTOMER_ORDER_PAGES; page++) {
    const res = await admin.graphql(CUSTOMER_ORDERS_QUERY, {
      variables: { customerId, first: ORDERS_PAGE_SIZE, after: after ?? null },
    });
    const body = (await res.json()) as {
      data?: { customer?: { orders?: OrdersConnection } | null };
    };
    const conn = body?.data?.customer?.orders;
    if (!conn) break;
    // Window = 365d so recency weighting stays meaningful across a year of history.
    accumulate(scores, conn.nodes ?? [], now, 365);
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return scores;
}

/** Generous cap on how many ranked products we cache, so many `limit`s reuse one scan. */
const RANKED_CACHE_SIZE = 50;

/** Stable signature of the excludeTags set for the cache key (order-insensitive). */
function tagSig(excludeTags: string[] | undefined): string {
  if (!excludeTags || excludeTags.length === 0) return '';
  return [...new Set(excludeTags.map((t) => t.toLowerCase()))].sort().join(',');
}

// ── Per-strategy resolvers ─────────────────────────────────────────────────────
// Each caches the full ranked (tag-filtered) list keyed by shop+strategy+window
// (+customer / +excludeTags where they change the result), then slices to `limit`.
async function topSellers(admin: AdminClient, args: ResolveRecommendationArgs): Promise<ResolvedProduct[]> {
  const key = cacheKey(args.shop, 'top-sellers', `${TOP_SELLERS_WINDOW_DAYS}:${tagSig(args.excludeTags)}`);
  const cached = readCache(key);
  if (cached) return cached.slice(0, args.limit);
  const scores = await scanRecentOrders(admin, TOP_SELLERS_WINDOW_DAYS);
  const ranked = finalize(scores, 'units', RANKED_CACHE_SIZE, args.excludeTags ?? []);
  writeCache(key, ranked);
  return ranked.slice(0, args.limit);
}

async function trending(admin: AdminClient, args: ResolveRecommendationArgs): Promise<ResolvedProduct[]> {
  const key = cacheKey(args.shop, 'trending', `${TRENDING_WINDOW_DAYS}:${tagSig(args.excludeTags)}`);
  const cached = readCache(key);
  if (cached) return cached.slice(0, args.limit);
  const scores = await scanRecentOrders(admin, TRENDING_WINDOW_DAYS);
  const ranked = finalize(scores, 'weighted', RANKED_CACHE_SIZE, args.excludeTags ?? []);
  writeCache(key, ranked);
  return ranked.slice(0, args.limit);
}

async function buyItAgain(admin: AdminClient, args: ResolveRecommendationArgs): Promise<ResolvedProduct[]> {
  if (!args.customerId) return []; // guest → honest fallback
  const key = cacheKey(args.shop, 'buy-it-again', `${args.customerId}:${tagSig(args.excludeTags)}`);
  const cached = readCache(key);
  if (cached) return cached.slice(0, args.limit);
  const scores = await scanCustomerOrders(admin, args.customerId);
  const ranked = finalize(scores, 'recency', RANKED_CACHE_SIZE, args.excludeTags ?? []);
  writeCache(key, ranked);
  return ranked.slice(0, args.limit);
}

/**
 * Resolve a DYNAMIC recommendation strategy to concrete, ranked products.
 *
 * INVARIANT: static strategies never reach here — they resolve in Liquid /
 * Storefront API — so this returns `[]` for them (the split fence).
 *
 * Dynamic strategies rank over live Admin order data (`top-sellers`, `trending`,
 * `buy-it-again`). Without an `admin` client (or for `recently-viewed`, which is
 * client-only) they return `[]` and the caller applies the module's `fallback`.
 */
export async function resolveRecommendation(args: ResolveRecommendationArgs): Promise<ResolvedProduct[]> {
  // Split fence: static strategies must be resolved by Liquid / Storefront API,
  // never by this service. Returning [] here is a design invariant, not a stub.
  if (isStaticStrategy(args.strategy)) return [];

  // No admin client → we cannot query Shopify. Degrade honestly to fallback.
  const admin = args.admin;

  try {
    switch (args.strategy) {
      case 'top-sellers':
        return admin ? await topSellers(admin, args) : [];
      case 'trending':
        return admin ? await trending(admin, args) : [];
      case 'buy-it-again':
        return admin ? await buyItAgain(admin, args) : [];
      case 'recently-viewed':
        // Client-only (localStorage); never computed server-side.
        return [];
      default:
        return [];
    }
  } catch {
    // Any Admin/API failure → honest empty result → caller applies fallback.
    return [];
  }
}
