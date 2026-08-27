# Scope justifications — Super App AI

Re-derive this table from a fresh grep at listing time (see the loop at the
bottom of this file) — do not hand-copy without checking each grep result
still points somewhere real, since WS-C/WS-F/WS-H may add or remove call
sites. Re-verified against `shopify.app.production.toml:126` on master @
8a656af (2026-08-27, post WS-C/F/G/H merge) — the `scopes` line still
declares exactly 21 scopes, plus one `optional_scopes` entry (`write_themes`,
`shopify.app.production.toml:134`); no scope was added or removed by the
wave-two merges.

| Scope | Gates | Feature | Evidence |
|---|---|---|---|
| `read_themes` | Theme list, `theme.files` | Theme picker for publish/preview; theme-app-extension embed status check | `apps/web/app/services/publish/embed-status.server.ts:20-22`; also required for theme-module preflight — `apps/web/app/services/publish/publish-preflight.server.ts:58` |
| `write_cart_transforms` | `cartTransformCreate`/delete | Bundle/cart-transform Function activation | `apps/web/app/services/publish/activation.service.ts` (`cartTransform` kind); required scope declared at `apps/web/app/services/publish/publish-preflight.server.ts:45` |
| `write_discounts` | `discountAutomaticAppCreate`/update/delete | Discount rules Function activation ("SuperApp Discounts" node) | `apps/web/app/services/publish/activation.service.ts:128,408-423`; required scope at `publish-preflight.server.ts:44` |
| `write_delivery_customizations` | `deliveryCustomizationCreate` | Delivery-customization Function activation (Plus-only) | `apps/web/app/services/publish/activation.service.ts:183,489-496`; required scope at `publish-preflight.server.ts:46` |
| `write_payment_customizations` | `paymentCustomizationCreate` | Payment-customization Function activation (Plus-only) | `apps/web/app/services/publish/activation.service.ts:215,576-583`; required scope at `publish-preflight.server.ts:47` |
| `write_validations` | `validationCreate` | Cart/checkout validation Function activation | `apps/web/app/services/publish/activation.service.ts:249,648-662`; required scope at `publish-preflight.server.ts:48` |
| `write_fulfillment_constraint_rules` | `fulfillmentConstraintRuleCreate` | Fulfillment constraint Function activation | `apps/web/app/services/publish/activation.service.ts:284,730-741`; required scope at `publish-preflight.server.ts:49` |
| `write_pixels` | `webPixelCreate`/`webPixelUpdate` | Analytics/attribution web pixel for generated modules | `apps/web/app/services/shopify/web-pixel.service.ts:19,28`; paired requirement declared at `packages/core/src/extension-eligibility.ts:395` |
| `read_customer_events` | Pixel event read | Web-pixel attribution linking (paired with `write_pixels` for the same feature) | `packages/core/src/extension-eligibility.ts:393-396` |
| `write_metaobjects` / `read_metaobjects` | `$app:superapp_*` metaobjects | Every published module's config storage (the mechanism, not a per-surface list) — every activation object above also needs `write_metaobjects` per `publish-preflight.server.ts:57` | `docs/publishing.md` §1 ("What publish writes per surface"); `apps/web/app/services/publish/publish-preflight.server.ts:57` |
| `write_app_proxy` | App proxy registration | Storefront widget rendering via `/apps/superapp` | `shopify.app.production.toml:137-140` (`[app_proxy]` block; the scope is what lets Shopify accept this config, not a runtime call site) |
| `read_checkouts` | Checkout read (via connector) | "Abandoned checkout" workflow template's Shopify connector requirement | `packages/core/src/workflow-templates.ts:516-519` |
| `write_checkouts` | Checkout write | **Owner decision (2026-08-27): KEEP — "for modules which will use it."** No current call site: grepped `apps/web/app`, `packages/core`, `extensions` for `write_checkouts`, `checkoutCreate`, `checkoutUpdate`, `checkoutBranding*` — zero matches outside the toml files themselves and `docs/shopify-dev-setup.md:87` (a scope list, not a call site) — re-verified 2026-08-27 on master @ 8a656af (post WS-C/F/G/H merge), still zero matches. That fact is kept visible here on purpose, not concealed by the keep-decision. **Roadmap justification:** the app already ships checkout-modifying module types on this exact surface — `checkout.upsell` and `checkout.block` (`packages/core/src/recipe.ts:800,822`; gated in `packages/core/src/extension-eligibility.ts:208-222`) — rendered via the checkout UI extension `extensions/checkout-ui/shopify.extension.toml` (29 `purchase.checkout.*`/`purchase.thank-you.*` render targets). Those two module types currently only require `write_metaobjects` for config storage; `write_checkouts` is requested ahead of a planned Admin-API checkout-mutation capability on that same checkout.upsell/checkout.block surface, not for a feature that calls it today. **Risk:** Shopify review may challenge a scope with no live call site regardless of stated roadmap intent — the owner has accepted that trade-off rather than drop the scope and re-request it (and trigger merchant re-consent) later. |
| `read_customers` / `write_customers` | Customer read/write | Connector-driven automation (ERP/CRM sync via the generic Shopify connector template) + customer-event webhook triggers for Flow automations | `apps/web/app/services/workflows/connectors/shopify.connector.ts:36-39`; `packages/core/src/workflow-templates.ts` (customer-tagging templates); `packages/core/src/shopify-webhook-topics.ts` (customer webhook topic entries) |
| `read_orders` / `write_orders` | Order read/write | Connector-driven automation (order-routing/tagging), order-triggered Flow steps ("Tag Customer", "Add Order Note") | `apps/web/app/services/workflows/connectors/shopify.connector.ts:36-38`; `docs/app.md` §"Automations" (Order Created trigger, Add Order Note step) |
| `read_products` / `write_products` | Product read/write | Connector-driven product sync; `write_products` also required by the cart-transform (bundle) Function activation path | `apps/web/app/services/workflows/connectors/shopify.connector.ts:36-38`; `apps/web/app/services/publish/publish-preflight.server.ts:45` (`functions.cartTransform` requires `write_products` in addition to `write_cart_transforms`); `apps/web/app/services/messaging/restock-watcher.server.ts` (back-in-stock watcher reads product data) |
| `read_inventory` | Inventory read | Inventory-alert workflow template's Shopify connector requirement; inventory webhook topic registry entries for Flow triggers | `packages/core/src/workflow-templates.ts:314-319`; `packages/core/src/shopify-webhook-topics.ts:108-113`. Note: the back-in-stock watcher (`apps/web/app/services/messaging/restock-watcher.server.ts:57-61`) deliberately uses `products/update` instead of `inventory_levels/update` because `read_inventory` is not (yet) in `GRANTED_WEBHOOK_SCOPES` for that watcher — the scope is requested for the connector/Flow-trigger use above, not for that specific watcher. |

