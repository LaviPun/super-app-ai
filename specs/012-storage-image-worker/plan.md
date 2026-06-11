# Implementation Plan: Phase 12 — Storage & Image Worker

**Branch**: `012-storage-image-worker` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-storage-image-worker/spec.md`

## Summary

Offload generated images and RecipeSpec preview artifacts from Prisma to a worker boundary with pluggable storage (local dev, Cloudflare R2 production). Deliver Zod contracts in `packages/platform-contracts`, storage adapters and `ImageWorkerHandler` in `apps/workers`, and unit tests for all three job types. Queue wiring and Remix enqueue paths are merge-time / follow-up work.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20+

**Primary Dependencies**: Zod, Vitest, pnpm workspaces; Cloudflare R2 via binding-injected adapter (no runtime SDK in worker tests)

**Storage**: Local filesystem adapter (default); R2 adapter when binding present

**Testing**: Vitest per package (`pnpm --filter @superapp/platform-contracts test`, `pnpm --filter @superapp/workers test`)

**Target Platform**: Monorepo workers (BullMQ or equivalent queue in sibling phase); Remix `apps/web` enqueues later

**Project Type**: pnpm monorepo — embedded Shopify app + async workers + shared contracts

**Performance Goals**: Worker jobs complete in-process for unit tests; production targets TBD with queue SLA in Phase 9–11 merge

**Constraints**: No merchant-deployed code; SSRF-safe fetches elsewhere; preview HTML must block scripts; R2 credentials server-side only

**Scale/Scope**: Three job types on `asset-storage` queue; signed URLs deferred

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. RecipeSpec-only | PASS | Preview export validates HTML; no merchant code paths |
| II. Schema at boundaries | PASS | All payloads in `packages/platform-contracts/src/storage.ts` |
| III. Test-first shipping | PASS | Contract + worker tests shipped in worktree |
| IV. SOLID services | PASS | Adapter factory + handler separation |
| V. Security & SSRF | PASS | Unsafe preview rejected; R2 fails closed |
| VI. CWV | N/A | Worker-only phase; storefront unchanged |

**Post-design re-check**: PASS — no constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/012-storage-image-worker/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── worker-job-contracts.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/platform-contracts/
└── src/
    ├── storage.ts              # Zod schemas + types
    └── __tests__/storage-contracts.test.ts

apps/workers/
└── src/
    ├── image/image-worker.ts   # ImageWorkerHandler
    ├── image-storage.ts        # Queue name mapping
    ├── storage/
    │   ├── storage-adapter.ts
    │   ├── local-storage-adapter.ts
    │   ├── r2-storage-adapter.ts
    │   └── storage-adapter-factory.ts
    ├── worker-events.ts
    └── __tests__/
        ├── image-worker.test.ts
        └── image-storage.test.ts

docs/gitbook/02-architecture/v2-migration/
└── phase-12-storage-image-worker.md
```

**Structure Decision**: New packages `apps/workers` and `packages/platform-contracts` extend the existing monorepo; Remix integration stays in `apps/web` as a follow-up enqueue only.

## Complexity Tracking

No violations requiring justification.
