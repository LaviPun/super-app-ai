# Feature Specification: Platform V2 Phase 16 — Observability And Product Analytics

**Feature Directory**: `016-observability`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — worker telemetry sink shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 16

## Goal

Cross-service OTel, Sentry, PostHog; sanitized metadata; trace joins.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | Worker telemetry sink (`apps/workers/src/telemetry/worker-telemetry.ts`) with PII redaction, console sink, and unit tests (`worker-telemetry.test.ts`) |
| Pending | Cross-service OTel, Sentry, PostHog integration, trace joins |

## Acceptance (from migration plan)

See Phase 16 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
