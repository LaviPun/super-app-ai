# Feature Specification: Platform V2 Phase 4 — Next.js Embedded Frontend Skeleton

**Feature Directory**: `004-next-frontend`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — Next.js scaffold shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 4

## Goal

apps/frontend App Router, Shopify shell, Polaris, typed Fastify client; no backend logic in Next API routes.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | `apps/frontend` Next.js App Router scaffold (`layout.tsx`, `page.tsx`, `next.config.mjs`), vitest config, and scaffold unit test |
| Pending | Shopify embedded shell, Polaris integration, typed Fastify client |

## Acceptance (from migration plan)

See Phase 4 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Remaining implementation — tracked in migration plan pending items above.
