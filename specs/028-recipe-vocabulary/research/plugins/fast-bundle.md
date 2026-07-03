# Fast Bundle — Product Bundles

## identity
- **name**: FBP | Fast Bundle & Upsell App (App Store listing title; formerly "Fast Bundle — Product Bundles") (confirmed)
- **vendor**: Fast Bundle (developer office listed Richmond, BC, Canada; team India-based) (confirmed)
- **category**: Product bundles / Upsell and cross-sell (Marketing & conversion) (confirmed)
- **App Store URL**: https://apps.shopify.com/fast-bundle-product-bundles (confirmed)
- **rating**: 5.0 / 5 (98% five-star) (confirmed)
- **review count**: ~3,030 (confirmed; ranged 2,690–3,030 across sources over time)
- **install signal**: ~20,322 stores; carries "Built for Shopify" badge; "Popular with stores like yours"; launched Nov 26, 2020 (confirmed)
- **pricing**: Free on dev stores; Standard tiers gated by monthly bundle sales — $19/mo (≤$1K), $49/mo (≤$3K), $139/mo (≤$10K); 7-day trial (confirmed)

## surfaces
Mapped to internal extension-type vocabulary:
- **theme.section** / **proxy.widget** — The **bundle builder / upsell widget** rendered on the **product page**, in the **cart drawer**, on **collection pages**, and as a **standalone page**, plus **pop-ups**. This is a theme app extension (App Blocks) injected into the PDP; it collects the customer's selections and quantities. (confirmed: "Product page upsell", "Cart drawer", widget placement "on product pages, collections, or a standalone page")
- **functions.cartTransform** — The **Cart Transform BAP** mode. A hidden **dummy/virtual "Bundle As a Product" (BAP)** placeholder is added to cart; a Cart Transform Function **expands/splits it into the real component line items** at checkout, grouped under the bundle name. The listing explicitly requests **"Cart transforms (Shopify Functions)"** access. (confirmed)
- **functions.discountRules** — Bundle pricing (%, fixed, tiered, BOGO, free-shipping) is applied as a discount. Listing requests **"Discount codes and promotions"** access; discounts attach to the bundle/line items. (confirmed the discounts exist; the exact Function type — product-discount vs. the BAP carrying a pre-discounted price — is (inferred))
- **checkout.upsell** / **checkout.block** — "One-click Add-ons" / upsell "at checkout"; listing lists **Checkout** as an integration point. Checkout is also where the Cart Transform expansion is displayed (dropdown of included products under the bundle name). (confirmed integration; exact UI-extension type (inferred))
- **pos.extension** — Integrates with **Shopify POS** (confirmed integration point; depth unknown)
- **analytics.pixel** — "Recommendation performance" tracking, A/B testing, "Optimization suggestions"; requests customer geolocation/device/activity data → implies a pixel or analytics collection layer (confirmed features; pixel mechanism (inferred))
- **admin.block / admin.action** — Bundle CRUD, AI Image Generator, and rules live in the embedded **Shopify Admin** app (confirmed app admin; not necessarily admin-block extensions)
- **flow.automation** — no evidence (unknown)

**End-to-end flow** (confirmed): (1) Merchant defines a bundle in the embedded admin (type, products/collections, pricing rule, presentation mode). Fast Bundle provisions a hidden **dummy BAP product** to represent it. (2) On the **product page**, the theme app extension renders the **bundle builder** (fixed list, mix-and-match grid, volume table, or FBT strip) with live price recalculation. (3) Add-to-cart injects either the component line items or the BAP placeholder into the **cart**, depending on the chosen presentation mode. (4) In **Cart Transform** mode, the cart shows a **single clean line item** (bundle name + discounted price); the **Cart Transform Function expands the BAP into its real component products at checkout**, each labeled "**Part of: <bundle name>**" with its own SKU. (5) Discount is carried through so pricing **holds through checkout**; the virtual BAP's SKU never appears in the order — only the real components do, each decrementing its own inventory when the order is paid.

