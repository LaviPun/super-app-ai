import { describe, it, expect } from 'vitest';
import { UCP_VERSION, UCP_SERVICE_NAME, UCP_CATALOG_CAPABILITY, AGENTIC_MCP_TOOLS } from '@superapp/core';
import {
  agenticBaseUrl,
  buildUcpDiscovery,
  buildAgentProfile,
  buildMcpToolDescriptors,
  buildAgentsMdLiquid,
} from '~/services/agentic/ucp';
import { handleMcpRequest } from '~/services/agentic/mcp-server';
import type { AgenticFeedConfig } from '~/services/agentic/feed-projection';

/**
 * Build #7c — app-served agentic UCP surface: discovery, agent-profile, MCP dispatch,
 * agents.md. All PURE builders + the JSON-RPC dispatch paths that don't touch the DB.
 */

const ORIGIN = 'https://app.example.com';
const SHOP = 'shop.myshopify.com';

const cfg = (over: Partial<AgenticFeedConfig> = {}): AgenticFeedConfig => ({
  moduleId: 'mod-1',
  name: 'Summer Catalog',
  feedHandle: 'summer',
  artifacts: ['catalog-feed', 'mcp-endpoint', 'agent-profile', 'sponsored-products'],
  source: { kind: 'all' },
  attributeMap: [],
  disclosures: [],
  sponsoredProductIds: [],
  ...over,
});

describe('agenticBaseUrl', () => {
  it('joins origin/shop/handle and trims a trailing slash', () => {
    expect(agenticBaseUrl('https://app.example.com/', SHOP, 'summer')).toBe(
      'https://app.example.com/agentic/shop.myshopify.com/summer',
    );
  });
});

describe('buildUcpDiscovery (/.well-known/ucp)', () => {
  it('declares the UCP version, the MCP service endpoint, and the catalog capability', () => {
    const doc = buildUcpDiscovery(ORIGIN, SHOP, 'summer');
    expect(doc.ucp.version).toBe(UCP_VERSION);
    const svc = doc.ucp.services[UCP_SERVICE_NAME]?.[0];
    expect(svc?.transport).toBe('mcp');
    expect(svc?.endpoint).toBe(`${ORIGIN}/agentic/${SHOP}/summer/mcp`);
    expect(doc.ucp.capabilities[UCP_CATALOG_CAPABILITY]?.[0]?.version).toBe(UCP_VERSION);
    // Read-only catalog: no payment handlers served here.
    expect(doc.ucp.payment_handlers).toEqual({});
    expect(doc.mcp_endpoint_url).toBe(`${ORIGIN}/agentic/${SHOP}/summer/mcp`);
  });
});

describe('buildAgentProfile (/agent-profile.json)', () => {
  it('describes the store with MCP + discovery URLs and the catalog capability', () => {
    const doc = buildAgentProfile(cfg(), ORIGIN, SHOP);
    expect(doc.store.name).toBe('Summer Catalog');
    expect(doc.store.mcp_endpoint_url).toBe(`${ORIGIN}/agentic/${SHOP}/summer/mcp`);
    expect(doc.store.discovery_url).toBe(`${ORIGIN}/agentic/${SHOP}/summer/.well-known/ucp`);
    expect(doc.ucp.capabilities[UCP_CATALOG_CAPABILITY]?.[0]?.version).toBe(UCP_VERSION);
    // No merchant instructions → the field is omitted (not null).
    expect('instructions' in doc).toBe(false);
  });

  it('includes public agent instructions when configured', () => {
    const doc = buildAgentProfile(cfg({ agentInstructions: 'Prioritize fair-trade.' }), ORIGIN, SHOP);
    expect((doc as { instructions?: string }).instructions).toBe('Prioritize fair-trade.');
  });

  it('never leaks PII shapes', () => {
    const doc = buildAgentProfile(cfg({ agentInstructions: 'Be helpful.' }), ORIGIN, SHOP);
    expect(JSON.stringify(doc)).not.toMatch(/email|phone|customer/i);
  });
});

describe('buildMcpToolDescriptors', () => {
  it('exposes exactly the UCP catalog tools with input schemas', () => {
    const tools = buildMcpToolDescriptors();
    expect(tools.map((t) => t.name).sort()).toEqual([...AGENTIC_MCP_TOOLS].sort());
    for (const t of tools) {
      expect(typeof t.description).toBe('string');
      expect(t.inputSchema).toHaveProperty('type', 'object');
    }
  });
});

describe('buildAgentsMdLiquid (canonical theme template body)', () => {
  it('references the storefront-populated agents Liquid object (only honest via Theme Edit)', () => {
    const md = buildAgentsMdLiquid(cfg());
    expect(md).toContain('{{ agents.store_name }}');
    expect(md).toContain('{{ agents.ucp_discovery_url }}');
    expect(md).toContain('{{ agents.mcp_endpoint_url }}');
  });

  it('appends sanitized merchant guidance (strips Liquid delimiters)', () => {
    const md = buildAgentsMdLiquid(cfg({ agentInstructions: 'Show {{ evil }} sales.' }));
    expect(md).toContain('## Merchant guidance');
    expect(md).not.toContain('{{ evil }}');
    expect(md).toContain('Show  evil  sales.');
  });
});

describe('handleMcpRequest — dispatch (no-DB paths)', () => {
  it('rejects a non-2.0 request as invalid', async () => {
    const res = await handleMcpRequest({ method: 'initialize', id: 1 } as never, cfg(), SHOP);
    expect(res?.error?.code).toBe(-32600);
  });

  it('answers initialize with server info + tools capability', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, cfg(), SHOP);
    expect(res?.result).toMatchObject({ capabilities: { tools: {} } });
  });

  it('lists exactly the UCP catalog tools', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, cfg(), SHOP);
    const names = ((res?.result as { tools: Array<{ name: string }> }).tools).map((t) => t.name);
    expect(names.sort()).toEqual([...AGENTIC_MCP_TOOLS].sort());
  });

  it('returns method-not-found for an unknown method', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'wat' }, cfg(), SHOP);
    expect(res?.error?.code).toBe(-32601);
  });

  it('rejects tools/call for an unknown tool', async () => {
    const res = await handleMcpRequest(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'delete_everything', arguments: {} } },
      cfg(),
      SHOP,
    );
    expect(res?.error?.code).toBe(-32602);
  });

  it('rejects get_product without an id', async () => {
    const res = await handleMcpRequest(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_product', arguments: {} } },
      cfg(),
      SHOP,
    );
    expect(res?.error?.code).toBe(-32602);
  });

  it('rejects lookup_catalog with an empty ids array', async () => {
    const res = await handleMcpRequest(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'lookup_catalog', arguments: { ids: [] } } },
      cfg(),
      SHOP,
    );
    expect(res?.error?.code).toBe(-32602);
  });

  it('treats a request without an id as a notification (null response) for initialized', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, cfg(), SHOP);
    expect(res).toBeNull();
  });
});
