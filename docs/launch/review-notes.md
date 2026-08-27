# Reviewer notes — Super App AI

**Test store:** `<OWNER: paste the review dev-store URL here — do not commit a
real store handle to a public doc if the repo is or becomes public; keep this
file private / .gitignored if the repo's visibility requires it>`
**Test login:** `<OWNER: staff account credentials for the reviewer, created
fresh for this submission — never reuse a personal or production login>`
**Emergency developer contact:** `<OWNER: name + email, kept current per
requirement 4.5.6 — Shopify may need to reach a human fast>`

> This walkthrough describes **master @ c201150** (this branch's base) as
> verified by reading the actual route code, not the aspirational plan.
> Where a step depends on a workstream still in an unmerged PR (WS-C, WS-F,
> WS-G, WS-H), it's marked **Pending (unmerged PR)** below with what's true
> today instead. Re-verify this whole doc once those PRs land — some of the
> "current" behavior described here will change.

## Walkthrough (matches the demo screencast, requirement 4.5.3)

1. **Install** — reviewer installs from the listing; managed installation +
   token exchange means no OAuth redirect loop
   (`unstable_newEmbeddedAuthStrategy: true`,
   `apps/web/app/shopify.server.ts:37`). Expect the app to load embedded
   immediately after the permission grant screen.
2. **Generate a module** — `/generate` (`apps/web/app/routes/generate._index.tsx`),
   describe "a banner announcing free shipping over $50" (or pick a
   template). Expect a draft with a preview. **Pending (unmerged PR, WS-C
   generation-job polling UI):** on this branch the generation path is the
   inline SSE/synchronous flow with a route-handler budget of ≤60s (per
   `docs/superpowers/plans/2026-08-24-launch-program.md`'s global constraint
   "Route handler budget stays ≤ 60s only until WS-C moves generation
   async"); it has not yet moved to the async job-polling route. If
   generation is slow on the reviewer's test prompt, that's the known
   ceiling — pick a simple prompt for the demo.
3. **Publish** — from the module detail page
   (`apps/web/app/routes/modules.$moduleId.tsx`), pick a theme from the
   **"Publish to theme"** dropdown (line ~759) and click **Publish**. As
   verified in the current route code: there is **no confirmation dialog**
   before Publish and **no "view on storefront" link** shown after success
   today — publish is a direct action that ends in a toast, "Published —
   live in a few minutes" (`modules.$moduleId.tsx:464`).
   **Pending (unmerged PR #18, WS-F):** the plan for a publish
   *ceremony* (confirm-before-publish + a "view on storefront" link) is
   `feat/ws-f-merchant-ui` commit `923bc6f`, not yet merged. Don't expect a
   confirm dialog or storefront link in the demo build unless that PR has
   landed by submission time — re-check before recording the screencast.
   Storefront must render the banner after the theme app embed is enabled —
   first publish of a theme module surfaces an embed-status nudge on the
   module detail page when the app block isn't added yet
   (`modules.$moduleId.tsx:466-467,602,745`, backed by
   `apps/web/app/services/publish/embed-status.server.ts`). This part is
   live on master today, unlike the ceremony/link above.
4. **Rollback** — from the module's version history, click **Roll back**
   next to a non-active version (`modules.$moduleId.tsx:916`, wired to
   `POST /api/rollback`). This is live on master. Confirm the storefront
   reverts.
5. **Unpublish** — confirm the storefront no longer renders the module; the
   module detail page has an explicit "Unpublish module?" confirm dialog
   (`modules.$moduleId.tsx:776`) and shows "Unpublished — removed from your
   storefront" on success. Per `docs/publishing.md`, confirm the underlying
   metaobject/activation object is actually removed, not just hidden in the
   app's UI — cross-check against that doc's §3 (unpublish/delete
   semantics) if anything looks off.
6. **Billing** — `/billing` (`apps/web/app/routes/billing._index.tsx`) shows
   the current App Pricing plan (read-only) with a **"Manage plan"** button
   (lines 108, 141) that calls `buildManagePlanUrl` and opens Shopify's
   hosted pricing page in the top window. That button/URL only appears once
   `SHOPIFY_APP_HANDLE` is configured on the deployed service (see
   `docs/runbooks/app-pricing-setup.md` Step 3) — if it's missing in the
   reviewer's environment, that's a config gap to fix before submission, not
   a code bug. Reviewers should not be asked to enter a credit card —
   dev-store installs show $0 via the "Free for partners and developers"
   checkbox on each paid plan in the Partner Dashboard (owner-configured;
   see `docs/runbooks/app-pricing-setup.md` Step 2).
7. **AI disclosure** — **NOT YET DONE on master.** The merchant support chat
   surface exists (`apps/web/app/routes/support.$ticketId.tsx`) and its
   assistant is internally named "Maya" (`SUPPORT_AGENT_NAME`,
   `apps/web/app/components/support/badges.tsx:19`), but the merchant-facing
   label deliberately reads as a **named human support rep, not as AI** —
   see the comment at `support.$ticketId.tsx:59`: "Merchant-facing:
   assistant replies read as a named support rep, not as AI," and the
   `ROLE_LABEL` map at lines 60-64 (`assistant: 'Maya · Support team'`, no
   AI wording). This is the opposite of what's needed: launch-program.md's
   D4 requirement is "Maya is disclosed as AI. All support copy tells one
   honest story ('instant AI answer, humans on escalation')," tracked as
   WS-F Task UI-5, still on the unmerged `feat/ws-f-merchant-ui` branch.
   **Do not point a reviewer at the support chat as an example of AI
   disclosure until that PR lands and this note is updated** — as of this
   branch it would show the opposite of the required disclosure.

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
- The AI-disclosure gap described in Walkthrough step 7 above — fix before
  submission or be ready to explain it if a reviewer asks why the "AI"
  support assistant reads as a person.
- The `customers/data_request` GDPR webhook handler does not yet deliver an
  actual customer data package (see `docs/launch/gdpr-verification.md` for
  the full finding) — this is a functional gap that should be closed before
  submission, not just disclosed.
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
