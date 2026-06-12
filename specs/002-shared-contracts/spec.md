# Feature Specification: Platform V2 Phase 2 — Shared Contracts

**Feature Directory**: `002-shared-contracts`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Shipped (core)** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 2

## Goal

Full job/API/event schemas in platform-contracts; validate Remix payloads; all initial job types registered.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Package | `packages/platform-contracts` |
| Implementation | **Shipped (core)** |
| Tests | 7 unit test files in `packages/platform-contracts/src/__tests__/` |

## Deliverables

- [x] Image/storage job contracts (`storage.ts`, `image-worker-jobs.ts`)
- [x] Legacy BullMQ contracts (`jobs.ts`) — `WorkerEventSchema`, kebab-case queues
- [x] Platform job registry (`platform-jobs.ts`) — `PlatformWorkerEventSchema`, `PLATFORM_QUEUES`, CF bindings
- [x] Worker execution payloads (`worker-payloads.ts`)
- [x] Rollout + preview modules (`rollout-cutover.ts`, `preview.ts`, `health.ts`)
- [x] Zod validation at boundaries for registered job types
- [ ] Full API request/response schemas for every Fastify route (incremental)

**Research:** [`research.md`](./research.md) — dual queue naming decision record

## Acceptance

- All platform worker queues have typed job envelopes in contracts
- Remix preview export validates against shared schemas before enqueue
- Worker runtime imports queue names from contracts (no string duplication)

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section. ✅ (core)
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅
