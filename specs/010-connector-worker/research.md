# Research: Phase 10 — Connector Worker

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Connector calls validate target URLs against an allowlist (SSRF)

**Rationale:** Outbound connector requests pass `assertConnectorTargetUrl()` (`@superapp/network-security` `connector-url-policy.ts`) before execution to block SSRF to internal addresses. Enforced on the `connector` queue handler and at API enqueue.

**Alternatives considered:**

- Trust merchant-supplied URLs — rejected (SSRF, constitution V).
- Per-connector bespoke validation — rejected (centralize policy).

## Decision: Dual op naming — `CONNECTOR_CALL` (legacy) vs `CONNECTOR_SYNC` (platform)

**Rationale:** Legacy BullMQ uses `CONNECTOR_TEST`/`CONNECTOR_CALL`; platform uses `CONNECTOR_TEST`/`CONNECTOR_SYNC`. Distinct names avoid cross-generation confusion until cutover. `/v1/connectors/test` and `/call` enqueue only.

## Status (honest)

Scaffold handler + enqueue routes shipped; full connector migration off Remix inline remains open.

## Open items

- [ ] Move inline Remix connector execution to the worker.
