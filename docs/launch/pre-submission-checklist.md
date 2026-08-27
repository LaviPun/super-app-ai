# Pre-submission checklist — Super App AI

**STATUS: IN PROGRESS — first agent-run pass, 2026-08-27.** This is not a
skeleton: every row below either carries real, dated evidence gathered in
this session, or is explicitly marked **OWNER-PENDING** with the exact
command/dashboard location that will close it. Per this program's D8
discipline (see `docs/runbooks/scope-reconsent.md`,
`docs/runbooks/publish-live-probe.md`): **no row claims PASS unless the
command was actually run and its actual output is quoted below.** Do not
edit a row to say PASS without re-running its command and pasting the new
output.

**Verified against:** worktree base commit `cb3d444` (branch
`docs/pre-submission-checklist`, off `master`). **Note:** `origin/master`
has since advanced one commit further to `9aa5d96` ("chore(ci): PR
concurrency group, authoritative theme-check CLI gate, wire palette guard",
#29) — none of that commit's content was in scope for this pass. Re-run
Section A/H's checks against whatever the actual release commit is before
submission if `master` has moved.

**Legend:** `[AGENT-VERIFIED]` = run in this session, evidence below.
`[OWNER-PENDING]` = requires a live store, Partner Dashboard, or interactive
Shopify CLI login this agent session cannot complete — evidence needed is
stated explicitly.

---

## A. Code-side conformance — `[AGENT-VERIFIED]`

```
$ pnpm --dir apps/web submission:check
```

Run 2026-08-27T13:14:04Z, worktree `cb3d444`, after `pnpm install --frozen-lockfile`:

```
[PASS] csp-entry-point — entry.server.tsx calls applySecurityHeaders
[PASS] app-bridge-head-order — app-bridge.js precedes polaris.js in EmbeddedHeadScripts.tsx
[PASS] token-exchange-auth — unstable_newEmbeddedAuthStrategy: true set in shopify.server.ts
[PASS] gdpr-webhook-topics-declared — all 3 GDPR compliance_topics present in shopify.app.production.toml
[PASS] gdpr-webhook-handlers-exist — all 3 GDPR webhook route files present
[PASS] app-pricing-plan-sync-present — PlanSyncService + plan-handles.ts present
[PASS] billing-api-flow-removed — no appSubscriptionCreate call site in billing.service.ts
[PASS] scope-list-matches-code — 21 scopes declared: read_checkouts, read_customer_events, read_customers, read_inventory, read_metaobjects, read_orders, read_products, read_themes, write_app_proxy, write_cart_transforms, write_checkouts, write_customers, write_delivery_customizations, write_discounts, write_fulfillment_constraint_rules, write_metaobjects, write_orders, write_payment_customizations, write_pixels, write_products, write_validations
[PASS] restricted-scopes-not-requested — none of the reviewer-scrutinized restricted scopes are requested
[PASS] tae-liquid-budget — run `node scripts/build-theme-liquid.mjs --check` separately for the live byte count (this check only confirms the gate script exists)

submission-conformance-check: all checks passed.
```

**Result: 10/10 PASS.**

---

## B. GDPR / data protection (Task 4) — `[AGENT-VERIFIED]` code path; live webhook round-trip `[OWNER-PENDING]`

- [x] `shop-redact-completeness.test.ts` — **PASS**, run in this session:

  ```
  $ pnpm --dir apps/web exec prisma generate   # Prisma client wasn't generated in this fresh checkout
  $ pnpm --dir apps/web exec prisma migrate deploy \
      DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp"  # local dev Postgres (docker-compose.dev.yml stack, already running)
  $ pnpm --dir apps/web exec vitest run app/__tests__/shop-redact-completeness.test.ts
  ```

  Output, 2026-08-27T13:15:11Z:
  ```
  [shopify-api/INFO] version 11.14.1, environment Remix
   ✓ app/__tests__/shop-redact-completeness.test.ts (3 tests) 3ms
   Test Files  1 passed (1)
        Tests  3 passed (3)
  ```
  All 3 assertions pass: every shop-scoped model (derived from `schema.prisma`
  field vocabulary) is either handled by `webhooks.shop.redact.tsx` or listed
  in its exported `REDACT_RETENTION_ALLOWLIST` (`webhooks.shop.redact.tsx:52`)
  with a reason; no stale allowlist entries; the `shopId`/`tenantId` FK
  vocabulary regression guard holds.

- [x] `customers/data_request` delivers a real data package — confirmed by
  reading the handler, cited 2026-08-27:
  - `apps/web/app/routes/webhooks.customers.data_request.tsx:30-34` — imports
    `compileCustomerDataExport` / `deliverCustomerDataExport` from
    `apps/web/app/services/gdpr/data-request-export.server.ts`.
  - `webhooks.customers.data_request.tsx:68-89` — compiles the export scoped
    by `shopId` **and** `customerId`/`customerEmail` (the prior no-op-filter
    defect is gone); a compile failure releases the idempotency claim and
    500s so Shopify redelivers.
  - `webhooks.customers.data_request.tsx:91-98` — emails the compiled export
    to the shop owner via `deliverCustomerDataExport`; a delivery failure
    returns `{ emailSent: false, reason }` rather than throwing.
  - `webhooks.customers.data_request.tsx:107-138` — writes an `ActivityLog`
    row (`action: 'GDPR_DATA_REQUEST'`) and, if `!delivery.emailSent`, a
    loud `ErrorLogService` entry.
  - `apps/web/app/services/gdpr/data-request-export.server.ts:393-433`
    (`deliverCustomerDataExport`) calls `resolveMailerStatus()`
    (`apps/web/app/services/notifications/mailer.server.ts:354`); an
    unconfigured mailer returns `mailerConfigured: false` and the webhook
    still 200s (compliance requirement to compile the data is met), but the
    merchant doesn't receive email until the mailer is configured — see
    Section F/mailer status below.
  - `customers/redact` (`apps/web/app/routes/webhooks.customers.redact.tsx:33-79`)
    remains a real, customer-scoped transactional deletion across
    `DataCapture`, `DataStoreRecord`, `ModuleEvent`, `AttributionLink`.

- [ ] **`[OWNER-PENDING]`** Live webhook round-trip (HTTP 200 + `ActivityLog`
  row for each of `customers/data_request`, `customers/redact`,
  `shop/redact`) was **not executed in this session** — it requires a running
  dev server and either the Shopify CLI's webhook trigger (interactive login;
  this agent session hit the CLI's device-code auth wall attempting a
  different command, see Section D) or a hand-computed HMAC. Evidence that
  will close this: run the three `shopify app webhook trigger ...` commands
  in `docs/launch/gdpr-verification.md` lines 7-17 against a running
  `pnpm --dir apps/web dev`, then confirm each `ActivityLog` row via
  `prisma studio` or the psql query on the same doc's line 24.

