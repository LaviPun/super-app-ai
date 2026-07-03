# SuperApp Order Routing Function

A Shopify **Order Routing Location Rule API** Function targeting
`cart.fulfillment-groups.location-rankings.generate.run`. For each fulfillment group it
ranks the group's inventory locations; Shopify fulfills from the highest-ranked location.

This is the runtime the `functions.orderRoutingLocationRule` module type previously had
NO consumer for. The compiler (`compiler/functions.orderRoutingLocationRule.ts`) already
emits a `FUNCTION_CONFIG_UPSERT` for the `orderRoutingLocationRule` config, but with no
crate to read it the config was honest-but-inert and the eligibility registry classified
the type `needs_runtime` (there was no wasm to ship). This crate reads that same config and
actually enforces it.

## Config

Reads its config from the `$app:superapp_function_config` metaobject (handle
`superapp-fn-orderRoutingLocationRule`, field `config_json`), written by
`PublishService.writeFunctionConfig` — the same app-served metaobject pattern every other
SuperApp Function uses. The config shape mirrors the `functions.orderRoutingLocationRule`
RecipeSpec: `{ rules: [{ when: { inventoryLocationIds?, countryCode? }, apply: {
preferLocationId?, priority? } }] }`.

Location scoping: the config carries Shopify **location GIDs**, while the Function input
exposes opaque location **handles**. The crate matches a GID to a handle by the trailing
numeric id (and exact equality), so an explicit `preferLocationId` still ranks its target
location above the rest of a group.

## Building

```shell
cargo build --target=wasm32-unknown-unknown --release
```

The Shopify CLI `build` command runs this via `shopify.extension.toml`. Native unit tests
(the location-ranking decision core) run with `cargo test`.
