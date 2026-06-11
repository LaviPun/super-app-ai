# Feature Specification: Platform V2 Phase 19 — Async UX

**Feature Directory**: `019-async-ux`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — job status API shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 19

## Goal

Merchant queued-state UI; job progress; cancellation UX.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | `GET /v1/jobs/:jobId` job status endpoint in `apps/api/src/routes/jobs.ts` with unit tests (`job-status.test.ts`) |
| Pending | Merchant queued-state UI, job progress polling UX, cancellation UX |

## Acceptance (from migration plan)

See Phase 19 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
