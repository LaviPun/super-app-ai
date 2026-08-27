# WS-C Async Generation & Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generation, hydration, and publish run as BullMQ jobs on the Railway worker instead of inside HTTP requests; every validated option is persisted server-side the moment it exists; a dropped connection means the client re-fetches state, never re-spends; every merchant request is measurable end-to-end (classified→optioned→hydrated→published on one correlationId) on an internal success-rate dashboard; hydrate output is hardened (structured output, truncation detection, fence-strip); provider pressure is managed (concurrency caps, retry-after, staggered fan-out); QA telemetry is aggregated with top render-fails promotable to blocking; and every terminal failure the merchant sees is a friendly, typed AppError.

**Architecture:** The generation pipeline currently inlined in `api.ai.create-module.stream.tsx` is extracted into `runGenerationPipeline` (hook-driven), consumed by both the legacy inline SSE route (dev fallback) and a new worker processor. The WS-A worker skeleton (`apps/web/scripts/worker.ts`) mounts BullMQ `Worker`s (pattern ported from V2 `apps/workers/src/worker-runtime.ts` **before** WS-I deletes the V2 apps) for the `ai-generation` and `publish` queues defined in `@superapp/platform-contracts` `PLATFORM_QUEUES`. Enqueue goes through the existing `@superapp/job-orchestration` BullMQ adapter with the Prisma `Job.id` as the BullMQ jobId. Options are persisted to a new `AiGenerationOption` table as they validate; the client enqueues via `POST /api/ai/generate-async` and polls `GET /api/ai/jobs/:jobId`. The funnel is assembled from `Job` rows joined on correlationId, with `Module.generationCorrelationId` carrying the chain from generation into hydrate/publish. `JOB_EXECUTION_MODE=queue` flips production async; `inline` keeps dev working without Redis.

