# Feature Specification: Platform V2 Phase 18 — Deployment Infrastructure

**Feature Directory**: `018-deployment`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Shipped** — Cloudflare Workers API parity + multi-queue consumer shipped; scoped hosting policy ratified (ADR-002); guarded CI deploy workflow added. Operator provisioning (one-time `wrangler login` + secrets) is the only remaining manual step and is documented in the runbook.

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Hosting policy**: [`ADR-002`](../../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 18

**Runbook**: [`cloudflare-deployment-runbook.md`](../../docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md)

## Goal

Deploy V2 platform on Cloudflare (Workers API + queue consumers, Pages frontend, R2 assets, Queues async jobs) as the **recommended primary** path. Support optional Fastify/BullMQ on Railway/Docker via `PLATFORM_BACKEND=fastify`. Env validation; no Kubernetes for new V2 work.

## Scoped hosting policy

| Surface | Primary | In-repo alternate |
|---------|---------|-------------------|
| V2 API + workers | Cloudflare Workers (`PLATFORM_BACKEND=cloudflare`) | Fastify + BullMQ (`PLATFORM_BACKEND=fastify`) |
| Assets + platform queues | R2 + CF Queues | BullMQ/Redis (Fastify path) |
| Internal AI router | Railway/Docker/Modal (not V2 API) | `deploy/railway-internal-router/` |

Removed from V2 scope: Kubernetes manifests for platform API (`deploy/internal-ai-router/` k8s path). Fly.io platform deploy configs removed where they targeted V2 API/workers only.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped (automated) | Full API Worker routes via shared handlers; CF Queues adapter; all platform queue producers/consumers in wrangler; deployment runbook with operator vs automated matrix |
| Removed (V2 k8s) | `deploy/internal-ai-router/` Kubernetes manifests |
| Retained (scoped) | Railway/Docker configs for Fastify alternate backend and internal AI router — see ADR-002 |
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
5. Set `PLATFORM_BACKEND=cloudflare` and `JOB_EXECUTION_MODE=queue` on API Worker when ready

## Acceptance (from migration plan)

See Phase 18 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match scoped Cloudflare-primary migration plan. ✅ (configs + runbook + API port)
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅
- **SC-004**: V2 platform targets Cloudflare (Workers, Pages, R2, Queues); no Kubernetes for new V2 work. Railway/Docker artifacts are scoped to the optional Fastify alternate backend (`PLATFORM_BACKEND=fastify`) and the internal AI router, governed by [ADR-002](../../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md). ✅ (restated to match scoped policy; the prior "zero Railway artifacts" claim is retracted — those files are intentional, not residue)

## Out of scope (next iteration)

- Signed URL proxy for R2 reads
- Retire Fastify alternate backend (operator decision via Phase 21)
