# Tasks: Platform V2 — Master Index

**Input**: [spec.md](./spec.md), [platform-v2-migration-plan.md](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

## Spec coverage

- [x] T001 Add `platform-v2-migration-plan.md` to gitbook
- [x] T002 Add ADR-001 under `v2-migration/`
- [x] T003 Create master spec `specs/000-platform-v2-master/`
- [x] T004 Create stub spec dirs for V2 phases 1–11, 13–21
- [x] T005 Phase 12 full spec (`012-storage-image-worker`) — all tasks `[x]`
- [x] T006 Update gitbook SUMMARY + spec-driven-development matrix
- [x] T007 Update `implementation-status.md` with V2 phase 12 in summary table
- [x] T008 Point `.specify/feature.json` and specify-rules to master feature
- [ ] T009 Merge phases 3–11 from sibling worktrees (engineering — not spec-only)
- [ ] T010 Complete Phase 12 deferred BullMQ + R2 prod (after Phase 5/18)
- [ ] T011 Fill `plan.md` + `tasks.md` for each stub phase as work starts (`/speckit-plan`, `/speckit-tasks`)

## Verification (master)

- [x] T012 Run `pnpm test` on master after doc/spec changes
- [x] T013 Run typecheck on `@superapp/platform-contracts` and `@superapp/workers`
