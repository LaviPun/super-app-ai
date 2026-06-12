# Platform hosting integration guide

Where each Platform V2 surface runs, which config files to use, and how they connect during the Remix → Next/Fastify migration.

> **Hosting policy ([ADR-002](../gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md)):** Cloudflare is the **primary** V2 platform target (Workers, Pages, R2, Queues). The Railway/Docker topology below is the **optional `PLATFORM_BACKEND=fastify` alternate** plus the internal AI router — retained by policy, not the default. For the recommended Cloudflare path see [`env-matrix.md`](../deployment/env-matrix.md) and the [Cloudflare runbook](../gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md).

## Topology

The **Primary (CF)** column is the recommended target; the **Alternate** column is the Fastify/Railway path used only when `PLATFORM_BACKEND=fastify`.

| Surface | Primary (CF) | Alternate (Fastify/Railway) | Repo path | Alternate config |
| ------- | --- | ---- | --------- | -------------- |
| Next.js merchant + internal shell | **Cloudflare Pages** | Vercel | `apps/frontend` | [`apps/frontend/vercel.json`](../../apps/frontend/vercel.json), [`apps/frontend/.env.example`](../../apps/frontend/.env.example) |
| API gateway | **Cloudflare Workers** | Fastify on Railway (Docker) | `apps/api` | [`apps/api/Dockerfile`](../../apps/api/Dockerfile), [`apps/api/railway.toml`](../../apps/api/railway.toml), [`apps/api/.env.example`](../../apps/api/.env.example) |
| Async workers | **Cloudflare Queues consumers** | BullMQ on Railway (Docker) | `apps/workers` | [`apps/workers/Dockerfile`](../../apps/workers/Dockerfile), [`apps/workers/railway.toml`](../../apps/workers/railway.toml), [`apps/workers/.env.example`](../../apps/workers/.env.example) |
| Internal AI router (Qwen3 `/route`) | **Railway** (Docker) | `apps/web` router image | [`apps/web/Dockerfile.internal-router`](../../apps/web/Dockerfile.internal-router), [`apps/web/railway.internal-router.toml`](../../apps/web/railway.internal-router.toml), [`deploy/railway-internal-router/README.md`](../../deploy/railway-internal-router/README.md) |
| Legacy embedded Remix app | Existing host (Fly / Railway / custom) | `apps/web` | [`apps/web/.env.example`](../../apps/web/.env.example) |
| Queue / cache | **Railway Redis** or Redis Cloud | — | `QUEUE_REDIS_URL` in env matrix |
| Job ledger DB | Managed **Postgres** (when cut over) | `packages/db` | [`packages/db/.env.example`](../../packages/db/.env.example), [`packages/db/migrations/`](../../packages/db/migrations/) |
| GPU inference | **RunPod** (external) | adapters in workers/API | See [AI / GPU](#runpod-gpu-inference) |
| Object storage | **Cloudflare R2** | worker adapters | [`docs/deployment/env-matrix.md`](../deployment/env-matrix.md) |

**Runway:** not integrated in this repo. Video or generative-media workflows use provider APIs and RunPod-bound adapters where configured; there is no Runway SDK or env block today.

Rollout flags (`FASTIFY_API_ENABLED`, `FRONTEND_NEXT_ENABLED`, worker toggles) default **off** — see [`packages/platform-contracts/src/rollout-cutover.ts`](../../packages/platform-contracts/src/rollout-cutover.ts) and [`docs/release-operations.md`](../release-operations.md).

---

## Vercel — `apps/frontend`

### What it does

Next.js App Router shell for the merchant embedded experience and internal admin migration pages. Calls the Fastify API via `NEXT_PUBLIC_API_BASE_URL`.

### Setup

1. Create a Vercel project linked to this monorepo.
2. Set **Root Directory** to `apps/frontend` *or* keep repo root and rely on [`vercel.json`](../../apps/frontend/vercel.json) install/build commands (they `cd ../..` and use pnpm filters).
3. Configure env vars from [`apps/frontend/.env.example`](../../apps/frontend/.env.example):

   | Variable | Required | Notes |
   | -------- | -------- | ----- |
   | `NEXT_PUBLIC_API_BASE_URL` | yes | Staging/prod Fastify origin (no trailing slash) |

4. Preview deployments: same vars with staging API URL; verify home-page API probe in build logs.

### CI

[`.github/workflows/v2-frontend-build.yml`](../../.github/workflows/v2-frontend-build.yml) — build gate on PRs.

### Local dev

```bash
pnpm --filter @superapp/frontend dev   # default port 3000
```

Merchant Remix dev also uses port 3000 — run one at a time or override `PORT` / Next dev port per team runbook.

---

## Railway — API (`apps/api`)

### What it does

Fastify gateway: job enqueue, webhooks, connector boundaries, health/readiness, rollout gating when `FASTIFY_API_ENABLED=false`.

### Setup

1. New Railway service → **Root Directory**: repository root.
2. Point builder to [`apps/api/Dockerfile`](../../apps/api/Dockerfile) (see [`railway.toml`](../../apps/api/railway.toml)).
3. Health check: `GET /health` (liveness), `GET /ready` (config).
4. Env from [`apps/api/.env.example`](../../apps/api/.env.example) and [`docs/deployment/env-matrix.md`](../deployment/env-matrix.md):

   | Variable | Purpose |
   | -------- | ------- |
   | `HOST` | `0.0.0.0` |
   | `PORT` | Injected by Railway |
   | `QUEUE_REDIS_URL` | Shared with workers |
   | `QUEUE_PREFIX` | Must match workers (default `superapp-v2`) |
   | `JOB_EXECUTION_MODE` | `queue` in staging/prod |
   | `JOB_STORE_PROVIDER` | `repository` when Postgres/SQLite ledger enabled |
   | `SHOPIFY_API_SECRET` | Webhook HMAC when ingress is live |

5. Add Redis plugin or external Redis URL to the same Railway project.

### CI

[`.github/workflows/v2-api-build.yml`](../../.github/workflows/v2-api-build.yml)

### Local

```bash
pnpm --filter @superapp/api dev
pnpm deploy:smoke-health   # after API + workers are up
```

---

## Railway — Workers (`apps/workers`)

### What it does

BullMQ consumers: AI generation, webhooks, flows, connectors, publish (when respective `*_WORKER_ENABLED` flags are on).

### Setup

1. Separate Railway service (scale independently from API).
2. Dockerfile: [`apps/workers/Dockerfile`](../../apps/workers/Dockerfile), config: [`railway.toml`](../../apps/workers/railway.toml).
3. Health: `WORKER_HEALTH_PORT` (default `8080`) — `GET /health`, `GET /ready`.
4. Env: [`apps/workers/.env.example`](../../apps/workers/.env.example) — same `QUEUE_REDIS_URL` and `QUEUE_PREFIX` as API.

### CI

[`.github/workflows/v2-workers-build.yml`](../../.github/workflows/v2-workers-build.yml)

### Local

```bash
pnpm --filter @superapp/workers dev
```

---

## Railway — Internal AI router (`apps/web` router image)

### What it does

Small Node HTTP service for **prompt routing** (`POST /route`) and optional Ollama/OpenAI-compatible passthrough. Remix and the optional Modal proxy call this service — it does **not** run GPU inference itself; point `ROUTER_OLLAMA_BASE_URL` / `ROUTER_OPENAI_BASE_URL` at your inference host.

### Setup

1. New Railway service in the same project as API/workers → **Root Directory**: repository root.
2. Builder: [`apps/web/railway.internal-router.toml`](../../apps/web/railway.internal-router.toml) → [`apps/web/Dockerfile.internal-router`](../../apps/web/Dockerfile.internal-router).
3. Health check: `GET /healthz` (configured in the TOML).
4. Env from [`deploy/railway-internal-router/env.example`](../../deploy/railway-internal-router/env.example) — set `INTERNAL_AI_ROUTER_TOKEN` and `ROUTER_*` in the dashboard (never commit secrets).
5. Railway injects `PORT`; leave `ROUTER_PORT` unset unless you need a fixed local port. The router binds to `PORT` automatically.
6. Wire Remix: `INTERNAL_AI_ROUTER_URL` + matching `INTERNAL_AI_ROUTER_TOKEN` on the Remix host.

Optional Modal HTTPS edge: [`deploy/modal-qwen-router/README.md`](../../deploy/modal-qwen-router/README.md) with `INTERNAL_ROUTER_UPSTREAM_URL` pointing at this Railway URL.

Operator runbook: [`deploy/railway-internal-router/README.md`](../../deploy/railway-internal-router/README.md).

---

## RunPod — GPU inference

RunPod is an **external** inference endpoint, not hosted in this repo.

| Variable | Where | Purpose |
| -------- | ----- | ------- |
| `RUNPOD_API_KEY` | API / workers (when wired) | Auth |
| `RUNPOD_ENDPOINT_ID` | API / workers | Target endpoint |

Documented in [`docs/deployment/env-matrix.md`](../deployment/env-matrix.md). Local/test fallback: `StubAiGenerationAdapter` when credentials are absent ([`phase-7-ai-generation-worker.md`](../gitbook/02-architecture/v2-migration/phase-7-ai-generation-worker.md)).

Remix internal AI routing may use Modal or local Ollama (`INTERNAL_AI_*` env in `apps/web`) — separate from merchant RunPod paths.

---

## Legacy Remix — `apps/web`

Until cutover flags flip, **merchant OAuth and embedded admin remain on Remix**.

- Deploy per existing host (Fly.io or Railway for the main Remix app). The **internal AI router** uses [`apps/web/Dockerfile.internal-router`](../../apps/web/Dockerfile.internal-router) as a **separate** Railway service — see [Railway — Internal AI router](#railway--internal-ai-router-appsweb-router-image) above.
- Shopify CLI: `pnpm shopify:dev` from repo root.
- Operator gate: [`docs/qa/merchant-oauth-checklist.md`](../qa/merchant-oauth-checklist.md).

---

## Environment matrix and release ops

- Full variable matrix: [`docs/deployment/env-matrix.md`](../deployment/env-matrix.md)
- Release / rollback: [`docs/release-operations.md`](../release-operations.md)
- Phase 18 deploy detail: [`docs/gitbook/02-architecture/v2-migration/phase-18-deployment-infrastructure.md`](../gitbook/02-architecture/v2-migration/phase-18-deployment-infrastructure.md)
- Postgres job ledger migration: [`docs/gitbook/02-architecture/v2-migration/phase-15-data-layer-productionization.md`](../gitbook/02-architecture/v2-migration/phase-15-data-layer-productionization.md)

## Pre-promote checklist

```bash
pnpm deploy:validate
pnpm --filter @superapp/api test
pnpm --filter @superapp/workers test
pnpm test:v2:fast
pnpm test:deployment
```

Do **not** enable production cutover flags until staging sign-off ([`phase-21-rollout-cutover.md`](../gitbook/02-architecture/v2-migration/phase-21-rollout-cutover.md)).
