# Kickflip — Custom Product Builder / Product Configurator

> **Rename note:** The target "Kickflip Custom Product Builder" is the current name for the app that shipped for years as **MyCustomizer** (by the same Montréal vendor, formerly "MyCustomizer Inc."). The App Store listing slug is still `mycustomizer-1` and the storefront line-item properties are still prefixed `_mczr` (short for MyCustomizeR), confirming continuity. The public product/brand is now uniformly "Kickflip"; the listing title reads **"Kickflip product configurators — Visual product personalizer boosting engagement & sales."** No functional deprecation — it is actively maintained and holds a "Built for Shopify" badge. What changed: brand name, the domain (gokickflip.com), and (per reviews) the pricing model shifted from pure pay-per-transaction to a fixed monthly base + declining transaction fee. (confirmed)

## identity
- **name:** Kickflip product configurators (listing title "Kickflip product configurators — Visual product personalizer…"; app brand "Kickflip"; legacy "MyCustomizer") (confirmed)
- **vendor:** Kickflip (formerly MyCustomizer Inc.), Montréal, Canada; App Store partner page `partners/mycustomizer2` (confirmed)
- **category:** Product options / product customizer & configurator (Store customization) (confirmed)
- **App Store URL:** https://apps.shopify.com/mycustomizer-1 (confirmed)
- **rating:** 4.4 / 5 (confirmed)
- **review count:** ~129 reviews (82% 5★, 5% 4★, 1% 3★, 4% 2★, 8% 1★) (confirmed)
- **install signal:** "Built for Shopify" badge present; cross-platform (Shopify, WooCommerce, Wix, custom); vendor markets DTC/manufacturing brands. Exact install count not published on listing → unknown (confirmed badge; count unknown)
- **pricing model:** Base plan **$59/mo + 1.95%→0% per customized product sold** (transaction fee declines with volume); add-ons **White-label +$49/mo**, **Configure-Price-Quote (CPQ) +$99/mo**; 14-day free trial. (confirmed; note reviews reference an older pure per-transaction / lower-fee model that was changed)

## surfaces
Kickflip is essentially **one large storefront widget** that replaces the native variant picker on the product page, plus an embedded merchant admin (its own dashboard, not Shopify admin blocks).

- **`theme.section`** — PRIMARY. The customizer mounts on the product page via theme integration / Online Store script tags (theme app embed or a `<div>` mount injected into the product template). It renders the full interactive configurator (choice panel + live preview canvas) in place of / alongside the buy box. Merchant maps a Shopify product to a Kickflip "product." (confirmed)
- **`proxy.widget`** — the configurator itself is a server-backed JS app: it loads the product's questions/answers/rules/theme from Kickflip's backend, computes live price and preview, and on add-to-cart **generates a "design"** server-side (persisted, with a shareable link and generated preview/print images). This is not static Liquid — it is a hosted widget hydrated from Kickflip. (confirmed behavior; classified inferred)
- **Cart page (theme)** — merchant pastes Kickflip snippet code into the cart template ("UPDATE CART" flow in the dashboard) to render the custom preview image and selected-option list next to the line item. Maps to `theme.section` (cart) editing. (confirmed)
- **Order data → native Shopify order** — customization is passed as **line-item properties** (the recommended Shopify mechanism), including immutable `_mczr` properties, so the design/preview and chosen options appear on the Shopify **Orders** page and packing slip. NOT a Function; it rides the standard add-to-cart line item. (confirmed)
- **`admin.block` / `admin.action`** — NONE in Shopify admin. All merchant configuration lives in Kickflip's own embedded/standalone dashboard (product builder, theme editor, order sheet), not in Shopify admin extension blocks. (inferred)
- NOT present: `functions.cartTransform`, `functions.discountRules`, `functions.deliveryCustomization`, `functions.paymentCustomization`, `checkout.upsell`, `checkout.block`, `postPurchase.offer`, `pos.extension`, `customerAccount.blocks`, `analytics.pixel`, `flow.automation`. Pricing is not enforced via a Function — the computed price is carried into checkout via the line item / variant mechanism (see data_model). (inferred)
- **Coordination:** single-surface at heart (product-page widget) with a **handoff chain**: product-page configurator → generates a **design** (Kickflip DB + CDN images) → writes **line-item properties** onto the Shopify cart line → surfaces in **cart template snippet** → lands on the **Shopify order** + Kickflip **Order sheet** (production data) → optional print-ready file export to production. Shared state = the design ID and its line-item properties threaded from storefront to order to fulfillment. (confirmed)

