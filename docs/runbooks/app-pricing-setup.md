# Runbook: Shopify App Pricing setup

**Type:** One-time owner-run activation (not an incident runbook)
**Owner:** requires org-owner (or equivalent) permission on the Shopify Partner account — Partner API client creation is gated to org owners.
**Status of the code path:** `PlanSyncService`, `/billing/callback`, the cron reconcile endpoint, and the read-only `/billing` UI are already merged (WS-D Tasks 4-7). They are **inert** until the steps below are completed and the four env vars in `apps/web/.env.example` are set on the deployed `web` service. This doc is the checklist that flips them on.

Cross-reference: plan handles are pinned in [`apps/web/app/services/billing/plan-handles.ts`](../../apps/web/app/services/billing/plan-handles.ts) (`PLAN_BY_HANDLE`). **The handles created in the Partner Dashboard must match that map exactly.** If the dashboard derives a different handle than requested (handles can be auto-derived from the display name), update `PLAN_BY_HANDLE` in the same change and rerun:

```bash
pnpm --dir apps/web test -- billing-plan-sync
```

All plan prices/trials/quotas below are taken from `PLAN_CONFIGS` in [`apps/web/app/services/billing/billing.service.ts`](../../apps/web/app/services/billing/billing.service.ts) and were cross-checked against this runbook at time of writing — no discrepancies found. If the two ever disagree, the code (`PLAN_CONFIGS`) is the source of truth; update this table instead of the code.

**This app has no live Billing API subscriptions** — it was never publicly released — so the "dual-read both billing systems during migration" concern doesn't apply here. The `legacySubscriptionId` warning inside `PlanSyncService` is the tripwire if that assumption is ever wrong.

---

## Step 1 — Opt in to Shopify App Pricing

Partner Dashboard →
**Apps → Super App AI → Distribution → Manage listing → (published language) → Pricing content → Manage → Settings → select "Shopify App Pricing" → Switch**.

---

## Step 2 — Create the four public plans

Under **Public plans → Add**, create the following. Handles must match `plan-handles.ts` exactly.

| Display name | Handle | Billing | Trial | Welcome link | Top features (from `PLAN_CONFIGS` quotas) |
|---|---|---|---|---|---|
| Free | `free` | Free | — | `/billing/callback` | 10 AI generations/mo · 3 published modules · 50 workflow runs/mo |
| Starter | `starter` | $19/mo | 14 days | `/billing/callback` | 200 AI generations/mo · 20 modules · 1,000 workflow runs/mo |
| Growth | `growth` | $79/mo | 14 days | `/billing/callback` | 1,000 AI generations/mo · 100 modules · 10,000 workflow runs/mo |
| Pro | `pro` | $299/mo | 7 days | `/billing/callback` | 10,000 AI generations/mo · 1,000 modules · 100,000 workflow runs/mo |

- On **every paid plan** (Starter/Growth/Pro), check **"Free for partners and developers"**. This is what makes dev-store testing possible (approvals show $0) and replaces the deleted `BILLING_TEST_MODE` env flag.
- **ENTERPRISE is intentionally not created here.** It's an internal override applied via `BillingService.setPlanForShop`, never an App Pricing public plan — see the comment in `plan-handles.ts`.
- If the dashboard assigns a different handle than the one requested (handles can be auto-derived from the display name and may not match `free`/`starter`/`growth`/`pro` verbatim), **stop and fix `PLAN_BY_HANDLE` in the same change** before moving to Step 3, then rerun the `billing-plan-sync` test noted above.

---

## Step 3 — Create the Partner API client + collect env values

1. Partner Dashboard → **Settings → Partner API clients** → create a client with **"Manage apps"** permission → copy the token → this is `SHOPIFY_PARTNER_API_TOKEN`.
2. `SHOPIFY_PARTNER_ORG_ID` — the numeric id in the dashboard URL: `partners.shopify.com/<org_id>/…`.
3. `SHOPIFY_APP_GID` — run a query against the app's Admin API: `{ currentAppInstallation { app { id } } }` (scratch script or the Shopify dev MCP), or read the numeric app id off the Partner Dashboard app URL and form `gid://shopify/App/<id>`.
4. `SHOPIFY_APP_HANDLE` — from the app listing URL / app setup page. **Expected `super-app-ai` — verify, don't assume**; do not hardcode this from memory.
5. Set all four locally (`.env`) and on the deployed `web` service's secrets (Railway / WS-A secrets registry). They're already documented as commented-out placeholders in `apps/web/.env.example`:

   ```
   SHOPIFY_PARTNER_API_TOKEN="replace-with-partner-api-client-token"
   SHOPIFY_PARTNER_ORG_ID="replace-with-numeric-org-id"
   SHOPIFY_APP_GID="gid://shopify/App/replace-with-app-id"
   SHOPIFY_APP_HANDLE="replace-with-app-handle"
   ```

   Never commit real values — placeholders only in the example file.

