# Bold Brain ‑ AI for your store

> **DEPRECATION / STATUS NOTE (confirmed):** The target "Bold Brain AI Recommendations" is the app **"Bold Brain ‑ AI for your store"** by BOLD (Bold Commerce), Shopify handle `the-bold-brain`. It was **removed / delisted from the Shopify App Store** (confirmed — store-leads reports the listing removed, and the live App Store page now returns "This app is not currently available"). Reported delist date varies by tracker (2026-04-29 per one aggregator, 2026-07-03 per store-leads); it is no longer installable. The vendor help-center docs (support.boldcommerce.com) for Bold Brain now 404, consistent with a wound-down product.
> **Closest current equivalent from the same vendor (confirmed):** BOLD folded Brain's recommendation intelligence into **"BOLD AI Upsell & Cross‑Sell"** (`apps.shopify.com/product-upsell`), whose **Smart Offers** feature is the direct descendant of Brain's "Smart Offers / Insights" engine — same idea (ML over historical order data auto-generating offers), now surfaced inside the Upsell product rather than as a standalone recommendations app. What changed: the storefront recommendation *widgets* (the six-widget theme library) and the standalone Audiences/Mailchimp segmentation UI were not carried over as first-class features; the ML "products bought together" signal survives as an offer-generation engine inside Upsell. This record documents Bold Brain itself (from listing mirrors + cached vendor docs), which is the richer vocabulary target.

## identity
- **name:** Bold Brain ‑ AI for your store (subtitle: "Product Recommendation through AI and Machine Learning") — confirmed
- **vendor:** BOLD / Bold Commerce (boldcommerce.com) — confirmed
- **category:** Product Recommendation / Conversion — confirmed
- **App Store URL:** https://apps.shopify.com/the-bold-brain (delisted — confirmed) — confirmed
- **rating:** 3.7 / 5 — confirmed
- **review count:** 38 — confirmed
- **install signal:** ~1,525–1,583 live stores at delist (store-leads); YoY install trend ‑16.8%, i.e. declining — confirmed. Concentrated US (55%) / Canada (20%); top verticals Apparel (26%), Beauty & Fitness (13%), Home & Garden (10%) — confirmed
- **pricing model:** Free plan available; paid tier **$19.99/month + 2% commission on widget-attributed sales** — confirmed. (Rev-share on attributed conversions, not a flat SaaS tier — notable.)
- **launched:** August 2017 — confirmed

## surfaces
Bold Brain is **multi-surface**: it renders storefront widgets, an embedded admin analytics/insights console, and pushes data outward into other Bold apps and into Mailchimp. Mapped to our internal allowlist:

- **theme.section** (confirmed) — PRIMARY surface. The six recommendation widgets are injected into the storefront theme. "Save And Install" **writes widget markup directly into the merchant's theme files** (Liquid/asset injection), placed on product pages, cart, home, collection, and "recently viewed" contexts. This is the merchant-visible output. (Pre-Online-Store-2.0 injection model; not an app block — confirmed by the "inserts the widget's coding into your theme files" + "Uninstall Your Recommendation Widget" removal doc.)
- **admin.block** (confirmed) — embedded admin app with a **Widgets** manager (create/edit/install/uninstall widgets), a **Reports/Insights** dashboard (frequently-bought-together, avg customer value, avg order size, total profit, behavior stats), and an **Audiences** builder.
- **admin.action** (inferred) — "Create New Widget" and "Create Insight Offer" are discrete admin action flows; the one-click "activate this recommendation as an offer in Bold Upsell/Bundles" is an action-style handoff.
- **analytics.pixel** (inferred) — to power "Recently Viewed" per-shopper and widget-level performance/A-B stats and the 2%-of-widget-sales attribution, Brain must run a storefront tracking script capturing product views, clicks, and widget-attributed purchases. Not a formal Web Pixel extension (predates it) but functionally an analytics/behavior tracker.
- **flow.automation** (inferred, loose) — the Smart Widget's automatic A/B rotation + "promote the best-performing widget" is an automated optimization loop, and Insights→Offer activation is an automation handoff; not Shopify Flow, but engine-driven background behavior.
- **checkout.upsell / postPurchase.offer** (inferred, INDIRECT) — Brain does not render checkout/post-purchase surfaces itself, but its recommendation signal **feeds Bold Upsell**, which does. Brain is the data source; Upsell owns those surfaces.

