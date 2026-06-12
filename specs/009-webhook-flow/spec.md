# Feature Specification: Platform V2 Phase 9 — Webhook And Flow Workers

**Feature Directory**: `009-webhook-flow`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — minimal functional handlers shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 9

## Goal

Fastify webhook ingress; flow worker; dedupe; fast Shopify ack; replayable flows.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | Functional `webhook` and `flow` handlers (`apps/workers/src/handlers/webhook-handler.ts`, `flow-handler.ts`) with Zod payload validation, structured results, and unit tests; **Fastify webhook ingress** `POST /v1/webhooks/shopify` and **flow trigger** `POST /v1/flows/run` in `apps/api/src/routes/webhook-flow.ts` |
| Pending | Dedupe, replayable flows, production HMAC hardening |

## Acceptance (from migration plan)

See Phase 9 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section. ✅ (shipped scope: ingress + flow trigger + worker handlers)
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅ (`webhook-flow.test.ts`, route coverage)
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅
- **SC-004**: Dedupe store, replayable flows, production HMAC hardening. ❌ Pending (Phase 9 follow-on; tracked in migration plan)

## Deferred / out of scope (this iteration)

- Dedupe store + replay UI and production HMAC hardening — tracked in migration plan pending items above.