## functional_model
```
bundle = {
  type: fixed | multipack | mix_and_match | volume_discount | buy_x_get_y(BOGO)
        | frequently_bought_together | cross_sell | add_on | build_a_box
        | variant_bundle | gift_box | subscription_box | wholesale,
  products[]      | collections[]        // fixed = explicit list; mix&match/volume = groups
  sections[]:     { source: collection|products[], min_qty, max_qty }  // mix&match "steps"
  pricing_rule:   { model: fixed_price | percentage | flat_amount | tiered/quantity_break
                          | cheapest_free | free_shipping | dynamic | wholesale,
                    tiers[]: { threshold_qty|threshold_value, discount } },
  presentation:   single_BAP | multi_BAP | cart_transform,   // cart/checkout/order display
  display_block:  { placement: product_page | cart_drawer | collection | standalone | popup,
                    layout, progress_bar, button_text, styling },
  inventory_mode: component-tracked (real product inventory; BAP is virtual)
}
```
- **Bundle types** (confirmed): Fixed, Multipack, Mix & Match, Volume/Quantity-break, Buy X Get Y (BOGO), Frequently Bought Together (AI-powered), Product Add-ons, Cross-sell, plus presets (build-a-box, gift box, subscription box, wholesale, variant bundle).
- **Pricing** (confirmed): fixed, tiered/quantity-break, flat & percentage discount, volume, free shipping, cheapest-item-free (in mix&match tiers), BOGO, dynamic/custom, wholesale. Tiers can **mix** percentage / fixed amount / cheapest-free / free-shipping within one tier structure.
- **Inventory** (confirmed): inventory is tracked on the **real component products**, decremented on order payment; the BAP dummy product is virtual and not sold. **Cart Transform BAPs escape Shopify's 100-variant-per-product limit** (key reason to use CT for large variant combinations).

## settings_taxonomy
**content**
- Bundle name / title, description (string)
- Component products/collections selector (product/collection refs)
- Mix&match **Sections/Steps**: each a group sourced from a collection or product list (confirmed)
- Button text & labels (string); progress-bar copy e.g. "2 of 4 selected" (confirmed)
- Multi-language (10 langs: EN, ES, FR, DE, PT-BR, IT, NL, DA, SV, TR) (confirmed)
- AI Bundle **Image Generator** for bundle creative (confirmed)

**style**
- Colors, fonts (match theme) (confirmed)
- **Custom CSS** and **Custom HTML** (confirmed)
- Layout / widget archetype (grid, steps, table) (confirmed conceptually)
- Placement: product page, cart drawer, collection, standalone page, pop-up (confirmed)

**targeting**
- "Custom rules" for targeted/conditional bundle recommendations (confirmed; exact predicate fields unknown)
- Multi-currency (confirmed)
- Per-section **min/max product selection limits** (quantity ranges) for mix&match (confirmed)

**behavior**
- **Discount type**: Single Discount (flat on all) vs Tiered Discount (more volume → more discount) (confirmed)
- Discount value: percentage / fixed amount / cheapest-free / free-shipping (confirmed)
- Application scope: "Apply to entire sections" vs "Apply to specific sections only" (confirmed)
- **Presentation mode** — "How to present the bundle in cart, checkout, and order": (confirmed exact labels)
  - "As a single product (Single BAP)"
  - "As separate line items (Multi BAP)"
  - "As expanded line items connected to the product (Cart Transform)"
- One-click add-ons / add-all-to-cart; progress bar toggle (confirmed)
- A/B testing (confirmed)

**data**
- Recommendation performance analytics, optimization suggestions (confirmed)
- 60-day order-history lookback for AI FBT recommendations (confirmed)

## data_model
Persists (confirmed unless noted):
- **Bundle definitions**: type, name, member products/collections, mix&match sections with min/max
- **Pricing rules**: model + tier table (thresholds → discount kind/value), scope
- **Presentation config**: single/multi BAP vs Cart Transform
- **BAP mapping**: a generated **dummy/virtual Shopify product** per bundle (has a required SKU that is suppressed from orders) mapped to the real component product/variant IDs; component line items are stamped "Part of: <bundle name>" (confirmed)
- **Display/style config** (placement, CSS/HTML, colors, copy, translations)
- **Analytics/AI store**: recommendation performance, A/B test data, 60-day order-history-derived FBT associations, customer geo/device/activity signals (confirmed data access; storage detail (inferred))

## visual_patterns
- **PDP bundle builder** — fixed-list "buy these together" card with combined discounted price (confirmed)
- **Mix-and-match grid / step selector** — sectioned product grid, per-section min/max, **progress bar** ("2 of 4 selected"), live subtotal (confirmed)
- **Volume/quantity-break table** — tiered rows ("37% off 3", "~50% off 6") with per-tier savings (confirmed)
- **Frequently-bought-together strip** — AI-recommended companion products with combined-add option (confirmed)
- **Cart drawer** bundle block and **pop-ups** (confirmed)
- Interaction: **add-all-to-cart**, **live price recalculation** as selections change, progress-to-threshold (confirmed)
- States: cart shows **one grouped line** (CT mode) → checkout **expands into a dropdown** of component items under the bundle name (confirmed). Known state bug: bundle "Sold Out" state can read the **dummy product's** inventory rather than the real components (see reviews).