**How the surfaces COORDINATE (confirmed core, inferred plumbing):**
- Shared **behavioral data store** is the hub. The storefront tracker (analytics.pixel role) feeds a per-shop ML model; the admin console reads model outputs (Insights, Audiences, widget stats); the storefront widgets read model outputs to render recommendations. Read-write handoff is: storefront events → model → both admin analytics and storefront widgets.
- **Cross-app handoff:** "one click" activates Brain's data-driven recommendations inside **Bold Upsell** and **Bold Bundles** (and Subscriptions), so the *same* "products frequently bought together" graph powers (a) storefront widgets and (b) another app's cart/checkout/post-purchase offers. Brain is a shared intelligence layer, not just a widget app.
- **Outbound handoff:** Audiences (segments) export to **Mailchimp** (live sync) or **CSV** — a state handoff to an external email system.
- **Inbound handoff:** **Yotpo** review data flows in to power the Top-Rated widget (ratings come from Yotpo, not Brain).

## functional_model
Core entities (concrete; relationships in braces):

- **Widget** = { id, type ∈ {smart, related, people_also_bought / most_frequently_bought, most_popular, recently_added, recently_viewed, top_rated}, title, item_count, background_color, show_add_to_cart_button, allow_free_products, placement/page_context, installed_bool, theme_asset_ref } — the merchant-configured storefront unit.
- **RecommendationEdge** = { source_product_ref, recommended_product_ref, relationship_type (bought-together / related / popular), score } — the ML-derived product-to-product graph; the substrate every widget queries.
- **ShopperSession** = { anonymous_visitor_id, viewed_product_refs[] (ordered, 3–6 retained for Recently Viewed), events[] } — powers Recently Viewed + behavior analytics.
- **Insight** = { metric_type (frequently-bought-together / avg_customer_value / avg_order_size / total_profit / behavior_stat), value, related_product_refs[] } — surfaced in Reports; some Insights are actionable → convertible to an Offer.
- **InsightOffer** = { insight_ref, target_app (Bold Upsell | Bold Bundles), product_refs[], activated_bool } — the one-click bridge that turns a Brain insight into a live offer in another Bold app.
- **Audience / Segment** = { id, name, type (prebuilt | custom), filters[] (behavior/purchase criteria), customer_refs[], destination (Mailchimp | CSV) } — the segmentation entity.
- **WidgetPerformanceStat** = { widget_ref, impressions, clicks, attributed_sales, attributed_revenue } — drives Smart Widget A/B selection and the 2% commission billing.

Relationships: Widget →(queries)→ RecommendationEdge graph; ShopperSession →(feeds)→ both RecommendationEdge model and Recently-Viewed widget; Insight →(promotes to)→ InsightOffer →(activates in)→ Bold Upsell/Bundles; Audience →(exports to)→ Mailchimp/CSV; WidgetPerformanceStat →(governs)→ Smart Widget rotation + billing.

## settings_taxonomy
The actual merchant-facing controls, grouped.

### content
- **Widget type** — select[ Smart Widget (recommended, auto A/B), Related Products, People Also Bought / Most Frequently Bought, Most Popular, Recently Added, Recently Viewed, Top Rated (Yotpo-powered) ] — confirmed
- **Widget title** — text (optional; e.g. "You may also like", "Recently viewed") — confirmed
- **Number of items to display** — number (Recently Viewed retains 3–6; other widgets configurable count) — confirmed
- **Allow free products** — toggle (whether $0 products may appear in recommendations) — confirmed
- **Product exclusion / "exclude this recommendation"** — per-recommendation control to remove a bad pairing — confirmed (heavily referenced in reviews; merchants manually excluded ~2/3 of suggestions)

