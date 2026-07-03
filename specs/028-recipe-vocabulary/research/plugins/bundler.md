# Bundler ‑ Product Bundles App

> Research record for the recipe-vocabulary study. Facts labeled **confirmed** (from
> App Store listing, vendor site bundler.app, help center, or reviews) or **(inferred)**
> where derived/uncertain. Not deprecated — live and actively maintained by the original
> vendor (Bundler.app, Slovenia). Carries the "Built for Shopify" badge.

## identity
- **name**: Bundler ‑ Product Bundles App — **confirmed**
- **vendor**: Bundler.app (Podutiška cesta 94, Ljubljana, Slovenia); launched 2019-07-02 — **confirmed**
- **category**: Product bundles (Marketing & conversion → Upsell & bundles) — **confirmed**
- **App Store URL**: https://apps.shopify.com/bundler-product-bundles — **confirmed**
- **rating**: 4.9 / 5 (92% 5-star, 6% 4-star, 1% 3-star, ~0% 2-star, 1% 1-star) — **confirmed**
- **review count**: ~2,360 — **confirmed**
- **install signal**: High-maturity, high-trust app; ~6 years live, thousands of reviews, "Built for Shopify" badge. Large install base (**inferred** from review volume + rating stability). — **confirmed** badge / **(inferred)** scale
- **pricing model**: Freemium, 3 tiers, recurring + usage-based billed per 30 days in USD — **confirmed**
  - **Free**: "unlimited revenue & orders," Buy X Get Y, volume discounts, product-page upsells, Shopify POS
  - **Premium $9.99/mo** (7-day trial): Mix & Match + tiered Mix & Match, custom landing pages, free shipping, funnel upsells
  - **Executive $19.99/mo** (7-day trial): bundle analytics, revenue tracking, conversion graphs, AOV insights

## surfaces
Bundler is fundamentally a **storefront widget + draft-order discount engine**, NOT a Shopify
Functions app. It predates and largely bypasses the Functions model. Mapped to our allowlist:

- **theme.section** — **confirmed (primary surface)**. Bundle widget renders as a theme **app block** (added via Theme Editor → Add block → "Bundler – Product Bundles" from App Blocks) and/or a theme **app embed** toggle. Default placement is at the end of the product page; can be placed on homepage, collection, or static pages. Shows the bundle offer: participating products, the discount/tier ladder, quantity pickers (Mix & Match), and an "add bundle to cart" action.
- **proxy.widget** — **confirmed**. Auto-generated **dedicated bundle landing pages** (each bundle gets its own promotional URL) and **shortcodes** (HTML snippets pasted into product descriptions / custom pages / page builders like PageFly). These are app-served/injected surfaces beyond the theme block.
- **functions.discountRules** / **functions.cartTransform** — **NOT used in the Functions sense** — **confirmed**. Discounts are NOT delivered via Shopify Function extensions. Instead the app builds a **draft order** with the computed discount and redirects the buyer to that checkout; optionally it can generate/apply a **discount code**. (This is the pre-Functions mechanism — see mapping_note.) Behaviorally it occupies the same role as `functions.discountRules` (conditional line-item/bundle discount) but implemented app-side.
- **pos.extension** — **confirmed (Free plan lists "Shopify POS")**. Bundle offers usable in POS. Depth unknown.
- **analytics.pixel** / **admin analytics** — **confirmed (Executive plan)**. In-app Analytics dashboard: how often each bundle discount was applied, revenue/AOV tracking, conversion graphs, order filtering by bundle name. This is an admin reporting surface rather than a storefront web pixel. — admin reporting **confirmed**; whether it registers a Web Pixel extension **unknown**
- **checkout.upsell / checkout.block** — **partial / unknown**. Listing mentions "checkout integration" and "cart drawer" + "cart upsells," but the discount handoff is via draft-order checkout, so true Checkout Extensibility blocks are **(inferred not present)**. Cart-drawer upsell is storefront-theme, not checkout.
- **admin.block / admin.action** — **unknown / (inferred none)**. Config lives in the app's embedded admin, not as merged Admin UI extensions.

**Cross-surface coordination**: The **bundle definition** (products + discount rule + display config) is the shared state. The **theme app block / landing page / shortcode** all read the same bundle definition and render the same offer. When the qualifying condition is met (right products + quantities in cart), the app's storefront JS hands off to a **draft-order checkout** (or applies a code) carrying the computed discount — this is the storefront-widget → checkout handoff. Analytics then reads back applied-discount events keyed by bundle name. So: one authored entity fans out to multiple render surfaces and converges on one checkout path.

## functional_model
Core entities (field lists **(inferred)** from documented controls unless noted):

