# Platform V2 — Target Monorepo Layout

Future-state directory map from [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) Phase 1. **Scaffolding begins Phase 1; behavior migration is later.**

```
ai-shopify-superapp/
├── apps/
│   ├── web/                 # Legacy Remix (source of truth until cutover)
│   ├── frontend/            # Next.js embedded Shopify + internal admin
│   ├── api/                 # Fastify API gateway
│   └── workers/             # BullMQ consumers
├── packages/
│   ├── core/                # RecipeSpec, catalog, compiler (existing)
│   ├── platform-contracts/  # Zod job/API/event schemas (Phase 2)
│   ├── db/                  # Shared Prisma client (future)
│   ├── security/            # SSRF, redaction, signing (future)
│   └── observability/       # Logging, tracing helpers (future)
├── extensions/              # Generic Shopify extensions (unchanged)
└── docs/gitbook/02-architecture/v2-migration/
```

## App boundaries

### `apps/frontend`

**Owns:** Polaris UI, App Bridge, merchant dashboards, internal admin screens, streaming progress UI, typed HTTP client to Fastify.

**Must not own:** Webhook ingestion, OAuth token storage, queue workers, Prisma writes for core domain (except via API).

### `apps/api`

**Owns:** Shopify session validation, webhooks (HMAC), billing APIs, job orchestration (enqueue only in handlers), internal admin JSON APIs, SSE progress endpoints, health/readiness.

**Must not own:** Long-running AI/publish/flow execution in route handlers.

### `apps/workers`

**Owns:** BullMQ consumers — AI, flow, connector, publish, image, retention, webhook processing.

**Must not own:** HTTP server for merchant traffic (except optional health for worker process).

### `apps/web` (legacy)

Remains runnable through Phase 4+. Retired after Shopify embedded cutover (plan Phase 20).

## Package boundaries

| Package | Exports | Consumers |
|---------|---------|-----------|
| `@superapp/core` | RecipeSpec, catalog, compilers | web, workers, api (validation) |
| `@superapp/platform-contracts` | Job types, payloads, API DTOs | frontend, api, workers, web (transition) |
| `@superapp/rate-limit` | Rate limit helpers | web, api (existing) |

## Workspace scripts (target)

```bash
pnpm --filter @superapp/platform-contracts test
pnpm --filter @superapp/api typecheck test build
pnpm --filter @superapp/frontend typecheck test build
pnpm --filter @superapp/workers typecheck test build
pnpm --filter web test   # legacy regression gate
```

## Environment split (preview)

| Variable | frontend | api | workers |
|----------|----------|-----|---------|
| `DATABASE_URL` | — | ✓ | ✓ |
| `QUEUE_REDIS_URL` | — | ✓ | ✓ |
| `SHOPIFY_*` | public keys | secrets | offline tokens via DB |
| `API_BASE_URL` | ✓ | — | optional |

See [phase-1-monorepo.md](./phase-1-monorepo.md) for Phase 1 completion status.
