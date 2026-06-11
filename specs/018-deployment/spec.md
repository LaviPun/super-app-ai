# Feature Specification: Platform V2 Phase 18 — Deployment Infrastructure

**Feature Directory**: `018-deployment`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — Cloudflare Workers API parity + multi-queue consumer shipped; operator provisioning remains

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 18

**Runbook**: [`cloudflare-deployment-runbook.md`](../../docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md)

## Goal

Cloudflare-only deploy topology: Workers (API + queue consumers), Pages (frontend), R2 (assets), Queues (async jobs); env validation; no Kubernetes/Fly/Railway.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped (automated) | Full API Worker routes via shared handlers; CF Queues adapter; all platform queue producers/consumers in wrangler; deployment runbook with operator vs automated matrix |
| Removed | `fly.api.toml`, `railway.*.toml`, `deploy/internal-ai-router/` (Kubernetes), API/worker Dockerfiles for non-CF hosts |
| Operator-only | Create R2 bucket `superapp-assets`; create seven Queues; `wrangler login`; set production secrets/vars; optional CI Cloudflare API token |

## Cloudflare bindings

| Binding | Service | Purpose |
|---------|---------|---------|
| `ASSETS` | R2 | Generated/preview asset storage |
| `ASSET_STORAGE_QUEUE` … `RETENTION_QUEUE` | Queue producers (API) | Publish jobs per `PLATFORM_QUEUES` |
| Queue consumers (×7) | Workers | Dispatch all registered job types |

## Operator checklist

1. `wrangler r2 bucket create superapp-assets`
2. Create queues: `asset-storage`, `ai-generation`, `flow`, `connector`, `publish`, `webhook`, `retention`
3. `pnpm --filter @superapp/api deploy:cf`
4. `pnpm --filter @superapp/workers deploy:cf`
5. Set `JOB_EXECUTION_MODE=queue` on API Worker when ready

## Acceptance (from migration plan)

See Phase 18 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match Cloudflare-only migration plan. ✅ (configs + runbook + API port)
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅
- **SC-004**: No Kubernetes, Fly.io, or Railway artifacts remain in repo. ✅

## Out of scope (next iteration)

- Signed URL proxy for R2 reads
- Automated CI deploy to Cloudflare (manual `deploy:cf` until T010)
- Durable Objects / KV for cross-isolate job status on Workers
