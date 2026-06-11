# Tasks: Phase 8 — Internal Assistant Migration

**Input**: [spec.md](./spec.md), [platform-v2-migration-plan.md](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**Status on master**: Partial — CF Worker API routes + readiness/chat stubs; full Remix assistant remains on `apps/web`

## Phase checklist (stub)

- [x] T001 Review Phase 8 acceptance criteria in migration plan
- [x] T002 Run `/speckit-plan` to produce detailed implementation plan
- [x] T003 Run `/speckit-tasks` to break down dependency-ordered work
- [x] T004 Implement phase deliverables (`/speckit-implement`)
- [x] T005 Add gitbook page under `docs/gitbook/02-architecture/v2-migration/` when merged
- [x] T006 Update [`000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md) matrix row to Shipped/Partial

## Cloudflare parity (2026-06-12)

- [x] T009 Port internal assistant readiness + chat stubs to `apps/api/src/cloudflare-worker.ts`
- [x] T010 Shared handlers in `apps/api/src/handlers/internal-assistant-handlers.ts`

- [x] T007 `pnpm test` for affected packages
- [x] T008 Typecheck affected packages
