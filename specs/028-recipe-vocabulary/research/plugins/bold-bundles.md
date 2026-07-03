# Bold Bundles ‑ Product Bundles

> Vocabulary study record for the constrained AI module-generation system.
> Each fact labeled **confirmed** (from App Store listing / Bold help center / reviews) or **(inferred)**.
> Sources: apps.shopify.com/product-bundles, support.boldcommerce.com, app aggregators.

## identity
- **name**: Bold Bundles ‑ Product Bundles — subtitle "Bundle Builder for Product Bundles, BOGO and Volume Discounts" — **confirmed**
- **vendor**: Bold (Bold Commerce) — **confirmed**
- **category**: Product bundles (under Marketing and conversion); secondary Upsell and cross-sell — **confirmed**
- **App Store URL**: https://apps.shopify.com/product-bundles — **confirmed**
- **rating**: 3.8 / 5 — **confirmed**
- **review count**: ~229–230 reviews (distribution: 65% 5★ / 6% 4★ / 4% 3★ / 4% 2★ / 21% 1★) — **confirmed**. The bimodal 65/21 split is diagnostic: it works well OR breaks hard.
- **install signal**: ~2,677 Shopify stores (StoreLeads aggregator) — **confirmed** (third-party estimate). Launched Sept 12, 2013 — an old, pre‑Shopify‑Functions app — **confirmed**.
- **pricing model**: Subscription, two tiers, 14-day free trial, USD billed every 30 days — **confirmed**
  - **Basic $19.99/mo**: One-Click Bundle Add to Cart; sell packages/packs/sets; bundles by product or collection; bundle performance stats — **confirmed**
  - **Premium $29.99/mo**: everything in Basic + BOGO (Buy/Get) offers; reuse same product in up to 10 bundles; quantity badges for quantity bundles — **confirmed**
  - Free on development/sandbox stores — **confirmed**

> **Deprecation note**: Not renamed or merged — the listing is live and actively documented in 2026. However this is a **legacy architecture** app: it predates Shopify's native Bundles API / cart_transform Functions and instead relies on injected Liquid + hidden variants / draft orders (see below). Bold's *newer* bundling approach lives in "Bold Upsell" / "Bold Discounts" and the Bold Checkout suite, but "Bold Bundles ‑ Product Bundles" remains the standalone product studied here — **confirmed** (no migration banner on listing; legacy mechanics still documented).

## surfaces
Mapped to internal extension-type vocabulary:

- **theme.section** (as legacy `proxy.widget`-style Liquid injection) — **confirmed**. The **Bundles Widget** renders on **product pages** ("Promote volume discounts or bundle offers with the Bundles Widget on Product Pages"). This is NOT a modern theme app extension — it requires **Liquid code added to the theme** via Automatic Install, Expert Install, or Manual Install. Shows: bundle title, product/collection list with per-item quantities and images, a "Style" button/CTA, optional flag/badge text, and compare-at savings. Closest internal mapping: **theme.section** (merchant-configured storefront block) + legacy snippet injection. — **confirmed**
- **proxy.widget** — **(inferred)**. The add-to-cart and draft-order handoff is served from Bold's app backend (app proxy pattern) rather than pure theme code; the widget's "One-Click Bundle Add to Cart" posts to Bold and receives cart/checkout state. — **(inferred)**
- **functions.cartTransform / functions.discountRules** — **NOT USED as native Functions** — **confirmed**. The app achieves the *same merchant intent* (discount when items bought together) through pre-Functions mechanisms: **hidden duplicate variants** (Variant Dependant Method) or **draft orders** (Draft Order / Accelerated Draft Order Methods). Semantically this is the cart_transform + discount space, but implemented outside the Functions runtime. — **confirmed**
- **checkout.upsell / checkout.block / postPurchase.offer** — **not a surface** for this app — **confirmed** (discounts are pre-baked into the cart/draft order before checkout; no Checkout Extensibility UI). The Draft Order methods actually **remove** the discount-code field at checkout. — **confirmed**
- **admin.block / admin.action** — the entire bundle builder + "Sync Inventory" button + stats live in the app's embedded **admin** UI — **confirmed** (embedded app pages, not modern admin action extensions).
- **analytics.pixel** — "Bundle performance stats" reporting exists in admin — **confirmed** it reports; **(inferred)** whether via a pixel or draft-order tagging.
- **flow.automation / pos.extension / customerAccount.blocks / deliveryCustomization / paymentCustomization** — **not used** — **confirmed** (out of scope for this app).

