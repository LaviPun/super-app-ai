# Kaching Bundles App & Upsells

> **Rename note (confirmed):** The plugin listed as "Kaching Bundles Quantity Breaks" / "Kaching Bundle Quantity Breaks" is the same app, since **renamed** on the App Store to **"Kaching Bundles App & Upsells"** (same vendor, same listing/URL `apps.shopify.com/bundle-deals`, launched 2022-08-11). The original "Quantity Breaks" name survives in the vendor's own marketing site and help center as the product line name. Not deprecated, not merged — actively maintained, Built for Shopify. This record studies the current app; the "quantity breaks" deal type is one deal type inside a broader bundle/upsell suite the app grew into.

## identity
- **name:** Kaching Bundles App & Upsells (formerly Kaching Bundle Quantity Breaks) — confirmed
- **vendor:** Kaching Bundles & Upsells (Kaching Appz), Vilnius, Lithuania — confirmed
- **category:** Bundles / volume discounts / upsells — confirmed
- **App Store URL:** https://apps.shopify.com/bundle-deals — confirmed
- **rating:** 5.0 / 5 — confirmed
- **review count:** ~4,655 (98% 5-star, ~33 one-star) — confirmed (as of 2026-07)
- **install signal:** No public install number, but **Built for Shopify** badge + 4.6k reviews at 5.0 implies a very large install base (tens of thousands, inferred) — badge confirmed, count (inferred)
- **pricing model:** Free to install + **revenue-based tiered billing** — Starter $14.99/mo (up to $1,000 app-attributed additional revenue), Scale $29.99/mo (up to $5,000), Pro $59.99/mo (up to $10,000); dev stores free; 7-day trial — confirmed. Billing is metered on *additional revenue the app claims to have generated*, not a flat SaaS fee — confirmed and central to the data model.

## surfaces
Mapped to internal extension-type vocabulary:

- **theme.section** — confirmed. Primary surface: an **Online Store 2.0 theme app block** injected on the product page (also cart/collection) showing the quantity-break / bundle widget (tier grid, badges, price, "you save"). Added via app block, no theme code edits. This is where all merchant styling renders.
- **functions.cartTransform** — confirmed. Uses **Shopify Functions (cart transform)** to merge/expand bundle line items and reflect bundle composition in the cart ("Unlike other apps, Kaching uses Shopify Functions").
- **functions.discountRules** — confirmed/(inferred). Applies the tier discount as a **checkout-level discount** ("applies savings as checkout-level discounts rather than creating unique SKUs") — this is a Shopify Functions **product/order discount**, so the volume-tier pricing survives into checkout without draft orders. Confirmed it is a checkout-level discount; that it is specifically a Discount Function (inferred).
- **checkout.upsell / checkout.block** — confirmed (partial). Listed as "Checkout extension" + checkout compatibility; bundle/upsell offers can surface at checkout on Plus.
- **pos.extension** — confirmed. "Shopify POS compatible" — deals apply in POS carts.
- **admin.block / admin.action** — confirmed. Full embedded admin app: deal editor, layout editor, dashboard/analytics, A/B test manager, billing.
- **analytics.pixel** — (inferred). Tracks browsing behavior, conversions, and attributes revenue to bundles; almost certainly a web-pixel/analytics collector feeding the revenue dashboard (privacy policy lists browsing behavior, IP, geolocation).
- **flow.automation** — not used (no evidence).

**Coordination (confirmed + inferred):** The **admin deal editor is the single source of truth** — page builders (GemPages, PageFly, Foxify, Replo) only *render* the widget; "design and logic are managed entirely in the Kaching app." Shared state is a server-side **Deal** record keyed by product/collection visibility. Handoff chain: theme block reads deal → customer selects tier → cart-transform Function expands lines + discount Function prices them → attribution pixel/analytics records the order against the deal → revenue rolls up into the billing meter. So the storefront block, the two Functions, and the analytics/billing backend all key off the same Deal entity.

## functional_model
Core entities (concrete, mix of confirmed field names and inferred structure):

