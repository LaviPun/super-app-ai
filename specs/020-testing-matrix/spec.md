# Feature Specification: Platform V2 Phase 20 — Testing Matrix

**Feature Directory**: `020-testing-matrix`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — tests added across packages on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 20

## Goal

Cross-service failure tests; contract tests; eval gates in CI.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | Unit tests across `apps/api`, `apps/workers`, `apps/frontend`, and packages (`job-orchestration`, `platform-contracts`, `intent-graph`, `data-layer`, `security`); CI workflow updates in `.github/workflows/ci.yml` |
| Pending | Cross-service failure tests, contract tests, eval gates in CI |

## Acceptance (from migration plan)

See Phase 20 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
