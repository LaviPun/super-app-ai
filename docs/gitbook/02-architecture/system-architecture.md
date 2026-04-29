# System Architecture

## Architecture pattern

The platform follows a recipe-compiler architecture:

1. user intent (prompt or template)
2. AI produces `RecipeSpec` JSON
3. Zod validates recipe at boundaries
4. compiler maps recipe to deploy operations
5. publish pipeline applies operations via Shopify APIs
6. module versioning stores immutable history for rollback

## Monorepo structure

- `apps/web`: Remix app (merchant UI, internal admin, API routes, services)
- `packages/core`: recipe schema, capability matrix, catalog, templates, connector/workflow contracts
- `extensions/*`: theme app extension, checkout UI, customer account UI, functions, flow trigger/action extensions

## Main runtime components

- UI layer: merchant and internal admin pages/routes
- API layer: Remix route handlers under `apps/web/app/routes`
- Service layer: domain services under `apps/web/app/services`
- Persistence layer: Prisma models (`apps/web/prisma/schema.prisma`)
- Extension runtime layer: Shopify extension targets and Function runtimes

## Safety model

- No raw AI code deployment
- Schema validation using `RecipeSpecSchema`
- Capability gating by plan and surface
- Pre-publish validation before deploy
- Secret encryption and log redaction

## Source documents

For deeper implementation details, use:

- `docs/technical.md`
- `docs/ai-module-main-doc.md`
- `docs/catalog.md`
- `docs/data-models.md`
- `docs/internal-admin.md`