### style
- **Background color** — color — confirmed
- **Show "Add to Cart" button** — toggle (whether widget cards render an add-to-cart CTA vs link-only) — confirmed
- **Layout / card formatting** — largely fixed by widget type (no rich layout builder; reviews call formatting "basic and outdated") — confirmed as a limitation; deeper style knobs (fonts, columns, spacing) are unknown/minimal — (inferred)

### targeting
- **Placement / page context** — where the widget installs (product page, cart, home, collection, recently-viewed contexts) — confirmed (implied by widget types + theme injection); exact placement UI granularity unknown — (inferred)
- **Audience filters (Segmentation)** — rule-builder: prebuilt vs custom audiences with behavior/purchase filters (e.g. by purchase history, customer value, behavior) — confirmed at capability level; exact filter field list unknown — (inferred on specific fields)
- **Smart Widget auto-targeting** — the Smart Widget delegates targeting to the engine (rotates widgets, shows best performers more often) rather than merchant rules — confirmed

### behavior
- **Smart Widget A/B rotation** — engine behavior toggle-by-choosing-Smart-type; auto-selects best-performing widget over time — confirmed
- **Save And Install** — action that injects widget code into theme + enables on storefront — confirmed
- **Uninstall widget** — action that removes injected code from theme — confirmed
- **Activate recommendations in other Bold apps** — one-click toggle/action to feed Brain data into Bold Upsell / Bold Bundles / Subscriptions — confirmed
- **Create Insight Offer** — action converting an analytics insight into a live cross-sell/bundle offer — confirmed
- **Mailchimp sync vs CSV export** — select destination for an audience — confirmed

### data
- **Mailchimp integration** — connect/authorize + audience push (targeted email campaigns) — confirmed
- **CSV export** — export audience/segment data — confirmed
- **Yotpo integration** — connect to source review ratings for Top-Rated widget — confirmed
- **Data-volume dependency** — no explicit knob, but the engine needs sufficient order history to produce good edges; performs poorly on low-data stores (surfaced repeatedly in reviews; not merchant-tunable) — confirmed as behavior, not a setting

## data_model
What it persists and where:
- **Per-shop recommendation model / product-affinity graph** — external Bold-hosted DB (ML-derived "frequently bought together" / related edges). Not Shopify-native metafields; this is Bold's backend. — (inferred, high confidence)
- **Shopper behavioral event stream** — product views/clicks/purchases captured by a storefront tracking script; persisted server-side to build sessions + Recently-Viewed lists + widget attribution. Recently-Viewed likely also cached client-side (cookie/localStorage) for the 3–6 item ordered list. — (inferred)
- **Widget configuration records** — per-widget settings (type, title, count, color, CTA, placement) stored in Bold's admin backend; the rendered widget is **injected into Shopify theme files/assets** (Liquid + JS), so there is also a theme-asset footprint. — confirmed (theme injection) / (inferred storage location)
- **Audiences / segments** — customer segment definitions + memberships in Bold backend; synced out to Mailchimp lists or exported as CSV. — confirmed
- **Widget performance / attribution stats** — impressions, clicks, attributed sales/revenue per widget in Bold backend (drives Smart Widget + 2% billing). — confirmed (feature) / (inferred storage)
- **External systems:** Mailchimp (audience destination), Yotpo (ratings source), Bold Upsell/Bundles/Subscriptions (recommendation-signal destination). — confirmed
- **Media/CDN:** product imagery pulled from Shopify product data (no separate media store implied). — (inferred)

