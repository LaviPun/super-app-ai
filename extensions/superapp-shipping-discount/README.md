# SuperApp Shipping Discount Function

A Shopify **Discount API** Function targeting `cart.delivery-options.discounts.generate.run`
(the SHIPPING discount class). It waives or discounts shipping — i.e. free / discounted
delivery — when the published pricing rule says free-shipping.

This is the runtime the product-discount Function (`extensions/superapp-discount`,
`cart.lines.discounts.generate.run`) cannot provide: that target's `CartOperation` set has
no shipping operation, so a `free-shipping` discount kind lowered onto it is honest-but-inert.
This crate is where `free-shipping` actually prices at checkout — see
`specs/030-control-packs/design/discount-packs.md` §9.2.

## Config

Reads its config from the `$app:superapp_function_config` metaobject (handle
`superapp-fn-shippingDiscount`, field `config_json`), written by
`PublishService.writeFunctionConfig` — the same app-served metaobject pattern every other
SuperApp Function uses. The TS compiler `functions.shippingDiscount.ts` produces the config
via `lowerPricingToShippingDiscount` (`apps/web/.../compiler/pricing/lower.ts`).

## Building

```shell
cargo build --target=wasm32-unknown-unknown --release
```

The Shopify CLI `build` command runs this via `shopify.extension.toml`. Native unit tests
(the free-shipping decision core) run with `cargo test`.
