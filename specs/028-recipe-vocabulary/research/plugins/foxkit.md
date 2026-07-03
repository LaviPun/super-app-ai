# FoxKit: All‑in‑one Upsell & CRO (FoxeCom)

> Research record for the recipe-vocabulary study. Facts labeled **confirmed** (from App Store listing, FoxeCom docs, or reviews) or **(inferred)** (deduced from feature behavior / Shopify platform constraints, not explicitly stated).
>
> **Rename note (confirmed):** The App Store listing now presents as **"FoxKit AIO Upsell Cross‑sell"** / **"FoxKit: Upsell & Bundles App"**. Marketing pages also call it **"FoxKit: All‑in‑one Sales Boost."** Same vendor (FoxEcom), same app handle (`apps.shopify.com/foxkit`), same product — no merge or deprecation. The "All‑in‑one Upsell & CRO" name in the task is a marketing descriptor of the current app, not a dead product. Positioning has shifted over time from "sales boost toolkit" toward "upsell / cross‑sell / bundles" to fit the App Store category, but the feature set is a superset of both.

## identity
- **name:** FoxKit AIO Upsell Cross‑sell (listing title); also marketed as "FoxKit: All‑in‑one Sales Boost" / "FoxKit: Upsell & Bundles App" — **confirmed**
- **vendor:** FoxEcom (FoxeCom), San Jose, CA, US — **confirmed**
- **category:** Upsell and cross‑sell (primary); Product bundles (secondary); listed under Marketing and conversion — **confirmed**
- **App Store URL:** https://apps.shopify.com/foxkit — **confirmed**
- **rating:** 4.9 / 5 — **confirmed** (aggregators showing "5.0 / 163" are stale/partial mirrors; App Store listing itself shows 4.9)
- **review count:** ~373 reviews (98% five‑star) — **confirmed** (App Store, mid‑2026)
- **install signal:** Free to install; one aggregator cited ~8,579 installs — **(inferred)** for exact number; Shopify does not publish install counts. "Built for Shopify" badge earned — **confirmed**
- **pricing model:** Freemium, monthly recurring + metered caps — **confirmed**
  - **Free** $0 — limited features, email support
  - **Starter** $19/mo — all features, 3,000 pop‑up impressions/mo, 300 restock‑alert emails, all‑time analytics, 14‑day trial
  - **Growth** $49/mo — all features, 100,000 pop‑up impressions, 1,000 restock emails, custom sender email
  - **Enterprise** $99/mo — unlimited features/analytics, unlimited pop‑up impressions, 5,000 restock emails, priority support
  - Metered caps (pop‑up impressions, restock emails) gate the paid tiers — **confirmed**

## surfaces
FoxKit is a **multi-surface bundle app**, not a single widget. It spans the storefront theme, cart, checkout, post‑purchase, and admin, with a shared backend for offers, subscribers, and analytics. Mapped to our internal extension-type allowlist:

- **theme.section** — **confirmed.** The bulk of FoxKit renders as Theme App Extension app blocks/embeds injected via the theme editor: product-page upsell, volume discounts / quantity breaks, product bundles / FBT / related products, countdown timer, stock scarcity, size chart, sales-notification social-proof popup, back-in-stock button, sticky cart, mega menu, pre-order button, variant group images. Merchant places each via "Add block/section" in the theme editor.
- **proxy.widget** — **(inferred).** Pop‑up, lucky wheel, sales notifications, and free‑shipping bar behave as globally-injected app-embed overlays reading config from FoxKit's backend at runtime (App Proxy / app-embed script), independent of a specific theme section slot.
- **functions.discountRules** — **confirmed (mechanism).** Volume/tiered discounts and bundle discounts are applied as real cart discounts; the free-shipping goal explicitly notes it uses a **"Shopify function"** as the default discount method. Quantity-break / bundle / tiered pricing → Shopify Discount Functions.
- **functions.cartTransform** — **(inferred).** Bundle pricing and "add recommended product with X% off" in-cart likely rely on cart-transform or discount functions to reprice/merge lines; not explicitly named for bundles.
- **functions.deliveryCustomization** — **confirmed (optional).** Free-shipping goal offers an alternative "configure shipping rates based on order value" method — a delivery/shipping-rate customization path in addition to the discount-function path.
- **checkout.upsell** — **confirmed.** Checkout upsell is listed as a customization surface (Shopify Plus checkout UI extension) — recommended products injected into the checkout steps.
- **postPurchase.offer** — **confirmed.** Post-purchase is listed as a rendering location / offer surface (thank-you / post-purchase page offer).
- **admin.block / admin.action** — **(inferred).** All configuration lives in the embedded admin app (offer editors, analytics dashboard, subscriber lists, translations). This is the app's own admin UI rather than merchant-resource admin blocks, but it is the admin surface.
- **analytics.pixel** — **(inferred).** Click-through, conversion, and funnel analytics per offer imply event tracking injected on storefront/checkout (web pixel or app-embed tracking script).
- **flow.automation** — **confirmed (integration).** Listed as compatible with Shopify Flow; back-in-stock restock alerts are an automated email trigger (queue → send on inventory replenish).
- **customerAccount.blocks / pos.extension / functions.paymentCustomization** — **unknown / not offered** — no evidence FoxKit renders in customer accounts, POS, or customizes payment methods.

