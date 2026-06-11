# Implementation Plan: Phase 5 — Job Orchestration And BullMQ

**Branch**: `master` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

## Summary

`@superapp/job-orchestration` provides BullMQ-backed job enqueue with inline fallback for local dev and CI.

## Architecture

```
Remix (schedulePreviewExport) ──┐
Fastify (/v1/jobs/enqueue)     ──┼──► JobOrchestrator ──► inline handlers (workers)
                                 └──► BullMQ queues ──► WorkerRuntime consumers
```

## Key files

| Path | Role |
|------|------|
| `packages/job-orchestration/src/config.ts` | Env parsing, effective mode resolution |
| `packages/job-orchestration/src/bullmq-queue.ts` | BullMQ Queue adapter |
| `packages/job-orchestration/src/job-orchestrator.ts` | Enqueue + inline execution |
| `packages/job-orchestration/src/job-events.ts` | Worker event helpers |
| `packages/platform-contracts/src/platform-jobs.ts` | Platform job type + queue registry |

## Constitution check

Align with [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md): Zod at boundaries, SOLID services, no merchant code deployment. ✅
