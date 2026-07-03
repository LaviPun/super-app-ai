/**
 * App Proxy route (R2.3) — resolves DYNAMIC recommendation strategies
 * (top-sellers / trending / buy-it-again) server-side and returns JSON products.
 *
 * Static strategies (manual / collection / related / complementary / cart-derived)
 * never call this route — they resolve in Liquid / the Storefront-API Ajax
 * endpoints (see `superapp-recommendations.liquid` + `superapp-modules.js`).
 * `recently-viewed` is client-only (localStorage) and also never reaches here.
 *
 * STATE: `recommendation.service.ts` ranks `top-sellers`, `trending`, and
 * `buy-it-again` over live Admin order data (bounded, cached). `recently-viewed`
 * stays client-only (never reaches here). When a ranked query yields too few
 * products (or the customer is a guest for buy-it-again), the service returns a
 * short/empty list and the storefront JS applies the module's `fallback`.
 *
 * Mirrors `proxy.$widgetId.tsx`: `shopify.authenticate.public.appProxy`,
 * `withApiLogging`, short cache-control.
 */
import { json } from '@remix-run/node';
import {
  RECOMMENDATION_STRATEGIES,
  RECOMMENDATION_LIMITS,
  type RecommendationStrategy,
} from '@superapp/core';
import { shopify } from '~/shopify.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import {
  resolveRecommendation,
  isStaticStrategy,
} from '~/services/recommendations/recommendation.service';

const STRATEGY_SET: ReadonlySet<string> = new Set<string>(RECOMMENDATION_STRATEGIES);

function parseLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 4;
  return Math.min(Math.max(n, RECOMMENDATION_LIMITS.productLimitMin), RECOMMENDATION_LIMITS.productLimitMax);
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const strategy = url.searchParams.get('strategy') ?? '';
  const limit = parseLimit(url.searchParams.get('limit'));
  const moduleId = url.searchParams.get('module_id') ?? '';
  const seedProductGid = url.searchParams.get('seed') ?? undefined;
  const excludeTagsRaw = url.searchParams.get('exclude_tags') ?? '';
  const excludeTags = excludeTagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: '/proxy/recommend' },
    async () => {
      // Reject unknown strategies — closed enum, no free-form input.
      if (!STRATEGY_SET.has(strategy)) {
        return json({ error: 'Unknown strategy', products: [] }, { status: 400 });
      }
      // Static strategies must never come here (they resolve in Liquid / JS). If
      // one does, return empty rather than pretend to resolve it.
      if (isStaticStrategy(strategy)) {
        return json(
          { products: [] },
          { headers: { 'cache-control': 'public, max-age=60' } },
        );
      }

      const { admin: adminMaybe, session } = await shopify.authenticate.public.appProxy(request);
      if (!adminMaybe) return json({ error: 'Admin context unavailable', products: [] }, { status: 503 });

      const products = await resolveRecommendation({
        shop: session?.shop ?? url.searchParams.get('shop') ?? '',
        strategy: strategy as RecommendationStrategy,
        limit,
        seedProductGid,
        excludeTags,
        // Admin GraphQL client — required to rank the dynamic strategies.
        admin: adminMaybe,
        // Logged-in customer is provided by App Proxy signed params when present.
        customerId: url.searchParams.get('logged_in_customer_id') ?? undefined,
      });

      return json(
        { moduleId, strategy, products: products.slice(0, limit) },
        {
          // Short cache; dynamic ranking is coarse-grained and cached in-process too.
          // A short/empty result → storefront JS applies the module `fallback`.
          headers: { 'cache-control': 'public, max-age=120' },
        },
      );
    },
  );
}
