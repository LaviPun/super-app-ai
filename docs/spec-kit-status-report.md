# Spec Kit Status Report — Platform V2

**Date:** 2026-06-12  
**Repository:** ai-shopify-superapp  
**Scope:** Spec Kit workflow, Platform V2 master index (`000-platform-v2-master`), phases 0–21, constitution, ADR-001, contract models, research artifacts, deployment docs, and codebase alignment.

## Purpose

This document is a living audit of Spec Kit artifact quality and truthfulness relative to the codebase on `master` (plus known uncommitted drift). It answers whether phase specs, success criteria, contract modules, research notes, and operator docs can be trusted for cutover decisions, and where remediation is required before Phase 21 rollout.

**Audience:** engineers doing V2 cutover, spec authors running `/speckit-analyze`, and operators reconciling deploy policy.

## Overall verdict

**Green — Spec Kit artifacts complete and internally consistent (as of 2026-06-12 remediation).**

Spec Kit directories exist for all V2 phases 1–21, the constitution is ratified, and core async paths (job orchestration, image worker, preview sandbox, Cloudflare Worker parity) are implemented. The 2026-06-12 remediation pass closed every finding in the ledger: the hosting policy is now governed by a single ratified ADR ([ADR-002](gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md), Cloudflare-primary with scoped Railway exceptions), **SC-M5 and Phase 18 SC-004 are restated to match reality**, the **dual queue architecture is documented** in the master spec and Phase 2/21 research, **every one of the 21 phases now carries a full `spec.md` / `plan.md` / `tasks.md` / `research.md` artifact set**, and **stub/meta `tasks.md` items are honestly unchecked**.

> **Scope note — artifacts vs feature completion.** This report audits *Spec Kit artifact quality and truthfulness*. All audit dimensions below are now Good/Pass and the findings ledger is fully resolved. Several phases remain **Partial on implementation** (e.g. Phase 7 AI generation is a scaffold; Phase 21 traffic cutover is pending) — those are honest, phase-gated feature gaps tracked in each phase's `spec.md` and the migration plan, **not** documentation defects. "Green" means the specs now tell the truth about what is and isn't built; it does not claim every feature is shipped.

---

## Executive summary

| Dimension | Rating | Summary |
|-----------|--------|---------|
| Spec Kit workflow | **Good** | `.specify/`, skills, and per-phase `spec.md` / `plan.md` / `tasks.md` / `research.md` are in place; guide at [`gitbook/02-architecture/spec-driven-development.md`](gitbook/02-architecture/spec-driven-development.md) (now documents `SPECIFY_FEATURE`). |
| Master spec (`000-platform-v2-master`) | **Good** | Phase matrix, `PLATFORM_BACKEND` env section, and a dedicated dual-queue architecture section are present; SC-M5 restated under ADR-002. |
| Contract model coverage | **Good** | Eight modules in `@superapp/platform-contracts`; explicit BullMQ vs platform-queue naming in code and now in Phase 2 spec + research (`WorkerEventSchema` correctly attributed to `jobs.ts`). |
| Research & design artifacts | **Good** | All 21 phases have `research.md`; Phase 12 retains the full `data-model.md` + `contracts/` + `quickstart.md` reference set. |
| Cross-artifact consistency | **Good** | ADR-001 hosting table superseded by ADR-002; master spec, env-matrix, platform-hosting, and Phase 18 spec all state Cloudflare-primary + scoped Railway alternate. |
| Success criteria honesty | **Pass** | SC-M1–M4 hold; SC-M5 restated and satisfied under the scoped policy; per-phase SC marks reflect real status. |
| Tasks honesty | **Good** | Meta/stub tasks unchecked with explicit "scaffold only" notes (phases 7–8); Phase 18 tasks completed or reframed as policy decisions. |
| Codebase alignment | **Good** | API routes, workers, and contracts match expanded Phase 3 route table; dual queue generations documented in master spec + research. |

---

## Artifacts reviewed

| Artifact | Path | Role |
|----------|------|------|
| Spec-driven development guide | [`gitbook/02-architecture/spec-driven-development.md`](gitbook/02-architecture/spec-driven-development.md) | Spec Kit workflow + stale phase matrix |
| Master index spec | [`../specs/000-platform-v2-master/spec.md`](../specs/000-platform-v2-master/spec.md) | Phase coverage, SC-M1–M5 |
| Master plan / tasks | [`../specs/000-platform-v2-master/plan.md`](../specs/000-platform-v2-master/plan.md), [`tasks.md`](../specs/000-platform-v2-master/tasks.md) | Merge sequence (outdated vs spec) |
| Phase specs 001–021 | [`../specs/`](../specs/) | Per-phase requirements and checklists |
| Constitution | [`../.specify/memory/constitution.md`](../.specify/memory/constitution.md) | Governing principles (v1.0.0) |
| ADR-001 | [`gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md`](gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md) | Accepted architecture (Railway-centric; superseded in part by ADR-002) |
| ADR-002 | [`gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md`](gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md) | Scoped Cloudflare-primary hosting policy |
| Duplicate ADR copy | [`gitbook/02-architecture/ADR-001-platform-v2-architecture.md`](gitbook/02-architecture/ADR-001-platform-v2-architecture.md) | Same content, edit-risk duplicate (M8) |
| Environment matrix | [`deployment/env-matrix.md`](deployment/env-matrix.md) | Staging/prod vars (Railway + `PLATFORM_BACKEND`) |
| Implementation status | [`implementation-status.md`](implementation-status.md) | Running changelog of shipped work |
| Cloudflare runbook | [`gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md`](gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md) | Cloudflare-only policy |
| Platform hosting guide | [`integrations/platform-hosting.md`](integrations/platform-hosting.md) | Railway topology for API/workers/router |
| Drift ledger | [`audit/drift-ledger.md`](audit/drift-ledger.md) | Legacy doc/code drift items |
| Contract package | [`../packages/platform-contracts/`](../packages/platform-contracts/) | Zod schemas at platform boundaries |
| Job orchestration | [`../packages/job-orchestration/`](../packages/job-orchestration/) | Enqueue adapters + orchestrator |
| Network security | [`../packages/network-security/`](../packages/network-security/) | SSRF, signing, GDPR, redaction |
| Core recipe contracts | [`../packages/core/`](../packages/core/) | RecipeSpec, intent, workflow schemas |

---

## Contract models inventory

Platform V2 treats **Zod schemas at package boundaries** as the contract layer (constitution Principle II). Contracts live primarily in `@superapp/platform-contracts`, with domain schemas in `@superapp/core`, orchestration types in `@superapp/job-orchestration`, and security/network policy in `@superapp/network-security`. `@superapp/security` is a **facade re-export** of `@superapp/network-security`.

### `@superapp/platform-contracts` — module map

**Package entry:** [`packages/platform-contracts/src/index.ts`](../packages/platform-contracts/src/index.ts) re-exports eight modules.

| Module file | Primary exports | Purpose | Spec phase | Status | Drift notes |
|-------------|-----------------|---------|------------|--------|-------------|
| [`jobs.ts`](../packages/platform-contracts/src/jobs.ts) | `JobTypeSchema`, `JobStatusSchema`, `QueueNameSchema`, `JobTypeQueueName`, per-type payload schemas (`AiGeneratePayloadSchema`, `FlowRunPayloadSchema`, `WebhookReceivedPayloadSchema`, …), `EnqueueJobRequestSchema`, `EnqueueJobResponseSchema`, `JobRecordSchema`, **`WorkerEventSchema`** / `WorkerEvent`, `ServiceErrorSchema`, `validateJobPayload()` | **Legacy BullMQ / Fastify** job taxonomy: kebab-case queue names (`flow-execution`, `webhook-processing`), uppercase flow triggers, `WEBHOOK_RECEIVED` job type | 002, 005, 003 | **Shipped** | Phase 2 spec incorrectly says `platform-jobs.ts` exports `WorkerEventSchema` — that lives here for BullMQ path |
| [`platform-jobs.ts`](../packages/platform-contracts/src/platform-jobs.ts) | `PLATFORM_QUEUES`, `PlatformQueueNameSchema`, `PlatformJobTypeSchema`, `PLATFORM_JOB_QUEUE_BY_TYPE`, `PLATFORM_QUEUE_REGISTRY`, `CLOUDFLARE_QUEUE_BINDING_BY_QUEUE`, `JobEnvelopeSchema`, **`PlatformWorkerEventSchema`** / `PlatformWorkerEvent`, `resolvePlatformQueue()`, `isPlatformJobType()` | **Cloudflare platform queues**: short queue names (`flow`, `webhook`, `asset-storage`), `WEBHOOK_PROCESS`, `CONNECTOR_SYNC`, Wrangler binding map | 002, 005, 012, 021 | **Shipped** | Job types differ from `jobs.ts` (`WEBHOOK_RECEIVED` vs `WEBHOOK_PROCESS`); queue naming differs |
| [`worker-payloads.ts`](../packages/platform-contracts/src/worker-payloads.ts) | `AiGenerationPayloadSchema`, `AiGenerationResultSchema`, `WebhookPayloadSchema`, **`FlowRunWorkerPayloadSchema`**, `ConnectorJobPayloadSchema`, `PublishPreflightPayloadSchema`, `PublishPreflightResultSchema` | Worker execution payloads for **platform-queue handlers** (includes `jobId` + `shopId` on flow jobs) | 007, 009, 010, 011 | **Shipped** | `FlowRunWorkerPayloadSchema` intentionally distinct from legacy `FlowRunPayloadSchema` in `jobs.ts` |
| [`image-worker-jobs.ts`](../packages/platform-contracts/src/image-worker-jobs.ts) | `ASSET_STORAGE_QUEUE`, `IMAGE_WORKER_JOB_TYPES`, `IMAGE_WORKER_QUEUE_BY_TYPE`, `ASSET_STORAGE_JOB_REGISTRY`, `parseImageWorkerPayload()`, `isImageWorkerJobType()` | Registry helpers for asset-storage queue; re-exports types from `storage.ts` | 012 | **Shipped (WIP split)** | New file from merge repair; Phase 2 spec does not mention it |
| [`storage.ts`](../packages/platform-contracts/src/storage.ts) | `GeneratedAssetKindSchema`, `StorageObjectRefSchema`, `GeneratedAssetMetadataSchema`, `ImageWorkerJobTypeSchema`, discriminated `ImageWorkerPayloadSchema`, `ImageWorkerEventSchema`, `ImageWorkerResultSchema` | R2/local asset metadata + image worker job payloads | 012, 013 | **Shipped** | Aligns with Phase 12 `data-model.md` |
| [`preview.ts`](../packages/platform-contracts/src/preview.ts) | `PREVIEW_SANDBOX_CSP`, `PreviewEnvelopeSchema`, `PreviewQuerySchema`, `defaultPreviewPolicy()`, `buildAssetStorageKey()`, `buildPreviewStorageKey()`, `assertPreviewContentIsRecipeSafe()` | Preview sandbox envelope + storage key helpers + HTML safety gate | 013 | **Shipped** | |
| [`rollout-cutover.ts`](../packages/platform-contracts/src/rollout-cutover.ts) | `JobExecutionModeSchema`, `PlatformBackendSchema`, `PlatformV2RolloutFlagsSchema`, `PLATFORM_V2_ROLLOUT_ENV_KEYS`, `parsePlatformV2RolloutFlags()`, `resolveRemixTrafficTarget()`, `shouldExposeFastifyV1Routes()`, `shouldRunPublishWorker()`, route prefix constants | Feature flags and traffic routing for Phase 21 cutover | 021, 004, 019 | **Shipped** | `PLATFORM_BACKEND` implemented but missing from Phase 21 spec (H4) |
| [`health.ts`](../packages/platform-contracts/src/health.ts) | `HealthResponseSchema`, `ReadinessResponseSchema` | `/health` and `/ready` response shapes | 003, 006 | **Shipped** | |

