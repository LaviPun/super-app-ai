# Custom Pricing: Wholesale B2B (formerly Bold Custom Pricing: Wholesale)

> **Rename note (confirmed):** The app formerly listed as **"Bold Custom Pricing: Wholesale"** now appears on the App Store as **"Custom Pricing: Wholesale B2B — Wholesale B2B, VIP + Customer Group Pricing w/ Quantity Breaks."** Same vendor (Bold), same listing URL slug (`/customer-pricing`), same review corpus — this is a rebrand/repositioning, not a new app. Help-center docs and in-app product still use the internal name **"Custom Pricing."** What changed: marketing name leans into "B2B," and the default discount engine flipped from V1 hidden-variants to V2 Shopify Functions for new installs as of 2025-12-16 (confirmed). This record studies the current live app.

## identity
- **name:** Custom Pricing: Wholesale B2B (internal/docs name: "Custom Pricing"; legacy name: "Bold Custom Pricing: Wholesale") — confirmed
- **vendor:** Bold (Bold Commerce) — confirmed
- **category:** Wholesale / B2B pricing (Shopify App Store "Finding products → Wholesale") — confirmed
- **App Store URL:** https://apps.shopify.com/customer-pricing — confirmed
- **rating:** 4.3 / 5 — confirmed
- **review count:** ~524 reviews (79% 5-star, 11% 1-star — notably bimodal) — confirmed
- **install signal:** No public install count. Bimodal review shape + long App Store tenure + 525-review corpus indicate a large, long-lived install base (legacy Bold v1 app) — (inferred)
- **pricing model:** Subscription, 14-day free trial. Three tiers gated on **number of customer groups**: **Essential $29/mo** (1 customer group), **Standard $69/mo** (up to 10 groups + auto-tagging + auto-email), **Complete $129/mo** (unlimited groups + Detailed Pricing + bulk CSV import/export + POS + SLA support). (Legacy listings quoted a $39.99 base; current tiers are $29/$69/$129.) — confirmed

