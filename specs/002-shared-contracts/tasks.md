# Tasks: Phase 2 — Shared Contracts

**Input**: [spec.md](./spec.md), [platform-v2-migration-plan.md](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**Status on master**: **Shipped (core)** — 2026-06-12

## Phase checklist

- [x] T001 Review Phase 2 acceptance criteria in migration plan
- [x] T002 Implement storage + image job contracts (`storage.ts`, `jobs.ts`)
- [x] T003 Implement platform job registry (`platform-jobs.ts`)
- [x] T004 Add unit tests for contracts
- [x] T005 Export from `packages/platform-contracts/src/index.ts`
- [x] T006 Update [`000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md) matrix row to Shipped (core)
- [ ] T007 Add Fastify route request/response schemas to contracts
- [ ] T008 Add gitbook page under `docs/gitbook/02-architecture/v2-migration/` when expanded

## Verification

- [x] T009 `pnpm test` for platform-contracts
- [x] T010 Typecheck platform-contracts
