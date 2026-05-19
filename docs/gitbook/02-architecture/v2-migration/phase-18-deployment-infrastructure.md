# Platform V2 — Phase 18 Deployment Infrastructure

**Status:** Local/testable deployment scaffolding complete  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 18

## Target topology

| Workload | Platform | Health |
| -------- | -------- | ------ |
| `apps/frontend` | Vercel | Next build + `NEXT_PUBLIC_API_BASE_URL` probe via home page |
| `apps/api` | Railway (Docker) | `GET /health`, `GET /ready` |
| `apps/workers` | Railway (Docker) | `GET /health`, `GET /ready` on `WORKER_HEALTH_PORT` |
| `apps/web` (legacy) | Fly / existing | Unchanged during migration |
| Redis | Railway Redis or Redis Cloud | Shared queue transport |
| Postgres | Managed | Job ledger + Remix |
| R2 / RunPod / observability | Per provider | Documented in env matrix |

## Artifacts

| Path | Purpose |
| ---- | ------- |
| `apps/frontend/vercel.json` | Vercel monorepo install/build commands |
| `apps/api/Dockerfile`, `apps/api/railway.toml` | API container + Railway health check |
| `apps/workers/Dockerfile`, `apps/workers/railway.toml` | Worker container + health server |
| `docs/deployment/env-matrix.md` | Environment variable matrices |
| `scripts/deployment/deployment-manifest.ts` | Machine-readable manifest for validation |
| `scripts/deployment/validate-config.ts` | CI/local config gate |
| `scripts/deployment/smoke-health.ts` | Post-deploy smoke for API + workers |
| `.github/workflows/v2-*-build.yml` | Per-service build + test stubs |

## Verification

```bash
pnpm install
pnpm deploy:validate
pnpm --filter @superapp/platform-contracts build
pnpm --filter @superapp/api test
pnpm --filter @superapp/workers test
pnpm test:deployment
```

With API and workers running locally:

```bash
pnpm deploy:smoke-health
```

## Rollback

- **Vercel:** promote previous deployment in project → Deployments.
- **Railway:** redeploy prior image from service → Deployments; verify `/health` and queue drain.
- **Flags:** keep `FASTIFY_API_ENABLED` / `FRONTEND_NEXT_ENABLED` off to fall back to Remix-only surfaces.

See [`docs/release-operations.md`](../../../release-operations.md) for release safety controls during cutover.
