# Operations

This is the operator's map of how the SuperApp is deployed, monitored, and
recovered — topology, deploy flow, observability, and "which runbook do I
reach for." It intentionally does not duplicate step-by-step incident
procedures (those live in `docs/runbooks/*.md`), the SLO math (`docs/slos.md`),
or an environment-variable matrix (that's `apps/web/.env.example` and
`apps/web/app/env.server.ts` directly — a hand-copied matrix here would drift
the same way `docs/archive/deployment/env-matrix.md` did, which is why that
file is archived rather than fixed). **Last verified: 2026-08-27**, against
`master@c201150` (this branch's base).

---

## 1. Current topology

The app runs on Railway as a small set of processes built from the SAME
`apps/web` Docker image with different entrypoints, sharing one Postgres
database and one Redis instance:

| Process | Config | Entrypoint | Role |
|---|---|---|---|
| `web` | `apps/web/railway.web.toml` | Remix server (`build/server`) | Embedded admin UI, storefront app-proxy routes, webhooks, `/api/agent/*`. |
| `worker` | `apps/web/railway.worker.toml` | `pnpm --filter web worker:start` | Connects to the queue Redis via `@superapp/job-orchestration`, serves `/healthz`. As of this writing it's a WS-A skeleton — it proves the wiring but doesn't run real BullMQ handlers yet; `JOB_EXECUTION_MODE` stays `inline` (work runs synchronously in `web`) until WS-C's async engine lands (unmerged). |
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
Railway's own "Wait for CI" setting (per the workflow's comment; verify the
gate is still enabled per-service in the Railway dashboard, since that
setting lives outside this repo).

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

**healthchecks.io and UptimeRobot** — per the launch-program plan these are
the live external monitors for the `web` process, but **neither has any
in-repo footprint**: no ping/heartbeat call, no configuration file, and no
reference outside the planning doc itself (confirmed by a repo-wide search).
That's expected for both services — they're typically configured entirely in
their own dashboards against a public health URL, not in application code —
but it also means this doc cannot verify from source whether they're
currently configured and green. Check the actual dashboards, not this file,
before trusting that claim.

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
