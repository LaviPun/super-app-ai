# Hextom: Upsell Sales Boost (formerly Ultimate Sales Boost)

> **RENAME NOTE (confirmed):** The app originally listed as **"Hextom: Ultimate Sales Boost"** (internal shorthand "USB") has been rebranded on the App Store to **"Hextom: Upsell Sales Boost — Increase AOV with upsell, bundle, BOGO, countdown and trust."** Same vendor (Hextom), same App Store URL slug (`/ultimate-sales-boost`), same product lineage — the rename repositioned it from a pure urgency/badge widget kit toward an "upsell + AOV" story and layered in newer upsell/bundle/BOGO-cart tooling on top of the classic countdown/badge/label widgets. The classic USB widget vocabulary is fully intact; this is a superset, not a replacement or deprecation. Older docs (GemPages, Foxify, Hextom's own `/application/ultimate-sales-boost/`) still describe the classic widget set and are the most reliable source for exact knob names. This record captures both the classic core and the newer upsell layer.

## identity
- **name:** Hextom: Upsell Sales Boost (formerly Hextom: Ultimate Sales Boost / "USB") — confirmed
- **vendor:** Hextom (Hextom Inc., Toronto, Canada) — confirmed
- **category:** Marketing and Conversion → Countdown Timer + Upsell and Cross-sell. Our study bucket "discounts" is approximate; the app is primarily an urgency/social-proof/badge widget engine with an upsell+BOGO+discount layer bolted on — confirmed
- **App Store URL:** https://apps.shopify.com/ultimate-sales-boost — confirmed
- **rating:** 4.8 / 5 — confirmed
- **review count:** ~1,414–1,415 reviews — confirmed (moves over time)
- **install signal:** Not shown as a hard number on the current listing (Shopify hides raw install counts). Longevity + review volume + "most-trusted apps" vendor positioning implies a large install base, historically cited in the tens-of-thousands range — (inferred)
- **pricing model:** Freemium subscription, tiered by **attributed revenue** and **active campaign count**, 7-day free trial on paid tiers — confirmed. Tiers (confirmed, prices approximate/subject to change):
  - **Free** — $0/mo; ~$200 lifetime attributed revenue cap; 1 active campaign; basic widgets
  - **Starter** — ~$9.99/mo; ~$500/mo attributed revenue; ~5 active campaigns; timers + labels
  - **Growth** — ~$29.99/mo; ~$2,000/mo attributed revenue; unlimited campaigns; geo-targeting
  - **Pro** — ~$79.99/mo; ~$5,000/mo attributed revenue; high-volume support
  - Note: historically the tiers were named Free / Basic / Professional / Enterprise; checkout-page campaigns are gated to Shopify **Plus** and to the top plan. Plan gating attaches to *features* (geo-targeting, scheduling, customer-tag targeting, checkout surface) not just volume — confirmed

## surfaces
The app is a **multi-surface theme-app-extension widget engine**. A single merchant "campaign" chooses a widget type, a target surface, and display rules; the app injects the widget via **theme app extension app blocks / app embeds** (drag-in on OS 2.0 themes; "custom position" anchors on legacy). Coordination across surfaces is **not** shared cart state — each campaign is an independent placement; the shared spine is the **campaign record + attributed-revenue tracking** (a storefront script attributes downstream orders back to the campaign that was shown). Mapping to our allowlist:

- **theme.section** — PRIMARY. Home, collection, and product page widgets (countdown timers, promo messages, trust/payment badges, image labels/stickers, stock inventory numbers, get-it-by timer, BOGO message, add-to-cart button animation) all render as theme-app-extension app blocks placed into sections/product template. This is the dominant surface — confirmed.
- **proxy.widget** — Cart-page and cart-drawer widgets (reserved-cart timer, free-shipping progress message, cart upsell) render as injected storefront widgets outside the section grid; behaviorally an app-served widget on the cart surface — (inferred mapping; the app calls these "cart page campaigns").
- **checkout.block** — Checkout-page campaigns (promo message, countdown timer, trust badges, payment badges on the checkout surface) — **Shopify Plus only**, top plan only. Maps to checkout UI extension blocks — confirmed (Plus-gated).
- **checkout.upsell** — Partial. The newer "upsell / BOGO / bundle / frequently-bought-together" layer targets AOV; on-cart and pre-checkout upsell widgets fit here, though USB's upsell is lighter than a dedicated post-purchase app — (inferred).
- **analytics.pixel** — Behavioral, not a merchant-configured pixel: a storefront tracking script records impressions/clicks and attributes revenue per campaign to drive the plan's "attributed revenue" metering and the in-app CTR/conversion analytics. Maps to our analytics.pixel concept as an internal side-effect, not a Shopify Web Pixel extension — (inferred).
- **admin.block** — The entire configuration lives in an embedded **Shopify admin app** (campaign list, widget editor, targeting, scheduling, analytics dashboard). This is the control plane, not a storefront surface — confirmed.

**How surfaces coordinate:** Loosely. There is no live cross-surface cart handoff. The coordinating primitives are (1) the **campaign** object (one widget + one surface + one rule set) and (2) **attributed-revenue tracking** that links a shown widget to a later order for metering/analytics. A merchant running a "flash sale" typically creates *several* campaigns (product-page countdown + collection sticker + cart free-shipping bar + checkout badge) that share only the sale's intent and schedule, not runtime state.

## functional_model
Core entities (concrete shapes; field names (inferred) from observed UI unless noted):

- **campaign** = { id, name, widget_type (enum), surface (home|collection|product|cart|checkout), status (active|paused|scheduled|expired), plan_gate, priority/sort, created_at } — the top-level unit; plan tiers cap the count of `active` campaigns — confirmed concept.
- **widget** = polymorphic config attached to a campaign, discriminated by `widget_type`. Variants: `message`, `countdown_timer`, `get_it_by_timer`, `bogo`, `stock_inventory`, `trust_badge`, `payment_badge`, `image_label` (sub-types: text | countdown | sales-sticker), `button_animation`, `cart_progress` — confirmed types.
- **countdown_timer** = { mode: one_time | auto_recurring | daily | weekly, start_at, end_at (one_time), duration/recurrence window (recurring/daily/weekly), timezone, on_expire_action (hide | restart | keep-at-zero), digit_style, labels (days/hrs/min/sec), colors, position } — mode enum confirmed; sub-fields (inferred).
- **bogo_rule** = { buy_product/collection_ref, buy_qty (X), get_product/collection_ref, get_qty (Y), message_template } — a "Buy X Get Y" display+message widget, not a Shopify Function discount — (inferred).
- **stock_inventory** = { source: variant_inventory | manual/fake_number, low_stock_threshold, message_template ("Only {n} left!"), scope: product|variant } — confirmed there are `inventory countdown`, `variant inventory countdown`, and `low stock warning` variants.
- **image_label / sticker** = { type: text | countdown | sales_sticker, image_ref | preset, text, anchor (product image corner), size, rotation } — confirmed variants; sticker auto-anchors to product image.
- **display_rule (targeting)** = { pages[], product_tags[], collection_refs[], customer_tags[], customer_total_spent_gt, geo_countries[], shopify_markets[], schedule {start, end, timezone} } — confirmed dimensions.
- **attribution_record** = { campaign_id, impressions, clicks, attributed_orders, attributed_revenue } — drives plan metering + analytics — confirmed concept.

Relationships: `campaign 1—1 widget (polymorphic)`, `campaign 1—1 display_rule`, `campaign 1—N attribution_record (rollup)`. Campaigns are siblings; no parent "sale/event" object binds a multi-surface promo (merchant coordinates manually).

## settings_taxonomy
The most important section. Controls below are the actual merchant-facing knobs, grouped. Types in brackets. Confirmed where a source names the control; (inferred) where the type/options are deduced from the widget's function.

### content
- **Widget type** — `select[ Message, Countdown Timer, Get-it-by Timer, Buy X Get Y (BOGO), Stock Inventory Number, Trust Badge, Payment Badges, Image Label, Sticker, Button Animation, Cart Progress/Free-shipping ]` — confirmed (dropdown drives the whole editor)
- **Message / promo text** — `text` (supports variables/emoji; e.g. "Sale ends in", "Only {n} left", "Free shipping over {amount}") — confirmed
- **Countdown labels** — `text × 4` (Days / Hours / Minutes / Seconds captions) — (inferred)
- **Get-it-by copy** — `text` template with computed delivery date insertion — confirmed (widget exists)
- **BOGO message template** — `text` ("Buy X get Y free") — (inferred)
- **Stock message template** — `text` ("Only {n} left in stock") — confirmed (widget exists)
- **Payment badge caption / message** — `text` (short line beside icons) — confirmed
- **Sticker/label text** — `text` (for text-type image labels) — confirmed

### style
- **Font size** — `number/select` (per widget; explicitly listed for payment badges) — confirmed
- **Badge style** — `select[ Multicolor, Single Color (Black & White) ]` (payment badges) — confirmed
- **Badge sort order** — `sort/reorder` (arrange which payment icons show and in what order) — confirmed
- **Badge size** — `select/number` — confirmed
- **Colors** — `color` pickers for text, background, digits, accents (per widget) — (inferred; standard for these widgets)
- **Digit/timer style** — `select` (flip / plain / boxed style variants) — (inferred)
- **Position / custom position** — `select` preset anchors OR "custom position" free placement "anywhere on the product page"; on OS 2.0 themes placement is via drag-in app block — confirmed ("Custom Position")
- **Image label anchor** — `select` (auto-anchors sticker to product image corner) — confirmed
- **Button animation type** — `select` (Add-to-Cart button animation, Checkout button animation) — confirmed (variants exist)
- **Container spacing / padding** — `number` (exposed in page-builder integrations; app also owns container styling) — confirmed via Foxify note

### targeting
- **Page targeting** — `multiselect[ Home, Collection, Product, Cart, Checkout(Plus) ]` — confirmed
- **Product targeting by tag** — `rule / tag-input` (show only on products with tag X) — confirmed
- **Product / collection selection** — `product-picker / collection-picker` (specific products or collections) — (inferred)
- **Customer targeting by tag** — `tag-input` (show to customers with tag X) — confirmed
- **Customer targeting by total spent** — `number + operator` (e.g. total spent > $N) — confirmed
- **Geo targeting by country** — `multiselect[countries]` — confirmed
- **Shopify Markets targeting** — `multiselect[markets]` — confirmed
- (Plan-gated: geo, customer-tag, and Markets targeting live on higher tiers) — confirmed

### behavior
- **Countdown timer mode** — `select[ One-time, Auto-recurring, Daily, Weekly ]` — confirmed
- **Start date/time** — `datetime` (one-time + scheduling) — confirmed (scheduling exists)
- **End date/time** — `datetime` — confirmed
- **Timezone** — `select` — (inferred)
- **On-expire action** — `select[ Hide, Restart/Recur, Freeze at 00:00 ]` — (inferred)
- **Recurrence window** — `time-range` (daily/weekly modes: active hours/days) — (inferred)
- **Campaign schedule (activation window)** — `datetime range` (when the whole campaign runs) — confirmed
- **Campaign status** — `toggle[ Active / Paused ]` — confirmed
- **Priority / sort order** — `number/sort` (when multiple campaigns could show) — (inferred)
- **Reserved-cart timer duration** — `number` (cart hold urgency timer) — confirmed (variant exists)
- **Low-stock threshold** — `number` (trigger point for warning) — confirmed
- **Fake vs real inventory source** — `toggle/select` (pull live variant inventory vs display a set number) — confirmed (both variants exist)

### data
- **Payment icons selection** — `multiselect/reorder` (which gateways' badges to show) — confirmed
- **Trust badge set** — `select/gallery` (choose from provided trust-badge icon library; "advanced trust badge" adds more) — confirmed (merchants complain the library is limited)
- **Sticker/label image** — `image` upload or preset picker — confirmed
- **A/B test toggle** — `toggle` (run variant test on a campaign) — confirmed (listing mentions A/B testing; plan-gated) (inferred gating)
- **Analytics view** — `read-only dashboard` (impressions, CTR, conversion, attributed revenue, funnel) — confirmed
- **Multi-language content** — `per-locale text` (multi-language support advertised) — confirmed (advertised)
- **Multi-currency display** — `auto` (respects store currency/Markets) — confirmed (advertised)

## data_model
- **Campaign + widget config** persisted in **Hextom's own external database** (app backend), not in Shopify — confirmed by architecture (embedded admin app with its own campaign store). Plan/attributed-revenue metering also lives server-side.
- **Storefront rendering** via **theme app extension** assets (app blocks / app embed) + an injected storefront **script** that fetches active campaigns for the current page/context and renders widgets client-side — confirmed (app-block install flow; custom-position injection).
- **Attribution/analytics** stored server-side per campaign (impressions, clicks, attributed orders/revenue) — confirmed concept.
- **Media** (sticker/label images, trust-badge icons) served from Hextom CDN / uploaded assets — (inferred).
- **No Shopify discount codes / price rules** are created for the core widgets — BOGO/urgency here are *display* constructs, not enforced Shopify discounts. (The newer upsell/discount layer may create Shopify discounts, but the classic widgets do not) — (inferred; classic USB is display-only).
- **No metaobjects/metafields** as the primary store of record — campaign data is external — (inferred).
- **Known residue:** merchants report leftover injected code/anchors after uninstall on legacy custom-position setups — confirmed as a recurring complaint theme.

## visual_patterns
- **Layout archetypes:** inline widget strips (countdown bar, promo message line), badge rows (payment/trust icon grids), corner-anchored image overlays/stickers on product thumbnails, progress bars (free-shipping goal), boxed digit countdowns, small "only N left" inventory chips.
- **Component states:** active (running timer), expiring (near-zero urgency emphasis), expired (hide / freeze / restart per config), paused, scheduled-not-yet-live. Stock widget: normal vs low-stock (color shift, "Only N left").
- **Motion / interaction:** ticking countdown digits (per-second update, flip/plain), pulsing or animated **Add-to-Cart / Checkout button** animation, progress-bar fill as cart total rises, sticker/badge entrance. Urgency is the core motion language — timers and animated CTAs.
- **Placement model:** either drag-in app block (OS 2.0) or "custom position anywhere" anchor (legacy), so visual output is highly theme-dependent and merchant-placed — a key vocabulary trait (widgets are *portable, positionable atoms*, not fixed page regions).

## reviews_signal
**Top praises (confirmed):**
1. Easy, no-code setup; first campaign live in ~1 minute; "1-click install, 0 developer needed."
2. Breadth — "Swiss army knife": 30+ urgency/trust/upsell tools in one app covers countdown, badges, stock, BOGO, get-it-by from a single install.
3. Customization to match store branding (colors, position, copy) so widgets don't look bolted-on.
4. Measurable conversion/engagement lift attributed to timers, trust badges, and stock urgency.
5. Responsive, helpful support (when reachable) — frequently praised historically.

**Top complaints (confirmed):**
1. **Storefront bugs that break the product page** — most severe: "price disappeared from my product pages, losing sales." Widgets injecting into the theme can collide with the theme/other apps.
2. **Support inconsistency** — reports of support being unreachable for "4–5 days" during critical periods; quality described as uneven vs. the usual praise.
3. **Limited trust-badge library** — repeated requests for "more professional trusted badge icons"; the provided set feels dated/limited.
4. **Cart functionality gaps** — requests to "improve cart option" widgets; cart-side upsell weaker than product-page tooling.
5. **Leftover code / theme residue** after uninstall or on legacy custom-position placements; general "inconsistent app" reliability gripes (widgets not always rendering).

## mapping_note
Onto our constrained **RecipeSpec** vocabulary, a *single* Hextom widget (one countdown timer, one trust-badge row, one "only N left" chip on the product page) maps cleanly to **one theme.section module** with a settings schema drawn from the taxonomy above — that part is in-scope for a single-module recipe.

Where it **EXCEEDS a single-module recipe:**

1. **External data store + campaign lifecycle.** Campaigns live in an external DB with status/scheduling/priority and are metered by **attributed-revenue** across plan tiers. A single stateless module recipe has no home for a persisted, plan-gated, schedulable campaign object with its own activation window and status machine.

2. **Cross-surface blueprint with a shared campaign spine.** A real "flash sale" is *many* coordinated placements (product countdown + collection sticker + cart free-shipping bar + Plus checkout badge) that share intent/schedule but span theme.section, proxy.widget (cart), and checkout.block surfaces. That's a multi-module blueprint, not one recipe — and it needs the surfaces to agree on one schedule/rule set.

3. **A targeting rule engine as a first-class, reusable input.** Product-tag / customer-tag / total-spent / geo-country / Shopify-Markets / page + datetime-schedule rules form a shared `display_rule` evaluated at render time. This is a cross-cutting rule-builder our RecipeSpec would need to model once and attach to any module, rather than re-inventing per widget.

4. **Background jobs + storefront side-effects (attribution & scheduling).** Time-recurring countdowns (daily/weekly recurrence), scheduled activation/expiry, and per-campaign impression/click/revenue attribution require background scheduling and a storefront tracking script writing back to an external DB — background jobs and external side-effects that live outside a declarative single-module spec.

(Secondary: the newer BOGO/bundle/upsell layer, if it enforces real discounts, would additionally touch functions.discountRules / functions.cartTransform — but the classic USB widgets are display-only, so this is an emerging edge, not the core.)