**Cross-surface coordination (confirmed + inferred):** A single shared backend holds Offers, Subscribers, Discounts, and Analytics. Examples of handoff:
- Lucky Wheel / Pop‑up captures an email + issues a Shopify discount code, writes the subscriber to FoxKit subscriber list (and/or Klaviyo/Mailchimp/Omnisend/SendGrid), and can **auto-apply the won coupon at checkout** — a storefront-overlay → checkout handoff via shared code/session — **confirmed**.
- In-cart upsell keeps its discount applied "even if the targeted product is later removed" — the offer's discount state persists in cart independent of the trigger line — **confirmed**.
- Free-shipping goal reads cart total (total vs subtotal) and drives a discount function or shipping-rate rule — cart state → function handoff — **confirmed**.
- Back-in-stock: storefront button captures subscriber → inventory watcher → automated email → analytics — a queue/background-job handoff — **confirmed** (behavior), **(inferred)** (job mechanism).

## functional_model
Core entities (names normalized; shapes are **(inferred)** from settings unless noted):

- **Offer** = `{ id, type: (in_cart_upsell | product_upsell | checkout_upsell | post_purchase | volume_discount | bundle | fbt | related | free_shipping_goal | countdown | flash_sale | stock_scarcity | size_chart | pre_order | variant_group_images), title, active, targeting, discount_ref, display_style, content, placement }` — the central polymorphic record; nearly every feature is an "Offer" variant — **confirmed** the pattern from consistent Active/Title/Target-to/Discount/Style shape across editors.
- **Targeting** = `{ scope: (all_products | specific_products[] | specific_collection), product_refs[], collection_ref }` — reused across upsell, volume discount, countdown, bundles — **confirmed**.
- **DiscountConfig** = `{ enabled, type: (percentage | fixed_price | flat | free_shipping), value, applied_via: (shopify_function | shipping_rate) }` — **confirmed**.
- **Tier (volume/quantity break)** = `{ quantity_min, discount_value, discount_type: (fixed_price | percent), highlight: bool ("Most popular") }` — list under a volume-discount Offer — **confirmed**.
- **Bundle** = `{ title, active, items: [{ product_ref, variant_selection, quantity }], show_all_variants, targeting, discount_ref, layout_template, default_selected }` — **confirmed**.
- **Popup / LuckyWheel** = `{ type, active, trigger, frequency, display_conditions, form_fields[], design, success{ discount_code_ref, message }, data_destinations[] }`; LuckyWheel adds `prizes: [{ name, bg_color, discount_code_ref, win_probability }]` — **confirmed**.
- **FormField** = `{ key: (email|first_name|last_name|phone|birthday|agree_terms), label, required, order }` — drag-reorderable — **confirmed**.
- **Subscriber** = `{ email, first_name?, last_name?, phone?, birthday?, source_offer, consent, created_at }` stored in FoxKit subscriber list and/or synced to Shopify customers + ESPs — **confirmed**.
- **RestockAlert** = `{ subscriber_email, product_ref, variant_ref, status: (waiting|notified), created_at }` — inventory watcher → email — **confirmed** (behavior). **Sunset note:** Back-in-stock alerts were flagged for deactivation 2025-05-01 with the restock/subscription email path migrating to a sibling FoxeCom app **"XFlow"** — the automation/subscription data model is being spun out of FoxKit — **confirmed**.
- **SalesNotification** = derived from a **synced real Shopify Order** = `{ customer_name, location, product_ref, time }` (populated via `{{name}} {{location}} {{time}}` variables) — real purchases, NOT synthetic/fake notifications; merchant sets number of orders to sync + manual/auto sync — **confirmed**.
- **Discount code** = Shopify native discount referenced by code (created in Shopify Discounts or entered as text) — **confirmed**.
- **Translation** = per-string localized copy keyed to feature content — **confirmed** (Translation section exists).
- **AnalyticsEvent** = `{ offer_id, type: (impression|click|conversion), value, ts }` → funnel/CTR/conversion reports — **(inferred)** shape.