## functional_model
Core entities (concrete):
- `product (customizer) = { id, shopify_product_ref, customizerTitle, theme_ref, views[], layers[], questions[], rules[], pricing{basePrice, equations[]}, version, published(bool) }`
- `view = { id, label, previewImage, order }` — a product perspective/angle (front/back/side); preview canvas can display multiple views.
- `layer = { id, type(image|text|logo), z_order, view_ref, bound_question_ref }` — stacking order of rendered elements ("Reordering layers").
- `question = { id, title, description?, inputType, displayType, required(bool), showInOrderSummary(bool), showInProductBuilder(bool)/"behind the scene", group_ref?, answers[], rules_touching[] }`
- `answer = { id, label, description?, isDefault(bool), image?, colorHex?/lighting, extraPrice, sku?, linked_variant?, stock/inventory }`
- `input_type ∈ { dropdown, radio buttons, swatches, checkbox (multi-select), text input, file/logo upload, quantity, none/backend }` (confirmed set)
- `display_type ∈ { none, image, color, text, logo }` — how the answer affects the preview. (confirmed)
- `rule = { id, when(question=answer / condition), then(action) }` where action ∈ {hide/show question, hide/show answer, enforce/prevent combination, branch}. (confirmed)
- `pricing_equation = { formula(vars, operators), output_price }` e.g. `Width × Length × WoodPrice`. (confirmed)
- `group = { id, label, questions[] }` — organizes questions into sections. (confirmed)
- `design = { id, product_ref, selections{question→answer(s)/text/file}, computedPrice, previewImages[], printReadyFiles[], shareLink, created_at }` — created on add-to-cart. (confirmed)
- `order = { design_ref, shopify_order_ref, productionData{fields where showInOrderSummary}, status }` — appears in Kickflip **Order sheet** after purchase. (confirmed)
- Relationships: product → many questions → many answers; questions/answers bind to layers → render into views; rules cross-reference questions/answers; pricing equations read numeric-input questions; add-to-cart snapshots selections into a design; design → order → production files.

## settings_taxonomy

### content
- **Customizer title** — text (the product/config name shown to shopper) (confirmed)
- **Question Title** — text (the prompt shown, e.g. "Choose your color") (confirmed)
- **Description** — rich text on questions AND answers ("Add details about your questions and answers") (confirmed)
- **Answer name / label** — text (rename each answer) (confirmed)
- **Placeholder** — text (default text shown in a text-input question) (confirmed)
- **Text max length** — number (character limit for text personalization) (confirmed)
- **Show character count** — toggle (confirmed)
- **Font upload** — file (.ttf/.otf/.woff/.woff2) + font-choice list customers can pick from (confirmed)
- **Size chart** — content/image control (size charts listed as a supported option) (confirmed listing)
- **Translations** — per-string multi-language editing ("Translating your customizer") (confirmed)
- **Bad-words filter** — text/blocklist ("Preventing bad words from being typed") (confirmed)
- **Order summary lines** — which questions/answers render in the shopper-facing summary (see behavior toggle) (confirmed)

