# Research: Phase 3 — Fastify API Skeleton

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Shared route registrars run on both Fastify and Cloudflare Workers

**Rationale:** Handlers live in `apps/api/src/handlers/` and are mounted by both the Fastify app (`routes/*.ts`) and the Worker entry (`apps/api/src/index.ts`). One validation/business path serves both backends, so `PLATFORM_BACKEND=cloudflare|fastify` does not fork API behaviour.

**Alternatives considered:**

- Separate Worker reimplementation — rejected (double maintenance, drift risk).
- Fastify-only with a proxy Worker — rejected (extra hop, no edge benefit).

## Decision: 18-route `/v1` surface, dual job paths

**Rationale:** Health/readiness, BullMQ enqueue (`POST /v1/jobs`) + platform enqueue (`POST /v1/jobs/enqueue`), job status with BullMQ-store + KV fallback, SSE events, preview, connectors, webhook/flow, and internal-assistant routes. Full table in [`spec.md`](./spec.md). Job status merges both stores so cutover is observable.

## Decision: Zod at every boundary

**Rationale:** Constitution Principle II — requests/payloads validate against `@superapp/platform-contracts` schemas before work is enqueued.

## Open items

- [ ] OAuth/session validation on merchant routes (deferred).
- [ ] OpenAPI generation from the route table.
