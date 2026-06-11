# Feature Specification: Platform V2 Phase 18 — Deployment Infrastructure

**Feature Directory**: `018-deployment`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — Dockerfiles + fly stub shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 18

## Goal

Vercel/Railway/R2/Redis deploy matrices; env validation; worker deploy.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | `apps/api/Dockerfile`, `apps/workers/Dockerfile`, and `fly.api.toml` with `PLATFORM_V2_ENABLED` and service env stubs |
| Pending | Vercel/Railway deploy configs, R2/Redis binding matrices, env validation, automated worker deploy |

## Acceptance (from migration plan)

See Phase 18 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
