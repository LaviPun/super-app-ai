# WS-G Ops Automation + WS-INT Integrations Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the alert channel actually FIRE (Sentry + email + Slack on API failures, job failures, webhook failures, and triage failures), make DLQ replay do real work instead of writing an inert DB row, close the stuck-RUNNING/webhook-fan-out/triage-latency/shop-redact gaps named in [Ops-1..7]/[Infra-7]/[Infra-11], and give the internal admin a marketplace-style Integrations Hub where every external service (6 AI providers + Sentry/UptimeRobot/Healthchecks.io/email/Slack) is a logo tile with masked-credential entry, live status, and a Test-connection button — built together with WS-G so no tile ever ships without its wire live, and no alert ever fires into a channel the operator can't configure.

**Architecture:** A new `OpsAlertService` (`apps/web/app/services/observability/ops-alert.server.ts`) is the single fan-out point: Sentry (`captureException`/`captureMessage`, already implemented, currently uncalled outside a couple of AI-usage paths) + email (existing `mailer.server.ts`, extended with `resend`/`postmark` providers) + a new Slack incoming-webhook sender, gated by a rolling-window failure-count threshold read from `AppSettings`. Four existing swallow-or-log points get one added line each: `withApiLogging`'s catch (`api-log.service.ts`), `JobService.fail`, the four best-effort `catch` blocks in `webhooks.tsx`, and `notifySupportEvent('triage_failed', …)`. A new Integrations Hub route (`internal.integrations.tsx`) is the config surface: Category 1 mirrors/extends the existing `AiProviderService` + `internal.ai-providers.tsx` machinery (already the sole `AiProvider` writer) with three new OpenAI-compatible provider kinds (Grok, DeepSeek, Mistral — no new HTTP client needed, `llm.server.ts` already treats `CUSTOM`/`AZURE_OPENAI` as OpenAI-compatible); Category 2 is five ops-service tiles, each explicitly decided DB-config vs env-reflect-only per its runtime dependency (Sentry DSN is boot-time env-only → reflect+test; UptimeRobot/Healthchecks.io are read via their status APIs → DB-stored read keys; email/Slack are call-time → full DB config). A minimal, real BullMQ Worker (extending the existing skeleton `apps/web/scripts/worker.ts`) is added for exactly the job kinds this plan owns (`CONNECTOR_TEST`, `FLOW_RUN`, `MESSAGING_RUN`, `HTTP_SYNC_RUN`, two new fan-out kinds) — this is deliberately narrower than WS-C's future full async-generation worker (see Decision G8) so DLQ replay and webhook fan-out become real without blocking on WS-C's landing.

**Tech Stack:** Remix (apps/web), Prisma (Postgres), Vitest, `@sentry/node` (already a dependency), `nodemailer` (already a dependency), BullMQ + ioredis via the existing `@superapp/job-orchestration` package, `simple-icons` (new dependency — inlined SVG, no CDN).

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` — WS-G section, WS-INT section, Decision D5, Global constraints; findings `[Ops-1..7]`, `[Infra-7]`, `[Infra-11]` from the nine-domain audit of 2026-08-24 at `master@6af6df2`.

## Dependencies (plan header — read before executing)

- **Runs after WS-A** (Railway web+worker services, `REDIS_URL`/`QUEUE_REDIS_URL`, live Sentry DSN on both services, healthchecks.io check `superapp-cron`, UptimeRobot monitor on `/healthz`, cron.yml — WS-A Task 10 — merged). Tasks 1–13 (Prisma + `OpsAlertService` + Hub UI + provider dispatch) have no hard WS-A dependency and MAY start in parallel on a dev Redis, but Tasks 14–18 (real worker, webhook fan-out, stuck-RUNNING sweep) need `QUEUE_REDIS_URL` wired, which is WS-A's job.
- **Does NOT wait for WS-C.** WS-C's "generation/hydrate/publish jobs on BullMQ worker" is a separate, much larger migration of the AI-generation request path off inline execution. This plan's worker (Task 14) is scoped narrowly to job kinds this plan already owns end-to-end (`CONNECTOR_TEST`, `FLOW_RUN`, the fan-out kinds) precisely so WS-G is not blocked on WS-C. `AI_GENERATE`/`AI_HYDRATE`/`AI_MODIFY`/`PUBLISH` replay stays honestly unsupported until WS-C/WS-E land their own entrypoints — see Decision G8 and Task 15.
- **Independent of WS-E.** No file in this plan overlaps WS-E's publish/activation surface. `internal.ops.tsx`'s `publish`/`rollback` intents are untouched here — Task 15 only touches the `job_replay`/`job_replay_all` intents in the same file.
- **Ordering with WS-D:** the `AiUsage.costCents` Float migration and pricing/routing work (already landed, see MEMORY `pricing-cost-routing-2026-07`) is unrelated; no conflict.
- All file paths below are repo-relative to `/Users/lavipun/Work/ai-shopify-superapp`.

## Global Constraints

- Internal admin uses the **vendored design system** (`~/components/admin/page-kit`), **NOT** Polaris web components — that's merchant-only. It is **light-only** (dark theme reverted); do not add `data-theme="dark"` styling or a theme toggle to any new page.
- Secrets (API keys, webhook URLs, SMTP passwords) are **always** stored via `encryptJson`/`decryptJson` (`~/services/security/crypto.server.ts`) and masked in every UI (`••••••••` + last 4, matching `AiProviderService.getApiKeyMasked`'s convention). Never log a decrypted secret; never ship one to the client bundle.
- Config precedence for every new setting: **DB (Hub UI) wins over env var when the DB field is set**; an unset DB field falls back to the env var. This exact pattern already exists in `mailer.server.ts` (`resolveConfig`) and `triage.server.ts` (`resolveTriageConfig`) — reuse it, don't reinvent it.
- Every Hub save (create/update/delete/test) is audited via `ActivityLogService.log` with a real `ActivityAction` (extend the union in `activity.service.ts`, never pass an untyped string).
- No silent failures (program D8): a Test-connection button that can't actually reach the service must say so with the real error, never a generic "saved" toast. A DLQ-replay button for a job kind this plan does not support replaying must refuse with a clear message, never fabricate a fake "replayed" success.
- Additive-only Prisma migrations (live Postgres) — every migration in this plan is a new nullable column, new table, or new index; nothing is dropped or renamed.
- TDD, bite-sized tasks, frequent commits; run `cd apps/web && npx vitest run <file>` for the test steps. Any task touching a route (`apps/web/app/routes/**`) runs `pnpm --filter web build` before its commit (binding build rule, program-wide).
- Shopify Admin API target 2026-07 — not directly relevant here (this plan makes no new Shopify Admin GraphQL calls), noted for completeness.

## Decisions of record for this plan

| # | Decision |
|---|----------|
| G1 | **`OpsAlertService` is the single fan-out point.** No call site invokes `Sentry.captureException` or sends a Slack/email alert directly — every wiring task in this plan calls `OpsAlertService.fire(...)`. One place to test, one place to add a channel later. |
| G2 | **Alert channels degrade independently.** A Slack webhook failure must not block the Sentry capture or the email send, and vice versa — `fire()` runs all three `Promise.allSettled`, never `Promise.all`. |
| G3 | **Threshold applies to email/Slack, never to Sentry.** Sentry gets every exception unconditionally (it's already a curated, deduped stream by design). Email/Slack are noisy at every-failure cadence, so they fire only once the rolling-window failure count (`AppSettings.opsAlertThresholdCount` within `opsAlertThresholdWindowMin`) is crossed, and then at most once per window (no repeat-spam) — tracked via a small in-memory + `ActivityLog`-backed cooldown (Task 2). |
| G4 | **Sentry stays env-only (DSN boot-time init); the Hub tile is env-reflect + test-send, not DB-config.** `sentry.server.ts`'s lazy `init()` reads `process.env.SENTRY_DSN` once; moving it to DB would require restructuring init to be async and re-checked per request, which conflicts with the "zero runtime cost when unset" design and with the SDK needing to be initialized once at process boot for uncaught-exception hooks to work. The tile shows masked env status + a "Send test event" button (`captureMessage`) and records `AppSettings.sentryLastTestedAt`. |
| G5 | **UptimeRobot and Healthchecks.io are DB-config for their read-only status API keys.** Unlike Sentry, nothing in the app boots against them — the healthchecks.io *ping* is sent by the GitHub Actions cron workflow (WS-A Task 10 `cron.yml`), not by the Node process, and UptimeRobot only ever polls `/healthz` from outside. So there's no boot-time coupling; storing their read API keys in `AppSettings` (encrypted) so the Hub tile can pull live status is safe and matches the DB-first precedence rule. The tile explicitly states the ping/monitor itself lives in the external dashboard + the GH Action — the Hub only *reflects* it. |
| G6 | **Email and Slack are full DB-config**, matching the already-shipped `emailProvider`/`emailFrom`/`smtp*` pattern in `AppSettings` — this plan only adds the missing provider kinds (`resend`, `postmark`) and the Slack fields, it does not re-architect email. |
| G7 | **AI provider kinds Grok/DeepSeek/Mistral get NO new HTTP client.** `llm.server.ts`'s existing `CUSTOM`/`AZURE_OPENAI` branch already treats the provider as OpenAI-Chat-Completions-compatible (`openAiCompatibleGenerateRecipe`) — all three new kinds speak that same dialect (`api.x.ai/v1`, `api.deepseek.com`, `api.mistral.ai/v1`). This is a config-only extension: new `ProviderKind` union members + default `baseUrl` map + one widened `if` condition. |
| G8 | **This plan's BullMQ Worker is scoped to job kinds it owns end-to-end** (`CONNECTOR_TEST`, `FLOW_RUN`, `MESSAGING_RUN`, `HTTP_SYNC_RUN`, `RESTOCK_WATCH_RUN`, `LOYALTY_ACCRUAL_RUN`) — never `AI_GENERATE`/`AI_HYDRATE`/`AI_MODIFY`/`PUBLISH`, whose inline-execution entrypoints belong to WS-C/WS-E. `internal.ops.tsx`'s `job_replay` for an unsupported type returns an honest refusal (D8), not a fake "replayed" job row. |
| G9 | **Merchant-reply / triage-async / stuck-RUNNING all reuse the Task-14 worker**, not a second execution mechanism — one real worker process, one Redis connection pool, one place to observe queue depth. |

## Verified ground truth (2026-08-24, `master@6af6df2`)

Facts every task below relies on — re-verified against code, do not re-derive:

- `withApiLogging` (`apps/web/app/services/observability/api-log.service.ts:228-245`) already catches every thrown error, writes `ErrorLogService`, and **re-throws** (`throw err;` line 245) — this is the Sentry hook point named in the charter; nothing currently calls Sentry there.
- `sentry.server.ts` (`captureException`/`captureMessage`/`flushSentry`) is fully implemented with PII redaction (`beforeSend`) but has **no callers wired into the request/job/webhook/triage failure paths** — it's dead infrastructure today outside a couple of unrelated AI-usage call sites.
- `JobService` (`apps/web/app/services/jobs/job.service.ts`) is DB bookkeeping only: `create`/`start`/`succeed`/`fail`/`listLatest`. There is **no consumer** anywhere in the repo that dequeues a `Job` row and executes it — every job type today is created alongside inline execution in its originating route (e.g. `AI_GENERATE`), not dispatched to a worker.
- `internal.ops.tsx`'s `job_replay`/`job_replay_all` (lines 112–161) call `JobService.create({ ...status: 'QUEUED'... })` on a fresh row and stop — **nothing ever executes the new row.** This is the DLQ-replay finding [Ops-1]: the button is fully wired to a database write and completely disconnected from doing the work over again.
- `apps/web/scripts/worker.ts` is a **skeleton**: it boots, connects to Redis, serves `/healthz`, and heartbeats — it mounts no BullMQ `Worker`. Its own header comment says "WS-C mounts real BullMQ Workers here; until then `JOB_EXECUTION_MODE` stays `inline`."
- `@superapp/job-orchestration` (`packages/job-orchestration/src/`) already ships `createBullMqQueueAdapter` (a `Queue` producer wrapper) and `loadJobOrchestratorConfig`/`resolveEffectiveMode` (env-driven mode resolution: `JOB_EXECUTION_MODE=inline|queue|disabled`, `QUEUE_REDIS_URL`/`REDIS_URL`, `QUEUE_PREFIX`). No BullMQ `Worker` (consumer) exists anywhere in `apps/web` or this package yet — this plan adds the first one.
- `FlowDeadLetter` + `DeadLetterService` (`apps/web/app/services/flows/dead-letter.service.ts`) is a **real**, working, cron-replayed dead-letter queue — but despite its name and header comment ("Dead-letter queue for flow runs") its only caller is `HttpSyncRunnerService` (`apps/web/app/services/integration/http-sync-runner.service.ts:244,281,290`), replayed every tick from `api.cron.tsx:144`. It is unrelated to the fake `Job`-table replay above; this plan does not touch it.
- `webhooks.tsx` (`apps/web/app/routes/webhooks.tsx`): the primary trigger (`FlowRunnerService.runForTrigger`) has correct claim-before-process / release-on-failure semantics (lines 63–88) and stays untouched by this plan. The four **sibling fan-outs** — `MessagingRunnerService` (94–107), `HttpSyncRunnerService` (114–127), `RestockWatcherService` (136–147), loyalty accrual (154–167) — run **inline, synchronously, in the webhook request**, each wrapped in its own best-effort `try/catch` that only logs. This is finding [Infra-7]: heavy work inline in a webhook handler that Shopify expects to ACK quickly, with failures silently swallowed past the log line.
- `webhooks.shop.redact.tsx` deletes only `DataStoreRecord`, `DataStore`, `DataCapture`, `ModuleEvent`, `ModuleMetricsDaily`, `AttributionLink` for the shop. It does **not** touch `Module`/`ModuleVersion`/`Recipe`, `Connector`/`ConnectorEndpoint`/`ConnectorToken`, `ApiLog`, `Job`, `ErrorLog`, `AiUsage`, `SupportTicket`/`SupportTicketMessage`/`SupportTicketEvent`/`SupportFixProposal`, `InternalAiSession`/`InternalAiMessage`, `WorkflowRun`/`WorkflowRunStep`, `FlowSchedule`, `ModuleInstance`/`ModuleSettingsValues`, or the `Shop` row itself — 30 models in `schema.prisma` carry a `shopId` field (`grep -c shopId`), 6 are redacted. This is finding [Infra-11].
- `triage.server.ts`: `AppSettings.supportTriageMode` defaults to `"local"` (`schema.prisma:476`); `resolveTriageConfig()` has no failover — a cloud-mode failure returns `{ ok: false }` straight through, it never falls back to a second provider or to local. `runSupportTriage` is called **synchronously and awaited** in `apps/web/app/routes/api.support.create.tsx:79`, inside the merchant-facing ticket-creation `action` — the merchant's HTTP response is blocked on the triage model call (`SUPPORT_TRIAGE_TIMEOUT_MS`, default 25s, clamped 5–55s).
- `notifySupportEvent` (`apps/web/app/services/support/notifications.server.ts`) already implements the exact email-alert pattern (`AppSettings.enableEmailAlerts` + `alertRecipients`, best-effort, `ActivityLog` on send) this plan generalizes into `OpsAlertService` — `triage_failed`/`escalated`/`intervention_flagged`/`shopper_ticket_created` are ADMIN_ALERT_KINDS (email to operator); `human_replied`/`resolved` email the merchant (Shopify Admin `shop.email` lookup). `human_replied` firing is the existing merchant-reply notification; there is no unread **badge** anywhere in the internal admin nav for it today.
- `mailer.server.ts` already ships a fully DB-first (env-fallback), AES-GCM-encrypted, provider-abstracted mailer supporting `smtp` (nodemailer) / `sendgrid` / `generic` (raw fetch, SendGrid-shaped payload by default). `resend` and `postmark` are **not** implemented — WS-INT's Category 2 email tile needs them added (both have simple bearer/header-token JSON POST APIs, distinct payload shapes from SendGrid).
- `AppSettings` (`schema.prisma:437-490`) already has `defaultAiProvider`, `fallbackAiProviderId`, `supportTriageMode`/`supportTriageProviderId`, and the full email block (`emailProvider`, `emailFrom`, `emailApiUrl`, `emailApiKeyEnc`, `smtp*`) — this plan is **not** greenfield for AI-provider config or email; it extends both. There is **no** Slack, Sentry-test, UptimeRobot, or Healthchecks.io field yet.
- `AiProvider.provider` (`schema.prisma:215`) is a plain Prisma `String`, not an enum — adding new `ProviderKind` values (`GROK`, `DEEPSEEK`, `MISTRAL`) needs **no migration**, only TS-level union + validation-array + dispatch-branch changes in `ai-provider.service.ts`, `internal.ai-providers.tsx` (`ALLOWED_PROVIDERS`, `ProviderModal`), and `llm.server.ts`.
- `env.server.ts` (`apps/web/app/env.server.ts`) already validates `SENTRY_DSN` (optional URL) and `EMAIL_CONNECTOR_PROVIDER: z.enum(['sendgrid','generic'])` — Task 9 widens the latter enum; no other new required env vars are introduced (every new setting in this plan is DB-config with an optional env fallback, validated loosely since it's optional).
- `internal.tsx` (nav shell) already has a generic `countKey`/`NavCounts` badge mechanism (`type NavCounts = { dlq: number; err: number; wh: number; tickets: number }`, computed in the loader, rendered per nav item via `countKey`) — Task 19 (merchant-reply badge) extends this typed object rather than inventing a second badge system. No `internal-nav.tsx`/`internal-shell.tsx` file exists separately; `internal.tsx` IS the shell + nav.
- No `simple-icons` package is installed anywhere in the repo (`node_modules` or `package.json`) — Task 11 adds it as a new dependency of `apps/web`.
- No Slack alerting code exists for internal ops; the only existing `slack` references (`slack.connector.ts`, `messaging.connector.ts`, `FlowBuilder.tsx`) are the **merchant-facing** Flow/messaging Slack connector, a different feature (per-shop, per-flow webhook, unrelated `Connector` model) — this plan's Slack sender is new, internal-admin-only code, not a reuse of that connector.
- `PR #13` (`cron.yml` + `db-backup.yml`) is unmerged — `.github/workflows/` today has only `ci.yml`, `deploy.yml`, and the retired v2-* workflows. This plan does not depend on PR #13 merging (the healthchecks.io *tile* only needs their status-read API key, not the ping wiring), but Task 26 (owner-run) notes PR #13 as a prerequisite for the healthchecks.io tile to have a real check to reflect.

## File Structure (created / modified)

```
apps/web/prisma/schema.prisma                                [M] AppSettings ops-alert/integration fields; Job.maxAttempts + index
apps/web/app/services/observability/ops-alert.server.ts      [C] OpsAlertService — Sentry+email+Slack fan-out, threshold/cooldown
apps/web/app/services/observability/ops-alert-slack.server.ts [C] Slack incoming-webhook sender
apps/web/app/services/observability/api-log.service.ts       [M] withApiLogging catch → OpsAlertService.fire
apps/web/app/services/jobs/job.service.ts                    [M] fail() → OpsAlertService.fire; maxAttempts on create
apps/web/app/routes/webhooks.tsx                              [M] fan-out catches → OpsAlertService.fire; messaging/httpSync/restock/loyalty → enqueue
apps/web/app/services/support/notifications.server.ts        [M] triage_failed / escalated → OpsAlertService.fire
apps/web/app/services/support/triage.server.ts                [M] D5 cloud-default + cloud-to-cloud failover
apps/web/app/routes/api.support.create.tsx                    [M] async triage (enqueue SUPPORT_TRIAGE_RUN, return immediately)
apps/web/app/routes/internal.integrations.tsx                 [C] Integrations Hub — tile grid, loader+action
apps/web/app/components/admin/integration-tiles.ts             [C] IntegrationTile registry (data-driven tile list, both categories)
apps/web/app/components/admin/integration-icon.tsx             [C] simple-icons inline-SVG helper component
apps/web/app/services/notifications/mailer.server.ts          [M] +resend +postmark providers
apps/web/app/env.server.ts                                     [M] EMAIL_CONNECTOR_PROVIDER enum widened
apps/web/app/services/internal/ai-provider.service.ts          [M] ProviderKind +GROK+DEEPSEEK+MISTRAL, default baseUrl map
apps/web/app/services/ai/llm.server.ts                         [M] OpenAI-compatible branch condition widened
apps/web/app/routes/internal.ai-providers.tsx                  [M] ALLOWED_PROVIDERS, ProviderModal select options
apps/web/app/services/activity/activity.service.ts             [M] new ActivityAction members
apps/web/app/services/jobs/job-executors.server.ts              [C] JobReplayRegistry — JobType → real executor (owned kinds only)
apps/web/scripts/worker.ts                                      [M] real BullMQ Worker mount for owned job kinds
apps/web/app/services/jobs/ops-queue.server.ts                  [C] queue producer wrapper (enqueue helper used by webhooks.tsx + internal.ops.tsx)
apps/web/app/routes/internal.ops.tsx                             [M] job_replay/job_replay_all → real registry, honest refusal for unsupported types
apps/web/app/routes/api.cron.tsx                                 [M] stuck-RUNNING sweep
apps/web/app/routes/internal.tsx                                 [M] NavCounts +unreadReplies; Integrations nav entry
apps/web/app/routes/internal.jobs.tsx                            [M] windowed health badges (15m/1h/24h success rate)
apps/web/app/routes/webhooks.shop.redact.tsx                     [M] full-coverage redact
apps/web/app/services/support/ticket-events.server.ts            [M] (read-only use) MERCHANT_REPLIED → badge count source
apps/web/app/__tests__/ops-alert.service.test.ts                 [C]
apps/web/app/__tests__/ops-alert-slack.test.ts                   [C]
apps/web/app/__tests__/api-log-sentry-wiring.test.ts             [C]
apps/web/app/__tests__/job-service-alert-wiring.test.ts          [C]
apps/web/app/__tests__/webhook-fanout-enqueue.test.ts            [C]
apps/web/app/__tests__/triage-async-and-failover.test.ts         [C]
apps/web/app/__tests__/mailer-resend-postmark.test.ts            [C]
apps/web/app/__tests__/integrations-hub.test.ts                  [C]
apps/web/app/__tests__/ai-provider-kinds-extended.test.ts        [C]
apps/web/app/__tests__/job-executors-registry.test.ts            [C]
apps/web/app/__tests__/ops-worker.test.ts                        [C]
apps/web/app/__tests__/internal-ops-replay.test.ts               [M]
apps/web/app/__tests__/stuck-running-sweep.test.ts                [C]
apps/web/app/__tests__/windowed-health-badges.test.ts             [C]
apps/web/app/__tests__/merchant-reply-badge.test.ts               [C]
apps/web/app/__tests__/shop-redact-completeness.test.ts           [C]
apps/web/app/__tests__/hub-activity-audit-coverage.test.ts        [C]
docs/internal-admin.md                                            [M] Integrations Hub section (or create if absent — verify in Task 25)
```

Shared test helper (define once in Task 2's test file, reuse import in later files):

```ts
// apps/web/app/__tests__/ops-alert.service.test.ts (exported for reuse — see Task 2 Step 2)
import { vi } from 'vitest';

export function mockAppSettings(overrides: Record<string, unknown> = {}) {
  return {
    enableEmailAlerts: true,
    alertRecipients: 'ops@example.com',
    opsSlackWebhookUrlEnc: null,
    opsAlertThresholdCount: 3,
    opsAlertThresholdWindowMin: 15,
    ...overrides,
  };
}
```

---

### Task 1: Prisma migration — `AppSettings` ops/integration fields + `Job.maxAttempts`

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

**Interfaces:** new nullable/defaulted columns only (additive):

```prisma
model AppSettings {
  // ... existing fields unchanged ...

  // Ops alerting (WS-G) — Slack incoming webhook + rolling-window threshold.
  opsSlackWebhookUrlEnc      String?  // encryptJson({ url })
  opsAlertThresholdCount     Int      @default(3)
  opsAlertThresholdWindowMin Int      @default(15)
  sentryLastTestedAt         DateTime?

  // Integrations Hub Category 2 (WS-INT) — read-only status API keys.
  uptimeRobotApiKeyEnc    String?  // encryptJson({ apiKey }) — UptimeRobot "read-only" API key
  uptimeRobotMonitorId    String?  // numeric monitor id, e.g. "8123456"
  healthchecksApiKeyEnc   String?  // encryptJson({ apiKey }) — healthchecks.io API key
  healthchecksCheckSlug   String?  @default("superapp-cron")
}

model Job {
  // ... existing fields unchanged ...
  maxAttempts Int @default(3)

  @@index([status, startedAt])
}
```

- [ ] **Step 1:** Apply the edits above to `apps/web/prisma/schema.prisma`.
- [ ] **Step 2:** Run: `cd apps/web && npx prisma migrate dev --name ops_alerting_and_integrations_hub && npx prisma generate`
Expected: a new migration directory under `apps/web/prisma/migrations/`, all-additive SQL (`ALTER TABLE "AppSettings" ADD COLUMN ...`, `ALTER TABLE "Job" ADD COLUMN "maxAttempts" ...`, `CREATE INDEX`).
- [ ] **Step 3:** `cd apps/web && npx vitest run` (full suite) — expected PASS, no test depends on the removed/renamed anything since nothing was removed.
- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma
git commit -m "feat(ws-g/ws-int): AppSettings ops-alert + integrations-hub fields, Job.maxAttempts"
```

---

### Task 2: `OpsAlertService` core (Sentry + threshold/cooldown, email/Slack stubs wired to no-ops)

The foundation every wiring task calls into. Ships with email/Slack as real calls but Slack sender still a stub until Task 3 (kept in the same task would make this one too large — Task 2 proves Sentry-always-fires + threshold logic in isolation with a fake Slack sender injected).

**Files:**
- Create: `apps/web/app/services/observability/ops-alert.server.ts`
- Create: `apps/web/app/__tests__/ops-alert.service.test.ts`

**Interfaces:**

```ts
export type OpsAlertKind =
  | 'API_REQUEST_FAILED'   // withApiLogging catch
  | 'JOB_FAILED'            // JobService.fail
  | 'WEBHOOK_FANOUT_FAILED' // messaging/httpSync/restock/loyalty catches
  | 'TRIAGE_FAILED'         // notifySupportEvent('triage_failed', ...)
  | 'STUCK_JOB_SWEPT';      // Task 17

export interface OpsAlertInput {
  kind: OpsAlertKind;
  message: string;
  error?: unknown;
  context?: Record<string, string | undefined>; // shopDomain, jobId, path, correlationId, etc.
}

export class OpsAlertService {
  constructor(deps?: { sendSlack?: (webhookUrl: string, text: string) => Promise<{ sent: boolean; error?: string }> });
  /** Fire-and-forget-safe: never throws. Sentry unconditional; email/Slack gated by rolling-window threshold. */
  async fire(input: OpsAlertInput): Promise<{ sentry: boolean; email: boolean; slack: boolean }>;
}
```

- [ ] **Step 1: Write the failing tests** — `apps/web/app/__tests__/ops-alert.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/services/observability/sentry.server', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('~/services/notifications/mailer.server', () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));

