# Feature Specification: Platform V2 Phase 17 — Security And Compliance

**Feature Directory**: `017-security-compliance`

**Created**: 2026-06-12

**Status**: Stub — Not started on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 17

## Goal

App Store readiness; SSRF, secrets, audit; policy gates.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Not started** |
| Spec Kit | Stub spec + plan + tasks (expand via `/speckit-plan` when work starts) |
| Sibling worktree | May exist under `ai-shopify-superapp-phase17-*` — not merged until PR lands |

## Acceptance (from migration plan)

See Phase 17 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match migration plan acceptance section.
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs.
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable.

## Deferred / out of scope (this stub)

- Full user-story elaboration — run `/speckit-specify` or `/speckit-clarify` when phase becomes active.
- Implementation — tracked in `tasks.md` with `[ ]` until `/speckit-implement`.
