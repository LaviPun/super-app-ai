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
| Async jobs (prod) | Queues | all `PLATFORM_QUEUES` bindings |
| Legacy merchant UI | Remix (`apps/web`) | Existing host until Phase 21 cutover |

Local development keeps **Fastify** (`apps/api`) and **BullMQ** (`apps/workers`) for parity. Set `JOB_EXECUTION_MODE=inline` (default) or `queue` with `QUEUE_REDIS_URL` when Redis is available.

## Operator vs automated

| Step | Who | Notes |
|------|-----|-------|
| Create R2 bucket `superapp-assets` | **Operator (CF dashboard or CLI)** | Required before deploy; wrangler references bucket name only |
| Create Queues (`asset-storage`, `ai-generation`, `flow`, `connector`, `publish`, `webhook`, `retention`) | **Operator** | `wrangler queues create <name>` for each queue in wrangler configs |
| `wrangler login` | **Operator** | One-time per machine |
| `pnpm --filter @superapp/api deploy:cf` | **Automated script** | Deploys API Worker with producers + R2 binding |
| `pnpm --filter @superapp/workers deploy:cf` | **Automated script** | Deploys queue consumer Worker |
| `pnpm --filter @superapp/frontend deploy:cf` | **Automated script** | After `pnpm build` |
| Set `JOB_EXECUTION_MODE=queue` in API Worker | **Operator** | Via dashboard or `wrangler.jsonc` vars when Queues provisioned |
| CI deploy workflow | **Pending** | Manual `deploy:cf` until T010 lands |

## API Worker surface (automated in repo)

The Cloudflare Worker entry (`apps/api/src/cloudflare-worker.ts`) mirrors Fastify routes via shared handlers:

| Route | Purpose |
|-------|---------|
| `GET /health`, `GET /ready` | Liveness / readiness |
| `GET /v1/jobs/mode` | Execution mode + feature gate |
| `POST /v1/jobs/enqueue` | All `PlatformJobType` values via `@superapp/platform-contracts` |
| `GET /v1/jobs/:jobId` | Job status (in-memory store; DO/KV in later phase) |
| `GET /v1/preview/:shopId/:moduleId/envelope` | Preview envelope JSON |
| `GET /v1/preview/:shopId/:moduleId/content` | CSP-protected HTML |
| `GET /v1/internal/assistant/readiness` | Phase 8 proxy stub |
| `POST /v1/internal/assistant/chat` | Phase 8 proxy stub |

Queue mode on Workers uses `@superapp/job-orchestration` `createCloudflareQueueAdapter` with producer bindings from `CLOUDFLARE_QUEUE_BINDING_BY_QUEUE`.

## Prerequisites

- Cloudflare account with Workers, R2, Queues, and Pages enabled
- `wrangler` CLI (installed per-app via `pnpm install`)
- `wrangler login`

## R2 (operator)

Create bucket `superapp-assets` (or override in wrangler). The Workers binding name is **`ASSETS`** in both API and worker wrangler files.

```bash
wrangler r2 bucket create superapp-assets
```

Optional env for public reads (signed URL proxy ships in a later phase):

| Variable | Purpose |
|----------|---------|
| `R2_BUCKET_NAME` | Bucket name fallback in adapter factory |
| `R2_PUBLIC_BASE_URL` | CDN origin for public-read objects |

## Queues (operator)

Create each queue (names must match wrangler):

```bash
for q in asset-storage ai-generation flow connector publish webhook retention; do
  wrangler queues create "$q"
done
```

- API producer bindings: see `apps/api/wrangler.jsonc` (`ASSET_STORAGE_QUEUE`, `AI_GENERATION_QUEUE`, …)
- Worker consumers: `apps/workers/wrangler.jsonc` — one consumer per queue, shared dispatcher in `cloudflare-queue-consumer.ts`

Transition: Remix preview enqueue can use BullMQ (`QUEUE_REDIS_URL`) until the API Worker runs with `JOB_EXECUTION_MODE=queue`.

## Deploy commands

```bash
# API Worker (health, jobs, preview, assistant stubs)
pnpm --filter @superapp/api deploy:cf

# Platform queue consumers (all registered job types)
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
| `QUEUE_REDIS_URL` | Redis URL | Optional BullMQ bridge during transition (local Fastify) |
| `R2_BUCKET_NAME` | `superapp-assets` | Adapter fallback when binding present |

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
curl -X POST https://superapp-api.<account>.workers.dev/v1/jobs/enqueue \
  -H 'content-type: application/json' \
  -d '{"jobType":"AI_GENERATE","payload":{"jobId":"x","shopId":"s","intentKey":"k","prompt":"p"}}'
```

## Related specs

- [`specs/018-deployment/spec.md`](../../../../specs/018-deployment/spec.md)
- [`ADR-001-platform-v2-architecture.md`](../ADR-001-platform-v2-architecture.md)
