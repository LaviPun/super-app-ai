# Feature Specification: Platform V2 Phase 10 — Connector Worker

**Feature Directory**: `010-connector-worker`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — minimal functional handler shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 10

## Goal

Async connector tests and flow HTTP in worker; SSRF helpers shared with API.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | Functional `connector` handler (`apps/workers/src/handlers/connector-handler.ts`) with SSRF checks via `@superapp/security`, Zod payload validation, and unit tests |
| Pending | Async connector tests, flow HTTP, full SSRF integration with Fastify API routes |

## Acceptance (from migration plan)

See Phase 10 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
