# Platform V2 — Service Inventory

Source: `apps/web/app/services/**` (115 TypeScript modules).

| Domain | Path prefix | Count | Responsibility | Sync vs async |
|--------|-------------|------:|----------------|---------------|
| AI / LLM | `ai/` | 34 | Generation, routing, classification, assistant, evals, provider config | **Sync in request** (routes call LLM inline); jobs ledger optional |
| Recipes / compiler | `recipes/` | 21 | RecipeSpec validation, surface compilers (theme, checkout, functions, admin) | Sync compile in request |
| Workflows | `workflows/` | 9 | Workflow engine, expression eval, connector adapters (HTTP, Shopify, storage) | Sync step execution in flow runner |
| Observability | `observability/` | 9 | Logging, correlation, API logs, Sentry, OTel, redaction, AI usage | Sync write on request path |
| Releases | `releases/` | 6 | Feature flags, rollout policy, progressive publish, release metrics | Sync |
| Publish | `publish/` | 6 | Preflight, policy, capability allowlist, Shopify publish orchestration | **Sync in publish routes** (job ledger + inline work) |
| Shopify platform | `shopify/` | 4 | Metafields, metaobjects, theme, capabilities | Sync Admin API calls |
| Security | `security/` | 3 | SSRF allowlist, rate limit, crypto | Sync middleware |
| Jobs | `jobs/` | 3 | Job ledger CRUD; retention cron helpers | Ledger sync; **no queue consumer** |
| Internal admin | `internal/` | 3 | AI provider admin, pagination, account observability | Sync |
| Flows | `flows/` | 3 | Flow runner, schedules, webhook idempotency | **Sync run in webhook/cron path** |
| Billing | `billing/` | 3 | Plans, quotas, subscriptions | Sync |
| Connectors | `connectors/` | 2 | Connector CRUD, field mapping | Sync test calls in API routes |
| Data | `data/` | 2 | Data stores, module captures | Sync |
| Activity | `activity/` | 1 | Activity log writes | Sync |
| Analytics | `analytics/` | 1 | Module event ingestion | Sync |
| Errors | `errors/` | 1 | AppError taxonomy | Sync |
| Modules | `modules/` | 1 | Module lifecycle service | Sync |
| Preview | `preview/` | 1 | Preview sandbox rendering | Sync |
| Settings | `settings/` | 1 | App settings persistence | Sync |
| Theme | `theme/` | 1 | Theme analysis | **Sync via THEME_ANALYZE job pattern** |

## High-risk domains for V2 queue extraction

1. **`ai/`** — LLM calls block HTTP handlers (generation, hydrate, modify, stream).
2. **`publish/`** — Publish and rollback run inline after job row creation.
3. **`flows/flow-runner.service.ts`** — Webhook and cron triggers execute flows synchronously.
4. **`workflows/connectors/http.connector.ts`** — External HTTP from flow steps (SSRF-sensitive).
5. **`jobs/job.service.ts`** — Ledger only; no BullMQ transport.

## V2 package mapping (target)

| Current domain | Target package / app |
|----------------|---------------------|
| `recipes/`, `@superapp/core` | `packages/core` (existing) |
| Job + event schemas | `packages/platform-contracts` |
| API-facing orchestration | `apps/api` |
| AI, flow, publish, connector workers | `apps/workers` |
| SSRF, redaction | `packages/security` (future) |
| Logger, trace | `packages/observability` (future) |