**Tech Stack:** Remix (apps/web), Prisma (additive migration only), BullMQ 5 + ioredis (already in `@superapp/job-orchestration` / worker image), Vitest, Zod, vendored internal-admin page-kit (NOT Polaris — internal admin uses `~/components/admin/page-kit`).

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` — WS-C bullet (Phase 3), Decisions D1/D2/D10, Global constraints, Dependency edges, findings [AI-1..4], [UI-1], [AI-imp].

## Dependencies (plan header — read before executing)

- **Runs after WS-A (merged):** Redis + worker service exist on Railway; `apps/web/scripts/worker.ts` is the WS-A skeleton this plan fills; `apps/web/Dockerfile` already serves both services (worker start command `pnpm --filter web worker:start`).
- **Runs after WS-E merges:** the publish surface this plan puts on the worker is WS-E's — `PublishService.publish(spec, target, opts?)` returns `{ compiledJson?, preflight, ledger }` and throws `PublishPartialFailureError` (`failedOp`, `completed[]`) (`apps/web/app/services/publish/publish.service.ts` on `feat/ws-e-publish-integrity`, worktree `/Users/lavipun/Work/sa-wt-ws-e`). Do NOT resurrect progressive-publish — WS-E deleted it (E4). If WS-E has not merged when Task 9 starts, STOP and escalate.
- **Runs after WS-QF (merged):** the correlationId double-billing dedupe spine (`seedBillingStateForCorrelation`, `AiUsageService.hasBilledUnit`, client `withGenerationCorrelationId`) is the seam Tasks 5/8 build on.
- **Ordering with WS-I (D2):** Tasks 1–2 salvage the V2 patterns (`apps/workers/src/worker-runtime.ts`, `ai-generation.ts` processor shape, image-storage processor) into `apps/web` and sever `apps/web`'s dependency on `@superapp/workers`. WS-I must not delete `apps/api`/`apps/workers` until Task 2 and Task 17 are merged.
- **WS-F depends on this plan** (server-persisted drafts ride these jobs); keep the poll-route response shape stable once Task 6 lands.

## Global Constraints

- **BINDING build rule:** any task touching route files (or the import graph reachable from them) must run `pnpm --filter web build` before commit — client/server graph violations are invisible to typecheck/vitest.
- Prisma migrations are **additive only** (new tables, new nullable columns, new indexes). Never drop or rewrite existing columns.
- Quota/billing: billable unit = merchant request (fan-out = 1). No path introduced here may bill twice for one merchant click — BullMQ retries and client reconnects must claim through the correlationId dedupe seam.
- Dual job-queue naming rule (project memory): BullMQ-side payload schemas get **distinct names** (`WebAiGenerateJobPayloadSchema` etc.) — never reuse or shadow the V2 Cloudflare contracts (`AiGeneratePayloadSchema` in `packages/platform-contracts/src/jobs.ts`).
- Merchant UI: Polaris web components only; **internal admin uses the vendored page-kit** (`~/components/admin/page-kit`) — the funnel dashboard is an internal page and must NOT import Polaris.
- No silent failures (D8): worker job failures land as typed, human-readable `Job.error` payloads and typed client errors; never a bare `String(e)`.
- ~90s HTTP discipline remains good practice for the inline path; the async path has no request-time work beyond enqueue + poll.
- TDD, bite-sized tasks, frequent commits; `cd apps/web && npx vitest run <file>` for test steps; CI must stay green at every merge. Rebuild `packages/*` (`pnpm --filter "web^..." build`) whenever a workspace package is touched before running web tests (stale `dist/` masks src changes — WS-E carry-forward).
- All file paths repo-relative to `/Users/lavipun/Work/ai-shopify-superapp`.

## Verified ground truth (2026-08-24, `master@6af6df2` + WS-E worktree)

Facts every task relies on — re-verified against code, do not re-derive:

- **Inline generation:** `apps/web/app/routes/api.ai.create-module.stream.tsx` (475 lines) does auth → rate-limit → quota → classify (`classifyUserIntent` + `augmentWithCheapClassifier`) → intent packet → router → RAG (`extractRequirementSpec`/`searchSolutions`) → `ensureStoreAesthetic`/`loadStoreAesthetic` → `JobService.create/start` → SSE over `generateValidatedRecipeOptionsStream` with per-option `applyCompositionRules`/`applyStorePalette`/`applyStylePackTokens` → `rankOptions` → optional blueprint → optional judge-polish → `finalizeGenerationJob`. The batch route `api.ai.create-module.tsx` (306 lines) is the same pipeline non-streaming. Hydrate: `api.ai.hydrate-module.tsx` (131 lines) → `hydrateRecipeSpec` → `moduleVersion.update`.
- **LLM seam:** `apps/web/app/services/ai/llm.server.ts` — `GenerateHints { previousError?, maxTokens?, responseSchema? }` (line 85); `ConfiguredLlmClient.callProvider` (line 222) dispatches per provider kind; `FallbackLlmClient` (line 420); `generateValidatedRecipeOptionsStream` (line 1707, yields `RecipeOptionStreamEvent`, fans out all option tasks up front via `Promise` array at line ~1796); `hydrateRecipeSpec` (line 2739, `HYDRATE_TOKEN_BUDGET = 16000`, raw `JSON.parse(rawJson)` — **no fence-strip, no responseSchema**); billing seam `seedBillingStateForCorrelation` (line 811), `claimOptionBillableUnit` (765), `legacyRecipeOptionsBillableUnits` (843); `recordAiUsage` (2859) retries writes and accepts `correlationId`; hydrate failures currently bill `requestCount: 1` (line 2797).
- **HTTP layer:** `apps/web/app/services/ai/http/ai-http.server.ts` — default timeout 120s, exactly one 429 retry capped at 10s sleep, `parseRetryAfterMs` (line 158). No concurrency limiting anywhere. OpenAI client throws on truncation (`openai-responses.client.server.ts:135–148`); Anthropic client (`anthropic-messages.client.server.ts`) does **not** inspect `stop_reason` — truncated non-thinking output passes through silently.
- **Jobs:** `apps/web/app/services/jobs/job.service.ts` — `JobService.create/start/succeed/fail`, correlationId defaults from `getRequestContext()` (`~/services/observability/correlation.server.ts`, which exports `runWithRequestContext`). Prisma `Job` model at `apps/web/prisma/schema.prisma:324` (`status`, `attempts`, `payload/result/error` as String, `correlationId` indexed). `AiUsage` at :232 (`requestCount`, `correlationId` indexed). `Module` at :81 (`sourceJobId` exists). `AppSettings` singleton at :437.
- **Queue infra:** `packages/job-orchestration` — `loadJobOrchestratorConfig` (`JOB_EXECUTION_MODE` inline|queue|disabled, `QUEUE_REDIS_URL`||`REDIS_URL`, `QUEUE_PREFIX` default `superapp`, `defaultAttempts` 3), `createBullMqQueueAdapter` (`bullmq-queue.ts` — note: `enqueue` puts only `input.payload` in `queue.add`; **trace is NOT transmitted** unless embedded in the payload), `JobOrchestrator`. `packages/platform-contracts/src/platform-jobs.ts` — `PLATFORM_QUEUES` includes `'ai-generation'` and `'publish'`; `PLATFORM_JOB_QUEUE_BY_TYPE` maps `AI_GENERATE|AI_HYDRATE|AI_MODIFY → 'ai-generation'`, `PUBLISH → 'publish'`; `JobTraceSchema`, `JobEnvelopeSchema`.
- **V2 salvage sources (delete-slated, D2):** `apps/workers/src/worker-runtime.ts` (BullMQ `Worker` per queue, `WORKER_CONCURRENCY`, prefix, graceful `close()`); `apps/workers/src/ai-generation.ts` (**`StubAiGenerationAdapter` line 50** — the stub this plan removes; processor lifecycle shape); `apps/workers/src/main.ts` (signal handling); `apps/workers/src/image-storage.ts` + `image/image-worker.ts` + `storage/*` + `worker-events.ts` (self-contained: only `@superapp/platform-contracts` + node builtins) — **the one live apps/web import**: `apps/web/app/services/preview/preview-export.queue.server.ts:8` imports `createImageStorageProcessor` from `@superapp/workers`; `apps/web/package.json:55` declares the dep; `apps/web/Dockerfile` COPYs `apps/workers`.
- **Worker entry:** `apps/web/scripts/worker.ts` (WS-A skeleton: Redis ping + `/healthz` on `$PORT`, comment says "WS-C mounts real BullMQ Workers here"); started by `pnpm --filter web worker:start` (`tsx --tsconfig tsconfig.scripts.json`); `tsconfig.scripts.json` maps `~/* → ./app/*`, and scripts already import app services (`scripts/blueprint-plan-probe.ts:8`), so processors can live under `app/services/` and be imported by the worker.
- **Admin-less Shopify client:** `shopify.unauthenticated.admin(shopDomain)` (`apps/web/app/shopify.server.ts:43`, used by `internal.support.$ticketId.tsx:181`) — the worker's admin context for aesthetics/plan-tier/publish.
- **Client:** `apps/web/app/routes/generate._index.tsx` — `streamGenerate` (line 549) parses SSE, batch fallback at 643, saves chosen option via `POST /api/ai/create-module-from-recipe` (line 852); `app/utils/generation-outcome.ts` — `nextStepAfterStream`, `withGenerationCorrelationId`. `modules.$moduleId.tsx` hydrates via `hydrateFetcher` (line 392) expecting `{ ok }` / `{ error, message }`.
- **Errors:** `apps/web/app/services/errors/app-error.server.ts` — `AppError` (typed `ErrorCode`, `toPayload()`, `toResponse()`), `toErrorResponse`. The AI routes do NOT use it today (raw `json({ error: String(e) })`).
- **QA gates:** `runAllQaGates` (llm.server.ts:~1049) merges `runDesignQa` + `runRenderQa` + `runRichnessQa`; `OptionQaSummary` = `{ fails, warns, autofixes }` (counts only — issue ids are currently dropped by `qaCounts`); severity policy in `design-qa.server.ts` / `richness-qa.server.ts` (most render issues are `'warn'`).
- **Internal admin idioms:** vendored page-kit (`~/components/admin/page-kit`: `PageHead`, `StatTile`, `DataTable`, `Btn`, `FilterBar`, `useAdminCtx`…) — see `internal.jobs.tsx`; nav = `ADMIN_NAV` in `internal.tsx:90` (hash routes `#/admin/*`); `superappRoute` in `~/components/superapp/CommandPalette.tsx:13` maps `#/admin/x → /internal/x` generically, palette entries in the same file. Internal admin is LIGHT-ONLY.
- **Eval flywheel:** `apps/web/scripts/run-evals.ts` (stub-mode regression harness, `pnpm --filter web evals`) — used here as the pipeline-refactor regression gate, not modified.
- **Settings:** `SettingsService` (`app/services/settings/settings.service.ts`) maps the `AppSettings` singleton row field-by-field.

## Decisions of record for this plan

| # | Decision |
|---|----------|
| C1 | **Client transport for async jobs = polling, not SSE.** `POST /api/ai/generate-async` returns `{ jobId, correlationId }` immediately; `GET /api/ai/jobs/:jobId` returns a full snapshot (status, stage, options so far, ranking, typed error). Reconnect/reload = same GET — nothing re-runs, nothing re-bills [AI-3, AI-4, UI-1]. The SSE stream + batch routes remain as the `inline`-mode path (dev without Redis) and are retired by WS-F/WS-I after async is default (see Open Questions). |
| C2 | **One billing decision per generation job.** The worker is the single writer: BullMQ retries reuse the job's correlationId, so `seedBillingStateForCorrelation` guarantees at most one billed unit per merchant click. This closes WS-QF Finding 2c's residual two-leg race by construction (there is no second leg). |
| C3 | **Queue topology salvaged from V2, Cloudflare machinery not ported.** Queues `ai-generation` + `publish` (from `PLATFORM_QUEUES`), Prisma `Job.id` = BullMQ jobId, enqueue via the existing `createBullMqQueueAdapter`, worker mount = port of `worker-runtime.ts`. Because the BullMQ adapter transmits only the payload, the **trace rides inside the payload** (`payload.trace`, `JobTraceSchema`). |
| C4 | **Distinctly named web-side payload schemas** (`WebAiGenerateJobPayloadSchema`, `WebAiHydrateJobPayloadSchema`, `WebPublishJobPayloadSchema`) in `apps/web` — the V2 `AiGeneratePayloadSchema`/`PublishPayloadSchema` contracts are not reused (dual-queue naming rule). |
| C5 | **Sever `@superapp/workers` from apps/web** by porting the image-storage processor (its only live import) into `apps/web/app/services/assets/` — so WS-I can delete `apps/api` + `apps/workers` without breaking web. |
| C6 | **Worker admin context = `shopify.unauthenticated.admin(shopDomain)`**; every processor runs inside `runWithRequestContext({ correlationId, … })` so all downstream `Job`/`AiUsage`/`ErrorLog` writes inherit the trace without threading. |
| C7 | **Deadline budgets replace tunnel discipline**: `GenerateHints.deadlineAt` (epoch ms) → per-call HTTP timeout + retry-backoff budget. Job budgets: generation 150s, hydrate 90s, publish 120s (env-overridable). Inline mode passes a 55s deadline to keep the old ≤60s discipline. |
| C8 | **Hydrate billing**: failed hydrate attempts bill `requestCount: 0` (merchant got nothing — same principle WS-QF applied to generation); the successful attempt claims exactly one unit per hydrate job via an action-scoped dedupe key, so BullMQ retries never double-bill. |
| C9 | **QA promotion is data-driven ops config**: per-option QA issue ids are persisted; the internal funnel page aggregates them; ops promotes an issue id to blocking via `AppSettings.qaPromotedBlockingIssueIds` (audited) — promoted ids escalate `warn → fail` inside `runAllQaGates`, feeding the existing corrective-regeneration loop. No redeploy needed to promote/demote. |
| C10 | **Async publish ships flag-gated** (`PUBLISH_ASYNC_ENABLED`, default false). Generation + hydrate flip to queue mode at rollout; publish (seconds of Shopify API calls, no LLM) flips after the owner verifies the polling UX (Task 18). Sync publish keeps working either way. |

## File Structure (created / modified)

```
packages/job-orchestration/src/types.ts                      [M] EnqueueJobInput.opts (attempts/backoffMs) — additive
packages/job-orchestration/src/bullmq-queue.ts               [M] pass-through per-job opts
apps/web/prisma/schema.prisma                                [M] AiGenerationOption; Job.stage; Module.generationCorrelationId; AppSettings.qaPromotedBlockingIssueIds
apps/web/app/services/jobs/worker-runtime.server.ts          [C] V2 worker-runtime port (BullMQ Workers, graceful close)
apps/web/app/services/jobs/enqueue.server.ts                 [C] isAsyncJobsEnabled + enqueueWebJob (trace-in-payload)
apps/web/app/services/jobs/job-payloads.server.ts            [C] WebAiGenerate/WebAiHydrate/WebPublish payload schemas
apps/web/app/services/jobs/processors/ai-generation.processor.server.ts [C]
apps/web/app/services/jobs/processors/ai-hydrate.processor.server.ts    [C]
apps/web/app/services/jobs/processors/publish.processor.server.ts       [C]
apps/web/app/services/jobs/job.service.ts                    [M] setStage, failWithPayload, getForShop
apps/web/app/services/ai/generation-pipeline.server.ts       [C] runGenerationPipeline (extracted from stream route)
apps/web/app/services/ai/provider-concurrency.server.ts      [C] per-provider semaphore + stagger config
apps/web/app/services/ai/llm.server.ts                       [M] deadlineAt in hints; stagger; concurrency wrap; hydrate hardening; OptionQaSummary.issueIds; promoted-ids threading; hydrate billing dedupe
apps/web/app/services/ai/http/ai-http.server.ts              [M] deadline-aware timeout + retry-after budget
apps/web/app/services/ai/clients/anthropic-messages.client.server.ts [M] stop_reason max_tokens → TruncatedOutputError
apps/web/app/services/ai/clients/openai-responses.client.server.ts   [M] throw TruncatedOutputError (same class)
apps/web/app/services/ai/clients/truncation.server.ts        [C] TruncatedOutputError
apps/web/app/services/ai/tolerant-json.server.ts             [M] export stripCodeFences (single copy)
apps/web/app/services/ai/judge-polish.server.ts              [M] use shared stripCodeFences
apps/web/app/services/ai/template-delta.server.ts            [M] use shared stripCodeFences
apps/web/app/services/ai/hydrate-envelope-schema.server.ts   [C] getHydrateEnvelopeJsonSchema (zod-to-json-schema)
apps/web/app/services/assets/image-storage.server.ts         [C] ported from apps/workers (C5) + storage/, image-worker
apps/web/app/services/preview/preview-export.queue.server.ts [M] import ported processor
apps/web/app/services/observability/funnel.service.ts        [C] FunnelService.windowStats
apps/web/app/services/observability/qa-telemetry.service.ts  [C] topIssues + promoted-ids read/write
apps/web/app/services/observability/ai-usage.service.ts      [M] hasBilledUnit(correlationId, { action? })
apps/web/app/services/errors/app-error.server.ts             [M] +'NO_VALID_OPTIONS', +'OUTPUT_TRUNCATED', +'ASYNC_DISABLED' codes
apps/web/app/routes/api.ai.generate-async.tsx                [C] enqueue route
apps/web/app/routes/api.ai.jobs.$jobId.tsx                   [C] poll route (snapshot)
apps/web/app/routes/api.ai.create-module.tsx                 [M] AppError sweep
apps/web/app/routes/api.ai.create-module.stream.tsx          [M] consume pipeline; AppError frames; 55s inline deadline
apps/web/app/routes/api.ai.hydrate-module.tsx                [M] queue-mode enqueue; correlation inheritance; AppError sweep
apps/web/app/routes/api.ai.create-module-from-recipe.tsx     [M] stamp Module.generationCorrelationId
apps/web/app/routes/api.publish.tsx                          [M] queue-mode enqueue (flag-gated); correlation inheritance
apps/web/app/routes/generate._index.tsx                      [M] async enqueue+poll path; reconnect; correlationId to save
apps/web/app/routes/modules.$moduleId.tsx                    [M] async hydrate poll; async publish poll (?publishing=)
apps/web/app/routes/internal.funnel.tsx                      [C] funnel + QA telemetry dashboard (page-kit)
apps/web/app/routes/internal.tsx                             [M] ADMIN_NAV entry
apps/web/app/components/superapp/CommandPalette.tsx          [M] palette entry
apps/web/app/utils/job-poll.ts                               [C] client poll helper (shared by generate + module detail)
apps/web/app/env.server.ts                                   [M] isAsyncJobsEnabled/isPublishAsyncEnabled/budget getters
apps/web/scripts/worker.ts                                   [M] mount worker runtime when mode=queue
apps/web/package.json                                        [M] remove @superapp/workers dep
apps/web/Dockerfile                                          [M] drop apps/workers COPY lines
apps/workers/src/ai-generation.ts                            [M] DELETE StubAiGenerationAdapter (Task 17)
apps/workers/src/processors.ts                               [M] require injected adapter (Task 17)
apps/web/app/__tests__/…                                     [C] one test file per task (named in tasks)
```

---

### Task 1: Salvage the V2 worker runtime into apps/web

Port the BullMQ `Worker` mounting pattern from `apps/workers/src/worker-runtime.ts` (delete-slated, D2) into `apps/web`, adapted to the trace-in-payload contract (C3), and mount it in the WS-A skeleton `scripts/worker.ts` (with an empty handler map until Task 5 — the worker still boots, connects, and serves `/healthz` exactly as WS-A left it when no handlers are registered).

**Files:**
- Create: `apps/web/app/services/jobs/worker-runtime.server.ts`
- Create: `apps/web/app/services/jobs/enqueue.server.ts`
- Modify: `apps/web/scripts/worker.ts`
- Create: `apps/web/app/__tests__/worker-runtime.test.ts`

**Interfaces:**
- Produces:
  - `createWebWorkerRuntime(options: { handlers: Partial<Record<PlatformQueueName, WebJobHandler>>; connection?: Redis; concurrency?: Partial<Record<PlatformQueueName, number>> }): WebWorkerRuntime` where `WebJobHandler = (envelope: JobEnvelope) => Promise<{ status: 'SUCCESS' | 'FAILED'; result?: unknown }>` and `WebWorkerRuntime = { workers: Worker[]; close(): Promise<void> }`.
  - `isAsyncJobsEnabled(): boolean` (effective orchestrator mode === 'queue').
  - `enqueueWebJob(input: { id: string; jobType: PlatformJobType; payload: Record<string, unknown>; trace: JobTrace; opts?: { attempts?: number } }): Promise<{ queueName: PlatformQueueName; jobId: string }>` — embeds `trace` into the payload (`payload.trace`) because the BullMQ adapter transmits only the payload.
- Consumes: `loadJobOrchestratorConfig`, `resolveEffectiveMode`, `createBullMqQueueAdapter` (`@superapp/job-orchestration`); `PLATFORM_QUEUES`, `resolvePlatformQueue`, `JobTraceSchema`, `JobEnvelopeSchema` (`@superapp/platform-contracts`).

- [ ] **Step 1: Write the failing test** — `apps/web/app/__tests__/worker-runtime.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

// bullmq Worker is mocked: capture (queueName, processor, opts) and let the test
// invoke the processor directly with a fake bull job.
const workerCtor = vi.fn();
vi.mock('bullmq', () => ({
  Worker: class {
    opts: unknown;
    processor: (job: unknown) => Promise<unknown>;
    constructor(queueName: string, processor: (job: unknown) => Promise<unknown>, opts: unknown) {
      workerCtor(queueName, opts);
      this.processor = processor;
      this.opts = opts;
    }
    close = vi.fn(async () => {});
  },
}));
vi.mock('ioredis', () => ({ default: class { quit = vi.fn(async () => {}); } }));

import { createWebWorkerRuntime } from '~/services/jobs/worker-runtime.server';
import { enqueueWebJob, isAsyncJobsEnabled } from '~/services/jobs/enqueue.server';

describe('createWebWorkerRuntime', () => {
  it('mounts one Worker per registered queue and rebuilds the envelope from payload.trace', async () => {
    process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
    const seen: unknown[] = [];
    const runtime = createWebWorkerRuntime({
      handlers: {
        'ai-generation': async (envelope) => {
          seen.push(envelope);
          return { status: 'SUCCESS', result: { ok: true } };
        },
      },
    });
    expect(runtime.workers).toHaveLength(1);
    expect(workerCtor).toHaveBeenCalledWith('ai-generation', expect.objectContaining({ prefix: 'superapp' }));

    const w = runtime.workers[0] as unknown as { processor: (j: unknown) => Promise<unknown> };
    await w.processor({
      id: 'job_1',
      name: 'AI_GENERATE',
      data: { prompt: 'x', trace: { correlationId: 'corr_abc', shopId: 'shop_1' } },
    });
    expect(seen[0]).toMatchObject({
      id: 'job_1',
      queueName: 'ai-generation',
      jobType: 'AI_GENERATE',
      trace: { correlationId: 'corr_abc', shopId: 'shop_1' },
    });
    await runtime.close();
  });

  it('a FAILED handler result throws so BullMQ counts the attempt', async () => {
    process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
    const runtime = createWebWorkerRuntime({
      handlers: { publish: async () => ({ status: 'FAILED', result: { error: { message: 'boom' } } }) },
    });
    const w = runtime.workers[0] as unknown as { processor: (j: unknown) => Promise<unknown> };
    await expect(
      w.processor({ id: 'job_2', name: 'PUBLISH', data: { trace: { correlationId: 'c' } } }),
    ).rejects.toThrow(/boom/);
    await runtime.close();
  });
});

describe('enqueueWebJob', () => {
  it('embeds the trace in the payload (the BullMQ adapter only transmits payload)', async () => {
    const add = vi.fn(async () => ({}));
    const adapter = {
      enqueue: vi.fn(async (input: { payload: Record<string, unknown> }) => {
        add(input.payload);
        return { queueName: 'ai-generation' as const, jobId: 'job_1' };
      }),
      close: vi.fn(),
    };
    const res = await enqueueWebJob(
      { id: 'job_1', jobType: 'AI_GENERATE', payload: { prompt: 'x' }, trace: { correlationId: 'corr_abc' } },
      { adapter },
    );
    expect(res.jobId).toBe('job_1');
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'x', trace: { correlationId: 'corr_abc' } }));
  });
});
```

- [ ] **Step 2: Run it** — `cd apps/web && npx vitest run app/__tests__/worker-runtime.test.ts`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement** — `apps/web/app/services/jobs/worker-runtime.server.ts` (port of `apps/workers/src/worker-runtime.ts`, adapted):

```ts
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { loadJobOrchestratorConfig } from '@superapp/job-orchestration';
import {
  JobTraceSchema,
  type JobEnvelope,
  type PlatformJobType,
  type PlatformQueueName,
} from '@superapp/platform-contracts';

export type WebJobHandlerResult = { status: 'SUCCESS' | 'FAILED'; result?: unknown };
export type WebJobHandler = (envelope: JobEnvelope) => Promise<WebJobHandlerResult>;

export type WebWorkerRuntimeOptions = {
  handlers: Partial<Record<PlatformQueueName, WebJobHandler>>;
  connection?: Redis;
  concurrency?: Partial<Record<PlatformQueueName, number>>;
};

export type WebWorkerRuntime = { workers: Worker[]; close(): Promise<void> };

/**
 * WS-C port of the V2 `apps/workers/src/worker-runtime.ts` pattern (salvaged
 * before WS-I deletes the V2 apps, D2). One BullMQ Worker per registered queue.
 * Contract difference vs V2: the enqueue side (enqueue.server.ts) embeds the
 * JobTrace INSIDE the payload because `createBullMqQueueAdapter.enqueue` only
 * transmits `payload` — the envelope is rebuilt here from `payload.trace`.
 */
