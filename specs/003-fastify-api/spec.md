# Feature Specification: Platform V2 Phase 3 — Fastify API Skeleton

**Feature Directory**: `003-fastify-api`

**Created**: 2026-06-12

**Status**: Stub — Not started on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 3

## Goal

apps/api with plugins, health, jobs, AI, module, publish, connector, flow, webhook, internal routes; no long-running work in handlers.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Not started** |
| Spec Kit | Stub spec + plan + tasks (expand via `/speckit-plan` when work starts) |
| Sibling worktree | May exist under `ai-shopify-superapp-phase3-*` — not merged until PR lands |

## Acceptance (from migration plan)

See Phase 3 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Implementation — tracked in `tasks.md` with `[ ]` until `/speckit-implement`.
