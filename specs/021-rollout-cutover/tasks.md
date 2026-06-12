# Tasks: Phase 21 — Rollout And Cutover

**Input**: [spec.md](./spec.md), [research.md](./research.md), [platform-v2-migration-plan.md](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**Status on master**: Partial — rollout contracts + `/v1/jobs/mode` shipped; traffic cutover pending

## Phase checklist

- [x] T001 Review Phase 21 acceptance criteria in migration plan
- [x] T002 Run `/speckit-plan` to produce detailed implementation plan
- [x] T003 Run `/speckit-tasks` to break down dependency-ordered work
- [ ] T004 Implement phase deliverables — **scaffold only**; `PLATFORM_BACKEND` + flag parsing shipped; traffic cutover + Remix retirement open
- [ ] T005 Add gitbook cutover runbook under `docs/gitbook/02-architecture/v2-migration/` when cutover plan approved
- [x] T006 Update [`000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md) matrix row to Partial

## Cutover (pending)

- [ ] T007 Operator selects primary backend (`PLATFORM_BACKEND=cloudflare` recommended)
- [ ] T008 Merchant traffic cutover checklist + rollback
- [ ] T009 Remix route retirement plan executed
- [ ] T010 Dual queue consolidation after cutover

## Verification

- [x] T011 `pnpm test` for affected packages (`rollout-cutover.test.ts`, API mode route)
- [x] T012 Typecheck affected packages
