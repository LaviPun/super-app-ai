# Cloudflare deployment runbook (Platform V2)

**Last updated:** 2026-06-12  
**Policy:** Cloudflare-only cloud infra for V2 (`Workers`, `Pages`, `R2`, `Queues`). No Kubernetes, Fly.io, or Railway.

## Topology

| Component | Cloudflare product | Config |
|-----------|-------------------|--------|
| `apps/api` | Workers | `apps/api/wrangler.jsonc` |
| `apps/workers` | Workers + Queues consumer | `apps/workers/wrangler.jsonc` |
| `apps/frontend` | Pages | `apps/frontend/wrangler.jsonc` |
| Generated assets | R2 | binding `ASSETS` → bucket `superapp-assets` |
| Async jobs (prod) | Queues | queue `asset-storage` |
| Legacy merchant UI | Remix (`apps/web`) | Existing host until Phase 21 cutover |

Local development keeps **Fastify** (`apps/api`) and **BullMQ** (`apps/workers`) for parity. Set `JOB_EXECUTION_MODE=inline` (default) or `queue` with `QUEUE_REDIS_URL` when Redis is available.

## Prerequisites

- Cloudflare account with Workers, R2, Queues, and Pages enabled
- `wrangler` CLI (installed per-app via `pnpm install`)
- `wrangler login`

## R2

Create bucket `superapp-assets` (or override in wrangler). The Workers binding name is **`ASSETS`** in both API and worker wrangler files.

Optional env for public reads (signed URL proxy ships in a later phase):

| Variable | Purpose |
|----------|---------|
| `R2_BUCKET_NAME` | Bucket name fallback in adapter factory |
| `R2_PUBLIC_BASE_URL` | CDN origin for public-read objects |

## Queues

1. Create queue `asset-storage` in the Cloudflare dashboard (or `wrangler queues create asset-storage`).
2. API producer binding: `ASSET_STORAGE_QUEUE` (see `apps/api/wrangler.jsonc`).
3. Worker consumer: `apps/workers` deploys the queue consumer in `src/cloudflare-queue-consumer.ts`.

Transition: Remix preview enqueue can use BullMQ (`QUEUE_REDIS_URL`) until the API producer publishes to Cloudflare Queues.

## Deploy commands

```bash
# API Worker (health, readiness, job mode)
pnpm --filter @superapp/api deploy:cf

# Asset-storage queue consumer
pnpm --filter @superapp/workers deploy:cf

# Next.js preview shell (after OpenNext / static build)
pnpm --filter @superapp/frontend build
pnpm --filter @superapp/frontend deploy:cf
```

## Environment variables (Workers)

Set in `wrangler.jsonc` `vars` or via `wrangler secret put`:

| Variable | Values | Notes |
|----------|--------|-------|
| `JOB_EXECUTION_MODE` | `inline` \| `queue` \| `disabled` | Mirrors `@superapp/job-orchestration` |
| `PLATFORM_V2_ENABLED` | `true` \| `false` | Feature gate |
| `QUEUE_REDIS_URL` | Redis URL | Optional BullMQ bridge during transition |

## Internal AI router

The reference Qwen3 router is **not** deployed to Kubernetes. Options:

- **Local:** `pnpm --filter web router:internal`
- **Docker:** `apps/web/Dockerfile.internal-router`
- **Modal edge:** `deploy/modal-qwen-router/`

## Verification

```bash
pnpm test
pnpm -r --if-present typecheck
curl https://superapp-api.<account>.workers.dev/health
curl https://superapp-api.<account>.workers.dev/ready
```

## Related specs

- [`specs/018-deployment/spec.md`](../../../../specs/018-deployment/spec.md)
- [`ADR-001-platform-v2-architecture.md`](../ADR-001-platform-v2-architecture.md)
