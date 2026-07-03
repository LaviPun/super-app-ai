/**
 * App-served Storefront-Catalog MCP server (build #7c).
 *
 * A minimal JSON-RPC 2.0 dispatcher that binds the UCP Catalog capability over the SAME
 * published `agentic.catalogProfile` config the feed reads. It exposes three READ-ONLY,
 * product-data-only tools (search_catalog / get_product / lookup_catalog) — no PII, no
 * cart/checkout writes. AI agents have no Shopify session, so — exactly like the feed —
 * product resolution runs through the app's offline admin client.
 *
 * We handle the JSON-RPC methods a catalog-only MCP client needs: `initialize`,
 * `tools/list`, and `tools/call`. Unknown methods return a JSON-RPC "method not found"
 * error rather than throwing. This is a config-driven dispatcher, not a full MCP SDK
 * transport (no SSE/streaming) — sufficient for the read-only catalog binding.
 */
import { AGENTIC_MCP_TOOLS, UCP_VERSION } from '@superapp/core';
import type { AgenticFeedConfig, AgenticFeedItem } from './feed-projection';
import { searchCatalog, resolveProductsByIds } from './feed.server';
import { buildMcpToolDescriptors } from './ucp';

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}
function err(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** Wrap catalog items as an MCP tool result (structured JSON in a text content block). */
function toolResult(items: AgenticFeedItem[]): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify({ items, count: items.length }) }] };
}

/**
 * Dispatch a single JSON-RPC request against the published feed config. Returns `null`
 * for a notification (no `id`) — the caller emits 204/empty per JSON-RPC. Never throws
 * for a well-formed request: bad params → INVALID_PARAMS, unknown method → METHOD_NOT_FOUND.
 */
export async function handleMcpRequest(
  req: JsonRpcRequest,
  cfg: AgenticFeedConfig,
  shopDomain: string,
): Promise<JsonRpcResponse | null> {
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return err(req?.id ?? null, INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request.');
  }
  // A request without an id is a notification — acknowledge without a response body.
  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  switch (req.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: `storefront-catalog-mcp:${cfg.feedHandle}`, version: UCP_VERSION },
      });

    case 'notifications/initialized':
      return isNotification ? null : ok(id, {});

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: buildMcpToolDescriptors() });

    case 'tools/call': {
      const name = (req.params?.name as string) ?? '';
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      if (!(AGENTIC_MCP_TOOLS as readonly string[]).includes(name)) {
        return err(id, INVALID_PARAMS, `Unknown tool "${name}".`);
      }

      if (name === 'search_catalog') {
        const query = typeof args.query === 'string' ? args.query : '';
        const limit = typeof args.limit === 'number' ? args.limit : 20;
        const items = await searchCatalog(cfg, shopDomain, query, limit);
        return ok(id, toolResult(items));
      }
      if (name === 'get_product') {
        const productId = typeof args.id === 'string' ? args.id : '';
        if (!productId) return err(id, INVALID_PARAMS, 'get_product requires an "id".');
        const items = await resolveProductsByIds(cfg, shopDomain, [productId]);
        return ok(id, toolResult(items));
      }
      // lookup_catalog
      const ids = Array.isArray(args.ids) ? (args.ids.filter((i) => typeof i === 'string') as string[]) : [];
      if (ids.length === 0) return err(id, INVALID_PARAMS, 'lookup_catalog requires a non-empty "ids" array.');
      const items = await resolveProductsByIds(cfg, shopDomain, ids);
      return ok(id, toolResult(items));
    }

    default:
      return err(id, METHOD_NOT_FOUND, `Method "${req.method}" not found.`);
  }
}

export { PARSE_ERROR };