## visual_patterns
- **Layout archetypes:** horizontal product carousel / row-of-cards "recommendation strip" per widget (title + N product cards: image, title, price, optional Add-to-Cart). One archetype reused across all widget types; differentiation is in the *data source*, not the layout. Reviews describe formatting as "basic and outdated" — a compact, unstyled card row that "blends with the store" only loosely. — confirmed
- **Component states:** default (recommendations present), empty/insufficient-data (widget suppressed or sparse on low-data stores — confirmed pain point), Recently-Viewed FIFO state (oldest item drops as new products are viewed, 3–6 retained), add-to-cart-enabled vs link-only card. — confirmed
- **Motion/interaction:** carousel scroll/paging through cards; click-through to PDP; inline add-to-cart from card (optional). Smart Widget performs *invisible* rotation/A-B swapping between page loads (no user-visible animation — it's a server-side selection). — confirmed
- **Admin visual pattern:** dashboard-style Reports page (stat tiles: frequently-bought-together, avg order size, avg customer value, total profit) + a Widgets list/manager + Audiences builder — standard embedded-admin console. — confirmed

## reviews_signal
**Top praises (confirmed):**
1. Works in tandem with other Bold apps — "works in conjunction with Bold Product Upsell"; good when combined with the Bold ecosystem for upsell/bundle offers.
2. "Does what I needed" / "works perfectly" for merchants whose catalog + data fit — reliable basic recommendations.
3. Gives customers options/choices (surfaces alternative products, drives discovery).
4. Free entry tier lowers adoption barrier; one-click activation into Upsell/Bundles is convenient when it works.

**Top complaints (confirmed):**
1. **Poor recommendation relevance** — "about two-thirds of what it tells me, the products do not go together at all"; heavy manual exclusion required. The ML pairings are frequently nonsensical.
2. **No cross-app awareness** — recommends upsells already configured/covered by the merchant's other apps; same product appears in both "Related" and "Popular", cannibalizing slots.
3. **Install/reliability failures** — "Won't install, says 'whoops, an error has occurred'"; caused stores to "hang up and not add products to cart correctly" (storefront performance/cart breakage — the theme-injection model is fragile).
4. **Needs significant data** — performs badly on small/low-history stores; doesn't disclose the data threshold, so merchants can't tell if it will work.
5. **Dated, basic widget formatting** + must buy multiple Bold apps for full value; slow/weak support response.

## mapping_note
Onto our constrained RecipeSpec vocabulary, a **single** Bold Brain widget maps cleanly to a **theme.section** recipe: content (title, widget type), style (background color, show-CTA toggle, item count), a product-list data source, and a carousel layout archetype. A basic "Recently Viewed" or "Related Products" strip is well within one module.

**Where it EXCEEDS a single-module recipe:**
- **Needs a persistent data store + ML model, not static config.** The core value is a per-shop product-affinity graph learned from order/behavior history (RecommendationEdge). A RecipeSpec emits a static/parameterized module; it cannot own a trained recommendation model. This requires an external data store + training pipeline.
- **Requires a storefront behavioral tracker (analytics.pixel) with server-side event persistence.** Recently-Viewed ordering, widget attribution, and the 2%-of-sales billing all depend on capturing and storing shopper events over time — a stateful side-effecting subsystem, not a self-contained render module.
- **Cross-surface blueprint with a shared intelligence hub.** The same affinity graph must fan out to (a) storefront theme widgets, (b) an admin insights/analytics console, (c) Bold Upsell/Bundles offers (checkout/post-purchase surfaces owned by another app), and (d) Mailchimp/CSV audience exports. That's a multi-surface, multi-app coordinated blueprint sharing one backend — beyond a single module and beyond even one app's surfaces.
- **Background jobs + optimization loop.** The Smart Widget's continuous A/B rotation and "promote the best performer" logic, plus periodic model retraining and audience recomputation, are scheduled/background processes — a rule/optimization engine, not a one-shot generation.
- **External side-effects + inbound integrations.** Mailchimp segment sync, CSV export, and Yotpo ratings ingestion are external I/O contracts a constrained recipe cannot express; the "one-click activate in Bold Upsell" is a cross-app write/side-effect.
