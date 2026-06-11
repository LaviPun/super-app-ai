# Feature Specification: Platform V2 Phase 18 — Deployment Infrastructure

**Feature Directory**: `018-deployment`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — Cloudflare wrangler configs + runbook shipped on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 18

**Runbook**: [`cloudflare-deployment-runbook.md`](../../docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md)

## Goal

Cloudflare-only deploy topology: Workers (API + queue consumers), Pages (frontend), R2 (assets), Queues (async jobs); env validation; no Kubernetes/Fly/Railway.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Shipped | `apps/api/wrangler.jsonc`, `apps/workers/wrangler.jsonc`, `apps/frontend/wrangler.jsonc`, Cloudflare Worker/Queue entry points, deployment runbook |
| Removed | `fly.api.toml`, `railway.*.toml`, `deploy/internal-ai-router/` (Kubernetes), API/worker Dockerfiles for non-CF hosts |
| Pending | Operator provisioning of R2 bucket + Queues in Cloudflare account; full API route port to Workers; Pages OpenNext build pipeline |

## Cloudflare bindings

| Binding | Service | Purpose |
|---------|---------|---------|
| `ASSETS` | R2 | Generated/preview asset storage |
| `ASSET_STORAGE_QUEUE` | Queue producer | API publishes `asset-storage` jobs |
| `asset-storage` queue consumer | Workers | Image worker handler |

## Acceptance (from migration plan)

See Phase 18 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: Phase deliverables match Cloudflare-only migration plan. ✅ (configs + runbook)
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅
- **SC-004**: No Kubernetes, Fly.io, or Railway artifacts remain in repo. ✅

## Out of scope (next iteration)

- Full Fastify surface on Workers (preview + enqueue parity without Node process)
- Signed URL proxy for R2 reads
- Automated CI deploy to Cloudflare (manual `deploy:cf` scripts ship first)
