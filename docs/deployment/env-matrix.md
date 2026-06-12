# Platform V2 — Environment Matrix (Phase 18)

Canonical variable lists for staging and production. Secrets belong in host dashboards (Cloudflare, Vercel, Railway) — never commit values.

**Hosting policy:** [ADR-002](../gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md) — Cloudflare primary for V2 platform; Fastify/Railway alternate when `PLATFORM_BACKEND=fastify`; internal AI router separate on Railway/Docker/Modal.

## Choose a mode: `PLATFORM_BACKEND`

Set on API and worker services (and mirror in Worker `wrangler` vars for Cloudflare):

| `PLATFORM_BACKEND` | Effect |
| --- | --- |
| `cloudflare` *(recommended)* | CF Worker serves `/v1`; Fastify `/v1` gated; CF Queues + R2 bindings; `JOB_EXECUTION_MODE` defaults to `queue`. |
| `fastify` | Fastify serves `/v1` on Railway/Docker; BullMQ + Redis; `JOB_EXECUTION_MODE` defaults to `queue`. |
| *(unset)* | Legacy: Remix inline jobs; Fastify gated. |

Explicit `FASTIFY_API_ENABLED` / `JOB_EXECUTION_MODE` override presets. Parser: `packages/platform-contracts/src/rollout-cutover.ts`.

Full rollout flags: [`specs/021-rollout-cutover/spec.md`](../../specs/021-rollout-cutover/spec.md).

---

## Cloudflare mode (`PLATFORM_BACKEND=cloudflare`)

Deploy API via `pnpm --filter @superapp/api deploy:cf` and workers via `pnpm --filter @superapp/workers deploy:cf`. See [cloudflare-deployment-runbook.md](../gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md).

| Surface | Host | Key bindings / vars |
|---------|------|---------------------|
| API Worker | Cloudflare Workers | `ASSETS` (R2), queue producer bindings, `JOB_STATUS_KV`, `PLATFORM_BACKEND=cloudflare`, `JOB_EXECUTION_MODE=queue` |
| Worker consumer | Cloudflare Workers | Queue consumers ×7, R2 `ASSETS` |
| Frontend | Cloudflare Pages | `NEXT_PUBLIC_API_BASE_URL` → Worker `/v1` origin |
| Queues | Cloudflare Queues | `asset-storage`, `ai-generation`, `flow`, `connector`, `publish`, `webhook`, `retention` |
| Object storage | R2 | `R2_BUCKET` / binding `ASSETS` |

**Not required in CF mode:** `QUEUE_REDIS_URL` for platform queue path (Redis only if hybrid BullMQ paths remain enabled).

---

## Fastify / Railway mode (`PLATFORM_BACKEND=fastify`)

Use when operating the alternate backend on Railway or Docker. Sections below labeled **Fastify path** apply.

| Surface | Host | Notes |
|---------|------|-------|
| API | Railway / Docker | `apps/api` — BullMQ enqueue, Postgres job ledger optional |
| Workers | Railway / Docker | `apps/workers` — BullMQ consumers |
| Redis | Railway Redis / Redis Cloud | Shared `QUEUE_REDIS_URL` with API |
| Frontend | Vercel or Pages | `NEXT_PUBLIC_API_BASE_URL` → Fastify origin |

---

## Shared infrastructure

| Variable | Frontend | API | Workers | Internal router | Legacy Remix | Notes |
| -------- | -------- | --- | ------- | --------------- | ------------ | ----- |
| `DATABASE_URL` | — | required (Fastify path) | — | — | required | Managed Postgres (job ledger + Remix during migration). |
| `QUEUE_REDIS_URL` | — | required (Fastify path) | required (Fastify path) | — | optional | Not used for CF Queues primary path. |
| `QUEUE_PREFIX` | — | Fastify path | Fastify path | — | — | Default `superapp-v2`. |
| `PLATFORM_BACKEND` | — | yes | yes | — | optional | See top of doc. |
| `SENTRY_DSN` | optional | optional | optional | optional | optional | Error monitoring. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | optional | optional | optional | optional | Traces/metrics backend. |
| `POSTHOG_API_KEY` | optional | — | — | — | optional | Product analytics (no PII in events). |

## Frontend (`apps/frontend` → Cloudflare Pages or Vercel)

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `NEXT_PUBLIC_API_BASE_URL` | yes | no | API origin (`/v1` Worker or Fastify). |

