# Platform V2 — Sync Job Call Sites

The `Job` model is a **ledger**, not a queue. These call sites create a row, transition to `RUNNING`, execute work **inline in the same HTTP request**, then mark `SUCCESS` or `FAILED`.

Source grep: `JobService`, `jobs.create`, `jobs.start`, `prisma.job.create` at baseline SHA `1b0df9d`.

## Inline execution pattern (12 sites)

| File | Lines (approx) | Job type | Work executed inline | Risk |
|------|----------------|----------|----------------------|------|
| `routes/api.ai.create-module.tsx` | 94–143 | `AI_GENERATE` | Classify + LLM generate + compile options | **High** — timeout, duplicate retry on client replay |
| `routes/api.ai.create-module.stream.tsx` | 99–146 | `AI_GENERATE` | Streamed LLM generation | **High** — long-lived SSE + job row |
| `routes/api.agent.generate-options.tsx` | 108–152 | `AI_GENERATE` | Agent classify + generate | **High** |
| `routes/api.ai.hydrate-module.tsx` | 77–117 | `AI_HYDRATE` | Hydrate envelope + validation | **High** |
| `routes/api.ai.modify-module.tsx` | 59–80 | `AI_MODIFY` | LLM modify + options | **High** |
| `routes/api.agent.modules.$moduleId.modify.tsx` | 75–98 | `AI_MODIFY` | Agent modify path | **High** |
| `routes/api.publish.tsx` | 206–270 | `PUBLISH` | Publish orchestration to Shopify | **High** — idempotency, partial failure |
| `routes/api.agent.modules.$moduleId.publish.tsx` | 149–202 | `PUBLISH` | Agent publish | **High** |
| `routes/api.rollback.tsx` | 29–45 | `PUBLISH`* | Module version rollback | **Medium** |
| `routes/api.agent.modules.$moduleId.rollback.tsx` | 38–60 | `PUBLISH`* | Agent rollback | **Medium** |
| `routes/api.theme.analyze.tsx` | 21–31 | `THEME_ANALYZE` | Theme profiling | **Medium** |
| `services/flows/flow-runner.service.ts` | 89–102 | `FLOW_RUN` | Full flow step execution | **High** — webhook/cron timeout |

\*Rollback uses job type implied by publish/rollback flows; ledger type may vary by route payload.

## Job row create only (no inline execution in same handler)

| File | Lines | Job type | Notes | Risk |
|------|-------|----------|-------|------|
| `routes/internal.usage.tsx` | 34–39 | `AI_GENERATE` | Replay enqueue from admin UI; **no worker consumes** | **Medium** — orphan QUEUED rows |
| `routes/internal.jobs.tsx` | 44–50 | (replay) | Clones failed job row; **no execution** | **Low** — manual replay gap |

## Direct `prisma.job.create` (bypasses JobService)

| File | Lines | Type | Notes | Risk |
|------|-------|------|-------|------|
| `routes/webhooks.tsx` | 35–42 | `SHOPIFY_METAOBJECT_CLEANUP` | On uninstall; **QUEUED only, no worker** | **Medium** — cleanup never runs async |
| `routes/webhooks.app.uninstalled.tsx` | 37 | (same pattern) | Duplicate uninstall path | **Medium** |

## Read-only / ledger queries (not call sites)

`quota.service.ts`, `jobs._index.tsx`, `logs._index.tsx`, `_index.tsx`, `internal._index.tsx`, `internal.trace.$correlationId.tsx`, `internal.jobs.tsx` (loader), `scripts/retention.ts`

## Connector tests (no Job ledger)

`api.connectors.test.tsx`, `api.agent.connectors.$connectorId.test.tsx` — run connector tests **synchronously** without `JobService` (separate risk: SSRF + timeout).

## V2 target queues (from migration plan)

| Current pattern | BullMQ queue |
|-----------------|--------------|
| AI generate/hydrate/modify | `ai-generation` |
| Publish / rollback | `publish-execution` |
| Flow runner | `flow-execution` |
| Webhook-triggered work | `webhook-processing` |
| Connector test/call | `connector-execution` |
| Theme analyze | `ai-generation` or dedicated analyze worker |
| Retention cron jobs | `retention` |

## Idempotency gaps

- No idempotency key on job create (except webhook dedupe via `WebhookEvent`).
- Client retries can duplicate `AI_GENERATE` / `PUBLISH` rows and re-run expensive work.
- Replay from internal admin creates new rows without dedupe.
