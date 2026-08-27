# Bundle Runtime (real, multi-surface, deployable)

> Closes the gap where a generated multi-surface module (e.g. a product bundle)
> was **planned but had no runtime** — a `theme.section` bundle UI with no
> renderer, a `functions.cartTransform` with no wasm Function. Now every surface
> has a shipped extension and publish wires them together. The merchant only
> generates the module; the app connects product + cart + checkout.

## The two-layer Functions contract
- **Layer A** — a real extension shipped via `shopify app deploy` (theme block,
  checkout UI, wasm Function). Without it, `publish-preflight.server.ts` returns
  `blocked` and `PublishService.publish` throws (never a silent no-op).
- **Layer B** — publishing a module writes the config the extension reads at
  runtime (a metaobject, or — for Functions — an owner metafield).

## Surfaces

### Product page — interactive bundle widget
`extensions/theme-app-extension/snippets/superapp-product-bundle.liquid`, rendered
by `blocks/product-slot.liquid` + `blocks/universal-slot.liquid` when
`module_type == 'theme.section'` and `config.kind == 'product-bundle'`. Inherits
theme fonts (`font: inherit`) and colors (`currentColor`), mobile-first, micro-
interactions respect `prefers-reduced-motion` (per DESIGN.md). "Add bundle to
cart" POSTs every component variant to `/cart/add.js` with the line property
`_superapp_bundle_id = <bundleId>`.

### Cart + checkout — cart-transform merge (the core)
`extensions/superapp-cart-transform` (Rust, `cart.transform.run`, handle
`cart-transform-function`). Reads `cartTransform.metafield($app:bundle_config)`,
groups cart lines by their `_superapp_bundle_id`, and emits a `linesMerge`
operation into the bundle's `parentVariantId`. The merged line shows as **one
native product line in both cart and checkout** (merge price defaults to the
components' combined price; `discountPercentage` → `price.percentageDecrease`).
Verified by a function-runner integration test (`tests/fixtures/bundle-merge.json`).

### Discounts — discount function
`extensions/superapp-discount` (Rust, `cart.lines.discounts.generate.run`, handle
`discount-function`) for `functions.discountRules`. Reads
`discount.metafield($app:discount_config)` and applies the first matching rule's
percentage to matching cart lines. Integration-tested.

### Checkout block
`extensions/checkout-ui` `CheckoutBlockRenderer` renders a focused bundle/offer
card (title + auto-applied savings) when the config carries an `offerTitle`.

## Publish orchestration ("connect everything")
`BlueprintService.publishBlueprint` → `prepareBundleArtifacts`
(`app/services/blueprints/blueprint.service.ts`) runs before any member publishes,
via `BundleProductService` (`app/services/bundles/bundle-product.service.ts`):

1. `resolveComponents(skus)` — SKUs → variant GIDs (+ title/price/image). `< 2`
   resolvable → publish fails loudly.
2. `ensureParentBundleProduct(...)` — idempotent `productSet` (handle
   `superapp-bundle-<bundleId>`) → `parentVariantId`. No merchant setup.
3. `activateCartTransform(config)` — idempotent `cartTransformCreate`
   (functionHandle) writing `$app:bundle_config`.
4. `injectResolvedBundle(spec, bundle)` — stamps resolved components + `bundleId`
   into the theme widget, parent variant into the checkout block.

All Admin GraphQL operations validated against the 2026-04 schema via the Shopify
dev MCP. Pure helpers (`bundleIdFromTitle`, `buildBundleRuntimeConfig`,
`injectResolvedBundle`) are unit-tested; live execution is verified in the admin
backend (real shop + products).

## Deployability guardrail (never ship partial again)
- `app/services/publish/deployed-extensions.server.ts` — checked-in manifest of
  shipped Function handles, consumed by the publish preflight (replaces the
  env-only set).
- `app/__tests__/blueprint-deployability.test.ts` — (a) every manifest handle is
  a real `type="function"` extension on disk; (b) **every blueprint-catalog
  member type is `deployable`**. Adding a Function = add its handle to the
  manifest + ship it; every module type it backs becomes deployable at once.

## Toolchain note
Rust Functions build to `wasm32-unknown-unknown` via `rustup` (homebrew `cargo`
lacks the wasm `core`). `shopify app deploy` builds them; ensure `~/.cargo/bin` is
on `PATH`. Shipped in app version `super-app-ai-16`.
