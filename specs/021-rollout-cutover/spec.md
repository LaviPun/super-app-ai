# Feature Specification: Platform V2 Phase 21 — Rollout And Cutover

**Feature Directory**: `021-rollout-cutover`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — rollout contracts + job mode endpoint shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Research**: [`research.md`](./research.md)

**Hosting policy**: [`ADR-002`](../../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 21

## Goal

Feature flags; backend selection; traffic cutover; Remix retirement plan.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | `rollout-cutover.ts` — `PLATFORM_BACKEND`, `PlatformV2RolloutFlagsSchema`, route gating helpers; `GET /v1/jobs/mode`; `PLATFORM_V2_ENABLED` in `@superapp/job-orchestration`; unit tests |
| Pending | Operator backend choice, merchant traffic cutover, Remix retirement, dual-queue consolidation, ops runbooks |

## Rollout environment variables

Defined in [`packages/platform-contracts/src/rollout-cutover.ts`](../../packages/platform-contracts/src/rollout-cutover.ts) as `PLATFORM_V2_ROLLOUT_ENV_KEYS`:

| Variable | Purpose |
|----------|---------|
| `PLATFORM_BACKEND` | `cloudflare` (recommended) or `fastify` |
| `FRONTEND_NEXT_ENABLED` | Enable Next.js frontend shell |
| `FASTIFY_API_ENABLED` | Gate Fastify `/v1` (preset from backend) |
| `SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED` | Route embedded merchant traffic to Next |
| `JOB_EXECUTION_MODE` | `inline` \| `queue` \| `disabled` |
| `AI_GENERATION_ASYNC_ENABLED` | Async AI generation worker |
| `AI_GENERATION_STREAM_VIA_QUEUE_ENABLED` | Stream AI responses via queue |
| `FLOW_ASYNC_ENABLED` | Async flow execution |
| `WEBHOOK_ASYNC_ENABLED` | Async webhook processing |
| `CONNECTOR_WORKER_ENABLED` | Connector worker |
| `PUBLISH_WORKER_ENABLED` | Publish worker |
| `PREVIEW_SANDBOX_ENABLED` | Preview sandbox |
| `INTENT_GRAPH_ENABLED` | Intent graph features |

**Related (job-orchestration only):** `PLATFORM_V2_ENABLED` — when false, orchestrator skips enqueue.

## Dual queue cutover note

Until traffic cutover completes, BullMQ (`jobs.ts`) and platform queues (`platform-jobs.ts`) run in parallel per backend. See master spec dual-queue section and [`002-shared-contracts/research.md`](../002-shared-contracts/research.md).

## Acceptance (from migration plan)

See Phase 21 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Rollout flags and backend preset implemented in contracts. ✅
- **SC-002**: Unit/integration tests for flag parsing; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅
- **SC-004**: Traffic cutover + Remix retirement documented and executed. ❌ Pending

## Deferred / out of scope (this iteration)

- Final operator decision to retire Fastify alternate backend
- Automated traffic shifting (DNS/load balancer) — manual until runbook extended
