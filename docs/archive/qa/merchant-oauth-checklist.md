# Merchant embedded OAuth — operator checklist

Automated coverage without a Shopify session:

- Unit tests: `advanced._index` and `picker._index` loaders call `shopify.authenticate.admin`.
- Playwright: `e2e/merchant/auth-guards.spec.ts` (run with merchant dev on `:3000`) asserts `/advanced`, `/picker`, and `/modules` return **410**, **302**, **401**, or **403** when unauthenticated.
- `modules._index` authenticates **before** DB work so auth `Response` objects are not swallowed as HTTP 500.

## Manual gate (required before App Store / prod merchant traffic)

1. **Partner app + dev store**
   - `pnpm shopify:dev` from repo root (or `shopify app dev` per your team doc).
   - Install the app on a development store.

2. **Embedded admin smoke**
   - Open the app from Shopify Admin (embedded iframe).
   - Confirm `/modules` loads module list (not 410).
   - Open `/advanced`, `/picker`, `/connectors`, `/flows`, `/billing`, `/settings`.
   - Create or publish a test module; confirm storefront preview path if applicable.

3. **Billing / scopes**
   - Confirm required scopes in `shopify.app.toml` match features used.
   - Exercise billing entry if enabled for the store plan.

4. **Webhooks (if configured)**
   - Trigger a test webhook from Partner dashboard; confirm worker/API handles it without PII in logs.

5. **Production deploy**
   - Set production env: `SHOPIFY_*`, `DATABASE_URL`, `ENCRYPTION_KEY`, cookie `secure` flags.
   - Run `pnpm --filter web build` and deploy Remix app per your hosting runbook.

Record date, store domain, and tester initials in your release ticket when this checklist is complete.
