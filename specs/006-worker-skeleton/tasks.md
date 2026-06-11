# Tasks: Phase 6 — Worker App Skeleton

**Input**: [spec.md](./spec.md), [platform-v2-migration-plan.md](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**Status on master**: **Shipped** — 2026-06-12

## Phase checklist

- [x] T001 Review Phase 6 acceptance criteria in migration plan
- [x] T002 Create worker entrypoint (`src/start.ts`)
- [x] T003 Implement BullMQ runtime (`src/worker-runtime.ts`)
- [x] T004 Wire graceful shutdown
- [x] T005 Register image storage handler + scaffold handlers
- [x] T006 Add unit tests for runtime and handlers
- [x] T007 Update [`000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md) matrix row to Shipped
- [ ] T008 Add Prisma client bootstrap (Phase 15 dependency)
- [ ] T009 Add Sentry/OTel bootstrap (Phase 16 dependency)

## Verification

- [x] T010 `pnpm test` for apps/workers
- [x] T011 Typecheck apps/workers
