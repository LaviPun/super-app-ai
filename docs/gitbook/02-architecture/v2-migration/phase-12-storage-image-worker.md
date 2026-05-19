# Platform V2 — Phase 12 Storage And Image Worker

**Status:** Local/testable worker boundary complete (isolated worktree)  
**Plan reference:** `platform-v2-migration-plan.md` § Phase 12

## Scope delivered

| Area | Implementation |
|------|----------------|
| Generated asset contracts | `packages/platform-contracts/src/storage.ts` — metadata, worker payloads, events, results |
| Storage adapters | `apps/workers/src/storage/*` — local adapter, R2 contract + injectable binding double, factory fallback |
| Worker handler boundary | `apps/workers/src/image/image-worker.ts` — ingest, preview export, cleanup with RecipeSpec-safe preview guard |
| Queue processor shim | `apps/workers/src/image/image-worker.ts` — BullMQ-ready envelope → `ImageWorkerHandler`, emits `JOB_*` lifecycle events |
| Safety | Preview HTML rejects scripts/inline handlers; R2 secrets stay server-side; signed URLs deferred to API proxy |

## Job types (Phase 12 worktree)

| Payload `type` | Queue | Purpose |
|----------------|-------|---------|
| `IMAGE_INGESTION` | `asset-storage` | Store generated/reference image bytes outside Prisma |
| `PREVIEW_EXPORT` | `asset-storage` | Persist RecipeSpec-driven preview HTML/JSON artifacts |
| `ASSET_CLEANUP` | `asset-storage` | Delete stored objects by storage key |

`THEME_ANALYZE` remains on the shared jobs map in the main migration plan; theme profile offload can reuse the same storage adapters in a follow-up without duplicating contracts here.

## Storage providers

- **Local:** default for dev/test (`LOCAL_STORAGE_PATH` or `.data/superapp-assets`).
- **R2:** enabled only when a Workers R2 binding (or test double) is injected via `createStorageAdapter({ provider: 'r2', r2Bucket })`. Missing binding throws `R2_UNAVAILABLE` (never exposed to merchants).

## Merge notes / conflict risk

- **Shared contract touchpoint:** Phase 9–11 branches may own `packages/platform-contracts/src/jobs.ts` queue routing. This worktree adds storage/asset schemas only; merge should register `IMAGE_INGESTION`, `PREVIEW_EXPORT`, and `ASSET_CLEANUP` in the shared job registry without rewriting Phase 9–11 processors.
- **No edits** were made to Phase 9/10/11 worktrees or their processor files.
- Legacy Remix preview generation (`apps/web`) is unchanged; a future adapter can enqueue `PREVIEW_EXPORT` jobs after preview HTML is rendered.

## Verification

```bash
pnpm --filter @superapp/platform-contracts test
pnpm --filter @superapp/platform-contracts typecheck
pnpm --filter @superapp/workers test
pnpm --filter @superapp/workers typecheck
```

Optional legacy gate:

```bash
pnpm --filter web test -- app/__tests__/compile.test.ts
```

## Signed URL / proxy policy (documented, not fully wired)

- R2 secrets stay server-side; clients receive proxy URLs or short-lived signed URLs from Fastify in a later phase.
- `R2StorageAdapter.createSignedUrl` intentionally throws `SIGNED_URL_NOT_CONFIGURED` until the API signing service exists.
