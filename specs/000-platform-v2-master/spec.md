# Feature Specification: Platform V2 — Master Index

**Feature Directory**: `000-platform-v2-master`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: Active — core V2 async path implemented on `master`

**Canonical plan**: [`docs/gitbook/02-architecture/platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**ADR**: [`ADR-001`](../../docs/gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md) (historical), [`ADR-002`](../../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md) (scoped hosting policy)

**Deploy runbook**: [`docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md`](../../docs/gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md)

**Spec Kit audit**: [`docs/spec-kit-status-report.md`](../../docs/spec-kit-status-report.md)

## Purpose

Single index for the **Platform V2** migration (Next.js + Fastify/Workers API + BullMQ/Queues workers + Redis transition + Postgres + R2). This is separate from legacy SuperApp phases 0–8 in [`docs/phase-plan.md`](../../docs/phase-plan.md), which shipped inside the Remix monolith.

**Hosting policy (ADR-002):** V2 platform **primary** path is Cloudflare (Workers, Pages, R2, Queues). Optional Fastify/BullMQ on Railway/Docker when `PLATFORM_BACKEND=fastify`. Internal AI router remains Railway/Docker/Modal (separate). No Kubernetes for new V2 work. Railway deploy configs for the alternate backend and router are **in scope to remain** until operators retire them.

## Completion statement (2026-06-12)

| Scope | Status |
|-------|--------|
| **Legacy SuperApp phases 0–8** | Shipped in Remix — Phase 2 compile/publish adapter wiring remains open (legacy backlog). |
| **Platform V2 job orchestration (Phase 5)** | **Shipped** — `@superapp/job-orchestration` with inline/queue/disabled modes, BullMQ adapter, tests. |
| **Platform V2 Fastify API (Phase 3)** | **Shipped** | `@superapp/api` health + jobs + preview + assistant; CF Worker parity via shared handlers |
| **Platform V2 workers (Phases 6–12)** | **Shipped (core + scaffolds)** | BullMQ runtime, image worker, scaffold handlers, CF consumer for all platform queues |
| **Platform V2 preview enqueue (Phase 12)** | **Shipped** | `schedulePreviewExport()` uses JobOrchestrator; inline + Redis/CF queue modes |
| **Platform V2 preview sandbox (Phase 13)** | **Shipped** | Envelope contracts, Fastify + Workers preview API, Next.js sandbox shell |
| **Platform V2 deployment (Phase 18)** | **Shipped** | Full API port + queue adapter + guarded CI deploy workflow; scoped hosting policy ratified (ADR-002). One-time operator `wrangler login`/secrets only. |
| **Platform V2 Phases 8, 14–17, 21** | **Partial** | Minimal packages + API stubs; full migration pending |
| **Platform V2 Phases 4, 19–20** | Partial | Polaris shell, async UX, cross-service test matrix |

## Phase coverage matrix

| V2 Phase | Name | Spec dir | `master` status | Notes |
|----------|------|----------|-----------------|-------|
| 0 | Baseline & inventory | *(master only)* | Partial | ADR + migration plan in repo |
| 1 | Target monorepo shape | `001-target-monorepo` | Partial | `apps/web`, `apps/workers`, `apps/api`, `apps/frontend`, `packages/*` |
| 2 | Shared contracts | `002-shared-contracts` | **Shipped (core)** | Image/storage + platform job registry + WorkerEvent schema |
| 3 | Fastify API skeleton | `003-fastify-api` | **Shipped** | Health, readiness, jobs, preview, assistant; CF Worker parity |
| 4 | Next.js frontend skeleton | `004-next-frontend` | **Partial** | App Router scaffold + preview sandbox page; Polaris/Shopify shell pending |
| 5 | Job orchestration & BullMQ | `005-job-orchestration` | **Shipped** | `@superapp/job-orchestration` + CF Queues adapter |
| 6 | Worker app skeleton | `006-worker-skeleton` | **Shipped** | Bootstrap + BullMQ runtime + graceful shutdown |
| 7 | AI generation worker | `007-ai-generation-worker` | Partial | Scaffold handler on `ai-generation` queue |
| 8 | Internal assistant migration | `008-internal-assistant` | **Partial** | API readiness/chat stubs on Fastify + Workers; Remix assistant remains source of truth |
| 9 | Webhook & flow workers | `009-webhook-flow` | Partial | Scaffold handlers on `flow` + `webhook` queues |
| 10 | Connector worker | `010-connector-worker` | Partial | Scaffold handler on `connector` queue |
| 11 | Publish worker | `011-publish-worker` | Partial | Scaffold handler on `publish` queue |
| 12 | Storage & image worker | `012-storage-image-worker` | **Shipped** | Full handler + inline/queue enqueue |
| 13 | Preview sandbox | `013-preview-sandbox` | **Shipped** | Envelope contracts, Fastify + Workers preview API, Next.js sandbox shell |
| 14 | Intent graph & Recipe DSL | `014-intent-graph` | **Partial** | `@superapp/intent-graph` in-memory store + schemas |
| 15 | Data layer productionization | `015-data-layer` | **Partial** | `@superapp/data-layer` in-memory repository + schemas |
| 16 | Observability & analytics | `016-observability` | **Partial** | Worker telemetry sink + PII redaction; OTel/Sentry pending |
| 17 | Security & compliance | `017-security-compliance` | **Partial** | `@superapp/network-security` SSRF/signing/redaction; App Store audit pending |
| 18 | Deployment infrastructure | `018-deployment` | **Shipped** | CF Worker API parity + wrangler + guarded CI deploy workflow; scoped hosting policy (ADR-002); one-time operator `wrangler login`/secrets only |
| 19 | Async UX | `019-async-ux` | Partial | Job orchestration enables async; merchant UI pending |
| 20 | Testing matrix | `020-testing-matrix` | Partial | Package tests green; cross-service matrix pending |
| 21 | Rollout & cutover | `021-rollout-cutover` | **Partial** | `PLATFORM_BACKEND` + rollout flags in contracts; `PLATFORM_V2_ENABLED` in job-orchestration; traffic cutover + Remix retirement pending |
| 22 | Requirements-first, search-augmented generation | `022-requirement-search-generation` | **Shipped (core)** | `RequirementSpec` + RAG grounding + `startFrom` wired into `api.ai.create-module.tsx`. **2026-07-03 (027):** the create-time coverage report + v2 auto-fill were **removed** — they compared manifest pack ids vs the bespoke config and fired a wasted LLM call; `mustHaveControls` now returns namespaces. Completeness is a post-hydrate (024) concern. |
| 23 | Generation guardrails / prompt-injection harness | `023-generation-guardrails` | **Shipped (core)** | Prompt envelope + injection scan + schema-bound discriminator reject; **wired** into all prompt compilers + generate loop; SSRF/escape-hatch test-proven |
| 24 | Module settings uplift | `024-module-settings-uplift` | **Shipped (core)** | Fill-missing/regenerate/admin-form contracts + never-overwrite merge; `SchemaForm` renderer; `api.ai.fill-settings.tsx` (post-hydrate). Dead `republishDiff` module-detail compute removed (027); republish-diff logic reused by the Builder publish path. |
| 25 | Full working live preview for every surface | `025-live-preview-all-surfaces` | **Shipped** | Per-surface interactive renderers + deterministic Function simulation. **2026-07-03 (027):** wired into the merchant Builder — `/generate` `GenPreview` renders the real module via `PreviewService`/`/api/preview` in a sandboxed iframe (all types) + Function simulation panel, replacing the CSS mock. |
| 26 | Publish + Functions reliability | `026-publish-functions-reliability` | **Shipped** | Idempotent republish diff + loud preflight, wired in `publish.service.ts`. **Repair pass:** preflight now delegates to the core eligibility registry; status is **`deployable | needs_runtime`** (was gated/blocked); `analytics.pixel` deployable via `WEB_PIXEL_UPSERT`; deployed set = manifest ∪ env. **027:** deployability surfaced in the Builder validation tab. |
| 27 | Unified Builder (one-front generate→preview→publish) | `027-unified-builder` | **In progress** | Stabilize (022/024/026 corrections) done; Builder real preview + deployability + type-gated controls landed on `feat/027-unified-builder`. Remaining: schema-driven settings, stream-to-first-preview, runtime artifact validation, new Spring 2026 extension types. |

> Phases 22–26 are the **module-generation uplift** (build order 23 → 22 → 24 → 25 → 26). Canonical plan: [`docs/module-system-v2.md`](../../docs/module-system-v2.md). Each lands as a sibling spec folder + typed contract module in `packages/platform-contracts/src/` + tests, behind the `moduleSystemVersion` / `?engine=v2` flag where it touches generation.

## Dual queue architecture

Two job/queue generations coexist until Phase 21 cutover consolidates traffic. See [`002-shared-contracts/research.md`](../002-shared-contracts/research.md) and contract inventory in [`spec-kit-status-report.md`](../../docs/spec-kit-status-report.md).

| Path | Contracts | Transport |
|------|-----------|-----------|
| Legacy BullMQ / Fastify | `jobs.ts` — `WorkerEventSchema`, kebab-case queues (`flow-execution`, …) | Redis + BullMQ when `PLATFORM_BACKEND=fastify` |
| Platform / Cloudflare | `platform-jobs.ts`, `worker-payloads.ts`, `image-worker-jobs.ts` — `PlatformWorkerEventSchema`, short queue names (`flow`, `webhook`, `asset-storage`, …) | CF Queues when `PLATFORM_BACKEND=cloudflare` |

API `GET /v1/jobs/:jobId` merges BullMQ store + platform KV status store ([`apps/api/src/routes/index.ts`](../../apps/api/src/routes/index.ts)).

## Environment variables (job stack)

| Variable | Purpose |
|----------|---------|
| `PLATFORM_BACKEND` | `cloudflare` (recommended) or `fastify` — presets API gate + default job mode ([`rollout-cutover.ts`](../../packages/platform-contracts/src/rollout-cutover.ts)) |
| `JOB_EXECUTION_MODE` | `inline` (default when backend unset), `queue`, or `disabled` |
| `PLATFORM_V2_ENABLED` | When `false`, job orchestrator skips enqueue (`@superapp/job-orchestration`) |
| `QUEUE_REDIS_URL` / `REDIS_URL` | Redis for BullMQ when mode is `queue` and backend is `fastify` |
| `QUEUE_PREFIX` | BullMQ key prefix (default `superapp`) |
| `PREVIEW_EXPORT_QUEUE_ENABLED` | Set `1` to enable preview export enqueue from Remix |
| `R2_BUCKET_NAME` | R2 bucket for asset adapter (binding `ASSETS` on Workers) |

## Success criteria (master)

- **SC-M1**: Every V2 phase 1–21 has a `specs/0NN-*` directory with `spec.md`, `plan.md`, `tasks.md`. ✅
- **SC-M2**: Shipped phases have tasks marked `[x]` in tasks.md. ✅ (updated 2026-06-12)
- **SC-M3**: Migration plan linked from gitbook SUMMARY. ✅
- **SC-M4**: `master` CI passes `pnpm test` and typechecks for shipped packages. ✅
- **SC-M5**: V2 platform targets Cloudflare (Workers, Pages, R2, Queues); no Kubernetes for new V2 work. Railway/Docker artifacts limited to Fastify alternate backend (`PLATFORM_BACKEND=fastify`) and internal AI router — retained by policy, not residue. ✅ (criterion restated under [ADR-002](../../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md), 2026-06-12; prior "zero Railway" claim retracted; V2-platform K8s/Fly removed)

## Related specs

- Legacy product phases: [`docs/phase-plan.md`](../../docs/phase-plan.md), [`docs/implementation-status.md`](../../docs/implementation-status.md)
- Spec Kit workflow: [`docs/gitbook/02-architecture/spec-driven-development.md`](../../docs/gitbook/02-architecture/spec-driven-development.md)
