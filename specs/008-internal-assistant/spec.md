# Feature Specification: Platform V2 Phase 8 — Internal Assistant Migration

**Feature Directory**: `008-internal-assistant`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — API proxy routes shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 8

## Goal

Internal UI to Next admin; streaming API to Fastify; isolated from merchant AI; local-only policy.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | Fastify API proxy routes in `apps/api/src/routes/internal-assistant.ts` — `GET /v1/internal/assistant/readiness` and `POST /v1/internal/assistant/chat` stubs with `PLATFORM_V2_ENABLED` awareness |
| Pending | Next admin UI, streaming to Fastify, full migration from Remix internal assistant |

## Acceptance (from migration plan)

See Phase 8 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
