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

Then run the completeness test:

```bash
cd apps/web && npx vitest run app/__tests__/shop-redact-completeness.test.ts
```

## `customers/data_request` — resolved finding (2026-08-27)

**Verdict: the current handler does NOT deliver customer data. It only
records a count in an internal audit log. This is a functional gap, not a
documentation gap, and must be fixed before submission.**

Evidence — `apps/web/app/routes/webhooks.customers.data_request.tsx:27-51`
(full handler body, master @ c201150 / this branch):

```ts
const captures = await prisma.dataCapture.findMany({
  where: { shopId: shop.id, ...(customerId != null ? {} : {}) },
  select: { id: true, captureType: true, createdAt: true },
  take: 1000,
});
dataRequested.dataCapturesCount = captures.length;

await prisma.activityLog.create({
  data: {
    actor: 'WEBHOOK',
    action: 'GDPR_DATA_REQUEST',
    resource: `customer:${customerId ?? 'shop'}`,
    shopId: shop.id,
    details: JSON.stringify({ customerId, dataRequested }),
  },
});

return new Response(undefined, { status: 200 });
```

What it actually does:
1. Looks up the shop.
2. Queries up to 1,000 `DataCapture` rows for the shop and counts them
   (`dataCapturesCount`).
3. Writes one `ActivityLog` row containing that count — an **internal**
   audit-log entry, not visible to the merchant or the customer, and not a
   data export in any form (no file, no email, no API response body beyond
   the log write).
4. Returns HTTP 200.

What it does NOT do, and Shopify's `customers/data_request` compliance
webhook expects it to (the merchant must be able to provide the requested
customer data within 30 days — see Shopify's GDPR webhooks documentation):
- It does not compile an actual data package (the customer's records, not
  just a count of them).
- It does not deliver that package anywhere the merchant or customer could
  retrieve it — no email, no download link, no dashboard surface, no webhook
  callback to a merchant-configured endpoint.
- It only queries `DataCapture`. It does not look at any of the other
  customer-linked models this app has (e.g. `DataStoreRecord`,
  `ModuleEvent`, `AttributionLink` — the same set `customers/redact`
  correctly scopes to `customerId`, see below), so even the *count* it logs
  is incomplete.

**Additional defect found while reading this handler** (separate from the
delivery gap above, file:line evidence):
`webhooks.customers.data_request.tsx:35` —
`where: { shopId: shop.id, ...(customerId != null ? {} : {}) }` — both
branches of that ternary spread an empty object, so the query is never
actually filtered by `customerId`. It queries every `DataCapture` row for
the whole shop regardless of which customer the request is about. Compare
with `webhooks.customers.redact.tsx:36-41`, which correctly filters
`dataCapture.deleteMany` by both `shopId` and `customerId`.

**Contrast with `customers/redact`** (`webhooks.customers.redact.tsx:33-79`):
that handler is a real, customer-scoped deletion — it transactionally
deletes `DataCapture`, `DataStoreRecord`, `ModuleEvent`, and
`AttributionLink` rows filtered by both `shopId` and `customerId`, then logs
the deletion counts. `customers/redact` is functionally sound;
`customers/data_request` is not.

**Gap to close before Task 8 / submission:** implement an actual
data-request delivery path — at minimum, compile the customer's records
across the same model set `customers/redact` already scopes to (plus
whichever others actually hold customer-identifying data) and deliver them
to the merchant (e.g., a signed export attached to an internal
notification, or logged in full rather than as a count, per whatever
mechanism the owner picks) — and fix the no-op `customerId` filter noted
above. This is tracked as an open item, not resolved by this task.

## Completeness test — current status

`apps/web/app/__tests__/shop-redact-completeness.test.ts` did **not**
already exist on this branch (grepped `shop/redact completeness` and
`shopId-bearing` across `apps/web/app/__tests__/*.test.ts` before writing —
zero matches), so it was added here per Step 2 of this task's brief.

Confirmed via `git merge-base --is-ancestor <WS-G shop/redact fix commit>
HEAD` that PR #17 (WS-G, commit `1342a60` "fix(ws-g): shop/redact deletes
every shopId-bearing model … [Infra-11]" on branch
`feat/ws-g-ops-integrations`) is **not** merged into this branch. Per this
task's brief, that means the completeness test is *expected* to fail right
now — this is the correct, honest state, not a bug in the test.

Actual run on this branch (2026-08-27):

```
FAIL  app/__tests__/shop-redact-completeness.test.ts
  shop/redact completeness > every shopId-bearing model is handled by
  webhooks.shop.redact.tsx or documented as retained
  AssertionError: undeleted + unexplained models: ...
```

The schema has 31 `shopId`-bearing models (counted by the test itself from
`apps/web/prisma/schema.prisma`). `webhooks.shop.redact.tsx` deletes 5 of
them directly — `DataStore`, `DataCapture`, `ModuleEvent`,
`ModuleMetricsDaily`, `AttributionLink` — plus `DataStoreRecord` (not itself
`shopId`-bearing; deleted via its `dataStore` relation) —
`apps/web/app/routes/webhooks.shop.redact.tsx:35-44`. It also writes (not
deletes) an `ActivityLog` row for the redaction event itself
(`webhooks.shop.redact.tsx:46-54`), which the test's substring check counts
as "touched" even though that row isn't shop data being redacted — it's the
compliance record of the redaction. That leaves exactly **25** `shopId`
models neither deleted nor listed in the test's `RETAINED_WITH_REASON`
allowlist (e.g. `Module`, `Recipe`, `Connector`, `ConnectorToken`, `Job`,
`WorkflowRun`, `SupportTicket` — full list is the assertion failure's
diff), so the test correctly fails with exit code 1.
**Re-run this test after PR #17 merges — do not weaken it to pass early.**

```bash
cd apps/web && npx vitest run app/__tests__/shop-redact-completeness.test.ts
```