const appSettingsRow: Record<string, unknown> = {
  enableEmailAlerts: true,
  alertRecipients: 'ops@example.com',
  opsSlackWebhookUrlEnc: null,
  opsAlertThresholdCount: 3,
  opsAlertThresholdWindowMin: 15,
};
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSettings: { findUnique: vi.fn(async () => appSettingsRow) },
    activityLog: {
      create: vi.fn(async () => ({})),
      count: vi.fn(async () => 0), // rolling-window failure count for this kind; tests override per-case
    },
  }),
}));

import { captureException } from '~/services/observability/sentry.server';
import { OpsAlertService } from '~/services/observability/ops-alert.server';

beforeEach(() => vi.clearAllMocks());

describe('OpsAlertService.fire', () => {
  it('always calls Sentry captureException when an error is present, regardless of threshold', async () => {
    const svc = new OpsAlertService({ sendSlack: vi.fn(async () => ({ sent: true })) });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'job x failed', error: new Error('boom') });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({}));
    expect(result.sentry).toBe(true);
  });

  it('does not email/Slack below the rolling-window threshold', async () => {
    const { getPrisma } = await import('~/db.server');
    (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1); // below default threshold 3
    const slack = vi.fn(async () => ({ sent: true }));
    const svc = new OpsAlertService({ sendSlack: slack });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'job x failed' });
    expect(result.email).toBe(false);
    expect(result.slack).toBe(false);
    expect(slack).not.toHaveBeenCalled();
  });

  it('emails once the threshold is crossed within the window', async () => {
    const { getPrisma } = await import('~/db.server');
    (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(3); // at threshold
    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const svc = new OpsAlertService({ sendSlack: vi.fn(async () => ({ sent: true })) });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'job x failed' });
    expect(sendEmail).toHaveBeenCalled();
    expect(result.email).toBe(true);
  });

  it('never throws even when Sentry/email/Slack all reject', async () => {
    (captureException as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('sentry down'); });
    const { getPrisma } = await import('~/db.server');
    (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    const { sendEmail } = await import('~/services/notifications/mailer.server');
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('smtp down'));
    const slack = vi.fn(async () => { throw new Error('slack down'); });
    const svc = new OpsAlertService({ sendSlack: slack });
    await expect(svc.fire({ kind: 'JOB_FAILED', message: 'x' })).resolves.toBeDefined();
  });

  it('channels degrade independently — a Slack failure does not block email', async () => {
    const { getPrisma } = await import('~/db.server');
    (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const slack = vi.fn(async () => { throw new Error('slack down'); });
    const svc = new OpsAlertService({ sendSlack: slack });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'x' });
    expect(result.email).toBe(true);
    expect(result.slack).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run app/__tests__/ops-alert.service.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `ops-alert.server.ts`:

```ts
import { getPrisma } from '~/db.server';
import { captureException, captureMessage } from '~/services/observability/sentry.server';
import { sendEmail } from '~/services/notifications/mailer.server';
import { decryptJson } from '~/services/security/crypto.server';

export type OpsAlertKind = 'API_REQUEST_FAILED' | 'JOB_FAILED' | 'WEBHOOK_FANOUT_FAILED' | 'TRIAGE_FAILED' | 'STUCK_JOB_SWEPT';

export interface OpsAlertInput {
  kind: OpsAlertKind;
  message: string;
  error?: unknown;
  context?: Record<string, string | undefined>;
}

type SlackSender = (webhookUrl: string, text: string) => Promise<{ sent: boolean; error?: string }>;

export class OpsAlertService {
  private readonly sendSlack: SlackSender;

  constructor(deps: { sendSlack?: SlackSender } = {}) {
    // Real sender wired in Task 3; default here throws only if actually invoked
    // without an override AND Task 3 hasn't landed yet — kept import-free to
    // avoid a circular import with ops-alert-slack.server.ts during Task 2.
    this.sendSlack =
      deps.sendSlack ??
      (async () => ({ sent: false, error: 'Slack sender not configured' }));
  }

  async fire(input: OpsAlertInput): Promise<{ sentry: boolean; email: boolean; slack: boolean }> {
    const sentry = this.tryCaptureSentry(input);

    let settings: {
      enableEmailAlerts: boolean;
      alertRecipients: string | null;
      opsSlackWebhookUrlEnc: string | null;
      opsAlertThresholdCount: number;
      opsAlertThresholdWindowMin: number;
    } | null = null;
    try {
      settings = await getPrisma().appSettings.findUnique({
        where: { id: 'singleton' },
        select: {
          enableEmailAlerts: true,
          alertRecipients: true,
          opsSlackWebhookUrlEnc: true,
          opsAlertThresholdCount: true,
          opsAlertThresholdWindowMin: true,
        },
      });
    } catch {
      // AppSettings unreadable — Sentry already fired above; degrade silently.
    }
    if (!settings) return { sentry, email: false, slack: false };

    const overThreshold = await this.isOverThreshold(input.kind, settings.opsAlertThresholdCount, settings.opsAlertThresholdWindowMin);
    if (!overThreshold) return { sentry, email: false, slack: false };

    const [emailResult, slackResult] = await Promise.allSettled([
      this.tryEmail(input, settings),
      this.trySlack(input, settings.opsSlackWebhookUrlEnc),
    ]);

    // Record the fire itself so the next window's threshold count includes it.
    await getPrisma()
      .activityLog.create({
        data: { actor: 'SYSTEM', action: 'OPS_ALERT_FIRED', details: JSON.stringify({ kind: input.kind, message: input.message }) },
      })
      .catch(() => {});

    return {
      sentry,
      email: emailResult.status === 'fulfilled' && emailResult.value,
      slack: slackResult.status === 'fulfilled' && slackResult.value,
    };
  }

  private tryCaptureSentry(input: OpsAlertInput): boolean {
    try {
      if (input.error) captureException(input.error, { alertKind: input.kind, ...input.context });
      else captureMessage(input.message, 'error', { alertKind: input.kind, ...input.context });
      return true;
    } catch {
      return false;
    }
  }

  /** Rolling-window count of this alert kind already fired via ActivityLog OPS_ALERT_FIRED,
   *  PLUS this occurrence — mirrors JobService/ApiLog style best-effort counting. */
  private async isOverThreshold(kind: OpsAlertKind, thresholdCount: number, windowMin: number): Promise<boolean> {
    try {
      const since = new Date(Date.now() - windowMin * 60_000);
      const count = await getPrisma().activityLog.count({
        where: { action: 'OPS_ALERT_FIRED', createdAt: { gte: since }, details: { contains: `"kind":"${kind}"` } },
      });
      return count + 1 >= thresholdCount;
    } catch {
      return false; // unreadable window — do not spam on a DB hiccup
    }
  }

  private async tryEmail(input: OpsAlertInput, settings: { enableEmailAlerts: boolean; alertRecipients: string | null }): Promise<boolean> {
    if (!settings.enableEmailAlerts) return false;
    const recipients = (settings.alertRecipients ?? '').split(',').map((r) => r.trim()).filter((r) => r.includes('@'));
    if (recipients.length === 0) return false;
    const result = await sendEmail({
      to: recipients,
      subject: `[SuperApp Ops] ${input.kind}: ${input.message}`.slice(0, 200),
      html: `<p><strong>${input.kind}</strong></p><p>${input.message}</p>${input.context ? `<pre>${JSON.stringify(input.context, null, 2)}</pre>` : ''}`,
      text: `${input.kind}: ${input.message}`,
    });
    return result.sent;
  }

  private async trySlack(input: OpsAlertInput, webhookUrlEnc: string | null): Promise<boolean> {
    if (!webhookUrlEnc) return false;
    let url: string;
    try {
      url = decryptJson<{ url: string }>(webhookUrlEnc).url;
    } catch {
      return false;
    }
    const result = await this.sendSlack(url, `*${input.kind}*: ${input.message}`);
    return result.sent;
  }
}
```

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/observability/ops-alert.server.ts apps/web/app/__tests__/ops-alert.service.test.ts
git commit -m "feat(ws-g): OpsAlertService core — Sentry unconditional, email/Slack threshold-gated"
```

---

### Task 3: Slack incoming-webhook sender + AppSettings wiring

**Files:**
- Create: `apps/web/app/services/observability/ops-alert-slack.server.ts`
- Modify: `apps/web/app/services/observability/ops-alert.server.ts` (default `sendSlack` now imports the real sender instead of the stub)
- Create: `apps/web/app/__tests__/ops-alert-slack.test.ts`

**Interfaces:**

```ts
export async function sendSlackAlert(webhookUrl: string, text: string): Promise<{ sent: boolean; error?: string }>;
```

- [ ] **Step 1: Write the failing test** — `ops-alert-slack.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { sendSlackAlert } from '~/services/observability/ops-alert-slack.server';

describe('sendSlackAlert', () => {
  it('posts { text } to the webhook URL and reports sent:true on 200', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendSlackAlert('https://hooks.slack.com/services/x/y/z', 'hello');
    expect(result.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/x/y/z',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'hello' }) }),
    );
    vi.unstubAllGlobals();
  });

  it('reports sent:false with the status on a non-2xx response, never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid_payload', { status: 400 })));
    const result = await sendSlackAlert('https://hooks.slack.com/services/x/y/z', 'hello');
    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/400/);
    vi.unstubAllGlobals();
  });

  it('reports sent:false on a network error, never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const result = await sendSlackAlert('https://hooks.slack.com/services/x/y/z', 'hello');
    expect(result.sent).toBe(false);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement** — 10s timeout via `AbortController`, matching `mailer.server.ts`'s `SEND_TIMEOUT_MS` convention:

```ts
const SLACK_TIMEOUT_MS = 10_000;

export async function sendSlackAlert(webhookUrl: string, text: string): Promise<{ sent: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) return { sent: false, error: `Slack webhook responded ${res.status}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
```

Then in `ops-alert.server.ts`, replace the stub default with `import { sendSlackAlert } from './ops-alert-slack.server';` and `this.sendSlack = deps.sendSlack ?? sendSlackAlert;`.

- [ ] **Step 4: Run both** `ops-alert.service.test.ts` `ops-alert-slack.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/observability/ops-alert-slack.server.ts apps/web/app/services/observability/ops-alert.server.ts apps/web/app/__tests__/ops-alert-slack.test.ts
git commit -m "feat(ws-g): real Slack incoming-webhook sender wired as OpsAlertService default"
```

---

### Task 4: Integrations Hub shell — route, nav entry, `simple-icons`, empty tile grid

Lands the page with both category headers and zero tiles inside — every following task adds ONE tile in the same commit as its wire, so the shell itself is never "dead," it's just empty for one commit.

**Files:**
- Create: `apps/web/app/routes/internal.integrations.tsx`
- Create: `apps/web/app/components/admin/integration-tiles.ts`
- Create: `apps/web/app/components/admin/integration-icon.tsx`
- Modify: `apps/web/app/routes/internal.tsx` (nav entry)
- Modify: `apps/web/package.json` (add `simple-icons`)
- Create: `apps/web/app/__tests__/integrations-hub.test.ts`

**Interfaces:**

```ts
// integration-tiles.ts
export type IntegrationCategory = 'AI_PROVIDER' | 'OPS_SERVICE';
export interface IntegrationTileDef {
  id: string;                 // stable key, e.g. 'anthropic', 'sentry'
  category: IntegrationCategory;
  label: string;
  simpleIconSlug: string;     // simple-icons package export name, e.g. 'siAnthropic'
  configKind: 'DB' | 'ENV_REFLECT'; // Decision G4/G5/G6
  description: string;
}
export const INTEGRATION_TILES: readonly IntegrationTileDef[]; // populated incrementally, Tasks 5, 9-13, 20-22
```

```tsx
// integration-icon.tsx
export function IntegrationIcon({ slug, size }: { slug: string; size?: number }): JSX.Element;
```

- [ ] **Step 1: Add the dependency** — `cd apps/web && pnpm add simple-icons`. Verify the import shape: `import { siAnthropic, siOpenai, siSentry } from 'simple-icons';` each exporting `{ title, hex, path, slug }` (path is the SVG `<path d="...">` data — confirm against the installed package's `.d.ts` before Step 3; if the package's export shape differs from `{path,hex}` at install time, adapt `IntegrationIcon` accordingly and note the actual shape in this task's commit message).

- [ ] **Step 2: Write the failing test** — `integrations-hub.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { INTEGRATION_TILES } from '~/components/admin/integration-tiles';

describe('Integrations Hub tile registry', () => {
  it('every tile has a unique id and a simple-icons slug', () => {
    const ids = INTEGRATION_TILES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of INTEGRATION_TILES) {
      expect(t.simpleIconSlug.length).toBeGreaterThan(0);
    }
  });

  it('categories are exactly AI_PROVIDER and OPS_SERVICE', () => {
    for (const t of INTEGRATION_TILES) {
      expect(['AI_PROVIDER', 'OPS_SERVICE']).toContain(t.category);
    }
  });
});
```

- [ ] **Step 3: Run.** Expected: FAIL (empty array passes vacuously — acceptable at this task; Tasks 5/9-13/20-22 add real entries and this same test file keeps guarding uniqueness as they land — this is intentionally a scaffolding test, not yet asserting a specific count).

- [ ] **Step 4: Implement the shell.** `integration-tiles.ts` starts with `export const INTEGRATION_TILES: readonly IntegrationTileDef[] = [];`. `integration-icon.tsx` renders an inline `<svg>` from the resolved `simple-icons` export (fill uses the icon's brand hex by default, with a `currentColor` override prop for the light-only admin theme's muted state). `internal.integrations.tsx` loader calls `requireInternalAdmin`, groups `INTEGRATION_TILES` by `category`, and renders two `Card` sections ("AI providers" / "Ops services") using the existing `page-kit` components (`PageHead`, `Card`, `CardHead`, `EmptyState` when a category is empty) — follow `internal.ai-providers.tsx`'s structure (`PageHead` + `grid grid-2` of `card card-pad` tiles) exactly for visual consistency. Add to `internal.tsx`'s nav array, in the same group as `ai-providers` (around line 134): `{ url: '#/admin/integrations', label: 'Integrations', icon: 'connect' }`.

- [ ] **Step 5: Run** `npx vitest run app/__tests__/integrations-hub.test.ts` then `pnpm --filter web build` (route-touching task — binding build rule). Expected: PASS / build succeeds.
- [ ] **Step 6: Commit**

```bash
git add apps/web/app/routes/internal.integrations.tsx apps/web/app/components/admin/integration-tiles.ts apps/web/app/components/admin/integration-icon.tsx apps/web/app/routes/internal.tsx apps/web/package.json apps/web/pnpm-lock.yaml apps/web/app/__tests__/integrations-hub.test.ts
git commit -m "feat(ws-int): Integrations Hub shell — route, nav entry, simple-icons, empty tile registry"
```

---

### Task 5: Sentry wiring (`withApiLogging`) + Sentry Hub tile

Wire and tile land together (Decision: no unwired alerts).

**Files:**
- Modify: `apps/web/app/services/observability/api-log.service.ts`
- Modify: `apps/web/app/components/admin/integration-tiles.ts` (add `sentry` tile def)
- Modify: `apps/web/app/routes/internal.integrations.tsx` (Sentry tile: masked DSN status from `process.env.SENTRY_DSN`, "Send test event" button, `sentryLastTestedAt` display)
- Create: `apps/web/app/__tests__/api-log-sentry-wiring.test.ts`

**Interfaces:** no new exports — `withApiLogging`'s existing catch block (line ~228-245) gains one call.

- [ ] **Step 1: Write the failing test** — `api-log-sentry-wiring.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('~/db.server', () => ({ getPrisma: () => ({
  apiLog: { create: vi.fn(async () => ({ id: '1' })), update: vi.fn(async () => ({})) },
})}));
vi.mock('~/services/observability/error-log.service', () => ({ ErrorLogService: class { async write() {} } }));
const fireMock = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
vi.mock('~/services/observability/ops-alert.server', () => ({ OpsAlertService: class { fire = fireMock; } }));

