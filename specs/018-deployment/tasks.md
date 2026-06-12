# Tasks: Phase 18 — Deployment Infrastructure

**Input**: [spec.md](./spec.md), [ADR-002](../../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md), [cloudflare-deployment-runbook.md](../../docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md)

**Status on master**: Shipped — Cloudflare configs + guarded deploy workflow shipped; scoped hosting policy ratified (ADR-002). Only one-time operator `wrangler login` + secrets remain (out of repo scope).

## Phase checklist

- [x] T001 Review Phase 18 acceptance criteria in migration plan
- [x] T002 Remove Kubernetes manifests (`deploy/internal-ai-router/`)
- [x] T003 Resolve V2 deploy-target policy — **decision: retain** Fastify-alternate + internal-router Railway/Docker configs per ADR-002; remove only V2-platform K8s/Fly (done in T002). No further deletion required; SC-004 restated to match.
- [x] T004 Add `wrangler.jsonc` for `apps/api`, `apps/workers`, `apps/frontend`
- [x] T005 Add Cloudflare Worker + Queue consumer entry points
- [x] T006 Write Cloudflare deployment runbook
- [x] T007 Update ADR + master spec matrix to scoped hosting policy — ADR-002 added 2026-06-12; ADR-001 hosting table marked superseded; master/018 matrices aligned
- [x] T008 Provision R2 + Queues + KV via `scripts/cloudflare-setup.sh` (automated after operator `wrangler login`)
- [x] T009 Port full Fastify API routes to Workers
- [x] T009a Job status persistence on Workers via `JOB_STATUS_KV` binding (7-day TTL)
- [x] T010 Add CI deploy workflow for Cloudflare — `.github/workflows/v2-cloudflare-deploy.yml` (manual-dispatch, secrets-gated; no-ops without `CLOUDFLARE_API_TOKEN`)

**Operator-only:** `wrangler login` (one-time per machine) and setting `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` repo secrets to enable the deploy workflow. All resource creation is scripted; paste KV namespace IDs from `wrangler kv namespace list` into `apps/api/wrangler.jsonc` after first run.

## Verification

- [x] T011 `pnpm test` for affected packages
- [x] T012 Typecheck affected packages
- [x] T013 Policy-aligned deploy artifact audit — confirmed no **V2-platform** Kubernetes/Fly deploy configs remain; scoped Railway/Docker (Fastify alternate + internal router) documented in ADR-002 (criterion is "scoped exceptions only", not "zero Railway")
- [x] T014 Publish ADR-002 link from master spec, env-matrix, Phase 21 research, and spec-kit status report
