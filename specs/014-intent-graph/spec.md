# Feature Specification: Platform V2 Phase 14 — Intent Graph And Recipe DSL

**Feature Directory**: `014-intent-graph`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — `@superapp/intent-graph` package shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 14

## Goal

Intent graph pipeline; Recipe DSL evolution; catalog integration.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | `packages/intent-graph` with intent graph module, public exports, and unit tests (`intent-graph.test.ts`) |
| Pending | Full intent graph pipeline, Recipe DSL evolution, catalog integration |

## Acceptance (from migration plan)

See Phase 14 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