### style
- **Theme** — select (choose one of Kickflip's mobile-compatible customizer themes, e.g. "Barebones") (confirmed)
- **Theme editor** — controls for fonts, colors, alignment, and "every font, color, alignment, and even more" (per-element look & feel of the customizer UI) (confirmed)
- **Answer swatch image** — image upload (swatch/thumbnail per answer) (confirmed)
- **Color picker** — color/hex per color answer, with **lighting/shading adjustments** applied to the dynamically-colored image (confirmed)
- **Text color** — color (customer-facing: let shoppers choose text color) (confirmed)
- **Text outline** — style toggle/controls (add outline to text) (confirmed)
- **Text engraving effect** — style option (engraving render) (confirmed)
- **Font size** — number/select (merchant-fixed or customer-chosen) (confirmed)
- **Preview size** — number (size of the product-preview canvas) (confirmed)
- **Layer order** — reorder control (drag images/texts/logos front-to-back) (confirmed)
- **Multiple views** — configure product angles/perspectives shown in preview (confirmed)
- **Mobile preview** — preview toggle (phone icon) for mobile layout (confirmed)

### targeting
- **Product mapping** — product-picker (bind a Kickflip customizer to a specific Shopify product) (confirmed)
- **Conditional visibility (rules)** — rule-builder: "When [question]=[answer] then [show/hide question|show/hide answer|enforce/prevent combination]"; natural-language rule interface for branching/forks (confirmed)
- **Hide question when no answers available** — toggle (conditional visibility) (confirmed)
- **"Behind the scene"** — toggle (remove element from choice panel but keep it in the preview / as backend data) (confirmed)
- **Set as default** — per-answer toggle (green indicator marks the pre-selected answer) (confirmed)
- **Display an image based on customer's choice** — conditional image display bound to answers (confirmed)

### behavior
- **Input type** — select { dropdown, radio, swatch, checkbox/multi-select, text input, file/logo upload, quantity, none } (confirmed)
- **Display type** — select { none, image, color, text, logo } (how the answer changes the preview) (confirmed)
- **Make a question required** — toggle (mandatory answer enforcement) (confirmed)
- **Allow multiple answers** — checkbox input mode (multi-select) (confirmed)
- **Quantity / bulk ordering** — enable a quantity field; **bulk order** mode for teams/groups (order multiple items with per-item variations) (confirmed)
- **Print-ready / draggable elements** — toggle: let customers "move/drag, resize and rotate logo image and texts," then generate printable files (confirmed)
- **Optional logo** — toggle (customer decides whether to add a logo) (confirmed)
- **Repeating pattern** — toggle (turn a logo/text answer into a repeating pattern; shared answer across text/logo questions) (confirmed)
- **Start over / reset** — toggle (enable "Start over" button to reset the design) (confirmed)
- **Save & share design** — toggle (customers save/share their configured design via link) (confirmed)
- **Show in order summary** — per-question toggle (surface this answer in the shopper summary + cart list) (confirmed)
- **File upload (image/audio/video)** — allow uploads that are stored but do not render on the preview (confirmed)
- **Version history** — view/revert to previous versions of the customizer (confirmed)

### data
- **Base price** — number (product base price) (confirmed)
- **Extra price / upcharge** — number per answer (e.g. XL "+$5"); "Show price differences for options" (confirmed)
- **Pricing equation** — rule/formula builder with numeric variables + operators (e.g. `Width × Length × WoodPrice`) computing price in real time (confirmed)
- **Bulk / tiered pricing** — number table (per-item price that decreases as quantity increases) (confirmed)
- **Conditional / dynamic pricing** — price adjusts live from selections; premium upcharges, setup charges, add-on charges, variant upcharges (confirmed)
- **Tax-inclusive price display** — toggle (confirmed)
- **SKU** — text per answer (SKU management) (confirmed)
- **Inventory / stock** — stock availability, low-stock alerts, hide out-of-stock options, in-stock display, manual + auto updates (confirmed)
- **Linked Shopify variant** — bind an answer to a Shopify variant (for inventory/price/checkout) (inferred — implied by variant display + inventory sync)
- **Show in order sheet / production data** — toggle marking which answers are production data in the Kickflip Order sheet (confirmed)
- **Print-ready file generation** — output artifact settings for production hand-off (confirmed)
- **Import/copy answers** — reuse answers/colors across questions ("Import" to link colors) (confirmed)

## data_model
Kickflip persists its full configuration and transaction state in its **own external database + CDN**, not in Shopify:
- **Customizer definition** (products, views, layers, questions, answers, rules, pricing equations, groups, theme, translations, version history) lives in Kickflip's backend, edited in the Kickflip dashboard and **published** to the storefront. (confirmed)
- **Designs**: on add-to-cart a `design` record is created server-side capturing the shopper's selections, computed price, and **generated preview + print-ready images** (hosted on Kickflip's CDN), plus a shareable link. (confirmed)
- **Orders**: after checkout, a Kickflip `order` is created in the **Order sheet** with production data (the answers flagged "Show in order sheet"). (confirmed)
- **Shopify side**: customization is written onto the Shopify cart line as **line-item properties**, including immutable **`_mczr` properties** (design reference + preview/data), so the config renders on the Orders page, packing slip, and (via pasted snippet) the cart template. The computed custom price reaches checkout through the line item / variant mechanism rather than a Shopify Function. (confirmed for line-item properties; exact price-carrying mechanism — variant vs draft-order vs property — inferred)
- **Media/files**: customer image/logo uploads and (optionally) audio/video are stored by Kickflip; fonts (.ttf/.otf/.woff/.woff2) uploaded by merchant are stored server-side. (confirmed)
- **Inventory/SKU** state syncs between answers and Shopify (auto + manual updates). (confirmed)