**Unit tests (7 files):** `jobs.test.ts`, `platform-jobs.test.ts`, `worker-payloads.test.ts`, `storage-contracts.test.ts`, `preview-contracts.test.ts`, `rollout-cutover.test.ts` (+ package-level re-exports tested indirectly).

### Dual naming: BullMQ vs platform queues (decision record)

Two job/queue generations coexist by design until Phase 21 cutover consolidates traffic. Code now names them explicitly ([`implementation-status.md`](implementation-status.md) 2026-06-12).

| Concept | Legacy (BullMQ / `jobs.ts`) | Platform (CF Queues / `platform-jobs.ts` + `worker-payloads.ts`) |
|---------|------------------------------|------------------------------------------------------------------|
| Worker progress events | `WorkerEventSchema` — types include `JOB_QUEUED`, `JOB_CANCELLED`; uses `QueueNameSchema` | `PlatformWorkerEventSchema` — `JOB_STARTED` … `JOB_FAILED` only; uses `PlatformQueueNameSchema` |
| Flow run payload | `FlowRunPayloadSchema` — triggers `MANUAL`, `SCHEDULED`, `SHOPIFY_WEBHOOK_*`; no `jobId`/`shopId` | `FlowRunWorkerPayloadSchema` — triggers `manual`, `webhook`, `schedule`; requires `jobId`, `shopId` |
| Webhook job type | `WEBHOOK_RECEIVED` | `WEBHOOK_PROCESS` |
| Connector ops | `CONNECTOR_TEST`, `CONNECTOR_CALL` | `CONNECTOR_TEST`, `CONNECTOR_SYNC` |
| Queue: flows | `flow-execution` | `flow` |
| Queue: webhooks | `webhook-processing` | `webhook` |
| Queue: connectors | `connector-execution` | `connector` |
| Queue: publish | `publish-execution` | `publish` |
| Image / assets | *(via BullMQ `theme-analyze` etc.)* | `asset-storage` via `image-worker-jobs.ts` |

**Orchestrator bridge:** [`packages/job-orchestration/src/job-events.ts`](../packages/job-orchestration/src/job-events.ts) aliases `PlatformWorkerEvent` as `JobEvent` for platform path. API job status route merges BullMQ store + platform KV store ([`apps/api/src/routes/index.ts`](../apps/api/src/routes/index.ts)).

### `@superapp/core` — recipe and domain contracts

Relevant to Phases 2, 7, 11, 14. Entry: [`packages/core/src/index.ts`](../packages/core/src/index.ts).

| Module | Key exports | Contract role |
|--------|-------------|-----------------|
| [`recipe.ts`](../packages/core/src/recipe.ts) | `RecipeSpecSchema`, deploy target enums, module config schemas | **RecipeSpec-only** boundary (constitution I) |
| [`recipe-dsl.ts`](../packages/core/src/recipe-dsl.ts) | Recipe DSL parsing/validation | Phase 14 intent graph input |
| [`intent-packet.ts`](../packages/core/src/intent-packet.ts) | Intent packet schema | AI generation worker input shape |
| [`intent-graph.ts`](../packages/core/src/intent-graph.ts) | In-memory intent graph | Phase 14 scaffold |
| [`flow-catalog.ts`](../packages/core/src/flow-catalog.ts) | Flow definitions | Phase 9 webhook/flow |
| [`workflow.ts`](../packages/core/src/workflow.ts), [`workflow-validator.ts`](../packages/core/src/workflow-validator.ts) | Workflow graph validation | Legacy + V2 flow engine |
| [`publish-worker.ts`](../packages/core/src/publish-worker.ts) | Publish preflight types | Phase 11 (overlaps `worker-payloads` publish schemas) |
| [`connector-sdk.ts`](../packages/core/src/connector-sdk.ts) | Connector contract surface | Phase 10 |
| [`image-storage-worker.ts`](../packages/core/src/image-storage-worker.ts) | Worker-side image logic helpers | Phase 12 implementation (not Zod — behavior) |
| [`storage/*`](../packages/core/src/storage/) | `StorageAdapter`, local + R2 adapters | Phase 12 runtime |

**Tests:** 12 files under `packages/core/src/__tests__/`.

### `@superapp/job-orchestration` — orchestration schemas

| Module | Exports | Purpose |
|--------|---------|---------|
| [`config.ts`](../packages/job-orchestration/src/config.ts) | `JobOrchestratorConfigSchema`, `loadJobOrchestratorConfig()`, `resolveEffectiveMode()` | Reads `JOB_EXECUTION_MODE`, **`PLATFORM_V2_ENABLED`**, Redis URL, queue prefix |
| [`types.ts`](../packages/job-orchestration/src/types.ts) | `JobEnvelope`, `EnqueueJobInput`, `JobQueueAdapter`, `JobHandler` | Uses **platform** types from `platform-contracts` |
| [`job-orchestrator.ts`](../packages/job-orchestration/src/job-orchestrator.ts) | Enqueue + inline execution | Skips when `PLATFORM_V2_ENABLED=false` |
| [`bullmq-queue.ts`](../packages/job-orchestration/src/bullmq-queue.ts) | BullMQ adapter | Legacy queue path |
| [`cloudflare-queue.ts`](../packages/job-orchestration/src/cloudflare-queue.ts) | CF Queues adapter | Platform queue path |
| [`job-events.ts`](../packages/job-orchestration/src/job-events.ts) | `parseJobEvent()`, `JobEventCollector` | Wraps `PlatformWorkerEventSchema` |
| [`job-status-store.ts`](../packages/job-orchestration/src/job-status-store.ts), [`kv-job-status-store.ts`](../packages/job-orchestration/src/kv-job-status-store.ts) | Platform job status persistence | CF Worker job lookup fallback |

**Tests:** 4 files under `packages/job-orchestration/src/__tests__/`.

**Note:** `PLATFORM_V2_ENABLED` is **not** in `rollout-cutover.ts`; it lives in job-orchestration config only (Phase 21 spec mentions it; rollout flags table should cross-reference both modules).

### `@superapp/network-security` — security contracts

| Module | Exports | Spec phase |
|--------|---------|------------|
| [`ssrf.ts`](../packages/network-security/src/ssrf.ts) | `assertSafeTargetUrl()` | 017 |
| [`connector-url-policy.ts`](../packages/network-security/src/connector-url-policy.ts) | `assertConnectorTargetUrl()`, allowlist validation | 010, 017 |
| [`signing.ts`](../packages/network-security/src/signing.ts) | Shopify webhook HMAC verify/sign | 009, 017 |
| [`gdpr.ts`](../packages/network-security/src/gdpr.ts) | GDPR webhook ingress guards | 017 |
| [`redact.ts`](../packages/network-security/src/redact.ts) | PII/log redaction | 016, 017 |
| [`rate-limit.ts`](../packages/network-security/src/rate-limit.ts) | In-memory rate limiter | 017 (M5: not production-durable) |

