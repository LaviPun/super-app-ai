# Globo Product Options, Variant

> Status: **active, not renamed/deprecated.** The App Store listing name is "Globo Product Options, Variant — Product personalizer, custom product option w/ variant options" (app handle `product-options-pro`). No merge/rename/deprecation found; the vendor (Globo Options) also ships adjacent apps (GLO Color Swatch Variant Image) that overlap on swatches, but the options app itself is current and "Built for Shopify" badged. This record studies the live app directly.

## identity
- **name:** Globo Product Options, Variant (handle `product-options-pro`) — confirmed
- **vendor:** Globo Options (listed Hanoi, Vietnam; support also referenced from India) — confirmed
- **category:** Product variants / Custom products (our internal bucket: **options**) — confirmed
- **App Store URL:** https://apps.shopify.com/product-options-pro — confirmed
- **rating:** 4.9 / 5 — confirmed
- **review count:** ~4,594 (aggregators also cite 4,547) — confirmed
- **install signal:** ~30,467 live stores (StoreLeads); YoY growth ~12.7%, QoQ ~0.0%; ~0.1% of all Shopify stores; apparel-heavy (27.7%), US-heavy (36.5%) — confirmed
- **pricing model:** Freemium, monthly subscription with annual discount + separate higher Shopify Plus tiers — confirmed
  - **Free:** unlimited option sets/products/orders, 15 option types, unlimited templates, no watermark — confirmed
  - **Premium $9.90/mo** ($99/yr; Plus $39.90/mo): 20 option types, import/export, price add-ons, condition logic tied to Shopify variants, file upload (20MB), character limits, DateTime/email/phone/color picker, per-option quantity box, multi-language — confirmed
  - **Advanced $19.90/mo** ($199/yr; Plus $59.90/mo): 30+ option types, option groups, Product Personalizer w/ live preview, file upload (20 files × 100MB), edit options in cart, POS support, custom order tags, email notifications, show options by customer login/tags — confirmed
  - 14-day free trial on paid tiers — confirmed

## surfaces
Mapped to internal extension-type vocabulary (allowlist):

- **theme.section** (primary) — App-embed/app-block that injects the options widget into the **product page** below/around the buy button. Renders every configured field (text, swatch, dropdown, file upload, date, etc.), enforces required/conditional logic client-side, and appends selections to the add-to-cart form. This is the core surface. — confirmed
- **theme.section** (cart) — A second theme surface renders on the **cart page**: shows chosen option values as line-item properties, an **"Edit Options"** button to re-open the widget, and controls to lock add-on line quantity/removal. — confirmed
- **theme.section** (collection quickview / home / regular pages) — Optional widget rendering on Quickview on collection pages and on Home/Regular page featured sections. — confirmed
- **functions.cartTransform** *(inferred)* — Add-on pricing is implemented NOT via a native price-modifying Function but by injecting a **hidden add-on product** as a separate cart line (see functional_model). Merchant-facing effect resembles cartTransform "merge/expand," but the mechanism is a companion line item, not a Function. Flag as *(inferred)* that no true cart-transform Function is used. — (inferred)
- **pos.extension** — POS support on the Advanced tier (options usable in Shopify POS). — confirmed
- **admin.block / admin.action** *(inferred)* — Custom order tags + email notifications on order create imply admin/order-side automation (tagging orders, notifying on customized orders); exact extension form unconfirmed. — (inferred)
- **NOT** checkout.upsell / checkout.block / postPurchase.offer — no evidence of Checkout UI extensions; option data reaches checkout/order purely as **line item properties**, and add-on cost rides in as its own cart line rather than a checkout-stage mutation. — confirmed (absence)

**Coordination across surfaces:** shared state is the Shopify **cart/line-item-property** channel plus the app's own **option-set** config. Product-page widget writes selections into the add-to-cart form → they land on the line as `line.properties` → the cart-page widget reads those same properties back to render the "Edit Options" round-trip → order/email/packing-slip templates read `line_item.properties`. Add-on charges are handed off as a **paired hidden product line** created at add-to-cart time and kept adjacent to the parent line (quantity/removal locked so the two stay in sync). — confirmed

## functional_model
Core entities (concrete shapes; field names normalized, `(inferred)` where not explicitly documented):

