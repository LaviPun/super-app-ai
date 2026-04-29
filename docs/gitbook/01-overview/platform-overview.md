# Platform overview

## What this product is

AI Shopify SuperApp is one Shopify app that replaces many single-purpose apps. Merchants describe outcomes in plain language (or pick templates); the system produces **validated `RecipeSpec` JSON**, never arbitrary storefront code. The compiler turns specs into **known-safe** deploy operations (metaobjects, functions, extensions, connectors, flows).

## Surfaces

| Surface | Location | Role |
|---------|-----------|------|
| Merchant app | `apps/web` (embedded admin) | Create modules, connectors, flows, data stores, billing |
| Internal admin | `/internal/*` | Providers, plans, stores, logs, templates, jobs |
| Extensions | `extensions/*` | Theme, checkout, customer account, Flow triggers/actions, functions |
| Core package | `packages/core` | Recipe schema, capabilities, catalog, shared contracts |

## Capabilities (summary)

- Draft → preview → publish → rollback with immutable versions
- Plan and capability gating (Basic vs Plus, etc.)
- Integrations with SSRF-safe outbound HTTP
- Automations: linear flows + graph workflows + Shopify Flow
- App-owned **data stores** for structured records
- Full **Agent API** parity with key merchant actions

## Where to read next

- **Full index:** [Documentation map](../00-welcome/documentation-map.md)
- **Architecture depth:** [Technical reference](../../technical.md) §15 (extensions & slots)
- **Specs:** [Reference library](../09-reference/reference-library.md)
