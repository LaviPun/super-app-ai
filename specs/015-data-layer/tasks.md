# Tasks: Phase 15 — Data Layer Productionization

**Input**: [spec.md](./spec.md), [platform-v2-migration-plan.md](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**Status on master**: Partial — `@superapp/data-layer` in-memory repository + schemas; production Postgres/R2 wiring pending

## Phase checklist (stub)

- [x] T001 Review Phase 15 acceptance criteria in migration plan
- [x] T002 Run `/speckit-plan` to produce detailed implementation plan
- [x] T003 Run `/speckit-tasks` to break down dependency-ordered work
- [ ] T004 Implement phase deliverables — **scaffold only**; in-memory data layer shipped; production persistence open
- [ ] T005 Add gitbook page under `docs/gitbook/02-architecture/v2-migration/` when data layer productionized
- [x] T006 Update [`000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md) matrix row to Partial

## Verification

- [x] T007 `pnpm test` for affected packages
- [x] T008 Typecheck affected packages
