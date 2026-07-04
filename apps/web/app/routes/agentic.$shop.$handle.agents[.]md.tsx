/**
 * Agentic app-served agents.md (build #7c).
 *
 * `GET /agentic/{shop}/{handle}/agents.md` — an app-served agent-instructions document
 * for a published `agentic.catalogProfile` module. This app route is the ENTIRE agents.md
 * surface: it resolves the UCP/MCP pointers against our app-served endpoints and serves
 * them as `text/markdown`, no grant required. A theme-emitted canonical
 * `templates/agents.md.liquid` (which would reference the storefront-populated `agents`
 * Liquid object) is NOT implemented — there is no compiler/publish path for it. No PII.
 *
 * Public, unauthenticated, READ-ONLY. Unconfigured shop / unknown handle → 404. Cached.
 */
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { readPublishedAgenticFeed } from '~/services/agentic/feed.server';
import { agenticBaseUrl } from '~/services/agentic/ucp';

const HEADERS = {
  'Cache-Control': 'public, max-age=900',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'text/markdown; charset=utf-8',
} as const;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const shop = params.shop ?? '';
  const handle = params.handle ?? '';

  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: '/agentic/:shop/:handle/agents.md' },
    async () => {
      if (!shop || !handle) return new Response('Not found', { status: 404, headers: HEADERS });
      const cfg = await readPublishedAgenticFeed(getPrisma(), shop, handle);
      if (!cfg) return new Response('Not found', { status: 404, headers: HEADERS });

      const origin = new URL(request.url).origin;
      const base = agenticBaseUrl(origin, shop, handle);
      const guidance = cfg.agentInstructions
        ? `\n## Merchant guidance\n\n${cfg.agentInstructions}\n`
        : '';
      const md = `# Agent Instructions — ${cfg.name}

This document describes how AI agents can interact with the store "${cfg.name}" (${shop}).

## Commerce Protocol (UCP)

This store exposes an app-served Universal Commerce Protocol surface for agent-driven catalog discovery:

- Discovery: \`GET ${base}/.well-known/ucp\`
- MCP endpoint: \`POST ${base}/mcp\` (JSON-RPC 2.0: search_catalog, get_product, lookup_catalog)
- Agent profile: \`GET ${base}/agent-profile.json\`

## Read-only catalog

- Product feed (JSON): \`GET ${base}/feed.json\`

This surface is read-only and returns public product data only.
${guidance}`;
      return new Response(md, { headers: HEADERS });
    },
  );
}