**Cross-surface coordination**: The **storefront widget** (theme) and the **app backend** share state through the cart. In Variant Dependant mode the handoff is a **hidden variant id** injected into the cart line; in Draft Order modes the handoff is a **draft order** created on checkout-click that carries the computed discount, replacing the normal Shopify cart→checkout flow. The **admin bundle builder** is the source of truth; a **manual "Sync Inventory" button** is the reconciliation bridge between admin bundle definitions and live variant stock (no automatic webhook sync). — **confirmed**

## functional_model
Core entities (concrete shapes; field names confirmed from builder, types inferred where noted):

- **bundle** = {
    `internalName`: text,
    `type`: enum(`group` | `mix_and_match` | `buy_get`),  // Group & Mix&Match = Basic; Buy/Get(BOGO) = Premium
    `widgetTitle`: text,
    `widgetButtonStyle`: enum(dropdown of preset styles),
    `widgetFlagText`: text?,           // Buy/Get only
    `showTitleAsButton`: bool,          // Mix & Match only
    `discountingMethod`: enum(`variant_dependant` | `draft_order` | `accelerated_draft_order`),  // store-level, not per-bundle
    `items`: bundleItem[],
    `pricing`: pricingRule
  } — **confirmed** (field names from Create/Edit docs)
- **bundleItem (group)** = { `productRef`, `variantRef`?, `quantity`: number, `imageUrl`: text? (override) } — **confirmed**
- **bundleItem (mix&match)** = { `collectionRef`, `quantity`: number, `imageUrl`: text? } — **confirmed** (collection-scoped, shopper picks members)
- **bundleItem (buy/get)** = two arms: `buy`: {productRef|collectionRef, quantity}[], `get`: {productRef|collectionRef, quantity}[] — **confirmed**
- **pricingRule** = {
    `mode`: enum(`percentage` | `fixed_bundle_price` | `bogo`),
    `percentDiscount`: number?,
    `fixedBundlePrice`: number?,        // Group only; blocked if variants have differing prices
    `overrideCentValue`: number?,       // force price endings like .99
    `recalcOnPriceChange`: bool         // "Recalculate bundle price when product prices change"
  } — **confirmed**
- **comboProduct** (Premium, Group only) = { `generateNewProduct`: bool, `comboTitle`: text } — a real Shopify product generated to represent the bundle — **confirmed**
- **hiddenBundleVariant** (Variant Dependant only) = duplicate of a parent variant with bundle price; `inventory` = "N/A" (infinite) but **decrements the parent variant** on sale; visible only on cart/checkout — **confirmed**
- **draftOrder** (Draft Order / Accelerated only) = created on checkout-click with computed discounts; persists in Shopify admin after checkout — **confirmed**

Relationships: one `bundle` → many `bundleItem`; `bundle`→`pricingRule` 1:1; Variant Dependant `bundle`→many `hiddenBundleVariant` (one per parent variant × customer tag/level); a product may participate in up to **10** bundles (Premium) — **confirmed**.

## settings_taxonomy
Actual merchant-facing controls, grouped. **This is the core of the record.**

### content
- **Internal Name** — text — **confirmed** (admin-only label)
- **Bundle Widget Title** — text — **confirmed** (shown on product page)
- **Combo Product title** — text — Premium/Group combo — **confirmed**
- **Widget Flag Text** — text (optional) — Buy/Get badge copy (e.g. "BOGO!") — **confirmed**
- **Add Products** — product-picker (multi) — Group / Buy arms — **confirmed**
- **Add Collections** — collection-picker (multi) — Mix & Match / Buy-Get collection arms — **confirmed**
- **Image URL (per product / per collection)** — text/image override, editable via Actions > Edit product — **confirmed**
- **Quantity (per item)** — number — how many of each product/collection the bundle requires — **confirmed**

