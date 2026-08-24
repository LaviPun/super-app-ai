# Launch Program — Master Plan

> **For agentic workers:** This is the PROGRAM roadmap. Each workstream (WS-A … WS-K) gets its own detailed implementation plan in this directory (`2026-08-24-ws-*.md`), written per the superpowers:writing-plans format and executed via superpowers:subagent-driven-development. Do not execute from this file alone.

**Goal:** Take ai-shopify-superapp from "runs off a dev tunnel on a laptop" to a Shopify App Store submission where every advertised capability works end-to-end, failures are visible, and prompt→module success is measured and ≥ target.

**Spec:** The nine-domain audit of 2026-08-24 at `master@6af6df2` (published artifact "SuperApp Launch Audit"; full agent reports in session transcripts). Findings referenced below as [Infra-N], [AI-N], [Deploy-N], [UI-N], [Ops-N], [Tmpl-N], [Conf-N], [Dead-N], [Docs-N].

## Decisions of record (owner-approved 2026-08-24)

| # | Decision |
|---|----------|
| D1 | **Hosting: Railway.** Containerize `apps/web` + a worker service; managed Postgres + Redis; GitHub auto-deploys; stable domain. Chosen for price sensitivity + existing in-repo Railway/Docker patterns. |
| D2 | **V2 platform is retired.** `apps/api`, `apps/workers`, `apps/frontend`, `vault/`, v2 CI workflows: delete. Salvage only the BullMQ patterns/contracts that WS-C needs (port into `apps/web` or a small `packages/` module before deletion). |
| D3 | **Billing: migrate to Shopify App Pricing** (Shopify default). Hand-rolled Billing API flow is removed; local plan state syncs from Shopify. |
| D4 | **Maya is disclosed as AI.** All support copy tells one honest story ("instant AI answer, humans on escalation"). |
| D5 | **Production LLM is cloud-API only.** Triage + internal assistant default to cheap cloud models (Haiku-class primary, mini-class fallback) through the existing provider chain; Ollama remains a dev-only toggle. No local-model dependency in production. |
| D6 | **Function module types are gated `needs_runtime` immediately** (honest), then wired with real activation objects (WS-E) before submission — both steps ship. |
| D7 | **Orphan pages — archaeology complete (2026-08-24), verdicts final:** most orphaning happened 2026-06-16 (`b2ffec3` nav redesign + `d182fdc` dashboard redesign dropped the links). **WIRE:** `/jobs` (only merchant-scoped per-job view — add to `INSIGHTS_TABS`/`INSIGHTS_PATHS` in `merchant/polaris.tsx` + palette entry); `/flows/templates` (the `d182fdc` redirect to `/templates?type=Flow` was a functional regression — that lists module templates, not `WORKFLOW_TEMPLATES`; workflow installs are currently unreachable. Short-term: repoint `flows._index.tsx:284` back; follow-up: merge WORKFLOW_TEMPLATES into `/templates` FLOW bucket then delete the page); `modules/:id/captures` (restore the module-detail link `d182fdc` deleted, with count badge — captures without a storeKey are visible nowhere else). **DELETE:** `/picker` (stub wizard superseded by `/generate`), `/advanced` (two buttons to first-class tabs), `/api-usage` (born an orphan; reads a table whose writer `recordAdminThrottle` has zero callers — renders an empty state forever), `/logs` (duplicates `/activity`+`/billing`+wired `/jobs`; optionally move its 7-day success MiniBars into `/analytics` first), `api.module-captures.tsx` (zero callers; `proxy.capture.tsx` is the live path — also fix the two docs citing it as live). Deletions must update the tests that hardcode these routes: `e2e/merchant/auth-guards.spec.ts`, `app/__tests__/merchant-auth-guards.test.ts`, `e2e/internal/crawl-auth.spec.ts`. |
| D8 | **Launch = App Store submission.** No silent failures anywhere; conformance items are hard gates. |
| D9 | **Execution go (2026-08-24): Phase 0 approved and running. WS-A hold RELEASED same day** — owner started the Railway Hobby plan. WS-A executes after Phase 0 merges (its tasks build on files WS-QF edits). Owner-side prerequisites for Task 7, done by the owner directly (account-level auth): `railway login` in their terminal + GitHub connect in the Railway dashboard. No SSH keys anywhere in this flow — Railway deploys via GitHub/CLI. |
| D10 | **Pricing economics — owner-approved model (2026-08-24):** 4 tiers + Shopify usage-based overage ("AI charges" approved). Quotas sized against CURRENT unit cost (~$0.35/gen) so no tier is ever underwater; raise quotas later as WS-C optimizations land (raising is a gift, lowering is a scandal). Proposed numbers for WS-D Task 8 (final check against measured cost at config time): Free $0 / 10 gens / 3 modules; Starter $19 / 25 gens / 20 modules; Growth $79 / 110 gens / 100 modules; Pro $299 / 425 gens / 1,000 modules; overage $5 per 10 additional generations via Shopify usage charges with merchant-set cap. Full-quota AI cost ≤ ~50% of plan price at every tier. All-in non-AI infra (hosting incl. webhooks/flows/DB processing, monitoring, email) budgeted ~$25/mo launch → ~$250/mo at 1,000 merchants; Shopify API calls are free. Per-merchant margin view + negative-margin alert in WS-G; caching/Haiku-routing/cheaper-primary in WS-C. |

