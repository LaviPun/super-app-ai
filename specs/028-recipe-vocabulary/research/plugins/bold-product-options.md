# SC Product Options (fka Bold Product Options)

> **RENAME / OWNERSHIP CHANGE (confirmed).** The app studied as "Bold Product Options"
> is now listed as **"SC Product Options fka Bold"** by **Shop Circle**. Shop Circle (a
> London-based e-commerce app roll-up) acquired Bold Commerce's app portfolio and rebranded
> Bold Product Options to SC Product Options. The App Store listing at
> `apps.shopify.com/product-options` (launched 2012-12-14 as Bold) is the SAME continuous
> listing — the URL slug `product-options` and its review history carried over. Legacy Bold
> help-center articles (support.boldcommerce.com) still exist and describe the same engine
> (e.g. `_boldBuilderId` line-item property is still the underlying mechanism). What changed:
> vendor/brand, support channel (now shopcircle.co / freshdesk), plan naming, and a disruptive
> "Version 2" migration that generated many of the recent 1-star reviews. This record studies
> the current SC Product Options as the direct successor; it is vocabulary-identical to Bold.

## identity
- **name**: SC Product Options (fka Bold Product Options) — confirmed
- **vendor**: Shop Circle (One Kingdom Street, Paddington Central, London, W2 6BD, GB) — confirmed; originally Bold Commerce — confirmed
- **category**: Product Variants / Product options & customization (under Selling Products) — confirmed
- **App Store URL**: https://apps.shopify.com/product-options — confirmed
- **rating**: 4.6 / 5 — confirmed
- **review count**: ~1,219 (App Store, mid-2026); older aggregators cite ~2,100+ for the Bold-era listing — confirmed (count dropped/reset across the rebrand + version migration)
- **install signal**: 10,000+ merchants historically (one of the original Bold flagship apps, live since 2012); "Built for Shopify" not currently held — (inferred) from longevity + review volume
- **pricing model**: Freemium subscription. Free (dev-store only) / **Basic $14.99/mo ($149.99/yr)** = unlimited options, custom fields, file uploads, 24/7 chat / **Premium $39.99/mo ($399.99/yr)** = Basic + **priced options, conditional logic, cart-page editing, swatches**. 14-day trial. — confirmed. Note: the two most differentiating capabilities (priced options + conditional logic) are gated to Premium.

## surfaces
The app is fundamentally a **theme-injected storefront widget** with an admin configurator and
downstream order/checkout side-effects. Mapped to the internal allowlist:

- **theme.section** (primary, confirmed): Renders the option set (all field types) on the
  **product page**, injected below/around the native variant picker and add-to-cart form. Legacy
  Bold implementation injected liquid + hidden inputs directly into theme templates; the modern
  version uses a theme-app-embed / app block. This is where 90% of the merchant-facing surface lives.
- **proxy.widget** (confirmed, supporting): The storefront JS calls the app's app-proxy/backend to
  fetch option-set definitions, run conditional-logic evaluation, compute priced-option totals, and
  resolve the **hidden "companion" products** used to charge add-ons. Dynamic price display updates
  come from this round-trip.
- **checkout.block / functions.cartTransform** (functional equivalent, NOT native — confirmed as a
  workaround, see mapping_note): Priced options are carried into checkout by adding **hidden/companion
  products as extra line items** in the cart, plus **line-item properties** on the base product. This
  achieves "add a price for an option" WITHOUT Shopify Functions — it predates them and instead relies
  on cart manipulation. It is the app's fragile core (source of "inventory issue at checkout" and
  "option not charged" complaints).
- **admin.block / configurator** (confirmed): The Shopify-admin embedded app where merchants build
  option sets, values, prices, conditional rules, and product targeting. Not a native admin.block on a
  product page — it is the app's own admin surface.
- **order surface / line-item display** (confirmed, not a distinct allowlist type): Selected options
  appear as **line-item properties** on the order in Shopify admin and on Order Printer / Spently
  invoices, so warehouse/fulfillment sees the customization.

**Cross-surface coordination (confirmed):** The admin configurator writes an **option-set + rules +
priced-option** definition. The theme.section renders it; the proxy.widget evaluates conditional logic
and computes add-on prices against **hidden companion products**; those companion products + line-item
properties are what carry the customization and its price from cart → checkout → order. The shared
state is the **option-set definition** (server-side) plus the **`_boldBuilderId` / line-item property
payload** that threads a single customer's selections across cart, checkout, and the order record.
This handoff via injected line items is the defining architectural trait — and its brittleness.

## functional_model
Core entities (concrete):

- **OptionSet** = { id, name, product_targeting, ordered[Option], priced (bool), plan_gate }
  — a named group of options that renders together on assigned products.
- **Option** (a field) = { id, label, type ∈ {dropdown, radio, checkbox_single, checkbox_multi,
  swatch_single, swatch_multi, scrollable_list, short_text, paragraph_text, short_text_group,
  descriptive_text, number, email, telephone, color, date, file_upload}, required (bool),
  char_limit?, values[OptionValue], conditional_visibility?, order_index }
