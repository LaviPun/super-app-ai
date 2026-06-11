# Platform V2 — Risk Ledger: Synchronous Work

Top risks from inline execution in the legacy Remix monolith. Severity: **Critical** / **High** / **Medium** / **Low**.

| ID | Domain | Severity | Current behavior | Failure modes | V2 migration target |
|----|--------|----------|------------------|---------------|---------------------|
| R1 | AI generation | **Critical** | `api.ai.create-module*` runs LLM + compile in request | Request timeout; OOM; partial stream persist | `AI_GENERATE` → `ai-generation` queue + SSE via Redis |
| R2 | AI hydrate/modify | **High** | Same pattern for hydrate/modify routes | Duplicate spend on retry; no backpressure | `AI_HYDRATE`, `AI_MODIFY` workers |
| R3 | Publish | **Critical** | Publish + agent publish inline after job row | Partial Shopify writes; double publish | `publish-execution` queue; idempotency keys |
| R4 | Rollback | **High** | Rollback inline | Inconsistent version state | `publish-execution` with rollback job type |
| R5 | Webhooks | **Critical** | `webhooks.tsx` runs `FlowRunnerService` before 200 | Shopify retry storm; slow topics | Ack fast → `webhook-processing` queue |
| R6 | Flow engine | **High** | `flow-runner.service.ts` sync steps | Step timeout; no DLQ | `flow-execution` queue |
| R7 | Cron | **High** | `api.cron.tsx` runs due schedules inline | Cron pile-up; secret leak surface | Fastify cron ingress → queue |
| R8 | Connectors | **High** | `api.connectors.test` sync HTTP | SSRF if misconfigured; timeout | `connector-execution` worker + SSRF package |
| R9 | Theme analyze | **Medium** | Theme analysis in request | Slow Admin API traversal | Dedicated analyze job |
| R10 | Job ledger | **Medium** | QUEUED rows without consumers (replay, uninstall cleanup) | Orphan jobs; false "queued" UX | JobOrchestrator + worker claim |
| R11 | Agent API | **High** | Agent routes mirror merchant sync paths | Agent retries amplify load | Same queues; agent enqueues via Fastify |
| R12 | Internal assistant stream | **High** | Long SSE from Remix route | Connection limits on serverless | Move stream coordination to API + Redis pub/sub |
| R13 | Build / deploy | **Medium** | `web build` fails (probe route client leak) | No production artifact | Fix in Remix retirement or hotfix branch |
| R14 | Evals gate | **Medium** | Forbidden-surface 50% on stub evals | Unsafe function surfaces slip through | Tighten stub + live evals in CI |

## Mitigation principles (from plan §7)

- AI outputs **RecipeSpec JSON only** — no merchant code deployment.
- Webhook HMAC verification stays on gateway (Fastify), not Next.js.
- Connector calls remain SSRF-protected (`security/ssrf.server.ts` → `packages/security`).
- Postgres = source of truth; BullMQ = execution transport.
- Trace context (`correlationId`) must cross enqueue → worker → completion event.

## Priority order for Phase 5+

1. R5 Webhook fast-ack + queue
2. R1/R2 AI generation workers
3. R3/R4 Publish worker
4. R6 Flow worker
5. R8 Connector worker
6. R10 Job orchestrator unification

See [sync-job-call-sites.md](./sync-job-call-sites.md) for file-level references.
