# Feature Specification: Platform V2 Phase 17 — Security And Compliance

**Feature Directory**: `017-security-compliance`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — `@superapp/network-security` shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 17

## Goal

App Store readiness; SSRF, secrets, audit; policy gates.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Package | `@superapp/network-security` (canonical); `@superapp/security` facade re-exports |
| Shipped | `assertSafeTargetUrl()` in [`packages/network-security/src/ssrf.ts`](../../packages/network-security/src/ssrf.ts); connector URL policy, Shopify signing, GDPR guards, PII redaction, in-memory rate limiter; unit tests; connector worker integration |
| Removed | Duplicate `packages/security/src/ssrf.ts` (facade index remains) |
| Pending | App Store readiness review, secrets audit, durable rate limiting, policy gates |

## Security module map

| Module | Exports | Used by |
|--------|---------|---------|
| `ssrf.ts` | `assertSafeTargetUrl()` | Connectors, outbound fetch boundaries |
| `connector-url-policy.ts` | Allowlist validation | Phase 10 connector worker |
| `signing.ts` | Shopify webhook HMAC | Phase 9 webhook ingress |
| `gdpr.ts` | GDPR webhook guards | Compliance ingress |
| `redact.ts` | Log redaction | Workers, observability |
| `rate-limit.ts` | In-memory limiter | API stubs (not production-durable) |

Import from `@superapp/network-security` in new code; `@superapp/security` remains for legacy imports.

## Acceptance (from migration plan)

See Phase 17 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section. ⚠️ Partial
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
