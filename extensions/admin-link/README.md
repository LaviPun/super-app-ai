# SuperApp Admin Links

An `admin_link` extension: deep links from Shopify admin resource pages (orders,
products, customers, collections) to the SuperApp. The `admin_link` type has no runtime
bundle — each `[[extensions.targeting]]` in `shopify.extension.toml` registers one link
target + a relative app URL, and Shopify appends the store domain + the selected /
displayed resource id to that URL at click time.

The published `admin.link` module config (persisted to a `superapp.admin/link_refs`
metaobject at publish) carries the merchant-facing label and the intended destination;
the app's `/app/link` route reads `?shop=…&id=…&resource=…` and routes the merchant to
the matching SuperApp workflow.

Targets are documented in the [admin extension target overview](https://shopify.dev/docs/api/admin-extensions/latest/targets).