export function createWebWorkerRuntime(options: WebWorkerRuntimeOptions): WebWorkerRuntime {
  const config = loadJobOrchestratorConfig();
  if (!config.queueRedisUrl) {
    throw new Error('QUEUE_REDIS_URL or REDIS_URL is required to start BullMQ workers');
  }
  const connection =
    options.connection ?? new Redis(config.queueRedisUrl, { maxRetriesPerRequest: null });

  const queueNames = Object.keys(options.handlers) as PlatformQueueName[];
  const workers = queueNames.map((queueName) => {
    const handler = options.handlers[queueName];
    if (!handler) throw new Error(`No handler registered for queue ${queueName}`);

    return new Worker(
      queueName,
      async (bullJob) => {
        const data = (bullJob.data ?? {}) as Record<string, unknown>;
        const trace = JobTraceSchema.safeParse(data.trace);
        const envelope: JobEnvelope = {
          id: bullJob.id ?? bullJob.name,
          queueName,
          jobType: bullJob.name as PlatformJobType,
          payload: bullJob.data,
          trace: trace.success ? trace.data : { correlationId: bullJob.id ?? 'unknown' },
        };
        const result = await handler(envelope);
        if (result.status === 'FAILED') {
          const message =
            typeof result.result === 'object' && result.result && 'error' in result.result
              ? String((result.result as { error?: { message?: string } }).error?.message ?? 'Worker job failed')
              : 'Worker job failed';
          throw new Error(message);
        }
        return result.result;
      },
      {
        connection,
        prefix: config.queuePrefix,
        concurrency:
          options.concurrency?.[queueName] ??
          Number.parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10),
      },
    );
  });

  return {
    workers,
    async close() {
      // close() waits for in-flight jobs — Railway redeploys drain gracefully.
      await Promise.all(workers.map((worker) => worker.close()));
      if (!options.connection) await connection.quit();
    },
  };
}
```

`apps/web/app/services/jobs/enqueue.server.ts`:

```ts
import {
  createBullMqQueueAdapter,
  loadJobOrchestratorConfig,
  resolveEffectiveMode,
  type JobQueueAdapter,
} from '@superapp/job-orchestration';
import {
  resolvePlatformQueue,
  type JobTrace,
  type PlatformJobType,
  type PlatformQueueName,
} from '@superapp/platform-contracts';

let sharedAdapter: JobQueueAdapter | undefined;

/** True when the effective job-orchestrator mode is 'queue' (Redis configured). */
export function isAsyncJobsEnabled(): boolean {
  return resolveEffectiveMode(loadJobOrchestratorConfig()) === 'queue';
}

export type EnqueueWebJobInput = {
  /** Prisma Job.id — doubles as the BullMQ jobId (queue-level dedupe). */
  id: string;
  jobType: PlatformJobType;
  payload: Record<string, unknown>;
  trace: JobTrace;
  opts?: { attempts?: number };
};

export async function enqueueWebJob(
  input: EnqueueWebJobInput,
  deps?: { adapter?: JobQueueAdapter },
): Promise<{ queueName: PlatformQueueName; jobId: string }> {
  const adapter =
    deps?.adapter ??
    (sharedAdapter ??= createBullMqQueueAdapter({ config: loadJobOrchestratorConfig() }));
  const queueName = resolvePlatformQueue(input.jobType);
  return adapter.enqueue({
    id: input.id,
    queueName,
    jobType: input.jobType,
    // Trace rides in the payload — createBullMqQueueAdapter transmits payload only.
    payload: { ...input.payload, trace: input.trace },
    trace: input.trace,
    ...(input.opts ? { opts: input.opts } : {}),
  } as never);
}
```

- [ ] **Step 4: Per-job attempts pass-through (additive)** — `packages/job-orchestration/src/types.ts`: add to `EnqueueJobInput`: `opts?: { attempts?: number; backoffMs?: number };`. `packages/job-orchestration/src/bullmq-queue.ts` `enqueue`: change `queue.add(input.jobType, input.payload, { jobId: input.id, removeOnComplete: true, removeOnFail: false })` to also spread `...(input.opts?.attempts ? { attempts: input.opts.attempts } : {}), ...(input.opts?.backoffMs ? { backoff: { type: 'exponential', delay: input.opts.backoffMs } } : {})`. Rebuild: `pnpm --filter @superapp/job-orchestration build && pnpm --filter @superapp/job-orchestration test`.

- [ ] **Step 5: Mount in the worker entry** — `apps/web/scripts/worker.ts`: after the health server setup, add:

```ts
import { resolveEffectiveMode as resolveMode } from '@superapp/job-orchestration';
import { createWebWorkerRuntime, type WebWorkerRuntime } from '../app/services/jobs/worker-runtime.server.js';
import { buildWorkerHandlers } from '../app/services/jobs/processors/index.js'; // Task 5 fills this; ships now returning {}

let runtime: WebWorkerRuntime | null = null;
if (resolveMode(config) === 'queue') {
  const handlers = buildWorkerHandlers();
  if (Object.keys(handlers).length > 0) {
    runtime = createWebWorkerRuntime({ handlers });
    console.log('[worker] BullMQ workers mounted', { queues: Object.keys(handlers) });
  } else {
    console.log('[worker] no handlers registered yet — health-only mode');
  }
}
```

and in `shutdown()`, before `server.close`, `await runtime?.close()` (make `shutdown` async; keep the 5s force-exit timer but raise to 30s when runtime exists so in-flight jobs drain). Create `apps/web/app/services/jobs/processors/index.ts` exporting `buildWorkerHandlers(): Partial<Record<PlatformQueueName, WebJobHandler>>` returning `{}` for now with a comment pointing at Task 5.

- [ ] **Step 6: Run** — `cd apps/web && npx vitest run app/__tests__/worker-runtime.test.ts` → PASS. `pnpm --filter web typecheck` (if script exists, else `npx tsc --noEmit`). Boot check: `QUEUE_REDIS_URL=redis://localhost:6379 JOB_EXECUTION_MODE=queue pnpm --filter web worker:start` → logs `no handlers registered yet — health-only mode`, `/healthz` 200 (Ctrl-C exits cleanly). If no local Redis, skip the boot check and note it.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(ws-c): port V2 worker runtime into apps/web; enqueue seam with trace-in-payload"`

---

### Task 2: Salvage the image-storage processor; sever `@superapp/workers` from apps/web

`apps/web` imports `createImageStorageProcessor` from `@superapp/workers` (`preview-export.queue.server.ts:8`) — the only live V2 import. Port the self-contained chain (image-storage + image-worker + storage adapters + worker-events; deps: only `@superapp/platform-contracts` + node builtins) into apps/web so WS-I can delete `apps/api`/`apps/workers`.

**Files:**
- Create: `apps/web/app/services/assets/image-storage.server.ts` (from `apps/workers/src/image-storage.ts`)
- Create: `apps/web/app/services/assets/image-worker.server.ts` (from `apps/workers/src/image/image-worker.ts`)
- Create: `apps/web/app/services/assets/storage/storage-adapter.server.ts`, `local-storage-adapter.server.ts`, `r2-storage-adapter.server.ts`, `storage-adapter-factory.server.ts` (from `apps/workers/src/storage/*`)
- Create: `apps/web/app/services/assets/worker-events.server.ts` (from `apps/workers/src/worker-events.ts`)
- Modify: `apps/web/app/services/preview/preview-export.queue.server.ts` (import `~/services/assets/image-storage.server`)
- Modify: `apps/web/package.json` (remove `"@superapp/workers": "workspace:*"`)
- Modify: `apps/web/Dockerfile` (remove both `COPY apps/workers/package.json …` and `COPY apps/workers apps/workers` lines)
- Create: `apps/web/app/__tests__/image-storage-port.test.ts`

**Interfaces:**
- Produces: `createImageStorageProcessor(options?: ImageStorageProcessorOptions)` — byte-compatible signature with the V2 export (same options: `storage?`, `storageAdapterOptions?`, `now?`); `createStorageAdapter`, `LocalStorageAdapter`, `R2StorageAdapter`, `StorageAdapterError`.
- Consumes: `ImageWorkerPayloadSchema`, `buildAssetStorageKey`, `buildPreviewStorageKey`, etc. from `@superapp/platform-contracts` (unchanged).

- [ ] **Step 1: Write the failing test** — `apps/web/app/__tests__/image-storage-port.test.ts`: port the PREVIEW_EXPORT happy-path + invalid-payload cases from `apps/workers/src/__tests__/image-worker.test.ts` and `image-storage.test.ts` (copy the smallest 2–3 cases verbatim, importing from `~/services/assets/image-storage.server`), plus the guard:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function scan(dir: string, hits: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'build' || name === '.cache') continue;
    if (statSync(p).isDirectory()) scan(p, hits);
    else if (/\.(ts|tsx)$/.test(name) && readFileSync(p, 'utf8').includes('@superapp/workers')) hits.push(p);
  }
}

it('apps/web no longer imports @superapp/workers (V2 delete-safety, D2)', () => {
  const hits: string[] = [];
  scan(join(__dirname, '..'), hits);       // app/
  scan(join(__dirname, '../../scripts'), hits);
  expect(hits).toEqual([]);
});
```

- [ ] **Step 2: Run it** — `npx vitest run app/__tests__/image-storage-port.test.ts` → FAIL (module missing; guard finds `preview-export.queue.server.ts`).
- [ ] **Step 3: Port** — copy the six source files, renaming to `.server.ts` and fixing relative imports (`./storage/...` → `./storage/....server`); no logic changes (this is a salvage, not a refactor). Switch the import in `preview-export.queue.server.ts:8`. Remove the dep from `apps/web/package.json`; run `pnpm install` to update the lockfile. Edit the Dockerfile (two COPY lines + the comment listing workers, and the `pnpm --filter "web^..." build` note no longer builds `@superapp/workers`).
- [ ] **Step 4: Run** — `npx vitest run app/__tests__/image-storage-port.test.ts app/services/preview/preview-export.queue.server.test.ts` → PASS. Full graph check (route-reachable import changed): `pnpm --filter web build` → clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(ws-c): port image-storage processor into apps/web; drop @superapp/workers dependency (V2 delete-safety)"`

---

### Task 3: Additive Prisma migration (options table, stage, funnel spine, QA promotion)

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: migration `apps/web/prisma/migrations/<ts>_ws_c_async_generation/`
- Create: `apps/web/app/__tests__/ws-c-schema.test.ts`

**Interfaces (schema):**

```prisma
model AiGenerationOption {
  id             String   @id @default(cuid())
  jobId          String
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  shopId         String?
  idx            Int
  approach       String
  status         String   // VALID | FAILED
  explanation    String?
  recipeJson     String?  // RecipeSpec JSON (final, post-composition/palette)
  error          String?
  score          Float?
  badgesJson     String?  // string[] JSON
  qaIssuesJson   String?  // string[] of QA issue ids (Task 15)
  generationMode String?  // delta | freeform
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([jobId, idx])
  @@index([shopId, createdAt])
}
```

Plus, all additive: `Job` gains `stage String?` and back-relation `generationOptions AiGenerationOption[]`; `Module` gains `generationCorrelationId String?` + `@@index([generationCorrelationId])`; `AppSettings` gains `qaPromotedBlockingIssueIds String?` (JSON `string[]`).

- [ ] **Step 1: Write the failing test** — `app/__tests__/ws-c-schema.test.ts`: instantiate the Prisma client types only (compile-time contract):

```ts
import type { Prisma } from '@prisma/client';

it('WS-C additive schema surface exists', () => {
  const opt: Prisma.AiGenerationOptionCreateManyInput = {
    jobId: 'j', idx: 0, approach: 'polished', status: 'VALID',
  };
  const job: Prisma.JobUpdateInput = { stage: 'generating' };
  const mod: Prisma.ModuleUpdateInput = { generationCorrelationId: 'corr_1' };
  const settings: Prisma.AppSettingsUpdateInput = { qaPromotedBlockingIssueIds: '[]' };
  expect([opt, job, mod, settings]).toBeTruthy();
});
```

- [ ] **Step 2: Run** — `npx vitest run app/__tests__/ws-c-schema.test.ts` → FAIL (types missing).
- [ ] **Step 3: Implement** — edit `schema.prisma` exactly as above; `pnpm exec prisma migrate dev --name ws_c_async_generation`. Inspect the generated SQL: CREATE TABLE + ALTER TABLE ADD COLUMN + CREATE INDEX only — nothing else (additive gate).
- [ ] **Step 4: Run** — test PASS; `npx vitest run` (full suite) → no new failures.
- [ ] **Step 5: Commit** — `git commit -am "feat(ws-c): additive schema — AiGenerationOption, Job.stage, Module.generationCorrelationId, QA promotion setting"`

---

### Task 4: Extract `runGenerationPipeline` from the stream route

The generation pipeline (classify → intent → router → RAG → aesthetics → option stream → composition/palette → ranking → blueprint) currently lives inline in `api.ai.create-module.stream.tsx:128–330`. Extract it into a hook-driven service consumed by BOTH the SSE route (behavior parity) and, in Task 5, the worker processor. Auth, rate-limit, quota, Job bookkeeping, judge-polish, and SSE mechanics stay in the route.

**Files:**
- Create: `apps/web/app/services/ai/generation-pipeline.server.ts`
- Modify: `apps/web/app/routes/api.ai.create-module.stream.tsx`
- Create: `apps/web/app/__tests__/generation-pipeline.test.ts`

**Interfaces:**
- Produces:

