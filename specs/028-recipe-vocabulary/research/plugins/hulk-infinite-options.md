# Hulk Product Options (formerly Infinite Product Options)

> **Rename note (confirmed):** The app originally listed as **"Infinite Product Options"** by HulkApps has been **rebranded to "Hulk Product Options"** on the same App Store listing (URL slug still `product-options-by-hulkapps-1`). It was NOT merged or deprecated — it is the same product, same install base, continuously updated since launch (2018-03-01). Older aggregators still cite the "Infinite Product Options" name and stale stats (4.6★/871 reviews); the live listing is "Hulk Product Options." All facts below reflect the current live listing unless marked stale. This is the same vendor's current equivalent — no vendor switch occurred (contrast with Bold apps, which did migrate to Shop Circle). Note HulkApps itself is also owned/operated adjacent to Shop Circle's portfolio, but the listing remains under HulkApps branding.

## identity
- **name:** Hulk Product Options (formerly Infinite Product Options) — confirmed
- **vendor:** HulkApps (HulkApps.com) — confirmed; based in London, GB / dev team India — confirmed
- **category:** Product variants / options (task category: options) — confirmed
- **App Store URL:** https://apps.shopify.com/product-options-by-hulkapps-1 — confirmed
- **rating:** 4.8 / 5 — confirmed (live listing); older name showed 4.6 (stale)
- **review count:** 1,133 reviews (977×5★, 67×4★, 13×3★, 14×2★, 62×1★) — confirmed (live); aggregators cite 871–1,875 (stale/inflated)
- **install signal:** No public install count; "Built for Shopify" badge awarded (confirmed) — signals high-volume, well-maintained app. Launched 2018-03-01 (confirmed); 20-language localization + enterprise/B2B positioning imply large install base (inferred).
- **pricing model:** Freemium/tiered subscription with 7-day free trial — confirmed
  - **Development:** Free (partner dev stores only) — confirmed
  - **Basic:** $10/mo ($100/yr) — 12 option types, color/image swatches, file upload, price add-ons, dynamic checkout button, collection-based option sets — confirmed
  - **Advanced:** $20/mo ($200/yr) — 20 option types, conditional logic, edit-in-cart, change product images per option, swatch+dropdown, one-time/percent charges — confirmed
  - **Enterprise:** $49.90/mo ($449/yr) — inventory/SKU management, advanced conditional logic, quantity selector, multi-textbox, formula-based option, Google Font picker, Mailchimp/Klaviyo integration, POS compatible — confirmed

## surfaces
Mapped to internal extension-type vocabulary:

- **theme.section** (confirmed) — PRIMARY surface. Renders the custom-options form block on the product page via an Online Store 2.0 **theme app extension / app block** ("Options Block") injected into the product template. Shows: the full set of option fields (dropdowns, swatches, text, file upload, date, etc.) with labels, help text/tooltips, add-on price display, and live running-total. Full CSS customization exposed to merchant. Install modes: "Automatic, manual, or expert installation" (confirmed).
- **proxy.widget** (inferred) — File uploads and dynamic option/price data are served/validated through the app's backend (app proxy or direct JS from app domain); uploaded files are stored app-side and referenced by URL. The storefront form JS reads option-set config for the current product from the app.
- **admin.block / admin.action** (inferred — embedded admin app, not a native Admin UI extension) — The merchant configuration lives in an **embedded Shopify admin app** ("Add a new option," "Display Name," "Unique Name," option-set builder, Bulk Apply, import/export). Closest allowlist match is `admin.block`, but it is really a full embedded app UI, not a single admin block. Marked as a coordination point rather than a clean single-surface map.
- **checkout.upsell / checkout.block** (partial, inferred) — Selections and add-on charges flow **into cart and are displayed through checkout** as line-item properties; "transparently displayed to customers throughout the cart and checkout process." It does NOT use a native Checkout UI Extension for input (input happens on the product page); it relies on line-item properties surviving to checkout. So this is a data-handoff to checkout, not a checkout input surface.
- **pos.extension** (confirmed — Enterprise tier) — "POS Compatible" on Enterprise plan.
- **analytics.pixel** — not used (confirmed absent from feature set).
- **functions.\*** (cartTransform / discountRules / delivery / payment) — NOT used. Critically, the app does **not** use Shopify Functions cartTransform to apply upcharges; it applies add-on prices via a legacy mechanism (see functional_model). This is why it **"does not work with Shopify discounts"** — a top complaint.
- **flow.automation** — not used (confirmed absent).

