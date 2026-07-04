import type { TemplateEntry } from '../types.js';

/**
 * agentic.catalogProfile templates — the agentic-commerce surface (M13 / Spring-26).
 *
 * A structured product-data profile the merchant surfaces to AI shopping channels
 * (ChatGPT / Copilot / Gemini / bespoke agents), served by real app endpoints under
 * `/agentic/{shop}/{handle}/…`:
 *   - catalog-feed        → feed.json (always-real default)
 *   - attribute-map       → enriches feed rows with normalized keys (gtin/brand/size/…)
 *   - compliance-disclosure → appends required disclosures verbatim to every feed row
 *   - mcp-endpoint        → JSON-RPC 2.0 Storefront-Catalog MCP + /.well-known/ucp discovery
 *   - agent-profile       → app-served UCP business/agent-profile document (+ agents.md copy)
 *   - sponsored-products  → merchant-promoted GIDs boosted in the MCP/feed ranking
 *
 * Grounded in the 028 corpus: Boost AI Search & Filter (search/discovery, synonyms,
 * metafield-sourced product attributes, merchandising pins → the agent-facing analogue
 * of "make products findable + correctly attributed") and Bold Brain (AI recommendations /
 * product-affinity feeding AI channels). Config-only + app-served — no ad exchange, no
 * external registration. Every artifact here is in AGENTIC_ARTIFACTS_SHIPPED (build #7c).
 */
