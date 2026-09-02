# Operations

This is the operator's map of how the SuperApp is deployed, monitored, and
recovered — topology, deploy flow, observability, and "which runbook do I
reach for." It intentionally does not duplicate step-by-step incident
procedures (those live in `docs/runbooks/*.md`), the SLO math (`docs/slos.md`),
or an environment-variable matrix (that's `apps/web/.env.example` and
`apps/web/app/env.server.ts` directly — a hand-copied matrix here would drift
the same way `docs/archive/deployment/env-matrix.md` did, which is why that
file is archived rather than fixed). **Last verified: 2026-08-27**, against
`master@8a656af` (post wave-two merge: WS-C async engine #19, WS-F merchant UI
#18, WS-G ops/integrations #17, WS-H templates #16, plus #20/#22/#23/#24).

---

## 1. Current topology

The app runs on Railway as a small set of processes built from the SAME
`apps/web` Docker image with different entrypoints, sharing one Postgres
database and one Redis instance:

| Process | Config | Entrypoint | Role |
|---|---|---|---|
| `web` | `apps/web/railway.web.toml` | Remix server (`build/server`) | Embedded admin UI, storefront app-proxy routes, webhooks, `/api/agent/*`. |
| `worker` | `apps/web/railway.worker.toml` | `pnpm --filter web worker:start` | Connects to the queue Redis via `@superapp/job-orchestration`, serves `/healthz`. Two modes, both real, selected by `JOB_EXECUTION_MODE` (`packages/job-orchestration/src/config.ts`): **`inline` (the default)** — work runs synchronously in the `web` process, `worker` stays health-only; **`queue`** (needs `QUEUE_REDIS_URL`) — `scripts/worker.ts` mounts real BullMQ `Worker`s (`createWebWorkerRuntime`) for each queue with a registered handler. `buildWorkerHandlers()` (`apps/web/app/services/jobs/processors/index.ts`) registers two queues today: `ai-generation` (`AI_GENERATE`/`AI_HYDRATE`) and `publish` (`PUBLISH`); `connector`/`flow`/`webhook`/`retention` are declared `PlatformQueueName`s with no handler yet. Nothing in Railway config flips the flag — `queue` mode is an explicit deploy decision, not a rollout default. |
| `internal-router` | `apps/web/railway.internal-router.toml` | `pnpm --filter web router:internal` | Standalone service fronting the internal admin AI assistant's provider routing — see `docs/internal-admin.md`. |

Both `web` and `worker` set `healthcheckPath = "/healthz"` with a 120s timeout
and `restartPolicyType = "ON_FAILURE"` in their Railway TOML configs.

**There is no separate frontend/API/workers split in production.** An earlier
"Platform V2" effort built one — that code, its Dockerfiles, and its `v2-*`
CI workflows (§2) still sit in the repo tree, but none of it is part of the
live topology; its Railway configs describe services that are not deployed.
See `docs/architecture.md` §2/§8 for the full inventory of what's live versus
dead in that tree — this doc does not repeat it, by name or otherwise.

**Cron.** `/api/cron` (`apps/web/app/routes/api.cron.tsx`) is a real,
`X-Cron-Secret`-protected HTTP endpoint (returns 503 if `CRON_SECRET` is
unset) that runs the scheduled sweeps — flow/messaging/httpSync schedule
ticks, the workflow-engine resume sweep, dead-letter replay, App Pricing
plan reconciliation. **Nothing in this repo configures what calls it or on
what interval** — no Railway cron block, no GitHub Actions schedule targets
it (the `ci.yml` `schedule:` trigger is the unrelated nightly eval flywheel).
The trigger is an external scheduler configured outside this codebase; verify
its actual interval in the Railway/scheduler dashboard rather than assuming
one from this doc.

**Postgres / Redis.** Postgres (via Prisma) is the system of record;
`apps/web/prisma/schema.prisma`'s `datasource` block has read `provider =
"postgresql"` since the WS-A Railway cutover. For the SQLite→Postgres
migration history itself, see `docs/runbooks/postgres-migration.md` — that
runbook predates the cutover and is kept for history, not as the current
state description (the schema file is the current source of truth). Redis
backs the job queue (`QUEUE_REDIS_URL`/`REDIS_URL`) and rate limiting.

---

## 2. Deploy flow

**CI (`.github/workflows/ci.yml`)** runs on every push/PR to `master` (plus a
03:00 UTC nightly schedule for the eval flywheel, and manual dispatch). Jobs,
in dependency order: `quality` (lint + typecheck across the live `web`/`core`
packages plus several shared `packages/*` libraries, including typecheck for
the retired-but-still-in-workspace packages from §1 + `prisma validate`),
`test` (unit tests), `test-functions` (wasm Function extension tests),
`liquid-budget` (the aggregate 100KB TAE Liquid budget check), `e2e-internal`
(Playwright against a locally-booted dev server), `evals` (the AI regression
suite against golden fixtures, strict gate), and `build` (the actual `web`
production build). `evals-nightly` runs standalone on the schedule trigger
only, with its own trend gate that fails the run on a >10% quality
regression.

**Deploy (`.github/workflows/deploy.yml`)** is now, by its own header
comment, only an image-build gate: it docker-builds `apps/web/Dockerfile` on
every `master` push to prove the image builds cleanly on a neutral runner. The
actual deploy is Railway-native — GitHub auto-deploy per service, gated by
Railway's "Wait for CI" setting. **Correction (2026-09-02 DevOps audit): that
gate was NOT actually enabled** — a live `railway status --json` read showed
`checkSuites: null` on both production services, so a red master could deploy.
Enabling it is a 2-minute owner step; the exact CLI command and dashboard path
are in [`runbooks/deploy-and-rollback.md`](./runbooks/deploy-and-rollback.md).

**Post-deploy verification (`.github/workflows/post-deploy-smoke.yml`,
2026-09)** fires after CI completes for a master push: polls `/healthz` until
the new commit sha serves (healthz echoes `RAILWAY_GIT_COMMIT_SHA` as
`release`), then checks `/healthz`, `/healthz/deep` and `/internal/login`,
filing a GitHub issue on regression. Inert until the `PROD_BASE_URL` repo
variable is set.

**Backups**: nightly `pg_dump` (`db-backup.yml`, 04:00 UTC, 30-day artifact
retention; requires the `DATABASE_BACKUP_URL` repo secret) + weekly restore
verification into a scratch Postgres (`db-restore-verify.yml`); both file
GitHub issues on failure. History note: every nightly backup between the
Postgres 18 cutover and 2026-09-02 failed on a pg_dump version mismatch —
see [`runbooks/restore-from-backup.md`](./runbooks/restore-from-backup.md).

The `v2-*` CI workflows build and would-deploy the retired Platform V2 split
(§1) — they are not part of the live release path for the app merchants
actually use.

---

## 3. Observability

**Sentry** is a real, code-verified integration: `apps/web/app/services/observability/sentry.server.ts`
lazily activates only when `SENTRY_DSN` is set (so a build without a DSN pays
no runtime cost), redacts every event through `redact.server.ts` before
sending, and reads `SENTRY_RELEASE`/`SENTRY_TRACES_SAMPLE_RATE` from the
environment. `SENTRY_DSN` is declared optional in `apps/web/app/env.server.ts`.

**healthchecks.io and UptimeRobot** are the live external monitors for the
`web` process. Neither is *driven* from this repo — UptimeRobot polls
`/healthz` from outside, and the healthchecks.io ping is sent by the cron
workflow, not the Node process — but as of WS-G (#17) both now have a
read-only footprint: `/internal/integrations` (the Integrations Hub, below)
stores a status-API key for each in `AppSettings` and displays live
check/monitor status pulled from that key. The tile itself is explicit that
configuring the monitor/ping stays in the external dashboard. Check the
actual dashboards, not this doc, before trusting whether either is currently
green.

**`/internal/integrations` — Integrations Hub** (WS-G, #17) is a
marketplace-style grid of every external service the app talks to: one tile
per AI-provider kind (deep-links into `/internal/ai-providers`, the single
`AiProvider` writer) plus ops-service tiles (Slack, Email, UptimeRobot,
Healthchecks.io, Sentry) using whichever config model fits how the app
actually depends on that service at runtime (DB-config read/write,
DB-config read-only status key, or env-only reflect+test). See
[`docs/internal-admin.md`](./internal-admin.md#integrations-hub) for the
full per-category breakdown.

**`OpsAlertService`** (`apps/web/app/services/observability/ops-alert.server.ts`,
WS-G #17) is the single fan-out point for operational alerts — no call site
pages Sentry or sends Slack/email directly. It fans out via
`Promise.allSettled` (Sentry unconditional; Slack/email gated by a
rolling-window threshold plus a per-kind cooldown so one root cause pages
once, not once per layer or per retry) and skips paging on expected 4xx
`AppError`s. Wired call sites today: the shared `withApiLogging` catch,
`JobService.fail`, the webhook route's per-connector catches, and
support-triage failure notifications. Full mechanics in
[`docs/internal-admin.md`](./internal-admin.md#ops-alert-fan-out).

**Ops health sweep + `/healthz/deep`** (DevOps hardening, 2026-09).
`services/observability/ops-health.server.ts` computes threshold-classified
signals — queue backlog, stuck RUNNING jobs, DLQ depth (24h), error-rate
spike (15 min), cron heartbeat staleness, AI daily spend vs cap
(`ai-spend-guard.server.ts`, observability only) — each ok/warn/fail. The
`/api/cron` tick writes a heartbeat (`AppSettings.cronLastTickAt`), persists
the snapshot (`AppSettings.opsHealthSnapshot`), fires
`OPS_HEALTH_DEGRADED`/`AI_SPEND_CAP_EXCEEDED` through `OpsAlertService` for
fail-level signals, and the internal admin shell renders a banner for any
warn/fail — visible with zero alert keys configured. `/healthz/deep`
(CRON_SECRET header or internal-admin session) serves the live signals plus
db/redis probes; 503 only on fail (warn must not flap external monitors).

**`/internal/funnel`** (WS-C, #19) is the generation funnel dashboard —
`apps/web/app/routes/internal.funnel.tsx` backed by
`services/observability/funnel.service.ts`. `FunnelService.windowStats`
tracks the launch program's "99.9% headline": of every `AI_GENERATE` `Job`
created in the window, what fraction shares a `correlationId` with a
successful `AI_HYDRATE` job (`hydrated`) and, further, a successful
`PUBLISH` job (`published`, the end-to-end rate) — all keyed on the same
`correlationId` the WS-QF billing-dedupe seam already uses, not a second
parallel id. It also surfaces the most recent `AI_GENERATE`/`AI_HYDRATE`/
`PUBLISH` failures with a human-readable error summary, so operators can see
where generations are actually dropping off instead of inferring it from
scattered logs.

---

## 4. SLOs

`docs/slos.md` defines the measurable reliability targets (publish success
rate, generation latency, etc.), each with a target, an error budget, a SQL
measurement query, and an alert threshold. It's already well-scoped as its
own doc — this section is a pointer, not a summary to keep in sync by hand.

---

## 5. Which runbook do I reach for

| Runbook | Type | Trigger |
|---|---|---|
| [`runbooks/index.md`](./runbooks/index.md) | Index | Start here — severity ladder, first-responder checklist, internal admin quick links. |
| [`runbooks/README.md`](./runbooks/README.md) | Index | Directory overview; points back at `index.md` and at this doc for topology/SLOs. |
| [`runbooks/deploy-and-rollback.md`](./runbooks/deploy-and-rollback.md) | Deploy / rollback procedure | Deploy failed, bad build cut over, or "how do I roll back?" Includes the Wait-for-CI owner step. |
| [`runbooks/db-down.md`](./runbooks/db-down.md) | Incident (SEV-1) | `/healthz` 503 with `db: fail`; Prisma connection errors flooding logs. |
| [`runbooks/redis-down.md`](./runbooks/redis-down.md) | Incident (SEV-2) | `/healthz` 503 with `redis: fail`; queue-mode jobs stalling. |
| [`runbooks/restore-from-backup.md`](./runbooks/restore-from-backup.md) | Incident (SEV-1) + verification | Data loss/corruption; also documents the backup inventory and the weekly restore-verify workflow. |
| [`runbooks/secrets-rotation.md`](./runbooks/secrets-rotation.md) | Owner procedure | Rotating any secret; includes the dead-`ANTHROPIC_API_KEY` cleanup owner action. |
| [`runbooks/publish-failure.md`](./runbooks/publish-failure.md) | Incident (SEV-1 → SEV-2) | Merchant reports "Publish failed", or a `Job` row has `status = FAILED, type = PUBLISH`. |
| [`runbooks/provider-outage.md`](./runbooks/provider-outage.md) | Incident (SEV-2 → SEV-3) | Spike in AI-related `ErrorLog` rows, `AiUsage` failures, or "Module generation failed" reports. |
| [`runbooks/webhook-storm.md`](./runbooks/webhook-storm.md) | Incident (SEV-2 → SEV-3) | High `WebhookEvent` insert rate, `FLOW_RUN` jobs backing up in `QUEUED`/`RUNNING`, Shopify retry spikes. |
| [`runbooks/connector-failure.md`](./runbooks/connector-failure.md) | Incident (SEV-3 → SEV-4) | Connector test errors, a flow step's connector call failing, SSRF block alerts. |
| [`runbooks/postgres-migration.md`](./runbooks/postgres-migration.md) | Historical / migration record | Reference for how the SQLite→Postgres cutover was staged — not a live procedure to re-run. |
| [`runbooks/app-pricing-setup.md`](./runbooks/app-pricing-setup.md) | One-time owner-run activation | Turning on Shopify App Pricing (the billing code is merged but inert until this checklist is run and its env vars are set). |
| [`runbooks/scope-reconsent.md`](./runbooks/scope-reconsent.md) | One-time owner-run release | Rolling out the 19-scope re-consent list — currently blocked upstream by a Shopify CLI validation bug (cli#8386); check the runbook's own STATUS line before assuming it's actionable. |
| [`runbooks/publish-live-probe.md`](./runbooks/publish-live-probe.md) | One-time owner-run verification | End-to-end live-store verification of publish integrity per surface — per its own STATUS line, not yet executed as of this doc's last verification. |

---

## 6. Rollback / incident escalation

For a specific incident, open the matching runbook above and follow its own
Detect → Triage → Contain → Fix → Post-mortem sequence — this doc does not
keep a second copy of those steps. For a bad publish specifically, the
recovery mechanism is documented in `docs/publishing.md` §4-5: rollback is a
real republish of the target version (not a DB-only flip), and any partial
publish failure is safe to retry because every write is idempotent — see that
doc for the mechanics, and `runbooks/publish-failure.md` for the operator
procedure. Escalate per the severity ladder in `runbooks/index.md`.

---

## 7. Environment variables

Don't hand-copy a matrix here — it will drift the same way
`docs/archive/deployment/env-matrix.md` did (archived in WS-J Task 1 for
exactly that reason). The two real sources of truth are:

- `apps/web/.env.example` — every variable a local/deployed instance needs,
  with inline comments for anything non-obvious (format constraints, which
  doc section explains it, what happens if it's unset).
- `apps/web/app/env.server.ts` — the Zod-validated subset the app actually
  reads at runtime, including which vars are required vs. optional and their
  shape (e.g. `SENTRY_DSN` as an optional URL, `CRON_SECRET` as an optional
  string that disables `/api/cron` when absent).

If a variable is in one file but not the other, that's a real drift worth
fixing in the code, not something to reconcile by hand in this doc.