- **Deal** = { id, name, dealType, status(draft/published/active), visibility(productRefs | collectionRefs | allProducts), tiers[], design/layout config, priority, abTestGroup?, subscriptionEnabled? } — confirmed entity; some fields (inferred)
- **dealType** ∈ { QuantityBreak, BXGY/BOGO, VolumeDiscount(cross-product), CompleteTheBundle/Upsell, FixedBundle, MixAndMatch, FrequentlyBoughtTogether, BuildABox, FreeGiftWithMinPurchase, SubscriptionBundle } — confirmed set
- **Tier** (a quantity break row) = { quantity, discountType(percent | flat/fixed-amount | specific-price), discountValue, title, subtitle?, badge?(e.g. "Most Popular"/"Best Value"), highlighted(bool), preSelected(bool), image?, freeGift? } — quantity + discountType + badge + preselected confirmed; subtitle/image/gift per-tier (inferred)
- **Visibility / CollectionBreak** = { mode: "Same products as deal visibility" | product list | collection list, cap: up to 250 products shown in collection breaks } — confirmed
- **Gift** = { productRef, threshold(qty or cart minimum) } — confirmed feature (free gift with min purchase)
- **ABTest** = { deal, variants[A,B,C,D] (up to 4), metric(revenue/CR) } — confirmed
- **RevenueAttribution / Order-attribution record** = { orderId, dealId, attributedAdditionalRevenue } feeding the dashboard + billing meter — confirmed conceptually (inferred schema)

Relationships: Deal 1—* Tier; Deal *—* Product/Collection (via visibility); Deal 1—* ABTest variant; Deal 1—* attributed Orders → aggregated revenue meter.

## settings_taxonomy
The most important section. Actual merchant-facing controls, grouped.

### content
- **Deal name** — text (confirmed)
- **Deal type** — select[ Quantity Break, BXGY/BOGO, Volume discount (different products), Complete-the-bundle / Upsell, Fixed bundle, Mix & match, Frequently bought together, Build a box, Free gift with min purchase, Subscription ] (confirmed)
- **Tier title** per tier — text, e.g. "Buy 2" (confirmed)
- **Tier subtitle / description** — text (inferred)
- **Badge / label text** per tier — select-or-text: "Most Popular", "Best Value", custom (confirmed)
- **"You save" / savings label** — text/toggle, dynamic savings display (confirmed — "dynamically display product/discount details")
- **Block title / header** — text (confirmed)
- **Add-to-cart / CTA button text** — text (inferred)
- **Free gift product** — product-picker (confirmed)
- **Bundle variant title/dropdown labels** — text ("Customize Your Bundle Variant Dropdowns") (confirmed)

### style
- **Layout template** — select of **6 pre-designed templates** (Amazon-style selection grid vs list vs dropdown) (confirmed — "six pre-designed visual templates")
- **Color theme** — select of preset color circles (purple, lime green, orange, black) + custom color pickers (confirmed)
- **Colors** — color pickers for accent/highlight/background/text/border (confirmed presets; per-element pickers inferred)
- **Highlight / featured tier styling** — toggle + styling on the pre-selected tier (confirmed)
- **Fonts / typography** — inherits theme; limited controls (inferred)
- **Borders / corner radius / spacing** — (inferred; "customize colors, text, layout, and design")
- **Custom CSS / HTML** — text/code (confirmed — "Custom CSS and HTML support")
- **Progress bar widget** — toggle (confirmed)
- **Mobile-responsive layout** — automatic (confirmed)
- Known limitation: "widget styling could be more flexible for finer-grain brand control" (confirmed complaint)

### targeting
- **Visibility scope** — select[ All products, Specific products, Specific collections ] (confirmed)
- **Product picker** — product-picker (multi) (confirmed)
- **Collection picker** — collection-picker (multi); Collection Breaks apply one deal across many product pages, cap 250 products (confirmed)
- **Visibility mode for collection breaks** — select incl. "Same products as deal visibility" (confirmed)
- **Deal priority / ordering** when multiple deals match — (inferred)
- **Subscription targeting** — toggle to attach bundle to subscription products (confirmed)

### behavior
- **Discount type** — select[ Percentage off, Flat/fixed amount off, Specific fixed price ] (confirmed)
- **Discount value** — number per tier (confirmed)
- **Quantity threshold** per tier — number (confirmed)
- **Pre-selected default tier** — toggle/select (confirmed)
- **BOGO / Buy X Get Y rules** — rule-builder: buy-qty, get-qty, get-product, "show as Free" toggle (confirmed)
- **Free gift threshold** — number (qty or cart-min) (confirmed)
- **Free shipping** — toggle (confirmed as a supported discount outcome)
- **Subscription selling for bundles** — toggle (confirmed)
- **One-click add-ons** — toggle (confirmed)
- **A/B split test** — up to 4 variants A/B/C/D, metric selection (confirmed)
- **Publish / status** — draft ↔ published toggle (confirmed)

### data
- **Revenue dashboard** — read-only analytics: additional revenue generated, conversion rate, per-deal performance (confirmed)
- **A/B test results** — read-only per-variant revenue (confirmed)
- **Billing plan / revenue cap** — the app meters attributed additional revenue against the plan cap (confirmed)
- **Multi-currency / multi-language** — settings across 9 languages (confirmed)

