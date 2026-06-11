# Tasks: Phase 21 — Rollout And Cutover

**Input**: [spec.md](./spec.md), [platform-v2-migration-plan.md](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**Status on master**: Partial — minimal implementation shipped

## Phase checklist (stub)

- [x] T001 Review Phase 21 acceptance criteria in migration plan
- [x] T002 Run `/speckit-plan` to produce detailed implementation plan
- [x] T003 Run `/speckit-tasks` to break down dependency-ordered work
- [x] T004 Implement phase deliverables (`/speckit-implement`)
- [x] T005 Add gitbook page under `docs/gitbook/02-architecture/v2-migration/` when merged
- [x] T006 Update [`000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md) matrix row to Shipped/Partial

## Verification

- [x] T007 `pnpm test` for affected packages
- [x] T008 Typecheck affected packages