## visual_patterns
- **Archetype:** split-panel configurator — left **choice panel** (grouped questions with swatches/dropdowns/text fields/upload buttons) + large **live preview canvas** on the right showing a photoreal composite of stacked image/color/text/logo layers across multiple views/angles. Replaces the standard product gallery + variant picker.
- **Preview engine:** desaturated base product images receive **dynamically applied color** (hex + lighting/shading), text rendered with chosen font/size/color/outline/engraving, uploaded logos placed on layers; multi-view switcher (front/back/side); zoom/high-quality render; drag/resize/rotate for print-ready placement.
- **Component states:** default-selected answer (green indicator), required (blocks add-to-cart until answered), hidden/branched (rule-driven show/hide), out-of-stock (hidden or disabled), "behind the scene" (in preview but not in panel), character-count/limit on text, real-time price badge updating on every selection.
- **Flows:** live price update → order summary list → add-to-cart (design generated) → optional save/share link → "Start over" reset.
- **Interaction/motion:** real-time preview repaint on selection, drag-drop element placement, mobile-responsive layout (mobile preview toggle), instant recalculated price. Emphasis on photoreal quality and no per-variant image authoring.

## reviews_signal
**Praise (top):**
1. **Support** — fast, caring, hands-on customer success (video call, email, live chat); most-cited strength.
2. **Depth of customization** — handles complex multi-component builds, layered images, material selections, dynamic coloring competitors can't match.
3. **No-code + immediate Shopify integration** — configurators go live without developers; "integration into own shop is immediate."
4. **Photoreal live preview** — high-quality multi-view visualization boosts buyer confidence.
5. **Reliability over time** — consistent output quality and uptime reported over 1+ years.

**Complaints (top):**
1. **Steep learning curve** — "nearly as high a learning curve as mid-level Photoshop"; setup is genuinely complex despite tutorials.
2. **Monthly base fee too high for small/new sellers** — the $59/mo base "kills your product before launch"; some churned to cheaper competitors ("1/6 the price").
3. **Pricing-model change** — shift from pay-per-transaction toward fixed monthly + fee alienated early/small merchants.
4. **Currency disadvantage** — non-USD merchants "earning in weaker currency, paying dollars" feel the fee/base disproportionately.
5. **Billing friction** — isolated reports of wrong/over-billing that took months to resolve. (No notable complaints about mobile, load speed, image quality, or cart/order data integrity surfaced.)

## mapping_note
Kickflip maps onto our vocabulary primarily as a **`theme.section` (product-page) + `proxy.widget`** pair, but it **decisively exceeds a single-module recipe** in several structural ways:

1. **It is a nested rule/entity engine, not a settings sheet.** A RecipeSpec expresses flat knobs; Kickflip's core is a *product-builder graph*: questions → answers → layers → views, cross-linked by a **conditional-rule engine** (when/then show-hide-enforce-branch) and a **pricing-equation engine** (variables × operators computing price live). This needs a rule/formula interpreter and a recursive schema, not a fixed field list.

2. **It requires a stateful backing store + CDN, not storefront assets.** Every configuration, plus per-order **"designs"** (selections + generated preview/print images + share links) and an **Order sheet** of production data, live in an external DB and media CDN. Our section vocabulary has no home for a persisted design object or generated-image pipeline.

3. **It performs cross-surface handoff with threaded state.** Product-page config → line-item properties (`_mczr`) → cart-template snippet → Shopify order + packing slip → print-ready production files. That is a blueprint spanning storefront widget, cart, and order/fulfillment surfaces sharing a design ID — not one isolated module.

4. **It does real background/side-effect work:** server-side render of photoreal composites (dynamic recoloring, layer stacking, multi-view), print-ready file generation for production, file/media hosting, and inventory/SKU sync. These are external side-effects and jobs beyond any single storefront section's reach.