**Surface coordination:** State originates in the **embedded admin app** (option sets + rules persisted app-side), is **published to the product page theme block** which renders inputs and computes a running total client-side, then customer selections + computed add-on price are **handed off as Shopify line-item properties** into the native cart and carried through checkout. The handoff is one-directional (admin → theme block → cart/checkout line-item properties); "edit in cart" round-trips back to the theme block's option UI via a pop-up. Add-on money is injected into the cart out-of-band from Shopify's native pricing (not via a Function), which is the source of the discount-incompatibility failure mode.

## functional_model
Core entities (concrete shapes; field names confirmed where quoted, else inferred):

- **OptionSet** = { id, name, targeting (product refs | collection refs | vendor/tag/type filter | whole-store), options[] (ordered), priority/stacking }. An option set is the assignable unit; it is applied to products individually or via **Bulk Apply** (filter by vendor/tag/type). — confirmed concept
- **Option (field)** = { displayName, uniqueName, type (one of ~20 field types), required (toggle), defaultValue, helpText/tooltip, placeholder, characterLimit (text types), min/max selection values (choice types), price add-on config, conditionalVisibility, cssClass } — field names "Display Name," "Unique Name," "Character Limit," "Set Default Option Value" confirmed; rest inferred from feature list.
- **OptionValue** (for choice/swatch types) = { label, swatchColor | swatchImage, priceAddon, sku (Enterprise), inventoryQty (Enterprise), stockStatus, imageOverride (product image to swap on select) } — confirmed features: per-value swatch, per-value price, per-value SKU/inventory, "Change Product Images per Option."
- **PriceAddon** = { mode: fixed | percentage | one-time | multiplication | formula, amount, currency-aware } — modes "Price Adjustment / Percentage Charge / Multiplication Charge / One-time Charge / Formula-based" confirmed.
- **ConditionalRule** = { trigger option/value, operator, action: show|hide, target option OR target option-value } — "3-Tier based Conditional Logic," conditions applicable to individual option values, confirmed.
- **Selection (runtime)** = { optionSet_ref, product_ref, {uniqueName: value}[], uploadedFile_refs[], computedAddonTotal } — persisted to the order as **line-item properties**; add-on total carried as cart-level modifier — confirmed.
- **UploadedFile** = { filename, type (PNG/JPEG/PSD/PDF/Excel/Image/Video/ZIP), url, lineItem_ref } — stored app-side, referenced by URL/path in cart — confirmed types.

Relationships: OptionSet 1—* Option 1—* OptionValue; OptionSet *—* Product/Collection (targeting); ConditionalRule references Option/OptionValue within the same set; Selection binds an OptionSet instance to a specific cart line item.

## settings_taxonomy
The ACTUAL merchant-facing controls. This is the core vocabulary.

### content
- **Display Name** (text) — customer-facing label for the option — confirmed
- **Unique Name** (text) — internal/technical key for the option — confirmed
- **Help Text / Tooltip** (text) — "Add Help Text for option" / "Tool-tip for Enhanced Clarity" — confirmed
- **Placeholder** (text, for text/paragraph fields) — (inferred)
- **Information (Rich Text)** field type — a content-only block (no input) — confirmed
- **Size charts** (image/rich content attach) — confirmed
- **Custom HTML** (text/markup) — confirmed
- **Option value labels** (text per choice) — confirmed
- **Button / Popup** field types (content-triggering) — confirmed