## surfaces
Multi-surface app whose surfaces coordinate through a **shared customer-tag identity** (the customer's Shopify tags are the join key) plus a **shared price-rule store** (pricing groups / detailed pricing). The storefront surface reads the logged-in customer's tags, resolves matching price rules, and the checkout surface re-applies the same rule set through whichever discount engine (V1/V2/V3) is active.

- **theme.section** — *App embed / theme snippet on the product & collection pages.* Shows the discounted (wholesale/VIP) price in place of or beside the retail price, a **quantity-break display grid** ("buy 10 = $X, buy 50 = $Y"), and "your price" messaging for tagged customers. Installed via the app's "Install to Theme" onboarding step. — confirmed
- **functions.discountRules** — *V2 Standard Method (default for new installs since 2025-12-16).* A **Shopify Function** applies the customer-group discount natively in checkout, no variants created; allows native Shopify discount codes to stack. This is the primary current price-application surface. — confirmed
- **functions.cartTransform** — (inferred) The per-line "your price" adjustment behaves like a cart-transform-class Function (line-level price override keyed on customer tag + quantity tier). Bold's docs call it a "discount" Function; the effect is a per-line price rewrite, which in our vocabulary is closest to cartTransform for fixed-price rules and discountRules for percent/amount-off. — (inferred)
- **checkout.block / native checkout** — V1 (Variant Dependent) swaps the cart line to a hidden discounted variant that carries through Shopify's native checkout; V3 (Accelerated) intercepts the checkout button and creates a **draft order** carrying the discounted totals. Both are checkout-time application paths, not a UI block. — confirmed
- **admin.block / admin.action** — *Embedded Shopify Admin app.* All merchant configuration lives here: Manage Tags, Product Pricing Groups, Detailed Pricing grid, Import/Export, Account Plans, discount-method switcher, theme install. — confirmed
- **pos.extension** — *Shopify POS*, but only under **V3 Accelerated Method on the Complete plan** (a frequent source of "claimed compatible but isn't" complaints on other plans/methods). — confirmed
- **flow.automation** — *Auto-tagging rules* (Standard+) act as an event-driven automation: tag a customer by **country** or **purchase history**, optionally send an **auto-email notification** on tag assignment. This is a native mini-automation, not Shopify Flow. — confirmed
- **NOT used:** proxy.widget, functions.deliveryCustomization, functions.paymentCustomization, checkout.upsell, postPurchase.offer, customerAccount.blocks, analytics.pixel — no evidence — confirmed absent

**Coordination:** customer tag (identity) → price rule resolution (pricing group / detailed pricing / tag default) → surface rendering (theme section shows it) → checkout application (V1 variant swap OR V2 Function OR V3 draft order). The three discount "methods" are interchangeable back-ends for the *same* rule set; switching methods re-plumbs how the shared rules reach checkout without changing the rules themselves.

## functional_model
Core entities and relationships (concrete):

- **CustomerGroup / Tag** = `{ tagName: string, defaultDiscount?: {type: percent|amount, value}, storewide: bool, autoTagRule?: {by: country|purchaseHistory, criteria}, chargeTax: bool, autoEmailOnTag: bool }` — a Shopify customer tag is the identity key; plan tier caps how many can exist.
- **ProductPricingGroup** = `{ name, productSelection: (collection | productType | vendor | customFilter | explicitList), discountsByTag: Map<tag, {type: percent|amount|fixedPrice, value}>, quantityBreaks?: [...], scheduling?: {startDate, endDate} (V3 only) }` — group of products with one discount rule set, overrides tag storewide default.
- **DetailedPricing** (Complete plan) = per `{ product/variant, tag } → { priceType: fixed|percent|amount, value, quantityBreaks: [{minQty, priceType, value}] }` — a full **product×tag price matrix/grid**, editable in-app or via CSV.
- **QuantityBreak (tier)** = `{ minQty: int, priceType: % | - (amount off) | $ (fixed), value }` — attached to a group or detailed-pricing cell; "unlimited quantity breaks" per product.
- **DiscountMethod** = enum `{ V1 VariantDependent, V2 Standard(Functions|DraftOrders), V3 Accelerated(DraftOrders) }` — store-level engine choice governing how rules reach checkout.
- **HiddenVariant** (V1 only) = duplicate Shopify variant per (variant × tag) carrying discounted price + control metafield; consumes the product's variant limit.
- **DraftOrder** (V2 DraftOrders mode / V3) = generated at checkout, persists in Shopify admin up to a year.

Relationships: `Tag 1—* PricingGroup`, `Tag 1—* DetailedPricingCell`, `PricingGroup *—* Product`, `Product 1—* QuantityBreak (per tag)`, `Store 1—1 DiscountMethod`.

## settings_taxonomy

### content
- **Quantity Break Display Grid** — customizable grid showing tier → price ("Customize the Quantity Break Display"). type: template/markup + toggle — confirmed
- **"Display Regular Prices Beside Wholesale Prices"** — toggle (show retail price struck through next to your-price) — confirmed
- **Your-price / wholesale messaging** on product page — text/snippet injected by theme install — confirmed
- **Auto-email (auto-tag notification)** body/subject — text (Standard+) — confirmed
- **Remove Customer Pricing Tag from Shopify Email Notifications** — toggle — confirmed

### style
- **Quantity Break grid styling** — merchant edits the display snippet/liquid to match theme (no dedicated color/font pickers documented; styling is via theme-level CSS/snippet edits) — (inferred)
- **Where the wholesale price renders** (inline vs beside retail) — layout toggle — confirmed
- *Note:* App has thin native styling controls — reviews explicitly flag "the UI can be updated" / "outdated interface"; styling is largely inherited from theme, not app-configured — confirmed

### targeting
- **Manage Tags** — create/name customer tags (the group definitions) — text/list, count capped by plan — confirmed
- **Manual customer tagging** — assign tag to a customer account in Shopify admin — product/customer-picker style — confirmed
- **Auto-tagging Rules** — `by country` (select[country]) and `by purchase history` (rule) → assigns tag automatically (Standard+) — rule-builder — confirmed
- **`cspnotag` tag** — special tag that *excludes* a customer from auto-tagging — reserved-tag mechanism (incompatible with V3) — confirmed
- **Product selection in a Pricing Group** — by **collection**, **product type**, **vendor**, **custom filtered list**, or **individual/bulk pick** — product-picker + filter-builder — confirmed
- **Storewide vs per-group** — toggle: apply tag's default discount storewide, then override per Product Pricing Group — toggle + override — confirmed
- **Hide products/variants from non-qualified customers** — visibility restriction — toggle — confirmed
- **Hide shipping rates by customer tag** — toggle/rule — confirmed

### behavior
- **Discount Method switcher** — select: `Variant Dependent (V1)` / `Standard (V2)` (sub-mode: Shopify Functions or Draft Orders) / `Accelerated (V3)` — select with major behavioral consequences — confirmed
- **Discount type** (per group/cell) — select: **Percent Discount (%)**, **Price Discount (− amount off)**, **Set Fixed Price ($)** — select — confirmed
- **Quantity Breaks** — add tier (+ icon) / remove tier (× icon); each tier = `minQty` (number) + priceType + value; "unlimited" tiers — repeater/rule-builder — confirmed
- **Charge tax controls** — per-tag `yes/no` tax toggle (applies to product price, not shipping) — toggle — confirmed
- **Discount code stacking** — whether Shopify discount codes combine with custom pricing (behavior varies by method: V1 stacks at checkout, V2-Functions stacks, V2-DraftOrders and V3-checkout do **not**) — toggle/method-dependent — confirmed
- **Compare-at price discounting** — apply discount off compare-at price (V1 only) — toggle — confirmed
- **Price group scheduling** — `startDate` / `endDate` on a pricing group (V3 only) — date-picker — confirmed
- **Sync with Shopify** — button to pull newly created products into the app (rate-limited to once / 24h) — action button — confirmed

### data
- **Bulk CSV Import/Export of prices** (Complete plan) — columns: **Handle**, **SKU** (renamed from Variant SKU), **Price Type** (`%` / `-` / `$`), **Qty** (min quantity for the break, one row per tier), one **column per customer tag**, optional **Default** column for untagged customers — file-upload + column schema — confirmed
- **Detailed Pricing grid** — product×tag price matrix entered in-app (Complete) — data-grid — confirmed
- **Export current prices** to CSV for editing — action — confirmed

## data_model
- **Price rules (groups, detailed pricing, tag defaults, quantity breaks):** persisted in **Bold's own external database** (app-side), not in Shopify metafields for the rule definitions. Confirmed by the app's architecture (Bold app back-end) — (inferred, strong)
- **Customer identity:** **Shopify customer tags** (native Shopify data) — confirmed
- **V1 Variant Dependent:** creates **hidden duplicate Shopify variants** (one per variant×tag) carrying discounted price + a **control metafield** on each variant that gates visibility/discount; consumes Shopify's per-product variant limit (docs cite up to 2048) — confirmed
- **V2 Standard (Functions):** a **Shopify Function** (deployed extension) applies discounts at checkout; **no variants, no draft orders** persisted. V2 Draft-Orders sub-mode instead creates **draft orders** — confirmed
- **V3 Accelerated:** creates **draft orders** via Bold APIs at checkout; drafts persist in Shopify admin up to ~1 year — confirmed
- **CSV import/export files:** merchant-supplied spreadsheets keyed by Handle+SKU — confirmed
- **Auto-email:** notification emails sent on auto-tag events — confirmed
- **Leftover data:** uninstall can leave residual variants/code affecting order-number sequences (a documented complaint) — confirmed

## visual_patterns
- **Layout archetypes:** (1) **your-price replacement** on product page — retail price swapped for tagged price; (2) **dual-price display** — retail struck-through beside wholesale price; (3) **quantity-break table/grid** — rows of `qty ≥ N → price`, the app's signature storefront component; (4) **admin data-grid** — product×tag price matrix with inline editable cells, +/× to add/remove quantity tiers.
- **Component states:** logged-out (retail only) vs logged-in-tagged (custom price shown) vs logged-in-untagged (retail or default column); in-stock vs out-of-stock (V2 respects Shopify out-of-stock rules, V1 does not reliably); tier boundaries (price steps down as qty crosses each break).
- **Motion/interaction:** minimal. Price updates on quantity change in cart; V1 renders "instantly" on storefront (its selling point) whereas V2/V3 resolve pricing at cart/checkout. Admin grid uses inline-cell edit + add-tier (+) / remove-tier (×) micro-interactions. No animation-heavy UI; reviews call the interface dated.

## reviews_signal
**Praises (up-to-the-mark bar):**
1. Handles **complex real B2B pricing** — tiered pricing, quantity breaks, mix-and-match, multiple price levels — "without a lot of hassle."
2. **Support quality** — named reps (e.g., "Taylor & Jade") repeatedly praised; responsive, knowledgeable, hands-on setup help.
3. **Affordable alternative to Shopify Plus / B2B** for growing wholesale businesses.
4. Flexible **customer-tag segmentation** driving different price worlds from one storefront.

**Complaints (failure modes):**
1. **Reliability / crashes** — "this app continues to crash and not work"; sync lag between store prices and custom prices (esp. V1).
2. **Store performance degradation** — "whole store slows down" (variant bloat + storefront injection).
3. **POS compatibility gap** — claims POS support but only works under V3/Complete; merchants on other plans feel misled.
4. **Uninstall residue** — leftover variants/code affecting **order-number sequences** after removal.
5. **UX gaps** — can't search products by SKU for bulk editing; "outdated UI"; missing NET terms / better search that competitors offer; some reports of support going silent.

## mapping_note
Onto our constrained **RecipeSpec** vocabulary this maps as a **cross-surface blueprint with a rule engine and a persistent price store**, not a single module. A single recipe could emit the *storefront face* (a `theme.section` quantity-break/your-price grid) and *one* discount Function (`functions.discountRules` / `functions.cartTransform`). But the app as a whole exceeds a single-module recipe in several load-bearing ways:

- **Persistent external rule store** — product×tag price matrix, pricing groups, quantity-break tiers, tag defaults. This is a stateful data model that must survive across sessions and be bulk-editable (CSV), which a stateless recipe cannot own.
- **Rule engine over identity** — resolution of `(customer tag × product/variant × quantity) → price` is a runtime rule engine, not a static config; it needs a targeting/rule-builder vocabulary (collection/type/vendor/custom-filter selection + per-tag discount + tiered breaks) beyond a flat settings form.
- **Multi-surface coordination with a swappable checkout back-end** — the same rule set must render on the product page AND apply at checkout via one of three interchangeable engines (hidden-variant swap / Shopify Function / draft-order interception), plus POS. That's a blueprint spanning theme.section + functions.* + native-checkout + pos.extension held together by shared state, not one surface.
- **Background jobs & external side-effects** — auto-tagging by country/purchase-history, auto-email notifications, once-per-24h Shopify sync, draft-order creation, and price-sync reconciliation are asynchronous side-effecting processes (a mini flow.automation + job queue), which no single generative module emits.