- **OptionSet** = { id, name, targeting: TargetRule[], options: Option[], template/preset ref, priority *(inferred, for overlap resolution)* } — a reusable group of fields applied to a matched set of products.
- **Option** (field) = { id, type ∈ {text, textarea, number, dropdown/select, radio, checkbox, button, colorSwatch, imageSwatch, colorDropdown, imageDropdown, fileUpload, paragraph, popupModal, dateTime, email, phone, colorPicker, multiSelect, dimensions, font, giftWrap}, label, required:bool, hidden:bool, placeholder, defaultValue, min/max (numeric), charMin/charMax (text), allowedExtensions[] (file), values: OptionValue[], addOn: AddOn?, conditions: ConditionRule[], style: {htmlClass, columnWidth, helpTextPosition} }.
- **OptionValue** (per choice, for select/swatch/radio) = { label, swatchColor|swatchImage, addOnPrice?, default:bool }.
- **AddOn** = { priceMode ∈ {fixed, dynamic, perCharacter}, quantityMode ∈ {fixed, dynamic}, addOnProductRef → **hidden Shopify Product**, label format supporting `{{addon}}` placeholder }. Selecting a priced option adds this hidden product as a **separate cart line** priced to the add-on amount. — confirmed
- **ConditionRule** = { matchSource ∈ {previousOption, shopifyVariant}, operator ∈ {isEqual, isNotEqual, greaterThan, lessThan, startsWith, endsWith, contains, doesNotContain, charCount, selectionCount, fileCount}, value, action ∈ {show, hide} }, combined with **AND / OR**. — confirmed
- **TargetRule** = manual product list | automated rule on {Product Title, Type, Vendor, Tag, Price} with {equals, contains, greaterThan} | All Products; Advanced tier adds customer-login / customer-tag gating. — confirmed
- **Order side:** selections persist as **line item properties** (`line.properties` / `line_item.properties`); no separate order metafield store documented. — confirmed

Relationships: OptionSet 1—N Option; Option 1—N OptionValue; Option 0—1 AddOn (AddOn → 1 hidden Product); OptionSet N—M Product via TargetRule; Option 1—N ConditionRule referencing sibling Options or Shopify variants.

## settings_taxonomy
The actual merchant-facing knobs, grouped. (All confirmed unless marked.)

### content
- **Option Set → Name** (text)
- **Add Option → Type** (select[ text, textarea, number, dropdown/select, radio, checkbox, button, color swatch, image swatch, color dropdown, image dropdown, file upload, paragraph, popup modal, dateTime, email, phone, color picker, multi-select, dimensions, font, gift wrap ]) — 15 types free / 20 premium / 30+ advanced
- **Label / Name** (text) per option
- **Placeholder text** (text)
- **Default value** (text / select-of-values)
- **Help text** (text) + **help text position** (select)
- **Option values list** (repeatable rows: label + swatch color/image) for select/swatch/radio/button
- **Paragraph / Popup Modal content** (rich text / HTML) for static info blocks
- **Size charts** (image / HTML popup) — confirmed
- **Custom CSS / HTML** injection — confirmed
- **Multi-language / translation** of labels & values (18 languages) — confirmed

### style
- **App Position** (select — placement on product page)
- **Alignment** (select[ Left, Right, Center, RTL ])
- **Column width** (per option — select/number, layout grid)
- **HTML class** (text — custom styling hook)
- **Swatch Tooltip** (toggle — hover value display)
- **Selected Value Display** (toggle — echo chosen value near label)
- **Limit Height** (toggle + scrollbar — cap widget height)
- **Swatch shape/size** *(inferred — standard for swatch apps; not explicitly named in docs)*
- **File preview** (toggle — show uploaded-file thumbnail on product page)

### targeting
- **Apply to products:** Manual selection (product-picker) | Automated Rules | All Products (select/mode)
- **Automated Rule builder** (rule-builder): field ∈ {Product Title, Type, Vendor, Tag, Price}, operator ∈ {equals, contains, greater than}, value
- **Customer visibility** (Advanced): **Show options by customer login** (toggle) / **by customer tags** (tag rule) — confirmed
- **Conditional Logic** (rule-builder, per option): match source {previous option | Shopify variant}, operator {is equal / is not equal / greater than / less than / starts with / ends with / contains / does not contain / char count / selection count / file count}, action {Show | Hide}, combine {AND | OR}

### behavior
- **Required field** (toggle)
- **Hidden field** (toggle)
- **Character limit min/max** (number) for text; **min/max** (number) for numeric
- **Allowed file extensions** (text list) + **file count** (number; 1 free → 20 files advanced) + **max size** (20MB premium / 100MB advanced per file)
- **Quantity box per option** (toggle) — per-option quantity
- **Add-on quantity mode** (select[ fixed, dynamic ]) and **Per Character** pricing (toggle)
- **Redirect to Cart** after add-to-cart (toggle — product page)
- **Scroll to first error** (toggle — product page)
- **Show Widget on Quickview** (toggle — collection page)
- **Edit Options button** (toggle — cart page)
- **Disable quantity / removal for add-ons** (toggle — cart page, keeps add-on line synced to parent)
- **Custom order tags** (text — Advanced; tag orders containing customized items)
- **Email notifications** (toggle — Advanced)

### data
- **Add-on price** (money) per option/value → opens **Add-on window** to set an **add-on product/price** (create new hidden product or pick existing)
- **Add-on Money format** (text/select) and **Label format** supporting `{{addon}}` placeholder
- **Show add-on for inputs/options** (toggle) and **Add-on message display** (toggle)
- **Dynamic addition to product price** (toggle — reflect add-on in displayed price)
- **Import / Export option sets by CSV** (file — bulk manage option sets/variants)
- **Templates / presets** (save & reuse option-set configurations — unlimited)
- **SKU management** for option/add-on products; **Hide out-of-stock options**; hide add-on products from collection pages (toggle) — confirmed