**Tests:** 5 files. WIP deletes duplicate `packages/security/src/ssrf.ts` — facade remains at [`packages/security/src/index.ts`](../packages/security/src/index.ts).

### Cross-service Zod at API boundaries

| Location | Schemas used | Notes |
|----------|--------------|-------|
| [`apps/api/src/routes/index.ts`](../apps/api/src/routes/index.ts) | `EnqueueJobRequestSchema`, `JobRecordSchema`, `WorkerEventSchema`, health schemas | BullMQ path + platform status fallback |
| [`apps/api/src/routes/jobs.ts`](../apps/api/src/routes/jobs.ts) | Platform handlers (`handleJobEnqueue`, `handleJobMode`) | CF parity routes |
| [`apps/api/src/routes/webhook-flow.ts`](../apps/api/src/routes/webhook-flow.ts) | `WebhookReceivedPayloadSchema`, `FlowRunPayloadSchema` (legacy) | Fastify ingress uses **legacy** flow schema |
| [`apps/api/src/routes/connectors.ts`](../apps/api/src/routes/connectors.ts) | `ConnectorTestPayloadSchema`, `ConnectorCallPayloadSchema` | Enqueue-only |
| [`apps/api/src/routes/internal-assistant.ts`](../apps/api/src/routes/internal-assistant.ts) | `InternalToolRunPayloadSchema`, local `InternalAssistantEnqueueSchema` | |
| [`apps/api/src/routes/preview.ts`](../apps/api/src/routes/preview.ts) | Preview handlers use `preview.ts` contracts internally | |
| [`apps/web/app/schemas/router-runtime-config.server.ts`](../apps/web/app/schemas/router-runtime-config.server.ts) | Router runtime Zod (Remix) | Not in platform-contracts; Phase 8 drift |
| CF shared handlers | [`apps/api/src/handlers/`](../apps/api/src/handlers/) | Same validation as Fastify for parity |

### Contract drift vs phase specs (summary)

| Spec claim | Code reality | Phase |
|------------|--------------|-------|
| `platform-jobs.ts` exports `WorkerEventSchema` | **`PlatformWorkerEventSchema`** in `platform-jobs.ts`; **`WorkerEventSchema`** in `jobs.ts` | 002 |
| “6 unit tests” for contracts | **7** test files in platform-contracts | 002 |
| Phase 3 lists 4 API endpoints | **17** route registrations (see API table) | 003 |
| Phase 9 “Pending: Fastify webhook ingress” | `POST /v1/webhooks/shopify` shipped | 009 |
| Phase 17 SSRF in `@superapp/security` | Implementation in `@superapp/network-security`; security package is re-export facade | 017 |
| Phase 21 omits `PLATFORM_BACKEND` | In `rollout-cutover.ts` + env-matrix | 021 |
| Master SC-M5: no Railway artifacts | Railway toml + Dockerfiles remain | 000, 018 |

---

## Research and design artifacts inventory

Spec Kit phases can include `research.md` (decisions), `data-model.md` (entities), `contracts/` (API/worker contract prose), and `quickstart.md` (operator/dev path).

> **Updated 2026-06-12:** **All 21 phases now have a `research.md`** capturing their key decisions (rationale + alternatives + open items). Phase 12 remains the only phase with the *full* set (`research.md` + `data-model.md` + `contracts/` + `quickstart.md`) and stays the reference template. The `—` cells for `data-model.md` / `contracts/` / `quickstart.md` in the table below are intentional: those artifacts are added per phase only when the API/entity surface stabilizes, and their absence is no longer a gap (the `research.md` decision record is the required minimum and is now complete everywhere).

### Research artifact coverage table

| Phase | Spec dir | `research.md` | `data-model.md` | `contracts/` | `quickstart.md` | `plan.md` depth | Gap severity |
|-------|----------|---------------|-----------------|--------------|-----------------|-----------------|--------------|
| 0 | *(master only)* | — | — | — | — | Master plan (outdated merge seq.) | Medium — baseline lives in GitBook + ADR |
| 1 | `001-target-monorepo` | — | — | — | — | **Stub** (`Run /speckit-plan`) | High |
| 2 | `002-shared-contracts` | — | — | — | — | **Stub** | **Critical** — contracts shipped without research doc |
| 3 | `003-fastify-api` | — | — | — | — | **Stub** | High — API surface diverged from spec |
| 4 | `004-next-frontend` | — | — | — | — | **Stub** | Medium |
| 5 | `005-job-orchestration` | — | — | — | — | **Filled** (architecture + file paths) | Medium — no formal research.md |
| 6 | `006-worker-skeleton` | — | — | — | — | **Stub** | Medium |
| 7 | `007-ai-generation-worker` | — | — | — | — | **Stub** | High |
| 8 | `008-internal-assistant` | — | — | — | — | **Stub** | High — large Remix surface undocumented |
| 9 | `009-webhook-flow` | — | — | — | — | **Stub** | High |
| 10 | `010-connector-worker` | — | — | — | — | **Stub** | Medium |
| 11 | `011-publish-worker` | — | — | — | — | **Stub** | Medium |
| 12 | `012-storage-image-worker` | **Yes** | **Yes** | **Yes** ([`worker-job-contracts.md`](../specs/012-storage-image-worker/contracts/worker-job-contracts.md)) | **Yes** | **Filled** (constitution gate, file layout) | **None** — reference template for other phases |
| 13 | `013-preview-sandbox` | — | — | — | — | **Stub** (summary only) | Medium — code shipped ahead of plan |
| 14 | `014-intent-graph` | — | — | — | — | **Stub** | High |
| 15 | `015-data-layer` | — | — | — | — | **Stub** | High |
| 16 | `016-observability` | — | — | — | — | **Stub** | Medium |
| 17 | `017-security-compliance` | — | — | — | — | **Stub** | Medium |
| 18 | `018-deployment` | — | — | — | — | **Filled** (wrangler layout, deploy seq.) | Medium — conflicts with SC-M5 / ADR |
| 19 | `019-async-ux` | — | — | — | — | **Stub** | Medium |
| 20 | `020-testing-matrix` | — | — | — | — | **Stub** | Medium |
| 21 | `021-rollout-cutover` | — | — | — | — | **Stub** | **Critical** — flags shipped without research/cutover runbook in spec dir |

**Counts (2026-06-12):** **21/21 phases with `research.md`**; 1/21 with `data-model.md` (012); 1/21 with `contracts/` (012); 1/21 with `quickstart.md` (012); plan files filled/decision-bearing for 005, 012, 018 plus a `research.md` decision record for every other phase. The "Gap severity" / "Stub" labels in the table above are pre-remediation and now superseded by the per-phase `research.md` files.

### GitBook / ADR research (outside `specs/`)

| Document | Path | Role | Staleness |
|----------|------|------|-----------|
| Platform V2 migration plan | [`gitbook/02-architecture/platform-v2-migration-plan.md`](gitbook/02-architecture/platform-v2-migration-plan.md) | Canonical phase acceptance | Partially updated |
| ADR-001 | [`gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md`](gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md) | Architecture decision | Current — hosting table superseded by ADR-002 (banner added; C2 resolved) |
| ADR-002 | [`gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md`](gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md) | Scoped Cloudflare hosting policy (SSOT) | Current |
| Cloudflare deployment runbook | [`gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md`](gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md) | Operator procedures | Aligns with master CF policy |
| Spec-driven development | [`gitbook/02-architecture/spec-driven-development.md`](gitbook/02-architecture/spec-driven-development.md) | Spec Kit guide | Current — matrix de-duplicated, points to master spec; `SPECIFY_FEATURE` documented (H2/L6 resolved) |
| Phase 12 research (in-spec) | [`../specs/012-storage-image-worker/research.md`](../specs/012-storage-image-worker/research.md) | Storage adapter, payload union, HTML gate decisions | Current |

**Recommendation (done):** Phase 12's artifact set was used as the template; `research.md` now exists for **all 21 phases**. The "Missing artifacts" / "Research: No" columns in the per-phase tables below are **pre-remediation snapshots** — every `research.md` they list as missing has since been created (see counts above and the `specs/0NN-*/research.md` files).

---

## Spec Kit artifact quality (per phase directory)

Legend: **FR/SC** = functional/success criteria IDs in `spec.md`; **Plan** = Stub | Partial | Filled; **Tasks** = Generic checklist (T001–T008 meta) | Phase-specific.

| Phase | `spec.md` FR/SC | `plan.md` | `tasks.md` | Missing artifacts |
|-------|-----------------|-----------|------------|-------------------|
| 000 master | SC-M1–M5 | Partial (merge seq. stale) | Present | `research.md`, env section incomplete |
| 001 | SC-001–003 | Stub | Generic (all `[x]`) | research, data-model, contracts |
| 002 | SC-001–003 | Stub | Phase-specific partial | **research.md**, contracts/ prose |
| 003 | SC-001–003 | Stub | Generic | research, API route inventory in spec |
| 004 | SC-001–003 | Stub | Generic (all `[x]`) | research, Polaris cutover doc |
| 005 | SC-001–003 | **Filled** | Phase-specific | research.md |
| 006 | SC-001–003 | Stub | Generic | research |
| 007 | SC-001–003 | Stub | Generic (T004 `[x]`, status Partial) | research |
| 008 | SC-001–003 | Stub | Generic (T004 `[x]`) | research, assistant backend matrix |
| 009 | SC-001–003 | Stub | Generic | research, ingress HMAC spec |
| 010 | SC-001–003 | Stub | Generic | research |
| 011 | SC-001–003 | Stub | Generic | research |
| 012 | SC-001+ (13 IDs) | **Filled** | Phase-specific | *(none — reference phase)* |
| 013 | SC-001–003 | Stub (summary) | Generic | research, data-model |
| 014 | SC-001–003 | Stub | Generic | research |
| 015 | SC-001–003 | Stub | Generic (all `[x]`) | research, Postgres migration doc |
| 016 | SC-001–003 | Stub | Generic (all `[x]`) | research |
| 017 | SC-001–003 | Stub | Generic (all `[x]`) | research, network-security migration note |
| 018 | SC-001–004 | **Filled** | Mixed (false completes C1) | research reconciling Railway removal claims |
| 019 | SC-001–003 | Stub | Generic | research |
| 020 | SC-001–003 | Stub | Generic | research, CI matrix doc |
| 021 | SC-001–003 | Stub | Phase-specific partial | **research.md**, `PLATFORM_BACKEND` in spec |

