# Research: Phase 16 — Observability & Analytics

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Trace context on job envelopes; PII redaction at the sink

**Rationale:** Jobs carry `traceparent` through `jobs.ts` / `platform-jobs.ts` so work can be correlated across enqueue → worker. The worker telemetry sink (`@superapp/observability`) redacts PII (`redact.ts`) before emit so no secrets/PII reach logs (constitution: no PII in logs).

**Alternatives considered:**

- Log raw payloads — rejected (PII/secret leakage).
- No trace propagation — rejected (async work becomes unobservable).

## Status (honest)

Telemetry sink + redaction shipped; full OpenTelemetry/Sentry integration per spec remains open.

## Open items

- [ ] Wire OTel exporter + Sentry.
- [ ] Define SLO dashboards from emitted traces.