### style
- **Widget button "Style"** — select[dropdown of preset button styles] — **confirmed**
- **Show Title as Button** — toggle — Mix & Match — **confirmed**
- **Styling Settings** (app admin) + **CSS Styling** (raw CSS text) — text/code — **confirmed** (customization is largely CSS-level, not a rich style panel — a known friction point)
- **In-Cart "Compare at Pricing" display** — toggle/option — show struck-through original vs bundle price in cart — **confirmed**
- **Quantity badges** — Premium feature toggle for quantity bundles — **confirmed**

### targeting
- **Bundle type** — select(`Group` | `Mix & Match` | `Buy/Get`) — determines who/what the bundle applies to — **confirmed**
- **Products in bundle** — product-picker — **confirmed**
- **Collections in bundle** — collection-picker (Mix & Match lets shopper choose N-from-collection) — **confirmed**
- **Buy arm / Get arm** — separate product/collection pickers defining trigger set vs reward set (BOGO) — **confirmed**
- **Customer level / tag** — variant duplication is "for each customer level/tag" in Variant Dependant mode — implies **customer-tag targeting** of pricing — **confirmed** (mechanism), **(inferred)** as an explicit merchant knob vs. inherited from Bold Custom Pricing
- No explicit geo/schedule/URL targeting documented — **confirmed** absent

### behavior
- **Discounting Method** — select(`Variant Dependant` | `Draft Order` | `Accelerated Draft Order`) — store-level switch that changes the entire discount mechanism, inventory behavior, and discount-code compatibility — **confirmed** (Accelerated is default on new installs)
- **Discount mode** — select(`percentage` | `fixed bundle price` | `BOGO`) — **confirmed**
- **Set percentage discount** — number (%) — **confirmed**
- **Set fixed bundle price** — number — Group only, blocked when variants differ in price — **confirmed**
- **Override Cent Values** — number — force price endings — **confirmed**
- **Recalculate bundle price when product prices change** — toggle — **confirmed**
- **Generate New Product** (Combo Product) — toggle — Premium/Group — **confirmed**
- **One-Click Bundle Add to Cart** — behavior (Basic feature) — adds all bundle line items in one action — **confirmed**
- **Sync Inventory** — action button (manual) — reconcile hidden-variant stock after parent stock changes 0→positive — **confirmed**
- **Liquid install mode** — select(`Automatic` | `Expert` | `Manual`) — how the widget code lands in the theme — **confirmed**

### data
- **Price Plan** — select(`Basic` | `Premium`) via Settings > Price Plan — **confirmed**
- **Bundle performance stats** — reporting surface (read-only) — **confirmed**
- Discount stacking behavior is a *consequence* of Discounting Method, not a direct toggle: Variant Dependant allows Shopify discount codes to stack (risking double-discount); both Draft Order methods **disable** the checkout discount-code field entirely — **confirmed**

## data_model
What it persists and where:

