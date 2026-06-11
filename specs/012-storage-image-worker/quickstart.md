# Quickstart: Phase 12 — Storage & Image Worker

## Prerequisites

- Node 20+, pnpm
- Repo root: `ai-shopify-superapp-phase12-storage-image-worker`

## Validate contracts

```bash
pnpm --filter @superapp/platform-contracts test
pnpm --filter @superapp/platform-contracts typecheck
```

Expected: all storage contract tests pass.

## Validate workers

```bash
pnpm --filter @superapp/workers test
pnpm --filter @superapp/workers typecheck
```

Expected: image worker + storage adapter tests pass (9+ tests).

## Manual smoke (local adapter)

1. Set `STORAGE_PROVIDER=local` (or omit for default).
2. Instantiate `ImageWorkerHandler` with local adapter from factory (see `apps/workers/src/__tests__/image-worker.test.ts`).
3. Call `handle()` with a valid `IMAGE_INGESTION` payload (base64 PNG stub).
4. Assert `result.status === 'succeeded'` and `result.assets[0].storage.key` is set.

## Preview safety check

Enqueue `PREVIEW_EXPORT` with body containing `<script>alert(1)</script>` — expect `failed` status and no object written.

## Merge checklist

- Register job types in shared `packages/platform-contracts/src/jobs.ts` when merging with Phase 9–11 branch
- Update `docs/implementation-status.md` and gitbook phase doc
- Run full monorepo test suite before PR

## Out of scope (this quickstart)

- Production R2 binding deployment
- Remix route enqueue for preview export
- Signed URL retrieval