Restricted scopes NOT requested (3.2.1-3.2.3): confirmed —
`read_all_orders`, `write_payment_mandate`, `write_checkout_extensions_apis`
are absent from both `scopes` and `optional_scopes` in
`shopify.app.production.toml`. Task 1's `restricted-scopes-not-requested`
check (`apps/web/scripts/submission-conformance-check.ts`) automates this
re-confirmation on every run of `pnpm --dir apps/web submission:check`.

`write_themes` (optional scope, not in the default grant): gates the Theme
Files API (`themeFilesUpsert`) for native-section push. **INERT until a
Shopify page-builder exemption is granted** (see
`specs/033-theme-edit-api/design.md` §2.2, §8). Note this explicitly in the
reviewer notes (Task 5, `docs/launch/review-notes.md`) so a reviewer testing
native sections isn't confused by a no-op.

## Category 5.x applicability

This app is submitted as a regular app (2.2.1-family requirements), not a
Sales Channel (5.7), Payment app (5.2/5.3), Purchase Option/Subscription app
(5.4), Post Purchase app (5.8), or Mobile App Builder (5.9).

One item deserves an explicit note because it's easy to mis-flag: the
checkout/thank-you modules (`extensions/checkout-ui`) use the modern
Checkout UI Extensions targets — `purchase.checkout.block.render`,
`purchase.thank-you.block.render`, and 26 other `purchase.checkout.*` /
`purchase.thank-you.*` render targets (full list:
`extensions/checkout-ui/shopify.extension.toml:30-161`) — not the legacy
Post-Purchase API (`purchase.checkout.io` / the old post-purchase page that
requires `write_checkout_extensions_apis`). Confirmed: no target string
matching `purchase.checkout.io` and no reference to
`write_checkout_extensions_apis` exist anywhere in `extensions/`,
`apps/web/app/`, or `shopify.app.production.toml`. So 5.8's
post-purchase-specific rules do not apply, and the absence of
`write_checkout_extensions_apis` from the scope list is correct, not a gap.

## Re-derivation loop (run before every listing update)

```bash
for scope in read_checkouts read_customer_events read_customers read_inventory \
  read_metaobjects read_orders read_products read_themes write_app_proxy \
  write_cart_transforms write_checkouts write_customers write_delivery_customizations \
  write_discounts write_fulfillment_constraint_rules write_metaobjects write_orders \
  write_payment_customizations write_pixels write_products write_validations; do
  echo "=== $scope ==="
  grep -rln "$scope" apps/web/app packages/core extensions --include="*.ts" --include="*.graphql" --include="*.toml" 2>/dev/null | grep -v __tests__ | head -3
done
```
