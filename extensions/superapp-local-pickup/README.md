# SuperApp Local Pickup Function

A Shopify **Local Pickup Delivery Option Generator** Function targeting
`purchase.local-pickup-delivery-option-generator.run`. It GENERATES local-pickup
("buy online, pick up in store" / BOPIS) delivery options at checkout: for each configured
store location it adds a pickup option with an optional custom cost, title, and pickup
instruction.

## API-version status (honest)

The Local Pickup Delivery Option Generator API is currently available **only on the
`unstable` API version**. Verified via the Shopify dev MCP on 2026-07-04: the API is NOT
present in `2026-04` (the version every other SuperApp crate — and the app itself — pins),
so this crate pins `api_version = "unstable"`.

Because of that, the `functions.localPickupDeliveryOption` module type is classified
`needs_runtime` in the eligibility registry. It flips deployable only when BOTH hold:

1. Shopify promotes this API to a stable version the app adopts (and this crate's
   `api_version` + `schema.graphql` are re-pinned to it), AND
2. the `superapp-local-pickup` handle is added to the deployed-function manifest
   (`deployed-extensions.server.ts`) after `shopify app deploy` ships the wasm.

Until then the compiler still emits real config to the metaobject this crate reads, and the
registry reports the honest "not shipped on a stable version yet" state — never a false
publish.

## Config

Reads its config from the `$app:superapp_function_config` metaobject (handle
`superapp-fn-localPickupDeliveryOption`, field `config_json`), written by
`PublishService.writeFunctionConfig`. Shape mirrors the RecipeSpec:
`{ locations: [{ locationId, cost?, title?, pickupInstruction? }] }`. A configured
`locationId` (Shopify location GID) is matched to the Function's opaque location handle by
trailing numeric id; a `locationId` that matches no store location is skipped, never
fabricated.

## Building

```shell
cargo build --target=wasm32-unknown-unknown --release
```

Native unit tests (the option-generation decision core) run with `cargo test`.
