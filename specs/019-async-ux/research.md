# Research: Phase 19 — Async UX

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Server-Sent Events for job progress

**Rationale:** `GET /v1/jobs/:jobId/events` streams worker progress as SSE using the `WorkerEventSchema` event shape, so the frontend shows live status without polling. SSE chosen over WebSockets — one-way progress, simpler through Cloudflare, no bidirectional channel needed.

**Alternatives considered:**

- Client polling — rejected (latency + load).
- WebSockets — rejected (overkill for one-way progress; more infra).

## Status (honest)

SSE endpoint + Next progress panels shipped; merchant-facing embedded async UI remains open (depends on Phase 4 shell).

## Open items

- [ ] Embedded merchant progress UX.
- [ ] Reconnect/resume semantics for dropped SSE streams.
