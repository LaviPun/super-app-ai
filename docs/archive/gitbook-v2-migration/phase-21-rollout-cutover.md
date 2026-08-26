# Platform V2 — Phase 21 Rollout And Cutover

**Status:** Local/testable rollout controls + operator docs shipped; production traffic cutover remains operator-driven  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 21, §10 Production Readiness

## Scope delivered

| Area | Implementation |
|------|----------------|
| Shared flag schema | `packages/platform-contracts/src/rollout-cutover.ts` (`parsePlatformV2RolloutFlags`, Zod defaults **off**) |
| Remix routing helpers | `apps/web/app/services/platform-v2/rollout-cutover.server.ts` + root loader exposes `platformV2Cutover` |
| Fastify gateway gate | `apps/api/src/plugins/rollout-cutover.ts` — `/health` + `/ready` always on; `/v1/*` returns **503** until `FASTIFY_API_ENABLED=true` |
| Publish worker wiring | `apps/workers/src/publish-execution.ts` calls `runPublishJob` when `PUBLISH_WORKER_ENABLED=true` **and** `JOB_EXECUTION_MODE=queue` |
| Tests | Contract tests in `@superapp/platform-contracts`; API/workers/Remix unit coverage |

## Environment flags (default off)

| Variable | Purpose |
|----------|---------|
| `FRONTEND_NEXT_ENABLED` | Allow internal Next.js route shells to receive traffic |
| `FASTIFY_API_ENABLED` | Expose Fastify `/v1` job + connector APIs |
| `SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED` | Merchant embedded surfaces may route to Next |
| `JOB_EXECUTION_MODE` | `inline` (legacy default), `queue`, or `disabled` |
| `AI_GENERATION_ASYNC_ENABLED` | Queue-backed AI generation |
| `AI_GENERATION_STREAM_VIA_QUEUE_ENABLED` | SSE progress via queue events |
| `FLOW_ASYNC_ENABLED` | Async flow runs |
| `WEBHOOK_ASYNC_ENABLED` | Async webhook ingestion |
| `CONNECTOR_WORKER_ENABLED` | Connector worker execution (see Phase 10) |
| `PUBLISH_WORKER_ENABLED` | `runPublishJob` publish processor |
| `PREVIEW_SANDBOX_ENABLED` | Preview sandbox surfaces |
| `INTENT_GRAPH_ENABLED` | Intent graph pipeline |
| `FRONTEND_NEXT_BASE_URL` | Optional Remix → Next redirect base (operator supplied) |

## Staging rollout checklist

1. **Baseline:** Remix only; all flags unset.
2. **Fastify probe:** Deploy API; verify `/health` + `/ready`; keep `FASTIFY_API_ENABLED` off.
3. **Next read-only:** Deploy frontend; enable `FRONTEND_NEXT_ENABLED` for internal paths only.
4. **Queue mode:** Set `JOB_EXECUTION_MODE=queue` with workers idle.
5. **Worker canary:** Enable worker flags for internal test shop (AI → webhook/flow → connector → publish).
6. **Merchant Next:** Enable `SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED` for canary shops.
7. **Failure injection:** Redis down, duplicate webhook, publish idempotency replay.
8. **Production canary:** Follow production sequence in migration plan § Phase 21.

## Rollback (operator)

1. Set rollout flags back to **off** (especially `FASTIFY_API_ENABLED`, `FRONTEND_NEXT_ENABLED`, worker flags).
2. Drain or pause BullMQ consumers; leave queued jobs visible in job ledger.
3. Promote previous Vercel / Railway deployments.
4. Keep Remix routes as fallback until cutover is re-validated.

See also [`docs/release-operations.md`](../../../release-operations.md).

## Production cutover blockers (not automated here)

- Live Shopify session/token parity for embedded Next.
- Postgres production cutover and Redis monitoring.
- Retire Remix routes only after canary metrics + progressive publish gates pass.
- Intent graph remains behind `INTENT_GRAPH_ENABLED` + eval gate.

## Verification

```bash
pnpm --filter @superapp/platform-contracts test
pnpm --filter @superapp/api test
pnpm --filter @superapp/workers test
pnpm --filter web test -- app/__tests__/rollout-cutover.test.ts
pnpm test:v2:fast
```
