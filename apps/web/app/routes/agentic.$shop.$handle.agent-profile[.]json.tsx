/**
 * Agentic agent/business profile document (build #7c).
 *
 * `GET /agentic/{shop}/{handle}/agent-profile.json` — the app-served agent/business
 * profile for a published `agentic.catalogProfile` module. Describes the store to AI
 * agents: name, MCP + discovery URLs, negotiated catalog capability, and the merchant's
 * PUBLIC agent instructions. No PII (broadly cached).
 *
 * Public, unauthenticated, READ-ONLY. Unconfigured shop / unknown handle → 404
 * `{ configured: false }` (the no-placeholder fence). CORS-open + cached.
 */
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { readPublishedAgenticFeed } from '~/services/agentic/feed.server';
import { buildAgentProfile } from '~/services/agentic/ucp';

const HEADERS = {
  'Cache-Control': 'public, max-age=900',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
} as const;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const shop = params.shop ?? '';
  const handle = params.handle ?? '';

  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: '/agentic/:shop/:handle/agent-profile.json' },
    async () => {
      if (!shop || !handle) {
        return json({ configured: false }, { status: 404, headers: HEADERS });
      }
      const cfg = await readPublishedAgenticFeed(getPrisma(), shop, handle);
      if (!cfg) {
        return json({ configured: false }, { status: 404, headers: HEADERS });
      }
      const origin = new URL(request.url).origin;
      return json(buildAgentProfile(cfg, origin, shop), { headers: HEADERS });
    },
  );
}
