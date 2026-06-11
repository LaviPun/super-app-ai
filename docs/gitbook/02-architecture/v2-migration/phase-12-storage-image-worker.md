# Platform V2 — Phase 12 Storage And Image Worker

**Status:** Shipped on `master` (2026-06-12, PR #8). BullMQ consumer wiring and R2 production deploy remain deferred until Phases 5/9–11/18 land.  
**Plan reference:** `platform-v2-migration-plan.md` § Phase 12

## Scope delivered

| Area | Implementation |
|------|----------------|
| Generated asset contracts | `packages/platform-contracts/src/storage.ts` — metadata, worker payloads, events, results |
| Job registry | `packages/platform-contracts/src/jobs.ts` — `IMAGE_INGESTION`, `PREVIEW_EXPORT`, `ASSET_CLEANUP` → `asset-storage` queue |
| Storage adapters | `apps/workers/src/storage/*` — local adapter, R2 contract + injectable binding double, factory fallback |
| Worker handler boundary | `apps/workers/src/image/image-worker.ts` — ingest, preview export, cleanup with RecipeSpec-safe preview guard |
| Queue processor shim | `apps/workers/src/image-storage.ts` — BullMQ-ready envelope → `ImageWorkerHandler`, emits `JOB_*` lifecycle events |
| Remix preview stub | `apps/web/app/services/preview/preview-export.queue.server.ts` — validates `PREVIEW_EXPORT` payloads; gated by `PREVIEW_EXPORT_QUEUE_ENABLED=1` |
| Safety | Preview HTML rejects scripts/inline handlers; R2 secrets stay server-side; signed URLs deferred to API proxy |

## Job types

| Payload `type` | Queue | Purpose |
|----------------|-------|---------|
| `IMAGE_INGESTION` | `asset-storage` | Store generated/reference image bytes outside Prisma |
| `PREVIEW_EXPORT` | `asset-storage` | Persist RecipeSpec-driven preview HTML/JSON artifacts |
| `ASSET_CLEANUP` | `asset-storage` | Delete stored objects by storage key |

Registry helpers: `resolveImageWorkerQueue()`, `parseImageWorkerPayload()`, `ASSET_STORAGE_JOB_REGISTRY`.

`THEME_ANALYZE` remains on the shared jobs map in the main migration plan; theme profile offload can reuse the same storage adapters in a follow-up without duplicating contracts here.

## Storage providers

- **Local:** default for dev/test (`LOCAL_STORAGE_PATH` or `.data/superapp-assets`).
- **R2:** enabled only when a Workers R2 binding (or test double) is injected via `createStorageAdapter({ provider: 'r2', r2Bucket })`. Missing binding throws `R2_UNAVAILABLE` (never exposed to merchants).

## R2 production deployment (ops)

When deploying the worker runtime to Cloudflare (or another host that injects bindings):

1. **Create bucket** — e.g. `superapp-generated-assets` in the target Cloudflare account.
2. **Bind in worker config** — map the bucket to the worker binding name expected by `createStorageAdapter({ provider: 'r2', r2Bucket })` (see `apps/workers/src/storage/r2-storage-adapter.ts`).
3. **Set provider** — `STORAGE_PROVIDER=r2` (or pass `provider: 'r2'` in factory options) in the worker environment.
4. **Secrets** — R2 access is via the binding only; do not pass account keys into Remix or merchant-facing env.
5. **Signed URLs** — remain disabled until the API proxy signing service ships; `createSignedUrl` throws `SIGNED_URL_NOT_CONFIGURED` by design.
6. **Local fallback** — omit binding or set `STORAGE_PROVIDER=local` for dev; factory falls back to filesystem storage under `LOCAL_STORAGE_PATH`.

## Merge notes / conflict risk

- **Shared contract touchpoint:** Phase 9–11 branches may also edit `packages/platform-contracts/src/jobs.ts`. This worktree adds the `asset-storage` registry block only; merge should union job types without rewriting Phase 9–11 processor wiring.
- **Queue consumer:** BullMQ worker process registration for `asset-storage` is owned by the Phase 9–11 queue merge; Phase 12 supplies `createImageStorageProcessor()` and contracts.
- **Remix enqueue:** `preview.$moduleId` calls `schedulePreviewExport()` (fire-and-forget). Set `PREVIEW_EXPORT_QUEUE_ENABLED=1` to validate payloads; actual queue publish is TODO until BullMQ wiring lands.

## Verification

```bash
pnpm --filter @superapp/platform-contracts test
pnpm --filter @superapp/platform-contracts typecheck
pnpm --filter @superapp/workers test
pnpm --filter @superapp/workers typecheck
pnpm --filter web test -- app/services/preview/preview-export.queue.server.test.ts
pnpm test
```

Optional legacy gate:

```bash
pnpm --filter web test -- app/__tests__/compile.test.ts
```

## Signed URL / proxy policy (documented, not fully wired)

- R2 secrets stay server-side; clients receive proxy URLs or short-lived signed URLs from Fastify in a later phase.
- `R2StorageAdapter.createSignedUrl` intentionally throws `SIGNED_URL_NOT_CONFIGURED` until the API signing service exists.
