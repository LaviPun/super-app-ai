/**
 * Agentic UCP surface — PURE document builders (build #7c).
 *
 * The deterministic "published feed config → UCP discovery / agent-profile / MCP tool
 * descriptor / agents.md" projections, isolated from route + admin-client wiring so they
 * are unit-testable with no session. All are app-served surfaces built on the SAME
 * published `agentic.catalogProfile` config the feed reads — no external registration.
 *
 * Conventions match Shopify's 2026-04 UCP edition (dev-MCP `search_docs_chunks`):
 *   - `/.well-known/ucp` is the discovery doc (version + services).
 *   - the Storefront-Catalog MCP binds the UCP Catalog capability (search_catalog /
 *     get_product / lookup_catalog), JSON-RPC 2.0.
 *   - the agent/business profile is a JSON document the store hosts and agents fetch.
 *   - `agents.md` is Shopify's storefront-populated theme template; we emit the honest
 *     `templates/agents.md.liquid` (flag-gated Theme Edit path) + an app-served copy.
 *
 * PUBLIC only — never emit PII/contact details (these docs are broadly cached).
 */
import {
  UCP_VERSION,
  UCP_SERVICE_NAME,
  UCP_CATALOG_CAPABILITY,
  AGENTIC_MCP_TOOLS,
} from '@superapp/core';
import type { AgenticFeedConfig } from './feed-projection';

/** Absolute base for a published feed's agentic surfaces, e.g. https://app.example.com/agentic/shop/handle. */
export function agenticBaseUrl(origin: string, shop: string, handle: string): string {
  return `${origin.replace(/\/$/, '')}/agentic/${shop}/${handle}`;
}

/**
 * `/.well-known/ucp` discovery document. Declares the UCP version, the app-served
 * shopping service (the MCP endpoint + transport), and the read-only catalog capability
 * this store negotiates. Shape mirrors the UCP business-profile the dev-MCP documents.
 */
export function buildUcpDiscovery(origin: string, shop: string, handle: string) {
  const base = agenticBaseUrl(origin, shop, handle);
  return {
    ucp: {
      version: UCP_VERSION,
      services: {
        [UCP_SERVICE_NAME]: [
          {
            version: UCP_VERSION,
            transport: 'mcp' as const,
            endpoint: `${base}/mcp`,
          },
        ],
      },
      capabilities: {
        [UCP_CATALOG_CAPABILITY]: [{ version: UCP_VERSION }],
      },
      // Read-only catalog store: no cart/checkout/payment handlers are served here.
      payment_handlers: {},
    },
    // Convenience discovery pointers (non-normative) for simple crawlers.
    profile_url: `${base}/agent-profile.json`,
    mcp_endpoint_url: `${base}/mcp`,
    feed_url: `${base}/feed.json`,
  };
}

/**
 * App-served agent/business profile. Describes the store to AI agents: its name, the
 * MCP + discovery URLs, the negotiated catalog capability, and the merchant's public
 * agent instructions. No PII.
 */
export function buildAgentProfile(cfg: AgenticFeedConfig, origin: string, shop: string) {
  const base = agenticBaseUrl(origin, shop, cfg.feedHandle);
  return {
    ucp: {
      version: UCP_VERSION,
      capabilities: {
        [UCP_CATALOG_CAPABILITY]: [{ version: UCP_VERSION }],
      },
    },
    store: {
      name: cfg.name,
      shop,
      discovery_url: `${base}/.well-known/ucp`,
      mcp_endpoint_url: `${base}/mcp`,
      feed_url: `${base}/feed.json`,
    },
    // Public merchant guidance for agents (e.g. "Prioritize fair-trade products."). Optional.
    ...(cfg.agentInstructions ? { instructions: cfg.agentInstructions } : {}),
  };
}

/** MCP `tools/list` descriptors for the app-served Storefront-Catalog MCP (UCP Catalog binding). */
export function buildMcpToolDescriptors() {
  const byName: Record<(typeof AGENTIC_MCP_TOOLS)[number], { description: string; inputSchema: object }> = {
    search_catalog: {
      description: "Search this store's product catalog for items matching a free-text query.",
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search query.' },
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 20).' },
        },
        required: ['query'],
      },
    },
    get_product: {
      description: 'Get a single product by its Shopify product GID.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'A gid://shopify/Product/... id.' } },
        required: ['id'],
      },
    },
    lookup_catalog: {
      description: 'Resolve one or more known product GIDs to their current catalog data.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'Product GIDs to resolve.' },
        },
        required: ['ids'],
      },
    },
  };
  return AGENTIC_MCP_TOOLS.map((name) => ({ name, ...byName[name] }));
}