- **OptionValue** (a choice within a select-type option) = { id, label, swatch_image?/color?,
  price_adjustment?, linked_variant?/companion_product?, inventory/SKU?, in_stock (bool) }
- **PricedOption** relationship = an OptionValue with a `price_adjustment` is backed by a **hidden
  companion Product** in the store's catalog whose price = the add-on amount; selecting it injects
  that hidden product as a cart line item. — confirmed
- **ConditionalRule** = { source_option, trigger_value, action ∈ {show, hide}, target_option }
  — "if Personalization = Yes then show Gift Message text box." — confirmed
- **Selection (runtime)** = { base_product, {option_label: value}[], uploaded_file_refs[],
  computed_addon_total } → serialized into **line-item properties** (keys like `_boldBuilderId`,
  human-readable option-name/value pairs) attached to the cart line. — confirmed
- **ProductTargeting** = which products an OptionSet applies to (individual product selection is the
  documented path; "all products" / collection / tag targeting existed in the Bold era). — confirmed
  for per-product; (inferred) for collection/tag/global in current UI.

## settings_taxonomy
The single most important section. Actual merchant-facing knobs, grouped:

### content
- **Option label** — text (per option) — confirmed
- **Option type** — select[ dropdown, radio, checkbox (single), checkbox (multiple), swatch (single),
  swatch (multiple), scrollable list, short text, paragraph text, short text group, descriptive text,
  number, email, telephone, color, date, file upload ] — confirmed
- **Values / choices** — repeatable text rows per select-type option (e.g. "Small / Medium / Large") — confirmed
- **Descriptive text / instructions** — text (display-only "Descriptive Text" option type; no input) — confirmed
- **Placeholder / help text / tooltip** — text — (inferred)
- **Swatch value image** — image upload (per value, for image swatches) — confirmed
- **Swatch value color** — color (per value, for color swatches / "Color" picker type) — confirmed
- **File upload accepted types** — displayed set: PNG, JPEG, PSD, PDF, Excel, images, video, ZIP — confirmed
- **Custom fonts / custom CSS / custom HTML** — text/code (advanced content injection) — confirmed

### style
- **Swatch display** (color chip vs image) — implied by swatch type selection — confirmed
- **Custom CSS** — text/code block to restyle the widget — confirmed
- **Field placement / order** — drag-reorder ("Change the Order and Placement of Options") — confirmed
- **Tooltip visibility on mobile** — toggle ("Hide the Tooltips on Mobile Devices") — confirmed
- **Layout / column arrangement of options** — (inferred) select/number
- Note: styling is thin and CSS-driven; this app is functionally, not aesthetically, oriented.
  Matches DESIGN.md-style critique: relies on merchant custom CSS rather than a first-class style system.

### targeting
- **Product assignment** — product-picker (search + select individual products from synced list) — confirmed
- **Apply to all products / collection / tag** — rule-style targeting — confirmed for Bold era; (inferred) current
- **Conditional logic rule** — rule-builder: `if [option] is [value] then [show|hide] [option]` — confirmed (Premium only)
- **Option-set priority / stacking** when multiple sets could match — (inferred) ordering; historically a pain point
- **Hide/disable out-of-stock values** — toggle ("hide out-of-stock options") — confirmed

### behavior
- **Required** — toggle per option ("Make an Option Required" / "required button") — confirmed
- **Character limit** — number (short/paragraph text; "customizable maximum character limits") — confirmed
- **Max selections** — number (multi-select checkboxes/swatches) — confirmed
- **Priced option / price adjustment** — number/currency per value (Premium) — confirmed
- **Pricing type** — select[ per-value add-on, setup charge, tiered/bulk pricing, conditional pricing,
  dynamic pricing ] — confirmed (feature copy; per-value add-on is the common path)