### style
- **Color/Image Swatch** config per value (color picker or image upload) — confirmed
- **Color Picker** field type — confirmed
- **Color/Image Dropdown** (swatch-styled dropdown) — confirmed
- **General settings**: colors, font size, alignment, padding — confirmed
- **Custom CSS** (text) — per-app / per-option CSS override — confirmed
- **Google Font Picker** (select[fonts], Enterprise) — for text-input font selection by shopper — confirmed
- **Full Display Customization** toggle/CSS surface — confirmed
- **Preview** (renders how the option will look) — confirmed

### targeting
- **Assign to individual product** (product-picker) — confirmed
- **Bulk Apply** (rule-builder: filter by **vendor / tag / type**) — confirmed
- **Collection-based Option Sets** (collection-picker) — confirmed
- **Apply to entire store** (toggle/scope) — confirmed
- Option-set **priority / stacking** when multiple sets match (inferred)

### behavior
- **Option type** (select — the ~20 types): Dropdown, Checkbox, Radio Button, Textbox, Paragraph Text, Multi-select, Number, Date Field, File Upload, Email, Phone, Hidden Field, Button, Popup, Information/Rich Text, Color Picker, Swatch, Color/Image Dropdown, Quantity Selector, Multi-Textbox — confirmed
- **Required** (toggle) — (inferred; standard)
- **Set minimum and maximum selection values** (number, choice types) — confirmed
- **Character Limit** (number, text types) — confirmed
- **Set Default Option Value** — confirmed
- **Conditional Logic** rule-builder — "reveal or hide options based on previous selections," **3-tier**, applies to options AND individual option-values (show/hide) — confirmed
- **Price add-on mode** (select): Fixed / Percentage Charge / One-time Charge / Multiplication Charge / **Formula-based Option** — confirmed
- **Assign price to option/value** (number/currency) — confirmed
- **Conditional pricing / Dynamic pricing** (higher plans) — confirmed
- **Edit in Cart** (toggle) — lets shopper re-open option pop-up from cart — confirmed
- **Change Product Images per Option** (image-swap on select) — confirmed
- **Quantity Selector** (Enterprise) — confirmed
- **File Upload settings**: accepted types (PNG/JPEG/PSD/PDF/Excel/Video/ZIP), "one file at a time" — confirmed
- **Hide out-of-stock options** (toggle, Enterprise inventory) — confirmed
- **Dynamic Checkout Button Integration** (toggle) — confirmed

### data
- **SKU management** per option value (text, Enterprise) — confirmed
- **Inventory / Stock availability tracking** per value (number + auto-update, Enterprise) — confirmed
- **In-stock display** (toggle) — confirmed
- **Import / Export** options and option sets (bulk file, CSV-style) — confirmed
- **Mailchimp / Klaviyo integration** (connection config, Enterprise) — confirmed
- **Multi-currency / Shopify Markets** awareness for add-on prices — confirmed

## data_model
What it persists and where:

- **App-side database (external DB, confirmed by architecture, mechanism inferred):** All OptionSets, Options, OptionValues, ConditionalRules, PriceAddon configs, SKU/inventory-per-value, and targeting rules are stored in HulkApps' own backend keyed by shop + product/collection. Not stored as native Shopify product variants (that is the whole point — bypasses the variant limit).
- **Uploaded media (app CDN / storage, confirmed it stores files; exact bucket inferred):** Customer file uploads (images, PDFs, PSD, ZIP, video) stored app-side, referenced by URL/path that is written into the cart line-item property and passed to the order.
- **Shopify order data (native, confirmed):** Final customer selections persist as **line-item properties** on the order (e.g., `Engraving: "ABC"`, `Gift wrap: Yes`, uploaded-file URL). Add-on total applied to cart as a price modifier (companion/hidden add-on line or fee) — NOT as a native variant and NOT via Shopify Functions.
- **No Shopify metaobjects/metafields dependency observed** for the core option store (inferred — data lives in app DB, not metaobjects).
- **Codes/integrations:** Klaviyo/Mailchimp sync of customer/option data (Enterprise). Import/export gives merchants a portable bulk representation of option sets.

