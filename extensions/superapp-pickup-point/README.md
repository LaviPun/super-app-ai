# SuperApp Pickup Point Function

A Shopify **Pickup Point Delivery Option Generator** Function targeting
`purchase.pickup-point-delivery-option-generator.run`. It GENERATES third-party
pickup-point delivery options at checkout — parcel lockers, post offices, convenience
stores — each carrying its full carrier identity (external id, provider, name, address).
Points can be gated by the cart's destination country so only in-country points are offered.

## API-version status (honest)

The Pickup Point Delivery Option Generator API is currently available **only on the
`unstable` API version**. Verified via the Shopify dev MCP on 2026-07-04: the API is NOT
present in `2026-04` (the version every other SuperApp crate — and the app itself — pins),
so this crate pins `api_version = "unstable"`.

Because of that, the `functions.pickupPointDeliveryOption` module type is classified
`needs_runtime` in the eligibility registry. It flips deployable only when BOTH hold:

1. Shopify promotes this API to a stable version the app adopts (and this crate's
   `api_version` + `schema.graphql` are re-pinned to it), AND
2. the `superapp-pickup-point` handle is added to the deployed-function manifest
   (`deployed-extensions.server.ts`) after `shopify app deploy` ships the wasm.

Until then the compiler still emits real config to the metaobject this crate reads, and the
registry reports the honest "not shipped on a stable version yet" state — never a false
publish.

## Config

Reads its config from the `$app:superapp_function_config` metaobject (handle
`superapp-fn-pickupPointDeliveryOption`, field `config_json`), written by
`PublishService.writeFunctionConfig`. Shape mirrors the RecipeSpec:
`{ points: [{ externalId, name, cost?, provider: { name, logoUrl }, address: { address1,
city, countryCode, latitude, longitude, ... }, countryCodeIn? }] }`. A point missing any
field the output type requires (externalId/name/provider/address1/city/countryCode/
coordinates) is skipped, never emitted with placeholder values.

## Building

```shell
cargo build --target=wasm32-unknown-unknown --release
```

Native unit tests (the point-selection decision core) run with `cargo test`.
