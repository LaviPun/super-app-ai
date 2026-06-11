# Feature Specification: Platform V2 Phase 21 — Rollout And Cutover

**Feature Directory**: `021-rollout-cutover`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — `PLATFORM_V2_ENABLED` flag shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 21

## Goal

Feature flags; traffic cutover; Remix retirement plan.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | `PLATFORM_V2_ENABLED` gate in `packages/job-orchestration` (config + orchestrator skip), `GET /v1/jobs/mode` endpoint, default `true` in `fly.api.toml`, and unit tests |
| Pending | Traffic cutover plan, Remix retirement, feature flag UI and ops runbooks |

## Acceptance (from migration plan)

See Phase 21 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