## settings_taxonomy
The single most important section. Grouped under the five headings. Knob names are quoted from FoxeCom docs where possible.

### content
- **Offer name / Title** — text (internal label, per offer)
- **Offer heading** — text, supports `{product_title}` variable (in-cart upsell) — **confirmed**
- **Bundle heading** — text
- **'Add to cart' button label** — text (upsell, bundle)
- **Pop‑up Title / Description** — text
- **Button Label** — text (popup CTA)
- **Consent Disclaimer** — rich text (popup/wheel)
- **Discount Code** — text or picker (select existing Shopify discount) for success screen
- **Copy Button Label** — text (default "Copy")
- **Thank You Message / Win screen title / Win screen subtitle / Lose label / Continue button / Discount code label / Note** — text fields (lucky wheel + popup success)
- **Motivational message** / **Reached message** — text (free-shipping goal, pre- and post-goal)
- **Countdown title** — text
- **Custom Information Fields** — text with pre-defined variables (volume discounts rich layout)
- **Size chart content** — table/rich text — **(inferred)**
- **Prize name** — text per lucky-wheel segment
- **Field Label** — text, per form field
- **Banner / Popup Image** — image upload (drag-drop)

### style
- **Card style** — select [Style 1, Style 2] (in-cart upsell)
- **Layout Selection** — select [Standard, Rich, Cards] (volume discounts)
- **Design template** — select (bundles: 5 layout options, some Growth/Enterprise-gated)
- **Pop‑up Template** — select [No image, Image top, Image left, Image left padded]
- **Countdown style** — select (styles not enumerated in docs)
- **Image ratio** — select [Adapt to product image, Square, Portrait, Landscape] (upsell, bundle)
- **'Add to cart' button style** — select [Text, Icon]
- **Container Width** — number/slider (px, desktop; mobile auto)
- **Text Color / Button Color / Background Color / Teaser Color** — color pickers (popup)
- **Popup background color / Text color / Button color** — color pickers (lucky wheel)
- **Background color** — color picker per lucky-wheel prize segment
- **Highlight** — toggle → renders tier as "Most popular" badge (volume discount)
- **Custom CSS** — text/code (global) — **confirmed** (listed feature)
- **Variant Selector** — toggle (Rich layout only, volume discounts)
- **Hide 'Add to cart' Button** — toggle (Cards layout only, volume discounts)

### targeting
- **Target to / Display On** — select [All products, Specific products, Specific collection] (upsell, volume discount, countdown, bundle)
- **Recommended products** — product/collection picker (in-cart upsell)
- **Product browser/picker** — multi-select product picker (bundles, upsell)
- **Show all product variants** / **Variant selection** — toggle (bundle)
- **Display Condition** — rule-builder: All pages / Home page only / custom with operators [Is equal to, Is not equal to, Contains, Does not contain] against page type or URL (popup, lucky wheel)
- **Show on Mobile** — toggle (popup, lucky wheel)
- **Based price** — select [Total price, Subtotal price] (free-shipping goal targeting logic)
- **Flash Sale** targeting — requires Fixed-time + Specific-collection (countdown)
- **Physical-products-only** constraint — implicit eligibility (free-shipping goal) — **confirmed**