## reviews_signal
**Praises** (confirmed)
1. **Support** — overwhelmingly the top theme; fast, patient, "above and beyond"; named agents (Aida, Maya, Daisy, Sara, Sally, Jazz, Adriana); bulk-update help.
2. **Solid core functionality** — handles complex setups (e.g., free gifts across multiple bundles) "exactly how we need them."
3. **Built-for-Shopify reliability / integrations** — plays well with themes and subscription/upsell apps (Recurpay, Subi, UpCart, PageFly, GemPages).
4. **Flexibility of bundle + pricing types** in a single app.
5. 5.0 rating with 98% five-star.

**Complaints** (confirmed / (inferred) — genuine negatives are sparse given 98% 5-star)
1. **Inventory/"Sold Out" accuracy** — reported case where a bundle did **not** show Sold Out though a component was OOS, because the theme add-to-cart pulled inventory from the **dummy BAP product** rather than real Shopify inventory (concrete, app-specific). (confirmed)
2. **Checkout split confusion** — general bundler-category issue: bundles splitting into individual components at checkout can surprise merchants/customers (mitigated by CT mode's grouped display). ((inferred) from category + CT-mode docs)
3. **Discount timing/accuracy** — general category risk (component price/discount lag, codes not applying) — not prominent for Fast Bundle specifically. ((inferred))
4. **Oversell risk** if component inventory not in sync across bundles — category-wide caution. ((inferred))
5. Pricing gates on **monthly bundle sales** volume (tier jumps $19→$49→$139) can bite growing stores. ((inferred) from pricing model)

## mapping_note
Building a real equivalent in our vocabulary requires a **coordinated blueprint (composite), not a single extension** — this is the flagship multi-surface case:
- **theme.section** (or **proxy.widget**) — the PDP/cart/collection **bundle builder**: renders fixed list / mix-and-match grid / volume table / FBT strip, does live price recalc, and emits the selection (product/variant IDs + quantities) into cart.
- **functions.cartTransform** — the **line-merging engine**: the exact job of Fast Bundle's Cart Transform BAP — take a placeholder/selection and **expand or merge** into grouped component line items that hold through checkout, stamped with a "part-of-bundle" relationship. This is mandatory for the "one clean cart line → expanded at checkout" behavior and for escaping the 100-variant limit.
- **functions.discountRules** — the **pricing engine**: applies %, fixed, tiered/quantity-break, BOGO, cheapest-free, and free-shipping rules to the grouped lines so the discount survives to the order. Must support **tiered structures mixing discount kinds within one tier set**.
- **checkout.block / checkout.upsell** — optional, for the checkout-side add-on upsell and for rendering the grouped bundle presentation in the checkout UI.
- Plus a shared **admin.block** surface for bundle CRUD and an **analytics.pixel** for recommendation performance / A/B / FBT.

**What a blueprint must express** that a bundle needs and where a single-surface RecipeSpec falls short:
1. **Cross-surface identity binding** — one bundle entity must fan out to a theme block, a cart-transform Function, and a discount Function that all reference the same bundle ID, component mapping, and pricing tiers. A flat single-module RecipeSpec has no concept of one logical entity emitting multiple co-registered extensions.
2. **A shared data contract** — the component→BAP mapping, "Part of: <bundle>" line-item stamping, and pricing-tier table must be authored once and consumed by all three surfaces. The RecipeSpec needs a shared `dataModel`/entity that provisions the virtual placeholder product and the mapping — additive provisioning across extensions, not per-module state.
3. **A pricing-rule schema rich enough for tiered/mixed discounts** (threshold → {percentage | flat | cheapest_free | free_shipping}), consumed by both the PDP preview (client price calc) and the discount Function (authoritative) so they agree.
4. **Presentation mode as a first-class knob** (single BAP / multi BAP / cart-transform) that changes which extensions get emitted and how cart lines are shaped — the blueprint must branch its extension set on a merchant setting.
5. **Inventory-source correctness** — the known Fast Bundle bug (Sold Out read from the dummy product) is exactly what a blueprint must specify: the theme block's availability state must bind to **real component inventory**, not the placeholder. Our RecipeSpec currently has no way to declare "this display field derives from aggregated component inventory, not this extension's own product."

Today's single-module RecipeSpec can express **one** of these surfaces (e.g. the PDP theme.section, or a lone cart-transform), but it cannot express the **coordinated set** with a shared bundle entity, cross-referenced IDs, a common pricing-tier contract, and conditional extension emission by presentation mode. That is precisely the gap the composite/blueprint model (`composeBlueprint`) must close for a genuine bundler.