```
Bundle = {
  id,
  name,                       // confirmed field
  description,                // confirmed field
  bundleType,                 // enum: classic | mix&match | volume/tiered | BuyXGetY  — confirmed set
  discountType,               // enum: percentage | fixedAmount | setDiscountOnProducts
                              //       | fixedBundlePrice | noDiscount | volume        — confirmed set
  discountValue,              // number tied to discountType
  condition,                  // enum: buyAllProducts(default)
                              //     | buyRequiredNonDiscountedProducts
                              //     | buyMin/MaxItemsFromBundle                        — confirmed set
  minItems, maxItems,         // for mix&match / volume                                — confirmed
  priority,                   // integer; higher wins when multiple bundles match      — confirmed
  displayMode,                // product-level vs variant-level display                — confirmed
  useMixMatchDisplay,         // toggle (checkbox)                                      — confirmed
  widgetHidden,               // toggle — "hide the widget for this bundle"            — confirmed
  freeShipping,               // Premium                                               — confirmed (feature)
  items: [ BundleItem ],
  landingPageUrl              // auto-generated                                        — confirmed
}

BundleItem = {
  product_ref,                // Shopify product/variant reference (picked via product picker)
  variant_ref,                // when variant-level display
  maxQtyPerProduct,           // "set > 1 so customers can buy more than 1 of each"    — confirmed
}

Tier (volume/tiered) = {
  minQty,                     // e.g. buy any 2 / any 3
  discount,                   // e.g. 20% / 30%
}                             // multiple tiers per bundle; alt. modeled as multiple
                              // mix&match bundles differentiated by `priority`         — confirmed pattern

AnalyticsEvent = { bundleName, appliedCount, revenue, order_ref }  // Executive        — confirmed shape
```

Key relationships: a Bundle references **existing** store products/variants (it does **not**
create new bundle products or SKUs — **confirmed**). No new inventory object; components stay as
separate line items in cart/order/invoice, so inventory is never duplicated or de-synced. Tiers
belong to a Bundle. Bundles compete via `priority` when multiple could match one cart.

## settings_taxonomy
The actual merchant-facing controls, grouped. Names are **confirmed** unless marked.

### content
- **Bundle name** — text — **confirmed**
- **Bundle description** — text — **confirmed**
- **Products in bundle** — product-picker (multi-select individual products/variants; cannot target a whole collection — must pick products individually) — **confirmed**
- **Widget heading / labels / call-to-action text** — text — **(inferred)** (reviews reference customizable text; exact field names unconfirmed)
- **Shortcode** — generated HTML snippet the merchant copies into descriptions/pages — **confirmed**

### style
- **Bundle/widget colors** (brand color match) — color — **confirmed** (reviews: "matching brand colors"; note: applies **globally across all products**, not per-product — a documented complaint)
- **Custom CSS / HTML** — text (code) — **confirmed** (listing: "Custom CSS/HTML customization")
- **Widget placement** — the block is positioned in Theme Editor; default = end of product page — **confirmed**
- **Mix & Match display** — toggle ("use the Mix & Match display for this bundle") — **confirmed**

### targeting
- **Discount condition** — select: `buy all products (default)` / `buy required non-discounted products` / `buy min–max items from bundle` — **confirmed**
- **Minimum items / Maximum items** — number — **confirmed**
- **Max quantity per product** — number (must be > 1 for build-your-own) — **confirmed**
- **Priority** — number (resolves which bundle applies when several match; higher priority wins) — **confirmed**
- **Bundle placement pages** — where the app block/embed is added (product / collection / home / custom page) — **confirmed**
- **Market / currency targeting** — **NOT available** (documented review complaint: no market-specific bundle control) — **confirmed absence**

### behavior
- **Discount type** — select: `percentage` / `fixed amount` / `set discount on products` / `fixed bundle price` / `no discount` / `volume` — **confirmed**
- **Discount value** — number (per type; per-tier for volume) — **confirmed**
- **Volume/tier ladder** — repeatable rows of `min quantity → discount` — **confirmed** (via Volume type; or emulated with multiple prioritized mix&match bundles)
- **Buy X Get Y / BOGO** — rule config — **confirmed** (Free plan feature)
- **Free shipping** — toggle — **confirmed** (Premium)
- **Auto-apply discount** — toggle — **confirmed** (listing: "auto-apply discount functionality")
- **Apply via discount code vs draft order** — behavior switch in settings — **confirmed**
- **Hide widget for this bundle** — toggle (deliver discount without showing the widget) — **confirmed**
- **Display mode** — product-level vs variant-level — **confirmed**
- **Subscription compatibility** — integrates with subscription products (e.g., Seal Subscriptions) for recurring bundles — **confirmed** (feature); exact toggle **unknown**

### data
- **Analytics dashboard** (Executive): applied-discount frequency, revenue tracking, conversion graphs, AOV insights, order filtering by bundle name — **confirmed**
- **Applied-discounts monitoring** — **confirmed**
- No merchant-managed schema/metaobject config surfaced to the merchant — **(inferred)**

