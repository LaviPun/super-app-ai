/**
 * Agentic UCP discovery document (build #7c).
 *
 * `GET /agentic/{shop}/{handle}/.well-known/ucp` — the UCP discovery doc for a published
 * `agentic.catalogProfile` module. Declares the UCP version, the app-served shopping
 * service (the MCP endpoint), and the read-only catalog capability. This is how a
 * UCP-compliant agent discovers the store's MCP endpoint before calling it.
 *
 * Public, unauthenticated, READ-ONLY. An unconfigured shop / unknown handle returns 404
 * `{ configured: false }` (the no-placeholder fence). CORS-open + cached so agents can
 * re-fetch cheaply.
 */
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { readPublishedAgenticFeed } from '~/services/agentic/feed.server';
import { buildUcpDiscovery } from '~/services/agentic/ucp';

const HEADERS = {
  'Cache-Control': 'public, max-age=900',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
} as const;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const shop = params.shop ?? '';
  const handle = params.handle ?? '';

  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: '/agentic/:shop/:handle/.well-known/ucp' },
    async () => {
      if (!shop || !handle) {
        return json({ configured: false }, { status: 404, headers: HEADERS });
      }
      const cfg = await readPublishedAgenticFeed(getPrisma(), shop, handle);
      if (!cfg) {
        return json({ configured: false }, { status: 404, headers: HEADERS });
      }
      const origin = new URL(request.url).origin;
      return json(buildUcpDiscovery(origin, shop, handle), { headers: HEADERS });
    },
  );
}
