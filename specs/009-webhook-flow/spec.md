# Feature Specification: Platform V2 Phase 9 — Webhook And Flow Workers

**Feature Directory**: `009-webhook-flow`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — scaffold handlers on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 9

## Goal

Fastify webhook ingress; flow worker; dedupe; fast Shopify ack; replayable flows.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | Scaffold handlers on `flow` + `webhook` queues |
| Pending | Fastify webhook ingress, dedupe, replayable flows |

## Acceptance (from migration plan)

See Phase 9 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Implementation — tracked in `tasks.md` with `[ ]` until `/speckit-implement`.