- **Link value to existing variant vs create hidden priced product** — select/choice — confirmed
- **Inventory / SKU tracking on priced option** — toggle + text ("Use Inventory or SKUs with Priced
  Options") — confirmed
- **Date field restrictions** — toggles (restrict year / week / day) — confirmed
- **Input validation** — implicit by type (number/email/telephone validate format) — confirmed
- **Hide native "Buy Now" / dynamic checkout button** — toggle (so options can't be bypassed) — confirmed
- **Cart-page editing of options** — toggle/capability (Premium) — confirmed

### data
- **File upload storage** — captures customer files attached to the order (PNG/JPEG/PSD/PDF/Excel/
  video/ZIP), downloadable by merchant — confirmed
- **Import / export of options** — file (bulk manage option sets/values) — confirmed
- **Translations** — per-language strings across ~18 locales — confirmed
- **Line-item property output** — the option selections written onto the order — confirmed
- **Third-party passthrough** — toggles/config for Order Printer, Spently, EComposer, Pagefly, Reorder
  Master integrations — confirmed

## data_model
- **Option sets, options, values, prices, conditional rules**: persisted in the **app's own external
  database** (Shop Circle backend), keyed to shop domain + product IDs. NOT stored as Shopify
  metafields/metaobjects in the classic implementation. — confirmed (legacy Bold architecture);
  (inferred) still external post-rebrand.
- **Hidden companion products**: real **Shopify Products** created in the merchant's catalog to carry
  add-on prices; hidden from storefront collections and blocked from direct purchase by injected theme
  code. Their price = the option's add-on amount. — confirmed
- **Line-item properties**: written to the Shopify **cart/order** (keys incl. `_boldBuilderId` and
  option-name/value pairs) to thread selections through checkout to the order record. — confirmed
- **Uploaded files**: stored on the app/vendor CDN (not Shopify Files), referenced from the order for
  merchant download. — confirmed (file-download feature); (inferred) exact CDN
- **Theme assets**: injected liquid/JS/CSS + hidden inputs in cart/product templates (legacy) or a
  theme-app-embed (modern). Leftover code after uninstall is a documented complaint. — confirmed
- **Translations / locale strings**: stored with the option-set definitions. — confirmed

## visual_patterns
- **Layout archetype**: a vertical stack of labeled option fields inserted into the product form,
  between the variant picker and the add-to-cart button; a live-updating **price/subtotal** reflects
  add-ons. — confirmed
- **Component states**: required (error/validation on empty), disabled/hidden (out-of-stock values;
  conditional-logic hidden fields), file-upload (idle → uploading → attached → error on bad type),
  swatch selected/unselected, dropdown vs scrollable-list (multi-select via SHIFT+click). — confirmed
- **Interaction patterns**: **conditional show/hide** on selection change (progressive disclosure —
  select "Gift Wrap: Yes" → reveal "Gift Message"); **dynamic price recompute** on any priced value
  change; **tooltips** (hideable on mobile); cart-page re-edit of previously chosen options (Premium). — confirmed
- **Motion**: minimal; show/hide toggles and price text updates, no elaborate animation. — (inferred)
- **Known visual failure modes**: pricing display "not always updating correctly" on dropdown change;
  formatting "got all weird" after V2 migration; leftover styles/code after uninstall. — confirmed (reviews)

## reviews_signal
**Praises (top 5, confirmed):**
1. **Support/developers go the extra mile** — "real developers push their application to the limits to
   accommodate custom requests"; named reps praised.
2. **Depth of customization** — handles genuinely complex configurators ("wouldn't be able to pull off
   all the complex customization we need for our apparel decorating site").
3. **Dynamic price updates** — add-on pricing that reflects live as options change.
4. **Broad field-type coverage** — swatches, file upload, conditional logic, priced options in one app.
5. **Approachable builder** — non-technical merchants can assemble option forms.

**Complaints (top 5, confirmed):**
1. **The Version 2 migration was destructive** — conditional logic disappeared, liquid vanished from
   order reports, formatting broke, and support "can't roll back the change."
2. **Priced options silently not charging / breaking checkout** — "options not being charged"; a
   support fix "completely torpedoed my entire site"; "inventory issue at checkout" from the hidden-
   product mechanism.
3. **Options mis-applying after sync** — post-update sync pushed option sets onto products they
   shouldn't be on; merchants hand-fixed hundreds of listings.
4. **Support went dark / slow** — "down for 6 days, 3 tickets, no contact"; passed between reps.
5. **Performance + leftover code** — site "runs 5 points slower"; old app code not removed on uninstall,
   appearing in cart/checkout; explicitly "not recommended for stores with >1,000 products."

## mapping_note
Maps to a **theme.section RecipeSpec** for the storefront render (the field stack), but the app
**substantially exceeds a single-module recipe** on every axis that matters:

1. **Persistent external data store + relational model.** Option sets → options → values → prices →
   conditional rules → per-product targeting are a small relational schema living in an external DB
   (not inline theme settings, not a metaobject). A one-shot module recipe cannot express "a library
   of reusable option sets assigned across many products with priority rules."

2. **Cross-surface blueprint with a hidden-product side-effect at checkout.** Charging for an option is
   NOT a render concern — it requires **provisioning hidden companion Products in the catalog** and
   **injecting extra line items + line-item properties** that survive cart → checkout → order. This is
   an external-side-effect + data-provisioning workflow (today's native equivalent would be a
   `functions.cartTransform`/checkout extension), spanning product page, cart, checkout, and order
   surfaces that must share state via a serialized selection payload.

3. **A runtime rule engine (conditional logic).** Show/hide-on-selection and conditional/tiered/dynamic
   pricing require an evaluated rule engine at storefront runtime (via app proxy), not static config.
   RecipeSpec has no rule-evaluation primitive.

4. **Background sync + media pipeline + i18n.** Product/option syncing (the thing that broke and
   mis-applied sets), customer **file uploads to a CDN** attached to orders, import/export of option
   sets, and 18-locale translation are ongoing jobs and asset storage well outside a single generated
   module's lifecycle.

**Net:** a RecipeSpec can generate the *product-page field UI*; the *priced-options engine, hidden-
product provisioning, conditional-rule evaluation, checkout carry-through, and file/CDN + sync jobs*
are a multi-surface app with its own datastore and background work — the exact class of thing that
needs a blueprint + data store + functions/side-effects rather than one module.