### behavior
- **Active** — toggle (every offer)
- **Trigger** — select [After page load, After specific time (seconds), After scroll depth, Exit-intent (desktop only), Manual trigger only] (popup, lucky wheel)
- **Display Frequency** — select/rule (repeat schedule; stops showing to converted customers)
- **Enable slider control** — toggle (in-cart upsell carousel in cart drawer)
- **Selected by default / Selected by default toggle** — toggle (bundle item pre-checked)
- **Show quantity selector** — toggle (bundle)
- **Countdown Type** — select [Fixed time, Evergreen (repeat)] + **Start date/time** — datetime
- **Discount method (GLOBAL, app-level Settings)** — select [Shopify Functions (recommended, native automatic discount), Discount Code (one-time codes created in Shopify backend), Draft Order (order placed on customer's behalf with adjusted pricing)] — this single setting determines how EVERY offer's price effect is materialized at checkout — **confirmed**
- **Discount method (free-shipping goal)** — select [Shopify function (default), configure shipping rates by order value]
- **Active discount** — toggle + percentage/fixed selection (in-cart upsell, bundle)
- **Discount Type** — select [Fixed price discount, % off] (volume tiers, bundle)
- **Quantity / Discount** — number pairs per tier; **Add more** button to append tiers
- **Allow play multiple times with same email?** — toggle (lucky wheel)
- **Auto apply coupon on checkout page** — toggle (lucky wheel → checkout handoff)
- **Win probability / odds** — percentage per prize (lucky wheel)
- **Required field** — toggle per form field; **drag-and-drop reordering** of fields
- **Add more field** — button to append form fields [First name, Last name, Phone, Birthday, Agree to terms]
- **Teaser Button** — toggle + visibility [Always / after close] + Position [Middle left, Middle right, Bottom left, Bottom right] + Title
- **Custom placement** — code-snippet insertion vs default auto-position (free-shipping goal, bundle via theme editor)

### data
- **Data Collection destination** — select/multi [Shopify customers list, FoxKit subscribers list, Klaviyo, Mailchimp, Omnisend, SendGrid] (popup, lucky wheel)
- **Custom sender email** — text (notifications; Growth/Enterprise only) — **confirmed**
- **Pop‑up impressions cap** — plan-metered (3k / 100k / unlimited) — read-only quota
- **Restock alert emails cap** — plan-metered (300 / 1,000 / 5,000) — read-only quota
- **Analytics** — per-offer read-out: impressions, unique impressions, clicks, CTR, add-to-cart events, conversion rate, checkout initiations, total orders, total sales/revenue, AOV; for email offers also subscribers + open/delivery/bounce/unsubscribe rates. Segmentable by **device** and **country**. Reports are per-feature (bundles, volume, pre-orders, popups, back-in-stock, lucky wheel, size chart) rather than one unified funnel — **confirmed**
- **Discount code source** — select existing Shopify discount or enter code text
- **Translation** — per-string localized values (Translation section); Multi-language + Multi-currency toggles — **confirmed**
- **Subscribers management** — export/list view of captured leads — **confirmed**

## data_model
- **Persisted in FoxKit's own external DB (app backend), not merchant Shopify data** — **(inferred)** but strongly implied:
  - **Offers / campaigns** (all feature configs), **Tiers**, **Bundles**, **Popup/Wheel configs**, **AnalyticsEvents** (impression/click/conversion counters, funnel data), **usage meters** (pop-up impressions, restock emails).
  - **Subscribers list** ("FoxKit subscribers list") — captured emails + custom fields + consent — **confirmed** entity, external store.
  - **RestockAlert queue** — pending back-in-stock watchers keyed to variant inventory — **confirmed** behavior; background inventory watcher + email sender.
- **Written back into Shopify:**
  - **Discounts** — Shopify native discount codes / **Discount Functions** (free-shipping goal explicitly uses a Shopify function); volume/tiered/bundle pricing applied as Shopify discounts — **confirmed**.
  - **Shipping rates** — optional order-value-based rate customization (free-shipping alt path) — **confirmed**.
  - **Customers** — subscribers optionally synced to Shopify customers list — **confirmed**.
  - **Theme** — Theme App Extension blocks stored in theme settings when merchant places widgets — **confirmed**.
- **External syncs (ESPs):** Klaviyo, Mailchimp, Omnisend, SendGrid receive captured subscribers — **confirmed**.
- **Media/CDN:** popup banner images, size-chart images, variant group images uploaded and served (likely FoxKit CDN or Shopify Files) — **(inferred)**.
- **Metaobjects/metafields:** possible for pre-order / bundle definitions — **unknown** (not documented).

## visual_patterns
- **Layout archetypes:** (1) product-page inline widget cards (upsell, volume-discount tier cards, bundle FBT rows, size chart accordion); (2) cart-drawer carousel (sliding recommended-product cards, progress bar); (3) modal overlays (popup, lucky wheel — a spinning-wheel canvas with radial segments, win/lose screens); (4) sticky/floating elements (free-shipping bar, teaser button, sticky cart, sales-notification toast bottom-corner); (5) countdown/urgency strips (timer digits, stock scarcity meter, flash-sale sold-progress bar); (6) mega-menu navigation panel.
- **Component states:** offer Active/inactive; tier default vs "Most popular" highlighted; bundle item selected-by-default / deselected; popup pre-submit form → success/thank-you → win/lose branch; countdown running → expired (end behavior); restock button "notify me" → "subscribed"; add-to-cart Text vs Icon; free-shipping pre-goal (motivational) vs reached (celebration) message.
- **Motion/interaction:** slider/carousel control in cart drawer; drag-and-drop form-field reordering in admin; lucky-wheel spin animation with weighted odds; progress-bar fill toward free-shipping goal; countdown tick; teaser button slide-in; exit-intent trigger; scroll-depth trigger; one-click add-to-cart from upsell/bundle; copy-code button feedback.
- **Style controls are template-driven** (numbered "Style 1/2", named "Standard/Rich/Cards", template galleries) rather than free-form — merchants pick a template then tune colors/copy/ratio.

## reviews_signal
**Top praises (confirmed, App Store 4.9/373):**
1. **Customer support** — fast, responsive, agents named personally (e.g. "Linh"); most-cited positive.
2. **Ease of setup / no-code** — professional results without a developer; intuitive editors.
3. **All-in-one breadth** — one app replaces several (upsell, cross-sell, bundles, volume discounts, popups) — cost consolidation.
4. **AOV / revenue lift** — merchants report measurable order-value and conversion gains.
5. **Performance + theme compatibility** — "doesn't slow the site," works across themes, "Built for Shopify."

**Top complaints (confirmed, but sparse — <2% non-5-star):**
1. **Occasional feature reliability** — "Variant Group Images" sometimes fails to display / occasional slowness on that feature.
2. **Metered caps on lower tiers** — pop-up impression / restock-email limits push higher-volume stores to Growth/Enterprise — **(inferred)** from pricing structure; not a loud review theme.
3. Very few substantive negatives surfaced publicly; failure modes are edge-feature glitches rather than core-flow breakage.

## mapping_note
FoxKit is a **multi-module blueprint**, not a single RecipeSpec. Mapping onto our constrained vocabulary:

- **Fits single-module recipes:** each individual widget (product-page upsell card, volume-discount tier card, size chart, countdown timer, sales-notification toast, free-shipping bar) maps cleanly to a `theme.section` / `proxy.widget` recipe with a settings schema of the content/style/targeting knobs above. These are the "recreatable-in-one-module" pieces.

- **Where it EXCEEDS a single module (the gaps):**
  1. **Requires a persistent external data store + background jobs.** Subscriber lists, restock-alert queues (inventory watcher → deferred email send), pop-up impression / restock-email usage metering, and per-offer analytics events cannot live in a stateless generated module — they need a backend DB, a job runner, and quota accounting.
  2. **Real Shopify Functions / cart-transform side-effects.** Volume/tiered/bundle discounts, the free-shipping goal, and "auto-apply won coupon at checkout" require deployed Discount Functions (and optionally delivery-rate customization) that mutate cart pricing — external side-effects beyond rendering a section. A recipe that only emits Liquid/theme UI can't reprice the cart.
  3. **Cross-surface blueprint with shared state / handoff.** A lucky-wheel/popup captures a lead on the storefront, issues a Shopify discount, syncs to an ESP, and re-applies that discount at checkout — coordinated theme + proxy-widget + checkout + admin surfaces sharing one offer/discount/subscriber record. That's a `composeBlueprint` of ≥4 extension types, not one recipe.
  4. **A targeting/rule engine + external integrations.** Reusable rule-builder targeting (page-type/URL operators, product/collection scope, trigger + frequency logic) and outbound ESP syncs (Klaviyo/Mailchimp/Omnisend/SendGrid) plus Shopify Flow are engine-level, side-effecting concerns that exceed a self-contained module's schema.
