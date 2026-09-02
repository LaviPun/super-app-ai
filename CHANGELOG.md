# Changelog

All notable merged changes to this repo, grouped by the launch-program workstream (`WS-<letter>`) that landed them. See [`docs/superpowers/plans/2026-08-24-launch-program.md`](./docs/superpowers/plans/2026-08-24-launch-program.md) for the workstream plan these entries track.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/); entries are grouped by merge, not by release version, since this app doesn't cut numbered releases.

## [Unreleased]

PR #44 (prompt diet) is open but deliberately held un-merged pending a live-model eval — do not document it as shipped. (The WS-I cleanup previously noted here merged as PR #27 on 2026-08-27.)

## [2026-09-02] — ci: pre-warm function-runner binary to kill wasm-job flake

Commit `0e81e8e` (PR #48).

### Fixed
- Intermittent `spawn .../function-runner-9.2.2 ENOENT` in the Function Extensions (wasm) CI job: the six extension suites run in parallel and each lazily triggers the Shopify CLI's function-runner binary download, which is deduped only within one process — concurrent first-uses raced cross-process. `ci.yml` now pre-warms the binary with one `shopify app function info` (3 attempts) before the parallel suites. See `docs/debug.md` §27

## [2026-09-02] — fix: repair PR #46 workflow files rejected by GitHub's parser

Commit `413d376` (PR #47).

### Fixed
- `db-backup.yml`, `db-restore-verify.yml`, and `post-deploy-smoke.yml` all failed at GitHub's workflow-parse level (zero jobs run): their issue-on-failure steps built multi-line `gh issue create --body "..."` strings with continuation lines at column 0, which terminates a `run: |` block scalar and turns the rest into invalid top-level YAML. Bodies are now built with an indented `printf` command substitution; `db-backup.yml` also reads `DATABASE_BACKUP_URL` via `env:` instead of interpolating `${{ secrets.* }}` into the script, plus shellcheck cleanups — `actionlint` is now clean across `.github/workflows/`. See `docs/debug.md` §26

## [2026-09-02] — DevOps hardening: CI-gated deploys, deep health, alerting, spend guardrail, runbooks

Branch `feat/devops-hardening`.

### Fixed
- **Nightly DB backup had been failing silently since the Postgres 18 cutover** — the runner's default `postgresql-client` (v16) aborts on `server version mismatch` against the Railway `postgres-ssl:18` server. `db-backup.yml` now installs `postgresql-client-18` from PGDG, enforces a 10KB minimum dump size, and files a deduped GitHub issue (`ops-backup-failure`) on any failure instead of a silent red run

### Added
- `/healthz/deep` (`routes/healthz_.deep.tsx`, CRON_SECRET header or internal-admin session): db/redis probes + threshold-classified ops signals — queue backlog, stuck RUNNING, DLQ depth (24h), error-rate spike, cron heartbeat staleness, AI daily spend — each ok/warn/fail/skipped; 503 only on fail
- Ops health sweep in `/api/cron` (`services/observability/ops-health.server.ts`): writes `AppSettings.cronLastTickAt` heartbeat, persists `opsHealthSnapshot`, fires `OPS_HEALTH_DEGRADED` / `AI_SPEND_CAP_EXCEEDED` through the existing WS-G `OpsAlertService` seam (Sentry/Slack/email light up the moment keys exist); internal admin shell renders a warn/critical ops banner from the snapshot even with no keys
- AI spend guardrail (`services/observability/ai-spend-guard.server.ts`): today's `AiUsage.costCents` vs a daily soft cap (`AppSettings.aiDailySpendCapCents` → `AI_DAILY_SPEND_CAP_CENTS` → $20 default); observability only — never blocks a request
- Post-deploy smoke (`.github/workflows/post-deploy-smoke.yml`): after CI passes on master, polls `/healthz` until the new commit sha serves (healthz now echoes `RAILWAY_GIT_COMMIT_SHA` as `release`), then checks `/healthz`, `/healthz/deep`, `/internal/login`; files a deduped issue on regression; inert until the `PROD_BASE_URL` repo variable is set
- Weekly backup restore verification (`.github/workflows/db-restore-verify.yml`): restores the newest nightly artifact into a scratch Postgres 18 and sanity-counts schema/rows; plus a local owner-run equivalent `scripts/verify-backup-restore.mjs`
- Runbooks: `deploy-and-rollback.md` (incl. the exact Wait-for-CI owner step — live audit found `checkSuites: null` on both production services, so a red master could deploy), `restore-from-backup.md`, `db-down.md`, `redis-down.md`, `secrets-rotation.md` (incl. the dead revoked `ANTHROPIC_API_KEY` cleanup owner action); runbook index + `docs/operations.md` updated to match reality
- Additive migration `20260902090000_devops_ops_health_spend_guard`: `AppSettings.cronLastTickAt`, `opsHealthSnapshot`, `aiDailySpendCapCents`

## [2026-08-28] — Fix production preview CSS packaging + invalid metafield namespaces + unknown-price warn

Commit `97e0622` (PR #45).

### Fixed
- **Every metafield write had always failed** — Shopify rejects dots in metafield namespaces, and every namespace this app wrote was dotted (`superapp.theme` etc.). Renamed to underscore forms (`superapp_theme`, `superapp_admin`, `superapp_functions`, `superapp_checkout`, `superapp_customer_account`, `superapp_flow`, `superapp_integration`) across writers and every reader in one pass; no data migration needed since no store could ever hold data under the dotted names. Guarded by a new charset test that also sweeps for new dotted literals. See `docs/debug.md` §24
- Production storefront previews silently rendered without the two-pack stylesheet: `apps/web/Dockerfile` never copied `extensions/`, so `PreviewService.loadPackCss()` missed at boot and degraded to legacy CSS for the process lifetime. The image now ships `extensions/theme-app-extension/assets`, and the miss is error-level + written to `ErrorLog` (D8: no silent failures). See `docs/debug.md` §25

### Added
- `estimateCostCentsFromDbRates` WARNs once per model per process when usage is recorded for a model with no `AiModelPrice` row (which prices at 0 and silently masks real spend), pointing at `seed:ai-pricing`

## [2026-08-28] — P2-A: prompt caching — stable-prefix split + Anthropic cache_control (flag-gated OFF)

Commit `de7b41f` (PR #43).

### Added
- Create-module and hydrate prompt compilers now return `{ prompt, cacheableChars }` — a byte-stable, shop/request-agnostic stable prefix followed by the dynamic suffix (merchant text, optionCount task text, recipe JSON). Content parity with the pre-split prompts is pinned by a word-multiset test (`prompt-content-parity.test.ts`) against frozen pre-split copies
- Anthropic client turns `cacheableChars` into real `cache_control` breakpoints (message prefix + system block when structured output is active) behind `AI_PROMPT_CACHING_ENABLED` (`env.server.ts`, **default off** — lands inert; flag-off request shape is byte-identical to pre-P2-A). `cacheableChars`/`cache_control` are Anthropic-only; OpenAI/Gemini/compatible legs see only the reordering
- `GenerateResult`/`AiUsage.meta` gain `cacheReadTokens`/`cacheCreationTokens` from Anthropic's cache usage fields
- `guardAnthropicSkillsConfig` logs an `[ai-skills]` warning when provider-enabled code execution disables structured-output tool-forcing (mutually exclusive), instead of degrading silently

### Fixed
- Structured-output forced-tool names are now index-invariant (dropped `_${idx}`/`_qa` suffixes) — the per-option names changed the `tools` block bytes and invalidated both cache breakpoints across every sibling fan-out call
- `code_execution_20250825` → `code_execution_20260521` tool-type drift in the Anthropic client

## [2026-08-28] — fix(evals): four validity bugs in the AI eval harness

Commit `936e54e` (PR #42).

### Fixed
- `EVAL_PROVIDER_ID` was decorative (used only as a truthy switch — a "live" run could silently score the wrong client): it now pins the named `AiProvider` row by id or name via the production `ConfiguredLlmClient` path and **fails fast** when the row doesn't exist; `EVAL_PROVIDER_ID=env` explicitly selects the env client, and the runner's provider log line is honest in every mode
- Silent cross-provider fallback inside a qualification gate: eval runs now pass `disableFallback` so a `claude-*` run can never silently score `gpt-*` output (skips the env OpenAI wrap, operator manual fallback, and cost-chain legs)
- `ANTHROPIC_SKILLS` env leaked Skills/code-execution/beta headers into eval calls — eval runs now pass `ignoreEnvSkills`
- 80-char error truncation hid actionable failures: a deduped "Distinct errors" section prints the first 400 chars of each distinct error once

All fixes are gated to the eval entrypoint; production `getLlmClient()` defaults are unchanged, asserted by `eval-harness-validity.test.ts` (10 cases).

## [2026-08-28] — fix(ai): raise generated-module quality bar

Commit `e56f3ca` (PR #41). Diagnosis ran 4 real prompts through the live pipeline (real Anthropic calls, real `PreviewService` renders).

### Fixed
- `theme.section`/`proxy.widget` token budgets raised 3000→**7000** / 2500→**5500** — they carried the smallest budgets in the system despite the richest design-system prompt, reproducing total generation failure (all parallel options truncated at `stop_reason=max_tokens`)
- `normalizeTokenBraces()` at all single-brace substitution call sites — a Handlebars-style `{{token}}` survived richness-QA but broke live-value substitution, leaving literal braces in shopper-facing copy

### Added
- Deterministic storefront-like preview chrome in `PreviewService` (legible baseline color, neutral page canvas, constrained measure) so inherit/currentColor tokens resolve against something realistic
- Prompt guidance documents `config.countdown` for any kind (not just popups) and makes the advancedCustom-not-rendered-in-preview tradeoff explicit; new `richness.advancedCustom-primary` WARN when a recipe leans on `advancedCustom` for substantial content
- Tightened (opt-in, off-by-default) judge rubric with concrete design/copy-quality criteria

## [2026-08-28] — Internal admin audit: fix logs, live tail, job replay, hydration

Commit `488c652` (PR #40).

### Fixed
- **"Logs are not opening":** the Activity/API Logs/Jobs/Error Logs/Webhooks detail routes nested under list pages with no `<Outlet/>`, so a detail navigation fetched data and changed the URL but rendered nothing. Renamed to Remix's trailing-underscore convention (`internal.X_.$id.tsx`) to de-nest; URLs unchanged
- Live tail silently hung forever on a dropped SSE connection (`onerror` only reacted to `CLOSED`; transient drops stay `CONNECTING`): shared `useLiveTail`/`attachLiveTail` now shows a "reconnecting" banner and gives up loudly (close + toast + toggle off) after 5 consecutive failed retries
- Job detail "Replay job" hard-crashed the page (posted to `/internal/jobs`, which has no action) — now goes through the audited `/internal/ops` `job_replay` intent like the list page
- Route errors reported as `"[object Object]"` in the Error Log: `describeRouteError` renders thrown Responses as `<status> <statusText>: <data>` with JSON fallbacks
- Job detail hydration errors on every load (`toLocaleString()` differs between Node and browser locales) — timestamps formatted once in the loader
- Vite/Remix HMR dev-tooling errors filtered out of `/api/report-error`; ⌘K palette copy no longer overclaims full-text entity search (it navigates to pages / matches correlation IDs)

### Added
- `vite:preloadError` recovery: a tab open across a deploy boundary whose route-chunk fetch fails against pruned content-hashed chunks now reports the incident and reloads once (sessionStorage one-shot guard) instead of surfacing `ReferenceError`s from stale bundles

## [2026-08-27] — WS-C: Async generation engine

BullMQ worker, deadline budgets, funnel spine, hardened errors. Commit `6b4f25e` (PR #19).

### Added
- Real BullMQ `Worker` runtime mounted in `apps/web/scripts/worker.ts` (`createWebWorkerRuntime`) — active when `JOB_EXECUTION_MODE=queue` and `QUEUE_REDIS_URL` is set; registered queues today are `ai-generation` (`AI_GENERATE`/`AI_HYDRATE`) and `publish` (`PUBLISH`)
- `enqueueWebJob` seam (`services/jobs/enqueue.server.ts`) — trace rides in the payload; `isAsyncJobsEnabled()` reflects the effective mode
- `/api/ai/generate-async` + `/api/ai/jobs/:jobId` poll route, `runGenerationPipeline` extracted (hook-driven, route-behavior-identical) so inline and queued paths share one pipeline
- `/internal/funnel` dashboard (`FunnelService.windowStats`) — tracks the launch program's end-to-end `AI_GENERATE` → `AI_HYDRATE` → `PUBLISH` conversion rate by shared `correlationId`, plus recent-failure surfacing
- Additive schema: `AiGenerationOption`, `Job.stage`, `Module.generationCorrelationId`, QA promotion setting

### Changed
- **`JOB_EXECUTION_MODE` still defaults to `inline`** — work runs synchronously in the `web` process unless a deploy explicitly opts into `queue` mode; this is a deliberate, unflipped default (see `docs/operations.md` §1)

Also on this date: `8a656af` (PR #24) — mechanical lint cleanup restoring warning-cap headroom after the wave-two merge (102 → 92 warnings); no behavior changes.

## [2026-08-27] — fix(gdpr): `customers/data_request` now delivers

Commit `e45c061` (PR #23).

### Fixed
- `customers/data_request` webhook handler previously only logged a `DataCapture` count to `ActivityLog` — no export was ever compiled or delivered, and its `customerId` filter was a dead no-op. `services/gdpr/data-request-export.server.ts` now compiles a real export (`DataCapture`, `DataStoreRecord`, `ModuleEvent`, `AttributionLink`, `SupportTicket`) and emails it to the shop owner via the existing mailer, byte-capped with loud truncation notes, never throwing on failure (every failure path is logged instead of silently swallowed)

## [2026-08-27] — WS-S: Submission prep

Conformance self-check, listing copy, scope table, GDPR verification, reviewer notes. Commit `5e8d284` (PR #22).

### Added
- Pre-submission conformance self-check script (fail-loud checks, fixture-tested)
- App Store listing copy draft, scope-justification table, reviewer-notes structure, screenshot/asset checklist (`docs/launch/`)
- GDPR webhook verification commands + `shop/redact` completeness test (`shop-redact-completeness.test.ts` — asserts every shop-scoped Prisma model, ~31 of them, is either redacted or explicitly retained)

### Fixed
- Owner decisions folded in: support email, `write_checkouts` scope kept, privacy-URL deferred

## [2026-08-27] — fix(flows): `ROUTE_ORDER` no longer silently no-ops

Commit `7d68b21` (PR #20).

### Fixed
- `FlowRunnerService.executeStep` had no `ROUTE_ORDER` branch, so it fell through to `{ skipped: true }` — a step that reported SUCCESS on every run without ever routing an order (D8: no silent failures). Ported the existing `ShopifyConnector.order.routeToLocation` (fulfillment-order lookup, then move) onto the admin.graphql pattern the runner's sibling order steps already use, so `ROUTE_ORDER` now genuinely executes or throws loudly on misconfiguration. `ROUTE_ORDER` still isn't reachable through any authoring path (not in FlowBuilder's step catalog or the RecipeSpec Zod schema) — the fix closes the silent-success trap for if/when it becomes authorable, and hardens the generic fallthrough for any other unrecognized step kind

## [2026-08-27] — WS-F: Merchant UI

Honest flows, schema-driven settings, full Polaris migration. Commit `eb5aba5` (PR #18).

### Added
- Full merchant-surface migration to Shopify Polaris web components
- Signed capability token authorizes `preview.$moduleId.tsx` instead of a trusted shop param

### Changed
- Merchant `/jobs` route no longer displays AI cost/token/provider internals
- Template detail's "Use template" now creates the module instead of dead-navigating; Flows' "Templates" button repoints to `/flows/templates`
- Maya (merchant support copy) now discloses it's AI per design decision D4 — the prior copy was written to impersonate a human

### Fixed
- `useTemplateSubmission` renamed to `buildTemplateSubmission` (real `react-hooks/rules-of-hooks` violation — a plain helper named with a `use*` prefix was being treated as a hook)
- Regression coverage added for "Generate full settings" ([UI-3])

## [2026-08-27] — WS-G+INT: Ops alerting + Integrations Hub

Commit `2bd05af` (PR #17).

### Added
- `OpsAlertService` (`services/observability/ops-alert.server.ts`) — single fan-out point for operational alerts (Sentry unconditional; Slack/email gated by a rolling-window occurrence count plus a per-kind cooldown, tracked via separate `OPS_ALERT_OCCURRED`/`OPS_ALERT_FIRED` `ActivityLog` rows to avoid a bootstrap deadlock); real Slack incoming-webhook sender wired as the default channel
- `/internal/integrations` — Integrations Hub: one tile per AI-provider kind (deep-links into `/internal/ai-providers`) plus ops-service tiles (Slack, Email, UptimeRobot, Healthchecks.io, Sentry), each using the config model that fits how the app actually depends on that service (DB read/write, DB read-only status key, or env-only reflect+test)
- `hub-activity-audit-coverage.test.ts` — static-analysis test asserting every mutating Hub/AI-providers intent branch calls `activity.log` with a typed `ActivityAction`

### Fixed
- Occurrence-counting split from fire-counting to break a threshold bootstrap deadlock (a single counter that both gated delivery and recorded the threshold could never organically leave zero)

## [2026-08-27] — WS-H: Templates

Honest packs, store-aesthetic installs, Liquid headroom, parity guards. Commit `363cb9d` (PR #16).

### Changed
- **H1 (controller ruling):** collapsed the documented/selectable render-pack set from 4 (Luxe/Bold/Playful/Utility) to 2 (Luxe/Bold) — 99.35% of authored pack-bearing template content and every low-confidence `resolveStorefrontPack` fallback already resolved to Luxe/Bold only; Playful/Utility were 3 outlier files nobody had kept in sync. `resolveStorefrontPack` now maps only `bold-dtc` → bold, every other aesthetic id → luxe. Recorded in `docs/design-system/module-design-system.md` §10

## [2026-08-25] — WS-E: Publish integrity

Activations, unpublish, rollback, and a per-op publish ledger (commit `21a0a8c`, PR #15).

### Added
- Canonical `ACTIVATION_WIRED_FUNCTION_TYPES` gate seam covering every `functions.*` type
- `ActivationService` + `FunctionActivation` table — discount, delivery-customization, payment-customization, checkout-validation, fulfillment-constraint, and cart-transform activations wired end to end; each corresponding function type un-gated from `needs_runtime` as its activation landed
- `UnpublishService` inverting publish (refs, metaobjects, activations, web pixel) + a merchant Unpublish button; delete now unpublishes from Shopify first on all three delete routes
- `RollbackService` — rollback recompiles and republishes; the DB only flips on success
- Per-op publish ledger + `PublishPartialFailureError` with republish guidance
- Post-publish app-embed check + a theme-editor activation deep link

### Changed
- Deleted the progressive-publish theater (fake canary + DB-only auto-rollback), replaced by the real `RollbackService`
- `docs/publishing.md` rewritten to reflect the ledger/activation/unpublish/rollback/embed reality

### Fixed
- Plan-aware cartTransform activation extracted, with double-activation dedup on blueprints
- Internal-ops publish intent now runs the real publish pipeline before the DB transition
- Shared-activation guards + singleton-per-functionKey + unpublish symmetry (final-review pass)

Also on this date: `c201150` — post-merge lint cleanup restoring warning-cap headroom after the WS-E merge.

## [2026-08-24] — WS-D: Shopify conformance + App Pricing billing

Commit `008deb3` (PR #14).

### Added
- Per-shop `frame-ancestors` CSP emission in `entry.server.tsx` [Conf-1]
- Token-exchange embedded auth + auth redirect fallback [Conf-2]
- App Pricing plan-state sync — Partner API `activeSubscription` + handle map [Conf-4]
- Welcome-link callback + cron plan reconcile, since App Pricing has no webhooks [Conf-5]

### Changed
- `app-bridge.js` now loads in `<head>` before `polaris.js`; dropped the `AppProvider` body injection [Conf-3]
- Shopify Admin API bumped 2026-04 → 2026-07 (app, webhooks, extensions); Customer Account API bumped 2026-04 → 2026-07

### Removed
- `appSubscriptionCreate` in-app charge flow removed entirely; `/billing` is now read-only with a Shopify-hosted manage-plan link (D3)

### Fixed
- `/internal` CSP guard uses the matched-route id instead of a case-sensitive path parse [Conf-1]
- Quota resolution honors subscription status — non-`ACTIVE` now resolves to `FREE` [Deploy-4]
- Embedded params preserved through the welcome callback; internal admin reads the billing plan from the subscription (final-review fixes)

Also on this date: `fa48bae` — `deriveEffectivePlan` moved to a client-safe plan-status module (build fix following this merge).

## [2026-08-24] — WS-A: Railway hosting

Postgres cutover, `/healthz`, production image, provisioning (tasks 1–9). Commit `1b2b5e2` (PR #12).

### Added
- Flipped the Prisma datasource to Postgres with a regenerated baseline migration, plus a local dev Postgres/Redis stack
- Idempotent, DMMF-driven SQLite→Postgres data-copy script
- `/healthz` resource route checking Postgres + Redis, with a production timeout safety fix for Railway
- Production Dockerfile (multi-stage pnpm) + start script for `apps/web`
- Worker service skeleton — Redis-connected, health-served entrypoint
- Railway config-as-code for the web + worker services
- Split Shopify app config: production config now linked to the stable Railway domain (no auto-URL rewriting), local dev keeps the CLI's auto-updating tunnel config

### Fixed
- Resolved a `Module`↔`ModuleVersion` foreign-key cycle via nullable-edge deferral

### Changed
- CI adapts `DATABASE_URL` and Postgres service containers to the `postgresql` provider

Also on this date: `9916227` — triggered Railway's first deploy via a repaired GitHub integration.

## [2026-08-24] — WS-QF: Quick fixes

Security, billing honesty, quota enforcement. Commit `cb54a9b` (PR #11).

### Fixed
- Internal SSO callback now enforces the `INTERNAL_SSO_ALLOWED_EMAILS` allowlist
- Per-IP rate limit + failed-attempt audit added to internal login
- `getClientIp` uses the rightmost XFF entry and prefers `cf-connecting-ip`
- Activation-unwired function types gated `needs_runtime` (D6 step 1 — precursor to WS-E's activation work)
- Pending module deletes commit on unmount instead of silently cancelling
- AI stream failures now fail honestly (`jobs.fail` + an error frame) with single billing per request; the stream-drop double-bill window closed via `correlationId` dedupe; failed legacy attempts zero-billed
- Module cap enforced at publish, agent create, and duplicate
- Activity log filters combine `action` + `excludeActions` instead of one clobbering the other

## [2026-08-24] — WS-B: Quality gates + CI on master

Commit `c6cd399` (PR #10).

### Added
- CI now runs on `master` push/PR; added the wasm-function-extension and TAE Liquid-budget jobs; workspace package dists now build everywhere they're needed
- `apps/web` production Dockerfile + a master-push image-build workflow (the hook point WS-A's deploy later used)
- Nightly eval flywheel now builds its own dependencies and fails loudly instead of silently skipping on a missing report

### Fixed
- Theme-check gate: NSEC-VHERO overlay opacity values corrected to multiples of 0.1 (Shopify's section-setting schema requirement)
- wasm function-extension suites given a realistic build budget; `test:packages`/`test:functions` split so CI can give the wasm suites their own Rust/CLI toolchain job
- Golden wasm fixtures corrected for `shopify_function`'s omit-not-null serialization; `Cargo.lock` pinned and tracked across all six wasm extensions to close a serialization-drift blind spot
- Pre-commit typecheck hook actually gates now (a silent `|| true` was removed)
- Several internal-admin accessibility/hydration fixes: accessible names/headings/button semantics, relative-time hydration mismatches app-wide, dev-server HMR no longer targets a placeholder tunnel host

---

This file is updated by each WS as it lands (see [`docs/superpowers/plans/2026-08-24-launch-program.md`](./docs/superpowers/plans/2026-08-24-launch-program.md) dependency notes), not retroactively regenerated — WS-J only seeds the backlog as of its own execution date (2026-08-27).
