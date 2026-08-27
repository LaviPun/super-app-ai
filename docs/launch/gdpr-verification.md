# GDPR / data-protection verification — Super App AI

Run before Task 8's final checklist. Requires a running dev server
(`pnpm --dir apps/web dev`) and a valid webhook HMAC — use the Shopify CLI's
built-in webhook trigger rather than hand-computing HMACs:

```bash
shopify app webhook trigger --topic customers/data_request \
  --api-version 2026-07 --address "http://localhost:3000/webhooks/customers/data_request" \
  --delivery-method http
shopify app webhook trigger --topic customers/redact \
  --api-version 2026-07 --address "http://localhost:3000/webhooks/customers/redact" \
  --delivery-method http
shopify app webhook trigger --topic shop/redact \
  --api-version 2026-07 --address "http://localhost:3000/webhooks/shop/redact" \
  --delivery-method http
```

Expected for each: HTTP 200, and (for redact topics) an `ActivityLog` row
with `action: 'GDPR_CUSTOMER_REDACT'` or `'GDPR_SHOP_REDACT'` — check via:

```bash
pnpm --dir apps/web exec prisma studio
# or: psql -c "select action, details, \"createdAt\" from \"ActivityLog\" where action like 'GDPR_%' order by \"createdAt\" desc limit 5;"
```

Then run the shop/redact completeness test (see "Completeness test — current
status" below; it is now merged and green).

## `customers/data_request` — resolved (2026-08-27, merged #23)

**Verdict: the handler now compiles a real customer data export and attempts
to deliver it to the shop owner by email. The count-only/no-op-filter defect
described in the prior revision of this doc is fixed.**

Evidence — `apps/web/app/routes/webhooks.customers.data_request.tsx`
(master @ 8a656af, full handler re-read 2026-08-27):

- Lines 30-34: imports `compileCustomerDataExport` and
  `deliverCustomerDataExport` from
  `apps/web/app/services/gdpr/data-request-export.server.ts`.
- Lines 68-89: compiles the export (`compileCustomerDataExport`, scoped by
  `shopId` **and** `customerId`/`customerEmail` — the ternary no-op-filter
  bug from the prior handler is gone); on a compile failure the webhook
  releases its idempotency claim and 500s so Shopify redelivers.
- Lines 91-98: calls `deliverCustomerDataExport` to email the compiled
  export to the shop owner; a delivery failure never throws — it returns a
  structured `{ emailSent: false, reason }` instead.
- Lines 107-138: writes an `ActivityLog` row (`action: 'GDPR_DATA_REQUEST'`)
  with the compiled counts and delivery result, and — if `!delivery.emailSent`
  — logs a loud `ErrorLogService` entry so an unconfigured mailer or
  unresolvable owner email is visible to ops, not silently dropped.

Model coverage (`apps/web/app/services/gdpr/data-request-export.server.ts:20-34`):
`DataCapture`, `DataStoreRecord`, `ModuleEvent`, `AttributionLink` (the same
set `customers/redact` already scopes to `customerId`) plus `SupportTicket`
(+ non-internal `SupportTicketMessage` rows, matched by `shopperEmail` since
`SupportTicket` has no `customerId` column). Shopify order data itself is
never stored in this app's database, so the export explicitly notes that
full order records must be pulled from Shopify Admin directly
(`ORDER_DATA_NOTE`, `data-request-export.server.ts:138-141`).

**Delivery is mailer-gated, not code-gated.** `deliverCustomerDataExport`
(`data-request-export.server.ts:393-433`) calls `resolveMailerStatus()`; if
the transactional mailer isn't configured on the deployed service, it
returns `{ emailSent: false, mailerConfigured: false, reason:
'mailer_not_configured' }` rather than throwing — the webhook still 200s
(the data *was* compiled, satisfying the compliance requirement to have it
ready), but the merchant won't actually receive the email until the mailer
is configured. **This is an owner-run deployment/config item, not a code
gap** — track it alongside the burn-in/mailer-configuration items in the
pre-submission checklist.

**Contrast with `customers/redact`** (`webhooks.customers.redact.tsx:33-79`):
unchanged from the prior revision of this doc — a real, customer-scoped
transactional deletion across `DataCapture`, `DataStoreRecord`,
`ModuleEvent`, `AttributionLink`. Both `customers/redact` and
`customers/data_request` are now functionally sound.

## Completeness test — current status (merged, green)

`apps/web/app/__tests__/shop-redact-completeness.test.ts` is now on master
(WS-G, PR #17, commit landed with finding **[Infra-11]** closed) and passes.
Re-run:

```bash
cd apps/web && npx vitest run app/__tests__/shop-redact-completeness.test.ts
```

Actual output (2026-08-27, master @ 8a656af, with CI's env-var set —
`DATABASE_URL`/`SHOPIFY_APP_URL`/etc. per `.github/workflows/ci.yml`, no live
Postgres required since the test only reads `schema.prisma` and the route
source as text):

```
 ✓ app/__tests__/shop-redact-completeness.test.ts (3 tests) 3ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

The test (`apps/web/app/__tests__/shop-redact-completeness.test.ts`) derives
every shop-scoped model from `schema.prisma` by field-name vocabulary
(`shopId`/`tenantId`-style FKs to `Shop`, not a hardcoded list), diffs that
against every model `webhooks.shop.redact.tsx` actually deletes/updates, and
fails on anything neither handled nor explicitly retained via
`REDACT_RETENTION_ALLOWLIST` (exported from
`apps/web/app/routes/webhooks.shop.redact.tsx`). All 3 tests pass: every
shop-scoped model is handled or allowlisted, every allowlist entry is a real
shop-scoped model (no stale entries), and the field-vocabulary regression
guard confirms both `shopId` and `tenantId` conventions are picked up. The
[Infra-11] gap (25 of 31 shop-scoped models left undeleted) described in the
prior revision of this doc is closed.
