# Customer Account UI Extension (generic)

Customer account UI extensions let apps add UI to the new customer account pages (Order index, Order status, Profile).

## Stack (2026-01)

- **Preact** + **Polaris web components** (`s-stack`, `s-heading`, `s-text`, `s-link`, `s-badge`, `s-separator`)
- `@shopify/ui-extensions` 2026.1.x; entry: `import '@shopify/ui-extensions/preact'` and `render(<Block />, document.body)`
- Config is read from shop metafield `superapp.customer_account/blocks` via global **`shopify.query()`** (Storefront API); requires `api_access = true` in `shopify.extension.toml`

## Constraints

- No arbitrary HTML or `<script>` tags; only Shopify-provided UI components.
- Styling is controlled by the customer account UI; you cannot override CSS.
- **64 KB script limit:** Compiled bundle must stay under 64 KB (enforced at deploy). Using React would exceed it; Preact + Polaris keeps the bundle small.

## Strategy for SuperApp

- Store module configs in shop metafields (`superapp.customer_account.blocks`).
- This extension reads config and renders blocks (TEXT, LINK, BADGE, DIVIDER) on Order index, Order status, and Profile.
- Targets: `customer-account.order-index.block.render`, `customer-account.order-status.block.render`, `customer-account.profile.block.render`. The target `customer-account.page.render` cannot be in the same extension (see root `docs/debug.md`).

## Troubleshooting

- Bundle resolution, 64 KB limit, deploy flags, target validation: see **`docs/debug.md`** in the repo root.
