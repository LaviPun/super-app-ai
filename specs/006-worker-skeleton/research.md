# Research: Phase 6 — Worker App Skeleton

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Two worker runtimes from one handler set — BullMQ process + CF Queue consumer

**Rationale:** `apps/workers` boots a Node/BullMQ runtime (long-lived process, health server, graceful shutdown) for the Fastify backend, and exports a Cloudflare queue-consumer entry for the platform backend. Both dispatch the same per-job handlers, so worker logic is backend-agnostic.

**Alternatives considered:**

- BullMQ-only — rejected (no edge/CF path).
- Separate handler trees per runtime — rejected (drift, double tests).

## Decision: Health + readiness server on workers

**Rationale:** Railway/containers need a liveness endpoint; `health-server.ts` serves `HealthResponseSchema`/`ReadinessResponseSchema` from `@superapp/platform-contracts`.

## Open items

- [ ] Replace remaining Railway-specific env headings in GitBook phase-6 pages with backend-neutral wording.