```ts
export type GenerationPipelineInput = {
  shopId: string;
  shopDomain: string;
  /** Raw merchant prompt (constraints are assembled inside, matching the route today). */
  prompt: string;
  preferredType: string;        // 'Auto' | ModuleType
  preferredCategory: string;
  preferredBlockType: string;
  matchStoreColors: boolean;
  optionCount?: number;         // default 3
  correlationId?: string;
  planTier: string;             // resolved by the caller (route: CapabilityService; worker: Shop row)
  admin: AdminApiContext['admin'];
  deadlineAt?: number;          // epoch ms — threaded into hints (Task 10)
  promotedBlockingIssueIds?: string[]; // Task 15
};

export type GenerationIntentFrame = {
  intent: string; surface: string; confidence: number;
  confidenceBand: 'direct' | 'with_alternatives' | 'fallback';
  alternatives: unknown[]; reasons: unknown[]; routing: unknown;
  moduleType: string; routerDecision: unknown;
};

export type GenerationPipelineHooks = {
  onStage?(stage: 'classifying' | 'generating' | 'ranking' | 'finalizing'): void | Promise<void>;
  onIntent?(frame: GenerationIntentFrame): void | Promise<void>;
  onStarted?(o: { index: number; approach: string; total: number }): void | Promise<void>;  // forwards the stream's `started` events (SSE route re-emits them)
  onOption?(o: { index: number; approach: string; option: RecipeOption; durationMs: number }): void | Promise<void>;
  onOptionFailed?(o: { index: number; approach: string; error: string; durationMs: number }): void | Promise<void>;
  onRanking?(r: { recommendedIndex: number; scores: { index: number; score: number; badges: string[] }[] }): void | Promise<void>;
  onBlueprint?(b: unknown): void | Promise<void>;
  isAborted?(): boolean;        // route wires its `aborted` flag; worker returns false
};

export type GenerationPipelineResult = {
  validCount: number;
  moduleType: string;
  collected: Map<number, RecipeOption>;   // final (post-mutation) options by real index
};

export async function runGenerationPipeline(
  input: GenerationPipelineInput,
  hooks: GenerationPipelineHooks,
): Promise<GenerationPipelineResult>;
```

- Consumes (moved verbatim from the route, keeping order and best-effort catches): constraint assembly (stream route lines 102–130 including the plan-tier constraint), `classifyUserIntent`/`augmentWithCheapClassifier`/`buildIntentPacket`/`buildPromptRouterDecision` (132–151), `extractRequirementSpec`/`searchSolutions`/`ensureStoreAesthetic`/`loadStoreAesthetic` (155–165), the `generateValidatedRecipeOptionsStream` consumption loop with `applyCompositionRules`/`applyStorePalette`/`applyStylePackTokens` and the `ranking` emission (229–291), and the flag-gated blueprint block (296–330). Judge-polish (332–425) is NOT moved (stays route-only — see Open Question 5).

- [ ] **Step 1: Write the failing test** — `app/__tests__/generation-pipeline.test.ts`. Mock the heavy collaborators and assert orchestration order + hook payloads:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/services/ai/classify.server', () => ({
  classifyUserIntent: vi.fn(async () => ({ moduleType: 'theme.section', intent: 'banner' })),
  CONFIDENCE_THRESHOLDS: { DIRECT: 0.8, WITH_ALTERNATIVES: 0.55 },
}));
vi.mock('~/services/ai/cheap-classifier.server', () => ({
  augmentWithCheapClassifier: vi.fn(async (c: unknown) => c),
}));
vi.mock('~/services/ai/intent-packet.server', () => ({
  buildIntentPacket: vi.fn(() => ({
    classification: { intent: 'banner', surface: 'storefront', confidence: 0.9, alternatives: [], reasons: [] },
    routing: { prompt_profile: 'p' },
  })),
}));
vi.mock('~/services/ai/prompt-router.server', () => ({ buildPromptRouterDecision: vi.fn(async () => ({ includeFlags: {} })) }));
vi.mock('~/services/ai/requirement-spec.server', () => ({ extractRequirementSpec: vi.fn(async () => ({})) }));
vi.mock('~/services/ai/solution-search.server', () => ({ searchSolutions: vi.fn(() => ({ grounding: '', exemplar: undefined, startFrom: [] })) }));
vi.mock('~/services/theme/ensure-aesthetic.server', () => ({ ensureStoreAesthetic: vi.fn(async () => {}) }));
vi.mock('~/services/ai/design-reference.server', () => ({ loadStoreAesthetic: vi.fn(async () => null) }));
vi.mock('~/services/ai/blueprint-planner', () => ({ planBlueprint: vi.fn(() => ({ kind: 'single' })) }));
vi.mock('~/services/ai/apply-composition.server', () => ({ applyCompositionRules: vi.fn() }));

const recipe = { type: 'theme.section', name: 'X', category: 'STOREFRONT_UI', requires: [], config: {} };
vi.mock('~/services/ai/llm.server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateValidatedRecipeOptionsStream: vi.fn(async function* () {
    yield { kind: 'started', index: 0, approach: 'a', total: 2 };
    yield { kind: 'option', index: 0, approach: 'a', option: { explanation: 'e0', recipe }, durationMs: 10 };
    yield { kind: 'option_failed', index: 1, approach: 'b', error: 'nope', durationMs: 12 };
    yield { kind: 'done', valid: 1, total: 2 };
  }),
}));

import { runGenerationPipeline } from '~/services/ai/generation-pipeline.server';

it('drives hooks in order and returns final options', async () => {
  const calls: string[] = [];
  const result = await runGenerationPipeline(
    {
      shopId: 's1', shopDomain: 'x.myshopify.com', prompt: 'make a banner',
      preferredType: 'Auto', preferredCategory: 'Auto', preferredBlockType: 'Auto',
      matchStoreColors: true, planTier: 'BASIC', admin: {} as never,
    },
    {
      onStage: (s) => { calls.push(`stage:${s}`); },
      onIntent: () => { calls.push('intent'); },
      onOption: (o) => { calls.push(`option:${o.index}`); },
      onOptionFailed: (o) => { calls.push(`failed:${o.index}`); },
      onRanking: (r) => { calls.push(`ranking:${r.recommendedIndex}`); },
    },
  );
  expect(result.validCount).toBe(1);
  expect(result.collected.get(0)?.explanation).toBe('e0');
  expect(calls).toEqual([
    'stage:classifying', 'intent', 'stage:generating', 'option:0', 'failed:1', 'stage:ranking', 'ranking:0', 'stage:finalizing',
  ]);
});

it('isAborted stops consumption and skips the blueprint phase', async () => {
  const onOption = vi.fn();
  const res = await runGenerationPipeline(
    { shopId: 's1', shopDomain: 'x.myshopify.com', prompt: 'p', preferredType: 'Auto', preferredCategory: 'Auto', preferredBlockType: 'Auto', matchStoreColors: false, planTier: 'BASIC', admin: {} as never },
    { isAborted: () => true, onOption },
  );
  expect(onOption).not.toHaveBeenCalled();
  expect(res.validCount).toBe(0);
});
```

- [ ] **Step 2: Run** — FAIL (module missing).
- [ ] **Step 3: Implement** the service by MOVING the route logic (line ranges above) with these adaptations: constraints/planTier come from `input` (no CapabilityService call inside — caller resolves it); the SSE `send(...)` calls become hook invocations; the per-event abort check calls `hooks.isAborted?.()`; `matchStoreColors`/storefront-type aesthetics preserved byte-for-byte; ranking uses the same sorted-entries mapping as the route (real indices). Emit stages exactly as tested. Thread `input.correlationId`, `input.deadlineAt` (consumed in Task 10) and `input.promotedBlockingIssueIds` (consumed in Task 15) into `generateValidatedRecipeOptionsStream`'s options.
- [ ] **Step 4: Refactor the stream route** to consume the pipeline: keep auth/rate-limit/quota/shop-upsert/plan-tier resolution/Job bookkeeping/`finalizeGenerationJob`/judge-polish; delete the moved blocks; wire hooks → `send(...)` frames preserving today's event names/payloads exactly (`intent` ← onIntent, `started` ← onStarted, `option` ← onOption, `option_failed` ← onOptionFailed, `ranking` ← onRanking, `blueprint` ← onBlueprint, then `done` and `error`). The `done` frame is emitted by the route after the pipeline resolves (`{ valid: result.validCount, total: optionCount }`).
- [ ] **Step 5: Run** — `npx vitest run app/__tests__/generation-pipeline.test.ts` → PASS; full suite → no new failures; eval regression gate: `pnpm --filter web evals` (stub mode) → exit 0; **`pnpm --filter web build`** (route touched) → clean.
- [ ] **Step 6: Commit** — `git commit -am "refactor(ws-c): extract runGenerationPipeline from stream route (hook-driven, route behavior-identical)"`

---

### Task 5: Generation job — payload schema, enqueue route, worker processor

**Files:**
- Create: `apps/web/app/services/jobs/job-payloads.server.ts`
- Create: `apps/web/app/services/jobs/processors/ai-generation.processor.server.ts`
- Modify: `apps/web/app/services/jobs/processors/index.ts` (register handler)
- Modify: `apps/web/app/services/jobs/job.service.ts` (add `setStage`, `failWithPayload`)
- Create: `apps/web/app/routes/api.ai.generate-async.tsx`
- Modify: `apps/web/app/env.server.ts` (budget getters)
- Create: `apps/web/app/__tests__/ai-generation-processor.test.ts`, `apps/web/app/__tests__/generate-async-route.test.ts`

**Interfaces:**
- Produces:

```ts
// job-payloads.server.ts — DISTINCT names from V2 contracts (C4)
export const WebAiGenerateJobPayloadSchema = z.object({
  kind: z.literal('WEB_AI_GENERATE'),
  shopId: z.string().min(1),
  shopDomain: z.string().min(1),
  prompt: z.string().min(1),
  preferredType: z.string().default('Auto'),
  preferredCategory: z.string().default('Auto'),
  preferredBlockType: z.string().default('Auto'),
  matchStoreColors: z.boolean().default(true),
  optionCount: z.number().int().min(1).max(3).default(3),
  planTier: z.string().default('UNKNOWN'),
  trace: JobTraceSchema,
});
export type WebAiGenerateJobPayload = z.infer<typeof WebAiGenerateJobPayloadSchema>;

// ai-generation.processor.server.ts
export function createAiGenerationJobHandler(): WebJobHandler;

