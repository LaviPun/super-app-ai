# Implementation Plan: Phase 18 — Deployment Infrastructure

**Branch**: `master` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

## Summary

Cloudflare-only deployment: Workers for API and queue consumers, Pages for Next.js preview shell, R2 for assets, Queues for async jobs. Local dev retains Fastify + BullMQ + Redis.

## Technical context

- **Canonical architecture**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)
- **ADR**: [`ADR-001-platform-v2-architecture.md`](../../docs/gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md)
- **Runbook**: [`cloudflare-deployment-runbook.md`](../../docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md)

## File layout (shipped)

| Path | Role |
|------|------|
| `apps/api/wrangler.jsonc` | API Worker + R2 + Queue producer bindings |
| `apps/api/src/cloudflare-worker.ts` | Workers fetch handler (`/health`, `/ready`, `/v1/jobs/mode`) |
| `apps/workers/wrangler.jsonc` | Queue consumer Worker + R2 binding |
| `apps/workers/src/cloudflare-queue-consumer.ts` | `asset-storage` queue handler |
| `apps/frontend/wrangler.jsonc` | Pages deploy config |

## Deploy sequence

1. Create R2 bucket `superapp-assets` and queue `asset-storage` in Cloudflare.
2. `pnpm --filter @superapp/api deploy:cf`
3. `pnpm --filter @superapp/workers deploy:cf`
4. Build and `pnpm --filter @superapp/frontend deploy:cf`

## Constitution check

Align with [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md): Zod at boundaries, SOLID services, no merchant code deployment, Cloudflare-only cloud infra.

## Remaining work

- Port full `/v1/jobs/enqueue` and preview routes to Workers (or use Containers if Node parity required)
- Wire API queue producer to `JobOrchestrator` when `JOB_EXECUTION_MODE=queue` on CF
- CI job for `wrangler deploy` with account secrets