- **Bundle definitions**: stored in **Bold's external app database** (keyed to shop), not Shopify metafields/metaobjects — **(inferred)** (legacy 2013 app architecture; no metaobject usage documented) — **confirmed** it is app-side config, **(inferred)** as external DB.
- **Hidden bundle variants**: persisted **in Shopify** as real (hidden) product variants with bundle pricing and "N/A"/infinite inventory that decrements the parent — Variant Dependant only; bounded by Shopify's **100-variants-per-product** limit — **confirmed**.
- **Combo products**: real generated **Shopify products** (Premium/Group) — **confirmed**.
- **Draft orders**: persisted **in Shopify admin** on checkout-click, and **remain after checkout** (admin clutter) — Draft Order / Accelerated modes — **confirmed**.
- **Theme code**: injected **Liquid snippets/sections** in the merchant's live theme (auto/expert/manual install) — **confirmed**.
- **Custom CSS**: stored as merchant-authored style text in app settings — **confirmed**.
- **Stats**: bundle performance metrics stored app-side — **confirmed** it exists; **(inferred)** storage location.
- **Media**: per-item image URL overrides reference existing product/CDN images (no separate media library) — **confirmed**.
- **Codes**: none minted by the app for Draft Order modes (codes are actively suppressed); Variant Dependant mode leans on Shopify's own discount-code system — **confirmed**.
- **Sync/jobs**: **no automatic background sync/webhooks documented** — inventory reconciliation is the manual "Sync Inventory" button; price recalculation is a per-bundle `recalcOnPriceChange` toggle — **confirmed**. (Draft Order modes are described as "faster syncing" of prices, implying some backend price sync, but no scheduled cron is documented.) — **confirmed**/**(inferred)**

## visual_patterns
- **Layout archetypes**: product-page **bundle widget block** = title + horizontal/stacked list of bundle items (image + name + qty) + a single CTA button ("Style") + optional savings/flag badge. Cart page shows bundled line items with optional compare-at strikethrough. — **confirmed**
- **Component states**: available vs out-of-stock (bundle disappears/disables when parent variant hits 0); "N/A" infinite-inventory state on hidden variants; flag/badge shown vs hidden; button-styled title vs plain title (Mix & Match) — **confirmed**.
- **Motion/interaction**: **One-Click Add to Cart** (single action injects all bundle lines); on Draft Order modes the checkout button triggers a **draft-order handoff** that redirects to a Bold-generated checkout (with no discount-code field) — a hard navigation, not an inline UI update — **confirmed**.
- **Styling reality**: appearance is tuned mostly through **raw CSS**, not a design panel; button style is a small preset dropdown. Merchants report the widget can look off / conflict with theme styles after theme updates. — **confirmed**.

## reviews_signal
**Top praises** (defines "up to the mark"):
1. **Easy to set up and create bundles** — intuitive builder, quick to stand up — **confirmed**
2. **Real AOV / add-on sales lift** — "great way to create add-on sales"; positive ROI on ad spend — **confirmed**
3. **"Amazon-like" bundling at a fair price** — frequently-bought-together / kit feel — **confirmed**
4. **Responsive, patient support** (when it's good) — "top notch", "thoroughly explained" — **confirmed** (polarized; see complaints)
5. **Flexible bundle types + stacking with other discounts** — creative combinations — **confirmed**

**Top complaints** (defines failure modes):
1. **Inconsistent discount application** — "Bundle discounts sometimes appear on the cart page, and sometimes do not"; only some line items discounted — **confirmed** (core reliability failure)
2. **Missing items in cart** — "Not all of the products in the bundle are actually placed in the cart" — **confirmed**
3. **Price rounding / calculation errors** — "App rounded my bundle prices down for each item causing huge losses" — **confirmed** (direct revenue harm; note this is what `overrideCentValue`/rounding logic touches)
4. **Theme-integration conflicts** — app/theme updates "created several issues across the store"; injected Liquid breaks on theme changes — **confirmed**
5. **Slow support on critical issues** — "Support two weeks ago, and they still haven't resolved" — **confirmed** (contradicts praise #4 → the 21% 1★ tail)

## mapping_note
How this maps onto our constrained **RecipeSpec** vocabulary, and where it **exceeds a single-module recipe**:

- The *storefront face* (product-page bundle widget) maps cleanly to a single **theme.section** module: content (title, items, images), style (button style, compare-at), targeting (which products/collections), behavior (add-to-cart). A RecipeSpec can express the widget itself.
- The *discount mechanics* map to the **functions.cartTransform / functions.discountRules** space semantically, but Bold implements them **outside Functions** via hidden variants or draft orders. To recreate the vocabulary correctly, a recipe would emit a **cart_transform / discount Function** rather than mutating variants — i.e. the intent is one module, the correct implementation is a *second* extension type coordinated with the theme section.
- **Where it exceeds a single-module recipe:**
  1. **Persistent, queryable bundle data store** — bundles are stateful entities (type, items, pricing, method) that outlive any one render and must be read by both the storefront widget and the discount logic. This needs a **data store / metaobject-backed model**, not inline section settings.
  2. **Cross-surface blueprint with shared state** — the theme widget and the checkout-time discount (draft order / cart_transform) must **coordinate through the cart**; it is inherently a **multi-extension blueprint** (theme.section + a Function + admin builder), not one isolated module.
  3. **Side-effecting provisioning** — generating **hidden variants** or **combo products** in the merchant's Shopify catalog (and cleaning them up) is an **external side-effect / data-model provisioning** step beyond declarative render.
  4. **Reconciliation jobs + rule engine** — inventory sync (parent↔hidden-variant decrement, the manual "Sync Inventory" step) and price recalculation (`recalcOnPriceChange`) imply **background jobs / a small rule engine**; the BOGO buy-arm/get-arm and mix-and-match "N-from-collection" logic is a **rule-builder** that a flat recipe cannot capture.
