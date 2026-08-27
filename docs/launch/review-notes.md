# Reviewer notes — Super App AI

**Test store:** `<OWNER: paste the review dev-store URL here — do not commit a
real store handle to a public doc if the repo is or becomes public; keep this
file private / .gitignored if the repo's visibility requires it>`
**Test login:** `<OWNER: staff account credentials for the reviewer, created
fresh for this submission — never reuse a personal or production login>`
**Emergency developer contact:** `<OWNER: name + email, kept current per
requirement 4.5.6 — Shopify may need to reach a human fast>`

> **Refreshed 2026-08-27** — this walkthrough describes **master @ 8a656af**
> (this branch's base) as verified by reading the actual route code, not the
> aspirational plan. WS-C, WS-F, WS-G, and WS-H have all merged since the
> previous revision of this doc; every "Pending (unmerged PR)" note below has
> been re-checked against the merged code and either confirmed live or
> replaced with what's actually true today. The one remaining conditional
> behavior (step 2) is a runtime flag, not an unmerged PR.

## Walkthrough (matches the demo screencast, requirement 4.5.3)

1. **Install** — reviewer installs from the listing; managed installation +
   token exchange means no OAuth redirect loop
   (`unstable_newEmbeddedAuthStrategy: true`,
   `apps/web/app/shopify.server.ts:37`). Expect the app to load embedded
   immediately after the permission grant screen.
2. **Generate a module** — `/generate` (`apps/web/app/routes/generate._index.tsx`),
   describe "a banner announcing free shipping over $50" (or pick a
   template). Expect a draft with a preview. **WS-C (async engine, PR #19)
   is merged, but its enqueue-and-poll path is only active when the
   orchestrator's effective mode is `queue`** —
   `apps/web/app/services/jobs/enqueue.server.ts:17-19`
   (`isAsyncJobsEnabled()` returns `resolveEffectiveMode(...) === 'queue'`)
   gated by `JOB_EXECUTION_MODE`, which **defaults to `'inline'`**
   (`apps/web/app/env.server.ts:89`). Unless the deployed service has
   `JOB_EXECUTION_MODE=queue` set (Redis configured), the reviewer will see
   the same inline SSE/synchronous flow as before, with a route-handler
   budget of ≤60s. Confirm the actual deployed value before the demo —
   if it's `queue`, the reviewer instead sees the enqueue-and-poll UI
   (`generate._index.tsx:681-732`); if it's unset/`inline`, pick a simple
   prompt so generation finishes inside the 60s ceiling.
3. **Publish** — from the module detail page
   (`apps/web/app/routes/modules.$moduleId.tsx`), pick a theme from the
   **"Publish to theme"** dropdown and click **Publish**. **WS-F (PR #18,
   merchant UI) is merged and the publish ceremony is live**: a confirm
   dialog appears before the action runs
   (`modules.$moduleId.tsx:947-956`, `ConfirmModal` heading "Publish
   module?"/"Republish module?"), and on success a "Module published"
   banner (`modules.$moduleId.tsx:873-874`) is followed by a **"View
   storefront"** link/button for theme modules
   (`modules.$moduleId.tsx:881-888`, opens the shop's storefront domain in
   a new tab). Storefront must render the banner after the theme app embed
   is enabled — first publish of a theme module surfaces an embed-status
   nudge on the module detail page when the app block isn't added yet
   (`modules.$moduleId.tsx:427-430,748-752`, backed by
   `apps/web/app/services/publish/embed-status.server.ts`). Both the
   ceremony and the embed nudge are live on master today.
4. **Rollback** — from the module's version history, click **Roll back**
   next to a non-active version (`modules.$moduleId.tsx:1102`, wired to
   `POST /api/rollback` via `modules.$moduleId.tsx:761`). This is live on
   master. Confirm the storefront reverts.
5. **Unpublish** — confirm the storefront no longer renders the module; the
   module detail page has an explicit "Unpublish module?" confirm dialog
   (`modules.$moduleId.tsx:939`) and shows "Unpublished — removed from your
   storefront" on success (`modules.$moduleId.tsx:552`). Per
   `docs/publishing.md`, confirm the underlying
   metaobject/activation object is actually removed, not just hidden in the
   app's UI — cross-check against that doc's §3 (unpublish/delete
   semantics) if anything looks off.
6. **Billing** — `/billing` (`apps/web/app/routes/billing._index.tsx`) shows
   the current App Pricing plan (read-only) with a **"Manage plan"** button
   (lines 109, 142) that calls `buildManagePlanUrl` and opens Shopify's
   hosted pricing page in the top window. That button/URL only appears once
   `SHOPIFY_APP_HANDLE` is configured on the deployed service (see
   `docs/runbooks/app-pricing-setup.md` Step 3) — if it's missing in the
   reviewer's environment, that's a config gap to fix before submission, not
   a code bug. Reviewers should not be asked to enter a credit card —
   dev-store installs show $0 via the "Free for partners and developers"
   checkbox on each paid plan in the Partner Dashboard (owner-configured;
   see `docs/runbooks/app-pricing-setup.md` Step 2).
7. **AI disclosure** — **LIVE on master (WS-F, PR #18, D4 resolved).** The
   merchant support chat surface (`apps/web/app/routes/support.$ticketId.tsx`)
   labels its assistant honestly as AI: `SUPPORT_AGENT_NAME = 'Maya'`
   (`apps/web/app/components/support/badges.tsx:19`), the ticket-status label
   for an AI-answered ticket reads **"Answered by Maya (AI)"**
   (`badges.tsx:24`, rendered via `TicketStatusBadge` at
   `support.$ticketId.tsx:156`), and the chat transcript's `ROLE_LABEL` map
   reads **"Maya · AI assistant"** for assistant-authored messages
   (`support.$ticketId.tsx:60-64`, rendered at line 260). This matches D4
   ("Maya is disclosed as AI... 'instant AI answer, humans on escalation'")
   — point the reviewer at any AI-answered support ticket to see the
   disclosure live.

## Known limitations to disclose up front (avoid a confused rejection)

- Some module types require Shopify Plus (delivery/payment customization,
  certain checkout targets) — the app explains and refuses to publish
  Plus-only modules on non-Plus stores rather than silently failing
  (`docs/app.md` "Plan differences"). Tell the reviewer which test store tier
  they're on so they don't file a false-positive bug.
- `write_themes` is an optional scope that is currently **inert** (no Shopify
  page-builder exemption granted yet, per `docs/launch/scope-justifications.md`)
  — native theme-section push is a no-op until that exemption lands; the
  app-block path (theme app extension) is the live default and does not need
  this scope. Do not let a reviewer treat the optional-scope prompt absence
  as a bug.
- The `customers/data_request` GDPR webhook handler now compiles and
  attempts to email an actual customer data package to the shop owner
  (`apps/web/app/services/gdpr/data-request-export.server.ts`, merged #23 —
  see `docs/launch/gdpr-verification.md`). Delivery still depends on the
  transactional mailer being configured on the deployed service
  (`resolveMailerStatus()`,
  `data-request-export.server.ts:417-427` — an unconfigured mailer returns
  `mailerConfigured: false` and the request is logged as a loud delivery
  failure, not silently dropped). Confirm the mailer is configured on the
  reviewer's environment before the demo, or be ready to explain the honest
  failure path if it isn't.
- Connector/Flow automation features require the merchant to configure a
  connector first — the reviewer's test store should have at least one
  configured (owner: seed one, or document that this surface is best-effort
  reviewed without live third-party credentials).

## Functional test credentials for any Connector/API-Tester surface

`<OWNER: if the reviewer needs to exercise a Connector, supply a safe test
endpoint (e.g. a public mock API) — never a real merchant/vendor credential>`

---

**Owner action before submission (`[OWNER-RUN]`):** replace every
`<OWNER: ...>` placeholder above with real values directly in a local copy
before the Partner Dashboard submission form asks for "notes for the
reviewer" / test credentials fields (4.5.4, 4.5.5). **Do not commit real
store credentials to this repo if it is or could become public** — if the
repo is private and stays private, committing the filled-in file is fine and
keeps a record; if there's any chance of the repo going public, keep the
filled version out of git (e.g., a local-only copy, or a secrets manager
entry) and leave the committed version with placeholders. Confirm which
applies before filling this in.
