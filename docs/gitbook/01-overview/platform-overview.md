# Platform Overview

## What the app is

AI Shopify SuperApp is a single Shopify app that lets merchants generate and run modules across storefront, checkout, customer account, integrations, and automation.

The platform does not deploy arbitrary AI-generated code. AI outputs a validated `RecipeSpec` JSON that the backend compiles into known-safe operations.

## Core product surfaces

- Merchant embedded app (`apps/web`)
- Internal admin dashboard (`/internal/*`)
- Shopify extensions (`extensions/*`)
- Shared core package (`packages/core`)

## Key capabilities

- AI-generated module drafts with strict schema validation
- Publish and rollback with immutable versioning
- Connectors for external APIs with SSRF protections
- Visual flow builder and graph-based workflow engine
- Data stores for app-owned structured records
- Internal admin controls for plans, providers, categories, stores, logs, and jobs

## Documentation map

This GitBook is structured around:

1. architecture and data model
2. backend processes and service ownership
3. flows and execution logic
4. merchant dashboard logic
5. internal admin dashboard logic
6. API and operations
