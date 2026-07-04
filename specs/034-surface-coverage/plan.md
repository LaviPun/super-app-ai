# Surface Coverage Matrix — full-surface template plan (phase 034)

Provenance: read-only coverage-research Workflow `wx7lf7htc` (2026-07-04), 8/9 surface families enumerated (post-purchase family hit a schema-retry cap; covered via the order-page family's thank-you ownership) + a synthesis pass. ~999K tokens. Grounded in the dev-MCP (2026-04), our compiler, and the 028 corpus.

## TL;DR — authoring ≠ shipping
The plan sizes **~373 templates** across three libraries (modules 168 · theme-extension blocks 103 · native sections 102), every surface/target clearing a floor. BUT most module surfaces **AUDIT-compile only** — valid specs + metaobjects, no deployable extension. Truly covering every surface (deployable, not just authorable) requires an **integrity fix + up to 8 runtime emit builds**. This doc is the source of truth for that program.

## Deployability classification (honest)
- **Deployable TODAY (author + ship now):** `functions.discountRules` · `functions.shippingDiscount` · `functions.cartTransform`; `theme.section` app-block section-targets + native-section (Theme Edit API, flag+exemption gated); `proxy.widget` liquid; `messaging.campaign` email/slack; `agentic.catalogProfile` catalog-feed/attribute-map/compliance-disclosure.
- **PARTIAL (declarative payload + mounted-extension render, integrity-risk):** `admin.*` · `customerAccount.blocks` · `checkout.upsell`/`checkout.block` · `postPurchase.offer` · `functions.deliveryCustomization`/`paymentCustomization`/`cartAndCheckoutValidation`/`fulfillmentConstraints`/`orderRoutingLocationRule` · `flow.automation` linear · `proxy.widget` json/full-page.
- **NO (needs pre-authoring build):** ALL `pos.extension`; all app-embed (body/head/compliance_head); admin print/link/settings gaps; checkout non-block targets; customer-account order.action + render-after slots; true post-purchase page; local-pickup/pickup-point functions; messaging sms/push; flow_* CLI extensions; integration.httpSync runtime; agentic mcp/agent-profile.

## Three-library authoring plan (unit → recipeType → count)
### MODULES (totalFloor 168)
admin.block: order-details 6 · product-details 5 · customer-details 5 · variant-details 3 · b2b-and-resource 12. admin.action: order 9 · product-customer 20 · b2b-discount-gift-collection 16. admin.discountUi: discount-ui-settings 4. checkout.block: main 8. checkout.upsell: main 6. postPurchase.offer: thankyou-offer 6. customerAccount.blocks: loyalty-hub 14 · order-blocks 14. pos.extension: home-loyalty 14 · customer-and-cart 20 · product-order-post 22. messaging.campaign: email 11 · slack 3. flow.automation: linear-runner 6. integration.httpSync: outbound 8. agentic.catalogProfile: catalog-feed 8. functions.discountRules 14 · cartTransform 8 · deliveryCustomization(+payment+validation) 19 · shipping-fulfillment-routing 16. proxy.widget: storefront-and-order 19.
### THEME-EXTENSION BLOCKS (totalFloor 103)
theme.section app-blocks: pdp-surface 14 · collection-surface 10 · index-fullsection 18 · cart-surface 8 · content-page-fullsection 22 · header-footer-group 14 · appembed-body-overlay 10 · appembed-head-injection 8. proxy.widget embedded 11.
### NATIVE SECTIONS (totalFloor 102)
theme.section native_section (dual-mode w/ full-section app-blocks): hero 10 · feature-bento 8 · testimonials 10 · pricing 8 · faq 6 · stats-cta 10 · newsletter 8 · gallery 8 · contact-team-timeline 8 · pdp-fullsection 8 · collection-editorial 6 · launch-404 4 · logo-marquee 8.

Dual-mode: full-section designs authored ONCE as `theme.section`, compiled two ways (app-block metaobject mode → theme-extension blocks lib; native_section Liquid mode → native sections lib). Surface-blocks (PDP trust/size-chart/FBT, cart goal-bar, collection filters) are app-block-only.

## GAPS (verbatim from synthesis — the honest coverage holes)
1. MODULES — admin.block/admin.action/admin.discountUi/pos.extension/customerAccount.blocks/flow.automation/integration.httpSync ALL compile AUDIT-only: typed payloads/metaobjects but no deployable extension (extension.toml + Preact/Polaris s-* bundle). Authorable but unshippable until each family gets a real emit path. Four (checkout.block, postPurchase.offer, integration.httpSync, blueprint) additionally FALSE-PUBLISH.
2. ADMIN — unreachable 2026-04 targets: admin.product-details.reorder.render, admin.discount-index.selection-action.render, admin.settings.validation/order-routing-rule.render, admin.*.configuration.render, admin.customers.segmentation-templates.data, all 4 print-action targets (no admin.print type), admin-link (no admin.link type).
3. CHECKOUT — compiler ignores spec.config.target; only 2/30 CHECKOUT_UI_TARGETS registered. Renderer emits heading+message+product+add-to-order only — no interactive fields, no layout kinds, no attributes/note/metafield writes, no protected-customer-data.
4. CUSTOMER-ACCOUNT — 4/23 targets whitelisted; block vocab TEXT|LINK|BADGE|DIVIDER only (no button/form/modal/order.action); no Customer Account/Order API data binding.
5. POS — entire family AUDIT-only; NO POS UI extension deployable for any of 32 targets; 4 event.observe targets absent; no behavior vocabulary.
6. FUNCTIONS — no type/crate for local-pickup + pickup-point delivery-option generators; orderRoutingLocationRule config-only (no crate → never enforced); no .generate.fetch network targets; predicate gaps across delivery/payment/validation/fulfillment; no cartTransform MERGE; priceEnding unenforceable.
7. STOREFRONT — compiler emits app-BLOCK only; can NEVER emit app-embed (site-wide overlays/popups + head/JSON-LD/pixel/consent unshippable); THEME_PLACEABLE omits metaobject/customer templates; native-section.ts drops section groups + ignores disabled_on; proxy.widget no full-page/routed subpath.
8. MESSAGING/FLOW/INTEGRATION/AGENTIC — sms/push needs_runtime (no connector); no multi-step drip; flow emits no flow_trigger/action/template CLI extension + durable engine not wired to live path; httpSync full AUDIT no-op; agentic mcp/agent-profile/sponsored-products not shipped.

## buildsNeededBeforeAuthoring (the program) — reconciled with completed builds
0. **FALSE-PUBLISHED integrity fix (BLOCKS ALL):** stop AUDIT no-op compilers (checkout.block, postPurchase.offer, integration.httpSync, platform.extensionBlueprint, admin.discountUi) flipping status→PUBLISHED; gate PUBLISHED behind a real deployable artifact; fix `'pass'`≠`'PASS'` casing. Hard prerequisite.
1. ADMIN real-extension emit (Preact/Polaris s-* bundle + toml + missing targets + print/link/settings types).
2. CHECKOUT renderer + toml (register 30 targets, branch by target, interactive fields, protected-customer-data Level 2).
3. CUSTOMER-ACCOUNT build (real UI extension scaffold, widen to 23 targets, interactive+data-bound kinds, Customer Account/Order API binding).
4. POS runtime build (real pos compiler via CLI templates, Preact module + toml + deployable bundle, event.observe, action/data pack, staff-PIN gate).
5. FUNCTIONS build (localPickup + pickupPoint crates; superapp-order-routing crate; .generate.fetch targets; widen predicates; cartTransform MERGE; priceEnding via cart-transform).
6. STOREFRONT build (app-embed emit path body/head/compliance_head; THEME_PLACEABLE + metaobject/customer templates; custom.<name> groups; thread section groups + disabled_on into native-section.ts; proxy.widget full-page/routed subpath).
7. MESSAGING/FLOW/INTEGRATION/AGENTIC build (Twilio SMS + web-push connectors; wire durable scheduler to live path + drip presets; flow_trigger/action/template CLI extensions + marketing-activity; httpSync webhookSubscriptionCreate + connector dispatch + product_feeds; agentic mcp-endpoint + agent-profile + sponsored-products + agents.md.liquid).

**Already landed this session (partial credit against the above):** Theme Edit native-section emit (`dc3778bd`, part of #6) · placement threading for app-block surface-targeting (in flight, part of #6/#7-storefront) · `functions.shippingDiscount` crate (`47801a3`, part of #5). Remaining #6 storefront = app-embed + THEME_PLACEABLE + native groups/disabled_on.

## Decision pending
Depth/sequencing of builds #0–#7 + authoring is a user-owned fork (see chat). Build #0 (integrity fix) proceeds regardless, first, once placement threading commits.