## Global constraints

- Shopify Admin API target: **2026-07** (all current ops already validate on it).
- TAE Liquid aggregate budget: **100,000 bytes enforced**; program target ≤ 95,000.
- Merchant UI: Polaris web components only; internal admin keeps vendored system; DESIGN.md governs app shells.
- Route handler budget stays ≤ 60s only until WS-C moves generation async; after that, long work runs on the worker, never in a request.
- Every workstream plan follows TDD, bite-sized tasks, frequent commits; CI (once WS-B lands) must be green at every merge.
- No numeric claims in prose docs; counts come from code/test output (WS-J rule).

## Workstreams

### Phase 0 — Stop the bleeding (do first, ~independent)
- **WS-B Gates & CI** — CI triggers to `master`; fix 3 red tests (theme-check gate templates, catalog snapshot, control-packs prune) + lint over-cap; remove pre-commit `|| true`; wire `build-theme-liquid.mjs --check` into CI; fix the nightly eval workflow (`tee` masks crash → no report); add deploy workflow stub. [Infra-3, Docs-1..3, Deploy-9] — ✅ landed c6cd399bf60b333c4d8b6897523a8bd34c597601
- **WS-QF Quick fixes (small, high-severity)** — SSO allowlist [Ops-2]; internal login rate-limit [Ops-7]; `needs_runtime` gate for unwired function types (D6 step 1) [Deploy-1]; pending-delete commit-on-unmount [prior code review]; stream route `jobs.fail` on 0 options + no double-bill [AI-2]; quota enforcement at create+publish [Deploy-5].

### Phase 1 — Ground truth infrastructure
- **WS-A Hosting & data (D1)** — Dockerfile for `apps/web`; Railway project (web + worker + Postgres + Redis + cron); execute the existing Postgres runbook (schema provider swap, data migration, backups on); secrets/env registry (validated flags [Infra-15]); stable `application_url`; Sentry DSN + uptime check + `/api/cron` scheduler with dead-man's switch [Ops-4]; encrypt `Shop.accessToken` at rest. Exit: tunnel retired, laptop irrelevant.

### Phase 2 — Shopify truth
- **WS-D Conformance & billing (D3, D8)** — `entry.server.tsx` with `addDocumentResponseHeaders` (CSP) [Conf-1]; token-exchange auth flag + verified clean install [Conf-2]; App Bridge script → `<head>` [Conf-3]; App Pricing migration incl. removing `appSubscriptionCreate` flow + plan-state sync + quota-by-status [Conf-4, Deploy-4]; scope re-consent rollout; API bump to 2026-07; `shopify-app-remix` upgrade 3→5.
- **WS-E Publish integrity (D6 step 2)** — activation objects per function type (`discountAutomaticAppCreate`, `deliveryCustomizationCreate`, `paymentCustomizationCreate`, `validationCreate`, `fulfillmentConstraintRuleCreate`) with idempotent create/update/delete; unpublish path + delete cleanup (metaobject + refs removal) [Deploy-3]; real rollback (recompile+republish old spec) or remove the affordance [Deploy-6]; publish compensation/republish guidance on partial failure [Deploy-7]; embed-activation onboarding (deep link + status check) [Deploy-8]; deployed-manifest ↔ `extension_directories` consistency check; decide bundles: `BLUEPRINTS_ENABLED` on with its co-deploy path, or `BundleProductService` wired into single publish [Deploy-2]; **live-store end-to-end probe** (publish → storefront render → checkout function fires → handle-casing verified) [Deploy-11].

### Phase 3 — Reliability (the 99.9% engine)
- **WS-C Async generation & measurement** — generation/hydrate/publish jobs on BullMQ worker (replace inline execution; port patterns from V2 before D2 deletion); options persisted server-side as they validate; client polls/reconnects (dropped connection = re-fetch, not re-spend) [AI-3, AI-4, UI-1]; end-to-end deadline budget passed via hints; funnel metric per merchant request (classified→optioned→hydrated→published, correlationId) + success-rate dashboard [AI-1]; hydrate hardening (structured output, truncation detection, fence-strip) [AI-imp]; provider concurrency caps + retry-after + staggered option calls [AI-imp]; QA telemetry aggregated, top render-fails promoted to blocking; friendly terminal errors (AppError→toResponse everywhere).
- **WS-G Ops automation (D5)** — alert channel that fires (Sentry on `withApiLog` failures/`jobs.fail`/webhook failures/triage failures + email/Slack thresholds) [Ops-3]; DLQ replay backed by the real worker [Ops-1]; stuck-RUNNING sweep + max-attempts policy; windowed health badges; merchant-reply alerts + badge; triage async + cloud-default with failover (D5); webhook fan-out → claim+enqueue+ACK [Infra-7]; `shop/redact` completeness [Infra-11].

