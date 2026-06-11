# Feature Specification: Platform V2 Phase 6 — Worker App Skeleton

**Feature Directory**: `006-worker-skeleton`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Shipped** on `master` (2026-06-12)

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 6

## Goal

apps/workers bootstrap: env, Redis, BullMQ consumers, graceful shutdown, handler registry.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Package | `apps/workers` |
| Implementation | **Shipped** |
| Tests | 10 unit tests passing |

## Deliverables

- [x] Worker entrypoint (`src/start.ts`) — `pnpm --filter @superapp/workers start`
- [x] BullMQ runtime (`src/worker-runtime.ts`) — consumes all platform queues
- [x] Graceful shutdown on SIGINT/SIGTERM
- [x] Handler registry with image storage + scaffold handlers
- [x] Worker events re-exported from platform-contracts
- [ ] Prisma client wiring (pending Phase 15)
- [ ] Sentry/OTel bootstrap (pending Phase 16)

## Acceptance

- Worker process starts and registers BullMQ consumers when `JOB_EXECUTION_MODE=queue` and Redis is available
- Image storage jobs process end-to-end in inline mode from Remix
- Scaffold handlers acknowledge jobs on AI/flow/connector/publish/webhook/retention queues

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section. ✅ (core skeleton)
- **SC-002**: Unit tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved. ✅
