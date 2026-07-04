/**
 * Agentic Storefront-Catalog MCP endpoint (build #7c).
 *
 * `POST /agentic/{shop}/{handle}/mcp` — the app-served MCP server for a published
 * `agentic.catalogProfile` module. JSON-RPC 2.0; binds the UCP Catalog capability
 * (search_catalog / get_product / lookup_catalog) over the SAME published config the
 * feed reads. Public, unauthenticated, READ-ONLY, product-data only (no PII, no writes)
 * — AI agents have no Shopify session, so resolution runs through the app's offline
 * admin client, exactly like the feed route.
 *
 * An unconfigured shop / unknown handle returns a JSON-RPC error (no placeholder data).
 * CORS-open so AI channels can call it from any origin.
 */
import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { readPublishedAgenticFeed } from '~/services/agentic/feed.server';
import { handleMcpRequest, type JsonRpcRequest } from '~/services/agentic/mcp-server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
} as const;

function rpcError(code: number, message: string, status: number) {
  return json({ jsonrpc: '2.0', id: null, error: { code, message } }, { status, headers: CORS_HEADERS });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return rpcError(-32600, 'MCP endpoint accepts POST (JSON-RPC 2.0).', 405);
  }

  const shop = params.shop ?? '';
  const handle = params.handle ?? '';

  return withApiLogging(
    { actor: 'APP_PROXY', method: 'POST', path: '/agentic/:shop/:handle/mcp' },
    async () => {
      if (!shop || !handle) return rpcError(-32600, 'Missing shop/handle.', 404);

      let body: JsonRpcRequest;
      try {
        body = (await request.json()) as JsonRpcRequest;
      } catch {
        return rpcError(-32700, 'Parse error: body is not valid JSON.', 400);
      }

      const cfg = await readPublishedAgenticFeed(getPrisma(), shop, handle);
      if (!cfg) {
        // No published feed → honest error, no placeholder catalog.
        return rpcError(-32601, `No published agentic catalog for ${shop}/${handle}.`, 404);
      }

      const res = await handleMcpRequest(body, cfg, shop);
      // Notification (no id) → 204 empty per JSON-RPC.
      if (res === null) return new Response(null, { status: 204, headers: CORS_HEADERS });
      return json(res, { headers: CORS_HEADERS });
    },
  );
}

// A bare GET is a discovery convenience — point callers at the well-known + POST usage.
export async function loader({ params }: LoaderFunctionArgs) {
  const shop = params.shop ?? '';
  const handle = params.handle ?? '';
  return json(
    {
      transport: 'jsonrpc-2.0',
      method: 'POST',
      discovery: `/agentic/${shop}/${handle}/.well-known/ucp`,
      hint: 'POST a JSON-RPC 2.0 request (tools/list, tools/call) to this URL.',
    },
    { headers: CORS_HEADERS },
  );
}
