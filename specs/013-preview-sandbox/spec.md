# Feature Specification: Platform V2 Phase 13 — Preview Sandbox

**Feature Directory**: `013-preview-sandbox`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 13

## Goal

Preview envelope; Next shell; Fastify data; strict CSP; no arbitrary Liquid.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | Preview export enqueue via `JobOrchestrator` (inline + queue modes) |
| Pending | Next.js preview shell, Fastify preview data API, strict CSP sandbox |

## Acceptance (from migration plan)

See Phase 13 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Implementation — tracked in `tasks.md` with `[ ]` until `/speckit-implement`.