## visual_patterns
- **Layout archetype:** A stacked vertical form of option fields injected directly into the product page below the variant/price area, styled to match the theme. Each field is label + control + optional help tooltip + optional add-on-price annotation.
- **Component states:** default / required-unfilled / filled / conditionally-hidden / conditionally-revealed / out-of-stock (dimmed or hidden) / selected-swatch (active border). Running **price total** updates live as options are chosen.
- **Swatch pattern:** color chips and image thumbnails as clickable choices; selected state shows active ring; can swap the main product image on selection.
- **Cart interaction:** selected options shown as a **line-item detail block** in cart; "Edit in Cart" opens a **pop-up** re-exposing the option UI without restarting the flow.
- **File upload pattern:** single-file picker with type validation, filename/preview echoed back into cart.
- **Motion/interaction:** conditional show/hide reveal (3-tier cascade), live total recalculation, swatch selection feedback, image-swap on option select, modal/pop-up for cart edit and for "Popup" field type.
- **Admin builder pattern:** "Add a new option" workflow, drag/orderable option list within a set, per-option config panel, Bulk Apply filter builder, import/export.

## reviews_signal
**Top praises (confirmed):**
1. **Exceptional, fast human support** — most-cited strength; named agents, issues "known in about two minutes and fixed within just another couple minutes"; setup assistance included.
2. **Revenue lift from add-ons** — merchants "earn much more with add-ons."
3. **Flexibility + breadth of option types** — "very functional, easy to use"; widest range of field types (swatch dropdown, Google font picker, hidden fields) vs competitors.
4. **Seamless Shopify integration + inventory tracking** — handles customization "seamlessly," effective inventory tracking (Enterprise).
5. **Handles large catalogs / B2B / Markets** — enterprise-scale, multi-currency, 20 languages.

**Top complaints (confirmed):**
1. **Does not work with Shopify discounts** — add-on charges applied out-of-band from native pricing break discount codes; reported lost sales. (Structural, from the non-Functions upcharge mechanism.)
2. **Duplicate cart / line-item duplication** — "products are still being added twice and pricing is incorrect, especially with variants"; long-standing, reported unfixed after 5 years by one merchant.
3. **Incorrect pricing with variants** — add-on/variant price math wrong in some cart scenarios.
4. **Theme compatibility / CSS conflicts** — "conflicting CSS code" requiring support intervention; brittleness against theme markup.
5. **Reliance on support to resolve bugs** — several fixes require contacting support rather than self-serve (double-edged with praise #1).

## mapping_note
Onto our constrained RecipeSpec vocabulary, the storefront-facing option form maps cleanly to a **single `theme.section` module** with a rich control pack: field-type enum, per-field required/label/help/default, swatch/color controls, price-add-on config, and CSS. A basic "add custom text + gift-wrap upcharge on this product" case fits one recipe.

**Where it EXCEEDS a single-module recipe:**
1. **Persistent cross-product data store + rule engine.** OptionSets, per-value SKUs/inventory, conditional-logic rules, and formula-based pricing are shop-scoped entities reused across many products via targeting (vendor/tag/type/collection/whole-store). This needs a backing data store and a conditional/formula **rule engine**, not static per-instance recipe config.
2. **Cross-surface blueprint with cart/checkout handoff + external side-effects.** State originates in an embedded admin UI, renders on the product page theme block, then hands off to cart/checkout as line-item properties AND applies an out-of-band price modifier — a multi-surface coordinated blueprint. Correct upcharge behavior really wants a `functions.cartTransform` module to stay compatible with native discounts (the app's #1 failure mode is precisely that it does not do this). Plus **file-upload storage (external media/CDN)** and **Klaviyo/Mailchimp sync** are external side-effects.
3. **Bulk targeting + import/export as a fleet operation.** Applying one option set across a filtered catalog (and CSV import/export of the whole option library) is a batch/background operation over many products, beyond a single module's scope.
4. **Inventory/SKU-per-option-value as a shadow variant model.** Tracking stock and SKUs per option value (bypassing Shopify's 100-variant limit) is a parallel inventory data model with auto-updates — a stateful backend, not recipe config.
