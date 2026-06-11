# Tasks: Phase 18 — Deployment Infrastructure

**Input**: [spec.md](./spec.md), [cloudflare-deployment-runbook.md](../../docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md)

**Status on master**: Partial — Cloudflare configs shipped

## Phase checklist

- [x] T001 Review Phase 18 acceptance criteria in migration plan
- [x] T002 Remove Kubernetes manifests (`deploy/internal-ai-router/`)
- [x] T003 Remove Fly.io and Railway deploy configs
- [x] T004 Add `wrangler.jsonc` for `apps/api`, `apps/workers`, `apps/frontend`
- [x] T005 Add Cloudflare Worker + Queue consumer entry points
- [x] T006 Write Cloudflare deployment runbook
- [x] T007 Update ADR + master spec matrix to Cloudflare-only
- [x] T008 Provision R2 + Queues + KV via `scripts/cloudflare-setup.sh` (automated after operator `wrangler login`)
- [x] T009 Port full Fastify API routes to Workers
- [x] T009a Job status persistence on Workers via `JOB_STATUS_KV` binding (7-day TTL)
- [ ] T010 Add CI deploy workflow for Cloudflare (operator optional until CI secrets configured)

**Operator-only:** `wrangler login` (one-time per machine). All resource creation is scripted; paste KV namespace IDs from `wrangler kv namespace list` into `apps/api/wrangler.jsonc` after first run.

## Verification

- [x] T011 `pnpm test` for affected packages
- [x] T012 Typecheck affected packages
- [x] T013 Grep confirms no `kubernetes`/`k8s`/`kubectl`/`helm`/`fly.io`/`railway` deploy artifacts
