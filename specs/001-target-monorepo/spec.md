# Feature Specification: Platform V2 Phase 1 — Target Monorepo Shape

**Feature Directory**: `001-target-monorepo`

**Created**: 2026-06-12

**Status**: Stub — Partial on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 1

## Goal

Create apps/frontend, apps/api, packages/db, packages/security, packages/observability boundaries; apps/web remains legacy.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Spec Kit | Stub spec + plan + tasks (expand via `/speckit-plan` when work starts) |
| Sibling worktree | May exist under `ai-shopify-superapp-phase1-*` — not merged until PR lands |

## Acceptance (from migration plan)

See Phase 1 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Implementation — tracked in `tasks.md` with `[ ]` until `/speckit-implement`.
