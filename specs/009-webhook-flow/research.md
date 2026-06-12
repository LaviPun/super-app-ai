# Research: Phase 9 — Webhook & Flow Workers

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Fast ack at ingress, real work on the queue

**Rationale:** `POST /v1/webhooks/shopify` verifies HMAC (via `@superapp/network-security` `signing.ts`), enqueues onto the `webhook` queue, and returns 200 immediately so Shopify never times out. Flow execution runs on the `flow` queue. Manual flows trigger via `POST /v1/flows/run`.

**Alternatives considered:**

- Process webhooks synchronously — rejected (Shopify delivery timeout + tunnel limit).
- Skip HMAC during migration — rejected (security boundary, constitution V).

## Decision: Legacy vs platform flow payloads kept distinct

**Rationale:** API ingress uses legacy `WebhookReceivedPayloadSchema` / `FlowRunPayloadSchema`; workers consume `FlowRunWorkerPayloadSchema` (adds `jobId`, `shopId`). See [`002-shared-contracts/research.md`](../002-shared-contracts/research.md).

## Status (honest)

Ingress + flow trigger + worker handlers shipped with tests. Dedupe store, replay UI, and production HMAC hardening remain (spec SC-004 Pending).

## Open items

- [ ] Idempotency/dedupe store keyed by Shopify event id.
- [ ] Replayable flow runs.