## data_model
- **Option-set / option / condition config:** stored in the **app's own backend DB** (Globo-hosted), keyed to shop + product/target rules. Not native Shopify metafields for the config itself *(inferred — no metaobject/metafield storage documented; config lives app-side).* — (inferred)
- **Customer selections at purchase:** persisted natively as **Shopify line item properties** on the cart line and order (`line.properties` / `line_item.properties`); surfaced in order detail, confirmation emails, packing slips, staff notifications. — confirmed
- **Add-on charges:** materialized as **real (hidden) Shopify Products** created/selected inside the app; the charge is a **separate cart line** paired to the parent line, quantity/removal locked. Hidden from collection/search via the app's hide setting. — confirmed
- **Uploaded files:** stored/served via the app's media/CDN; referenced from the line item property as a URL; limits 20MB (premium) → 100MB × 20 files (advanced). — confirmed
- **Order tags / notifications:** written to the Shopify order (tags) + app-driven emails (Advanced). — confirmed
- **CSV:** import/export path for option sets (bulk config), app-side. — confirmed

## visual_patterns
- **Layout archetypes:** vertical stack of labeled fields injected into the product form; configurable grid via **column width** per option (1/1, 1/2, etc.); optional height-limited scroll container. Swatch rows (color/image) render as a horizontal chip set; dropdowns/radio/checkbox as standard form controls; file upload as a drop/attach control with optional thumbnail preview. Popup-modal & paragraph render as info blocks / triggered modals. **Product Personalizer (Advanced)** overlays a **live preview** canvas that updates as text/image options change. — confirmed
- **Component states:** required (error + "scroll to first error"), conditional show/hide (fields appear/disappear on dependent selection), out-of-stock hidden, selected-value echo near label, swatch **tooltip on hover**, disabled/locked add-on line in cart. — confirmed
- **Motion/interaction:** reactive show/hide on selection change (AND/OR rule evaluation client-side), dynamic price update as add-ons toggle, live-preview re-render on input, cart-page "Edit Options" round-trip re-opening the widget with prior values pre-filled, RTL/alignment layout switch. — confirmed

## reviews_signal
**Praises (top):**
1. **Support speed/quality** — repeatedly cited ("resolved in under two minutes," fast, friendly, reliable). — confirmed
2. **Clean, easy admin** — "straightforward, easy to learn," fast to implement, flexible across themes. — confirmed
3. **Deep customization / variant handling** — handles highly customizable products and large variant counts while staying synced with Shopify inventory. — confirmed
4. **Generous free tier** — real value at $0, unlimited sets/products. — confirmed
5. **Regular updates** — active dev team keeps it competitive. — confirmed

**Complaints (top):**
1. **Data sync / stale config** — deleted option sets still rendering on storefront; features "randomly stopped working," multi-hour/day downtime. — confirmed
2. **Support inconsistency** — some merchants report zero follow-up ("give us time" with no updates) on critical issues. — confirmed
3. **Conditional-logic fragility after updates** — complex conditional formatting "completely wrong" post-update; heavy setups (50+ products) broke. — confirmed
4. **Support language barrier** — troubleshooting hampered by poor English on some tickets. — confirmed
5. **Price creep** — perceived as "extremely expensive" relative to earlier reliability. — confirmed
- Note: no recurring "options don't reach checkout/order" complaint — the line-item-property path is generally reliable; failure modes cluster on **config/rule-engine correctness and add-on line sync**, not on data reaching the order. — confirmed

## mapping_note
Maps cleanly onto our RecipeSpec **only for the render layer**: a single `theme.section` app-block that draws a stack of typed fields (our control-pack vocabulary already covers text/select/swatch/color/number/file/date/toggle) and appends line-item properties. That part is one module.

It **EXCEEDS a single-module recipe** in several structural ways:
1. **Persistent app-side data store + config CRUD.** Option sets, values, conditions, and targeting rules live in a backend DB and are edited in a full admin UI (create/import/export/template). A single stateless recipe can't own a mutable multi-entity store (OptionSet → Option → Value → Condition) with CSV bulk I/O.
2. **A real conditional-logic rule engine.** Per-option show/hide rules with 10+ operators (incl. char/selection/file counts), AND/OR composition, and a match source that can be a **sibling option OR a Shopify variant**, evaluated live on the storefront. This is a rule-engine capability, not a static field spec.
3. **Cross-surface blueprint with shared state.** Product-page widget ⇄ cart-page "Edit Options" ⇄ order/email/packing-slip templates ⇄ POS, all coordinating through line-item properties. That's a multi-surface blueprint, not one section.
4. **External side-effects at add-to-cart.** Priced options spawn **hidden add-on Products** as paired cart lines (with quantity/removal locking, per-character/dynamic pricing), plus file uploads to app CDN and order tagging/emails. These are write-side effects into the merchant's catalog and order pipeline — a background-job / cart-manipulation concern that a pure render recipe cannot express (and which, in our vocabulary, would want a `functions.cartTransform`-style companion rather than the hidden-product hack).
