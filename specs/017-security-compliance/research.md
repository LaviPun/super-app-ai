# Research: Phase 17 — Security & Compliance

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Single security home — `@superapp/network-security`, `@superapp/security` is a facade

**Rationale:** SSRF (`ssrf.ts`), connector URL policy, Shopify HMAC signing, GDPR ingress guards, and log redaction live in `packages/network-security`. `@superapp/security` re-exports for backward-compatible imports; the duplicate `packages/security/src/ssrf.ts` was removed to kill drift. Constitution V + package list updated to match.

**Alternatives considered:**

- Keep parallel copies in both packages — rejected (the exact drift this phase fixes; M7/M11).
- Inline SSRF checks per call site — rejected (no central allowlist policy).

## Decision: Rate limiter is in-memory (interim)

**Rationale:** `rate-limit.ts` is in-memory and explicitly **not** production-durable (drift M5); durable (KV/Redis) limiting is deferred.

## Status (honest)

SSRF/signing/GDPR/redaction shipped with tests; App Store audit automation, secrets audit, durable rate limiting, and policy gates remain (SC-001 Partial).

## Open items

- [ ] Durable rate limiter.
- [ ] App Store readiness audit automation.