export const AGENTIC_CATALOG_FEED_TEMPLATES: TemplateEntry[] = [
  {
    id: 'AGENT-01',
    name: 'AI Channel Catalog Feed',
    description:
      'Publish a structured whole-store product feed at /agentic for AI shopping agents (ChatGPT, Copilot, Gemini) to crawl over HTTP.',
    category: 'INTEGRATION',
    type: 'agentic.catalogProfile',
    icon: 'sparkles',
    tags: ['agentic', 'ai-channel', 'catalog', 'feed', 'syndication', 'discovery'],
    spec: {
      type: 'agentic.catalogProfile',
      name: 'AI Channel Catalog Feed',
      category: 'INTEGRATION',
      requires: [],
      config: {
        artifacts: ['catalog-feed'],
        source: { kind: 'all' },
        feedHandle: 'catalog',
        attributeMap: [],
        disclosures: [],
        sponsoredProductIds: [],
      },
    },
  },
  {
    id: 'AGENT-02',
    name: 'Normalized Attribute Map',
    description:
      'Enrich the AI catalog feed with normalized shopping attributes (GTIN, brand, size, color, material) mapped from product metafields and fields — so agents parse variants correctly.',
    category: 'INTEGRATION',
    type: 'agentic.catalogProfile',
    icon: 'tag',
    tags: ['agentic', 'attribute-map', 'gtin', 'brand', 'metafield', 'feed'],
    spec: {
      type: 'agentic.catalogProfile',
      name: 'Normalized Attribute Map',
      category: 'INTEGRATION',
      requires: [],
      config: {
        artifacts: ['catalog-feed', 'attribute-map'],
        source: { kind: 'all' },
        attributeMap: [
          { key: 'gtin', from: 'metafield:custom.gtin' },
          { key: 'mpn', from: 'variant.sku' },
          { key: 'brand', from: 'vendor' },
          { key: 'size', from: 'variant.option.Size' },
          { key: 'color', from: 'variant.option.Color' },
          { key: 'material', from: 'metafield:custom.material' },
        ],
        feedHandle: 'catalog',
        disclosures: [],
        sponsoredProductIds: [],
      },
    },
  },
  {
    id: 'AGENT-03',
    name: 'Compliance Disclosure Feed',
    description:
      'Append required legal disclosures (allergen, prop-65, country-of-origin) verbatim to every AI catalog feed row — so agents surface mandated notices with each product.',
    category: 'INTEGRATION',
    type: 'agentic.catalogProfile',
    icon: 'shield-check',
    tags: ['agentic', 'compliance-disclosure', 'legal', 'feed', 'disclosure'],
    spec: {
      type: 'agentic.catalogProfile',
      name: 'Compliance Disclosure Feed',
      category: 'INTEGRATION',
      requires: [],
      config: {
        artifacts: ['catalog-feed', 'compliance-disclosure'],
        source: { kind: 'all' },
        disclosures: [
          {
            label: 'Country of Origin',
            text: 'Country of origin is stated per item; imported goods may be subject to customs duties in the destination market.',
          },
          {
            label: 'California Prop 65',
            text: 'WARNING: This product can expose you to chemicals known to the State of California to cause cancer or reproductive harm. For more information go to www.P65Warnings.ca.gov.',
          },
        ],
        feedHandle: 'catalog',
        attributeMap: [],
        sponsoredProductIds: [],
      },
    },
  },
  {
    id: 'AGENT-04',
    name: 'Curated Collection Feed',
    description:
      'Syndicate a hand-picked collection (e.g. bestsellers or a seasonal edit) as its own AI feed handle — the agentic analogue of a Boost-style merchandised collection tree.',
    category: 'INTEGRATION',
    type: 'agentic.catalogProfile',
    icon: 'collection',
    tags: ['agentic', 'catalog', 'collection', 'merchandising', 'feed', 'discovery'],
    spec: {
      type: 'agentic.catalogProfile',
      name: 'Curated Collection Feed',
      category: 'INTEGRATION',
      requires: [],
      config: {
        artifacts: ['catalog-feed', 'attribute-map'],
        source: {
          kind: 'collection',
          collectionIds: ['gid://shopify/Collection/300000000001'],
        },
        attributeMap: [
          { key: 'brand', from: 'vendor' },
          { key: 'gtin', from: 'metafield:custom.gtin' },
        ],
        feedHandle: 'bestsellers',
        disclosures: [],
        sponsoredProductIds: [],
      },
    },
  },
  {
    id: 'AGENT-05',
    name: 'Storefront Catalog MCP Endpoint',
    description:
      'Serve a JSON-RPC Storefront-Catalog MCP endpoint (search_catalog / get_product / lookup_catalog) with UCP discovery, so agents query the store live instead of only crawling the feed.',
    category: 'INTEGRATION',
    type: 'agentic.catalogProfile',
    icon: 'plug',
    tags: ['agentic', 'mcp', 'ucp', 'endpoint', 'search', 'catalog'],
    spec: {
      type: 'agentic.catalogProfile',
      name: 'Storefront Catalog MCP Endpoint',
      category: 'INTEGRATION',
      requires: [],
      config: {
        artifacts: ['catalog-feed', 'attribute-map', 'mcp-endpoint'],
        source: { kind: 'all' },
        attributeMap: [
          { key: 'brand', from: 'vendor' },
          { key: 'gtin', from: 'metafield:custom.gtin' },
          { key: 'condition', from: 'metafield:custom.condition' },
        ],
        feedHandle: 'catalog',
        disclosures: [],
        sponsoredProductIds: [],
      },
    },
  },
  {
    id: 'AGENT-06',
    name: 'Agent Profile & Store Guidance',
    description:
      'Publish a UCP agent-profile document (+ app-served agents.md copy) with free-text guidance an AI agent reads before recommending — e.g. bundle guidance, sizing notes, brand values.',
    category: 'INTEGRATION',
    type: 'agentic.catalogProfile',
    icon: 'sparkles',
    tags: ['agentic', 'agent-profile', 'ucp', 'agents-md', 'guidance', 'catalog'],
    spec: {
      type: 'agentic.catalogProfile',
      name: 'Agent Profile & Store Guidance',
      category: 'INTEGRATION',
      requires: [],
      config: {
        artifacts: ['catalog-feed', 'agent-profile'],
        source: { kind: 'all' },
        feedHandle: 'catalog',
        agentInstructions:
          'Prioritize in-stock items and match the shopper on size and color before suggesting alternatives. Frequently-bought-together pairs are trustworthy; avoid recommending accessories the shopper already owns. Highlight our extended-warranty option on electronics. Never invent specifications not present in the feed.',
        attributeMap: [],
        disclosures: [],
        sponsoredProductIds: [],
      },
    },
  },
  {
    id: 'AGENT-07',
    name: 'Sponsored Products Boost',
    description:
      'Boost a small set of merchant-promoted product GIDs to the top of agentic (MCP + feed) results — config-only, app-served ranking, the agentic analogue of a Boost merchandising pin.',
    category: 'INTEGRATION',
    type: 'agentic.catalogProfile',
    icon: 'arrow-up',
    tags: ['agentic', 'sponsored-products', 'merchandising', 'ranking', 'mcp', 'feed'],
    spec: {
      type: 'agentic.catalogProfile',
      name: 'Sponsored Products Boost',
      category: 'INTEGRATION',
      requires: [],
      config: {
        artifacts: ['catalog-feed', 'mcp-endpoint', 'sponsored-products'],
        source: { kind: 'all' },
        sponsoredProductIds: [
          'gid://shopify/Product/400000000001',
          'gid://shopify/Product/400000000002',
          'gid://shopify/Product/400000000003',
        ],
        feedHandle: 'catalog',
        attributeMap: [],
        disclosures: [],
      },
    },
  },
  {
    id: 'AGENT-08',
    name: 'Full Agentic Commerce Profile',
    description:
      'The complete agentic profile: crawlable feed, normalized attributes, disclosures, live MCP endpoint, agent guidance, and sponsored boosting — everything an AI channel needs from one store.',
    category: 'INTEGRATION',
    type: 'agentic.catalogProfile',
    icon: 'sparkles',
    tags: ['agentic', 'ai-channel', 'mcp', 'agent-profile', 'sponsored-products', 'catalog'],
    spec: {
      type: 'agentic.catalogProfile',
      name: 'Full Agentic Commerce Profile',
      category: 'INTEGRATION',
      requires: [],
      config: {
        artifacts: [
          'catalog-feed',
          'attribute-map',
          'compliance-disclosure',
          'mcp-endpoint',
          'agent-profile',
          'sponsored-products',
        ],
        source: { kind: 'all' },
        attributeMap: [
          { key: 'gtin', from: 'metafield:custom.gtin' },
          { key: 'brand', from: 'vendor' },
          { key: 'size', from: 'variant.option.Size' },
          { key: 'color', from: 'variant.option.Color' },
          { key: 'gender', from: 'metafield:custom.gender' },
          { key: 'ageGroup', from: 'metafield:custom.age_group' },
          { key: 'condition', from: 'metafield:custom.condition' },
        ],
        disclosures: [
          {
            label: 'Materials & Care',
            text: 'Full material composition and care instructions are listed per item; verify fit and care before purchase.',
          },
        ],
        sponsoredProductIds: [
          'gid://shopify/Product/400000000010',
          'gid://shopify/Product/400000000011',
        ],
        feedHandle: 'catalog',
        agentInstructions:
          'Match the shopper on size, color, and budget before proposing upsells. Prefer bestsellers with strong review counts. Surface compliance disclosures with every recommendation. Do not fabricate availability, pricing, or specifications beyond what the feed provides.',
      },
    },
  },
];
