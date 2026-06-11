# Tasks: Phase 12 — Storage & Image Worker

**Input**: Design documents from `/specs/012-storage-image-worker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Status**: Core implementation complete; Phase 6 polish shipped in worktree.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Packages and worker app scaffold

- [x] T001 Create `packages/platform-contracts` with storage schemas in `packages/platform-contracts/src/storage.ts`
- [x] T002 Create `apps/workers` package with Vitest config in `apps/workers/vitest.config.ts`
- [x] T003 [P] Wire workspace dependencies in root `pnpm-lock.yaml` and package `package.json` files

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storage adapter abstraction and factory

- [x] T004 Define `StorageAdapter` interface in `apps/workers/src/storage/storage-adapter.ts`
- [x] T005 [P] Implement local adapter in `apps/workers/src/storage/local-storage-adapter.ts`
- [x] T006 [P] Implement R2 adapter in `apps/workers/src/storage/r2-storage-adapter.ts`
- [x] T007 Implement factory in `apps/workers/src/storage/storage-adapter-factory.ts`
- [x] T008 Add worker lifecycle events in `apps/workers/src/worker-events.ts`
- [x] T009 Map queue names in `apps/workers/src/image-storage.ts`

**Checkpoint**: Foundation ready

---

## Phase 3: User Story 1 — Store generated images (P1) 🎯 MVP

**Goal**: IMAGE_INGESTION stores bytes via adapter and returns metadata

**Independent Test**: `pnpm --filter @superapp/workers test` — ingestion happy path + invalid payload

- [x] T010 [P] [US1] Contract tests in `packages/platform-contracts/src/__tests__/storage-contracts.test.ts`
- [x] T011 [P] [US1] Storage adapter tests in `apps/workers/src/__tests__/image-storage.test.ts`
- [x] T012 [US1] Implement ingestion in `apps/workers/src/image/image-worker.ts`
- [x] T013 [US1] Export handler from `apps/workers/src/image/index.ts` and `apps/workers/src/index.ts`

**Checkpoint**: US1 complete in worktree

---

## Phase 4: User Story 2 — Export preview artifacts (P2)

**Goal**: PREVIEW_EXPORT with HTML safety validation

**Independent Test**: Worker test rejects script tags; stores safe HTML

- [x] T014 [US2] Add preview validation and export path in `apps/workers/src/image/image-worker.ts`
- [x] T015 [US2] Cover preview edge cases in `apps/workers/src/__tests__/image-worker.test.ts`

**Checkpoint**: US2 complete in worktree

---

## Phase 5: User Story 3 — Clean up assets (P3)

**Goal**: ASSET_CLEANUP deletes by storage key

**Independent Test**: Store then cleanup; verify idempotent missing-key behavior

- [x] T016 [US3] Implement cleanup in `apps/workers/src/image/image-worker.ts`
- [x] T017 [US3] Add cleanup tests in `apps/workers/src/__tests__/image-worker.test.ts`

**Checkpoint**: US3 complete in worktree

---

## Phase 6: Polish & Cross-Cutting / Merge

**Purpose**: Registry merge, docs, CI, Remix integration follow-ups

- [x] T018 Register `IMAGE_INGESTION`, `PREVIEW_EXPORT`, `ASSET_CLEANUP` in `packages/platform-contracts/src/jobs.ts` (resolve merge with Phase 9–11)
- [x] T019 Update `docs/implementation-status.md` with Phase 12 shipped status
- [x] T020 [P] Sync gitbook merge notes in `docs/gitbook/02-architecture/v2-migration/phase-12-storage-image-worker.md`
- [x] T021 [P] Update root `README.md` with workers package usage
- [x] T022 Run full monorepo `pnpm test` and fix any cross-package failures before PR
- [x] T023 Enqueue `PREVIEW_EXPORT` from Remix preview flow in `apps/web` (deferred integration)
- [x] T024 Document R2 binding deployment in ops/gitbook (production config)

---

## Dependencies & Execution Order

- Phases 1–6: **Done** in current worktree
- Post-merge: BullMQ consumer registration (Phase 9–11) and live R2 deploy

### MVP scope

User Story 1 (T010–T013) — already delivered.

### Parallel opportunities (remaining)

- T020 and T021 can run in parallel after T018
- T023 and T024 are independent follow-ups

---

## Implementation Strategy

1. Merge Phase 12 branch → register jobs (T018)
2. Run quickstart.md validation (T022)
3. Ship docs (T019–T021)
4. Optional: Remix enqueue (T023) and R2 ops doc (T024)

Use `/speckit-implement` in Cursor to execute remaining unchecked tasks.