## API — Fastify path (`apps/api` → Railway / Docker)

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `NODE_ENV` | yes | no | `production` in Railway. |
| `HOST` | yes | no | `0.0.0.0` |
| `PORT` | yes | no | Railway injects `PORT`; default `3001` locally. |
| `API_SERVICE_VERSION` | no | no | `/health` version label. |
| `PLATFORM_BACKEND` | yes | no | Set `fastify` for this section. |
| `JOB_EXECUTION_MODE` | yes | no | `queue` in staging/prod. |
| `QUEUE_PROVIDER` | yes | no | `bullmq` in staging/prod. |
| `JOB_STORE_PROVIDER` | yes | no | `repository` when Postgres ledger is enabled. |
| `QUEUE_REDIS_URL` | yes* | yes | *Required when `QUEUE_PROVIDER=bullmq`. |
| `QUEUE_DEFAULT_ATTEMPTS` | no | no | BullMQ retry policy. |
| `QUEUE_DEFAULT_BACKOFF_MS` | no | no | BullMQ backoff. |

Health: `GET /health` (liveness), `GET /ready` (config gate).

## Workers — Fastify path (`apps/workers` → Railway / Docker)

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `NODE_ENV` | yes | no | `production` in Railway. |
| `WORKER_HEALTH_HOST` | yes | no | `0.0.0.0` |
| `WORKER_HEALTH_PORT` | yes | no | Railway health check port (default `8080`). |
| `WORKER_SERVICE_VERSION` | no | no | `/health` version label. |
| `PLATFORM_BACKEND` | yes | no | Set `fastify` for this section. |
| `QUEUE_PROVIDER` | yes | no | `bullmq` in staging/prod. |
| `QUEUE_REDIS_URL` | yes* | yes | Shared with API. |
| `WORKER_CONCURRENCY` | yes | no | Per-queue concurrency. |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | no | no | Graceful drain window. |

Health: `GET /health` (liveness), `GET /ready` (runtime started).

## Internal AI router (`apps/web` router image → Railway) — separate from V2 platform

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `ROUTER_HOST` | yes | no | `0.0.0.0` |
| `ROUTER_PORT` | no | no | Optional; listens on Railway `PORT` when unset, else `8787` locally |
| `ROUTER_BACKEND` | yes | no | `ollama` or `openai` |
| `ROUTER_OLLAMA_BASE_URL` | yes | no | Ollama/vLLM origin for `/route` + passthrough |
| `ROUTER_OLLAMA_MODEL` | yes | no | e.g. `qwen3:4b-instruct` |
| `INTERNAL_AI_ROUTER_TOKEN` | yes | yes | Bearer auth on `/route` and passthrough |
| `ROUTER_OPENAI_BASE_URL` | no | no | OpenAI-compatible backend when `ROUTER_BACKEND=openai` |
| `ROUTER_OPENAI_API_KEY` | no | yes | Key for OpenAI-compatible backend |

Health: `GET /healthz`. Operator runbook: [`deploy/railway-internal-router/README.md`](../../deploy/railway-internal-router/README.md).

Remix consumes the router via `INTERNAL_AI_ROUTER_URL` + `INTERNAL_AI_ROUTER_TOKEN` (set on the Remix host, not on the router service).

## AI / GPU (RunPod — separate service)

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `RUNPOD_API_KEY` | yes | yes | Inference API auth. |
| `RUNPOD_ENDPOINT_ID` | yes | yes | Target endpoint. |

Routed from Remix/router during migration; workers call through bounded adapters in later phases.

## Object storage (Cloudflare R2)

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `R2_ACCOUNT_ID` | yes | no | Account id. |
| `R2_ACCESS_KEY_ID` | yes | yes | S3-compatible key (Fastify/local). |
| `R2_SECRET_ACCESS_KEY` | yes | yes | S3-compatible secret. |
| `R2_BUCKET` | yes | no | Artifact bucket. |
| `R2_PUBLIC_BASE_URL` | no | no | CDN origin when serving public assets. |

Workers use binding `ASSETS` on Cloudflare; S3-compatible vars for Fastify/local adapters.

## Local smoke

Use **Node 24.x** (`nvm use` at repo root). Node **20.20+** is also supported. Requires `@shopify/shopify-app-remix` **3.8.5+** for Remix/Vite dev SSR on Node 22+.

```bash
# Terminal A
pnpm --filter @superapp/api dev

# Terminal B
pnpm --filter @superapp/workers dev

# Terminal C
pnpm deploy:smoke-health
```

Override origins with `API_BASE_URL` / `WORKER_BASE_URL` when ports differ.
