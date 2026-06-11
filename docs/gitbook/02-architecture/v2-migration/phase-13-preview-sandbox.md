# Platform V2 — Phase 13 Preview Sandbox

**Status:** Shipped on `master` (2026-06-12).  
**Plan reference:** `platform-v2-migration-plan.md` § Phase 13

## Scope delivered

| Area | Implementation |
|------|----------------|
| Preview envelope contracts | `packages/platform-contracts/src/preview.ts` — envelope schema, CSP policy, storage key helpers, RecipeSpec-safe guard |
| Fastify preview data API | `apps/api/src/routes/preview.ts` — `/v1/preview/:shopId/:moduleId/envelope` + `/content` with strict CSP |
| Next.js preview shell | `apps/frontend/app/preview/[shopId]/[moduleId]/page.tsx` — sandboxed iframe, no Liquid |
| Storage read path | `StorageAdapter.getObject()` on local/R2 adapters for serving exported preview artifacts |
| Phase 12 wiring | Reads artifacts written by `PREVIEW_EXPORT` via shared `buildPreviewStorageKey()` |

## Preview flow

1. Remix or API enqueues `PREVIEW_EXPORT` (Phase 12) → artifact stored under `shops/{shopId}/modules/{moduleId}/previews/{assetId}.html`.
2. Fastify `/v1/preview/.../envelope` returns JSON envelope (RecipeSpec ref, policy metadata, version).
3. Fastify `/v1/preview/.../content` streams HTML with `Content-Security-Policy` (no scripts).
4. Next.js `/preview/{shopId}/{moduleId}` loads envelope metadata and embeds content in a sandboxed iframe.

## Security rules

- **Strict CSP** on preview HTML responses (`default-src 'none'`, inline styles only).
- **Iframe sandbox** with empty token (most restrictive) on the Next shell.
- **No Liquid** — preview artifacts are RecipeSpec-compiled HTML only.
- **No untrusted scripts** — `assertPreviewContentIsRecipeSafe()` at export and read time.

## Verification

```bash
pnpm --filter @superapp/platform-contracts test
pnpm --filter @superapp/workers test
pnpm --filter @superapp/api test
pnpm --filter @superapp/frontend test
pnpm test
```

Local smoke:

```bash
# Terminal 1 — API (inline PREVIEW_EXPORT + preview routes)
PORT=3002 JOB_EXECUTION_MODE=inline pnpm --filter @superapp/api dev

# Export a preview artifact
curl -X POST http://localhost:3002/v1/jobs/enqueue -H 'content-type: application/json' \
  -d '{"jobType":"PREVIEW_EXPORT","shopId":"shop_1","payload":{"type":"PREVIEW_EXPORT","jobId":"job_1","shopId":"shop_1","moduleId":"module_1","assetId":"preview_module_1","preview":{"contentType":"text/html","body":"<section>Hello</section>"}}}'

# Terminal 2 — Next shell
NEXT_PUBLIC_API_BASE_URL=http://localhost:3002 pnpm --filter @superapp/frontend dev
# Open http://localhost:3001/preview/shop_1/module_1?assetId=preview_module_1
```

## Deferred

- Signed URL / CDN proxy for R2 previews (reuse Phase 12 `SIGNED_URL_NOT_CONFIGURED` policy).
- Merchant-facing async UX in Remix (Phase 19).
