# Platform V2 — Environment Matrix (Phase 18)

Canonical variable lists for staging and production. Secrets belong in Vercel / Railway / Fly dashboards — never commit values.

## Shared infrastructure

| Variable | Frontend | API | Workers | Legacy Remix | Notes |
| -------- | -------- | --- | ------- | ------------ | ----- |
| `DATABASE_URL` | — | required | — | required | Managed Postgres (job ledger + Remix during migration). |
| `QUEUE_REDIS_URL` | — | required (bullmq) | required (bullmq) | optional | Railway Redis or Redis Cloud; prefix must match. |
| `QUEUE_PREFIX` | — | required | required | — | Default `superapp-v2`. |
| `SENTRY_DSN` | optional | optional | optional | optional | Error monitoring. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | optional | optional | optional | Traces/metrics backend. |
| `POSTHOG_API_KEY` | optional | — | — | optional | Product analytics (no PII in events). |

## Frontend (`apps/frontend` → Vercel)

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `NEXT_PUBLIC_API_BASE_URL` | yes | no | Fastify API origin for migration shell fetches. |

## API (`apps/api` → Railway)

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `NODE_ENV` | yes | no | `production` in Railway. |
| `HOST` | yes | no | `0.0.0.0` |
| `PORT` | yes | no | Railway injects `PORT`; default `3001` locally. |
| `API_SERVICE_VERSION` | no | no | `/health` version label. |
| `JOB_EXECUTION_MODE` | yes | no | `queue` in staging/prod. |
| `QUEUE_PROVIDER` | yes | no | `bullmq` in staging/prod. |
| `JOB_STORE_PROVIDER` | yes | no | `repository` when Postgres ledger is enabled. |
| `QUEUE_REDIS_URL` | yes* | yes | *Required when `QUEUE_PROVIDER=bullmq`. |
| `QUEUE_DEFAULT_ATTEMPTS` | no | no | BullMQ retry policy. |
| `QUEUE_DEFAULT_BACKOFF_MS` | no | no | BullMQ backoff. |

Health: `GET /health` (liveness), `GET /ready` (config gate).

## Workers (`apps/workers` → Railway)

| Variable | Required | Secret | Purpose |
| -------- | -------- | ------ | ------- |
| `NODE_ENV` | yes | no | `production` in Railway. |
| `WORKER_HEALTH_HOST` | yes | no | `0.0.0.0` |
| `WORKER_HEALTH_PORT` | yes | no | Railway health check port (default `8080`). |
| `WORKER_SERVICE_VERSION` | no | no | `/health` version label. |
| `QUEUE_PROVIDER` | yes | no | `bullmq` in staging/prod. |
| `QUEUE_REDIS_URL` | yes* | yes | Shared with API. |
| `WORKER_CONCURRENCY` | yes | no | Per-queue concurrency. |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | no | no | Graceful drain window. |

Health: `GET /health` (liveness), `GET /ready` (runtime started).

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
| `R2_ACCESS_KEY_ID` | yes | yes | S3-compatible key. |
| `R2_SECRET_ACCESS_KEY` | yes | yes | S3-compatible secret. |
| `R2_BUCKET` | yes | no | Artifact bucket. |
| `R2_PUBLIC_BASE_URL` | no | no | CDN origin when serving public assets. |

## Local smoke

```bash
# Terminal A
pnpm --filter @superapp/api dev

# Terminal B
pnpm --filter @superapp/workers dev

# Terminal C
pnpm deploy:smoke-health
```

Override origins with `API_BASE_URL` / `WORKER_BASE_URL` when ports differ.