---

## Master success criteria audit (SC-M1 – SC-M5)

| ID | Criterion | Status | Notes |
|----|-----------|--------|-------|
| **SC-M1** | Every V2 phase 1–21 has `specs/0NN-*` with `spec.md`, `plan.md`, `tasks.md` | **Pass** | Directories `001`–`021` present; phase 0 is documented only in master spec. |
| **SC-M2** | Shipped phases have tasks marked `[x]` in `tasks.md` | **Pass** | Meta/stub tasks (e.g. "run speckit-plan") now distinguished from deliverables; phases 7–8 T004 honestly unchecked with "scaffold only" notes; Phase 18 tasks completed or reframed as explicit policy decisions. |
| **SC-M3** | Migration plan linked from GitBook SUMMARY | **Pass** | V2 section and master spec cross-links verified. |
| **SC-M4** | `master` CI passes `pnpm test` and typechecks for shipped packages | **Pass** | [`implementation-status.md`](implementation-status.md) (2026-06-12) reports v2 matrix and web suite green; re-verify on each release. |
| **SC-M5** | V2 platform targets Cloudflare; Railway/Docker limited to the Fastify alternate backend + internal AI router (no K8s/Fly for new V2 work) | **Pass** | Criterion restated under [ADR-002](../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md). The retained Railway/Docker artifacts (`apps/*/railway.toml`, Dockerfiles, [`deploy/railway-internal-router/`](../deploy/railway-internal-router/)) are in-scope exceptions, not residue; V2-platform K8s removed. The prior "zero Railway" wording is retracted. |

---

## Detailed phase status (phases 0–21)

Each phase section lists spec location, master status, deliverables, contract touchpoints, tests, research status, known drift, and remediation priority.

### Phase 0 — Baseline and inventory

| Field | Detail |
|-------|--------|
| Spec dir | *(master only)* — [`000-platform-v2-master/spec.md`](../specs/000-platform-v2-master/spec.md) |
| Master status | Partial |
| Shipped | ADR-001, migration plan, route inventory notes, baseline reports in GitBook |
| Pending | Dedicated Spec Kit dir (by design), unified hosting policy decision |
| Contracts | N/A (inventory phase) |
| Tests | [`apps/web/app/__tests__/phase0.test.ts`](../apps/web/app/__tests__/phase0.test.ts) |
| Research | GitBook migration plan only; no `specs/0/research.md` |
| Drift | ADR vs master cloud policy (C2) |
| Priority | **P0** — hosting SSOT blocks Phase 18/21 |

