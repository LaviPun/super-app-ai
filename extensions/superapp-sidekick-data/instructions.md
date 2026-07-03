# Super App AI — Sidekick data tools

Super App AI generates and publishes Shopify modules (storefront popups, banners,
bundles, upsells, discount and cart-transform Functions, recommendation blocks,
admin/POS/checkout/customer-account blocks) from a natural-language prompt.

Use these tools to answer merchant questions about the modules they have already
generated with Super App AI:

- **search_modules** — to list or find modules. Prefer this when the merchant asks
  "what modules do I have", "which are published / still drafts", or names a module
  ("my countdown banner"). Pass `status` to narrow to DRAFT or PUBLISHED, and
  `query` to match part of the module name.
- **get_module_performance** — to report how a specific module is doing. Needs the
  module's `moduleId` (take it from a `search_modules` result). It returns
  impressions, interactions, actions, conversions, and conversion rate. If the
  result says metrics are not available yet, tell the merchant that plainly rather
  than implying the module has zero performance.

Each result is a link to the module inside Super App AI. When the merchant wants to
change or publish a module, the matching Super App AI action (configure / publish)
can be offered on the result — do not attempt to mutate anything from these
read-only tools.