- **WS-INT Integrations Hub (owner-requested 2026-08-24)** — a marketplace-style tile grid in the INTERNAL admin (owner-level; merchants keep their Connectors page): every external integration as a logo tile (simple-icons SVG, inlined) with status, credential entry, and per-tile Test-connection. Category 1, AI providers: Anthropic/Claude, OpenAI/GPT, Google Gemini, xAI Grok, DeepSeek, Mistral + a generic OpenAI-compatible-endpoint tile — extends the existing AiProvider catalog + internal.ai-providers machinery (already the sole writer; fallback + cost routing already multi-provider). Category 2, ops services: Sentry, UptimeRobot, Healthchecks.io (cron dead-man), email (SMTP/Resend/Postmark), Slack alert webhook. Secrets stored encrypted at rest via the existing crypto.server.ts, masked in UI; precedence = DB(UI) over env var, env as fallback; every save audited via ActivityLog. Sequenced WITH WS-G (the hub is the config surface for WS-G's alerting wires — build together so no dead tiles). Open item: merchant-facing BYO-AI-key is explicitly OUT of scope (quota-economics implications) unless the owner asks. |

### Phase 4 — Product quality
- **WS-F Merchant UI** — generate-flow server-persisted drafts (rides WS-C jobs) [UI-1]; type-aware controls from recipe schema (mount SchemaForm; kill hard-coded buy-bar writes) [UI-2]; wire "Generate full settings" end-to-end or remove [UI-3]; fix broken CTAs (template detail, dashboard quick action, workflow install) [UI-4]; Maya disclosure copy (D4) [UI-5]; real progress bound to stream stages + AbortController; publish ceremony (theme pick + confirm + view-on-storefront); error boundary + Polaris shell for `/generate` (kills the legacy branch + 628 LOC CSS [Dead]); mobile pass (`s-grid` queries, 375px); captures wired into module detail (D7); remove AI-cost leakage from merchant pages; preview endpoint auth.
- **WS-H Templates** — reclaim Liquid headroom to ≤95KB (move presentation to CSS/JS assets) [Tmpl-1]; `ensureStoreAesthetic`+palette on template installs; strip/remap 48 hardcoded demo palettes [Tmpl-2]; placeholder-media fix (real store assets at install, else honest placeholder in Liquid) [Tmpl-3]; pack decision: collapse to honest 2-pack or invest in playful/utility; tier-tag library + dedupe the 121 copy-variants; output-level preview⇄Liquid parity fixture per kind.

### Phase 5 — Consolidation
- **WS-I Cleanup (D2, D7)** — delete V2 apps + workflows + `vault/` + gitbook-integration + stale worktree + `.venv-modal` + `get_started.py`; remove ~170 dead exports, 3 dead server files, orphan scripts, 4 unused deps, 3 dead packages; dedupe helpers (`timeAgo`→`relative-time`, `NON_MERCHANT_ACTIONS`, tone maps); orphan pages per archaeology report + D7.
- **WS-J Documentation rewrite** — the ~12-doc structure (README, architecture, generation, ai-providers, publishing, flows, operations, internal-admin, data-models, testing, debug ledger, CHANGELOG); kill/archive list per docs audit; **no counts in prose**; dated re-runnable doc audits (design-system pattern); MEMORY sync.

### Phase 6 — Submission
- **WS-S Submission gate** — App Store requirements checklist run (CSP, install, App Pricing live, GDPR incl. redact completeness, honest AI disclosure, listing assets); the live-store probe green; 7-day burn-in on Railway with alerting quiet; submit.

## Dependency edges
WS-B before everything (green gates). WS-A before WS-C/WS-G (Redis/worker/Postgres) and before WS-D install verification (stable URL). WS-QF anytime. WS-C before WS-F draft-persistence tasks. WS-E salvage-before-delete ordering with WS-I (D2). WS-J last-but-continuous (each WS updates its own doc as it lands).

Cross-review 2026-08-24 applied (B1–B9, C1–C3): WS-A owns apps/web/Dockerfile; WS-D/WS-E operate on the post-split shopify.app.production.toml/shopify.app.dev.toml; WS-QF may run parallel to WS-B (final gate after WS-B merges); WS-E Tasks 1–2 may run parallel to WS-D Tasks 4–8.

## Tracking
Each WS plan lives at `docs/superpowers/plans/2026-08-24-ws-<letter>-<name>.md` with checkbox tasks. This file's phase list is the single source of program status; update checkmarks here as WS plans complete.
