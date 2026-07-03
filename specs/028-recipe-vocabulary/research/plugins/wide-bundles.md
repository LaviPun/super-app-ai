# Wide Bundles ‑ Quantity Breaks (WideBundle)

> Research record for recipe-vocabulary study. Facts labeled **confirmed** (from
> App Store listing, vendor site en.widebundle.com, vendor helpdesk, or review
> aggregators) or **(inferred)** where the exact mechanism is not documented publicly.
>
> **Naming note (confirmed):** The plugin the brief calls "Wide Bundles Volume
> Discount" is listed on the Shopify App Store as **"Wide Bundles ‑ Quantity
> Breaks"** (product/brand name **WideBundle**), handle `widebundle`. Same app, not
> renamed/deprecated. It is a single-vendor indie app (Mat De Sousa / "The Wide
> Company"), NOT a Bold app — the brief's Bold caveat does not apply. "Volume
> discount" is one of several offer types it supports, not the product name.

## identity
- **name:** Wide Bundles ‑ Quantity Breaks (brand: WideBundle) — confirmed
- **vendor:** Mat De Sousa ("The Wide Company" / thewidecompany.com) — confirmed
- **category:** Bundles — Shopify taxonomy: "Product bundles" + "Marketing and conversion → Upsell and bundles" — confirmed
- **App Store URL:** https://apps.shopify.com/widebundle — confirmed
- **rating:** 4.8 / 5 — confirmed (as of Jun–Jul 2026)
- **review count:** ~272–273 reviews on the App Store — confirmed. (One search snippet cited "748 reviews"; not corroborated by direct listing fetches, which show 272–273. Treat 272–273 as the reliable figure; 748 (inferred) may be a stale or cross-aggregator number.)
- **rating distribution:** 92% 5★ (249), 3% 4★ (8), 1% 3★ (4), 0% 2★ (1), 4% 1★ (10) — confirmed
- **install signal:** Not published as a raw install count on the listing. Signals: "Built for Shopify" quality badge; one merchant reports "using Wide Bundle for over 5 years across all my Shopify stores"; tracked by StoreLeads. High install base (inferred) — mature indie app with 5+ yr history and 7-language localization. Exact count: unknown.
- **pricing model:** Recurring monthly subscription, **revenue-capped tiers** (this is the distinctive axis). Confirmed:
  - Development Stores — **Free**, all features
  - **Basic $14.99/mo** — up to $500 additional revenue
  - **Standard $19.99/mo** — up to $1,000 additional revenue
  - **Advanced $24.99/mo** — up to $2,000 additional revenue
  - All paid plans: unlimited bundles, 100+ customization options, A/B test, all features, 7/7 live chat. 14-day free trial. Billed USD every 30 days.
  - Note: tier gate is **attributed-revenue**, not feature count — so the app must meter revenue it drives per billing period. (inferred: overage/attribution measured server-side against bundle orders.)

## surfaces
Mapped to internal extension-type vocabulary:

- **theme.section** (primary, confirmed) — the bundle/offer **widget** renders on the **product page** (also supports a featured product on the homepage). Delivered as a theme app extension / app block (inferred; vendor docs say "Settings & Design" panel controls it and it integrates without touching code, and separate articles cover "add a variant selector in my theme"). Shows: stacked offer cards (e.g. "Buy 1 / Buy 2 / Buy 3"), each with title, image, price, price-per-unit, "You save $X" savings text, "Best Offer" badge, option labels (color swatches / dropdowns), custom sentences, optional quantity button, and the add-to-cart button.
- **checkout.upsell / checkout** (partial, confirmed integration point) — for **discount-based** bundles the discount is "applied at checkout." Listed integration: "Checkout." It does not render a full checkout UI extension of its own (inferred); it relies on Shopify discount application. Custom cart label configurable ("Change the discount code label in cart").
- **functions.discountRules** (inferred) — discount-based mode applies a cart/checkout discount. Mechanism is likely an automatic discount / Shopify Function or a script-driven discount rather than merchant-entered codes ("We don't use discount codes so you can still use them at checkout" — merchant coupon field stays free). Exact primitive (automatic discount vs discount Function vs draft-order pricing) not publicly documented → (inferred).
- **admin.block / admin app** (confirmed) — full embedded admin app: bundle CRUD, "Settings & Design" panel (100+ options), targeting, A/B test setup, analytics dashboard ("Analytics to show how much you earned with your bundles"). Integration "Shopify Admin" listed.
- **analytics.pixel** (inferred) — revenue-attribution analytics + revenue-capped billing imply order/conversion tracking of bundle-attributed sales. Whether via Web Pixel or order webhooks is not documented → (inferred).
- **NOT a surface:** no POS extension, no customer-account block, no post-purchase page, no delivery/payment customization, no Flow automation advertised.

**Cross-surface coordination (confirmed + inferred):** Two coexisting architectures the merchant chooses per bundle:
  1. **Variant-based** — the app **creates a new product option named "Offer"** and generates a **variant per bundle tier** (each with its own SKU, real inventory). The theme widget then *replaces the native variant selector* and drives selection into add-to-cart. No checkout discount needed — the price IS the variant price. Handoff: theme widget → variant id → native cart/checkout.
  2. **Discount-based** — the widget adds the underlying products to cart and a **discount is applied at checkout**; the offer title can be relabeled in cart. Handoff: theme widget → cart line items → checkout discount.
  The admin app is the source of truth; it writes variant/option data (variant mode) or discount config (discount mode) that the storefront widget reads and the checkout honors. This product-catalog mutation is the crux of why it exceeds a pure "render a section" module.

## functional_model
Core entities (names partly (inferred) from behavior; structure confirmed by docs):

- **bundle / group** = { name, targeting (product_ref[] | collection_ref | homepage_featured), mode: `variant_based` | `discount_based`, design_theme (1 of 6 structures), offers: offer[], preselected_offer_index, ab_test_ref? }
- **offer (a.k.a. tier / bundle card)** = { title (text), products: offerProduct[] (up to **4 distinct products**), discount: { type, value }, savings_display, badge_text ("Best Offer"), custom_sentences: string[] (up to 10 total per bundle), price_per_unit_flag, position } — up to **3 offers** typical (1–3 products/offers structure), but "unlimited bundles" per store.
- **offerProduct** = { product_ref, variant_ref?, quantity (1–**10**), option_display: swatch | dropdown }
- **discount** = { type: `percentage` | `flat` | `fixed_price` | `bogo` | `gift`/free_product | `tiered`, value } — confirmed offer types: volume, quantity break, tiered, BOGO, mix-&-match, fixed-price, gift.
- **generated variant** (variant_based only, inferred) = { option "Offer" value, sku, inventory, price } — a real Shopify ProductVariant the app provisions on the merchant's products.
- **ab_test** = { variant_a bundle, variant_b bundle, traffic split, winning metric = sales } — confirmed feature; internals (inferred).
- **analytics_record** (inferred) = { bundle_ref, attributed_orders, attributed_revenue, period } — drives dashboard + revenue-cap billing.
- Relationships: bundle 1─N offers; offer 1─N offerProducts (≤4); offer 1─1 discount; bundle N─M target products/collections; bundle (variant mode) 1─N generated variants on target product; bundle 0─1 ab_test.

## settings_taxonomy
The actual merchant-facing controls. THE core section. Grouped under the five headings.

### content
- **Bundle name** — text (admin-internal)
- **Offer count / structure** — select (1, 2, or 3 offers; "6 different structures/themes" for layout) — confirmed
- **Offer title** (per offer) — text (e.g. "Buy 2 & Save") — confirmed
- **Products in offer** — product-picker, multi (up to 4 distinct products) — confirmed
- **Quantity per product** — number (1–10) — confirmed
- **Savings text / "You save $X"** — toggle + auto-computed text — confirmed
- **"Best Offer" badge** — toggle + text, assignable to a chosen offer — confirmed
- **Custom sentences** — text[], up to 10, to highlight bundles (e.g. "Free shipping", "Most popular") — confirmed
- **Price per unit** — toggle (show per-unit price instead of full price) — confirmed
- **Option labels** — text (labels for color/size options surfaced in widget) — confirmed
- **Cart label / discount code label in cart** — select (offer title | product title | both) — confirmed
- **Heading / bundles heading text** — text — confirmed

### style
- **Widget theme / structure** — select (6 preset structures) — confirmed
- **Selected vs unselected bundle card** — dual-state styling of: color, background, size, font, style, radius — confirmed
- **Bundle card elements styling** — title, price, image, options each customizable per state — confirmed
- **Color swatches vs dropdowns** — toggle (swatches instead of dropdown for color/variant options) — confirmed
- **Add-to-cart button** — text, background color, font, icon, size — confirmed
- **Heading** — color, position, size, style — confirmed
- **Heading line decoration** — color + size — confirmed
- **Quantity button design/colors** — color controls (when quantity button enabled) — confirmed
- **Currency / decimal separator / price rounding** — select/toggle ("automatically round prices or not", decimal separator) — confirmed
- **Text direction** — select (left / right, RTL support) — confirmed
- **Custom HTML / CSS** — text (advanced) — confirmed
- "100+ customization options" umbrella — confirmed

### targeting
- **Scope** — select: specific product(s) (product-picker) | entire collection (collection-picker) | homepage featured product — confirmed
- **Bundle mode** — select: variant-based | discount-based — confirmed
- **Preselected offer** — select (which offer is highlighted/selected on page load) — confirmed
- **A/B test assignment** — rule/config (bundle A vs bundle B, split) — confirmed
- Localization/market targeting — "Translate the widget with Shopify Market" — confirmed

### behavior
- **Discount type** (per offer) — select: percentage | flat | fixed price | BOGO | free gift | tiered/volume — confirmed
- **Quantity button** — toggle ("allow customers to purchase more than one bundle") + styling — confirmed
- **Add-to-cart redirection** — select: cart drawer | cart page | checkout — confirmed
- **Preselect on load** — toggle — confirmed
- **Round prices** — toggle — confirmed
- **Integration behavior** — works alongside upsell/cart-drawer/page-builder/COD apps (GemPages, PageFly, Monster Upsells, EasySell, Releasit) — confirmed
- Language — select (EN/FR/ES/IT/DE/PT-BR/PT-PT/SV) — confirmed

### data
- **Variant provisioning** (variant mode) — the app creates an "Offer" product option and generates real variants w/ SKU + inventory on target products — confirmed (behavioral)
- **Discount config** (discount mode) — stored server-side, applied at checkout — confirmed
- **A/B test config + results** — persisted — confirmed
- **Analytics / attributed revenue** — persisted, shown in dashboard, drives billing tier — confirmed
- **Copy offers between products** — action (bulk-copy an offer set to another product; June 2025 changelog fixed a gift-copy bug) — confirmed

## data_model
What it persists and where:
- **Merchant product catalog (Shopify)** — in variant-based mode it **mutates the merchant's own products**: adds an "Offer" product option and one **ProductVariant per bundle tier** (real SKU + inventory levels). This is Shopify-native product data, not the app's private store. — confirmed (behavioral); several 1★ reviews confirm it edits/creates/deletes variants.
- **App's own datastore (external DB / hosted backend)** — bundle definitions, offer/product mappings, per-tier discounts, all design settings (100+), targeting rules, A/B test config + outcomes, translations, analytics/attributed-revenue counters. (inferred: standard hosted backend for a non-embedded-only app.)
- **Discounts at checkout** — discount-based mode applies an automatic discount / function-driven price adjustment (not merchant coupon codes) — confirmed intent, (inferred) exact primitive.
- **Theme app extension assets** — widget block + settings surfaced through "Settings & Design"; likely reads bundle config via app proxy or embedded block data — (inferred).
- **Metaobjects/metafields** — plausibly used to bind config to products/theme — unknown (not documented).
- **Media/CDN** — offer images are the products' own Shopify images (product-picker driven); no separate media library evident — (inferred).
- **Codes** — deliberately avoids discount codes ("we don't use discount codes so you can still use them at checkout") — confirmed.

## visual_patterns
- **Layout archetype:** vertical stack of 2–3 **selectable offer cards** ("radio-card" pattern) on the product page, replacing the native variant selector. Each card = title + product image(s) + price / price-per-unit + "You save $X" + optional "Best Offer" ribbon/badge + custom sentence line. One card preselected/highlighted. Below: option controls (swatches or dropdowns) + optional quantity stepper + full-width add-to-cart button. — confirmed
- **6 preset structures/themes** as starting layouts; every color/font/shape/radius tunable. — confirmed
- **Component states:** selected vs unselected card (distinct color/background/border-radius/font); hover states on background; badge shown/hidden; swatch selected/unselected; quantity button present/absent. — confirmed
- **Motion/interaction:** click-to-select card → updates price + selected variant → drives add-to-cart; add-to-cart redirect (drawer slide-in / cart page / straight to checkout). Swatch click updates option. Preselected offer animates/highlights on load. — confirmed (behavioral), motion specifics (inferred).
- **Responsive:** "mobile first" optimization advertised. — confirmed
- **Integration surfaces:** designed to nest inside page-builder sections (PageFly/GemPages) and hand off to third-party cart drawers. — confirmed

## reviews_signal
**Top merchant praises (defines up-to-the-mark):**
1. **AOV lift** — repeated concrete gains ("increased my AOV from 20€ to 70€"). — confirmed
2. **Exceptional 7/7 live-chat support** — most-cited strength ("one of the best I've experienced on Shopify," "super réactif"). — confirmed
3. **Ease of use / intuitive setup** — "hyper intuitive," "very easy to set up," works for beginners. — confirmed
4. **Deep customization** — "énormément d'options," 100+ knobs, matches store branding, integrates with page builders/cart drawers. — confirmed
5. **Longevity / reliability** — multi-year, multi-store loyalty ("over 5 years across all my stores"). — confirmed

**Top complaints (failure modes to avoid):**
1. **Catalog corruption in variant mode** — "DELETED all my variants and replaced them with 3 unusable options"; "messed up my Google product feed and I lost all the reviews"; "creating new variations and ruin it all." The variant-provisioning mechanism is the sharpest risk. — confirmed
2. **Leftover code / offers persist after uninstall** — "I deleted the app, and to my horror, the bundle offers were still there," had to "nuke my entire product page." — confirmed
3. **Breaks with digital products** — "not calibrated to work with digital products," forces shipping/tax. — confirmed
4. **Intermittent disappearance / no add-to-cart** — "randomly just took it off our site" (lost revenue); "people don't even have an add to cart option." — confirmed
5. **Third-party incompatibility (COD)** — doesn't work with COD apps (e.g. Releasit) despite mutual "works together" claims; occasional slow/"pathetic" support in a minority of 1★ reviews (contrasts with majority praise). — confirmed

## mapping_note
Onto our constrained **RecipeSpec** vocabulary, the *storefront rendering* half maps cleanly: the offer widget is essentially a **theme.section** (radio-card selector with content + style + targeting knobs) — that part is recipe-shaped and within a single-module spec's reach (content/style/targeting/behavior settings all have analogues).

Where it **exceeds a single-module recipe**:

1. **Mutates the merchant's product catalog (side-effecting, stateful).** Variant-based mode provisions a new "Offer" product option and a real ProductVariant (SKU + inventory) per tier on the merchant's products — and must reverse those on uninstall (the reviews show it fails here). A single render-only recipe cannot create/own/clean-up catalog data; this needs a data-provisioning + lifecycle/teardown job, not just a spec.

2. **Two-surface, two-mechanism blueprint with a checkout side-effect.** It coordinates a **theme.section** (selector) with either **generated variants** (catalog handoff) OR a **checkout/discount function** (functions.discountRules) that applies price at checkout without codes. That cross-surface storefront-↔-checkout handoff is a blueprint, not one module.

3. **Stateful analytics + revenue-metered billing.** It attributes revenue per bundle and gates its own pricing tiers on that number — requiring a persistent datastore, order/conversion tracking (analytics.pixel or webhooks), and background aggregation. Out of scope for a stateless module.

4. **A/B test engine.** Randomized traffic split across two bundle variants with a "winning by sales" decision loop = a rule/experiment engine + persisted results, beyond a single validated spec.

Net: WideBundle is a **theme.section recipe wrapped around a data store + catalog-provisioning job + checkout discount rule + attribution/AB engine** — the visible widget is recipe-scale, but the machinery underneath (product-variant provisioning with clean teardown, revenue attribution, experiment engine, checkout discount application) is what a single-module RecipeSpec cannot express.
