# Tasks: Phase 5 — Job Orchestration And BullMQ

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Status on master**: **Shipped** (2026-06-12)

## Phase checklist

- [x] T001 Review Phase 5 acceptance criteria in migration plan
- [x] T002 Produce implementation plan ([plan.md](./plan.md))
- [x] T003 Break down dependency-ordered work (this file)
- [x] T004 Implement `@superapp/job-orchestration` package
- [x] T005 Wire Remix preview export + Fastify enqueue to orchestrator
- [x] T006 Update [`000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md) matrix row

## Verification

- [x] T007 `pnpm test` for affected packages
- [x] T008 Typecheck affected packages