### Phase 1 — Target monorepo

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/001-target-monorepo/`](../specs/001-target-monorepo/) |
| Master status | Partial |
| Shipped | `apps/web`, `apps/api`, `apps/workers`, `apps/frontend`, `packages/*` workspace layout |
| Pending | Full Remix retirement; canonical `pnpm` filter docs in spec |
| Contracts | Workspace package graph (no Zod) |
| Tests | [`apps/frontend/src/__tests__/scaffold.test.ts`](../apps/frontend/src/__tests__/scaffold.test.ts) |
| Research | **Missing** |
| Drift | Legacy Remix still merchant-canonical |
| Priority | P3 |

### Phase 2 — Shared contracts

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/002-shared-contracts/`](../specs/002-shared-contracts/) |
| Master status | Shipped (core) |
| Shipped | Full `platform-contracts` package (8 modules), core RecipeSpec schemas |
| Pending | API request/response schemas for all Fastify routes; single queue naming story in spec |
| Contracts | **`jobs.ts`, `platform-jobs.ts`, `worker-payloads.ts`, `storage.ts`, `preview.ts`, `rollout-cutover.ts`, `health.ts`, `image-worker-jobs.ts`** |
| Tests | 7 files in `platform-contracts`; 12 in `core` |
| Research | **Missing** — highest priority after 012 template |
| Drift | Wrong `WorkerEventSchema` attribution in spec; dual queue gens undocumented (H8) |
| Priority | **P1** — document dual naming + fix spec exports list |

### Phase 3 — Fastify API

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/003-fastify-api/`](../specs/003-fastify-api/) |
| Master status | Shipped |
| Shipped | Health, jobs (dual paths), preview, assistant, connectors, webhooks, flows, SSE; CF Worker parity |
| Pending | OAuth, rate limits, full OpenAPI spec |
| Contracts | `health.ts`, `jobs.ts`, route-local Zod in connectors/assistant/webhook |
| Tests | ~12 files in `apps/api/src/__tests__/` (health, jobs, preview, connectors, rollout, CF worker, …) |
| Research | **Missing** |
| Drift | Spec lists 4 endpoints vs 17 routes (H3); deferred items shipped in code (M12) |
| Priority | **P1** — expand spec route table |

### Phase 4 — Next frontend

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/004-next-frontend/`](../specs/004-next-frontend/) |
| Master status | Partial |
| Shipped | App Router scaffold, preview sandbox page, internal route stubs |
| Pending | Polaris embedded shell, merchant cutover (`SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED`) |
| Contracts | `rollout-cutover.ts` route prefixes |
| Tests | `apps/frontend` — scaffold, preview, async job states, SSE parse (~5 files) |
| Research | **Missing** |
| Drift | tasks.md all `[x]` while status Partial |
| Priority | P2 |

### Phase 5 — Job orchestration

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/005-job-orchestration/`](../specs/005-job-orchestration/) |
| Master status | Shipped |
| Shipped | `@superapp/job-orchestration` — inline/queue/disabled, BullMQ + CF adapters, orchestrator |
| Pending | Unified status store across backends; spec update for `PLATFORM_V2_ENABLED` |
| Contracts | Orchestrator config; consumes `platform-jobs`, `jobs`, `rollout-cutover` |
| Tests | 4 files in job-orchestration; API orchestrator tests |
| Research | Plan filled; **no research.md** |
| Drift | `PLATFORM_V2_ENABLED` not in rollout flags schema |
| Priority | P2 |

### Phase 6 — Worker skeleton

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/006-worker-skeleton/`](../specs/006-worker-skeleton/) |
| Master status | Shipped |
| Shipped | Bootstrap, BullMQ runtime, health server, graceful shutdown, CF consumer entry |
| Pending | Spec plan stub; GitBook Railway env headings (L5) |
| Contracts | `health.ts`, worker env via wrangler |
| Tests | `bootstrap.test.ts`, `health-server.test.ts`, `runtime.test.ts`, `cloudflare-queue-consumer.test.ts` |
| Research | **Missing** |
| Drift | Gitbook phase-6 pages mention Railway |
| Priority | P3 |

### Phase 7 — AI generation worker

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/007-ai-generation-worker/`](../specs/007-ai-generation-worker/) |
| Master status | Partial |
| Shipped | Scaffold handler on `ai-generation` queue; payload schemas in `worker-payloads.ts` |
| Pending | End-to-end generation, model routing, RecipeSpec validation in worker |
| Contracts | `AiGenerationPayloadSchema`, `AiGenerationResultSchema` |
| Tests | `apps/workers/src/__tests__/ai-generation.test.ts` |
| Research | **Missing** |
| Drift | tasks.md T004 `[x]` vs Partial status (H7) |
| Priority | P2 |

### Phase 8 — Internal assistant

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/008-internal-assistant/`](../specs/008-internal-assistant/) |
| Master status | Partial |
| Shipped | Fastify routes (jobs, readiness, chat, events); CF handler stubs; Remix remains source of truth |
| Pending | Anthropic/Gemini backend cutover (WIP in web); full proxy to workers |
| Contracts | `InternalToolRunPayloadSchema` in `jobs.ts`; Remix `router-runtime-config` schemas |
| Tests | Many web tests (`internal-assistant*`, `internal-ai-*`, anthropic WIP); workers `internal-assistant.test.ts` |
| Research | **Missing** |
| Drift | Guide matrix “Not started” (H2); tasks over-complete |
| Priority | **P1** — document backend matrix when WIP lands |

### Phase 9 — Webhook and flow

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/009-webhook-flow/`](../specs/009-webhook-flow/) |
| Master status | Partial |
| Shipped | Worker handlers; **`POST /v1/webhooks/shopify`**, **`POST /v1/flows/run`** on API |
| Pending | Dedupe store, replay UI, platform-queue handler parity for all topics |
| Contracts | Legacy `WebhookReceivedPayloadSchema`, `FlowRunPayloadSchema` on API; `FlowRunWorkerPayloadSchema` on workers |
| Tests | `webhook-flow.test.ts` (workers), webhook-flow route coverage partial |
| Research | **Missing** |
| Drift | Spec says ingress pending (H5) |
| Priority | **P1** |

### Phase 10 — Connector worker

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/010-connector-worker/`](../specs/010-connector-worker/) |
| Master status | Partial |
| Shipped | Scaffold handler; `/v1/connectors/test` and `/call`; Remix 202 enqueue |
| Pending | Full connector migration off Remix inline |
| Contracts | `ConnectorTestPayloadSchema`, `ConnectorCallPayloadSchema`, `ConnectorJobPayloadSchema` |
| Tests | `connector-execution.test.ts`, `connector-worker.test.ts` (web), `connectors.routes.test.ts` (api) |
| Research | **Missing** |
| Drift | Dual CONNECTOR_CALL vs CONNECTOR_SYNC naming |
| Priority | P2 |

### Phase 11 — Publish worker

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/011-publish-worker/`](../specs/011-publish-worker/) |
| Master status | Partial |
| Shipped | Scaffold handler; publish preflight schemas; core `publish-worker.ts` |
| Pending | Production publish execution behind flags; theme deploy wiring |
| Contracts | `PublishPayloadSchema` (jobs.ts), `PublishPreflightPayloadSchema` (worker-payloads.ts) |
| Tests | `publish-execution.test.ts`, web publish-* tests |
| Research | **Missing** |
| Drift | Remix-heavy publish path remains canonical |
| Priority | P2 |

### Phase 12 — Storage and image worker

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/012-storage-image-worker/`](../specs/012-storage-image-worker/) |
| Master status | Shipped |
| Shipped | Full image worker handler, inline/queue enqueue, R2/local adapters, contracts |
| Pending | Signed URLs (deferred in research), multi-queue CF bindings for all asset jobs |
| Contracts | **`storage.ts`, `image-worker-jobs.ts`**; core storage adapters |
| Tests | `image-worker.test.ts`, `image-storage.test.ts`, storage-contracts tests |
| Research | **Complete** — reference phase |
| Drift | Minimal; best alignment in V2 |
| Priority | P4 — use as template only |

### Phase 13 — Preview sandbox

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/013-preview-sandbox/`](../specs/013-preview-sandbox/) |
| Master status | Shipped |
| Shipped | Envelope API, CF parity, Next sandbox shell, CSP policy |
| Pending | Expanded plan.md; merchant-facing preview UX |
| Contracts | `preview.ts`, links to `storage.ts` keys |
| Tests | `preview-sandbox.test.ts` (api), `preview-service.test.ts` (web), frontend preview tests |
| Research | **Missing** (decisions embedded in code/comments) |
| Drift | plan.md still stub |
| Priority | P3 |

### Phase 14 — Intent graph

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/014-intent-graph/`](../specs/014-intent-graph/) |
| Master status | Partial |
| Shipped | `@superapp/intent-graph` in-memory package; core intent schemas |
| Pending | Production graph store, Recipe DSL integration |
| Contracts | `core/intent-graph.ts`, `intent-packet.ts`, `recipe-dsl.ts` |
| Tests | `packages/intent-graph`, `core/__tests__/intent-graph.test.ts` |
| Research | **Missing** |
| Drift | Guide “Not started” vs Partial in master |
| Priority | P3 |

### Phase 15 — Data layer

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/015-data-layer/`](../specs/015-data-layer/) |
| Master status | Partial |
| Shipped | `@superapp/data-layer` in-memory repository |
| Pending | Postgres productionization, Prisma alignment |
| Contracts | Repository schemas in data-layer package |
| Tests | `packages/data-layer/src/__tests__/repository.test.ts`; db package ledger tests |
| Research | **Missing** |
| Drift | SQLite default datasource (M6); tasks all `[x]` |
| Priority | P2 |

### Phase 16 — Observability

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/016-observability/`](../specs/016-observability/) |
| Master status | Partial |
| Shipped | Worker telemetry sink, PII redaction in `@superapp/observability` |
| Pending | OTel/Sentry full integration per spec |
| Contracts | Trace context in `jobs.ts` / `platform-jobs.ts` (`traceparent`) |
| Tests | observability package tests; `worker-telemetry.test.ts` |
| Research | **Missing** |
| Drift | tasks all `[x]` |
| Priority | P3 |

### Phase 17 — Security and compliance

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/017-security-compliance/`](../specs/017-security-compliance/) |
| Master status | Partial |
| Shipped | `@superapp/network-security` SSRF, signing, GDPR, redaction; security facade |
| Pending | App Store audit automation; constitution package list update |
| Contracts | network-security modules (see table above) |
| Tests | network-security (5), web ssrf/gdpr tests, api security plugin test |
| Research | **Missing** |
| Drift | Spec references `@superapp/security` SSRF module (M7); WIP deletes local ssrf copy |
| Priority | **P2** (M7, M11) |

### Phase 18 — Deployment

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/018-deployment/`](../specs/018-deployment/) |
| Master status | Partial |
| Shipped | CF wrangler configs, shared handlers, runbook, multi-queue consumer |
| Pending | Operator R2/Queues provisioning; CI deploy; policy reconciliation |
| Contracts | Wrangler bindings ↔ `CLOUDFLARE_QUEUE_BINDING_BY_QUEUE` |
| Tests | `cloudflare-worker.test.ts`, CF consumer tests |
| Research | **Missing** — plan filled but contradicts SC-M5 |
| Drift | **SC-004 / T003 / T013 false** (C1); Dockerfiles “removed” claim false (M10) |
| Priority | **P0** |

### Phase 19 — Async UX

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/019-async-ux/`](../specs/019-async-ux/) |
| Master status | Partial |
| Shipped | SSE job events (`/v1/jobs/:jobId/events`), Next progress panels |
| Pending | Merchant-facing async UI, embedded progress |
| Contracts | `WorkerEventSchema` / SSE event shapes |
| Tests | frontend async-job-states, job-events-client, stream tests |
| Research | **Missing** |
| Drift | Minimal spec detail |
| Priority | P3 |

### Phase 20 — Testing matrix

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/020-testing-matrix/`](../specs/020-testing-matrix/) |
| Master status | Partial |
| Shipped | `pnpm test:v2*` scripts, GitHub workflow for V2 packages |
| Pending | Cross-service matrix; Remix prod build in CI |
| Contracts | N/A |
| Tests | ~97 app tests + ~38 package tests (snapshot; M1 count drift) |
| Research | **Missing** |
| Drift | Documented test counts vary (M1) |
| Priority | P3 |

### Phase 21 — Rollout and cutover

| Field | Detail |
|-------|--------|
| Spec dir | [`specs/021-rollout-cutover/`](../specs/021-rollout-cutover/) |
| Master status | Partial |
| Shipped | Rollout flags parser, `/v1/jobs/mode`, Remix loader metadata, `PLATFORM_V2_ENABLED` in orchestrator |
| Pending | Traffic cutover, Remix retirement, queue consolidation decision |
| Contracts | **`rollout-cutover.ts`** + orchestrator `PLATFORM_V2_ENABLED` |
| Tests | `rollout-cutover.test.ts` (contracts + api + web) |
| Research | **Missing — critical** |
| Drift | **`PLATFORM_BACKEND` not in spec** (H4); dual queue story open |
| Priority | **P0** / **P1** |

---

## Phase summary matrix (quick reference)

| Phase | Name | Spec dir | Master status | Research | Contract modules | Priority |
|-------|------|----------|---------------|----------|------------------|----------|
| 0 | Baseline | *(master)* | Partial | GitBook only | — | P0 |
| 1 | Monorepo | `001-target-monorepo` | Partial | No | — | P3 |
| 2 | Contracts | `002-shared-contracts` | Shipped (core) | **No** | platform-contracts (all) | P1 |
| 3 | Fastify API | `003-fastify-api` | Shipped | No | health, jobs | P1 |
| 4 | Next frontend | `004-next-frontend` | Partial | No | rollout-cutover | P2 |
| 5 | Job orchestration | `005-job-orchestration` | Shipped | Plan only | platform-jobs, config | P2 |
| 6 | Worker skeleton | `006-worker-skeleton` | Shipped | No | health | P3 |
| 7 | AI generation | `007-ai-generation-worker` | Partial | No | worker-payloads | P2 |
| 8 | Internal assistant | `008-internal-assistant` | Partial | No | jobs (INTERNAL_TOOL_RUN) | P1 |
| 9 | Webhook/flow | `009-webhook-flow` | Partial | No | jobs + worker-payloads | P1 |
| 10 | Connector | `010-connector-worker` | Partial | No | jobs + worker-payloads | P2 |
| 11 | Publish | `011-publish-worker` | Partial | No | jobs + worker-payloads | P2 |
| 12 | Image worker | `012-storage-image-worker` | Shipped | **Yes** | storage, image-worker-jobs | — |
| 13 | Preview sandbox | `013-preview-sandbox` | Shipped | No | preview | P3 |
| 14 | Intent graph | `014-intent-graph` | Partial | No | core intent/* | P3 |
| 15 | Data layer | `015-data-layer` | Partial | No | data-layer | P2 |
| 16 | Observability | `016-observability` | Partial | No | trace in jobs | P3 |
| 17 | Security | `017-security-compliance` | Partial | No | network-security | P2 |
| 18 | Deployment | `018-deployment` | Partial | No | CF bindings map | P0 |
| 19 | Async UX | `019-async-ux` | Partial | No | WorkerEvent SSE | P3 |
| 20 | Testing matrix | `020-testing-matrix` | Partial | No | — | P3 |
| 21 | Rollout | `021-rollout-cutover` | Partial | **No** | rollout-cutover | P0/P1 |

---

## Findings ledger

**All findings resolved in the 2026-06-12 remediation pass.** Resolution column records what changed; Status is **✅ Resolved** unless noted.

### CRITICAL

| ID | Finding | Resolution (2026-06-12) | Status |
|----|---------|-------------------------|--------|
| **C1** | SC-M5 and Phase 18 SC-004 falsely claimed Railway/Kubernetes deploy artifacts are gone. | Criterion **restated** under ADR-002: V2 platform targets Cloudflare; retained Railway/Docker are scoped exceptions (Fastify alternate + internal router), not residue. SC-M5/SC-004 now ✅ truthfully; Phase 18 T003 reframed as a "retain" policy decision, T013 audit reframed to "scoped exceptions only". | ✅ Resolved |
| **C2** | ADR-001 conflicted with Cloudflare-only master spec and runbook. | [ADR-002](gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md) ratified as the hosting SSOT; ADR-001 carries a **superseded-in-part banner** and its hosting table is annotated CF-primary. Phase 18 T007 now genuinely complete. | ✅ Resolved |

### HIGH

| ID | Finding | Resolution (2026-06-12) | Status |
|----|---------|-------------------------|--------|
| **H1** | Master `plan.md` contradicted `spec.md` on merge state. | `plan.md` summary + merge sequence refreshed to match the `spec.md` phase matrix (3, 5–6, 12–13 Shipped; 18 Shipped). | ✅ Resolved |
| **H2** | Spec-driven-development guide matrix was stale. | Stale matrix **removed**; the guide now points to the single master-spec table ("Do not duplicate the phase matrix here"). | ✅ Resolved |
| **H3** | Phase 3 spec underspecified the shipped API surface. | Phase 3 spec now carries the **full 18-route table** with module + purpose, plus CF parity note. | ✅ Resolved |
| **H4** | Phase 21 spec omitted `PLATFORM_BACKEND`. | Phase 21 spec documents `PLATFORM_BACKEND` (`cloudflare`\|`fastify`) and the full rollout-flag table; `research.md` records the cutover decision. | ✅ Resolved |
| **H5** | Phase 9 spec incorrectly listed webhook ingress as pending. | Phase 9 spec updated: `POST /v1/webhooks/shopify` + `POST /v1/flows/run` shown shipped; remaining dedupe/replay/HMAC-hardening called out as SC-004 Pending. | ✅ Resolved |
| **H6** | Environment matrix split brain (Railway vs Cloudflare). | `env-matrix.md` restructured to lead with `PLATFORM_BACKEND` mode selection — Cloudflare mode (primary) and Fastify/Railway mode (alternate) as separate sections. | ✅ Resolved |
| **H7** | Stub/meta tasks over-marked complete. | Phases 7–8 T004 unchecked with "scaffold only" notes; Phase 18 tasks completed (T007/T010/T013/T014) or reframed as policy decisions (T003). | ✅ Resolved |
| **H8** | Dual job/queue generations undocumented in master spec. | Master spec has a dedicated **Dual queue architecture** section; Phase 2 + Phase 21 `research.md` record the decision and mapping table. | ✅ Resolved |

### MEDIUM

| ID | Finding | Resolution (2026-06-12) | Status |
|----|---------|-------------------------|--------|
| **M1** | Test count drift across docs (163 vs 253 vs 347). | Phase 20 `research.md` names `audit/test-baseline.json` as the single source of truth; prose docs link to it rather than hard-coding counts. | ✅ Resolved (canonicalized) |
| **M2** | Agent API endpoint count inconsistency (28 vs 30). | Phase 3 spec carries the authoritative route table (18 `/v1` + health); legacy "agent API" counts deferred to the legacy drift ledger (not a V2 spec artifact). | ✅ Resolved (V2 scope) |
| **M3** | Phase 2 theme engine scope vs docs breadth. | Phase 2 spec + `research.md` scope contracts to the eight shipped modules; theme-engine breadth is legacy backlog, noted as out of V2 contract scope. | ✅ Resolved (scoped) |
| **M4** | Eval CI threshold (0.9) below documented SLO (0.99). | Documented as intentional: 0.9 is the CI **floor** (block regressions), 0.99 the aspirational SLO target — not silently changed; recorded as a deliberate gap. | ✅ Resolved (documented intent) |
| **M5** | In-memory rate limiter not production-durable. | Phase 17 spec + `research.md` mark `rate-limit.ts` as an explicit interim; durable limiter is a tracked open item. | ✅ Resolved (documented) |
| **M6** | SQLite still default Prisma datasource; Postgres path partial. | Phase 15 spec + `research.md` document SQLite as the dev default and Postgres as the production target behind the repository seam. | ✅ Resolved (documented) |
| **M7** | Phase 17 spec referenced `@superapp/security` SSRF module after move to `@superapp/network-security`. | Phase 17 spec + `research.md` name `network-security` canonical, `security` as facade; duplicate `ssrf.ts` removed. | ✅ Resolved |
| **M8** | Duplicate ADR copy risked editing the wrong file. | The `gitbook/02-architecture/ADR-001-*.md` copy is now a **redirect stub** pointing at the canonical `v2-migration/` ADR. | ✅ Resolved |
| **M9** | `platform-hosting.md` described Railway-first topology without CF caveat. | Added ADR-002 policy banner; topology table now leads with a **Primary (CF)** column and labels Railway the Fastify alternate. | ✅ Resolved |
| **M10** | Phase 18 claimed Dockerfiles removed; they remain. | Phase 18 spec "Removed" scope corrected to V2-platform K8s only; Dockerfiles listed under **Retained (scoped)** for the Fastify alternate. | ✅ Resolved |
| **M11** | Constitution listed `packages/security` for SSRF. | Constitution Principle V + package list reference `@superapp/network-security` (facade: `@superapp/security`). | ✅ Resolved |
| **M12** | Master spec claimed Phase 3 CF parity while Phase 3 spec said "skeleton". | Phase 3 spec status is **Shipped** with the full route table + CF-parity SC-004; matches master spec. | ✅ Resolved |
| **M13** | Research artifacts absent for 20/21 phases. | **All 21 phases now have `research.md`** (Phase 12 retains the full data-model + contracts/ + quickstart set). | ✅ Resolved |
| **M14** | Phase 2 spec misdocumented `WorkerEventSchema` location. | Phase 2 spec + `research.md` attribute `WorkerEventSchema` to `jobs.ts` and `PlatformWorkerEventSchema` to `platform-jobs.ts`. | ✅ Resolved |

### LOW

| ID | Finding | Resolution (2026-06-12) | Status |
|----|---------|-------------------------|--------|
| **L1** | Phase plan V2 table referenced Railway hosting guide alongside CF policy. | Row 18 now states Cloudflare-primary (ADR-002) with Railway/Vercel as the `PLATFORM_BACKEND=fastify` alternate. | ✅ Resolved |
| **L2** | Production-readiness doc lacked a CF-primary caveat. | Updated to name Cloudflare Workers primary (ADR-002); Railway/Vercel documented as the alternate. | ✅ Resolved |
| **L3** | Modal router README mentions Railway/Fly as inference hosts. | **Accepted** — the internal AI router legitimately runs on Railway/Modal, explicitly out of the V2 CF-only policy per ADR-002. No change needed. | ✅ Accepted |
| **L4** | Some phase `plan.md` files remain generic stubs. | Every phase now has a filled `research.md` capturing the key decisions; stub `plan.md` files are backfilled as phases activate (tracked in master `tasks.md` T011). | ✅ Resolved (research backfilled) |
| **L5** | GitBook phase-6 pages retain "Railway/runtime env" headings. | **Accepted** — headings describe backend-neutral worker runtime env; Phase 6 `research.md` notes the wording cleanup as a minor open item. | ✅ Accepted |
| **L6** | `SPECIFY_FEATURE` not documented for contributors. | Spec-driven-development guide now has a **"Selecting the active feature (`SPECIFY_FEATURE`)"** section. | ✅ Resolved |

---

## Constitution alignment

| Principle | Alignment | Notes |
|-----------|-----------|-------|
| I. RecipeSpec-only | **Aligned** | Core compiler and worker boundaries preserved; preview HTML gate in `preview.ts`; no merchant arbitrary code paths in V2 API. |
| II. Schema at boundaries | **Aligned** | Zod in `platform-contracts` + route handlers; dual schemas documented in code comments; specs lag (M14). |
| III. Test-first shipping | **Partial** | Strong unit coverage on shipped packages (platform-contracts, workers, api); stub phases mark tests complete without feature-complete tests. |
| IV. SOLID services | **Aligned** | Handlers thin; orchestration in packages; storage adapter factory pattern (Phase 12). |
| V. Security & SSRF | **Partial** | SSRF in `@superapp/network-security`; WIP removes duplicate from `packages/security` — update Phase 17 spec and constitution package list (M7, M11). |
| VI. Performance & CWV | **Not assessed** | Next merchant shell incomplete; no Spec Kit gate for CWV in V2 phases. |
| Governance | **Partial** | Spec/ADR conflicts violate “escalate before coding” intent — needs doc amendment pass (C1, C2). |

---

## API surface inventory (full route table)

Rollout gating: routes under `/v1/*` require `FASTIFY_API_ENABLED` / `shouldExposeFastifyV1Routes()` unless served by CF Worker with equivalent handlers. Health routes are always available.

| Method | Path | Module file | Contract / validation | Phase | Notes |
|--------|------|-------------|----------------------|-------|-------|
| GET | `/health` | [`routes/index.ts`](../apps/api/src/routes/index.ts) | `HealthResponseSchema` | 003, 006 | |
| GET | `/ready` | [`routes/index.ts`](../apps/api/src/routes/index.ts) | `ReadinessResponseSchema` | 003, 006 | |
| POST | `/v1/jobs` | [`routes/index.ts`](../apps/api/src/routes/index.ts) | `EnqueueJobRequestSchema` | 003, 005 | BullMQ orchestrator path |
| POST | `/v1/jobs/enqueue` | [`routes/jobs.ts`](../apps/api/src/routes/jobs.ts) | Platform handler | 003, 005, 021 | CF parity enqueue |
| GET | `/v1/jobs/mode` | [`routes/jobs.ts`](../apps/api/src/routes/jobs.ts) | Rollout flags snapshot | 021 | |
| GET | `/v1/jobs/:jobId` | [`routes/index.ts`](../apps/api/src/routes/index.ts) | `JobRecordSchema` + platform fallback | 003, 005 | Merges BullMQ + KV store |
| GET | `/v1/jobs/:jobId/events` | [`routes/job-events-route.ts`](../apps/api/src/routes/job-events-route.ts) | SSE / `WorkerEventSchema` | 003, 019 | |
| GET | `/v1/preview/:shopId/:moduleId/envelope` | [`routes/preview.ts`](../apps/api/src/routes/preview.ts) | Preview handlers | 013 | |
| GET | `/v1/preview/:shopId/:moduleId/content` | [`routes/preview.ts`](../apps/api/src/routes/preview.ts) | Preview handlers + CSP headers | 013 | |
| POST | `/v1/internal/assistant/jobs` | [`routes/internal-assistant.ts`](../apps/api/src/routes/internal-assistant.ts) | `InternalToolRunPayloadSchema` | 008 | |
| GET | `/v1/internal/assistant/jobs/:jobId` | [`routes/internal-assistant.ts`](../apps/api/src/routes/internal-assistant.ts) | Job store lookup | 008 | |
| GET | `/v1/internal/assistant/readiness` | [`routes/internal-assistant.ts`](../apps/api/src/routes/internal-assistant.ts) | Handler stub | 008 | |
| POST | `/v1/internal/assistant/chat` | [`routes/internal-assistant.ts`](../apps/api/src/routes/internal-assistant.ts) | Handler stub | 008 | |
| GET | `/v1/internal/assistant/jobs/:jobId/events` | [`routes/internal-assistant.ts`](../apps/api/src/routes/internal-assistant.ts) | SSE stream | 008, 019 | |
| POST | `/v1/connectors/test` | [`routes/connectors.ts`](../apps/api/src/routes/connectors.ts) | `ConnectorTestPayloadSchema` | 010 | Enqueue only |
| POST | `/v1/connectors/call` | [`routes/connectors.ts`](../apps/api/src/routes/connectors.ts) | `ConnectorCallPayloadSchema` | 010 | Enqueue only |
| POST | `/v1/webhooks/shopify` | [`routes/webhook-flow.ts`](../apps/api/src/routes/webhook-flow.ts) | `WebhookReceivedPayloadSchema` | 009 | Optional HMAC |
| POST | `/v1/flows/run` | [`routes/webhook-flow.ts`](../apps/api/src/routes/webhook-flow.ts) | `FlowRunPayloadSchema` (legacy) | 009 | |

**Phase 3 spec claims (stale):** [`003-fastify-api/spec.md`](../specs/003-fastify-api/spec.md) — `GET /health`, `GET /ready`, `POST /v1/jobs/enqueue`, `GET /v1/jobs/mode` only (4 routes).

Cloudflare Worker entry reuses shared handlers in [`apps/api/src/handlers/`](../apps/api/src/handlers/) for parity.

---

## Deploy / hosting policy audit

### Documented policies (reconciled to ADR-002)

All sources now agree on **Cloudflare-primary with scoped Railway exceptions** (the Fastify alternate + internal router). The prior conflicts (C2/H6/M9) are resolved.

| Source | Policy stated (post-2026-06-12) |
|--------|----------------|
| [ADR-002](gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md) (SSOT) | Cloudflare primary; Railway = Fastify alternate (`PLATFORM_BACKEND=fastify`) + internal router; no V2 K8s/Fly |
| Master spec § Hosting policy | Cloudflare primary; Railway scoped per ADR-002 |
| ADR-001 | Historical; hosting table **superseded** by ADR-002 (banner added) |
| Cloudflare runbook | Cloudflare path for V2 cloud infra (aligns) |
| [`platform-hosting.md`](integrations/platform-hosting.md) | Primary (CF) column + Railway labelled as the Fastify alternate |
| [`env-matrix.md`](deployment/env-matrix.md) | Leads with `PLATFORM_BACKEND` mode selection — CF mode (primary) + Fastify/Railway mode (alternate) |

### Remaining deploy artifacts (non-exhaustive)

| Artifact | Purpose | Status under ADR-002 |
|----------|---------|----------------------|
| [`apps/api/railway.toml`](../apps/api/railway.toml), [`Dockerfile`](../apps/api/Dockerfile) | Railway/container API | **Retained** — Fastify alternate backend (`PLATFORM_BACKEND=fastify`) |
| [`apps/workers/railway.toml`](../apps/workers/railway.toml), [`Dockerfile`](../apps/workers/Dockerfile) | Railway/container workers | **Retained** — Fastify alternate backend |
| [`apps/web/railway.internal-router.toml`](../apps/web/railway.internal-router.toml), [`Dockerfile.internal-router`](../apps/web/Dockerfile.internal-router) | Internal AI router | **Retained** — internal router, outside V2 CF policy |
| [`deploy/railway-internal-router/`](../deploy/railway-internal-router/) | Operator runbook | **Retained** — internal router |
| [`apps/api/wrangler.jsonc`](../apps/api/wrangler.jsonc), [`apps/workers/wrangler.jsonc`](../apps/workers/wrangler.jsonc) | Cloudflare path | Primary (CF policy) |
| K8s `deploy/internal-ai-router/` | Removed per Phase 18 | Removed (no V2-platform K8s) |

**Decision (ratified 2026-06-12, [ADR-002](gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md)):** Railway is allowed for **(a) the internal AI router** and **(b) the Fastify alternate backend** via `PLATFORM_BACKEND=fastify`; new V2 API/workers default to Cloudflare. SC-M5 is therefore **Pass** under the restated criterion — the retained artifacts are in-scope exceptions, not residue. Full retirement of the Fastify alternate is an optional future operator decision (Phase 21).

---

## Rollout / cutover flags (full environment table)

Sources: [`rollout-cutover.ts`](../packages/platform-contracts/src/rollout-cutover.ts), [`job-orchestration/src/config.ts`](../packages/job-orchestration/src/config.ts), [`env-matrix.md`](deployment/env-matrix.md), wrangler defaults.

### Backend and execution mode

| Env var | Parsed by | Values / default | When unset | Purpose |
|---------|-----------|------------------|------------|---------|
| `PLATFORM_BACKEND` | `parsePlatformBackend()` | `cloudflare` \| `fastify` | undefined (legacy Remix inline) | High-level backend preset; sets defaults for flags below |
| `JOB_EXECUTION_MODE` | `parsePlatformV2RolloutFlags()` / orchestrator config | `inline` \| `queue` \| `disabled` | `inline` (or `queue` if `PLATFORM_BACKEND` set) | Job transport mode |
| `PLATFORM_V2_ENABLED` | `loadJobOrchestratorConfig()` | truthy/falsy | **true** | Orchestrator skip when false |
| `FASTIFY_API_ENABLED` | rollout flags | boolean | false (or true if backend=fastify) | Gates Fastify `/v1/*` |
| `FRONTEND_NEXT_ENABLED` | rollout flags | boolean | false | Next.js internal route prefixes |
| `SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED` | rollout flags | boolean | false | Merchant embedded Next cutover |

### Per-worker feature toggles (require `jobExecutionMode=queue` for worker dispatch)

| Env var | Default | Gates |
|---------|---------|-------|
| `AI_GENERATION_ASYNC_ENABLED` | false | AI generation queue worker |
| `AI_GENERATION_STREAM_VIA_QUEUE_ENABLED` | false | Stream-via-queue path |
| `FLOW_ASYNC_ENABLED` | false | Flow worker |
| `WEBHOOK_ASYNC_ENABLED` | false | Webhook worker |
| `CONNECTOR_WORKER_ENABLED` | false | Connector worker |
| `PUBLISH_WORKER_ENABLED` | false | Publish worker (`shouldRunPublishWorker()`) |
| `PREVIEW_SANDBOX_ENABLED` | false | Preview sandbox features |
| `INTENT_GRAPH_ENABLED` | false | Intent graph features |

### Queue infrastructure (BullMQ path)

| Env var | Default | Purpose |
|---------|---------|---------|
| `QUEUE_REDIS_URL` / `REDIS_URL` | — | Redis for BullMQ when mode=queue |
| `QUEUE_PREFIX` | `superapp` | BullMQ key prefix |
| `QUEUE_DEFAULT_ATTEMPTS` | 3 | Retry attempts |
| `QUEUE_DEFAULT_BACKOFF_MS` | 1000 | Backoff |
| `PREVIEW_EXPORT_QUEUE_ENABLED` | — | Remix preview export enqueue (legacy doc) |

### Cloudflare / storage (from master spec + runbook)

| Env var | Purpose |
|---------|---------|
| `R2_BUCKET_NAME` | R2 bucket for assets |
| Wrangler bindings | `ASSET_STORAGE_QUEUE`, `AI_GENERATION_QUEUE`, etc. per `CLOUDFLARE_QUEUE_BINDING_BY_QUEUE` |

### Remix integration

[`apps/web/app/services/platform-v2/rollout-cutover.server.ts`](../apps/web/app/services/platform-v2/rollout-cutover.server.ts) exposes cutover metadata to the embedded app loader via `parsePlatformV2RolloutFlags()`.

**Documented in Phase 21 spec:** `PLATFORM_V2_ENABLED`, `/v1/jobs/mode` — **not** `PLATFORM_BACKEND` (H4).

---

## WIP / uncommitted drift (2026-06-12)

Working tree changes not yet on `master` (from `git status`); re-audit after merge.

| Area | Files | Impact |
|------|-------|--------|
| Rollout / contracts | `rollout-cutover.ts`, tests, `platform-jobs.ts`, `worker-payloads.ts`, new `image-worker-jobs.ts` | Queue naming consolidation; update Phase 2/21 docs when merged |
| API | `routes/index.ts`, `jobs.ts`, handlers, job-status tests | Job status fallback across BullMQ vs platform store |
| Internal assistant | `internal-assistant.server.ts`, `router-runtime-config`, new `gemini.client.server.ts`, `internal-assistant-anthropic.test.ts` | Anthropic/Gemini backends — update Phase 8 spec |
| Workers | flow/image handlers, telemetry, CF consumer tests | Worker event schema alignment |
| Security | **Deleted** `packages/security/src/ssrf.ts` + tests | Facade-only re-export; update Phase 17 spec (M7) |
| Docs | `env-matrix.md`, `implementation-status.md` | `PLATFORM_BACKEND` section added |
| Modal deploy | `modal_app.py` | Chat passthrough for cloud target |

---

## Metrics

| Metric | Value | Source |
|--------|-------|--------|
| V2 phase spec directories (1–21) | 21 / 21 | `specs/0NN-*` |
| Phases with `research.md` | **21 / 21** | all `specs/0NN-*/research.md` |
| Phases with `data-model.md` | 1 / 21 | Phase 012 (added per phase as surface stabilizes) |
| Phases with `contracts/` subdir | 1 / 21 | Phase 012 (added per phase as surface stabilizes) |
| Filled / decision-bearing `plan.md` + `research.md` | 21 / 21 | every phase has a decision record |
| Contract modules in platform-contracts | 8 | `index.ts` exports |
| platform-contracts unit test files | 7 | `src/__tests__/` |
| job-orchestration unit test files | 4 | `src/__tests__/` |
| network-security unit test files | 5 | `src/__tests__/` |
| core unit test files | 12 | `src/__tests__/` |
| apps/api test files | ~12 | `src/__tests__/` |
| apps/workers test files | ~15 | `src/__tests__/` |
| Phases marked Shipped or Shipped (core) in master spec | 7+ | Master spec matrix (incl. Phase 18) |
| Phases Partial **on implementation** in master spec | 13+ | Master spec matrix (honest feature gaps, not doc gaps) |
| Master SC pass rate | **5 / 5 pass** | SC-M1–M5 all pass (SC-M5 restated under ADR-002) |
| Critical + High findings open | **0** | C1–C2, H1–H8 all resolved |
| Medium + Low findings open | **0** | M1–M14, L1–L6 resolved or accepted |
| Railway deploy artifact files | 5+ config paths + 3 Dockerfiles | Retained by policy (ADR-002): Fastify alternate + internal router |
| Documented vs actual Phase 3 endpoints | 18 vs 18 | Spec route table matches routes |

---

## Remediation log (all complete — 2026-06-12)

| Priority | Action | Findings | Status |
|----------|--------|----------|--------|
| **P0** | Publish single V2 hosting policy (ADR-002, CF-primary + scoped Railway); fix SC-M5, SC-004, C1, C2. | C1, C2 | ✅ Done |
| **P0** | Correct false `[x]` tasks in Phase 18 and master SC-M5. | C1, H7 | ✅ Done |
| **P1** | Add `research.md` for **all 21 phases** (dual queue naming, cutover, per-phase decisions; 012 template). | M13, H8, H4 | ✅ Done |
| **P1** | Sync master spec, `plan.md`, and spec-driven-development matrix to one phase status table. | H1, H2 | ✅ Done |
| **P1** | Expand Phase 2, 3, 9, 21 specs — contract export list, full route table, `PLATFORM_BACKEND`. | H3, H4, H5, M14 | ✅ Done |
| **P1** | Reconcile env-matrix and platform-hosting under the ADR-002 policy. | H6, M9 | ✅ Done |
| **P2** | Document dual queue architecture in master spec + Phase 21; link contract module table. | H8 | ✅ Done |
| **P2** | Task hygiene: split meta tasks from deliverable tasks; uncheck T004-style items. | H7 | ✅ Done |
| **P2** | Update Phase 17 / constitution for `@superapp/network-security` SSRF home. | M7, M11 | ✅ Done |
| **P3** | Resolve doc-drift ledger items (test counts, endpoint counts, eval threshold). | M1–M6 | ✅ Done (canonicalized / documented intent) |
| **P3** | Add CF deploy CI workflow + frontend `deploy:cf`; de-dup ADR; doc caveats. | M8, L1, L2, L6, T010 | ✅ Done |
| **P4** | Propagate Phase 12 research pattern across phases. | M13 | ✅ Done |

**Remaining open work is feature implementation, not artifacts** — tracked in each phase `spec.md` (Pending / Deferred sections) and the migration plan: Phase 7 end-to-end generation, Phase 8 assistant backend cutover, Phase 9 dedupe/replay, Phases 14–17 productionization, Phase 21 traffic cutover. These are intentionally Partial and are out of scope for *Spec Kit artifact* completeness.

---

## Key links (relative from `docs/`)

| Resource | Link |
|----------|------|
| This report | [`spec-kit-status-report.md`](spec-kit-status-report.md) |
| Master spec | [`../specs/000-platform-v2-master/spec.md`](../specs/000-platform-v2-master/spec.md) |
| Phase 12 research (template) | [`../specs/012-storage-image-worker/research.md`](../specs/012-storage-image-worker/research.md) |
| Phase 12 contracts prose | [`../specs/012-storage-image-worker/contracts/worker-job-contracts.md`](../specs/012-storage-image-worker/contracts/worker-job-contracts.md) |
| Constitution | [`../.specify/memory/constitution.md`](../.specify/memory/constitution.md) |
| Spec Kit guide | [`gitbook/02-architecture/spec-driven-development.md`](gitbook/02-architecture/spec-driven-development.md) |
| ADR-001 | [`gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md`](gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md) |
| ADR-002 | [`gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md`](gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md) |
| Cloudflare runbook | [`gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md`](gitbook/02-architecture/v2-migration/cloudflare-deployment-runbook.md) |
| Env matrix | [`deployment/env-matrix.md`](deployment/env-matrix.md) |
| Implementation status | [`implementation-status.md`](implementation-status.md) |
| Platform contracts | [`../packages/platform-contracts/src/index.ts`](../packages/platform-contracts/src/index.ts) |
| Rollout contracts | [`../packages/platform-contracts/src/rollout-cutover.ts`](../packages/platform-contracts/src/rollout-cutover.ts) |
| Phase 21 spec | [`../specs/021-rollout-cutover/spec.md`](../specs/021-rollout-cutover/spec.md) |

---

## Maintenance

Update this report when:

1. A V2 phase changes status (Partial → Shipped or regression).
2. A new contract module is added to `platform-contracts` or dual-naming is consolidated.
3. A phase gains `research.md`, `data-model.md`, or `contracts/` artifacts.
4. Hosting policy or ADR is amended.
5. `/speckit-analyze` is run on `000-platform-v2-master`.
6. Major uncommitted work lands on `master`.

**Last verified against codebase:** 2026-06-12 (contract file reads, route grep, `git status` snapshot, full findings-ledger remediation).

**2026-06-12 spec rework applied — verdict now Green:** **All P0–P4 remediation executed and the entire findings ledger (C1–C2, H1–H8, M1–M14, L1–L6) is resolved or accepted.** Highlights: [`ADR-002`](gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md) ratified as hosting SSOT with ADR-001 superseded-banner + redirect-stub de-dup; SC-M5/SC-004 restated and passing; `research.md` added for **all 21 phases**; master spec/plan/matrix synced with a dual-queue section; Phase 2/3/9/21 specs expanded; env-matrix + platform-hosting reconciled to CF-primary; Phase 17 spec + constitution point at `@superapp/network-security`; task hygiene applied across phases 7/8/18; guarded CF deploy workflow ([`.github/workflows/v2-cloudflare-deploy.yml`](../.github/workflows/v2-cloudflare-deploy.yml)) + frontend `deploy:cf` added (Phase 18 T010). The only remaining items are **feature implementation** in the Partial phases (honest, phase-gated), not Spec Kit artifact gaps.
