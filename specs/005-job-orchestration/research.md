# Research: Phase 5 — Job Orchestration & BullMQ

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: One orchestrator, three execution modes — `inline | queue | disabled`

**Rationale:** `JOB_EXECUTION_MODE` lets the same enqueue call run work synchronously (inline, dev/legacy), via a durable queue (queue), or skip entirely (disabled). Enables gradual cutover without code forks. Source: `@superapp/job-orchestration` `config.ts` / `job-orchestrator.ts`.

**Alternatives considered:**

- Queue-only — rejected (breaks local dev + legacy inline paths mid-migration).
- Per-route ad-hoc queueing — rejected (no central policy, drift).

## Decision: Pluggable queue adapter — BullMQ vs Cloudflare Queues

**Rationale:** `JobQueueAdapter` has two implementations (`bullmq-queue.ts`, `cloudflare-queue.ts`) selected by `PLATFORM_BACKEND`. Orchestrator consumes platform contract types so both adapters share envelope/event schemas.

## Decision: `PLATFORM_V2_ENABLED` lives in orchestrator config, not `rollout-cutover.ts`

**Rationale:** It is an orchestrator-level kill switch (skip enqueue) rather than a traffic-routing flag. Phase 21 spec cross-references both modules.

## Open items

- [ ] Unified job-status store across BullMQ + KV backends.