## data_model
What it persists and where:
- **Deals + Tiers + design config** — app's **own backend DB** (external to Shopify, keyed by shop) — confirmed by architecture (embedded SaaS admin); exact store (inferred: relational DB).
- **Product/collection references** — stored as Shopify GIDs in the Deal's visibility (confirmed conceptually).
- **Discount + cart-transform logic** — deployed as **Shopify Functions** (cart transform + discount) tied to the app; not persisted as static discount codes — confirmed. No unique bundle SKUs created ("no native SKU splitting") — confirmed.
- **Metafields / metaobjects** — (inferred) likely uses a shop/product metafield or the Functions' configuration to bind deals to the storefront block; not documented.
- **Revenue-attribution records** — per-order attribution persisted in app DB to compute dashboard + drive **usage-based billing** — confirmed behavior, (inferred) schema.
- **Media/CDN** — tier/badge images and template assets on the vendor's CDN (inferred).
- **No customer-facing codes** — discounts are automatic (Functions), not coupon codes — confirmed.

## visual_patterns
- **Layout archetypes:** Amazon-style **quantity-break selection grid** (stacked selectable tiles, one per tier) is the flagship; also list view and dropdown variants; 6 template presets total. Bundle-builder / "complete the bundle" horizontal product row for cross-sell deals. (confirmed)
- **Component states:** each tier tile has default / hover / **selected** / **highlighted (pre-selected "Most Popular")** states; a badge ribbon overlay; a per-tier "you save X" and struck-through vs discounted price; radio-style single-select within the grid. (confirmed + inferred)
- **Motion/interaction:** click-to-select tier updates price + cart line dynamically; one-click add-on; optional **progress bar** animating toward a free-gift/free-shipping threshold; responsive reflow to a vertical stack on mobile. (confirmed)
- **Brand-match intent:** preset color themes + custom colors + custom CSS so the widget reads as native to the theme (confirmed); styling granularity is the one recurring visual complaint.

## reviews_signal
**Top praises (confirmed):**
1. **Customer support** — fast (minutes), knowledgeable, named agents (Paulius, Dovydas, Domantas) who do custom CSS/theme fixes for merchants. Overwhelmingly the #1 theme.
2. **Ease of setup / intuitive UI** — no code, app blocks auto-inject.
3. **Real AOV lift** — merchants credit measurable extra revenue ("so many less sales without it").
4. **Performance / no speed hit** — Functions-based, doesn't slow the store.
5. **Versatility** — many deal types + page-builder integrations; "essential at scale."

**Top complaints (confirmed):**
1. **Billing confusion / charged after uninstall** — dominant negative theme: charged after cancel, before trial end, or a full cycle after uninstall (Shopify's immediate-charge + full-cycle billing, but merchants blame the app). Revenue-based metering adds opacity.
2. **Intermittent bundle bug** — a deal set to add N units sometimes added only 1; silent, revenue-losing, needed manual checking.
3. **Aggressive outreach** — reports of AI **spam-calling**; support "broke other parts of the store" in at least one case.
4. **Styling not flexible enough** — merchants wanting fine brand control hit template/CSS limits.
5. **No SKU splitting / 3PL & POS-scan gaps** — frontend discount overlay doesn't split bundles into component SKUs; breaks barcode/warehouse fulfillment; draft/manual admin orders bypass the pricing logic.

## mapping_note
Maps cleanly onto a **RecipeSpec** at the surface level: the storefront widget is a `theme.section`/app-block recipe with a settings schema (content/style/targeting knobs) — that part is single-module and well within our vocabulary. **But the plugin materially EXCEEDS a single-module recipe** in several places:

1. **Cross-surface blueprint, not one block.** A single "deal" fans out to a theme block **plus** a cart-transform Function **plus** a discount Function **plus** POS/checkout — all coordinating off one shared server-side Deal entity. That's a `composeBlueprint` of ≥3 extension types with shared config, not a lone module.
2. **Persistent, mutable data store + rule engine.** Deals, tiers, per-tier badges/pre-selection, visibility (products/collections up to 250), and BXGY/gift-threshold rules are a live entity model with a matching/priority engine — beyond a static recipe's inline settings; needs a provisioned data model and a runtime rule evaluator.
3. **External side-effects via Shopify Functions.** Real cart-transform + discount Functions (wasm) that mutate the cart and price at checkout — a deployed backend behavior, not declarative section markup.
4. **Background attribution + usage-metered billing.** Per-order revenue attribution jobs roll up into a dashboard and drive **revenue-based billing** and A/B test scoring — background jobs + analytics pipeline + billing meter, none of which a single-module recipe expresses.