// job.service.ts additions
async setStage(jobId: string, stage: string): Promise<void>;   // prisma.job.update({ data: { stage } })
async failWithPayload(jobId: string, payload: AppErrorPayload): Promise<void>; // error = JSON.stringify(payload)
```

- Route contract: `POST /api/ai/generate-async` (form fields: `prompt`, `preferredType`, `preferredCategory`, `preferredBlockType`, `matchStoreColors`, `correlationId`) → `200 { jobId, correlationId }` | `503 { error: 'ASYNC_DISABLED', … }` (inline mode) | AppError payloads for quota/validation.
- Consumes: `runGenerationPipeline` (T4), `enqueueWebJob`/`isAsyncJobsEnabled` (T1), `shopify.unauthenticated.admin`, `runWithRequestContext`, `finalizeGenerationJob`, `QuotaService.enforce(shopId,'aiRequest')`, `CapabilityService.refreshPlanTier`.

- [ ] **Step 1: Processor failing test** — `app/__tests__/ai-generation-processor.test.ts`. Mock `~/shopify.server` (`unauthenticated: { admin: async () => ({ admin: {} }) }`), `~/services/ai/generation-pipeline.server` (capture hooks, invoke `onOption` twice + return `{ validCount: 2, moduleType: 'theme.section', collected }`), `~/db.server` with an in-memory prisma stub for `aiGenerationOption.upsert` + `job.update`. Assert:
  - handler parses payload via `WebAiGenerateJobPayloadSchema` (invalid payload → `status:'FAILED'` and `jobs.failWithPayload` with code `VALIDATION_ERROR`, no throw-loop);
  - `jobs.start` then `setStage('classifying')` called before the pipeline; each `onOption` performs `prisma.aiGenerationOption.upsert({ where: { jobId_idx: { jobId, idx } }, … })` with `status:'VALID'`, `recipeJson`, `explanation`, `generationMode`, `qaIssuesJson` (null for now);
  - `onRanking` writes `score`/`badgesJson` onto the matching rows and `Job.result` gets `{ optionCount, recommendedIndex, type }` via `jobs.succeed`;
  - `validCount === 0` ⇒ `jobs.failWithPayload` with `{ error: 'NO_VALID_OPTIONS', message: /not billed/ }` and handler returns `{ status: 'FAILED' }` (so BullMQ retries — retry is billing-safe per C2);
  - pipeline throw of `AiProviderNotConfiguredError` ⇒ failWithPayload `{ error: 'AI_PROVIDER_NOT_CONFIGURED' }` and `{ status: 'FAILED' }`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement the processor**:

```ts
import { AppError } from '~/services/errors/app-error.server';
import { runWithRequestContext } from '~/services/observability/correlation.server';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { runGenerationPipeline } from '~/services/ai/generation-pipeline.server';
import { AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';
import { getGenerationJobBudgetMs } from '~/env.server';
import { WebAiGenerateJobPayloadSchema } from '~/services/jobs/job-payloads.server';
import type { WebJobHandler } from '~/services/jobs/worker-runtime.server';

export function createAiGenerationJobHandler(): WebJobHandler {
  return async (envelope) => {
    const jobs = new JobService();
    const parsed = WebAiGenerateJobPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      await jobs.failWithPayload(envelope.id, {
        error: 'VALIDATION_ERROR',
        message: 'Generation job payload failed validation.',
        requestId: envelope.trace.requestId ?? envelope.id,
        details: { issues: JSON.stringify(parsed.error.flatten()) },
      });
      // Malformed payloads never become valid — report FAILED without throwing
      // a retriable error is wrong here; return FAILED so runtime throws once,
      // and BullMQ's attempts cap bounds it.
      return { status: 'FAILED', result: { error: { message: 'invalid payload' } } };
    }
    const payload = parsed.data;

    return runWithRequestContext(
      {
        correlationId: payload.trace.correlationId,
        requestId: payload.trace.requestId,
        shopDomain: payload.shopDomain,
        actor: 'WORKER',
      },
      async () => {
        const prisma = getPrisma();
        await jobs.start(envelope.id);
        await jobs.setStage(envelope.id, 'classifying');
        const { admin } = await shopify.unauthenticated.admin(payload.shopDomain);
        const deadlineAt = Date.now() + getGenerationJobBudgetMs();

        const persistOption = async (o: {
          index: number; approach: string;
          option?: { explanation: string; recipe: unknown; generationMode?: string; qaSummary?: { issueIds?: string[] } };
          error?: string;
        }) => {
          await prisma.aiGenerationOption.upsert({
            where: { jobId_idx: { jobId: envelope.id, idx: o.index } },
            create: {
              jobId: envelope.id, shopId: payload.shopId, idx: o.index, approach: o.approach,
              status: o.option ? 'VALID' : 'FAILED',
              explanation: o.option?.explanation ?? null,
              recipeJson: o.option ? JSON.stringify(o.option.recipe) : null,
              generationMode: o.option?.generationMode ?? null,
              qaIssuesJson: o.option?.qaSummary?.issueIds ? JSON.stringify(o.option.qaSummary.issueIds) : null,
              error: o.error ?? null,
            },
            update: {
              status: o.option ? 'VALID' : 'FAILED',
              explanation: o.option?.explanation ?? null,
              recipeJson: o.option ? JSON.stringify(o.option.recipe) : null,
              generationMode: o.option?.generationMode ?? null,
              qaIssuesJson: o.option?.qaSummary?.issueIds ? JSON.stringify(o.option.qaSummary.issueIds) : null,
              error: o.error ?? null,
            },
          });
        };

        try {
          let ranking: { recommendedIndex: number } | null = null;
          const result = await runGenerationPipeline(
            {
              shopId: payload.shopId,
              shopDomain: payload.shopDomain,
              prompt: payload.prompt,
              preferredType: payload.preferredType,
              preferredCategory: payload.preferredCategory,
              preferredBlockType: payload.preferredBlockType,
              matchStoreColors: payload.matchStoreColors,
              optionCount: payload.optionCount,
              correlationId: payload.trace.correlationId,
              planTier: payload.planTier,
              admin,
              deadlineAt,
            },
            {
              onStage: (stage) => jobs.setStage(envelope.id, stage),
              onOption: (o) => persistOption({ index: o.index, approach: o.approach, option: o.option }),
              onOptionFailed: (o) => persistOption({ index: o.index, approach: o.approach, error: o.error }),
              onRanking: async (r) => {
                ranking = r;
                for (const s of r.scores) {
                  await prisma.aiGenerationOption.updateMany({
                    where: { jobId: envelope.id, idx: s.index },
                    data: { score: s.score, badgesJson: JSON.stringify(s.badges) },
                  });
                }
              },
            },
          );

          const terminal = await finalizeGenerationJob(jobs, envelope.id, result.validCount, {
            type: result.moduleType,
            recommendedIndex: ranking?.recommendedIndex ?? null,
            async: true,
          });
          if (terminal.kind === 'failed') {
            await jobs.failWithPayload(envelope.id, {
              error: 'NO_VALID_OPTIONS',
              message: `${terminal.message} Please try again — this attempt was not billed.`,
              requestId: payload.trace.requestId ?? envelope.id,
            });
            return { status: 'FAILED', result: { error: { message: terminal.message } } };
          }
          return { status: 'SUCCESS', result: { optionCount: result.validCount } };
        } catch (e) {
          const payloadOut =
            e instanceof AiProviderNotConfiguredError
              ? { error: 'AI_PROVIDER_NOT_CONFIGURED' as const, message: e.message, requestId: envelope.id }
              : e instanceof AppError
                ? e.toPayload()
                : {
                    error: 'INTERNAL_ERROR' as const,
                    message: 'Generation failed unexpectedly. Please try again — a retry will not double-bill.',
                    requestId: envelope.id,
                  };
          await jobs.failWithPayload(envelope.id, payloadOut);
          return { status: 'FAILED', result: { error: { message: payloadOut.message } } };
        }
      },
    );
  };
}
```

`processors/index.ts`: `buildWorkerHandlers()` returns `{ 'ai-generation': dispatchAiGeneration }` where `dispatchAiGeneration` switches on `envelope.jobType` (`AI_GENERATE` → this handler; `AI_HYDRATE` → Task 8's; unknown → FAILED payload). `job.service.ts`: add `setStage`/`failWithPayload` (`failWithPayload` sets `status:'FAILED', finishedAt, error: JSON.stringify(payload)`). `env.server.ts`: `getGenerationJobBudgetMs()` (`GENERATION_JOB_BUDGET_MS` default `150000`), `getHydrateJobBudgetMs()` (`HYDRATE_JOB_BUDGET_MS` default `90000`).

- [ ] **Step 4: Route failing test** — `app/__tests__/generate-async-route.test.ts`: mock `~/shopify.server` authenticate, `~/services/jobs/enqueue.server` (`isAsyncJobsEnabled` toggled per test, `enqueueWebJob` captured), quota/rate-limit mocks. Assert: (a) inline mode → 503 `{ error: 'ASYNC_DISABLED' }`; (b) queue mode → creates Job (type `AI_GENERATE`, correlationId = client value), enqueues with `id === job.id`, `jobType 'AI_GENERATE'`, payload matching `WebAiGenerateJobPayloadSchema` incl. `trace.correlationId`, `opts.attempts === 2`, and returns `{ jobId, correlationId }`; (c) missing prompt → 422 `VALIDATION_ERROR` AppError payload; (d) quota exceeded (`QuotaService.enforce` throws `AppError` RATE_LIMITED) → its `toResponse()` (429) passes through.
- [ ] **Step 5: Implement the route** — `api.ai.generate-async.tsx`:

```ts
import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { QuotaService } from '~/services/billing/quota.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { enqueueWebJob, isAsyncJobsEnabled } from '~/services/jobs/enqueue.server';
import { AppError, toErrorResponse } from '~/services/errors/app-error.server';
import { generateCorrelationId } from '~/services/observability/correlation.server';

export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * WS-C async generation enqueue. Returns { jobId, correlationId } immediately;
 * the client polls GET /api/ai/jobs/:jobId. A reconnect re-fetches — it can
 * never re-run or re-bill the generation (the worker is the only executor).
 */
