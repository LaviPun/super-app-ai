/**
 * POS UI extension config endpoint.
 *
 * The POS block (extensions/superapp-pos-block) fetches this route to obtain the
 * shop's PUBLISHED `pos.extension` module config. POS UI extensions cannot read
 * Storefront-accessible metaobjects, so — unlike the theme / customer-account
 * surfaces which use `shopify.query()` — POS reads config from THIS app's backend
 * via App Authentication: the extension attaches a Shopify session token (POS
 * 10.6.0+ / api_version 2025-07+) and `authenticate.public.pos` verifies it here.
 *
 * The loader resolves the shop from the validated session token (`dest`), reads
 * the published config from the DB (same source of truth every other surface
 * publishes to — a module's active PUBLISHED ModuleVersion), and returns JSON
 * with the CORS headers POS requires. No demo/placeholder data: an unconfigured
 * shop returns `{ configured: false, blocks: [] }`.
 */
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { readPublishedPosConfig } from '~/services/pos/pos-config.server';

/** Normalize a session-token `dest` (e.g. `https://shop.myshopify.com`) to a bare shop domain. */
function shopDomainFromDest(dest: string): string {
  try {
    // `dest` is the shop's URL; strip protocol/path to get the myshopify domain.
    return new URL(dest).host;
  } catch {
    return dest.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  // App Authentication for POS UI extensions: verifies the session token and
  // provides a `cors` helper that sets the headers POS requires on the response.
  const { sessionToken, cors } = await shopify.authenticate.public.pos(request);
  const shopDomain = shopDomainFromDest(String(sessionToken.dest ?? ''));

  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: '/api/pos/config' },
    async () => {
      if (!shopDomain) {
        return cors(json({ configured: false, blocks: [] }, { status: 200 }));
      }
      const result = await readPublishedPosConfig(getPrisma(), shopDomain);
      return cors(json({ ...result, shop: shopDomain }));
    },
  );
}
