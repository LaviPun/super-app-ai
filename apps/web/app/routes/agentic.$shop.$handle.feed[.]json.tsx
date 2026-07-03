/**
 * Agentic catalog-profile feed endpoint (M13).
 *
 * `GET /agentic/{shop}/{handle}/feed.json` — the shipped runtime for the
 * `agentic.catalogProfile` module type. AI crawlers/agents have NO Shopify session,
 * so — exactly like the POS block reads its config from `/api/pos/config` — this
 * feed is served from THIS app's backend: the loader reads the shop's active
 * PUBLISHED `agentic.catalogProfile` module (whose `config.feedHandle` matches
 * `{handle}`), resolves the shop's products via the app's offline admin client, and
 * emits a JSON product-data feed (attributeMap applied, disclosures appended).
 *
 * Public, unauthenticated, READ-ONLY. Only PUBLIC product data is emitted (title /
 * price / availability / images / mapped attributes) — no PII, so no auth is
 * required. No demo/placeholder data: an unconfigured shop / unknown handle returns
 * 404 `{ configured: false, items: [] }` (the no-placeholder fence). Cached and
 * CORS-open so AI channels can re-crawl.
 */
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { readPublishedAgenticFeed, resolveFeedItems } from '~/services/agentic/feed.server';

const CACHE_HEADERS = {
  // AI channels re-crawl feeds; 15-minute cache keeps the offline admin read bounded.
  'Cache-Control': 'public, max-age=900',
  // Feeds are read by external AI agents/crawlers from any origin.
  'Access-Control-Allow-Origin': '*',
} as const;

export async function loader({ params }: LoaderFunctionArgs) {
  const shop = params.shop ?? '';
  const handle = params.handle ?? '';

  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: '/agentic/:shop/:handle/feed.json' },
    async () => {
      if (!shop || !handle) {
        return json({ configured: false, items: [] }, { status: 404, headers: CACHE_HEADERS });
      }

      const cfg = await readPublishedAgenticFeed(getPrisma(), shop, handle);
      if (!cfg) {
        // No published feed for this shop/handle — honest 404, no placeholder data.
        return json({ configured: false, items: [] }, { status: 404, headers: CACHE_HEADERS });
      }

      const items = await resolveFeedItems(cfg, shop);
      return json(
        {
          configured: true,
          shop,
          handle: cfg.feedHandle,
          name: cfg.name,
          count: items.length,
          items,
        },
        { headers: CACHE_HEADERS },
      );
    },
  );
}