## data_model
- **Bundle definitions** persisted in the **app's own external database** (Bundler.app backend), keyed by shop — **(inferred)**; the app is a hosted service, config lives app-side, not as Shopify metafields the merchant edits.
- **Does NOT create Shopify products / variants / SKUs** for bundles — uses existing catalog products and discounts them — **confirmed**. Therefore no duplicated inventory objects; components remain individual line items on cart/order/invoice.
- **Discount delivery artifacts**: **draft orders** (created on the fly with the computed discount, buyer redirected to that checkout) and, optionally, **Shopify discount codes** — **confirmed**. Note: because it uses draft-order checkout, Shopify **automatic discounts do not stack** on a qualifying bundle — **confirmed** limitation.
- **Landing pages**: auto-generated per-bundle URLs served/injected by the app — **confirmed**.
- **Storefront rendering**: theme **app block** + **app embed** (theme app extension), plus **shortcode** HTML — **confirmed**.
- **Analytics/event data**: applied-discount counts and revenue stored app-side, surfaced in the in-app Analytics tab — **confirmed** (Executive).
- **Media/CDN**: no dedicated media model beyond product images pulled from Shopify — **(inferred)**.

## visual_patterns
- **Layout archetypes**: (1) product-page **bundle widget** block listing participating products with per-product image/title/price and a combined "add bundle" CTA showing the discounted total; (2) **Mix & Match / Build-a-Box** grid with per-product quantity steppers and a live-updating discount as min-items threshold is crossed; (3) **volume/tier ladder** ("buy 2 → 20% off, buy 3 → 30% off") shown as a tier list; (4) **standalone bundle landing page** archetype (hero + product list + CTA). — **confirmed** archetypes
- **Component states**: below-threshold (discount not yet unlocked) vs qualified (discount shown/applied); quantity-limited state (max-per-product reached); hidden-widget state (discount applies silently). — **confirmed** logically
- **Motion/interaction**: live price/discount recalculation as quantities change; cart-drawer price update after add (comparable apps expose a "delay after cart change" ms slider for redraw). Handoff animation is a redirect to draft-order checkout. — cart-drawer update **confirmed**; specific transitions **(inferred)**
- **Theming**: inherits store fonts/theme; color accents are merchant-set (global, not per-product). Custom CSS/HTML escape hatch. — **confirmed**

## reviews_signal
**Top praises** (from App Store reviews, 4.9/5):
1. **Fast, responsive support** — issues often resolved < 24h; most-cited positive. — **confirmed**
2. **Generous free plan** — "unlimited revenue & orders" free tier covers many merchants' needs. — **confirmed**
3. **Easy, intuitive setup** — clean bundle design, simple add/remove of products. — **confirmed**
4. **No inventory duplication** — uses existing products, so stock stays in sync (works with Shopify Markets / stock mgmt). — **confirmed**
5. **Drives AOV / sales lift** — merchants report measurable revenue increase from bundle offers. — **confirmed**

**Top complaints / failure modes**:
1. **Breaks on high-variant products** — a merchant with 80 variants reported broken bundles + abandoned carts ("can't handle high numbers of variants"). — **confirmed**
2. **Global color styling only** — bundle colors apply across all products, no per-bundle/per-product styling. — **confirmed**
3. **Weak original-vs-discounted price comparison** — hard to show strike-through savings clearly. — **confirmed**
4. **Hidden/unintuitive config in places** — some settings buried; UI not obvious for every scenario. — **confirmed**
5. **No market-specific control** — can't scope bundles to specific Shopify Markets; draft-order discounts don't stack with automatic discounts. — **confirmed**

## mapping_note
A single Bundler **bundle** maps loosely onto a RecipeSpec whose primary surface is
`theme.section` (the product-page bundle widget) plus a `functions.discountRules`-shaped
conditional discount. A "buy any 2 for 20% off" tiered offer is close to a single-module
recipe: one storefront section + one discount rule.

**Where it EXCEEDS a single-module recipe:**
1. **Persistent app-side data store + rule engine.** Bundles, tiers, priorities, and
   discount conditions live in an external DB with a matching/priority resolver
   ("higher priority wins when multiple bundles match a cart"). This is stateful,
   multi-record configuration and a conditional rule engine — well past a stateless,
   single-render module. It needs a datastore + evaluator, not just template + props.
2. **Cross-surface blueprint from one authored entity.** One bundle fans out to a theme
   app block, an app embed, a shortcode, AND an auto-generated landing page — plus a POS
   surface and an analytics/reporting surface — all reading shared state and converging on
   one checkout handoff. That is a coordinated multi-surface blueprint, not one module.
3. **External side-effect at checkout (draft-order / discount-code generation).** The
   discount isn't a static price rule; storefront JS computes eligibility live, then
   **creates a draft order (or mints a discount code) via the Admin API** and redirects the
   buyer. That's a runtime backend side-effect with an external write path — outside a
   declarative render-only recipe, and it also carries real interaction constraints
   (no stacking with Shopify automatic discounts).
4. **Analytics pipeline + background aggregation.** Per-bundle applied-discount counts,
   revenue, AOV, and conversion graphs imply event capture + background aggregation +
   an admin reporting surface (Executive tier) — a data pipeline, not a UI module.
