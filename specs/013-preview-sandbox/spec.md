# Feature Specification: Platform V2 Phase 13 — Preview Sandbox

**Feature Directory**: `013-preview-sandbox`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Shipped** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 13

## Goal

Preview envelope; Next shell; Fastify data; strict CSP; no arbitrary Liquid.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Shipped** |
| Shipped | Preview envelope contracts, Fastify preview API, Next.js sandbox shell, storage read path |
| Gitbook | [`phase-13-preview-sandbox.md`](../../docs/gitbook/02-architecture/v2-migration/phase-13-preview-sandbox.md) |

## Acceptance (from migration plan)

- Preview works without publish — Next shell + API serve exported `PREVIEW_EXPORT` artifacts.
- Preview cannot execute arbitrary AI or merchant code — CSP + iframe sandbox + RecipeSpec-safe guard at export/read.
- Publish remains separate and auditable — sandbox is read-only; no publish side effects.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section. ✅
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅
