# Feature Specification: Platform V2 Phase 19 — Async UX

**Feature Directory**: `019-async-ux`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — Next async UX components + job status API shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 19

## Goal

Merchant queued-state UI; job progress; cancellation UX.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| API | `GET /v1/jobs/:jobId` in [`apps/api/src/routes/index.ts`](../../apps/api/src/routes/index.ts) (BullMQ + platform KV fallback); `GET /v1/jobs/:jobId/events` SSE in `job-events-route.ts`; tests in `job-status.test.ts` |
| Next.js UI | `apps/frontend/src/components/AsyncJobProgressPanel.tsx`, `AsyncJobProgressDemo.tsx`, `AsyncJobUxShowcase.tsx`; helpers in `src/lib/async-job-states.ts`; Playwright specs `tests/e2e/async-ux.spec.ts` |
| Pending | Production merchant embedded UX wired to live job streams; cancellation UX end-to-end |

## Acceptance (from migration plan)

See Phase 19 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Job status API + demo async UX components exist with tests. ⚠️ Partial (demo/showcase, not full merchant cutover)
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅

## Deferred / out of scope (this iteration)

- Wire Polaris merchant pages to platform job SSE (depends on Phase 21 cutover)
- Cancellation API contract + UI confirmation flows
