# Research: Phase 2 — Shared Contracts

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Dual queue naming — BullMQ (`jobs.ts`) vs platform queues (`platform-jobs.ts`)

**Rationale:** Two job generations coexist until Phase 21 cutover. Legacy Fastify/BullMQ paths use kebab-case queue names and `WorkerEventSchema` in `jobs.ts`. Cloudflare platform paths use short queue names, `PlatformWorkerEventSchema`, and worker payloads in `worker-payloads.ts`. Explicit naming prevents merge regressions (see [`implementation-status.md`](../../docs/implementation-status.md) 2026-06-12 merge repair).

**Alternatives considered:**

- Single unified schema file — rejected (breaks BullMQ consumers and CF bindings mid-cutover)
- Rename legacy queues in place — rejected (Redis key migration risk)

| Concept | Legacy (`jobs.ts`) | Platform (`platform-jobs.ts` + `worker-payloads.ts`) |
|---------|-------------------|------------------------------------------------------|
| Progress events | `WorkerEventSchema` | `PlatformWorkerEventSchema` |
| Flow payload | `FlowRunPayloadSchema` | `FlowRunWorkerPayloadSchema` (requires `jobId`, `shopId`) |
| Webhook job type | `WEBHOOK_RECEIVED` | `WEBHOOK_PROCESS` |
| Flow queue | `flow-execution` | `flow` |
| Webhook queue | `webhook-processing` | `webhook` |
| Asset/image queue | *(BullMQ theme paths)* | `asset-storage` via `image-worker-jobs.ts` |

## Decision: Eight exported modules in `@superapp/platform-contracts`

**Rationale:** Package entry [`packages/platform-contracts/src/index.ts`](../../packages/platform-contracts/src/index.ts) re-exports: `jobs`, `health`, `storage`, `rollout-cutover`, `image-worker-jobs`, `platform-jobs`, `preview`, `worker-payloads`.

**Note:** `WorkerEventSchema` lives in **`jobs.ts`**, not `platform-jobs.ts` (which exports `PlatformWorkerEventSchema`).

## Decision: Rollout flags live in `rollout-cutover.ts`

**Rationale:** `PLATFORM_BACKEND`, feature flags, and route gating for cutover are centralized. `PLATFORM_V2_ENABLED` remains in `@superapp/job-orchestration` config — cross-reference both in Phase 21 spec.

## Decision: Security contracts in `@superapp/network-security`

**Rationale:** SSRF, signing, GDPR, and redaction implementations live in `packages/network-security`. `@superapp/security` re-exports for backward compatibility (Phase 17).

## Open items

- [ ] Consolidate dual naming after traffic cutover (Phase 21)
- [ ] Add `data-model.md` + `contracts/` prose when API surface stabilizes