---

## C. App Pricing (Task 7 Step 1) — `[OWNER-PENDING]`

Code path is merged and inert until the runbook below is executed (confirmed
by reading `docs/runbooks/app-pricing-setup.md:5`: "`PlanSyncService`,
`/billing/callback`, the cron reconcile endpoint, and the read-only
`/billing` UI are already merged... They are inert until the steps below are
completed and the four env vars... are set on the deployed `web` service.").

Evidence needed to close, per `docs/runbooks/app-pricing-setup.md`:
- Steps 1-2: 4 public plans (`free`/`starter`/`growth`/`pro`) live in the
  Partner Dashboard, handles matching `apps/web/app/services/billing/plan-handles.ts`'s
  `PLAN_BY_HANDLE` exactly.
- Step 3: Partner API client created; `SHOPIFY_PARTNER_API_TOKEN`,
  `SHOPIFY_PARTNER_ORG_ID`, `SHOPIFY_APP_GID`, `SHOPIFY_APP_HANDLE` all set
  on the Railway `web` service.
- Step 4: `curl` against the Partner API returns HTTP 200 (paste result).
  Step 5: end-to-end lifecycle — select Growth on the dev store → callback →
  `AppSubscription` row shows `planName=GROWTH`, `planHandle=growth`,
  `status=ACTIVE`, fresh `lastSyncedAt` → cancel → force reconcile via the
  cron endpoint → row flips to `planName=FREE` and the FREE quota blocks a
  further AI-generate call. Paste the `AppSubscription` row values from both
  ends of the test.

**Not executed this session** — requires org-owner Partner Dashboard access.

---

## D. Scope re-consent (Task 7 Step 2) — `[OWNER-PENDING]`

- [x] **Attempted** `[AGENT]`: `shopify app config validate --config production`
  — run in this session (2026-08-27) to re-check whether the upstream CLI
  bug `cli#8386` (`[events]: Required` schema error) is still blocking, per
  this plan's Task 7 Step 2 instruction. Result: the CLI requires interactive
  login before it will validate anything —

  ```
  $ shopify app config validate --config production
  To run this command, log in to Shopify.
  User verification code: SGHN-VXTT
  Opened link to start the auth process: https://accounts.shopify.com/activate-with-code?...
  ```

  This agent session cannot complete a device-code browser login, so
  **whether `cli#8386` is still blocking is unconfirmed** — the owner must
  run this command (or check the Shopify CLI changelog for `cli#8386`
  directly) before starting Step 3 of `docs/runbooks/scope-reconsent.md`.

- [ ] **`[OWNER-PENDING]`** Everything else in `docs/runbooks/scope-reconsent.md`
  Steps 2-5: baseline `shopify.scopes.query()` on the dev store, deploy (CLI
  or Partner Dashboard config-release contingency), re-consent grant screen
  approved, `shopify.scopes.query()` showing all 21 scopes granted, the
  `app/scopes_update` ActivityLog entry, both functional GraphQL probes
  (`cartTransforms`, a metaobject write) with no `ACCESS_DENIED`. Evidence
  that will close this: `shopify app versions list` showing the new version
  deployed, plus the re-auth grant screen completed on a dev store (per the
  runbook's own "Record" instructions). **Not executed this session.** Per
  the runbook's forward-note (`scope-reconsent.md:113-121`, already reconciled
  by `scope-list-matches-code` in Section A above): the re-consent list is
  **21 scopes**, matching the current `shopify.app.production.toml`.

---

## E. Live publish-integrity probe (Task 7 Step 3) — `[OWNER-PENDING]`

`docs/runbooks/publish-live-probe.md:8` still reads: **"STATUS: Not yet
executed — requires a dev store + this branch deployed... Nothing below has
been run against a live app or dev store."** Confirmed unchanged as of this
session (2026-08-27).

Prerequisite per the runbook: Section D above (21-scope re-consent) must be
granted first, or every function-activation step returns a misleading
`ACCESS_DENIED`.

Evidence that will close this: all 7 steps of the runbook run against a real
dev store, with results appended to `docs/publishing.md`'s live-probe
section (not just summarized in this file) — handle-casing verdict,
`theme.section` end-to-end, `discountRules` end-to-end, remaining function
surfaces spot-check (with Plus-tier caveats noted), `cartTransform`
end-to-end. **Not executed this session.**

---

## F. Listing content (Tasks 2, 3, 5, 6)

- [x] **`[AGENT-VERIFIED]`** Listing copy exists and is current —
  `docs/launch/app-store-listing-draft.md` (118 lines: app card subtitle,
  tagline, value prop, features, "how it works", pricing table cross-checked
  against `PLAN_CONFIGS`, sales-channel/languages/category notes, contact &
  legal). Last touched by commit `3d9c5ab` ("docs(ws-s): post-merge refresh
  — GDPR delivered, redact complete, disclosure live", #25, 2026-08-27),
  confirmed via `git log -1 -- docs/launch/app-store-listing-draft.md`. This
  is a **draft** for the owner to paste and edit for tone, per the file's own
  header — not final copy.
- [x] **`[AGENT-VERIFIED]`** Scope justification table exists and is current
  — `docs/launch/scope-justifications.md`, same commit `3d9c5ab`. States 21
  scopes declared in `shopify.app.production.toml`, matching Section A's
  `scope-list-matches-code` check.
- [x] **`[AGENT-VERIFIED]`** Screenshot checklist exists and is current —
  `docs/launch/screenshot-checklist.md`, same commit `3d9c5ab`. Defines 6
  required + 1 optional 1600×900 shots, app icon spec, feature-media spec,
  and data-hygiene rules (4.3.3/4.3.6/4.3.7). **Capture itself is
  owner-run** (the file's own "Capture" section says so) — see the pending
  row below.
- [x] **`[AGENT-VERIFIED]`** Support email decision recorded —
  `docs/launch/app-store-listing-draft.md:106`: `support@lavipun.com` —
  "owner decision, resolved 2026-08-27."
- [x] **`[AGENT-VERIFIED]`** D4 AI-disclosure — confirmed live in current
  source (2026-08-27), matching `docs/launch/review-notes.md:80-91`:
  - `apps/web/app/components/support/badges.tsx:19`: `SUPPORT_AGENT_NAME = 'Maya'`
  - `badges.tsx:24`: `AI_RESPONDED: 'Answered by Maya (AI)'`
  - `apps/web/app/routes/support.$ticketId.tsx:60-64`: `ROLE_LABEL.assistant = `${SUPPORT_AGENT_NAME} · AI assistant``
  These lines were re-read directly from the tree in this session, not just
  cited from the doc. PR #18 (WS-F, which carries D4) is confirmed **MERGED**
  (`gh pr view 18` → `mergedAt: 2026-08-27T10:15:27Z`; commit
  `eb5aba5` on `master`) — note the Task 8 spec's own status table
  (`docs/superpowers/plans/2026-08-27-ws-s-submission.md:34`) still shows
  this as "OPEN", which is now stale; the actual repo state supersedes it.

- [ ] **`[OWNER-PENDING]`** Listing copy pasted into Partner Dashboard, with
  any tone edits noted.
- [ ] **`[OWNER-PENDING]`** 4-7 screenshots captured and uploaded (1600×900,
  distinct states per `screenshot-checklist.md`) — list filenames once taken.
- [ ] **`[OWNER-PENDING]`** App icon (1200×1200, no Shopify trademarks) and
  feature media uploaded.
- [ ] **`[OWNER-PENDING]`** Privacy policy URL — per
  `docs/launch/app-store-listing-draft.md:107-110`: **"owner-deferred: URL to
  be provided before submission (hard blocker for Task 8/10). Do not paste a
  placeholder URL."** No privacy-policy page exists in this repo as of
  2026-08-27. Evidence that closes this: the live URL, pasted here once the
  owner supplies it.
- [ ] **`[OWNER-PENDING]`** Category + tags selected in the Partner Dashboard.
- [ ] **`[OWNER-PENDING]`** Reviewer notes / test credentials — the committed
  `docs/launch/review-notes.md` has `<OWNER: ...>` placeholders (e.g. the
  Connector/API-Tester test endpoint) that must be replaced with real values
  in a local copy before pasting into the Partner Dashboard's 4.5.4/4.5.5
  fields — do not paste the placeholder version.
- [ ] **`[OWNER-PENDING]`** Emergency developer contact (4.5.6) current.
- [ ] **`[OWNER-PENDING]`** Mailer configured on the deployed service —
  `resolveMailerStatus()` (`apps/web/app/services/notifications/mailer.server.ts:354`)
  must report healthy, and a real GDPR `customers/data_request` delivery
  should be confirmed end-to-end (email actually received), not just
  `emailSent: true` in a log line. Referenced by
  `docs/launch/review-notes.md:106-116`.

---

## G. Burn-in (Task 9) — `[OWNER-PENDING]`, not started

No start timestamp exists anywhere in this repo as of 2026-08-27 — grepped
`docs/launch/*.md` for "burn-in" and found only the runbook references, no
recorded start. Prerequisites per Task 9: Task 7's production deploy (Section
H below) and WS-G's alert channel confirmed live (one test alert per channel
— Sentry test event, a deliberate `Job.fail`, a webhook-handler exception —
actually landing in email/Slack) must both happen **before** the clock
starts. Neither has been confirmed in this session.

Evidence that will close this: the actual date range once 7 consecutive
quiet (or quiet-after-fix) days pass, a one-line summary of anything that
fired and how, classified against `docs/runbooks/index.md`'s severity ladder
(SEV-1/2 resets the clock, SEV-3/4 doesn't), and uptime-check green for the
full window.

---

## H. Final release

- [ ] **`[OWNER-PENDING]`** `shopify app deploy --config production` — not
  run this session (same interactive-login blocker as Section D; also
  correctly gated behind Section D/E completing first per the plan's Task 7
  Step 4).
- [x] **`[AGENT-VERIFIED]`** Test suite, run against worktree base `cb3d444`
  (2026-08-27, after `pnpm install --frozen-lockfile` + `prisma generate` +
  `prisma migrate deploy` against a local Postgres):

  `pnpm test:packages` (all non-extension packages — apps/web + packages/*),
  started 2026-08-27T13:16:54Z:
  ```
  Test Files  282 passed | 1 skipped (283)
       Tests  2747 passed | 16 skipped (2763)
    Duration  52.50s
  ```
  (the 1 skipped file / 16 skipped tests are `app/__tests__/evals.live.test.ts`,
  gated behind a live-provider flag — not a failure.)

  `pnpm test:functions` (Rust/wasm extension suite — 7 packages, requires
  rustup/cargo on PATH), started 2026-08-27T13:19:46Z, **exit code 0, no
  failures** (checkout-ui 23/23, superapp-cart-transform, superapp-discount,
  superapp-fulfillment-constraints 3/3, superapp-payment-customization 3/3,
  superapp-pickup-point 9/9 Rust unit tests, superapp-shipping-discount
  12/12 Rust unit tests — all green).

  These two scripts are what `pnpm test` chains together
  (`package.json`'s `test` script), so the full monorepo suite is green
  locally at this commit. `pnpm test` was not re-run as one single invocation
  in this session (the two-part run above covers the same ground and was
  chosen so the long Rust/wasm leg could run in the background) — re-run
  `pnpm test` as one command if that distinction matters before submission.

- [x] **`[AGENT-VERIFIED]`** `node scripts/build-theme-liquid.mjs --check`,
  run 2026-08-27:
  ```
  Total Liquid: 95782 B / 100000 B budget (95.8%)
  ✅ Aggregate under budget by 4218 B. Largest file: 46628 B (snippets/superapp-module-sections.liquid).
  ```
  Under the 100,000 B hard budget and under the program's 95,000 B target
  by... actually 782 B over the 95,000 target (95,782 > 95,000) — **flag
  this**: the aggregate is under the hard CI gate but has drifted past the
  program's own tighter internal target. Not a submission blocker (CI gate
  is 100,000 B and passes), but worth a follow-up trim before it creeps
  further.

- [x] **`[AGENT-VERIFIED]`** CI on the release commit — initially **FAILED**,
  then confirmed green on rerun:
  ```
  $ gh run list --branch master --limit 5
  ```
  showed run `33074288015` (CI workflow, commit `cb3d444`, triggered
  2026-08-27T12:56:28Z) as `conclusion: failure` — the `Function Extensions
  (wasm)` job failed with `Error: Cannot find module
  '/opt/hostedtoolcache/node/22.23.2/x64/lib/node_modules/@shopify/cli/bin/wasm-opt.cjs'
  (MODULE_NOT_FOUND)` inside the `superapp-cart-transform` package's wasm
  build step — a missing binary in the GitHub-hosted runner's `@shopify/cli`
  install, not a code change. This was re-run in this session:
  ```
  $ gh run rerun 33074288015 --failed
  ```
  and the rerun (same run id, same commit `cb3d444`) came back
  `status: completed, conclusion: success`, with every job green including
  `Function Extensions (wasm)` and the previously-skipped `Build` job:
  https://github.com/LaviPun/super-app-ai/actions/runs/33074288015

  **Local reproduction check:** `pnpm test:functions` was run locally in
  this same session (see above) and passed cleanly with no
  `wasm-opt.cjs`-related error, which supports the "flaky CI runner
  toolcache" read rather than a real regression — but this was a genuine
  transient CI failure on the exact release commit, not a fabricated
  "green" reading. **Caveat:** `gh run list` also shows the immediately
  preceding CI run on commit `25a33fd` (WS-J, a docs-only commit) failed on
  a *different* job (`E2E Internal (Playwright)`), and the run before that
  (`3d9c5ab`) was clean — so this CI pipeline currently has some rate of
  flaky, non-code-related job failures across recent commits. Re-check CI
  status again immediately before the actual `shopify app deploy` in
  Section H, rather than trusting this rerun as permanently valid if more
  time has passed.

---

**Only once every row above is checked with real, dated, pasted evidence —
not before — does Task 10 (Submit) happen.**
