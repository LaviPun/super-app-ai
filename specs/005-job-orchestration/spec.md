# Feature Specification: Platform V2 Phase 5 — Job Orchestration And BullMQ

**Feature Directory**: `005-job-orchestration`

**Created**: 2026-06-12

**Status**: **Shipped** on `master` (2026-06-12)

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

## Goal

JobQueue (BullMQ), JobOrchestrator (validate + enqueue + inline execute), JobEvents; inline/queue/disabled modes; Redis config.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Package | `packages/job-orchestration` |
| Implementation | **Shipped** |
| Tests | 3 unit tests passing |

## Deliverables

- [x] `JobOrchestrator` with `inline`, `queue`, `disabled` modes
- [x] BullMQ queue adapter with retry/backoff defaults
- [x] Config via `JOB_EXECUTION_MODE`, `QUEUE_REDIS_URL`, `QUEUE_PREFIX`
- [x] Job event helpers (`JobEventCollector`, `WorkerEvent` schema in contracts)
- [x] Unit tests for disabled, inline, and invalid envelope paths

## Acceptance

- Existing Remix behavior works in inline mode (preview export processes locally)
- Fastify and Remix can enqueue jobs in queue mode when Redis is configured
- Inline mode falls back automatically when queue mode is set but Redis URL is missing

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section. ✅
- **SC-002**: Unit tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved. ✅
