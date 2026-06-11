# Feature Specification: Platform V2 — Master Index

**Feature Directory**: `000-platform-v2-master`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: Active — core V2 async path implemented on `master`

**Canonical plan**: [`docs/gitbook/02-architecture/platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**ADR**: [`docs/gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md`](../../docs/gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md)

**Deploy runbook**: [`docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md`](../../docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md)

## Purpose

Single index for the **Platform V2** migration (Next.js + Fastify/Workers API + BullMQ/Queues workers + Redis transition + Postgres + R2). This is separate from legacy SuperApp phases 0–8 in [`docs/phase-plan.md`](../../docs/phase-plan.md), which shipped inside the Remix monolith.

**Cloud policy:** Cloudflare only for V2 cloud infra (Workers, Pages, R2, Queues). No Kubernetes, Fly.io, or Railway.

## Completion statement (2026-06-12)

| Scope | Status |
|-------|--------|
| **Legacy SuperApp phases 0–8** | Shipped in Remix — Phase 2 compile/publish adapter wiring remains open (legacy backlog). |
| **Platform V2 job orchestration (Phase 5)** | **Shipped** — `@superapp/job-orchestration` with inline/queue/disabled modes, BullMQ adapter, tests. |
| **Platform V2 Fastify API (Phase 3)** | **Shipped (skeleton)** — `@superapp/api` health + job enqueue + preview routes; Cloudflare Worker entry for deploy. |
| **Platform V2 workers (Phases 6–12)** | **Shipped (core + scaffolds)** — BullMQ runtime, image worker, scaffold handlers, CF Queues consumer entry. |
| **Platform V2 preview enqueue (Phase 12)** | **Shipped** — `schedulePreviewExport()` uses JobOrchestrator; inline processing live; queue mode when Redis configured. |
| **Platform V2 preview sandbox (Phase 13)** | **Shipped** — envelope contracts, Fastify preview API, Next.js sandbox shell. |
| **Platform V2 deployment (Phase 18)** | **Partial** — wrangler configs + runbook; prod R2/Queues binding pending operator setup. |
| **Platform V2 Phases 4, 14–17, 19–21** | Partial or not started — Polaris shell, intent graph, Postgres cutover, cutover flags. |

## Phase coverage matrix

| V2 Phase | Name | Spec dir | `master` status | Notes |
|----------|------|----------|-----------------|-------|
| 0 | Baseline & inventory | *(master only)* | Partial | ADR + migration plan in repo |
| 1 | Target monorepo shape | `001-target-monorepo` | Partial | `apps/web`, `apps/workers`, `apps/api`, `apps/frontend`, `packages/*` |
| 2 | Shared contracts | `002-shared-contracts` | **Shipped (core)** | Image/storage + platform job registry + WorkerEvent schema |
| 3 | Fastify API skeleton | `003-fastify-api` | **Shipped (skeleton)** | Health, readiness, `/v1/jobs/enqueue`, preview routes; CF Worker entry |
| 4 | Next.js frontend skeleton | `004-next-frontend` | **Partial** | App Router scaffold + preview sandbox page; Polaris/Shopify shell pending |
| 5 | Job orchestration & BullMQ | `005-job-orchestration` | **Shipped** | `@superapp/job-orchestration` |
| 6 | Worker app skeleton | `006-worker-skeleton` | **Shipped** | Bootstrap + BullMQ runtime + graceful shutdown |
| 7 | AI generation worker | `007-ai-generation-worker` | Partial | Scaffold handler on `ai-generation` queue |
| 8 | Internal assistant migration | `008-internal-assistant` | Not started | Internal AI remains in Remix |
| 9 | Webhook & flow workers | `009-webhook-flow` | Partial | Scaffold handlers on `flow` + `webhook` queues |
| 10 | Connector worker | `010-connector-worker` | Partial | Scaffold handler on `connector` queue |
| 11 | Publish worker | `011-publish-worker` | Partial | Scaffold handler on `publish` queue |
| 12 | Storage & image worker | `012-storage-image-worker` | **Shipped** | Full handler + inline/queue enqueue |
| 13 | Preview sandbox | `013-preview-sandbox` | **Shipped** | Envelope contracts, Fastify preview API, Next.js sandbox shell |
| 14 | Intent graph & Recipe DSL | `014-intent-graph` | Not started | WIP specs only |
| 15 | Data layer productionization | `015-data-layer` | Not started | Postgres cutover pending |
| 16 | Observability & analytics | `016-observability` | Partial | Worker events schema; cross-service OTel pending |
| 17 | Security & compliance | `017-security-compliance` | Not started | App Store gate pending |
| 18 | Deployment infrastructure | `018-deployment` | **Partial** | Cloudflare wrangler + runbook; prod bindings pending |
| 19 | Async UX | `019-async-ux` | Partial | Job orchestration enables async; merchant UI pending |
| 20 | Testing matrix | `020-testing-matrix` | Partial | Package tests green; cross-service matrix pending |
| 21 | Rollout & cutover | `021-rollout-cutover` | Not started | Feature flags + Remix retirement |

## Environment variables (job stack)

| Variable | Purpose |
|----------|---------|
| `JOB_EXECUTION_MODE` | `inline` (default), `queue`, or `disabled` |
| `QUEUE_REDIS_URL` / `REDIS_URL` | Redis for BullMQ when mode is `queue` |
| `QUEUE_PREFIX` | BullMQ key prefix (default `superapp`) |
| `PREVIEW_EXPORT_QUEUE_ENABLED` | Set `1` to enable preview export enqueue from Remix |
| `R2_BUCKET_NAME` | R2 bucket for asset adapter (binding `ASSETS` on Workers) |

## Success criteria (master)

- **SC-M1**: Every V2 phase 1–21 has a `specs/0NN-*` directory with `spec.md`, `plan.md`, `tasks.md`. ✅
- **SC-M2**: Shipped phases have tasks marked `[x]` in tasks.md. ✅ (updated 2026-06-12)
- **SC-M3**: Migration plan linked from gitbook SUMMARY. ✅
- **SC-M4**: `master` CI passes `pnpm test` and typechecks for shipped packages. ✅
- **SC-M5**: No Kubernetes / Fly / Railway deploy artifacts in repo. ✅ (removed 2026-06-12)

## Related specs

- Legacy product phases: [`docs/phase-plan.md`](../../docs/phase-plan.md), [`docs/implementation-status.md`](../../docs/implementation-status.md)
- Spec Kit workflow: [`docs/gitbook/02-architecture/spec-driven-development.md`](../../docs/gitbook/02-architecture/spec-driven-development.md)