export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  try {
    await enforceRateLimit(`ai:${session.shop}`);
    const form = await request.formData();
    const prompt = String(form.get('prompt') ?? '').trim();
    if (!prompt) {
      throw new AppError({ code: 'VALIDATION_ERROR', message: 'Please describe what you want to build.' });
    }
    if (!isAsyncJobsEnabled()) {
      return json(
        { error: 'ASYNC_DISABLED', message: 'Async generation requires JOB_EXECUTION_MODE=queue.' },
        { status: 503 },
      );
    }
    const correlationId = String(form.get('correlationId') ?? '').trim() || generateCorrelationId();

    const prisma = getPrisma();
    const shopRow = await prisma.shop.upsert({
      where: { shopDomain: session.shop },
      create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
      update: {},
    });
    await new QuotaService().enforce(shopRow.id, 'aiRequest');

    let planTier = shopRow.planTier ?? 'UNKNOWN';
    if (planTier === 'UNKNOWN') planTier = await new CapabilityService().refreshPlanTier(session.shop, admin);

    const jobs = new JobService();
    const job = await jobs.create({
      shopId: shopRow.id,
      type: 'AI_GENERATE',
      correlationId,
      payload: { promptLen: prompt.length, async: true },
    });
    await enqueueWebJob({
      id: job.id,
      jobType: 'AI_GENERATE',
      payload: {
        kind: 'WEB_AI_GENERATE',
        shopId: shopRow.id,
        shopDomain: session.shop,
        prompt,
        preferredType: String(form.get('preferredType') ?? 'Auto').trim(),
        preferredCategory: String(form.get('preferredCategory') ?? 'Auto').trim(),
        preferredBlockType: String(form.get('preferredBlockType') ?? 'Auto').trim(),
        matchStoreColors: String(form.get('matchStoreColors') ?? 'true').trim() !== 'false',
        optionCount: 3,
        planTier,
      },
      trace: { correlationId, shopId: shopRow.id },
      opts: { attempts: 2 },
    });
    return json({ jobId: job.id, correlationId });
  } catch (e) {
    return toErrorResponse(e);
  }
}
```

Also add `'ASYNC_DISABLED'`, `'NO_VALID_OPTIONS'`, `'OUTPUT_TRUNCATED'` to `ErrorCode` + `statusForCode` (503/422/502) in `app-error.server.ts`.
- [ ] **Step 6: Run** — both test files PASS; full suite no new failures; **`pnpm --filter web build`** → clean.
- [ ] **Step 7: Commit** — `git commit -am "feat(ws-c): AI generation as a BullMQ job — payload schema, worker processor with per-option persistence, enqueue route"`

---

### Task 6: Poll route — `GET /api/ai/jobs/:jobId`

**Files:**
- Create: `apps/web/app/routes/api.ai.jobs.$jobId.tsx`
- Modify: `apps/web/app/services/jobs/job.service.ts` (`getForShop`)
- Create: `apps/web/app/__tests__/ai-job-poll-route.test.ts`

**Interfaces:**
- Produces (stable contract — WS-F depends on it):

```ts
export type GenerationJobSnapshot = {
  jobId: string;
  type: string;                                   // AI_GENERATE | AI_HYDRATE | PUBLISH
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  stage: string | null;
  correlationId: string | null;
  options: Array<{
    index: number; approach: string; explanation: string; recipe: unknown;
    score?: number; qualityBadges: string[]; generationMode?: string;
  }>;                                             // VALID options only, ordered by index
  recommendedIndex: number | null;                // from Job.result
  result: unknown | null;                         // parsed Job.result (hydrate/publish consumers)
  error: { error: string; message: string; requestId?: string } | null; // parsed AppErrorPayload (fallback: INTERNAL_ERROR wrap of legacy String errors)
};
```

- `JobService.getForShop(jobId: string, shopDomain: string)` → Job row + `generationOptions` where `job.shop.shopDomain === shopDomain` (else null). Jobs with `shopId == null` are NOT visible through this route.

- [ ] **Step 1: Failing test** — mock authenticate + prisma; assert: (a) unknown job or other shop's job → 404 `NOT_FOUND` AppError payload; (b) RUNNING job with 2 VALID + 1 FAILED option rows → snapshot has 2 options ordered by idx with parsed recipes/badges, `status:'RUNNING'`, `stage:'generating'`; (c) FAILED job with `error` holding an AppErrorPayload JSON → `error.error === 'NO_VALID_OPTIONS'`; with a legacy plain-string error → wrapped as `{ error: 'INTERNAL_ERROR', message: <string> }`; (d) SUCCESS job → `recommendedIndex` from parsed `Job.result`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** loader: `authenticate.admin` → `getForShop` → map rows (`JSON.parse` recipes/badges defensively — a corrupt row becomes a skipped option, never a 500) → `json(snapshot, { headers: { 'cache-control': 'no-store' } })`. No action export.
- [ ] **Step 4: Run** — PASS; **`pnpm --filter web build`**.
- [ ] **Step 5: Commit** — `git commit -am "feat(ws-c): generation job poll route — snapshot with persisted options (reconnect-safe)"`

---### Task 7: Client — enqueue + poll in `/generate`, reconnect without re-spend

**Files:**
- Create: `apps/web/app/utils/job-poll.ts`
- Modify: `apps/web/app/routes/generate._index.tsx`
- Create: `apps/web/app/__tests__/job-poll.test.ts`

**Interfaces:**
- Produces (client-safe, no `.server` imports):

```ts
export type PolledJobSnapshot = { /* GenerationJobSnapshot shape, structurally typed */ };
export async function pollJobUntilTerminal(
  jobId: string,
  opts: {
    intervalMs?: number;                       // default 1500
    fetcher?: typeof fetch;                    // test seam
    onSnapshot?: (s: PolledJobSnapshot) => void;
    signal?: AbortSignal;
  },
): Promise<PolledJobSnapshot>;                  // resolves on SUCCESS|FAILED; transient fetch failures retry (poll is idempotent)
```

- Consumes: `POST /api/ai/generate-async`, `GET /api/ai/jobs/:jobId` (T5/T6); loader flag `asyncGeneration` from `isAsyncJobsEnabled()`.

- [ ] **Step 1: Failing test** — `app/__tests__/job-poll.test.ts` with a fake `fetcher` returning RUNNING (1 option) → RUNNING (2 options) → SUCCESS; assert `onSnapshot` called 3×, resolves with terminal snapshot; a rejected fetch mid-sequence retries instead of throwing; `signal.abort()` rejects with an `AbortError`-named error. Use `vi.useFakeTimers()`.
- [ ] **Step 2: Run** — FAIL. Implement `job-poll.ts` (plain loop: fetch → onSnapshot → terminal? resolve : sleep interval; wrap fetch errors as retry-with-backoff capped at 5s; honor signal). Run → PASS.
- [ ] **Step 3: Wire `/generate`** — in `generate._index.tsx`:
  - Loader: add `asyncGeneration: isAsyncJobsEnabled()` to the loader payload (import from `~/services/jobs/enqueue.server` — loader-only, keep out of client bundle).
  - Add `asyncGenerate` callback alongside `streamGenerate` (line 549): build the same FormData (incl. `withGenerationCorrelationId(fd, crypto.randomUUID())`); `POST /api/ai/generate-async`; on `{ jobId, correlationId }` store `sessionStorage.setItem('sa:gen:active', JSON.stringify({ jobId, correlationId, prompt: seedPrompt }))` and remember `correlationId` in a ref (`genCorrelationIdRef`) for Task 13's save stamping; then `pollJobUntilTerminal(jobId, { onSnapshot })` where `onSnapshot` maps `snapshot.options` → the existing `collected`/`applyOptions` shape (reuse the mapping used for SSE `option` frames, and `recommendedIndex` → the `ranking` mapping at lines 592–597). Terminal: SUCCESS → clear sessionStorage; FAILED → `setGenError(snapshot.error?.message ?? 'Generation failed.')`, `setPhase('failed')`, clear sessionStorage. On enqueue 503 `ASYNC_DISABLED` or transport failure → fall through to `streamGenerate()` (inline path unchanged).
  - The kick-off effect (line 650): choose `asyncGeneration ? asyncGenerate : streamGenerate`. Before enqueueing, if `sessionStorage['sa:gen:active']` exists and its `prompt === seedPrompt`, RESUME by polling that jobId instead of enqueueing (**this is the dropped-connection = re-fetch, not re-spend behavior** [AI-3]).
- [ ] **Step 4: Run** — `npx vitest run app/__tests__/job-poll.test.ts` → PASS; full suite; **`pnpm --filter web build`** → clean (loader/client split is exactly what the build gate catches).
- [ ] **Step 5: Commit** — `git commit -am "feat(ws-c): generate UI enqueues + polls async jobs; reload/reconnect resumes the same job without re-spending"`

---

### Task 8: Hydrate as a job — processor, route enqueue, retry-safe billing

**Files:**
- Modify: `apps/web/app/services/jobs/job-payloads.server.ts` (`WebAiHydrateJobPayloadSchema`)
- Create: `apps/web/app/services/jobs/processors/ai-hydrate.processor.server.ts`
- Modify: `apps/web/app/services/jobs/processors/index.ts` (dispatch `AI_HYDRATE`)
- Modify: `apps/web/app/routes/api.ai.hydrate-module.tsx`
- Modify: `apps/web/app/services/ai/llm.server.ts` (`hydrateRecipeSpec` billing dedupe + failed-attempt requestCount 0)
- Modify: `apps/web/app/services/observability/ai-usage.service.ts` (`hasBilledUnit(correlationId, opts?: { action?: string })`)
- Modify: `apps/web/app/routes/modules.$moduleId.tsx` (poll on `{ async: true, jobId }`)
- Create: `apps/web/app/__tests__/ai-hydrate-processor.test.ts`

**Interfaces:**
- `WebAiHydrateJobPayloadSchema = z.object({ kind: z.literal('WEB_AI_HYDRATE'), shopId, shopDomain, moduleId, versionId, moduleType: z.string(), trace: JobTraceSchema })`.
- `hydrateRecipeSpec(recipeSpec, options?)` gains `options.billingKey?: string` — when set, the success write claims its unit via `hasBilledUnit(billingKey, { action: 'RECIPE_HYDRATE' })` (0 if already billed) and stamps `correlationId: billingKey` on its AiUsage rows; failed attempts write `requestCount: 0` (C8). Worker passes `billingKey: `hydrate:${envelope.id}`` — BullMQ retry reuses the job id, so attempt 2 bills 0.
- Route contract: queue mode → `202 { async: true, jobId }`; inline mode → today's synchronous `{ ok, validationReport, hydratedAt }` unchanged. Already-hydrated fast path (route lines 54–68) stays synchronous in both modes.
- Job correlationId: `mod.generationCorrelationId ?? undefined` (falls back to request ctx) — the funnel spine (Task 13).

- [ ] **Step 1: Failing tests** — `ai-hydrate-processor.test.ts`:
  - processor parses payload, `jobs.start`, loads the version, calls a mocked `hydrateRecipeSpec` with `billingKey: 'hydrate:<jobId>'` and `deadlineAt` ≈ now + `getHydrateJobBudgetMs()`, persists the envelope onto `moduleVersion` (same field mapping as the current route lines 95–107 — assert `adminConfigSchemaJson`/`validationReportJson`/`hydratedAt` written), `jobs.succeed` with `{ validationOverall }`;
  - hydrate throw → `failWithPayload` (AppError-shaped) + `{ status: 'FAILED' }`;
  - billing unit test (in the same file, against the real `hydrateRecipeSpec` with a `StubLlmClient`-style mocked client + mocked `AiUsageService`): first successful attempt records `requestCount: 1` with `correlationId === billingKey`; with `hasBilledUnit` returning true, records `requestCount: 0`; a failed-then-successful sequence records `RECIPE_HYDRATE_FAILED` with `requestCount: 0`.
- [ ] **Step 2: Run** — FAIL. Implement: `hasBilledUnit` gains the optional `action` filter (adds `action` to the Prisma `where` when provided — existing callers unaffected); `hydrateRecipeSpec` change is surgical (lines 2769–2799): success `requestCount: await (options?.billingKey ? … claim … : 1)`, failure `requestCount: 0`, both pass `correlationId: options?.billingKey`. Processor mirrors the route body (validate spec from `specJson`, run, update version) inside `runWithRequestContext`. Route: when `isAsyncJobsEnabled()`, after the existing checks and Job creation (add `correlationId: mod.generationCorrelationId ?? undefined` to `jobs.create` and payload `trace`), enqueue (`jobType: 'AI_HYDRATE'`, `opts: { attempts: 2 }`) and return `json({ async: true, jobId: job.id }, { status: 202 })`.
- [ ] **Step 3: Client** — `modules.$moduleId.tsx`: in the `hydrateFetcher` effect (lines 515–521), handle `data?.async && data.jobId`: `pollJobUntilTerminal(jobId)` → SUCCESS: `revalidator.revalidate()` + success toast; FAILED: toast `snapshot.error?.message`. Guard against duplicate polls with a ref.
- [ ] **Step 4: Run** — targeted tests PASS; full suite; **`pnpm --filter web build`**.
- [ ] **Step 5: Commit** — `git commit -am "feat(ws-c): hydrate as a worker job — retry-safe billing (failed attempts bill 0), module UI polls"`

---

### Task 9: Publish as a job (flag-gated) on the WS-E surface

Plan against the MERGED WS-E state: `PublishService.publish` returns `{ compiledJson?, preflight, ledger }` and throws `PublishPartialFailureError { failedOp, completed[] }`; `api.publish.tsx` runs preflight/validation/quota then publishes inline (worktree lines ~200–300). This task moves the Shopify-writing phase onto the worker behind `PUBLISH_ASYNC_ENABLED` (C10); all pre-checks stay in the route (they need the request's `admin` + produce immediate 4xx feedback).

**Files:**
- Modify: `apps/web/app/services/jobs/job-payloads.server.ts` (`WebPublishJobPayloadSchema`)
- Create: `apps/web/app/services/jobs/processors/publish.processor.server.ts`
- Modify: `apps/web/app/services/jobs/processors/index.ts` (register `'publish'` queue handler)
- Modify: `apps/web/app/routes/api.publish.tsx` (queue-mode branch)
- Modify: `apps/web/app/routes/modules.$moduleId.tsx` (`?publishing=<jobId>` poll)
- Modify: `apps/web/app/env.server.ts` (`isPublishAsyncEnabled()`, `PUBLISH_JOB_BUDGET_MS` getter)
- Create: `apps/web/app/__tests__/publish-processor.test.ts`

**Interfaces:**
- `WebPublishJobPayloadSchema = z.object({ kind: z.literal('WEB_PUBLISH'), shopId, shopDomain, moduleId, versionId, target: z.unknown() /* DeployTarget, revalidated by PublishService */, source: z.enum(['merchant_api','agent_api','system']), idempotencyKey: z.string().min(8), trace: JobTraceSchema })`. The spec is **re-read from `moduleVersion.specJson` on the worker** (never trusted from the queue payload — the DB is the source of truth).
- Processor sequence (mirrors the route's post-preflight body, worktree `api.publish.tsx:239–300`): `jobs.start` → `unauthenticated.admin(shopDomain)` → parse spec → `new PublishService(admin, { shop: shopDomain, shopId }).publish(spec, target)` → `provisionModuleDataStore` (non-fatal, same semantics) → `markPublishedWithTransition` (same `idempotencyKey`) → ActivityLog `MODULE_PUBLISHED` → `getThemeEmbedStatus` (advisory) → `jobs.succeed(job.id, { ok: true, ledger, embedStatus })`.
- `PublishPartialFailureError` → `failWithPayload({ error: 'PUBLISH_ERROR', message: e.message, details: { failedOp: e.failedOp, completed: JSON.stringify(e.completed) } })` — the "republish is safe" guidance in `e.message` reaches the merchant verbatim.
- Route: when `isAsyncJobsEnabled() && isPublishAsyncEnabled()` — after ALL existing pre-checks (validation, `enforcePublishCap`, preflight) and the existing `jobs.create` (add `correlationId: module.generationCorrelationId ?? undefined`), enqueue (`jobType: 'PUBLISH'`, `opts: { attempts: 1 }` — publish retries are a human decision, republish-idempotence makes the manual retry safe) and `redirect(\`/modules/${module.id}?publishing=${job.id}\`)`. Flag off → inline path byte-identical.

- [ ] **Step 1: Failing test** — `publish-processor.test.ts`: mock `~/shopify.server`, `PublishService` (capture ctor session + publish args; one test throws a real `PublishPartialFailureError('FUNCTION_CONFIG_UPSERT', [{ op: 'THEME_MODULE_UPSERT' }], new Error('x'))`), `ModuleService.markPublishedWithTransition`, prisma. Assert the sequence order (publish BEFORE markPublished — drift rule), the success `Job.result` carries `ledger` + `embedStatus`, the partial-failure path persists `failedOp`/`completed` in the error payload and does NOT call `markPublishedWithTransition`.
- [ ] **Step 2: Run** — FAIL. Implement processor + route branch + `env.server.ts` flags.
- [ ] **Step 3: Client** — `modules.$moduleId.tsx`: on mount, if `?publishing=` param present, poll; SUCCESS → strip the param, revalidate, toast "Published" (+ embed hint when `result.embedStatus !== 'enabled'`, matching WS-E's banner semantics); FAILED → toast `error.message` (which carries WS-E's republish-converges guidance).
- [ ] **Step 4: Run** — targeted PASS; full suite; **`pnpm --filter web build`**.
- [ ] **Step 5: Commit** — `git commit -am "feat(ws-c): publish as a worker job behind PUBLISH_ASYNC_ENABLED — WS-E ledger/partial-failure surfaced through Job polling"`

---

### Task 10: End-to-end deadline budgets via hints

**Files:**
- Modify: `apps/web/app/services/ai/llm.server.ts` (`GenerateHints.deadlineAt`; thread through `generateValidatedRecipeOptionsStream` / `generateValidatedRecipeOptionsParallel` / `generateValidatedRecipeOptions` / `generateValidatedBlueprint` / `hydrateRecipeSpec` option bags into every `client.generateRecipe(prompt, hints)` call)
- Modify: `apps/web/app/services/ai/http/ai-http.server.ts` (deadline-aware timeout)
- Modify: `apps/web/app/services/ai/clients/anthropic-messages.client.server.ts`, `openai-responses.client.server.ts` (accept + forward `deadlineAt`)
- Modify: `apps/web/app/routes/api.ai.create-module.stream.tsx` (inline path passes `deadlineAt: requestStart + 55_000`)
- Create: `apps/web/app/__tests__/deadline-budget.test.ts`

**Interfaces:**
- `GenerateHints` gains `deadlineAt?: number` (epoch ms). `ConfiguredLlmClient.callProvider` computes `timeoutMs = hints?.deadlineAt ? Math.max(5_000, Math.min(120_000, hints.deadlineAt - Date.now())) : undefined` and passes it to each provider client; if `deadlineAt - Date.now() < 5_000` it throws `new AppError({ code: 'PROVIDER_ERROR', message: 'Generation deadline exhausted before the provider call could start. Please try again.' })` instead of firing a call that cannot finish.
- `aiHttp` opts gain `deadlineAt?: number`; effective timeout = `min(timeoutMs ?? 120_000, deadlineAt - now)`.
- Worker budgets already set in Tasks 5/8/9 (`GENERATION_JOB_BUDGET_MS` 150s, `HYDRATE_JOB_BUDGET_MS` 90s, `PUBLISH_JOB_BUDGET_MS` 120s reserved).

- [ ] **Step 1: Failing test** — assert (a) `ConfiguredLlmClient`-level: with a mocked provider call capturing opts, `deadlineAt = now + 30_000` yields `timeoutMs` in `[25_000, 30_000]`; (b) exhausted deadline throws the typed AppError without invoking the provider; (c) `hydrateRecipeSpec({ deadlineAt })` forwards it into hints (mock client captures).
- [ ] **Step 2: Run** — FAIL. Implement (small surgical threads — every `generateRecipe(` call site inside llm.server.ts already builds a hints object; add the field).
- [ ] **Step 3: Run** — PASS; full suite; **`pnpm --filter web build`** (stream route touched).
- [ ] **Step 4: Commit** — `git commit -am "feat(ws-c): end-to-end deadline budgets threaded via GenerateHints.deadlineAt"`

---

### Task 11: Provider concurrency caps, honored retry-after, staggered fan-out

**Files:**
- Create: `apps/web/app/services/ai/provider-concurrency.server.ts`
- Modify: `apps/web/app/services/ai/llm.server.ts` (wrap `ConfiguredLlmClient.callProvider`; stagger option fan-out in `generateValidatedRecipeOptionsStream` + `generateValidatedRecipeOptionsParallel`)
- Modify: `apps/web/app/services/ai/http/ai-http.server.ts` (retry-after budget)
- Create: `apps/web/app/__tests__/provider-concurrency.test.ts`

**Interfaces:**

```ts
// provider-concurrency.server.ts — process-local semaphore per provider key.
// Caps CONCURRENT in-flight LLM calls per provider (worker fan-out × concurrency
// would otherwise burst 3×WORKER_CONCURRENCY calls at one provider).
export function getProviderConcurrencyCap(): number;   // AI_PROVIDER_MAX_CONCURRENT, default 4
export function getOptionCallStaggerMs(): number;      // OPTION_CALL_STAGGER_MS, default 350
export async function withProviderSlot<T>(providerKey: string, fn: () => Promise<T>): Promise<T>;
export function __resetProviderSlotsForTest(): void;
```

- `ConfiguredLlmClient.callProvider` body wraps the provider dispatch: `return withProviderSlot(this.provider.id ?? kind, () => …existing dispatch…)`.
- Stagger: in both fan-out paths, each option task begins with `if (idx > 0) await sleep(idx * getOptionCallStaggerMs())` — smears 3 simultaneous prompt bursts across ~700ms so provider-side rate limiters see a ramp, not a spike [AI-imp].
- `aiHttp` 429 handling: `max429Retries` = 1 when no `deadlineAt`, else up to 3 while `deadlineAt - now > retryAfterMs + 5_000`; per-sleep cap becomes `min(retryAfterMs ?? 5_000, 30_000, deadlineAt - now - 5_000)` (the tunnel-era 10s cap only applies when there is no deadline — inline mode passes a 55s deadline so it stays tight).

- [ ] **Step 1: Failing test** — (a) semaphore: cap 2, launch 4 `withProviderSlot` tasks resolving on manual triggers → at most 2 concurrently active (track a counter), all 4 complete, FIFO admission; different keys don't share a cap; (b) a task that throws releases its slot; (c) stagger: mock timers, assert task idx 2 starts ≥ `2 * getOptionCallStaggerMs()` after idx 0 (test via an exported helper or by invoking the fan-out with a stubbed client capturing call timestamps); (d) aiHttp: with `deadlineAt = now + 90_000` and two 429 responses carrying `retry-after: 20`, the third attempt fires (2 sleeps of 20s honored under fake timers) — with no deadline, behavior is unchanged (single retry ≤ 10s).
- [ ] **Step 2: Run** — FAIL. Implement.
- [ ] **Step 3: Run** — PASS; full suite (watch the llm.server tests — stagger must not break `generateValidatedRecipeOptionsStream` unit expectations; use `getOptionCallStaggerMs()` reading env at call time so tests can set `OPTION_CALL_STAGGER_MS=0`).
- [ ] **Step 4: Commit** — `git commit -am "feat(ws-c): per-provider concurrency caps, deadline-aware retry-after, staggered option fan-out"`

---

### Task 12: Hydrate hardening — structured output, truncation detection, fence-strip

Today `hydrateRecipeSpec` sends prose "Output only the JSON" and raw-parses the reply: a fenced or truncated response burns a full billed retry. Three hardenings [AI-imp]:

**Files:**
- Create: `apps/web/app/services/ai/hydrate-envelope-schema.server.ts`
- Create: `apps/web/app/services/ai/clients/truncation.server.ts`
- Modify: `apps/web/app/services/ai/tolerant-json.server.ts` (export `stripCodeFences`)
- Modify: `apps/web/app/services/ai/judge-polish.server.ts`, `template-delta.server.ts` (delete local copies, import shared)
- Modify: `apps/web/app/services/ai/clients/anthropic-messages.client.server.ts` (stop_reason check)
- Modify: `apps/web/app/services/ai/clients/openai-responses.client.server.ts` (throw the shared class)
- Modify: `apps/web/app/services/ai/llm.server.ts` (`hydrateRecipeSpec`: responseSchema + fence-strip + truncation-aware retry)
- Create: `apps/web/app/__tests__/hydrate-hardening.test.ts`

**Interfaces:**

```ts
// truncation.server.ts
export class TruncatedOutputError extends Error {
  readonly code = 'OUTPUT_TRUNCATED';
  constructor(readonly provider: string, readonly detail: string) {
    super(`${provider} output was truncated (${detail}). The response cannot be parsed as complete JSON.`);
    this.name = 'TruncatedOutputError';
  }
}

// hydrate-envelope-schema.server.ts
export function getHydrateEnvelopeJsonSchema(): { name: string; schema: Record<string, unknown> };
// zodToJsonSchema(HydrateEnvelopeSchema, { $refStrategy: 'none' }), name 'emit_hydrate_envelope' —
// same mechanic as recipe-json-schema.server.ts:282.

// tolerant-json.server.ts
export function stripCodeFences(text: string): string;   // moved verbatim from judge-polish.server.ts:145
```

- Anthropic client: after parsing the response JSON, `if (json?.stop_reason === 'max_tokens') throw new TruncatedOutputError('Anthropic', 'stop_reason=max_tokens')` (before `extractText`). OpenAI client lines 135–148: replace the two `new Error('OpenAI output truncated …')` throws with `new TruncatedOutputError('OpenAI', reason)` (message-compatible).
- `hydrateRecipeSpec` changes: pass `responseSchema: getHydrateEnvelopeJsonSchema()` in hints (Anthropic → forced tool_use; OpenAI → structured output — both clients already accept `responseSchema`); parse via `JSON.parse(stripCodeFences(rawJson))`; catch `TruncatedOutputError` around the client call — record the failed attempt (`requestCount: 0` per Task 8) and retry with `maxTokens: Math.min(24_000, Math.round(budget * 1.5))`; the terminal failure message becomes the friendly `AppError({ code: 'OUTPUT_TRUNCATED', … })` when the last error was truncation.

- [ ] **Step 1: Failing test** — (a) `stripCodeFences('```json\n{"a":1}\n```')` → `'{"a":1}'` and idempotent on bare JSON; (b) a mocked client returning a fenced valid envelope → hydrate succeeds first attempt (no retry recorded); (c) mocked Anthropic raw response with `stop_reason: 'max_tokens'` → client throws `TruncatedOutputError`; (d) hydrate with a client that throws `TruncatedOutputError` then succeeds → second call's hints `maxTokens === 24_000`, one `RECIPE_HYDRATE_FAILED` row with `requestCount: 0`; (e) hints passed to the first call include `responseSchema.name === 'emit_hydrate_envelope'`.
- [ ] **Step 2: Run** — FAIL. Implement. Verify no other caller of the deleted local `stripCodeFences` copies remains: `grep -rn "stripCodeFences" apps/web/app | grep -v tolerant-json` → only imports.
- [ ] **Step 3: Run** — PASS; full suite; `pnpm --filter web evals` still exit 0.
- [ ] **Step 4: Commit** — `git commit -am "feat(ws-c): hydrate hardening — structured output schema, TruncatedOutputError with budget-bumping retry, shared fence-strip"`

---

### Task 13: Funnel spine — correlationId from generation through publish

**Files:**
- Modify: `apps/web/app/routes/api.ai.create-module-from-recipe.tsx` (stamp `Module.generationCorrelationId`)
- Modify: `apps/web/app/routes/generate._index.tsx` (send `correlationId` on save)
- Modify: `apps/web/app/routes/api.publish.tsx` (Job correlationId inheritance — inline path too; Task 8 already covered hydrate)
- Create: `apps/web/app/services/observability/funnel.service.ts`
- Create: `apps/web/app/__tests__/funnel-service.test.ts`

**Interfaces:**

```ts
export type FunnelStats = {
  windowDays: number;
  classified: number;   // AI_GENERATE jobs created in window
  optioned: number;     // …that reached SUCCESS (≥1 valid option)
  hydrated: number;     // …whose correlationId has an AI_HYDRATE SUCCESS job
  published: number;    // …whose correlationId has a PUBLISH SUCCESS job
  optionedRate: number; hydratedRate: number; publishedRate: number;
  /** The 99.9% headline: published / classified. */
  endToEndRate: number;
  recentFailures: Array<{ jobId: string; type: string; correlationId: string | null; error: string; createdAt: string; shopDomain: string | null }>;
};

export class FunnelService {
  async windowStats(windowDays?: number): Promise<FunnelStats>;  // default 7, capped scan 5000 jobs
}
```

- Mechanics: fetch AI_GENERATE jobs in window (`select id, correlationId, status`); collect the non-null correlationId set; fetch `AI_HYDRATE`/`PUBLISH` jobs with `status:'SUCCESS', correlationId: { in: [...] }` (window + 30-day grace forward is unnecessary — hydrate/publish jobs are created after generation, query without upper bound); set-intersect in memory. `recentFailures`: latest 20 FAILED jobs of the three types with parsed friendly message (AppErrorPayload-aware).
- Chain stamping: `create-module-from-recipe` reads `form.get('correlationId')` and, when present, `prisma.module.update({ where: { id: mod.id }, data: { generationCorrelationId: correlationId } })` after `createDraft` (no service-signature change). `generate._index.tsx` save (line 852): `fd.set('correlationId', genCorrelationIdRef.current ?? '')` — the ref is set by both the SSE leg (from `withGenerationCorrelationId`) and the async leg (Task 7). `api.publish.tsx` `jobs.create` gains `correlationId: module.generationCorrelationId ?? undefined` on the inline path as well (queue path done in Task 9).

- [ ] **Step 1: Failing test** — seed a prisma mock (or use the pattern of existing service tests with an injected prisma double) with: 4 AI_GENERATE jobs (`corr A` SUCCESS, `corr B` SUCCESS, `corr C` FAILED, `corr D` SUCCESS); AI_HYDRATE SUCCESS for A and B; PUBLISH SUCCESS for A. Assert `classified 4, optioned 3, hydrated 2, published 1`, `endToEndRate 0.25`, failure list contains C with its parsed message. Second test: create-module-from-recipe route stamps `generationCorrelationId` (mocked prisma captures the update) and omits the update when the field is absent.
- [ ] **Step 2: Run** — FAIL. Implement.
- [ ] **Step 3: Run** — PASS; full suite; **`pnpm --filter web build`** (routes touched).
- [ ] **Step 4: Commit** — `git commit -am "feat(ws-c): funnel spine — generationCorrelationId chains generate→hydrate→publish; FunnelService window stats"`

---

### Task 14: Internal funnel dashboard (vendored page-kit — NOT Polaris)

**Files:**
- Create: `apps/web/app/routes/internal.funnel.tsx`
- Modify: `apps/web/app/routes/internal.tsx` (ADMIN_NAV Operations: `{ url: '#/admin/funnel', label: 'Funnel', icon: 'chart' }` after Jobs)
- Modify: `apps/web/app/components/superapp/CommandPalette.tsx` (entry: `{ type: 'Operations', icon: 'chart', title: 'Generation Funnel', sub: 'Prompt→publish success rate', route: '#/admin/funnel', kw: 'funnel success rate ai generation' }` — `superappRoute` maps it generically)
- Create: `apps/web/app/__tests__/internal-funnel-route.test.ts`

**Interfaces:**
- Loader: `requireInternalAdmin(request)`; query params `days` (7 default, allow 1/7/30); returns `{ stats: FunnelStats, qa: QaTelemetrySummary }` (QA data arrives in Task 15 — until then the loader returns `qa: null` and the section renders an EmptyState).
- UI (page-kit idioms exactly as `internal.jobs.tsx`): `PageHead` ("Generation funnel", subtitle with window switcher via `FilterBar`), a `StatTile` row — Classified / Optioned / Hydrated / Published with rates, plus an `endToEndRate` headline tile (tone `critical` < 0.5, `warning` < 0.9, `success` otherwise); a `DataTable` of `recentFailures` with `MonoChip` correlationId linking to `#/admin/jobs?correlationId=<id>` (the jobs page already filters by correlationId — `internal.jobs.tsx:34`).

- [ ] **Step 1: Failing test** — loader test: mocked `requireInternalAdmin` + `FunnelService` returning the Task-13 fixture; assert loader payload shape and that `days=30` is forwarded. (Internal routes are tested loader-level in this repo — follow `internal.jobs` conventions if a test exists; otherwise loader-only.)
- [ ] **Step 2: Run** — FAIL. Implement route + nav + palette.
- [ ] **Step 3: Run** — PASS; **`pnpm --filter web build`**; visual smoke: `pnpm --filter web dev` (or existing dev launch) → `/internal` → Funnel page renders tiles + table (light theme — internal admin is LIGHT-ONLY).
- [ ] **Step 4: Commit** — `git commit -am "feat(ws-c): internal generation-funnel dashboard (vendored page-kit)"`

---

### Task 15: QA telemetry aggregation + promote-to-blocking

**Files:**
- Modify: `apps/web/app/services/ai/llm.server.ts` (`OptionQaSummary.issueIds`; `qaCounts` collects ids; `runAllQaGates` escalates promoted ids; thread `promotedBlockingIssueIds` from the fan-out options into the QA context)
- Modify: `apps/web/app/services/ai/generation-pipeline.server.ts` (load promoted ids once per run via `QaTelemetryService`, pass through)
- Create: `apps/web/app/services/observability/qa-telemetry.service.ts`
- Modify: `apps/web/app/routes/internal.funnel.tsx` (QA section + promote/demote action)
- Create: `apps/web/app/__tests__/qa-telemetry.test.ts`

**Interfaces:**

```ts
// qa-telemetry.service.ts
export type QaIssueStat = { issueId: string; count: number; promoted: boolean };
export type QaTelemetrySummary = { windowDays: number; totalOptions: number; topIssues: QaIssueStat[] };

export class QaTelemetryService {
  /** Aggregates AiGenerationOption.qaIssuesJson over the window (top 20 by count). */
  async topIssues(windowDays?: number): Promise<QaTelemetrySummary>;
  /** Reads AppSettings.qaPromotedBlockingIssueIds (JSON string[]; [] on null/corrupt). */
  async getPromotedBlockingIssueIds(): Promise<string[]>;
  /** Adds/removes an id; persists via SettingsService-style singleton update; audited by the caller. */
  async setPromoted(issueId: string, promoted: boolean): Promise<string[]>;
}
```

- `OptionQaSummary` gains `issueIds?: string[]` (additive — `option-ranking.server.ts` reads only counts, unaffected). `qaCounts` pushes `issue.id` for every non-autofixed `fail`/`warn` issue.
- `runAllQaGates(recipe, ctx)` escalation: after merging issues, `const promoted = ctx?.promotedBlockingIssueIds; if (promoted?.size) issues = issues.map(i => promoted.has(i.id) && i.severity === 'warn' ? { ...i, severity: 'fail' as const } : i);` then recompute `pass`. `QaGateContext` gains `promotedBlockingIssueIds?: Set<string>`; the fan-out option-generation paths thread it from their options bag (`options.promotedBlockingIssueIds?: string[]`), which the pipeline populates. **This is the "top render-fails promoted to blocking" mechanism**: a promoted issue makes the existing corrective-regeneration loop fire (and the option ranker penalize) instead of shipping the broken option.
- Processor (Task 5) already persists `qaIssuesJson` from `option.qaSummary.issueIds` — verify the field flows now that it exists.
- Funnel page action: `intent=promote|demote&issueId=…` → `requireInternalAdmin` → `QaTelemetryService.setPromoted` → `ActivityLogService.log({ actor: 'INTERNAL', action: 'QA_ISSUE_PROMOTION', resource: \`qa:${issueId}\`, details: { promoted } })` → redirect back. QA section UI: `DataTable` of `topIssues` with count, promoted `Badge`, and a `Btn` Promote/Demote per row (ConfirmDialog on promote — it changes generation behavior globally).

- [ ] **Step 1: Failing test** — (a) `qaCounts` (exported for test or asserted via `runAllQaGates` on a recipe fixture that trips a known warn issue id from `design-qa.server.ts`) returns `issueIds` containing that id; (b) with `promotedBlockingIssueIds: new Set([thatId])` the same recipe's `runAllQaGates` result has `pass === false` and the issue's severity is `'fail'`; (c) `topIssues` aggregation over three seeded option rows (`["a","b"]`, `["a"]`, null) → `a:2, b:1`, `promoted` flag reflects settings; (d) `setPromoted` round-trips JSON and de-dupes.
- [ ] **Step 2: Run** — FAIL. Implement.
- [ ] **Step 3: Run** — PASS; full suite; **`pnpm --filter web build`** (funnel route touched).
- [ ] **Step 4: Commit** — `git commit -am "feat(ws-c): QA telemetry aggregation with ops-promotable blocking issue ids feeding the regeneration loop"`

---

### Task 16: Friendly terminal errors — AppError everywhere on the AI surface

Sweep the AI routes to the typed `AppError → toResponse` contract [the "friendly terminal errors" bullet]. Today `api.ai.create-module.tsx:299` returns `json({ error: e.message }, 500)` (raw internals to merchants) and the stream route emits untyped frames.

**Files:**
- Modify: `apps/web/app/routes/api.ai.create-module.tsx`, `api.ai.create-module.stream.tsx`, `api.ai.hydrate-module.tsx`, `api.ai.modify-module.tsx`, `api.ai.create-module-from-recipe.tsx`, `api.ai.fill-settings.tsx`
- Modify: `apps/web/app/routes/generate._index.tsx` (render `message` + `requestId` in the failed state)
- Create: `apps/web/app/__tests__/ai-routes-app-error.test.ts`

**Contract (apply uniformly):**
- Every catch block: `AiProviderNotConfiguredError` → `AppError({ code: 'AI_PROVIDER_NOT_CONFIGURED', message: e.message }).toResponse()` with the existing `setupUrl` merged into `details`; 429-shaped provider errors → `AppError({ code: 'RATE_LIMITED', message: 'AI providers are busy right now. Wait a moment and try again — this attempt was not billed.' })`; `TruncatedOutputError` → `OUTPUT_TRUNCATED` (502) with "Try again — the model returned an incomplete answer."; everything else → `toErrorResponse(e)` (production hides internals, dev shows them — already implemented at `app-error.server.ts:91`).
- Stream terminal `error` frames become `{ code, message, requestId }` (AppErrorPayload minus details) — the client at `generate._index.tsx:617–621` reads `payload.message` already; add `requestId` display ("Reference: req_… ") in the failed-phase UI so support can correlate (`ApiLog.requestId` spine).
- `jobs.fail(job.id, e)` call sites in these routes switch to `failWithPayload` with the same payload the response carries — the Job ledger and the merchant now always tell the same story.

- [ ] **Step 1: Failing test** — for the batch route: mocked pipeline throw of (a) generic `Error('ECONNRESET at …')` in production-NODE_ENV → 500 body `{ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId: expect.stringMatching(/^req_/) }` (no stack/internals); (b) rate-limit-shaped error → 429 `RATE_LIMITED` with the friendly copy; (c) `AiProviderNotConfiguredError` → 503 with `details.setupUrl`. For the hydrate route: error → 422 AppError payload (not the current bare `{ error: String(e) }`).
- [ ] **Step 2: Run** — FAIL. Implement the sweep.
- [ ] **Step 3: Run** — PASS; full suite; **`pnpm --filter web build`**.
- [ ] **Step 4: Commit** — `git commit -am "feat(ws-c): AppError→toResponse across the AI surface; Job.error and merchant responses tell one story"`

---

### Task 17: Remove `StubAiGenerationAdapter`; V2 decoupling complete

The real generation adapter now lives in apps/web (Task 5). Delete the stub so nothing can ever ship stub recipes again, and prove apps/web is V2-free.

**Files:**
- Modify: `apps/workers/src/ai-generation.ts` (delete `StubAiGenerationAdapter` class, lines 50–104)
- Modify: `apps/workers/src/processors.ts` (adapter becomes a REQUIRED option — `createProcessors` throws `'AI generation adapter is required; the stub was removed by WS-C (real processors live in apps/web)'` when absent; delete the stub import)
- Modify: `apps/workers/src/__tests__/ai-generation.test.ts`, `processors.test.ts` (replace stub usage with a local test-double adapter; keep the boundary-validation assertions)
- Modify: `.claude/worktrees/focused-mccarthy-e3dc9a` — NOT touched (stale worktree, WS-I deletes it)
- Verify (no change expected): `apps/web/app/__tests__/image-storage-port.test.ts` guard still green

**Interfaces:** none new — `AiGenerationAdapter` interface stays (V2 tests use a local double).

- [ ] **Step 1: Failing test** — in `apps/workers/src/__tests__/processors.test.ts` add: constructing processors without an AI adapter throws `/stub was removed/`. Run `pnpm --filter @superapp/workers test` → FAIL (stub still auto-defaults).
- [ ] **Step 2: Implement** the deletions; `grep -rn "StubAiGenerationAdapter" apps packages --include='*.ts' | grep -v worktrees` → zero hits.
- [ ] **Step 3: Run** — `pnpm --filter @superapp/workers test` → PASS; `pnpm --filter @superapp/workers typecheck`; apps/web full suite untouched-green; the Task-2 guard test still passes.
- [ ] **Step 4: Commit** — `git commit -am "chore(ws-c): remove StubAiGenerationAdapter — real generation runs in apps/web; V2 apps are delete-ready for WS-I"`

---

### Task 18: Rollout + live verification (owner-run steps marked)

Flip production to queue mode and prove the 99.9%-engine loop end-to-end on the live store.

**Files:** none (Railway config + verification); update `docs/superpowers/plans/2026-08-24-launch-program.md` WS-C bullet with a ✅ + commit range at the end.

- [ ] **Step 1 (owner-run — Railway dashboard/CLI):** on BOTH the web and worker services set `JOB_EXECUTION_MODE=queue`; confirm the worker service has the FULL web env set (it now boots `shopify.server.ts`/Prisma: `DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL`, `QUEUE_REDIS_URL`/`REDIS_URL`, plus AI provider keys) — the WS-A env registry (`validateEnv`) will refuse to boot if anything is missing, which is the desired failure mode. Optionally set `WORKER_CONCURRENCY=3`, `AI_PROVIDER_MAX_CONCURRENT=4`. Leave `PUBLISH_ASYNC_ENABLED` unset (sync publish) until Step 4 passes.
- [ ] **Step 2: Deploy + health** — merge → Railway auto-deploy; `curl https://<worker-domain>/healthz` → `{"ok":true,"role":"worker","redis":"ok"}`; worker logs show `BullMQ workers mounted { queues: ['ai-generation'] … }`.
- [ ] **Step 3 (owner-run): live generation loop** — in the embedded app `/generate`: enter a prompt → options appear progressively (poll path — verify in devtools: `POST /api/ai/generate-async` then repeated `GET /api/ai/jobs/<id>`; NO `/api/ai/create-module/stream` call). **Reconnect probe:** start a generation, close the tab at ~5s, reopen `/generate` with the same prompt → the run RESUMES from the persisted job (no new `generate-async` POST). **Billing probe:** in internal admin → Usage, confirm `AiUsage` rows for that correlationId sum `requestCount = 1`.
- [ ] **Step 4 (owner-run): hydrate + publish + funnel** — save an option → hydrate (202 + poll, validation report lands) → publish (sync). Internal admin → Funnel: the request shows classified→optioned→hydrated→published = 1/1/1/1; the correlationId chip links into Jobs filtered to the full chain. Then set `PUBLISH_ASYNC_ENABLED=true`, republish the module → `?publishing=` poll completes, ledger visible in the Job detail (`#/admin/jobs/<id>`), storefront still renders the module.
- [ ] **Step 5: Failure friendliness probe** — temporarily set an invalid Anthropic key on a DB provider (or use the internal ai-providers test-connection to pick a broken one), run one generation → the merchant sees the typed friendly message with a `req_` reference (fallback provider may serve it — then instead verify by deactivating both providers); restore config. `internal.funnel` recentFailures shows the failure with the same message.
- [ ] **Step 6: Ledger + program file** — mark the WS-C bullet in the launch-program file; commit `docs: WS-C complete (commit range, verification notes)`.

---

## Execution order & shippability

Every task lands green and shippable on its own; production behavior only changes when `JOB_EXECUTION_MODE=queue` is set (Task 18) — until then everything new is dormant (inline mode) or additive.

1. **T1 → T2** (V2 salvage; T2 unblocks WS-I's delete) — T1 and T2 are independent of each other and may run in parallel worktrees (different files).
2. **T3** (schema) → **T4** (pipeline extraction — the pivotal refactor; stream route stays behavior-identical).
3. **T5 → T6 → T7** (job engine: processor → poll → client). After T7 the async path works end-to-end behind the mode flag.
4. **T8** (hydrate) and **T9** (publish; requires WS-E merged) — parallelizable after T6.
5. **T10 → T11 → T12** (hardening: deadlines → concurrency/backoff → hydrate output). T12 is independent of T10/T11 and may run parallel to them.
6. **T13 → T14 → T15** (measurement: spine → dashboard → QA telemetry).
7. **T16** (error sweep — after T5/T8 so the new routes are covered in one pass).
8. **T17** (stub removal — any time after T5; before WS-I).
9. **T18** (rollout — last; owner-run steps marked).

Dependency edges honored: WS-A (merged) provides Redis/worker/Dockerfile; WS-E must merge before T9; WS-I must wait for T2 + T17; WS-F consumes T6's snapshot contract and T7's draft persistence.

## Out of scope (owned elsewhere or explicitly deferred)

- **WS-G**: alerting on `jobs.fail`/DLQ replay/stuck-RUNNING sweep/max-attempts policy — the Job rows and typed error payloads this plan writes are its inputs.
- **WS-F**: publish ceremony polish, generate-flow draft UX beyond the minimal poll wiring, Polaris error-banner styling, removing the legacy stream/batch routes once async is default.
- **AI_MODIFY / blueprints / judge-polish on the worker**: modify + blueprint generation stay inline (their routes are well under budget); the `ai-generation` queue dispatch switch makes adding them later a processor-only change. Judge-polish remains an inline-SSE nicety (flag-gated, off by default).
- **Cost optimizations** (caching, Haiku-routing, cheaper-primary — D10 note): separate WS-C follow-up sized after the funnel dashboard produces baselines.
- **Redis-distributed provider concurrency**: the cap is per-process (web + worker each cap independently); acceptable at launch topology (1 web + 1 worker), revisit at scale.
- **`api.ai.modify-module.tsx` / agent API routes error sweep beyond the listed files**: WS-F/WS-I follow-up.

## Open questions (controller must rule before execution)

1. **Legacy route retirement owner** (C1): the SSE stream + batch routes stay as the inline/dev path. Who deletes them once async is default — WS-F (owns the generate UI) or WS-I (cleanup)? Ruling avoids dead-code drift.
2. **Generation auto-retry cost** (T5): `attempts: 2` means a transient worker failure re-runs the full 3-option LLM fan-out (billed to the merchant once, but real provider cost twice). Confirm cost tolerance, or rule `attempts: 1` (merchant-manual retry only).
3. **Async publish at launch** (C10): is queue-mode publish a WS-C exit criterion, or may `PUBLISH_ASYNC_ENABLED` stay false at submission if the T18 polling-UX check is not fully satisfying (sync publish is seconds and within budgets either way)?
4. **Funnel attribution gaps** (T13): hydrated/published stages rely on the client stamping `generationCorrelationId` at save. Modules created via templates, blueprints, or the agent API won't chain — the funnel undercounts those paths. Acceptable for launch, or should T13 grow agent/blueprint stamping?
5. **Judge-polish stays inline-only** (T4/out-of-scope): the async worker path skips the flag-gated Phase-5c polish (off by default in prod). Confirm, or a follow-up task adds it to the processor.

## Self-review (per house conventions)

- **Spec coverage** — every WS-C bullet mapped: jobs on BullMQ worker replacing inline (T1/T5/T8/T9), V2 salvage before WS-I (T1/T2/T17), options persisted as they validate (T3/T5), client polls/reconnects without re-spend (T6/T7), deadline budget via hints (T10), funnel metric on correlationId + dashboard (T13/T14), hydrate hardening (T12), concurrency caps + retry-after + stagger (T11), QA telemetry + promote-to-blocking (T15), friendly terminal errors (T16), StubAiGenerationAdapter removal (T17), owner-run live verification (T18).
- **Placeholder scan** — no TBDs; the two intentionally deferred wirings are explicit and shippable-empty (`buildWorkerHandlers()` returns `{}` until T5; funnel page renders `qa: null` as EmptyState until T15).
- **Type consistency** — `WebJobHandler`/`JobEnvelope` used by T1/T5/T8/T9; `GenerationJobSnapshot` produced by T6 and consumed by T7/T8/T9 clients; `OptionQaSummary.issueIds` produced in T15 and persisted by T5's processor (T5 writes `null` until T15 lands — the column is nullable); `hasBilledUnit(correlationId, { action? })` extended compatibly (optional second arg).

> **Task 11 scope addition (controller, 2026-08-25, from Task 10 review):** Gemini and CUSTOM/AZURE_OPENAI provider branches in `ConfiguredLlmClient.callProvider` currently get only the fail-fast exhausted-deadline guard, NOT a bounded per-call timeout — thread `deadlineAt`/bounded `timeoutMs` through those client paths as part of Task 11. Also: tag budget-exhausted 5xx/429 non-retries with `deadlineExhausted` for consistency (cosmetic).
