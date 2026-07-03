# Customer Account UI Extension (generic)

Customer account UI extensions let apps add UI to the new customer account pages
(Order index, Order status, Profile, full pages, and the order-action menu).

This is ONE config-driven extension: a single generic renderer is mounted at every
customer-account render target. Each per-target module in `src/targets/*.tsx` is a
one-line `mountCaTarget(TARGET)` call — no per-target code. Content comes from the
published `$app:superapp_customer_account_block` metaobject; live-data bindings are
resolved at render time. (Build #3, spec 034.)

## Stack (2026-04)

- **Preact** + **Polaris web components** (`s-stack`, `s-heading`, `s-text`,
  `s-link`, `s-badge`, `s-divider`, plus the interactive set: `s-button`,
  `s-text-field`, `s-text-area`, `s-select`, `s-email-field`, `s-number-field`,
  `s-checkbox`, `s-modal`, and `s-customer-account-action` for the order-action pair).
- `@shopify/ui-extensions` 2026.4.x; entry: `import '@shopify/ui-extensions/preact'`
  and `render(<Target />, document.body)`.
- Block **config** is read from shop metafield
  `superapp.customer_account/block_refs` (list.metaobject_reference) via global
  **`shopify.query()`**; requires `api_access = true` in `shopify.extension.toml`.

## Registered targets (all ~23)

The toml registers every 2026-04 customer-account render target, split across four
`[[extensions]]` blocks because of Shopify's grouping rules:

- **Block set** (admin-placeable/mergeable, on the original shipped uid/handle):
  `order-index.block.render`, `order-status.block.render`, `profile.block.render`.
- **Full-page** targets each get their own extension (a full-page target can't
  coexist with any other target): `page.render`, `order.page.render`.
- **Static** targets share one extension: every `*.render-after`,
  `*.announcement.render`, and the `order.action.menu-item.render` /
  `order.action.render` pair.

## Block vocabulary

Legacy static kinds (render byte-identically to before): `TEXT`, `LINK`, `BADGE`,
`DIVIDER`. Build #3 adds the interactive + data-bound set:

- `BUTTON` — `s-button`; navigates via `url`, or opens a `MODAL` block via `modalId`.
- `FORM` — input fields (`s-text-field`/`s-select`/…) that POST captured values to
  the app-proxy subpath declared in `submit.proxyPath`. Omit `submit` → collect only.
- `MODAL` — `s-modal` (referenced by a `BUTTON`'s `modalId`).
- `ACTION` — the `order.action` pair: the menu-item renders a single `s-button`
  (omit `href` → opens the paired modal); `order.action.render` presents an
  `s-customer-account-action` overlay closed via `shopify.close()`.

## Data binding

A block may declare `bind: '<value>'`; the extension resolves it at render time and
substitutes it for the block's literal `content` (which is used as the fallback).
Bindings degrade gracefully — an unavailable API, missing scope, or a target without
the required context resolves to the literal content, never an error.

| binding                          | source                                         | scope |
|----------------------------------|------------------------------------------------|-------|
| `order.trackingNumber` / `Url`   | Customer Account API `order.fulfillments[].trackingInformation` | `customer_read_orders` |
| `order.fulfillmentStatus`        | `order.fulfillmentStatus` (OrderFulfillmentStatus) | `customer_read_orders` |
| `order.financialStatus`          | `order.financialStatus`                        | `customer_read_orders` |
| `order.returnStatus`             | `order.returns[].status` (ReturnStatus)        | `customer_read_orders` |
| `order.statusPageUrl`            | `order.statusPageUrl`                          | `customer_read_orders` |
| `customer.displayName`           | `customer.displayName`                         | `customer_read_customers` |
| `customer.storeCreditBalance`    | `customer.storeCreditAccounts[].balance`       | `customer_read_store_credit_accounts` |
| `loyalty.points`                 | app-owned (our DB, via app proxy)              | — |
| `subscription.nextOrderDate` / `status` | app-owned (via app proxy)               | — |

Order/customer/returns/store-credit are read via the Customer Account GraphQL API
(`fetch('shopify://customer-account/api/2026-04/graphql.json')`, auth automatic).
The current order id (order-scoped targets) comes from the `shopify.order` global.
Loyalty points and subscription data are app-owned and read through the app proxy.

## Constraints

- No arbitrary HTML or `<script>` tags; only Shopify-provided UI components.
- Styling is controlled by the customer account UI; you cannot override CSS.
- **64 KB script limit** per target bundle (enforced at deploy). Preact + Polaris
  keeps bundles ~51 KB; using React would exceed it.
- Protected-customer-data scopes are granted app-wide (shopify.app.toml + a
  Partner-dashboard data-protection request). They gate bindings, not rendering.

## Troubleshooting

- Bundle resolution, 64 KB limit, deploy flags, target validation: see
  **`docs/debug.md`** in the repo root.