import { withApiLogging } from '~/services/observability/api-log.service';

beforeEach(() => vi.clearAllMocks());

describe('withApiLogging → OpsAlertService wiring', () => {
  it('calls OpsAlertService.fire with kind API_REQUEST_FAILED before re-throwing', async () => {
    const err = new Error('handler exploded');
    await expect(
      withApiLogging({ actor: 'MERCHANT', method: 'POST', path: '/api/x' }, async () => { throw err; }),
    ).rejects.toThrow('handler exploded');
    expect(fireMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'API_REQUEST_FAILED', error: err }));
  });

  it('does NOT call fire on a successful response', async () => {
    await withApiLogging({ actor: 'MERCHANT', method: 'GET', path: '/api/x' }, async () => new Response('ok', { status: 200 }));
    expect(fireMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`fireMock` never called).

- [ ] **Step 3: Implement** — in `api-log.service.ts`, add the import and, right before the existing `await errLog.write(...)` call inside the `catch` block (~line 240-244):

```ts
import { OpsAlertService } from '~/services/observability/ops-alert.server';
// ...
} catch (err: unknown) {
  // ... existing status/errorMeta/logger.complete unchanged ...
  const errLog = new ErrorLogService();
  const route = `${input.method} ${input.path}`;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  await errLog.write('ERROR', message, stack, errorMeta, route, input.shopId, 'API');
  // WS-G: the withApiLogging catch is the single re-throw point for every
  // route wrapped in this helper — fire the ops alert here so no route needs
  // its own Sentry call.
  await new OpsAlertService().fire({ kind: 'API_REQUEST_FAILED', message: `${route} failed: ${message}`, error: err, context: { path: route, requestId, correlationId } }).catch(() => {});
  throw err;
}
```

- [ ] **Step 4: Add the Sentry tile** to `integration-tiles.ts`: `{ id: 'sentry', category: 'OPS_SERVICE', label: 'Sentry', simpleIconSlug: 'siSentry', configKind: 'ENV_REFLECT', description: 'Error tracking — DSN is set via Railway env var; this sends a test event.' }`. In the route's action, add `intent === 'testSentry'`: calls `captureMessage('SuperApp ops: Sentry test event', 'info', { source: 'internal-integrations-hub' })`, updates `AppSettings.sentryLastTestedAt`, logs `ActivityLog` `INTEGRATION_TESTED`. Tile body shows `process.env.SENTRY_DSN ? 'Configured (env)' : 'Not configured'` (never render the DSN itself — it embeds a project ingest key) + `sentryLastTestedAt` timestamp + "Send test event" button.

- [ ] **Step 5: Run** `npx vitest run app/__tests__/api-log-sentry-wiring.test.ts` then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add apps/web/app/services/observability/api-log.service.ts apps/web/app/components/admin/integration-tiles.ts apps/web/app/routes/internal.integrations.tsx apps/web/app/__tests__/api-log-sentry-wiring.test.ts
git commit -m "feat(ws-g/ws-int): Sentry fires on every withApiLogging failure + Sentry status/test tile"
```

---

### Task 6: `jobs.fail` wiring

Pure wiring — no new tile (the channels are already configured by Task 5's Sentry tile + Task 9/10's email/Slack tiles).

**Files:**
- Modify: `apps/web/app/services/jobs/job.service.ts`
- Create: `apps/web/app/__tests__/job-service-alert-wiring.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('~/db.server', () => ({ getPrisma: () => ({ job: { update: vi.fn(async (args: any) => ({ id: args.where.id, ...args.data })) } }) }));
const fireMock = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
vi.mock('~/services/observability/ops-alert.server', () => ({ OpsAlertService: class { fire = fireMock; } }));
import { JobService } from '~/services/jobs/job.service';

beforeEach(() => vi.clearAllMocks());

describe('JobService.fail → OpsAlertService', () => {
  it('fires a JOB_FAILED alert with the job id and error in context/message', async () => {
    await new JobService().fail('job_1', new Error('publish blew up'));
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'JOB_FAILED', context: expect.objectContaining({ jobId: 'job_1' }) }),
    );
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** — in `job.service.ts`, `fail()`:

```ts
async fail(jobId: string, error: unknown) {
  const prisma = getPrisma();
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { status: 'FAILED', finishedAt: new Date(), error: String(error) },
  });
  await new OpsAlertService()
    .fire({ kind: 'JOB_FAILED', message: `Job ${jobId} (${updated.type}) failed: ${String(error)}`, error, context: { jobId, jobType: updated.type } })
    .catch(() => {});
  return updated;
}
```

with `import { OpsAlertService } from '~/services/observability/ops-alert.server';` added.

- [ ] **Step 4: Run.** Expected: PASS. Also run the broader jobs slice: `npx vitest run app/__tests__/job-service-alert-wiring.test.ts` (any other test importing `JobService.fail` directly should still pass since the alert call is `.catch(() => {})`-guarded and doesn't change the return value).
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/jobs/job.service.ts apps/web/app/__tests__/job-service-alert-wiring.test.ts
git commit -m "feat(ws-g): JobService.fail fires an ops alert on every job failure"
```

---

### Task 7: Webhook fan-out failure wiring

Wires the four best-effort catch blocks named in the ground truth. (Task 16 later converts these same four call sites from inline-execute to enqueue — this task only adds the alert call to today's inline `catch`, so the alert exists before the bigger refactor and stays correct after it, since Task 16 keeps a `catch` around the enqueue call too.)

**Files:**
- Modify: `apps/web/app/routes/webhooks.tsx`
- Create: `apps/web/app/__tests__/webhook-fanout-alert-wiring.test.ts`

- [ ] **Step 1: Write the failing test** (exercise the `action` with a mocked `shopify.authenticate.webhook` and a `MessagingRunnerService` that throws — follow the mocking pattern of existing webhook tests, e.g. `apps/web/app/__tests__/messaging-preview-and-preflight.test.ts` for the shopify-authenticate mock shape):

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
const fireMock = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
vi.mock('~/services/observability/ops-alert.server', () => ({ OpsAlertService: class { fire = fireMock; } }));
vi.mock('~/services/messaging/messaging-runner.service', () => ({
  MessagingRunnerService: class { async runForTrigger() { throw new Error('messaging boom'); } },
}));
// ... mock shopify.authenticate.webhook, FlowRunnerService (succeeds), HttpSyncRunnerService, RestockWatcherService,
// loyalty-accrual.server, idempotency.server (checkAndMarkWebhookEvent → true) per the existing webhook test fixtures.

beforeEach(() => vi.clearAllMocks());

describe('webhooks.tsx fan-out → OpsAlertService', () => {
  it('fires WEBHOOK_FANOUT_FAILED when the messaging fan-out throws, and still 200s the webhook', async () => {
    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: new Request('https://x/webhooks', { method: 'POST' }) } as any);
    expect(res.status).toBe(200);
    expect(fireMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'messaging' }) }));
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** — in each of the four `catch` blocks (messaging 101-107, httpSync 121-127, restock 140-146, loyalty 160-166), after the existing `logger.error(...)` call, add:

```ts
await new OpsAlertService().fire({
  kind: 'WEBHOOK_FANOUT_FAILED',
  message: `${normalizedTopic} ${'<fanout-name>'} fan-out failed`,
  error: err,
  context: { shopDomain: shop, topic: normalizedTopic, fanout: '<fanout-name>' },
}).catch(() => {});
```

substituting `<fanout-name>` with `'messaging'`/`'httpSync'`/`'restock'`/`'loyalty'` per block, plus the import `import { OpsAlertService } from '~/services/observability/ops-alert.server';`.

- [ ] **Step 4: Run** the new test + the existing webhook test suite (`npx vitest run app/__tests__/webhook-fanout-alert-wiring.test.ts` and any pre-existing `webhooks*.test.ts`). Expected: PASS. `pnpm --filter web build` (route touched).
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/webhooks.tsx apps/web/app/__tests__/webhook-fanout-alert-wiring.test.ts
git commit -m "feat(ws-g): webhook fan-out failures (messaging/httpSync/restock/loyalty) fire ops alerts"
```

---

### Task 8: Triage-failure wiring + D5 cloud-default with cloud-to-cloud failover

Bundled because both touch `triage.server.ts`/`AppSettings.supportTriageMode`.

**Files:**
- Modify: `apps/web/app/services/support/triage.server.ts`
- Modify: `apps/web/app/services/support/notifications.server.ts`
- Modify: `apps/web/prisma/schema.prisma` (`supportTriageMode` default `"local"` → `"cloud"` — additive: a `@default` change on an existing column is a data-preserving `ALTER COLUMN SET DEFAULT`, not a drop/rename, consistent with the additive-migrations constraint; existing rows are untouched, only new rows/upserts without an explicit value pick up the new default)
- Create: `apps/web/app/__tests__/triage-cloud-default-and-failover.test.ts`

**Interfaces:**

```ts
// triage.server.ts — triageViaCloud gains failover: on the primary provider chain's
// failure, retries once against the fallback provider (AppSettings.fallbackAiProviderId),
// mirroring FallbackLlmClient's existing Anthropic→OpenAI pattern (llm.server.ts) rather
// than inventing a second failover mechanism. NEVER falls back to local in production —
// D5 says "no local-model dependency in production"; local stays a dev-only explicit toggle.
```

- [ ] **Step 1: Write the failing tests** — `triage-cloud-default-and-failover.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('~/db.server', () => ({ getPrisma: () => ({
  appSettings: { findUnique: vi.fn(async () => ({ supportTriageMode: null, supportTriageProviderId: null })) }, // unset row
  aiProvider: { findUnique: vi.fn(async () => null) },
})}));

describe('resolveTriageConfig — D5 cloud default', () => {
  it('defaults to cloud when AppSettings has no explicit mode and no env override', async () => {
    const { resolveTriageConfig } = await import('~/services/support/triage.server');
    const config = await resolveTriageConfig();
    expect(config.provider).toBe('cloud');
  });
});

describe('runSupportTriage — cloud-to-cloud failover', () => {
  it('falls back to the FallbackLlmClient chain (never to local) when the primary cloud call fails', async () => {
    // getLlmClient already returns a FallbackLlmClient wrapping primary+fallback
    // (see llm.server.ts) — this test asserts triageViaCloud uses getLlmClient's
    // existing chain rather than a bespoke local-fallback path, i.e. that a cloud
    // failure surfaces as ok:false with provider:'cloud' (never provider:'local').
    const { runSupportTriage } = await import('~/services/support/triage.server');
    // ... mock getLlmClient to throw from both primary and fallback ...
    const outcome = await runSupportTriage({ subject: 's', description: 'd', shopDomain: 'x.myshopify.com' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.provider).toBe('cloud');
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`resolveTriageConfig` currently defaults to `'local'` when `dbMode` is null — see `triage.server.ts:119`, `dbMode === 'cloud' ? 'cloud' : 'local'`).

- [ ] **Step 3: Implement:**
  1. Schema: change `supportTriageMode String @default("local")` → `@default("cloud")`; run `npx prisma migrate dev --name triage_cloud_default`.
  2. `triage.server.ts` line 119: `const provider: 'local' | 'cloud' = envProvider ?? (dbMode === 'local' ? 'local' : 'cloud');` — flips the fallback branch so an unset/unrecognized DB value now means cloud, matching the new column default (local requires an *explicit* `'local'` row value or `SUPPORT_TRIAGE_PROVIDER=local` env — this is the "Ollama remains a dev-only explicit toggle" half of D5).
  3. Cloud-to-cloud failover already exists structurally: `triageViaCloud` calls `getLlmClient(shopId)` when no pin is set, and `getLlmClient` already returns Claude→OpenAI `FallbackLlmClient` semantics per MEMORY (`FallbackLlmClient` catches all errors, retries with OpenAI) — verify this by reading `llm.server.ts`'s `getLlmClient` export before writing the assertion in Step 1's second test; if `getLlmClient` does NOT already wrap fallback for arbitrary shopId calls (confirm during implementation), add the same one-retry-against-`fallbackAiProviderId` pattern directly in `triageViaCloud`'s catch, never touching `triageViaOllama`.
  4. Wire the alert: in `notifications.server.ts`, inside `notifyAdmins`, right after the existing `sendEmail` call for the `triage_failed`/`escalated`/`intervention_flagged` kinds, add `if (kind === 'triage_failed') await new OpsAlertService().fire({ kind: 'TRIAGE_FAILED', message: `Triage failed for ticket ${ticket.id}: ${extra.reason ?? 'unknown'}`, context: { ticketId: ticket.id, shopDomain } }).catch(() => {});` (scoped to `triage_failed` only — `escalated`/`intervention_flagged` are ticket-routing signals, not infrastructure failures, so they stay email-only per Decision G1's "ops alert" scope).

- [ ] **Step 4: Run** the new test file + `npx vitest run app/__tests__` slice touching `triage` and `support/notifications`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma apps/web/app/services/support apps/web/app/__tests__/triage-cloud-default-and-failover.test.ts
git commit -m "feat(ws-g): D5 — support triage defaults to cloud, cloud-to-cloud failover, ops alert on triage failure"
```

---

### Task 9: Email tile — `resend`/`postmark` providers + Hub UI

**Files:**
- Modify: `apps/web/app/services/notifications/mailer.server.ts`
- Modify: `apps/web/app/env.server.ts` (`EMAIL_CONNECTOR_PROVIDER` enum: `['sendgrid', 'generic', 'resend', 'postmark']`)
- Modify: `apps/web/app/components/admin/integration-tiles.ts` (tiles: `resend`, `postmark` — or a single `email` tile with a provider selector matching the `AppSettings.emailProvider` field, which already covers `smtp`/`sendgrid`/`generic`/`resend`/`postmark` in one dropdown; **single tile** is the right call since email is one logical channel with one active provider, not five simultaneous ones — see Step 4)
- Modify: `apps/web/app/routes/internal.integrations.tsx` (email tile: provider select, from/host/key fields per provider, "Send test email" button)
- Create: `apps/web/app/__tests__/mailer-resend-postmark.test.ts`

**Interfaces:**

```ts
// mailer.server.ts
type EmailProvider = 'smtp' | 'sendgrid' | 'generic' | 'resend' | 'postmark';
```

- [ ] **Step 1: Write the failing tests** — `mailer-resend-postmark.test.ts` (mirror the existing `mailer-smtp-smoke.test.ts` fixture style):

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('~/db.server', () => ({ getPrisma: () => ({
  appSettings: { findUnique: vi.fn(async () => ({
    emailProvider: 'resend', emailFrom: 'ops@superapp.dev', emailApiUrl: null,
    emailApiKeyEnc: null, smtpHost: null, smtpPort: null, smtpUser: null, smtpPassEnc: null, smtpSecure: true,
  })) },
})}));
vi.mock('~/services/security/crypto.server', () => ({ decryptJson: () => ({ apiKey: 'test-key' }) }));

beforeEach(() => vi.clearAllMocks());

describe('mailer.server — resend', () => {
  it('POSTs to api.resend.com/emails with Bearer auth and the resend payload shape', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const result = await sendEmail({ to: 'x@y.com', subject: 's', html: '<p>h</p>', text: 't' });
    expect(result.sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ from: 'ops@superapp.dev', to: ['x@y.com'], subject: 's', html: '<p>h</p>' });
    vi.unstubAllGlobals();
  });
});

describe('mailer.server — postmark', () => {
  it('POSTs to api.postmarkapp.com/email with X-Postmark-Server-Token header', async () => {
    vi.doMock('~/db.server', () => ({ getPrisma: () => ({
      appSettings: { findUnique: vi.fn(async () => ({
        emailProvider: 'postmark', emailFrom: 'ops@superapp.dev', emailApiUrl: null,
        emailApiKeyEnc: null, smtpHost: null, smtpPort: null, smtpUser: null, smtpPassEnc: null, smtpSecure: true,
      })) },
    })}));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ MessageID: 'abc' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const result = await sendEmail({ to: 'x@y.com', subject: 's', html: '<p>h</p>' });
    expect(result.sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.postmarkapp.com/email');
    expect((init as RequestInit).headers).toMatchObject({ 'X-Postmark-Server-Token': 'test-key' });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`resolveConfig`'s provider check doesn't include `resend`/`postmark`; `buildFetchPayload` only handles `sendgrid`/`generic`).

- [ ] **Step 3: Implement** — in `mailer.server.ts`:
  1. Widen `type EmailProvider` and `resolveConfig`'s DB-provider guard (`dbProvider === 'smtp' || ... || dbProvider === 'resend' || dbProvider === 'postmark'`).
  2. Extend `buildFetchPayload`/the send dispatch (wherever the `provider === 'sendgrid' | 'generic'` switch lives, below the shown range) with two new branches:
     - `resend`: `POST https://api.resend.com/emails`, header `Authorization: Bearer ${apiKey}`, body `{ from, to: recipients, subject, html, text }`.
     - `postmark`: `POST https://api.postmarkapp.com/email`, header `X-Postmark-Server-Token: ${apiKey}` (no `Authorization` prefix), body `{ From: from, To: recipients.join(','), Subject: subject, HtmlBody: html, TextBody: text }` (Postmark's PascalCase field convention).
  3. `env.server.ts`: `EMAIL_CONNECTOR_PROVIDER: z.enum(['sendgrid', 'generic', 'resend', 'postmark']).optional()`.

- [ ] **Step 4: Add the Hub tile.** Single `email` tile def (`configKind: 'DB'`) in `integration-tiles.ts`. In `internal.integrations.tsx`: provider `Select` (`smtp`/`sendgrid`/`generic`/`resend`/`postmark`), conditional fields (SMTP host/port/user/pass for `smtp`; API URL for `generic`; API key for all fetch-based kinds), "Send test email" button → `intent === 'testEmail'` calling `sendEmail({ to: adminEmail-from-AppSettings, subject: 'SuperApp Hub test', ... })`, save action writes through `encryptJson` exactly like `internal.ai-providers.tsx`'s `saveAccount` intent does for `apiKeyEnc`.

- [ ] **Step 5: Run** `npx vitest run app/__tests__/mailer-resend-postmark.test.ts app/__tests__/mailer-smtp-smoke.test.ts` then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add apps/web/app/services/notifications/mailer.server.ts apps/web/app/env.server.ts apps/web/app/components/admin/integration-tiles.ts apps/web/app/routes/internal.integrations.tsx apps/web/app/__tests__/mailer-resend-postmark.test.ts
git commit -m "feat(ws-int): Resend + Postmark email providers, Email tile in Integrations Hub"
```

---

### Task 10: Slack ops-alert tile

The sender was built in Task 3; this lands its configuration surface.

**Files:**
- Modify: `apps/web/app/components/admin/integration-tiles.ts` (tile: `slack-ops`)
- Modify: `apps/web/app/routes/internal.integrations.tsx` (webhook URL field, masked display, "Send test message" button, threshold count/window fields)
- Modify: `apps/web/app/services/activity/activity.service.ts` (`ActivityAction` += `'OPS_INTEGRATION_SAVED' | 'OPS_INTEGRATION_TESTED'`)

- [ ] **Step 1: Write the failing test** — extend `integrations-hub.test.ts` (action-level, following `internal.ai-providers.tsx`'s action-test pattern if one exists, else a direct `action()` call):

```ts
it('saveSlackWebhook encrypts the URL and audits the save', async () => {
  const fd = new FormData();
  fd.set('intent', 'saveSlackWebhook');
  fd.set('webhookUrl', 'https://hooks.slack.com/services/a/b/c');
  const res = await action({ request: new Request('https://x/internal/integrations', { method: 'POST', body: fd }) } as any);
  expect((await res.json()).ok).toBe(true);
  // AppSettings.opsSlackWebhookUrlEnc is set (assert via the mocked prisma upsert call args)
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`intent === 'saveSlackWebhook'` not handled).
- [ ] **Step 3: Implement** — `action()` gains:

```ts
if (intent === 'saveSlackWebhook') {
  const url = String(form.get('webhookUrl') ?? '').trim();
  if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) {
    return json({ error: 'Must be a Slack incoming-webhook URL (https://hooks.slack.com/services/...)' }, { status: 400 });
  }
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', opsSlackWebhookUrlEnc: url ? encryptJson({ url }) : null },
    update: { opsSlackWebhookUrlEnc: url ? encryptJson({ url }) : null },
  });
  await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_SAVED', resource: 'integration:slack' });
  return json({ ok: true, message: 'Slack webhook saved' });
}
if (intent === 'testSlackWebhook') {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' }, select: { opsSlackWebhookUrlEnc: true } });
  if (!settings?.opsSlackWebhookUrlEnc) return json({ error: 'No Slack webhook configured' }, { status: 400 });
  const { url } = decryptJson<{ url: string }>(settings.opsSlackWebhookUrlEnc);
  const result = await sendSlackAlert(url, 'SuperApp Ops Hub: this is a test message.');
  await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_TESTED', resource: 'integration:slack', details: { sent: result.sent } });
  return result.sent ? json({ ok: true, message: 'Test message sent to Slack' }) : json({ error: result.error ?? 'Slack send failed' }, { status: 400 });
}
if (intent === 'saveAlertThresholds') {
  const count = Number(form.get('thresholdCount') ?? 3);
  const windowMin = Number(form.get('thresholdWindowMin') ?? 15);
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(windowMin) || windowMin < 1) {
    return json({ error: 'Threshold count and window must be positive integers' }, { status: 400 });
  }
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', opsAlertThresholdCount: count, opsAlertThresholdWindowMin: windowMin },
    update: { opsAlertThresholdCount: count, opsAlertThresholdWindowMin: windowMin },
  });
  await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_SAVED', resource: 'integration:alert-thresholds' });
  return json({ ok: true, message: 'Alert thresholds saved' });
}
```

- [ ] **Step 4: Run** then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/integration-tiles.ts apps/web/app/routes/internal.integrations.tsx apps/web/app/services/activity/activity.service.ts apps/web/app/__tests__/integrations-hub.test.ts
git commit -m "feat(ws-int): Slack ops-alert tile — webhook config, test send, threshold config"
```

---

### Task 11: UptimeRobot tile

**Files:**
- Modify: `apps/web/app/components/admin/integration-tiles.ts`
- Modify: `apps/web/app/routes/internal.integrations.tsx`

**Interfaces:**

```ts
// UptimeRobot Monitors API (read-only key): POST https://api.uptimerobot.com/v2/getMonitors
// form-encoded { api_key, monitors: monitorId, format: 'json' } → { stat: 'ok', monitors: [{ status: number, ... }] }
// status: 2 = up, 9 = down, 0/1 = paused/pending (per UptimeRobot API docs).
```

- [ ] **Step 1: Write the failing test** (loader-level, mocked fetch):

```ts
it('loader resolves UptimeRobot status as "up" when the API returns status:2', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ stat: 'ok', monitors: [{ status: 2 }] }), { status: 200 })));
  const { loader } = await import('~/routes/internal.integrations');
  const data = await (await loader({ request: new Request('https://x/internal/integrations') } as any)).json();
  expect(data.uptimeRobot.status).toBe('up');
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** — tile def `{ id: 'uptimerobot', category: 'OPS_SERVICE', configKind: 'DB', ... }`. Loader: if `AppSettings.uptimeRobotApiKeyEnc` + `uptimeRobotMonitorId` are set, `fetch('https://api.uptimerobot.com/v2/getMonitors', { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ api_key: apiKey, monitors: monitorId, format: 'json' }) })`, map `status` (2→'up', 9→'down', else 'unknown'), wrapped in try/catch → `{ status: 'error', error }` on any failure (never throw the loader). Action gains `saveUptimeRobot` (encrypt+save both fields) and `testUptimeRobot` (re-run the same fetch, surface the real error on failure — D8).

- [ ] **Step 4: Run**, then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/integration-tiles.ts apps/web/app/routes/internal.integrations.tsx
git commit -m "feat(ws-int): UptimeRobot tile — DB-stored read key, live monitor status"
```

---

### Task 12: Healthchecks.io tile

**Files:**
- Modify: `apps/web/app/components/admin/integration-tiles.ts`
- Modify: `apps/web/app/routes/internal.integrations.tsx`

**Interfaces:**

```ts
// Healthchecks.io Management API: GET https://healthchecks.io/api/v3/checks/{slug}
// header X-Api-Key: <read-only API key> → { status: 'up'|'down'|'grace'|'paused'|'new', last_ping, ... }
```

- [ ] **Step 1: Write the failing test** — same shape as Task 11's, asserting `data.healthchecks.status === 'up'` from a mocked 200 response.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** — tile def `{ id: 'healthchecks', category: 'OPS_SERVICE', configKind: 'DB', description: 'Cron dead-man switch. The ping itself is sent by the GitHub Actions cron workflow — this key only reads status.' }`. Loader: `fetch('https://healthchecks.io/api/v3/checks/' + slug, { headers: { 'X-Api-Key': apiKey } })`, same try/catch-to-error-state contract as Task 11. Action: `saveHealthchecks`/`testHealthchecks`.
- [ ] **Step 4: Run**, then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/integration-tiles.ts apps/web/app/routes/internal.integrations.tsx
git commit -m "feat(ws-int): Healthchecks.io tile — DB-stored read key, live check status"
```

---

### Task 13: AI provider tiles — Grok, DeepSeek, Mistral + generic OpenAI-compatible

Category 1 config-only extension (Decision G7 — no new HTTP client).

**Files:**
- Modify: `apps/web/app/services/internal/ai-provider.service.ts` (`ProviderKind`, default-baseUrl map)
- Modify: `apps/web/app/services/ai/llm.server.ts` (widen the OpenAI-compatible dispatch condition)
- Modify: `apps/web/app/routes/internal.ai-providers.tsx` (`ALLOWED_PROVIDERS`, `ProviderModal` select options)
- Modify: `apps/web/app/components/admin/integration-tiles.ts` (6 AI-provider tiles: anthropic, openai, gemini, grok, deepseek, mistral — each `configKind: 'DB'`, deep-linking to `/internal/ai-providers?tab=providers` with the kind pre-selected via a `?add=<kind>` query the existing route reads to open `ProviderModal` pre-filled — see Step 4)
- Create: `apps/web/app/__tests__/ai-provider-kinds-extended.test.ts`

- [ ] **Step 1: Write the failing tests:**

```ts
import { describe, expect, it } from 'vitest';
import { ALLOWED_PROVIDER_KINDS, DEFAULT_BASE_URL_BY_KIND } from '~/services/internal/ai-provider.service';

describe('AI provider kind extension (WS-INT)', () => {
  it('includes GROK, DEEPSEEK, MISTRAL alongside the existing kinds', () => {
    for (const kind of ['OPENAI', 'ANTHROPIC', 'GEMINI', 'AZURE_OPENAI', 'CUSTOM', 'GROK', 'DEEPSEEK', 'MISTRAL']) {
      expect(ALLOWED_PROVIDER_KINDS).toContain(kind);
    }
  });

  it('each new kind has a sane OpenAI-compatible default base URL', () => {
    expect(DEFAULT_BASE_URL_BY_KIND.GROK).toBe('https://api.x.ai/v1');
    expect(DEFAULT_BASE_URL_BY_KIND.DEEPSEEK).toBe('https://api.deepseek.com');
    expect(DEFAULT_BASE_URL_BY_KIND.MISTRAL).toBe('https://api.mistral.ai/v1');
  });
});
```

Plus a `llm.server.ts` dispatch test (extend whatever existing test file covers `ConfiguredLlmClient.generateRecipe`'s provider branching — find it via `grep -rl "provider.provider === 'GEMINI'" apps/web/app/__tests__` before writing; if none exists, create `apps/web/app/__tests__/llm-provider-dispatch.test.ts` asserting a `GROK`-kind provider row routes to `openAiCompatibleGenerateRecipe`).

- [ ] **Step 2: Run.** Expected: FAIL (`ALLOWED_PROVIDER_KINDS`/`DEFAULT_BASE_URL_BY_KIND` don't exist yet — today `ALLOWED_PROVIDERS` is a `const` array only inside `internal.ai-providers.tsx`, not exported from the service; this task also promotes it to a shared export so both the route and the Hub import the same source of truth).

- [ ] **Step 3: Implement:**
  1. `ai-provider.service.ts`: `export type ProviderKind = 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'AZURE_OPENAI' | 'CUSTOM' | 'GROK' | 'DEEPSEEK' | 'MISTRAL';` `export const ALLOWED_PROVIDER_KINDS: readonly ProviderKind[] = [...]` `export const DEFAULT_BASE_URL_BY_KIND: Partial<Record<ProviderKind, string>> = { GROK: 'https://api.x.ai/v1', DEEPSEEK: 'https://api.deepseek.com', MISTRAL: 'https://api.mistral.ai/v1' };`
  2. `internal.ai-providers.tsx`: replace the local `const ALLOWED_PROVIDERS: readonly ProviderKind[] = [...]` with `import { ALLOWED_PROVIDER_KINDS as ALLOWED_PROVIDERS } from '~/services/internal/ai-provider.service';`; add the three new `<option>`s to `ProviderModal`'s provider-type `Select`.
  3. `llm.server.ts` line 308: widen the comment/condition from "CUSTOM or AZURE_OPENAI" to also match `GROK`/`DEEPSEEK`/`MISTRAL` — since the branch is already the `else` fallthrough (no explicit `if` to widen, it's the final `return` after the `OPENAI`/`ANTHROPIC`/`GEMINI` checks), only the comment needs updating to document the new kinds also land here; verify no earlier `if (provider.provider === ...)` branch needs a new arm (it doesn't — GROK/DEEPSEEK/MISTRAL correctly fall through to the existing OpenAI-compatible `return`).
  4. Hub tiles: each AI-provider tile's "Configure" action does `ctx.go('/internal/ai-providers?tab=providers&add=' + kind)`; `internal.ai-providers.tsx`'s component reads `searchParams.get('add')` and opens `<ProviderModal provider={null} ... prefillKind={add}>` if present (small addition to the existing `useState` init for `modal`).

- [ ] **Step 4: Run** the new tests + `npx vitest run app/__tests__/publish-functions-reliability.test.ts` is NOT relevant here — instead re-run any existing `internal.ai-providers`-adjacent test file if one exists (`grep -rl "internal.ai-providers" apps/web/app/__tests__`). `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/internal/ai-provider.service.ts apps/web/app/services/ai/llm.server.ts apps/web/app/routes/internal.ai-providers.tsx apps/web/app/components/admin/integration-tiles.ts apps/web/app/__tests__/ai-provider-kinds-extended.test.ts
git commit -m "feat(ws-int): Grok/DeepSeek/Mistral provider kinds + AI provider tiles deep-linking into AI Providers"
```

---

### Task 14: Real BullMQ Worker for owned job kinds + `JobReplayRegistry`

The core "make DLQ replay real" task (Decision G8).

**Files:**
- Create: `apps/web/app/services/jobs/job-executors.server.ts`
- Create: `apps/web/app/services/jobs/ops-queue.server.ts`
- Modify: `apps/web/scripts/worker.ts`
- Create: `apps/web/app/__tests__/job-executors-registry.test.ts`
- Create: `apps/web/app/__tests__/ops-worker.test.ts`

**Interfaces:**

```ts
// job-executors.server.ts
export type OwnedJobType = 'CONNECTOR_TEST' | 'FLOW_RUN' | 'MESSAGING_RUN' | 'HTTP_SYNC_RUN' | 'RESTOCK_WATCH_RUN' | 'LOYALTY_ACCRUAL_RUN';
/** JobType → real executor taking the STORED Job.payload (parsed) and returning a result to persist on success. */
export const JOB_EXECUTORS: Record<OwnedJobType, (payload: unknown, ctx: { shopId?: string }) => Promise<unknown>>;
export function isOwnedJobType(type: string): type is OwnedJobType;

// ops-queue.server.ts
export async function enqueueOwnedJob(input: { type: OwnedJobType; shopId?: string; payload: unknown; correlationId?: string }): Promise<{ jobId: string; queued: boolean }>;
```

- [ ] **Step 1: Write the failing tests** — `job-executors-registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JOB_EXECUTORS, isOwnedJobType } from '~/services/jobs/job-executors.server';

describe('JOB_EXECUTORS registry (Decision G8)', () => {
  it('covers exactly the six owned job types, never AI_GENERATE/AI_HYDRATE/AI_MODIFY/PUBLISH', () => {
    const owned = Object.keys(JOB_EXECUTORS).sort();
    expect(owned).toEqual(['CONNECTOR_TEST', 'FLOW_RUN', 'HTTP_SYNC_RUN', 'LOYALTY_ACCRUAL_RUN', 'MESSAGING_RUN', 'RESTOCK_WATCH_RUN'].sort());
    for (const forbidden of ['AI_GENERATE', 'AI_HYDRATE', 'AI_MODIFY', 'PUBLISH']) {
      expect(isOwnedJobType(forbidden)).toBe(false);
    }
  });
});
```

`ops-worker.test.ts` (unit-level: the Worker's processor function dispatches to `JOB_EXECUTORS` and calls `JobService.succeed`/`fail` correctly — test the processor function directly, not a live BullMQ connection):

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
const succeedMock = vi.fn(async () => ({}));
const failMock = vi.fn(async () => ({}));
vi.mock('~/services/jobs/job.service', () => ({ JobService: class { succeed = succeedMock; fail = failMock; start = vi.fn(async () => ({})); } }));
vi.mock('~/services/jobs/job-executors.server', () => ({
  JOB_EXECUTORS: { CONNECTOR_TEST: vi.fn(async () => ({ ok: true })) },
  isOwnedJobType: (t: string) => t === 'CONNECTOR_TEST',
}));

beforeEach(() => vi.clearAllMocks());

describe('processOwnedJob (worker processor)', () => {
  it('calls the matching executor and marks the job SUCCESS', async () => {
    const { processOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await processOwnedJob({ id: 'job_1', type: 'CONNECTOR_TEST', payload: '{"a":1}', shopId: 's1' } as never);
    expect(succeedMock).toHaveBeenCalledWith('job_1', { ok: true });
  });

  it('marks the job FAILED (via JobService.fail, which fires the ops alert) when the executor throws', async () => {
    const { JOB_EXECUTORS } = await import('~/services/jobs/job-executors.server');
    (JOB_EXECUTORS as Record<string, unknown>).CONNECTOR_TEST = vi.fn(async () => { throw new Error('conn refused'); });
    const { processOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await processOwnedJob({ id: 'job_1', type: 'CONNECTOR_TEST', payload: '{}', shopId: 's1' } as never);
    expect(failMock).toHaveBeenCalledWith('job_1', expect.any(Error));
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL (modules don't exist).

- [ ] **Step 3: Implement:**

`job-executors.server.ts` — each executor wraps the SAME service call the original inline path used, taking exactly `JSON.parse(job.payload)`'s shape:

```ts
import { ConnectorService } from '~/services/connectors/connector.service';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { MessagingRunnerService } from '~/services/messaging/messaging-runner.service';
import { HttpSyncRunnerService } from '~/services/integration/http-sync-runner.service';
import { RestockWatcherService } from '~/services/messaging/restock-watcher.server';
import { accrueForOrder } from '~/services/composites/loyalty-accrual.server';
import { unauthenticated } from '~/shopify.server';
import { getPrisma } from '~/db.server';

export type OwnedJobType = 'CONNECTOR_TEST' | 'FLOW_RUN' | 'MESSAGING_RUN' | 'HTTP_SYNC_RUN' | 'RESTOCK_WATCH_RUN' | 'LOYALTY_ACCRUAL_RUN';

const OWNED = new Set<string>(['CONNECTOR_TEST', 'FLOW_RUN', 'MESSAGING_RUN', 'HTTP_SYNC_RUN', 'RESTOCK_WATCH_RUN', 'LOYALTY_ACCRUAL_RUN']);
export function isOwnedJobType(type: string): type is OwnedJobType {
  return OWNED.has(type);
}

async function resolveShopDomain(shopId: string): Promise<string> {
  const shop = await getPrisma().shop.findUnique({ where: { id: shopId }, select: { shopDomain: true } });
  if (!shop) throw new Error(`Shop ${shopId} not found — cannot replay/enqueue against it`);
  return shop.shopDomain;
}

export const JOB_EXECUTORS: Record<OwnedJobType, (payload: unknown, ctx: { shopId?: string }) => Promise<unknown>> = {
  CONNECTOR_TEST: async (payload) => {
    const p = payload as { shopDomain: string; connectorId: string; path: string; method: string };
    return new ConnectorService().test(p.shopDomain, { connectorId: p.connectorId, path: p.path, method: p.method as never });
  },
  FLOW_RUN: async (payload, ctx) => {
    const p = payload as { moduleId: string; event?: unknown };
    if (!ctx.shopId) throw new Error('FLOW_RUN requires shopId');
    const shopDomain = await resolveShopDomain(ctx.shopId);
    const { admin } = await unauthenticated.admin(shopDomain);
    return new FlowRunnerService().runFlowById(shopDomain, admin, p.moduleId, (p.event as { kind: string }) ?? { kind: 'manual', source: 'worker-replay' });
  },
  MESSAGING_RUN: async (payload, ctx) => {
    const p = payload as { trigger: string; event: unknown };
    if (!ctx.shopId) throw new Error('MESSAGING_RUN requires shopId');
    const shopDomain = await resolveShopDomain(ctx.shopId);
    const { admin } = await unauthenticated.admin(shopDomain);
    return new MessagingRunnerService().runForTrigger(shopDomain, admin, p.trigger as never, p.event);
  },
  HTTP_SYNC_RUN: async (payload, ctx) => {
    const p = payload as { trigger: string; event: unknown };
    if (!ctx.shopId) throw new Error('HTTP_SYNC_RUN requires shopId');
    const shopDomain = await resolveShopDomain(ctx.shopId);
    const { admin } = await unauthenticated.admin(shopDomain);
    return new HttpSyncRunnerService().runForTrigger(shopDomain, admin, p.trigger as never, p.event);
  },
  RESTOCK_WATCH_RUN: async (payload, ctx) => {
    const p = payload as { event: unknown };
    if (!ctx.shopId) throw new Error('RESTOCK_WATCH_RUN requires shopId');
    const shopDomain = await resolveShopDomain(ctx.shopId);
    return new RestockWatcherService().runForProductUpdate(shopDomain, undefined, p.event);
  },
  LOYALTY_ACCRUAL_RUN: async (payload, ctx) => {
    if (!ctx.shopId) throw new Error('LOYALTY_ACCRUAL_RUN requires shopId');
    return accrueForOrder(ctx.shopId, payload as never);
  },
};
```

`ops-queue.server.ts`:

```ts
import { createBullMqQueueAdapter, loadJobOrchestratorConfig, resolveEffectiveMode } from '@superapp/job-orchestration';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { JOB_EXECUTORS, isOwnedJobType, type OwnedJobType } from '~/services/jobs/job-executors.server';

const OPS_QUEUE_NAME = 'superapp-ops';
let _adapter: ReturnType<typeof createBullMqQueueAdapter> | null = null;

function adapter() {
  if (_adapter) return _adapter;
  const config = loadJobOrchestratorConfig();
  _adapter = createBullMqQueueAdapter({ config });
  return _adapter;
}

/** Creates the Job row (bookkeeping, unchanged contract) AND, when queue mode is
 *  reachable, enqueues it onto the real BullMQ queue for the worker to consume.
 *  Falls back to inline execution (calling the executor directly) when queue mode
 *  isn't configured — same "inline vs queue" seam job-orchestration already models,
 *  so dev machines without Redis keep working. */
export async function enqueueOwnedJob(input: { type: OwnedJobType; shopId?: string; payload: unknown; correlationId?: string }): Promise<{ jobId: string; queued: boolean }> {
  const jobs = new JobService();
  const job = await jobs.create({ shopId: input.shopId, type: input.type, payload: input.payload, correlationId: input.correlationId });

  const config = loadJobOrchestratorConfig();
  const mode = resolveEffectiveMode(config);
  if (mode !== 'queue') {
    // Inline fallback — execute now, still going through the same executor +
    // succeed/fail bookkeeping so behavior is identical to the queued path.
    await processOwnedJob({ id: job.id, type: job.type, payload: job.payload, shopId: job.shopId ?? undefined });
    return { jobId: job.id, queued: false };
  }

  await adapter().enqueue({ queueName: OPS_QUEUE_NAME, jobType: input.type, id: job.id, payload: { jobId: job.id } });
  return { jobId: job.id, queued: true };
}

/** The worker processor: given a Job row (already fetched), runs its executor and
 *  persists the outcome. Exported standalone so both scripts/worker.ts (BullMQ
 *  Worker) and the inline fallback above call the identical code path. */
export async function processOwnedJob(job: { id: string; type: string; payload: string | null; shopId?: string }): Promise<void> {
  const jobs = new JobService();
  if (!isOwnedJobType(job.type)) {
    await jobs.fail(job.id, new Error(`Job type ${job.type} is not in JOB_EXECUTORS (Decision G8) — cannot be processed by this worker`));
    return;
  }
  await jobs.start(job.id);
  try {
    let payload: unknown = null;
    if (job.payload) { try { payload = JSON.parse(job.payload); } catch { payload = job.payload; } }
    const result = await JOB_EXECUTORS[job.type](payload, { shopId: job.shopId });
    await jobs.succeed(job.id, result);
  } catch (err) {
    await jobs.fail(job.id, err);
  }
}

/** Fetches the job row by the BullMQ job's stored jobId and processes it — the
 *  actual bullmq Worker processor callback, wired in scripts/worker.ts. */
export async function processOwnedJobById(jobId: string): Promise<void> {
  const row = await getPrisma().job.findUnique({ where: { id: jobId } });
  if (!row) return; // job row gone (e.g. redacted shop) — nothing to do
  await processOwnedJob({ id: row.id, type: row.type, payload: row.payload, shopId: row.shopId ?? undefined });
}
```

`scripts/worker.ts` — add, after the existing Redis/health-server setup, before the heartbeat interval:

```ts
import { Worker } from 'bullmq';
import { processOwnedJobById } from '~/services/jobs/ops-queue.server';
// ...
let bullWorker: Worker | null = null;
if (resolveEffectiveMode(config) === 'queue') {
  bullWorker = new Worker(
    'superapp-ops',
    async (job) => {
      const jobId = (job.data as { jobId: string }).jobId;
      await processOwnedJobById(jobId);
    },
    { connection: redis, prefix: config.queuePrefix, concurrency: 5 },
  );
  bullWorker.on('error', (err) => console.error('[worker] bullmq worker error', err.message));
  console.log('[worker] bullmq Worker mounted on queue "superapp-ops"');
}
```

and add `await bullWorker?.close();` to `shutdown()`.

- [ ] **Step 4: Run** `npx vitest run app/__tests__/job-executors-registry.test.ts app/__tests__/ops-worker.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/jobs/job-executors.server.ts apps/web/app/services/jobs/ops-queue.server.ts apps/web/scripts/worker.ts apps/web/app/__tests__/job-executors-registry.test.ts apps/web/app/__tests__/ops-worker.test.ts
git commit -m "feat(ws-g): real BullMQ Worker + JobReplayRegistry for owned job kinds (Decision G8)"
```

---

### Task 15: `internal.ops.tsx` DLQ replay — real for owned types, honest refusal otherwise

**Files:**
- Modify: `apps/web/app/routes/internal.ops.tsx`
- Modify: `apps/web/app/__tests__/internal-ops-replay.test.ts` (extend if it exists — `grep -rl "job_replay" apps/web/app/__tests__` first; create if absent)

- [ ] **Step 1: Write the failing tests:**

```ts
it('job_replay for an owned type (CONNECTOR_TEST) actually re-runs it via enqueueOwnedJob', async () => {
  // mock prisma.job.findUnique to return a CONNECTOR_TEST row; mock enqueueOwnedJob
  const enqueueMock = vi.fn(async () => ({ jobId: 'job_2', queued: true }));
  vi.mock('~/services/jobs/ops-queue.server', () => ({ enqueueOwnedJob: enqueueMock }));
  // ... call action() with intent=job_replay, id=<original job id> ...
  expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'CONNECTOR_TEST' }));
});

it('job_replay for an unowned type (AI_GENERATE) refuses honestly instead of faking success', async () => {
  // mock prisma.job.findUnique to return an AI_GENERATE row
  const res = await action(/* intent=job_replay */);
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.message).toMatch(/not yet replayable/i);
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** — replace the `job_replay` case body (lines 112-135):

```ts
case 'job_replay': {
  if (!id) return fail('Missing job id');
  const prisma = getPrisma();
  const original = await prisma.job.findUnique({ where: { id } });
  if (!original) return fail(`Job ${id} not found`, 404);
  if (!(KNOWN_JOB_TYPES as readonly string[]).includes(original.type)) {
    return fail(`Job type ${original.type} cannot be replayed`);
  }
  if (!isOwnedJobType(original.type)) {
    // Decision G8: this plan's worker does not own AI_GENERATE/AI_HYDRATE/AI_MODIFY/
    // PUBLISH — refuse honestly (D8) rather than create a QUEUED row nothing consumes.
    return fail(
      `${original.type} is not yet replayable — its execution path is inline-only ` +
        `(owned by a future async-generation migration). Re-trigger it from its original UI instead.`,
    );
  }
  const correlationId = generateCorrelationId();
  const { jobId } = await enqueueOwnedJob({
    type: original.type,
    shopId: original.shopId ?? undefined,
    payload: replayPayload(original),
    correlationId,
  });
  await audit({ replayedFrom: id, newJobId: jobId, correlationId }, { shopId: original.shopId ?? undefined, resource: `job:${id}` });
  return ok(`Replayed — new job ${jobId}`);
}
```

and rewrite `job_replay_all` to filter `failedJobs` down to `isOwnedJobType` rows, replaying those via `enqueueOwnedJob` and reporting the skipped-unowned count in the success message (e.g. `Re-enqueued 4 failed jobs (3 skipped: not yet replayable)`), never silently dropping them.

Add imports: `import { enqueueOwnedJob } from '~/services/jobs/ops-queue.server'; import { isOwnedJobType } from '~/services/jobs/job-executors.server';`

- [ ] **Step 4: Run** the test file, then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/internal.ops.tsx apps/web/app/__tests__/internal-ops-replay.test.ts
git commit -m "fix(ws-g): DLQ replay actually re-executes owned job kinds; honest refusal for unowned types [Ops-1]"
```

---

### Task 16: Webhook fan-out → claim + enqueue + ACK

**Files:**
- Modify: `apps/web/app/routes/webhooks.tsx`
- Modify: `apps/web/app/__tests__/webhook-fanout-alert-wiring.test.ts` (extend) or create `webhook-fanout-enqueue.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
it('messaging/httpSync/restock/loyalty fan-out enqueues jobs instead of running inline, then ACKs 200', async () => {
  const enqueueMock = vi.fn(async () => ({ jobId: 'job_x', queued: true }));
  vi.mock('~/services/jobs/ops-queue.server', () => ({ enqueueOwnedJob: enqueueMock }));
  const { action } = await import('~/routes/webhooks');
  const res = await action({ request: /* orders/create webhook request fixture */ } as any);
  expect(res.status).toBe(200);
  expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'MESSAGING_RUN' }));
  expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'HTTP_SYNC_RUN' }));
  expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOYALTY_ACCRUAL_RUN' }));
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** — replace each of the four inline `try { await new XRunnerService().runForTrigger(...) } catch { ...OpsAlertService... }` blocks with an enqueue call, keeping the `OpsAlertService.fire` from Task 7 in the (now much narrower) catch around the enqueue call itself:

```ts
try {
  await enqueueOwnedJob({ type: 'MESSAGING_RUN', shopId: (await prisma.shop.findUnique({ where: { shopDomain: shop }, select: { id: true } }))?.id, payload: { trigger, event: payload }, correlationId: eventId });
} catch (err) {
  logger.error(`[webhooks] ${normalizedTopic} messaging fan-out enqueue failed`, { shopDomain: shop, eventId, ...safeErrorMeta(err) });
  await new OpsAlertService().fire({ kind: 'WEBHOOK_FANOUT_FAILED', message: `${normalizedTopic} messaging enqueue failed`, error: err, context: { shopDomain: shop, topic: normalizedTopic, fanout: 'messaging' } }).catch(() => {});
}
```

repeated for `HTTP_SYNC_RUN`, `RESTOCK_WATCH_RUN` (restock's event needs the admin GraphQL client per the executor's signature — since the worker resolves its own `unauthenticated.admin(shopDomain)`, the enqueue payload only needs the raw `payload`, not the extracted `adminGraphql` closure that was needed for the inline synchronous path; drop `extractAdminGraphql` usage here since Task 14's `RESTOCK_WATCH_RUN` executor doesn't take an admin closure — verify `RestockWatcherService.runForProductUpdate`'s signature accepts `undefined` for the graphql client gracefully per its existing "silently skipped when one isn't available" contract, or resolve a fresh `unauthenticated.admin` inside the executor if it does not), `LOYALTY_ACCRUAL_RUN`. The `shopId` lookup (`prisma.shop.findUnique`) is shared across all four — hoist it once above the four blocks instead of repeating it, resolved once right after the primary trigger's `runForTrigger` succeeds.

Note: **only the four siblings move to enqueue.** The primary `FlowRunnerService.runForTrigger` call (lines 63-88) stays inline, unchanged — its claim/release-on-failure semantics already correctly handle Shopify redelivery and changing it is out of this plan's scope (see Global Constraints / Decision G8 rationale).

- [ ] **Step 4: Run** the test, then the full webhook test suite, then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/webhooks.tsx apps/web/app/__tests__/webhook-fanout-enqueue.test.ts
git commit -m "fix(ws-g): webhook sibling fan-outs (messaging/httpSync/restock/loyalty) claim+enqueue+ACK [Infra-7]"
```

---

### Task 17: Stuck-RUNNING sweep + max-attempts policy

**Files:**
- Modify: `apps/web/app/routes/api.cron.tsx`
- Create: `apps/web/app/services/jobs/stuck-job-sweep.server.ts`
- Create: `apps/web/app/__tests__/stuck-running-sweep.test.ts`

**Interfaces:**

```ts
export interface StuckSweepResult { swept: number; failedPermanently: number; }
/** A Job RUNNING longer than staleAfterMs with no finishedAt is either retried
 *  (attempts < maxAttempts, owned type → re-enqueued) or FAILED permanently
 *  (attempts >= maxAttempts, or an unowned type — no safe way to retry it). */
export async function sweepStuckRunningJobs(opts?: { staleAfterMs?: number; limit?: number }): Promise<StuckSweepResult>;
```

- [ ] **Step 1: Write the failing tests:**

```ts
describe('sweepStuckRunningJobs', () => {
  it('re-enqueues a stuck owned-type job under maxAttempts', async () => {
    // prisma.job.findMany returns one CONNECTOR_TEST row, status RUNNING, startedAt 20min ago, attempts 1, maxAttempts 3
    const enqueueMock = vi.fn(async () => ({ jobId: 'job_new', queued: true }));
    vi.mock('~/services/jobs/ops-queue.server', () => ({ enqueueOwnedJob: enqueueMock }));
    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs({ staleAfterMs: 10 * 60_000 });
    expect(result.swept).toBe(1);
    expect(enqueueMock).toHaveBeenCalled();
  });

  it('permanently FAILs a stuck job once attempts >= maxAttempts, firing an ops alert', async () => {
    // prisma.job.findMany returns one row with attempts 3, maxAttempts 3
    const failMock = vi.fn(async () => ({}));
    vi.mock('~/services/jobs/job.service', () => ({ JobService: class { fail = failMock; } }));
    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs();
    expect(result.failedPermanently).toBe(1);
    expect(failMock).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/stuck/i));
  });

  it('an unowned-type stuck job (e.g. AI_GENERATE) is FAILed, never re-enqueued', async () => {
    // ... AI_GENERATE row, attempts 1, maxAttempts 3 — still FAILed, not retried, since
    // Decision G8's registry can't safely replay it.
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement:**

```ts
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { enqueueOwnedJob } from '~/services/jobs/ops-queue.server';
import { isOwnedJobType } from '~/services/jobs/job-executors.server';
import { OpsAlertService } from '~/services/observability/ops-alert.server';

const DEFAULT_STALE_AFTER_MS = 15 * 60_000; // 15 minutes with no finishedAt = stuck

export interface StuckSweepResult { swept: number; failedPermanently: number; }

export async function sweepStuckRunningJobs(opts: { staleAfterMs?: number; limit?: number } = {}): Promise<StuckSweepResult> {
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - staleAfterMs);
  const stuck = await prisma.job.findMany({
    where: { status: 'RUNNING', startedAt: { lte: cutoff } },
    take: opts.limit ?? 50,
  });

  let swept = 0;
  let failedPermanently = 0;
  const jobs = new JobService();
  for (const job of stuck) {
    if (isOwnedJobType(job.type) && job.attempts < job.maxAttempts) {
      let payload: unknown = null;
      if (job.payload) { try { payload = JSON.parse(job.payload); } catch { payload = job.payload; } }
      await enqueueOwnedJob({ type: job.type, shopId: job.shopId ?? undefined, payload, correlationId: job.correlationId ?? undefined });
      // The stuck row itself is superseded by the fresh enqueue — mark it FAILED
      // (not silently left RUNNING forever) so it drops out of future sweeps.
      await jobs.fail(job.id, `Stuck in RUNNING > ${staleAfterMs}ms — re-enqueued as a new job`);
      swept += 1;
    } else {
      await jobs.fail(job.id, `Stuck in RUNNING > ${staleAfterMs}ms — ${isOwnedJobType(job.type) ? 'max attempts exhausted' : 'type not safely replayable'}`);
      failedPermanently += 1;
    }
  }
  if (failedPermanently > 0) {
    await new OpsAlertService().fire({ kind: 'STUCK_JOB_SWEPT', message: `${failedPermanently} job(s) permanently failed by the stuck-RUNNING sweep`, context: { swept: String(swept), failedPermanently: String(failedPermanently) } }).catch(() => {});
  }
  return { swept, failedPermanently };
}
```

Note `JobService.fail`'s existing signature takes `error: unknown` — passing a string is already supported (`String(error)` in its implementation).

Wire into `api.cron.tsx`: add, alongside the existing sibling sweeps (after the `uninstallCleanup` block, ~line 167), its own try/catch:

```ts
let stuckJobSweep: StuckSweepResult | null = null;
try {
  stuckJobSweep = await sweepStuckRunningJobs();
} catch (err) {
  logger.warn('[api.cron] stuck-running job sweep failed', safeErrorMeta(err));
}
```

and add `stuckJobSweep` to the final `json({...})`.

- [ ] **Step 4: Run** `npx vitest run app/__tests__/stuck-running-sweep.test.ts`, then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/jobs/stuck-job-sweep.server.ts apps/web/app/routes/api.cron.tsx apps/web/app/__tests__/stuck-running-sweep.test.ts
git commit -m "feat(ws-g): stuck-RUNNING job sweep + max-attempts policy, wired into the cron tick"
```

---

### Task 18: Windowed health badges

**Files:**
- Modify: `apps/web/app/routes/internal.jobs.tsx`
- Create: `apps/web/app/__tests__/windowed-health-badges.test.ts`

**Interfaces:**

```ts
export interface JobTypeHealthWindow { window: '15m' | '1h' | '24h'; successRatePct: number | null; total: number; }
```

- [ ] **Step 1: Write the failing test** — loader-level, asserting the loader's returned data includes, per `JobType`, three windows with `successRatePct = success / (success + failed) * 100` and `null` when `total === 0` (never divide by zero / never fabricate 100% on no data).

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** — add a `computeHealthWindows(jobs: Array<{ type: string; status: string; createdAt: Date }>)` helper (pure function, easy to unit test) to `internal.jobs.tsx`'s loader, querying `prisma.job.groupBy({ by: ['type', 'status'], where: { createdAt: { gte: since24h } }, _count: true })` once (24h is the widest window; 15m/1h are computed by re-filtering the same fetched row set in memory rather than three separate queries) and rendering a small `Badge` per job-type row: green ≥95%, yellow 80-94%, red <80%, gray "no data" when `total === 0`. Follow the existing `StatusBadge`/`Badge` `tone` convention from `page-kit.tsx` (already used throughout `internal.ai-providers.tsx`).

- [ ] **Step 4: Run**, then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/internal.jobs.tsx apps/web/app/__tests__/windowed-health-badges.test.ts
git commit -m "feat(ws-g): windowed (15m/1h/24h) job success-rate health badges on the Jobs page"
```

---

### Task 19: Merchant-reply alert + unread badge

**Files:**
- Modify: `apps/web/app/routes/internal.tsx` (`NavCounts` += `unreadReplies`; loader query; Support CRM nav item's `countKey`)
- Modify: `apps/web/app/services/support/notifications.server.ts` (no new alert kind — `human_replied` already fires; this task is the badge half)
- Create: `apps/web/app/__tests__/merchant-reply-badge.test.ts`

**Interfaces:** `NavCounts` widens to `{ dlq: number; err: number; wh: number; tickets: number; unreadReplies: number }`. "Unread" is operationalized as: a `SupportTicketEvent` of type `MERCHANT_REPLIED` newer than the ticket's most recent `INTERNAL_ADMIN`-actor event (i.e. the merchant spoke last and no human has looked since) — this needs no new column, it's derivable from the existing append-only `SupportTicketEvent` log.

- [ ] **Step 1: Write the failing test** — assert the loader's `counts.unreadReplies` equals the count of tickets whose latest event is `MERCHANT_REPLIED` (fixture: one ticket with `[CREATED, MERCHANT_REPLIED]` events counts; one with `[CREATED, MERCHANT_REPLIED, HUMAN_REPLIED]` does not).

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** — add to `internal.tsx`'s loader (alongside the existing `failedJobs`/`errors24h`/`failedWebhooks24h`/`openTickets` queries, ~lines 40-57):

```ts
// A ticket has an unread merchant reply when its MOST RECENT event is
// MERCHANT_REPLIED — i.e. the merchant spoke last and no human/AI event
// followed. One query per open ticket would be N+1; instead fetch the latest
// event per open ticket via a groupBy-then-filter (bounded by openTickets count,
// already small enough for the admin dashboard's existing query budget).
const latestEventsByTicket = await prisma.supportTicketEvent.findMany({
  where: { ticket: { status: { in: ['OPEN', 'AI_RESPONDED', 'ESCALATED'] } } },
  orderBy: { createdAt: 'desc' },
  distinct: ['ticketId'],
  select: { ticketId: true, type: true },
});
const unreadReplies = latestEventsByTicket.filter((e) => e.type === 'MERCHANT_REPLIED').length;
```

and `counts = { dlq: failedJobs, err: errors24h, wh: failedWebhooks24h, tickets: openTickets, unreadReplies };` plus the `NavCounts` type and the Support CRM nav item's `countKey: 'tickets'` → keep `tickets` as-is (total open) and add a SECOND small nav item or badge; simplest correct approach: add `countKey: 'unreadReplies'` as an additional badge shown next to the existing `tickets` badge on the Support CRM nav entry (the `page-kit` nav renderer at line 260 already does `it.countKey ? counts[it.countKey] : null` per item — extend the Support CRM item's definition to carry a secondary count, or simplest: keep one `countKey` per item and add a second nav entry `{ url: '#/admin/support?filter=unread', label: 'Unread replies', icon: 'chat', countKey: 'unreadReplies', countTone: 'warning' }` directly under the Support CRM item — pick whichever the existing `NAV_ITEMS`/`countKey` type most cleanly supports after reading the render code at line 260 in Task 3 of this task's implementation; do not invent a second badge rendering mechanism).

- [ ] **Step 4: Run**, then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/internal.tsx apps/web/app/__tests__/merchant-reply-badge.test.ts
git commit -m "feat(ws-g): unread merchant-reply badge in the internal admin nav"
```

---

### Task 20: Triage async — move off the merchant-facing request path

**Files:**
- Modify: `apps/web/app/routes/api.support.create.tsx`
- Create: `apps/web/app/services/jobs/support-triage-job.server.ts`
- Modify: `apps/web/app/services/jobs/job-executors.server.ts` (`JOB_EXECUTORS` += `SUPPORT_TRIAGE_RUN`; widen `OwnedJobType`)
- Modify: `apps/web/app/services/jobs/job.service.ts` (`JobType` += `'SUPPORT_TRIAGE_RUN'`)
- Create: `apps/web/app/__tests__/triage-async-and-failover.test.ts` (extends Task 8's file, or a new one — reconcile naming so there's one triage test file, not two near-duplicates: rename Task 8's file to `triage-cloud-default-and-failover.test.ts` stays for D5; this task's async behavior gets its own `triage-async.test.ts`)

- [ ] **Step 1: Write the failing test** — `triage-async.test.ts`:

```ts
it('ticket creation returns before triage completes — enqueues SUPPORT_TRIAGE_RUN instead of awaiting runSupportTriage inline', async () => {
  const enqueueMock = vi.fn(async () => ({ jobId: 'job_t', queued: true }));
  vi.mock('~/services/jobs/ops-queue.server', () => ({ enqueueOwnedJob: enqueueMock }));
  const runTriageMock = vi.fn(async () => { throw new Error('should never be called inline'); });
  vi.mock('~/services/support/triage.server', () => ({ runSupportTriage: runTriageMock }));
  const { action } = await import('~/routes/api.support.create');
  const res = await action(/* form with subject/description */);
  expect(res.status).toBeLessThan(400);
  expect(runTriageMock).not.toHaveBeenCalled();
  expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'SUPPORT_TRIAGE_RUN' }));
});
```

- [ ] **Step 2: Run.** Expected: FAIL (current code awaits `runSupportTriage` inline at `api.support.create.tsx:79`).

- [ ] **Step 3: Implement:**
  1. `support-triage-job.server.ts` — the executor that the worker calls: takes `{ ticketId }`, loads the ticket, calls `runSupportTriage`, and does exactly what `api.support.create.tsx`'s current inline block (lines 79-133) does with the result (update ticket, record events, `notifySupportEvent`) — move that logic here verbatim rather than duplicating it.
  2. `job-executors.server.ts`: add `SUPPORT_TRIAGE_RUN: async (payload) => runSupportTriageJob((payload as { ticketId: string }).ticketId)` and widen `OwnedJobType`/`OWNED`.
  3. `api.support.create.tsx`: after `recordTicketEvent(ticket.id, 'CREATED', ...)`, replace the inline `await runSupportTriage(...)` block with `await enqueueOwnedJob({ type: 'SUPPORT_TRIAGE_RUN', shopId: shopRow.id, payload: { ticketId: ticket.id } });` and return the ticket-created response immediately (ticket status stays `OPEN` until the job flips it, matching today's pre-triage state — no client-visible regression, merchants already see "OPEN" before triage completes since triage was synchronous-but-the-UI didn't show a distinct "triaging" state).

- [ ] **Step 4: Run** the new test + Task 8's triage test file (D5 default/failover logic is unaffected — it now runs inside the worker instead of the request, same function). `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/api.support.create.tsx apps/web/app/services/jobs/support-triage-job.server.ts apps/web/app/services/jobs/job-executors.server.ts apps/web/app/services/jobs/job.service.ts apps/web/app/__tests__/triage-async.test.ts
git commit -m "feat(ws-g): support ticket creation returns immediately, triage runs on the worker"
```

---

### Task 21: `shop/redact` completeness

**Files:**
- Modify: `apps/web/app/routes/webhooks.shop.redact.tsx`
- Create: `apps/web/app/__tests__/shop-redact-completeness.test.ts`

**Interfaces:**

```ts
/** Every Prisma model with a shopId field, MINUS the documented retention allowlist
 *  (models kept post-redact for legal/audit reasons — e.g. the ActivityLog row
 *  recording the redaction itself). Introspected from schema.prisma so a new
 *  shop-scoped model added later fails this test until it's triaged into either
 *  the redact list or the allowlist — mirrors WS-E's manifest-consistency pattern. */
export const REDACT_RETENTION_ALLOWLIST: readonly string[]; // e.g. ['ActivityLog'] — the GDPR_SHOP_REDACT audit row itself
```

- [ ] **Step 1: Write the failing test** — `shop-redact-completeness.test.ts` (schema-introspection test, same technique as WS-E's `deployed-manifest-consistency.test.ts`):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REDACT_RETENTION_ALLOWLIST } from '~/routes/webhooks.shop.redact';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/** Model names in schema.prisma with a `shopId` field. */
function modelsWithShopId(): string[] {
  const schema = readFileSync(join(REPO_ROOT, 'apps/web/prisma/schema.prisma'), 'utf8');
  const models: string[] = [];
  const modelBlocks = schema.matchAll(/model (\w+) \{([^}]*)\}/gs);
  for (const [, name, body] of modelBlocks) {
    if (/^\s*shopId\s+String/m.test(body!)) models.push(name!);
  }
  return models.sort();
}

/** Model names actually deleted/anonymized in the redact route source. */
function modelsHandledInRedactRoute(): string[] {
  const src = readFileSync(join(REPO_ROOT, 'apps/web/app/routes/webhooks.shop.redact.tsx'), 'utf8');
  const models = new Set<string>();
  for (const [, model] of src.matchAll(/prisma\.(\w+)\.(?:deleteMany|delete|update|updateMany)\(/g)) {
    // lowerCamel prisma accessor → PascalCase model name
    models.add(model!.charAt(0).toUpperCase() + model!.slice(1));
  }
  return [...models].sort();
}

describe('shop/redact completeness (WS-G, finding Infra-11)', () => {
  it('every shopId-bearing model is either redacted or explicitly retained', () => {
    const all = modelsWithShopId();
    const handled = new Set(modelsHandledInRedactRoute());
    const allowlisted = new Set(REDACT_RETENTION_ALLOWLIST);
    const missing = all.filter((m) => !handled.has(m) && !allowlisted.has(m));
    expect(missing, `Add these to webhooks.shop.redact.tsx or to REDACT_RETENTION_ALLOWLIST with a reason: ${missing.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL (24 of 30 shop-scoped models are `missing`).

- [ ] **Step 3: Implement.** Triage every model in `missing` into one of two buckets and act on each:
  - **Delete/anonymize** (the default — most models): `Module`, `ModuleVersion` (cascades via `Module`'s relation — verify `onDelete: Cascade` on the FK, add explicit `deleteMany` if not cascaded), `Recipe`, `Connector`/`ConnectorEndpoint`/`ConnectorToken` (cascade check), `ApiLog`, `Job`, `ErrorLog`, `AiUsage`, `SupportTicket` (cascades `SupportTicketMessage`/`SupportTicketEvent`/`SupportFixProposal` via their `onDelete: Cascade` relations — verify), `InternalAiSession`/`InternalAiMessage`, `WorkflowRun`/`WorkflowRunStep` (cascade check), `FlowSchedule`, `FlowDeadLetter`, `ModuleInstance`/`ModuleSettingsValues`, `FunctionRuleSet`, `FlowAsset`, `AttributionLink` (already handled), `ModuleAsset`, `ImageIngestionJob`, `ThemeProfile`, `ShopApiRateLimit`, `AppSubscription` — extend the `counts` object and the delete calls, same pattern as the existing six.
  - **Retain (allowlist)**: `ActivityLog` — the audit trail, INCLUDING the `GDPR_SHOP_REDACT` row this route itself writes, must survive the shop's own deletion for compliance/ops history (this is the standard "we deleted data because you asked, and we're keeping a record that we did" pattern) — anonymize its `shopId` reference is unnecessary since `ActivityLog.shopId` is nullable and the FK uses no cascade; leave rows as-is but exclude from the completeness requirement via `REDACT_RETENTION_ALLOWLIST = ['ActivityLog'] as const;` exported from the route file with an inline comment explaining why.
  - **Decide `Shop` itself last, explicitly**: keep the `Shop` row (do NOT delete it) — many of the above deletes reference `shop.id` as a foreign key and Shopify's GDPR spec only requires *data* deletion, not losing the ability to recognize a re-install; if the row is deleted, `Session`/reinstall logic (webhook `app/uninstalled` already handles session cleanup separately) would need re-architecture out of this plan's scope — document this explicitly in the route's header comment: "Shop row is retained (not deleted) so a future re-install of the same shop domain resumes correctly; only the shop's *data* is deleted per GDPR shop/redact."
  - Order deletes child-before-parent where no `onDelete: Cascade` exists (check each FK in `schema.prisma` before assuming cascade — do not guess).

- [ ] **Step 4: Run** the new test + `npx vitest run` (full suite, since this touches a shared GDPR route — any existing shop-redact test must still pass). Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/webhooks.shop.redact.tsx apps/web/app/__tests__/shop-redact-completeness.test.ts
git commit -m "fix(ws-g): shop/redact deletes every shopId-bearing model (or documents why it's retained) [Infra-11]"
```

---

### Task 22: Test-connection actions for AI provider tiles

**Files:**
- Modify: `apps/web/app/routes/internal.ai-providers.tsx` (`intent === 'testConnection'`)
- Modify: `apps/web/app/routes/internal.integrations.tsx` (AI-provider tile "Test connection" button, deep-linking the result)

**Interfaces:**

```ts
// A minimal, cheap probe per provider kind — NOT a full generateRecipe call
// (that would burn real tokens on every click). Each kind's cheapest "are my
// credentials valid" endpoint:
//   OPENAI/GROK/DEEPSEEK/MISTRAL/CUSTOM/AZURE_OPENAI (all OpenAI-compatible): GET {baseUrl}/models
//   ANTHROPIC: POST {baseUrl}/v1/messages with max_tokens:1, a 1-token ping (Anthropic has no bare models-list on the messages API key scope reliably — verify against the Anthropic API docs at implementation time; if a lighter-weight endpoint exists, prefer it)
//   GEMINI: GET {baseUrl}/v1beta/models?key={apiKey}
```

- [ ] **Step 1: Write the failing test:**

```ts
it('testConnection for an OPENAI-compatible provider GETs /models with the Bearer key and reports ok on 200', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  // ... action() call with intent=testConnection, id=<provider id, kind OPENAI> ...
  const body = await res.json();
  expect(body.ok).toBe(true);
  vi.unstubAllGlobals();
});

it('testConnection surfaces the real upstream error on a 401, never a generic message', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"invalid_api_key"}', { status: 401 })));
  // ...
  const body = await res.json();
  expect(body.error).toMatch(/401|invalid_api_key/);
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** — a small `testProviderConnection(provider: { provider: ProviderKind; baseUrl: string | null; apiKey: string })` helper (new file `apps/web/app/services/internal/provider-connection-test.server.ts` if the branch logic is non-trivial enough to unit-test in isolation — prefer this over inlining in the route action, matching the codebase's service-per-concern convention seen throughout `internal.ai-providers.tsx`'s imports) dispatching per kind, wired to `intent === 'testConnection'` in `internal.ai-providers.tsx`'s action, calling `activity.log({ action: 'PROVIDER_TESTED', ... })` (new `ActivityAction` member) on every attempt (success or failure, mirroring the Hub's other test-connection actions' audit discipline from Tasks 5/10/11/12).
- [ ] **Step 4: Run**, then `pnpm --filter web build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/internal/provider-connection-test.server.ts apps/web/app/routes/internal.ai-providers.tsx apps/web/app/routes/internal.integrations.tsx apps/web/app/services/activity/activity.service.ts
git commit -m "feat(ws-int): Test-connection for AI provider tiles — real upstream probe, real error surfaced"
```

---

### Task 23: `ActivityAction` audit-coverage test

Closes the loop: every Hub/ops mutation added across Tasks 5-22 must be audited (Global Constraints).

**Files:**
- Create: `apps/web/app/__tests__/hub-activity-audit-coverage.test.ts`

- [ ] **Step 1: Write the test** (static-analysis style, mirroring the redact-completeness technique — grep the route files for `intent ===` branches and assert each either calls `activity.log`/`await audit(` somewhere in its block, or is a pure read like a `test*`-prefixed dry-run that's explicitly allowlisted):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const ROUTES_TO_CHECK = ['apps/web/app/routes/internal.integrations.tsx', 'apps/web/app/routes/internal.ai-providers.tsx'];

describe('Hub mutation intents are audited', () => {
  for (const route of ROUTES_TO_CHECK) {
    it(`every mutating intent branch in ${route} calls activity.log`, () => {
      const src = readFileSync(join(REPO_ROOT, route), 'utf8');
      const blocks = [...src.matchAll(/if \(intent === '(\w+)'\) \{([\s\S]*?)\n  \}/g)];
      const unaudited = blocks
        .filter(([, name]) => !name!.startsWith('get') && name !== 'noop')
        .filter(([, , body]) => !/activity\.log\(/.test(body!))
        .map(([, name]) => name);
      expect(unaudited, `Unaudited intents in ${route}: ${unaudited.join(', ')}`).toEqual([]);
    });
  }
});
```

(Note: this regex is intentionally simple and brittle to the codebase's actual `if (intent === '...') { ... }` block style — verify it matches real blocks during implementation; adjust the pattern to the file's actual brace/intent style rather than forcing the file to match the regex.)

- [ ] **Step 2: Run.** Expected: FAIL if any Task 5-22 branch missed its `activity.log` call — fix those branches now rather than deferring.
- [ ] **Step 3: Run** until PASS.
- [ ] **Step 4: Commit**

```bash
git add apps/web/app/__tests__/hub-activity-audit-coverage.test.ts
git commit -m "test(ws-int): every Hub mutation intent is audited via ActivityLog"
```

---

### Task 24: Docs

**Files:**
- Modify: `docs/internal-admin.md` if it exists (verify with `find docs -iname "internal-admin.md"` before writing — the WS-E plan's Task 17 referenced this file at `docs/publishing.md`; confirm this repo's doc-map convention by checking `docs/` root listing first), else fold into the nearest ops doc

- [ ] **Step 1:** Add a short "Integrations Hub" section: the two categories, DB-vs-env-reflect decision per tile (Decisions G4/G5/G6), the `OpsAlertService` threshold model (Decision G3), and the DLQ-replay honesty contract (Decision G8 — which job kinds are really replayable). No numeric claims in prose (program WS-J rule) — describe behavior, not counts.
- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs(ws-g/ws-int): Integrations Hub + ops-alert architecture"
```

---

### Task 25: Full-suite verification + build gate

**Files:** none (verification-only task)

- [ ] **Step 1:** `cd apps/web && npx vitest run` — expected: full suite PASS, including every test file created/modified across Tasks 1-24.
- [ ] **Step 2:** `pnpm --filter web build` — expected: clean build (every route-touching task above already ran this individually; this is the final cumulative check).
- [ ] **Step 3:** `cd apps/web && npx prisma migrate status` against the dev database — expected: all migrations from Tasks 1 and 8 applied, no drift.
- [ ] **Step 4:** Manually load `/internal/integrations` in a dev session (`shopify app dev` or the Railway preview) and click every "Test connection" / "Send test" button at least once, confirming each either succeeds or shows a real, specific error — no generic "something went wrong."
- [ ] **Step 5:** No commit (verification-only) — if any step fails, fix and return to the relevant task.

---

### Task 26 (owner-run — external accounts): Slack workspace webhook, Resend/Postmark, UptimeRobot/Healthchecks.io API keys

These require account-level actions this agent cannot perform (creating accounts, granting OAuth, generating API keys in third-party dashboards) — per the standing instruction, credential/account creation is the owner's action, done directly.

- [ ] **Slack:** In the target Slack workspace, create (or reuse) an app with an Incoming Webhook enabled for the ops-alerts channel; copy the `https://hooks.slack.com/services/...` URL; paste it into `/internal/integrations` → Slack tile → Save, then click "Send test message" to confirm delivery.
- [ ] **Email (Resend or Postmark — pick one; SMTP/SendGrid already work if already configured):** Sign up at resend.com or postmarkapp.com, verify the sending domain (DNS TXT/CNAME records — Resend and Postmark both walk through this in their dashboard), generate an API key, paste it into `/internal/integrations` → Email tile → provider dropdown → Save, then "Send test email."
- [ ] **UptimeRobot:** In the UptimeRobot dashboard (monitor already exists per WS-A Task 10), go to My Settings → API Settings → generate/copy the "Main API Key" (read-only is sufficient — do NOT use a read-write key here), and the numeric monitor ID from the monitor's URL; paste both into the Hub's UptimeRobot tile.
- [ ] **Healthchecks.io:** In the healthchecks.io dashboard (check `superapp-cron` already exists per WS-A Task 10), go to Account Settings → API Access → copy the read-only API key; paste it + the check's slug (`superapp-cron` by default) into the Hub's Healthchecks.io tile. Note: this requires **PR #13 (`cron.yml`) merged first** — without it there is no live check pinging, so the tile would correctly show "down"/no data, which is honest but not useful; sequence this after PR #13 lands.
- [ ] **Sentry:** Already live per WS-A Task 10 (`SENTRY_DSN` set on Railway web+worker) — no owner action needed here beyond what WS-A already completed; this plan's Sentry tile is read-only reflection.

---

## Execution order & shippability

1. **Tasks 1-13** (Prisma migration → `OpsAlertService` core → Slack sender → Hub shell → Sentry wire+tile → jobs.fail wire → webhook-failure wire → triage-failure wire + D5 → Email tile → Slack tile → UptimeRobot tile → Healthchecks tile → AI provider kinds+tiles) can ship as one deployable slice: every alert channel fires, every Category 1 and Category 2 tile is live and testable, no dead UI. **This is the natural first PR/ship point** — WS-G's "alert channel that fires" and WS-INT's full tile grid are both true after Task 13.
2. **Tasks 14-18** (real worker → honest DLQ replay → webhook fan-out enqueue → stuck-RUNNING sweep → health badges) are the second slice — they need `QUEUE_REDIS_URL` live (WS-A), so sequence this slice's merge after WS-A's Railway worker service is confirmed up, even though the code can be written and unit-tested earlier (inline-mode fallback in `enqueueOwnedJob` keeps dev machines without Redis working throughout).
3. **Tasks 19-21** (merchant-reply badge, triage async, shop/redact completeness) are independent of each other and of the worker — can land in any order, any time after Task 8 (triage) / Task 1 (schema).
4. **Tasks 22-25** (provider test-connection, audit-coverage test, docs, final verification) close out the plan.
5. **Task 26** (owner-run) can happen in parallel with any of the above — the Hub tiles function (save/mask/audit) before the owner has real credentials to enter; only the "Test connection" buttons need real accounts to show green.

At every commit boundary in Tasks 1-25, `pnpm --filter web build` is green and the full Vitest suite passes — each task is independently shippable, matching the program's "frequent commits, CI green at every merge" constraint.

## Out of scope

- **Merchant-facing BYO-AI-key** — explicitly out per the WS-INT charter (quota-economics implications); the Hub is internal-admin-only, no merchant-facing surface is touched.
- **WS-C's full async-generation migration** (`AI_GENERATE`/`AI_HYDRATE`/`AI_MODIFY`/`PUBLISH` off the inline request path) — Decision G8 deliberately does not attempt this; `internal.ops.tsx` honestly refuses to replay those types until WS-C lands its own entrypoints.
- **WS-E's publish/activation/rollback surface** — untouched; this plan's only `internal.ops.tsx` edit is the `job_replay`/`job_replay_all` cases.
- **Railway config-as-code migration and the scheduled `pg_dump` backup job** (Phase-5 note in the master plan) — explicitly deferred to a follow-up; this plan does not touch Railway service config or add a backup workflow.
- **PR #13 (`cron.yml`/`db-backup.yml`) merge itself** — this plan's Healthchecks.io tile works against whatever check exists once PR #13 lands (owner-run, Task 26); merging that PR is WS-A/owner territory, not redone here.
- **A second, general-purpose async-job UI** beyond the windowed health badges and the existing Jobs page — no new dashboard framework is introduced.
- **Rotating/expiring stored API keys, or a secrets-manager integration** (e.g. Railway's native secret refs) — keys are `encryptJson`-at-rest in Postgres via the existing pattern; a secrets-manager migration is not in scope.
- **Alerting on `FlowDeadLetter`/`HttpSyncRunnerService`'s own dead-letter replay** (already real, cron-driven, working) — this plan does not add `OpsAlertService` wiring to that path since it already succeeds/fails visibly through its own replay counters in `api.cron.tsx`'s response; adding it is a reasonable one-line follow-up but is not named in any WS-G finding, so it's left out to keep this plan's scope matched to the charter.

## Self-review

- **No dead tiles:** every tile added in Tasks 5, 9-13, 22 lands in the same task as its live wiring (Sentry: Task 5 wires + tiles together; email/Slack: senders built Tasks 2-3, tiles Tasks 9-10; UptimeRobot/Healthchecks: status-pull + tile together in Tasks 11-12; AI providers: kind extension + tile together in Task 13).
- **No unwired alerts:** `OpsAlertService.fire` has a real caller by the end of Task 8 (four call sites: API failures, job failures, webhook fan-out failures, triage failures) — matches every bullet in the charter's WS-G alert-channel line.
- **DLQ replay is honest, not fake-fixed:** Task 15 explicitly refuses unsupported types rather than laundering the existing fake-success behavior into a differently-fake success — this was the single highest-risk temptation in this plan (declaring victory on [Ops-1] without a real worker) and Decision G8 + Task 15's test suite guard against it directly.
- **DB-vs-env decision is made and justified per service**, not left ambiguous, per the charter's explicit ask (Decisions G4-G6).
- **Sequencing dependency on WS-C is named, not hidden** (plan header + Decision G8 + Out of scope) — this is the one place this plan's scope is deliberately narrower than the charter's literal words ("DLQ replay backed by the real worker") could be read; the charter also says WS-C is a separate, larger, already-distinct workstream item in the master plan, so this reading (own the ops-relevant kinds, refuse the rest honestly) is the defensible interpretation rather than silently blocking this entire plan on an unplanned workstream.
- **Additive-only migrations confirmed**: Task 1 is all-new-columns/index; Task 8's `@default` change on `supportTriageMode` does not drop or rename data.