---

## Step 4 — Verify the Partner API from the shell

```bash
curl -s -X POST "https://partners.shopify.com/$SHOPIFY_PARTNER_ORG_ID/api/2026-07/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: $SHOPIFY_PARTNER_API_TOKEN" \
  -d '{"query":"query($appId: ID!, $shopId: ID!){ activeSubscription(appId:$appId, shopId:$shopId){ items { handle } } }","variables":{"appId":"'$SHOPIFY_APP_GID'","shopId":"gid://shopify/Shop/<dev-store-numeric-id>"}}'
```

Expected: HTTP 200 with `{"data":{"activeSubscription":null}}` (no plan selected yet). An auth error here means the token, org id, or app gid is wrong — fix before proceeding to Step 5.

---

## Step 5 — End-to-end plan lifecycle on the dev store

This test runs against the **production app** installed on a dev store, served from the Railway URL — **not** `shopify app dev`. All of App Pricing plans, `SHOPIFY_APP_GID`, `SHOPIFY_APP_HANDLE`, and the pricing-page URL belong to the production app.

1. Open the production app installed on the dev store (Railway URL). `/billing` should now show a "Manage plan" button (this appears only once `SHOPIFY_APP_HANDLE` is set on the Railway `web` service — see `buildManagePlanUrl` in `plan-handles.ts`, which returns `null` and hides the button otherwise).
2. Click it → the top window navigates to `https://admin.shopify.com/store/<dev-store>/charges/<app-handle>/pricing_plans`, listing the 4 plans.
3. Select **Growth** → approve (shows $0 on a dev store, because of the "Free for partners and developers" checkbox from Step 2) → redirected into the app at `/billing/callback?plan_handle=growth` → lands on `/billing` showing **Growth**.
4. Verify persistence:

   ```bash
   pnpm --dir apps/web exec prisma studio
   # or psql directly
   ```

   Confirm: `AppSubscription` row has `planName=GROWTH`, `planHandle=growth`, `status=ACTIVE`, a fresh `lastSyncedAt`; `Shop.shopGid` is populated.

5. Cancel the plan from the Shopify-hosted pricing page, then force a reconcile:

   ```sql
   UPDATE "AppSubscription" SET "lastSyncedAt" = NULL;
   ```

   ```bash
   curl -s -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron"
   ```

   Confirm the row flips to `planName=FREE`; `/billing` shows Free; and an AI-generate attempt past the FREE quota (10 AI generations/mo) is blocked with the `RATE_LIMITED` message.

---

## Step 6 — Commit

The code-side artifacts for this runbook (env var placeholders + this doc) are committed as:

```bash
git add apps/web/.env.example docs/runbooks/app-pricing-setup.md
git commit -m "docs(billing): App Pricing env vars + Partner Dashboard runbook (owner-run activation)"
```

Steps 1-5 above are **not** part of that commit — they're actions taken directly in the Shopify Partner Dashboard and against the live dev store, with no repo artifact other than the env vars being set on the deployed service's secrets.

---

## Owner-run vs code-side — quick reference

| Step | What it is | Where |
|---|---|---|
| 1. Opt in to App Pricing | Owner action | Partner Dashboard |
| 2. Create 4 public plans | Owner action | Partner Dashboard |
| 3. Create Partner API client, collect env values | Owner action | Partner Dashboard + env/secrets |
| 4. Verify Partner API via curl | Owner action | Shell, against live Partner API |
| 5. End-to-end lifecycle test | Owner action | Live dev store + production Railway app |
| 6. Commit `.env.example` + this doc | Code artifact | This repo (done alongside this doc) |
