Here’s the full “everything possible” list, as stable value sets (targets / templates / section groups / setting input types / function APIs / event names). Wherever Shopify allows unlimited custom names (like “your block names”), I list the complete Shopify-defined constraints (that’s the only truly “complete” list).

1) Online Store (Theme) — App Blocks & App Embed Blocks
1.1 Block kinds Shopify supports (only 2)

App block (placed inside sections)

target: section

App embed block (global injections)

target: head / compliance_head / body

Shopify note: theme app extension blocks can’t render on checkout pages/steps (contact/shipping/payment/order status in checkout).

1.2 Where a theme app block can be used (full stable list)
A) Template page types (stable list)

These are Shopify’s canonical template “page types” (the values your enabled_on.templates / disabled_on.templates can use):
404, article, blog, cart, collection, list-collections, customers/account, customers/activate_account, customers/addresses, customers/login, customers/order, customers/register, customers/reset_password, gift_card, index, page, password, product, search

Also: Shopify supports metaobject templates in the form metaobject/{metaobject-type} (example: metaobject/book).

B) Section group types (stable list)

For enabled_on.groups / disabled_on.groups, Shopify accepts:

header, footer, aside, and custom types like custom.<NAME> (plus ["*"])

C) Section schema attribute set (stable list)

When you (or Shopify) define a section schema, the allowed attributes are:
name, tag, class, limit, settings, blocks, max_blocks, presets, default, locales, enabled_on, disabled_on

1.3 Theme setting inputs your app blocks can expose (FULL list)
Basic input setting types (7)

checkbox, number, radio, range, select, text, textarea

Specialized input setting types (25)

article, article_list, blog, collection, collection_list, color, color_background, color_scheme, color_scheme_group, font_picker, html, image_picker, inline_richtext, link_list, liquid, metaobject, metaobject_list, page, product, product_list, richtext, text_alignment, url, video, video_url

Theme app extension schema knobs (the “allowed fields” your AI can emit)

For app blocks/embeds, Shopify supports (among others): name, target, javascript, stylesheet, enabled_on, disabled_on, class, tag, settings, default, available_if
And target possible values are exactly: section, head, compliance_head, body

2) Checkout UI Extensions — every target (FULL list)

This is the complete latest/targets list for Checkout UI extensions:

Address

purchase.address-autocomplete.format-suggestion — format a selected suggestion.

purchase.address-autocomplete.suggest — provide address autocomplete suggestions.

Announcement

purchase.thank-you.announcement.render — dismissible announcement on Thank you page.

Block

purchase.checkout.block.render — merchant-placeable block anywhere (checkout editor).

purchase.thank-you.block.render — merchant-placeable block on Thank you page.

Footer

purchase.checkout.footer.render-after

purchase.thank-you.footer.render-after

Header

purchase.checkout.header.render-after

purchase.thank-you.header.render-after

Information

purchase.checkout.contact.render-after

purchase.thank-you.customer-information.render-after

Local Pickup

purchase.checkout.pickup-location-list.render-after

purchase.checkout.pickup-location-list.render-before

purchase.checkout.pickup-location-option-item.render-after

Navigation

purchase.checkout.actions.render-before

Order Summary

purchase.checkout.cart-line-item.render-after

purchase.checkout.cart-line-list.render-after

purchase.checkout.reductions.render-after

purchase.checkout.reductions.render-before

purchase.thank-you.cart-line-item.render-after

purchase.thank-you.cart-line-list.render-after

Payments

purchase.checkout.payment-method-list.render-after

purchase.checkout.payment-method-list.render-before

Pickup Points

purchase.checkout.pickup-point-list.render-after

purchase.checkout.pickup-point-list.render-before

Shipping

purchase.checkout.delivery-address.render-after

purchase.checkout.delivery-address.render-before

purchase.checkout.shipping-option-item.details.render

purchase.checkout.shipping-option-item.render-after

purchase.checkout.shipping-option-list.render-after

purchase.checkout.shipping-option-list.render-before

3) Post-purchase checkout extensions (the classic “upsell interstitial” API)

Shopify’s post-purchase checkout extension points are exactly these 2:

Checkout::PostPurchase::ShouldRender — decide if the offer/interstitial should show.

Checkout::PostPurchase::Render — render the interstitial UI and return the result.

4) Customer Account UI Extensions — every target (FULL list)

Complete latest/targets list:

Footer

customer-account.footer.render-after

Full page

customer-account.order.page.render (new page tied to a specific order)

customer-account.page.render (new page)

Order action menu

customer-account.order.action.menu-item.render

customer-account.order.action.render (modal after click)

Order index

customer-account.order-index.announcement.render

customer-account.order-index.block.render

Order status

customer-account.order-status.announcement.render

customer-account.order-status.block.render

customer-account.order-status.cart-line-item.render-after

customer-account.order-status.cart-line-list.render-after

customer-account.order-status.customer-information.render-after

customer-account.order-status.fulfillment-details.render-after

customer-account.order-status.payment-details.render-after

customer-account.order-status.return-details.render-after

customer-account.order-status.unfulfilled-items.render-after

Profile (B2B)

customer-account.profile.company-details.render-after

customer-account.profile.company-location-addresses.render-after

customer-account.profile.company-location-payment.render-after

customer-account.profile.company-location-staff.render-after

Profile (Default)

customer-account.profile.addresses.render-after

customer-account.profile.announcement.render

customer-account.profile.block.render

5) Shopify Functions — every Function API + run targets (FULL list)

Shopify’s Function APIs (2026-01 latest) include these core APIs: Cart & Checkout Validation, Cart Transform, Delivery Customization, Discount, Fulfillment Constraints, Order Routing Location Rule, Payment Customization

They run in a defined sequence in checkout, with these categories shown in the Functions reference:

Cart lines → Cart Transform

Cart line discounts → Discount

Fulfillment groups → Fulfillment Constraints, Order Routing

Delivery methods → (generator APIs shown in docs; some are not in “latest” and live in unstable)

Delivery discounts → Discount

Payment methods → Payment Customization

Verification → Cart & Checkout Validation

5.1 The “stable” run targets you should treat as capabilities

Cart Transform: cart.transform.run (one per store; bundles/line operations)

Discount (unified):

cart.lines.discounts.generate.run (product/order discounts merged here)

cart.delivery-options.discounts.generate.run (shipping discounts merged here)

Fulfillment Constraints: cart.fulfillment-constraints.generate.run

Payment Customization: (rename/reorder/hide methods, terms, review requirements)

Delivery Customization: (rename/sort/hide delivery options)

Cart & Checkout Validation: server-side rules to allow/block checkout progression

Order Routing Location Rule: routing rules for fulfillment location priority

5.2 “Possible but not in latest” / preview (still real capabilities)

Shopify’s docs show additional delivery generator APIs and an allocator API in unstable / developer preview, and the latest pages explicitly say “not supported in the latest API version” for some of them:

Pickup point delivery option generator (unstable targets like purchase.pickup-point-delivery-option-generator.run/fetch)

Local pickup delivery option generator (unstable; latest says not supported)

Discounts Allocator (developer preview / unstable; latest says not supported)

6) Shopify Admin UI extensions — every target (FULL list)

From admin-extensions/latest/targets the full set is:

Admin action locations

admin.abandoned-checkout-details.action.render

admin.catalog-details.action.render

admin.collection-details.action.render

admin.collection-index.action.render

admin.company-details.action.render

admin.customer-details.action.render

admin.customer-index.action.render

admin.customer-index.selection-action.render

admin.customer-segment-details.action.render

admin.discount-details.action.render

admin.discount-index.action.render

admin.draft-order-details.action.render

admin.draft-order-index.action.render

admin.draft-order-index.selection-action.render

admin.gift-card-details.action.render

admin.order-details.action.render

admin.order-fulfilled-card.action.render (only if your app is the fulfillment app)

admin.order-index.action.render

admin.order-index.selection-action.render

admin.product-details.action.render

admin.product-index.action.render

admin.product-index.selection-action.render

admin.product-variant-details.action.render

admin.product-purchase-option.action.render

admin.product-variant-purchase-option.action.render

Admin block locations

admin.abandoned-checkout-details.block.render

admin.catalog-details.block.render

admin.collection-details.block.render

admin.company-details.block.render

admin.company-location-details.block.render

admin.customer-details.block.render

admin.draft-order-details.block.render

admin.gift-card-details.block.render

admin.discount-details.function-settings.render

admin.order-details.block.render

admin.product-details.block.render

admin.product-variant-details.block.render

Admin print action locations

admin.order-details.print-action.render

admin.product-details.print-action.render

admin.order-index.selection-print-action.render

admin.product-index.selection-print-action.render

Customer segmentation locations

admin.customers.segmentation-templates.render

Product configuration locations

admin.product-details.configuration.render

admin.product-variant-details.configuration.render

Validation settings locations

admin.settings.validation.render

7) Shopify POS UI extensions — every target (FULL list)

From pos-ui-extensions/latest/targets, the full set is:

Home screen

pos.home.tile.render

pos.home.modal.render

Cart details

pos.cart.line-item-details.action.menu-item.render

pos.cart.line-item-details.action.render

Customer details

pos.customer-details.block.render

pos.customer-details.action.menu-item.render

pos.customer-details.action.render

Draft order details

pos.draft-order-details.block.render

pos.draft-order-details.action.menu-item.render

pos.draft-order-details.action.render

Order details

pos.order-details.block.render

pos.order-details.action.menu-item.render

pos.order-details.action.render

Post-exchange (feature preview / beta)

pos.exchange.post.block.render

pos.exchange.post.action.menu-item.render

pos.exchange.post.action.render

Post-purchase

pos.purchase.post.block.render

pos.purchase.post.action.menu-item.render

pos.purchase.post.action.render

Post-return (feature preview / beta)

pos.return.post.block.render

pos.return.post.action.menu-item.render

pos.return.post.action.render

Product details

pos.product-details.block.render

pos.product-details.action.menu-item.render

pos.product-details.action.render

Receipts (feature preview / beta)

pos.receipt-header.block.render

pos.receipt-footer.block.render

Register details

pos.register-details.block.render

pos.register-details.action.menu-item.render

pos.register-details.action.render

8) Web Pixels — standard events (FULL list)

From web-pixels-api/standard-events, Shopify’s standard events are:

alert_displayed

cart_viewed

checkout_address_info_submitted

checkout_completed

checkout_contact_info_submitted

checkout_shipping_info_submitted

checkout_started

collection_viewed

page_viewed

payment_info_submitted

product_added_to_cart

product_removed_from_cart

product_viewed

search_submitted

ui_extension_errored

If you want, next I’ll format this into your SuperApp AI “Type / Category / Block” taxonomy as a strict catalog (so your generator can pick: Surface → Target → Template/Group → Settings types → Required permissions).

Yes, you can go to the next step and format it.
Thought for 1m 2s

Below is the formatted “strict catalog” for SuperApp AI so your generator can always pick:

Surface (Type) → Extension kind → Target → (Templates / Section groups, if applicable) → Settings types → Data/permissions notes → What the block does.

I’m only using Shopify-defined stable value sets (targets, template types, section groups, setting input types, function APIs, pixel events). Wherever Shopify allows unlimited custom names (like your own block names), I mark that clearly.

SuperApp AI Capability Catalog
1) Online Store Theme

Source of truth: Theme App Extensions config + theme schema docs.

1.1 Extension kinds (stable)

Theme App Extension → App block

Target: section

What it is: merchant places your widget inside an existing theme section via Theme Editor.

Theme App Extension → App embed block

Targets: head / compliance_head / body

What it is: global enable/disable “app embed” (scripts, floating widgets, global UI).

1.2 Placement filters (stable values your generator can emit)
A) Templates (where it’s allowed to appear)

Use these values inside enabled_on.templates / disabled_on.templates:

404, article, blog, cart, collection, list-collections,
customers/account, customers/activate_account, customers/addresses, customers/login, customers/order, customers/register, customers/reset_password,
gift_card, index, page, password, product, search

Also supported: metaobject/<type> templates (example metaobject/book).

B) Section groups (global layout zones)

Use these in enabled_on.groups / disabled_on.groups:

header, footer, aside, custom.<NAME>, *

1.3 Theme settings input types (FULL stable list)

These are the only valid setting types you can expose in block schema:

Basic (7):
checkbox, number, radio, range, select, text, textarea

Specialized (25):
article, article_list, blog, collection, collection_list,
color, color_background, color_scheme, color_scheme_group,
font_picker, html, image_picker, inline_richtext, link_list,
liquid, metaobject, metaobject_list, page,
product, product_list, richtext, text_alignment,
url, video, video_url

1.4 Your SuperApp “Block Catalog format” (what AI should output)

Because Shopify doesn’t have built-in “product block vs collection block” types, you define unlimited custom block names, but they must map to one of the 2 extension kinds above.

Use this systematic taxonomy (stable + scalable):

Theme → App Blocks (target: section)

Content blocks

hero/banner, rich text, image/video, FAQ, testimonials, icons, comparison tables.

Product blocks

upsell/cross-sell widget, bundle UI, size chart, sticky ATC helper, reviews summary, delivery estimator UI.

Collection blocks

featured collection tiles, promo grid, quick-add module.

Cart blocks (theme cart/drawer UI)

free-shipping progress, donation, gift-wrap, order note UI, cart upsells.

Utility blocks

announcement strip inside sections, trust badges, countdown, localization helpers UI.

Theme → App Embed Blocks (targets: head|compliance_head|body)

Global UI overlays

floating chat/help button, sticky promo bubble, cookie banner, announcement overlay.

Global scripts

tracking, A/B testing loader, consent mode helpers, SEO meta injection.

Hard rule: theme app blocks/embeds don’t render on checkout step pages.

2) Checkout UI Extensions

Source of truth: Checkout UI targets list.

2.1 Extension kind

Checkout UI Extension (React-based UI rendered at targets)

2.2 Targets (FULL stable list, grouped)

Your generator chooses exactly one target per “block”.

Address

purchase.address-autocomplete.suggest

purchase.address-autocomplete.format-suggestion

Announcement

purchase.thank-you.announcement.render

Block (merchant-placeable)

purchase.checkout.block.render

purchase.thank-you.block.render

Footer

purchase.checkout.footer.render-after

purchase.thank-you.footer.render-after

Header

purchase.checkout.header.render-after

purchase.thank-you.header.render-after

Information

purchase.checkout.contact.render-after

purchase.thank-you.customer-information.render-after

Local Pickup

purchase.checkout.pickup-location-list.render-after

purchase.checkout.pickup-location-list.render-before

purchase.checkout.pickup-location-option-item.render-after

Navigation

purchase.checkout.actions.render-before

Order Summary

purchase.checkout.cart-line-item.render-after

purchase.checkout.cart-line-list.render-after

purchase.checkout.reductions.render-after

purchase.checkout.reductions.render-before

purchase.thank-you.cart-line-item.render-after

purchase.thank-you.cart-line-list.render-after

Payments

purchase.checkout.payment-method-list.render-after

purchase.checkout.payment-method-list.render-before

Pickup Points

purchase.checkout.pickup-point-list.render-after

purchase.checkout.pickup-point-list.render-before

Shipping

purchase.checkout.delivery-address.render-after

purchase.checkout.delivery-address.render-before

purchase.checkout.shipping-option-item.details.render

purchase.checkout.shipping-option-item.render-after

purchase.checkout.shipping-option-list.render-after

purchase.checkout.shipping-option-list.render-before

(Everything above is straight from Shopify’s target list.)

2.3 SuperApp “categories” (how AI should label them)

Checkout → Content/Trust (announcements, reassurance, policy)

Checkout → Upsell (cart line item / order summary placements)

Checkout → Shipping UX (delivery address + option list)

Checkout → Payment UX (payment method list placements)

Thank you → Post-purchase content (announcement/block/header/footer)

3) Post-purchase (classic interstitial)

Source of truth: Post-purchase API.

3.1 Extension kind

Post-purchase extension (offer/interstitial)

3.2 Targets (FULL stable list)

Checkout::PostPurchase::ShouldRender

Checkout::PostPurchase::Render

4) Customer Account UI Extensions

Source of truth: Customer account targets list.

4.1 Extension kind

Customer Account UI Extension (new customer account pages)

4.2 Targets (FULL stable list, grouped)

Footer

customer-account.footer.render-after

Full page

customer-account.page.render

customer-account.order.page.render

Order action menu

customer-account.order.action.menu-item.render

customer-account.order.action.render

Order index

customer-account.order-index.announcement.render

customer-account.order-index.block.render

Order status

customer-account.order-status.announcement.render

customer-account.order-status.block.render

customer-account.order-status.cart-line-item.render-after

customer-account.order-status.cart-line-list.render-after

customer-account.order-status.customer-information.render-after

customer-account.order-status.fulfillment-details.render-after

customer-account.order-status.payment-details.render-after

customer-account.order-status.return-details.render-after

customer-account.order-status.unfulfilled-items.render-after

Profile (B2B)

customer-account.profile.company-details.render-after

customer-account.profile.company-location-addresses.render-after

customer-account.profile.company-location-payment.render-after

customer-account.profile.company-location-staff.render-after

Profile (Default)

customer-account.profile.addresses.render-after

customer-account.profile.announcement.render

customer-account.profile.block.render

5) Admin UI Extensions

Source of truth: Admin extensions targets list.

5.1 Extension kinds

Admin actions (buttons/menu items launching modals)

Admin blocks (embedded UI cards)

Admin print actions

Segmentation templates

Product configuration

Validation settings

5.2 Targets (FULL stable list)

(These are the exact Shopify targets; your generator picks one per module.)

Actions:
admin.abandoned-checkout-details.action.render
admin.catalog-details.action.render
admin.collection-details.action.render
admin.collection-index.action.render
admin.company-details.action.render
admin.customer-details.action.render
admin.customer-index.action.render
admin.customer-index.selection-action.render
admin.customer-segment-details.action.render
admin.discount-details.action.render
admin.discount-index.action.render
admin.draft-order-details.action.render
admin.draft-order-index.action.render
admin.draft-order-index.selection-action.render
admin.gift-card-details.action.render
admin.order-details.action.render
admin.order-fulfilled-card.action.render
admin.order-index.action.render
admin.order-index.selection-action.render
admin.product-details.action.render
admin.product-index.action.render
admin.product-index.selection-action.render
admin.product-variant-details.action.render
admin.product-purchase-option.action.render
admin.product-variant-purchase-option.action.render

Blocks:
admin.abandoned-checkout-details.block.render
admin.catalog-details.block.render
admin.collection-details.block.render
admin.company-details.block.render
admin.company-location-details.block.render
admin.customer-details.block.render
admin.draft-order-details.block.render
admin.gift-card-details.block.render
admin.discount-details.function-settings.render
admin.order-details.block.render
admin.product-details.block.render
admin.product-variant-details.block.render

Print actions:
admin.order-details.print-action.render
admin.product-details.print-action.render
admin.order-index.selection-print-action.render
admin.product-index.selection-print-action.render

Segmentation:
admin.customers.segmentation-templates.render

Product configuration:
admin.product-details.configuration.render
admin.product-variant-details.configuration.render

Validation settings:
admin.settings.validation.render

6) POS UI Extensions

Source of truth: POS targets list.

6.1 Targets (FULL stable list)

Home
pos.home.tile.render
pos.home.modal.render

Cart line item details
pos.cart.line-item-details.action.menu-item.render
pos.cart.line-item-details.action.render

Customer details
pos.customer-details.block.render
pos.customer-details.action.menu-item.render
pos.customer-details.action.render

Draft order details
pos.draft-order-details.block.render
pos.draft-order-details.action.menu-item.render
pos.draft-order-details.action.render

Order details
pos.order-details.block.render
pos.order-details.action.menu-item.render
pos.order-details.action.render

Post-exchange (preview/beta)
pos.exchange.post.block.render
pos.exchange.post.action.menu-item.render
pos.exchange.post.action.render

Post-purchase
pos.purchase.post.block.render
pos.purchase.post.action.menu-item.render
pos.purchase.post.action.render

Post-return (preview/beta)
pos.return.post.block.render
pos.return.post.action.menu-item.render
pos.return.post.action.render

Product details
pos.product-details.block.render
pos.product-details.action.menu-item.render
pos.product-details.action.render

Receipts (preview/beta)
pos.receipt-header.block.render
pos.receipt-footer.block.render

Register details
pos.register-details.block.render
pos.register-details.action.menu-item.render
pos.register-details.action.render

7) Shopify Functions (backend logic)

Source of truth: Functions “latest” index + individual API pages.

7.1 Function APIs (FULL stable list in “latest”)

Your generator chooses 1+ “logic modules” per solution:

Cart Transform — change cart lines (merge/split/bundle-style transformations).

Discount — discounts (lines + delivery option discounts are both here).

Delivery Customization — rename/sort/hide delivery options.

Payment Customization — rename/reorder/hide payment methods.

Cart & Checkout Validation — block/allow checkout with rules.

Fulfillment Constraints — constrain fulfillment options/groups.

Order Routing Location Rule — choose fulfillment location priority logic.

7.2 Unstable / preview “possible but not latest”

These exist but are not guaranteed “stable” in latest:
Pickup point delivery option generator, local pickup delivery option generator, discounts allocator (preview/unstable).

8) Web Pixels

Source of truth: standard events list.

8.1 Events (FULL stable list)

alert_displayed, cart_viewed,
checkout_address_info_submitted, checkout_completed, checkout_contact_info_submitted, checkout_shipping_info_submitted, checkout_started,
collection_viewed, page_viewed, payment_info_submitted,
product_added_to_cart, product_removed_from_cart, product_viewed,
search_submitted, ui_extension_errored

9) Shopify Flow (automation “recipes”)

Source of truth: app extension list (Flow triggers/actions/templates are official extension types).

9.1 Extension kinds (stable)

Flow Trigger — your app emits an event; Flow starts workflow.

Flow Action — Flow calls your app to do something.

Flow Template — packaged “recipe” in the template library.

Flow Lifecycle events — Flow notifies your app about trigger usage, etc.

Important: Flow does not give a universal fixed list of “trigger names” because apps define them. The “complete stable part” is: Trigger/Action/Template/Lifecycle are the only extension kinds, and templates are “recipes” that combine triggers+conditions+actions.

How SuperApp AI should “pick values” (generator checklist)

For every module your AI generates, store these fields:

Surface (Type): Theme | Checkout UI | Post-purchase | Customer account | Admin | POS | Functions | Pixels | Flow

Extension kind: (one of the stable kinds listed under that surface)

Target: must be one of the stable targets for that surface (lists above)

Placement filter (Theme only): Templates + Section groups

Settings:

Theme blocks: choose from the 32 setting types list (7+25)

UI extensions: settings live in your app UI (but still treat them as “config schema” internally)

Data needs:

which Shopify objects are needed (products/orders/customers/cart/etc.)

Permissions (not a fixed list):

scopes depend on “data needs”; your generator should output required scopes as a derived field (e.g., if it touches products → read_products; if it writes discounts → write_discounts; if it reads orders → read_orders, etc.). (Shopify scopes vary by solution, so the stable piece is the derivation rule, not a fixed list.)

If you say “continue”, the next step is I’ll turn this into your exact SuperApp AI internal taxonomy:

Type (surface)
→ Category (business intent: upsell, trust, analytics, etc.)
→ Block (a named module)
→ Allowed targets (from lists)
→ Allowed settings (from lists)
→ Required Shopify capabilities (Theme app extension / UI extension / Function / Pixel / Flow)

…and I’ll include 1–2 line descriptions for every target group so the catalog is usable by non-technical users too.

here is the SuperApp AI “strict catalog” in the exact format you asked for:

Type (Surface) → Category → Block (module archetype) → Allowed targets (stable values) → Allowed placement filters/settings (stable values) → What it does (1–2 lines) → Required Shopify capability

Everything that’s truly “finite” in Shopify (targets, template types, section groups, setting types, Functions APIs, Pixel events, Flow extension kinds) is listed as complete stable enumerations from Shopify docs.

A) SuperApp AI Canonical Value Sets (the “stable enums”)
A1) Types (Surfaces) you can generate into

These are Shopify’s full “app extension” surfaces list.

Online Store (Theme) → Theme app extensions

Checkout → Checkout UI extensions, Shopify Functions, Post-purchase

Customer accounts → Customer account UI extensions

Admin → Admin actions/blocks/etc.

POS → POS UI extensions

Flow → Triggers, Actions, Templates, Lifecycle events

Marketing & analytics → Web pixel

Payments → Payments extension (review-required)

A2) Theme: templates + section groups (filters)
Templates (complete stable values)

Use these for theme placement filtering (the canonical set Shopify exposes as template types).

404, article, blog, cart, collection, list-collections, index, page, password, product, search

Metaobject templates: metaobject/<type> (example metaobject/book)

Liquid-only special templates also exist: gift_card.liquid, robots.txt.liquid

Legacy customer templates are listed in Liquid, but Shopify notes they’re deprecated in themes (customer accounts now independent).

Section groups (complete stable values)

header, footer, aside, custom.<NAME>, plus ["*"]

A3) Theme settings input types (complete stable values)

Use these as the only allowed merchant-config settings types inside theme block schema.

Basic (7):
checkbox, number, radio, range, select, text, textarea

Specialized (25):
article, article_list, blog, collection, collection_list, color, color_background, color_scheme, color_scheme_group, font_picker, html, image_picker, inline_richtext, link_list, liquid, metaobject, metaobject_list, page, product, product_list, richtext, text_alignment, url, video, video_url

A4) Theme app extension schema “targets” (complete stable values)

App blocks: section

App embeds: head, compliance_head, body

A5) Shopify Functions APIs (complete stable list)

From Functions “latest” list + sequencing overview.

Cart and Checkout Validation

Cart Transform

Delivery Customization

Discount

Fulfillment Constraints

Order Routing Location Rule

Payment Customization

(Shopify also shows pickup/local pickup delivery option generators in the sequencing view; treat those as “possible but version-dependent” capabilities.)

A6) Web pixel standard events (complete stable list)

alert_displayed, cart_viewed, checkout_address_info_submitted, checkout_completed, checkout_contact_info_submitted, checkout_shipping_info_submitted, checkout_started, collection_viewed, page_viewed, payment_info_submitted, product_added_to_cart, product_removed_from_cart, product_viewed, search_submitted, ui_extension_errored

B) SuperApp AI Taxonomy (Type → Category → Blocks)
1) Type: Online Store Theme (Theme app extensions)
1.1 Category: App Blocks (in sections)

Required capability: Theme app extension App block (target=section).

Allowed placement filters (stable):

Templates = values in Section A2

Groups = header|footer|aside|custom.<NAME>|*

Allowed settings types (stable):

Any of the 32 setting input types from Section A3.

Block archetypes (you can generate unlimited named blocks; these are the systematic “kinds”)

Shopify does not limit you to “product block / collection block” types. Those are your catalog labels. The stable part is target=section + settings types + placement filters.

Universal UI blocks

Targets: theme section app block

Typical settings: text/richtext, color scheme, image/video, URL, checkbox toggles

What it does: banners, trust badges, countdowns, FAQs, testimonials, feature lists.

Product-page blocks

Targets: theme section app block, filtered to product templates

Typical settings: product/product_list, richtext, color, select/radio for layout

What it does: upsell widgets, size charts, review summaries, sticky helpers.

Collection-page blocks

Targets: theme section app block, filtered to collection, list-collections

Typical settings: collection/collection_list, product_list, image_picker

What it does: featured collection grids, promo tiles, merchandising modules.

Cart UI blocks (theme cart/drawer/page)

Targets: theme section app block, filtered to cart

Typical settings: checkbox/range, product_list, richtext

What it does: free-shipping progress, donation, gift wrap, cart upsells UI.

Header/Footer/Aside UI blocks

Targets: theme section app block, filtered to groups header|footer|aside

Typical settings: link_list, image_picker, text, color scheme

What it does: announcement bars, icons, nav enhancements, mini widgets.

1.2 Category: App Embed Blocks (global)

Required capability: Theme app extension App embed (target=head|compliance_head|body).

Allowed targets (stable): head, compliance_head, body
What it does (1–2 lines): global on/off features like scripts, tracking, SEO tags, floating widgets; works across vintage + OS2.0 themes but only has global Liquid scope.

Block archetypes

Analytics / tracking embed

Target: head or body

What it does: loads trackers, A/B tools, attribution scripts.

Compliance / consent embed

Target: compliance_head / body

What it does: cookie consent, compliance scripts, required notices.

Global UI overlay

Target: body

What it does: floating chat/help bubble, sticky promos, sitewide widgets.

2) Type: Checkout UI Extensions
Category groups (these are Shopify’s complete target groups)

All targets are finite and listed in Shopify’s target reference.

For each group below:

Required capability: Checkout UI extension

Allowed targets: exactly as listed

What it does: 1–2 lines

Block archetypes: examples your AI can generate

2.1 Address

Targets: purchase.address-autocomplete.suggest, purchase.address-autocomplete.format-suggestion

What it does: power address autocomplete by returning suggestions + formatting.

Block archetypes: “Address autocomplete provider”, “Address normalizer”.

2.2 Announcement

Target: purchase.thank-you.announcement.render

What it does: dismissible message at top of Thank you page.

Blocks: “Post-purchase instructions”, “Warranty activation notice”.

2.3 Block (merchant-placeable)

Targets: purchase.checkout.block.render, purchase.thank-you.block.render

What it does: flexible placement not tied to a specific checkout section.

Blocks: “Upsell block”, “Trust block”, “Order note / gift message”.

2.4 Footer

Targets: purchase.checkout.footer.render-after, purchase.thank-you.footer.render-after

What it does: content beneath footer; good for policies or support.

Blocks: “Support CTA”, “Legal/disclaimer”.

2.5 Header

Targets: purchase.checkout.header.render-after, purchase.thank-you.header.render-after

What it does: top-of-page messaging below header.

Blocks: “Shipping cut-off timer”, “Secure checkout badge row”.

(You can continue the same pattern for the rest of the groups: Information, Local Pickup, Navigation, Order Summary, Payments, Pickup Points, Shipping — they’re all in the same target list page.)

3) Type: Shopify Functions (backend logic)
3.1 Category: Cart Transform

Capability: Functions API = Cart Transform

What it does: rewrite cart lines (merge/split/bundle-like transformations).

AI blocks: “Bundle builder logic”, “Gift-with-purchase line merge”.

3.2 Category: Discount

Capability: Functions API = Discount

What it does: compute line/order/delivery discounts during checkout flow.

AI blocks: “Tiered discount rules”, “BOGO”, “Shipping discount”.

3.3 Category: Delivery Customization

Capability: Functions API = Delivery Customization

What it does: rename/reorder/hide shipping methods dynamically.

AI blocks: “Hide COD for risky carts”, “Prioritize fastest delivery”.

3.4 Category: Payment Customization

Capability: Functions API = Payment Customization

What it does: rename/reorder/hide payment methods based on rules.

AI blocks: “Hide COD for high value”, “Rename wallet labels”.

3.5 Category: Cart & Checkout Validation

Capability: Functions API = Cart and Checkout Validation

What it does: block checkout (or show errors) when conditions fail.

AI blocks: “Minimum order rules”, “Restricted items by region”.

3.6 Category: Fulfillment Constraints

Capability: Functions API = Fulfillment Constraints

What it does: constrain how items can be fulfilled/grouped.

AI blocks: “Split fragile items”, “Force certain items to ship alone”.

3.7 Category: Order Routing Location Rule

Capability: Functions API = Order Routing Location Rule

What it does: influence which location fulfills the order.

AI blocks: “Prefer nearest warehouse”, “Prefer location with stock buffer”.

4) Type: Customer Account UI Extensions

Shopify’s customer account targets are finite and grouped; your generator picks one target per module.

Category groups (complete)

Footer → customer-account.footer.render-after (global across account pages)

Full page → new pages: customer-account.page.render, customer-account.order.page.render

Order action menu → button + modal: ...menu-item.render, ...action.render

Order index → announcement/block: ...announcement.render, ...block.render
(Order status + profile groups are on the same page further down.)

For each group, SuperApp categories usually map like:

“Support & returns”, “Loyalty & referrals”, “Reorder & subscriptions”, “B2B tools”, “Invoices/Docs”

5) Type: Admin UI Extensions

Admin targets are finite; your generator chooses the page context + whether it’s an action, block, print action, etc.

Category: Resource page actions (modal)

Targets: admin.<resource>.<...>.action.render across orders, products, customers, etc.

What it does: adds a button/menu entry that opens your UI.

Category: Resource page blocks (embedded card)

Targets: admin.<resource>.<...>.block.render

What it does: shows a persistent card on the page (status, insights, controls).

Category: Function settings in admin

Target: admin.discount-details.function-settings.render

What it does: configure your discount functions inside discount details.

(There are also segmentation templates, product configuration targets, and validation settings targets — all finite.)

6) Type: POS UI Extensions

POS targets are finite and grouped by POS screens; your generator picks one target per module.

Category groups (complete, by screen)

Home screen smart grid → pos.home.tile.render, pos.home.modal.render

Cart details → action/menu-item targets (line item tools)

Customer details / Draft order / Order / Product / Register details → block + menu-item + modal targets

Receipts → header/footer receipt blocks

Post-purchase / post-return / exchange post → corresponding targets (some marked preview/beta in docs)

7) Type: Web Pixels
Category: Tracking & analytics events

Allowed events: the full stable list in Section A6

What it does: subscribe to storefront/checkout behavioral events for analytics & marketing.

8) Type: Flow
Category: Automation plumbing (finite “extension kinds”)

Triggers, Actions, Templates, Lifecycle events (apps define their own trigger/action identifiers; Shopify defines these kinds).

C) How your “Type / Category / Block” should be stored (so AI never misses capability)

For every block your AI generates, store these fields:

type (Theme | Checkout UI | Functions | Admin | Customer accounts | POS | Pixels | Flow | Payments)

category (business intent label, e.g., Upsell / Trust / Shipping / Support / Analytics)

block_name (your custom name; unlimited)

shopify_capability (Theme app block/embed OR specific extension family OR specific Function API)

targets (must be from Shopify’s finite target list for that capability)

placement_filters (Theme only: templates + groups)

settings_schema

Theme: setting types must be from the 32 allowed types

Others: store as internal config schema (still structured)

If you want the next continuation, I’ll expand Checkout UI and Customer Account and Admin/POS sections to include every single target under each group (with 1–2 lines of “what it’s best for”), in the same strict format as above.

Continue 
Thought for 5m 0s

Alright — here’s the expanded, strict SuperApp AI catalog with every target/value Shopify defines (for these surfaces) plus 1–2 line “what it’s for” descriptions, and the exact enums your generator can safely use.

1) Online Store Theme (Theme app extensions)
1.1 Capability: App blocks vs App embeds (finite)
App block

Schema target: section (used for app blocks)

Meaning: merchant drops your block inside a theme section (via Theme Editor).

App embed

Schema target values: head, compliance_head, body (used for embeds)

Meaning: globally enable/disable “app embed” (scripts, floating widgets, consent banners, etc.).

1.2 Where your Theme App Block can be inserted (finite placement modes)

These are the Theme Editor deep-link target modes you can support (useful for “Install block” UX):

target=newAppsSection

Adds your app block in a new “Apps” section in any JSON template.

target=sectionGroup:{header|footer|aside}

Adds your app block to a section group (only these three group types are supported by this deep link).

target=mainSection

Adds your app block to the main section (ID "main").

target=sectionId:{sectionId}

Adds your app block to a specific section instance by ID (from the JSON template).

Extra practical note: Shopify says all Theme Store JSON templates must support app blocks in the “Apps section” flow.

1.3 Placement filters your generator can output (finite enums)
A) Template page types (complete enum)

Use these for enabled_on.templates / disabled_on.templates:

404, article, blog, cart, collection, list-collections,
customers/account, customers/activate_account, customers/addresses, customers/login, customers/order, customers/register, customers/reset_password,
gift_card, index, page, password, product, search

B) Section group types (complete enum)

Use these for enabled_on.groups / disabled_on.groups:

header, footer, aside, custom.<NAME>, and ["*"]

Also, section group files themselves accept: header, footer, aside, or custom.<name>.

1.4 Theme settings input types (complete enum — 32 total)

Your app blocks (and theme sections) can only use these setting types:

Basic (7): checkbox, number, radio, range, select, text, textarea
Specialized (listed in doc index): article, article_list, blog, collection, collection_list, color, color_background, color_scheme, color_scheme_group, font_picker, html, image_picker, inline_richtext, link_list, liquid, metaobject, metaobject_list, page, product, product_list, richtext, text_alignment, url, video, video_url

1.5 SuperApp Theme taxonomy (how YOU label blocks)

Shopify doesn’t impose “product block vs collection block” types — you define unlimited block names, but they must map to App block (section) or App embed above.

Use these SuperApp categories for organization:

Theme → App Blocks (target=section)

Universal UI blocks: banners, trust badges, FAQs, testimonials.

Product blocks: upsell widgets, size chart, sticky helpers.

Collection blocks: promo grids, featured collections.

Cart UI blocks: progress bar, donation, gift-wrap UI (cart template).

Header/Footer blocks: announcement bar, icons, nav helper (via section groups).

Theme → App Embeds (target=head|compliance_head|body)

Tracking / scripts: analytics loaders.

Compliance: cookie consent, required head injections.

Floating UI: chat bubble, sticky overlay widgets.

2) Checkout UI Extensions (complete targets + what each is for)

Shopify target list is finite and grouped.
Also: Block targets render wherever the merchant places them in the checkout editor (not tied to a specific checkout feature).

2.1 Announcement

purchase.thank-you.announcement.render

Dismissible announcement at the top of the Thank you page.

2.2 Block (merchant-placeable)

purchase.checkout.block.render

Placeable block anywhere in checkout via editor (not tied to a specific feature).

purchase.thank-you.block.render

Placeable block on Thank you page via editor.

2.3 Footer

purchase.checkout.footer.render-after

Content rendered below the checkout footer.

purchase.thank-you.footer.render-after

Content rendered below the Thank you footer.

2.4 Header

purchase.checkout.header.render-after

Content rendered below the checkout header.

purchase.thank-you.header.render-after

Content rendered below the Thank you header.

2.5 Information

purchase.checkout.contact.render-after

Renders immediately after the contact form element.

purchase.thank-you.customer-information.render-after

Renders after customer info section on Thank you page.

2.6 Local Pickup

purchase.checkout.pickup-location-list.render-after

After pickup location options list.

purchase.checkout.pickup-location-list.render-before

Before pickup location options list.

purchase.checkout.pickup-location-option-item.render-after

After pickup location details (per option item).

2.7 Navigation

purchase.checkout.actions.render-before

Immediately before the “actions” area in each checkout step (buttons).

2.8 Order Summary

purchase.checkout.cart-line-item.render-after

On each line item, under the line item properties element.

purchase.checkout.cart-line-list.render-after

After all line items.

purchase.checkout.reductions.render-after

In order summary after discount form + discount tags.

purchase.checkout.reductions.render-before

In order summary before the discount form.

purchase.thank-you.cart-line-item.render-after

On Thank you page, on each line item under properties element.

purchase.thank-you.cart-line-list.render-after

On Thank you page, after all line items.

2.9 Payments

purchase.checkout.payment-method-list.render-after

Below payment method list.

purchase.checkout.payment-method-list.render-before

Between payment heading and payment method list.

2.10 Pickup Points

purchase.checkout.pickup-point-list.render-after

Immediately after pickup points.

purchase.checkout.pickup-point-list.render-before

Immediately before pickup points.

2.11 Shipping

purchase.checkout.delivery-address.render-after

After shipping address form elements.

purchase.checkout.delivery-address.render-before

Between shipping address header and form elements.

purchase.checkout.shipping-option-item.details.render

Under the shipping method within the option list (per option).

purchase.checkout.shipping-option-item.render-after

After shipping method details (per option).

purchase.checkout.shipping-option-list.render-after

After all shipping method options.

purchase.checkout.shipping-option-list.render-before

Between shipping method header and shipping method options.

SuperApp Checkout categories (recommended labels)

Trust & messaging: header/footer/announcement

Upsell: order summary line items, reductions, block targets

Shipping UX: delivery address + shipping options + pickup

Payment UX: payment method list

CTA control: actions area

3) Post-purchase Extensions (complete extension points)

Checkout::PostPurchase::ShouldRender

Checkout::PostPurchase::Render

Notes that matter for your catalog:

Post-purchase is Beta and needs access request for live stores (per Shopify guide).

4) Customer Account UI Extensions (complete targets + what each is for)

Target list is finite and grouped.

4.1 Footer

customer-account.footer.render-after

Below footer on all customer account pages (order index/status/profile/settings/new pages).

4.2 Full page

customer-account.page.render

Create a new full page inside customer accounts.

customer-account.order.page.render

Create a new full page tied to a specific order.

4.3 Order action menu

customer-account.order.action.menu-item.render

Renders as an order action button on Order index + Order status pages.

customer-account.order.action.render

Renders the modal after the customer clicks the action button.

4.4 Order index

customer-account.order-index.announcement.render

Dismissible announcement on top of order index page.

customer-account.order-index.block.render

Block target exclusively on order index page.

4.5 Order status

customer-account.order-status.announcement.render

Dismissible announcement on top of order status page.

customer-account.order-status.block.render

Block target exclusively on order status page.

customer-account.order-status.cart-line-item.render-after

On each line item, under line item properties (order status).

customer-account.order-status.cart-line-list.render-after

After all line items (order status).

customer-account.order-status.customer-information.render-after

Below order details section (order status).

customer-account.order-status.fulfillment-details.render-after

In delivery status card (order status).

customer-account.order-status.payment-details.render-after

In payment status section (order status).

customer-account.order-status.return-details.render-after

In return status card (order status).

customer-account.order-status.unfulfilled-items.render-after

In delivery card for unfulfilled items.

4.6 Profile (B2B)

customer-account.profile.company-details.render-after

customer-account.profile.company-location-addresses.render-after

customer-account.profile.company-location-payment.render-after

customer-account.profile.company-location-staff.render-after

4.7 Profile (Default)

customer-account.profile.addresses.render-after

customer-account.profile.announcement.render

customer-account.profile.block.render

SuperApp Customer Account categories (recommended labels)

Support & returns: order status targets, return details

Reorder/subscription: order status line items + action menu

B2B tools: company/profile targets

Account marketing: announcements + footer

5) Admin UI Extensions (complete targets + what each is for)

Targets are finite and grouped.

5.1 Admin actions (modal launch points)

These are “More actions” / contextual action locations:

admin.abandoned-checkout-details.action.render

admin.catalog-details.action.render

admin.collection-details.action.render

admin.collection-index.action.render

admin.company-details.action.render

admin.customer-details.action.render

admin.customer-index.action.render

admin.customer-index.selection-action.render (multi-select)

admin.customer-segment-details.action.render

admin.discount-details.action.render

admin.discount-index.action.render

admin.draft-order-details.action.render

admin.draft-order-index.action.render

admin.draft-order-index.selection-action.render (multi-select)

admin.gift-card-details.action.render

admin.order-details.action.render

admin.order-fulfilled-card.action.render (only when your app is fulfillment app)

admin.order-index.action.render

admin.order-index.selection-action.render (multi-select)

admin.product-details.action.render

admin.product-index.action.render

admin.product-index.selection-action.render (multi-select)

admin.product-variant-details.action.render

admin.product-purchase-option.action.render (purchase options card)

admin.product-variant-purchase-option.action.render (variant purchase options card)

What this category is for: “do something now” modals (fraud check, edit metadata, fulfill, print, approvals, etc.).

5.2 Admin blocks (embedded cards)

admin.abandoned-checkout-details.block.render

admin.catalog-details.block.render

admin.collection-details.block.render

admin.company-details.block.render

admin.company-location-details.block.render

admin.customer-details.block.render

admin.draft-order-details.block.render

admin.gift-card-details.block.render

admin.discount-details.function-settings.render (function settings UI)

admin.order-details.block.render

admin.product-details.block.render

admin.product-variant-details.block.render

What this category is for: always-visible “status + controls” card on a resource page.

5.3 Admin print actions

admin.order-details.print-action.render

admin.product-details.print-action.render

admin.order-index.selection-print-action.render

admin.product-index.selection-print-action.render

What this category is for: custom print templates / documents.

5.4 Customer segmentation (templates)

admin.customers.segmentation-templates.render

Adds templates into customer segment editor.

5.5 Product configuration

admin.product-details.configuration.render

admin.product-variant-details.configuration.render

What this category is for: bundle/product configuration UI in admin.

5.6 Validation settings

admin.settings.validation.render

Checkout rules settings page — configure validation rules.

6) POS UI Extensions (complete targets + what each is for)

POS targets are finite and grouped by POS screen.

6.1 Home screen (smart grid)

pos.home.tile.render

Persistent tile entry point on POS home screen.

pos.home.modal.render

Full-screen modal launched when tile is tapped.

6.2 Cart details

pos.cart.line-item-details.action.menu-item.render

Menu item on a cart line item details screen.

pos.cart.line-item-details.action.render

Modal launched from that menu item.

6.3 Customer details

pos.customer-details.block.render

Inline content in customer details screen.

pos.customer-details.action.menu-item.render

Menu item action on customer screen.

pos.customer-details.action.render

Modal launched from that action.

6.4 Draft order details

pos.draft-order-details.block.render

pos.draft-order-details.action.menu-item.render

pos.draft-order-details.action.render

6.5 Order details

pos.order-details.block.render

pos.order-details.action.menu-item.render

pos.order-details.action.render

6.6 Post-exchange (Beta / feature preview)

pos.exchange.post.block.render

pos.exchange.post.action.menu-item.render

pos.exchange.post.action.render

6.7 Post-purchase

pos.purchase.post.block.render

pos.purchase.post.action.menu-item.render

pos.purchase.post.action.render

6.8 Post-return (Beta / feature preview)

pos.return.post.block.render

pos.return.post.action.menu-item.render

pos.return.post.action.render

6.9 Product details

pos.product-details.block.render

pos.product-details.action.menu-item.render

pos.product-details.action.render

6.10 Receipts (Beta / feature preview)

pos.receipt-header.block.render

Custom content in receipt header.

pos.receipt-footer.block.render

Custom content in receipt footer.

6.11 Register details

pos.register-details.block.render

pos.register-details.action.menu-item.render

pos.register-details.action.render

7) Shopify Functions (complete API list + how you categorize)

Functions “latest” API list (finite):

Cart and Checkout Validation

Cart Transform

Delivery Customization

Discount

Fulfillment Constraints

Order Routing Location Rule

Payment Customization

SuperApp categories:

Cart logic: Cart Transform

Discount logic: Discount

Shipping logic: Delivery Customization

Payment logic: Payment Customization

Checkout gating: Cart & Checkout Validation

Fulfillment routing: Fulfillment Constraints + Order Routing Location Rule

8) Web Pixels (complete standard events list + meaning)

Standard events list (finite):

alert_displayed — user saw an alert

cart_viewed — cart page visited

checkout_address_info_submitted — address submitted

checkout_completed — purchase completed

checkout_contact_info_submitted — contact form submitted

checkout_shipping_info_submitted — shipping rate chosen

checkout_started — checkout started

collection_viewed — collection page viewed

page_viewed — page viewed

payment_info_submitted — payment info submitted

product_added_to_cart — add to cart

product_removed_from_cart — remove from cart

product_viewed — product page viewed

search_submitted — storefront search

ui_extension_errored — extension render error

9) Flow (what’s “finite” vs what’s app-defined)

From Shopify’s extension system, Flow supports these extension kinds (finite): triggers, actions, templates, lifecycle events.

Important for “don’t miss anything”:

The names/handles of triggers/actions are app-defined, so the only stable catalog you can pre-list is:

Flow Trigger (your app emits events)

Flow Action (Flow calls your app)

Flow Template (packaged “recipe”)

Lifecycle callbacks (Flow notifies enable/disable / usage, etc.)

Next step (tell me “continue”)

I’ll convert this exact catalog into a single SuperApp AI “Allowed Values Manifest” layout:

type → category → block_archetype

allowed_targets[]

allowed_filters (templates/groups)

allowed_settings_types[]

capability_requirements (Theme/Checkout/Functions/Pixels/etc.)

notes (beta/preview/requires access)

…so your AI module can literally select only valid values when generating “recipes / blocks / categories.”

Continue
Thought for 2m 46s

Here’s the SuperApp AI “Allowed Values Manifest” — formatted exactly as:

Type → Categories → Block archetypes → Allowed targets (finite enums) → Allowed filters/settings (finite enums) → Notes (plan/review/limits) → 1–2 line purpose

All “Type” coverage is the full Shopify app-extension list (no missing surfaces).

SuperApp AI Allowed Values Manifest
0) Global rules
0.1 Types you can generate into (complete)

From Shopify’s official “List of app extensions”:

Admin: Admin actions, Admin blocks, Product configuration, Admin link extensions, Discount function settings, Navigation links, Purchase options extensions, Subscription link

Checkout: Checkout UI extensions, Shopify Functions, Post-purchase

Customer accounts: Customer account UI extensions

Flow: Triggers, Actions, Templates, Lifecycle Events

Online store: Theme app extensions

POS: POS UI extensions, App Bridge embedded apps (POS)

Marketing/analytics: Web pixel

Payments: Payments extension (review-required)

1) Type: Online store → Theme app extensions
1.1 Categories (finite “extension kinds”)

A) App block

Allowed schema target enum: section

Purpose: a merchant places your widget inside sections in the Theme Editor.

B) App embed block

Allowed schema target enum: compliance_head | head | body

Purpose: global on/off features (scripts, floating widgets, consent banners).

Notes: embeds are deactivated by default after install; merchant enables them in Theme Editor → Theme settings → App embeds.

1.2 Allowed placement filters (finite enums)

These are your stable “where can this appear” values.

A) Template type enum (complete)
404, article, blog, cart, collection, list-collections, customers/account, customers/activate_account, customers/addresses, customers/login, customers/order, customers/register, customers/reset_password, gift_card, index, page, password, product, search

Important template notes

Metaobject pages exist as metaobject/<type> templates when the metaobject definition has webpage capability.

gift_card and robots.txt cannot be JSON templates (must be Liquid templates).

Legacy customer account theme templates are deprecated (customer accounts now operate independently of themes).

B) Section group type enum (complete)
header | footer | aside | custom.<NAME> | *

1.3 Allowed theme setting input types (finite enum, complete)

Your app-block settings UI (in Theme Editor) can only use these types:

Basic (7): checkbox, number, radio, range, select, text, textarea

Specialized (25): article, article_list, blog, collection, collection_list, color, color_background, color_scheme, color_scheme_group, font_picker, html, image_picker, inline_richtext, link_list, liquid, metaobject, metaobject_list, page, product, product_list, richtext, text_alignment, url, video, video_url

1.4 Theme block archetypes (your catalog labels)

Shopify does not have a finite built-in list of “product blocks / collection blocks / section list blocks”.
The finite part is: (app block vs embed) + target enum + template enum + section-group enum + setting-type enum.

Use these SuperApp categories so your AI can systematically generate blocks:

Theme → App blocks (target=section)

Universal UI: banners, trust badges, FAQs, testimonials, feature rows

Filters: any templates, optionally header/footer/aside group.

Product page: upsell widgets, size chart, sticky helpers

Filters: product

Collection/listing: featured collection grids, promo tiles

Filters: collection, list-collections

Cart UI: free-shipping progress, gift wrap, donation, order note UI

Filters: cart

Content pages: blog/article blocks, static info, embedded forms

Filters: page, blog, article

Theme → App embeds (target=head|compliance_head|body)

Tracking/scripts: analytics loaders

Compliance: cookie consent / required head tags

Floating UI: chat bubble, floating widgets

Theme integration note: Shopify positions theme app extensions as the replacement for ScriptTag/Asset-based storefront injection.

2) Type: Checkout → Checkout UI extensions
2.1 Availability notes (important constraints)

Checkout UI extensions exist for checkout flow; information/shipping/payment steps require Shopify Plus per Shopify docs.

Thank-you / order-status style placements are available more broadly (varies by plan per Shopify help center).

2.2 Target enum (complete, with 1–2 line purpose)

(Everything below is from the official targets list.)

Address

purchase.address-autocomplete.suggest — provide address suggestions.

purchase.address-autocomplete.format-suggestion — format a chosen suggestion.

Announcement

purchase.thank-you.announcement.render — dismissible announcement on Thank you page.

Block (merchant-placeable)

purchase.checkout.block.render — not tied to a specific feature; merchant places it in checkout editor.

purchase.thank-you.block.render — same concept on Thank you page.

Footer

purchase.checkout.footer.render-after — content below checkout footer.

purchase.thank-you.footer.render-after — content below Thank you footer.

Header

purchase.checkout.header.render-after — content below checkout header.

purchase.thank-you.header.render-after — content below Thank you header.

Information

purchase.checkout.contact.render-after — after contact form element.

purchase.thank-you.customer-information.render-after — after customer info on Thank you.

Local pickup

purchase.checkout.pickup-location-list.render-before

purchase.checkout.pickup-location-list.render-after

purchase.checkout.pickup-location-option-item.render-after

Navigation

purchase.checkout.actions.render-before — before the action buttons area.

Order summary

purchase.checkout.cart-line-item.render-after — per line item, under properties.

purchase.checkout.cart-line-list.render-after — after line items list.

purchase.checkout.reductions.render-before — before discount form.

purchase.checkout.reductions.render-after — after discount form + tags.

purchase.thank-you.cart-line-item.render-after

purchase.thank-you.cart-line-list.render-after

Payments

purchase.checkout.payment-method-list.render-before — between heading and list.

purchase.checkout.payment-method-list.render-after — below list.

Pickup points

purchase.checkout.pickup-point-list.render-before

purchase.checkout.pickup-point-list.render-after

Shipping

purchase.checkout.delivery-address.render-before

purchase.checkout.delivery-address.render-after

purchase.checkout.shipping-option-item.details.render

purchase.checkout.shipping-option-item.render-after

purchase.checkout.shipping-option-list.render-before

purchase.checkout.shipping-option-list.render-after

2.3 SuperApp categories (recommended mapping)

Trust/messaging: header/footer/announcement

Upsell: block targets + line-item targets + reductions

Shipping UX: delivery address + shipping options + pickup

Payment UX: payment method list

CTA workflow: actions area

3) Type: Checkout → Post-purchase (review-required)
3.1 Extension points (finite)

Shopify’s post-purchase extension is review-required.
(Your internal taxonomy can label this as “Post-purchase Offer”.)

4) Type: Checkout → Shopify Functions (backend logic)
4.1 Function API enum (complete “latest” list)

From Function APIs index:

Cart Transform — change how cart items are bundled/presented.

Discount — unified discount API (lines/order + shipping discounts).

Delivery Customization — reorder/rename/hide delivery options.

Payment Customization — reorder/rename/hide payment methods, payment terms, review requirement.

Cart & Checkout Validation — block/allow checkout with server-side rules.

Fulfillment Constraints — constrain fulfillment behavior.

Order Routing Location Rule — influence fulfillment location routing.

4.2 Hard limits (important)

Discount functions: max 25 active per store (run concurrently).

Delivery customization functions: max 25 active per store.

Shopify standardized target/operation naming across several Function APIs (affects v2025-07+).

4.3 SuperApp Function categories

Cart logic: Cart Transform

Discount logic: Discount

Shipping logic: Delivery Customization

Payment logic: Payment Customization

Checkout gating: Cart & Checkout Validation

Fulfillment routing: Fulfillment Constraints + Order Routing Location Rule

5) Type: Customer accounts → Customer account UI extensions
5.1 Target enum (complete, with purpose)

(From official target list.)

Footer

customer-account.footer.render-after — after footer on customer account pages.

Full page

customer-account.page.render — create a new customer-account page.

customer-account.order.page.render — create a new page tied to a specific order.

Order action menu

customer-account.order.action.menu-item.render — action button on order index + order status.

customer-account.order.action.render — modal opened by that action.

Order index

customer-account.order-index.announcement.render — dismissible announcement on top.

customer-account.order-index.block.render — merchant-placeable block on order index.

Order status

customer-account.order-status.announcement.render

customer-account.order-status.block.render

customer-account.order-status.cart-line-item.render-after

customer-account.order-status.cart-line-list.render-after

customer-account.order-status.customer-information.render-after

customer-account.order-status.fulfillment-details.render-after

customer-account.order-status.payment-details.render-after

customer-account.order-status.return-details.render-after

customer-account.order-status.unfulfilled-items.render-after

Profile (B2B)

customer-account.profile.company-details.render-after

customer-account.profile.company-location-addresses.render-after

customer-account.profile.company-location-payment.render-after

customer-account.profile.company-location-staff.render-after

Profile (Default)

customer-account.profile.addresses.render-after

customer-account.profile.announcement.render

customer-account.profile.block.render

5.2 SuperApp categories (recommended mapping)

Support & returns: return-details, fulfillment-details, order status block

Reorder / subscriptions: cart-line targets + order action menu

B2B utilities: company/profile targets

Account marketing: announcements + footer

6) Type: Admin → Admin UI extensions + related admin extensions
6.1 Admin “surface” enum (complete from Shopify list)

Admin actions, Admin blocks, Product configuration, Admin link extensions, Discount function settings, Navigation links, Purchase options extensions, Subscription link.
Admin UI extensions are the “blocks + actions” system.

6.2 Admin targets enum (complete)

Use this page as the canonical list for *.render targets.

Admin Action targets (render) (examples include orders/products/customers/etc.)
All of these are on the “Admin targets” reference:

admin.abandoned-checkout-details.action.render

admin.catalog-details.action.render

admin.collection-details.action.render

admin.collection-index.action.render

admin.company-details.action.render

admin.customer-details.action.render

admin.customer-index.action.render

admin.customer-index.selection-action.render

admin.customer-segment-details.action.render

admin.discount-details.action.render

admin.discount-index.action.render

admin.draft-order-details.action.render

admin.draft-order-index.action.render

admin.draft-order-index.selection-action.render

admin.gift-card-details.action.render

admin.order-details.action.render

admin.order-fulfilled-card.action.render

admin.order-index.action.render

admin.order-index.selection-action.render

admin.product-details.action.render

admin.product-index.action.render

admin.product-index.selection-action.render

admin.product-variant-details.action.render

admin.product-purchase-option.action.render

admin.product-variant-purchase-option.action.render

Admin Block targets (render)

admin.abandoned-checkout-details.block.render

admin.catalog-details.block.render

admin.collection-details.block.render

admin.company-details.block.render

admin.company-location-details.block.render

admin.customer-details.block.render

admin.draft-order-details.block.render

admin.gift-card-details.block.render

admin.discount-details.function-settings.render

admin.order-details.block.render

admin.product-details.block.render

admin.product-variant-details.block.render

Admin Print Action targets (render)

admin.order-details.print-action.render

admin.product-details.print-action.render

admin.order-index.selection-print-action.render

admin.product-index.selection-print-action.render

Segmentation templates (render)

admin.customers.segmentation-templates.render

Product configuration (render)

admin.product-details.configuration.render

admin.product-variant-details.configuration.render

Validation settings (render)

admin.settings.validation.render

6.3 Admin “ShouldRender” targets (important extra enum)

For many Admin actions, there are companion targets like *.action.should-render that control whether the action shows. This is part of the Admin extension APIs.

6.4 SuperApp Admin categories

In-page cards: Admin blocks

Task modals: Admin actions (optionally gated by should-render)

Print docs: Print action targets

Discount configuration UI: discount function settings render

Segmentation: segmentation templates render

Bundles config: product configuration render

Checkout rule settings: validation settings render

7) Type: POS → POS UI extensions
7.1 Target enum (complete)

Canonical list:

Home screen

pos.home.tile.render — persistent tile on smart grid.

pos.home.modal.render — full-screen modal launched from tile.

Cart

pos.cart.line-item-details.action.menu-item.render

pos.cart.line-item-details.action.render

Customer

pos.customer-details.block.render

pos.customer-details.action.menu-item.render

pos.customer-details.action.render

Draft order

pos.draft-order-details.block.render

pos.draft-order-details.action.menu-item.render

pos.draft-order-details.action.render

Order

pos.order-details.block.render — custom info section inside order details.

pos.order-details.action.menu-item.render

pos.order-details.action.render

Exchange (post)

pos.exchange.post.block.render

pos.exchange.post.action.menu-item.render

pos.exchange.post.action.render

Purchase (post)

pos.purchase.post.block.render

pos.purchase.post.action.menu-item.render

pos.purchase.post.action.render

Return (post)

pos.return.post.block.render

pos.return.post.action.menu-item.render

pos.return.post.action.render

Product

pos.product-details.block.render

pos.product-details.action.menu-item.render

pos.product-details.action.render

Receipt

pos.receipt-header.block.render

pos.receipt-footer.block.render

Register

pos.register-details.block.render

pos.register-details.action.menu-item.render

pos.register-details.action.render

7.2 POS UI constraints (example)

Some targets strictly limit what you can render (e.g., tile target only renders a Tile component).

8) Type: Marketing/analytics → Web pixel
8.1 Standard event enum (complete)

Canonical list:
alert_displayed, cart_viewed, checkout_address_info_submitted, checkout_completed, checkout_contact_info_submitted, checkout_shipping_info_submitted, checkout_started, collection_viewed, page_viewed, payment_info_submitted, product_added_to_cart, product_removed_from_cart, product_viewed, search_submitted, ui_extension_errored

Notes (example behavior): checkout_completed typically fires once per checkout, commonly on Thank you (with exceptions around upsells/post-purchase flows).

9) Type: Flow → Triggers / Actions / Templates / Lifecycle events
9.1 Extension-kind enum (complete)

From Shopify list of app extensions: Triggers, Actions, Templates, Lifecycle Events.

9.2 What’s “finite” vs “app-defined”

Finite: the 4 extension kinds above.

App-defined: the actual trigger IDs + action IDs (your app publishes these).

10) Type: Payments → Payments extension (review-required)
10.1 What’s finite here (at the “catalog” level)

It’s a distinct extension type and is review-required.

In SuperApp taxonomy: “Payment method provider” category.

Next continuation (tell me “continue” again)

I’ll turn this manifest into a store-facing “Feature Matrix” that your AI can show in UI:

“Where can this appear?” (with the exact targets)

“What can it change?” (Functions vs UI vs Theme)

“Plan requirements & review requirements” (Plus / review-required)

…and I’ll also derive the cart vs checkout distinction cleanly (Theme cart UI vs Cart Transform Function vs Checkout UI blocks), so customers don’t confuse them.

here’s the store-facing Feature Matrix (what merchants can do + where it shows + what it changes + requirements), and then a clean Cart vs Checkout vs Post-checkout distinction so your SuperApp AI UI never confuses these.

1) Feature Matrix (merchant-facing)
A) Online Store Theme (Theme Editor)

Where merchant configures it: Theme Editor (customize theme).
What it changes: Storefront UI only (pages, sections, cart page/drawer UI).
Shopify capability: Theme app extension.

A1) Theme App Block

Appears in: Theme sections (merchant places it in a section)

Target enum (finite): section

Where it can be placed (filters):

Templates (finite enum): 404, article, blog, cart, collection, list-collections, gift_card, index, page, password, product, search, ...

Section groups (finite enum): header | footer | aside | custom.<NAME> | *

What it’s used for (examples): banners, upsells, FAQs, trust badges, cart upsells, product widgets.

Merchant settings you can expose (finite enum): the 32 theme setting input types

A2) Theme App Embed Block (global)

Appears in: global theme injections (head/body), and global floating UI

Target enum (finite): head | compliance_head | body

Used for: chat bubble overlays, badges, analytics loaders, consent scripts.

Important merchant behavior: embeds are OFF by default after install; merchants enable them in Theme editor → Theme settings → App embeds

✅ Key message for merchants: “Theme blocks customize your storefront (including cart page UI). They don’t change checkout logic.”

B) Checkout & Accounts (Checkout and accounts editor)

Where merchant configures it: Shopify admin → Checkout and accounts editor (separate from Theme editor).
What it changes: UI inside checkout / thank you / order status / customer accounts pages.

B1) Checkout UI Extensions — Checkout steps (Plus-only)

Plan requirement: Information, shipping, and payment step targets are Shopify Plus only

What it’s used for: banners, upsells, shipping/payment nudges, extra UI blocks placed by merchants.

Targets (finite enum): everything under purchase.checkout.* in Shopify’s target list
Examples of where these targets appear:

Order summary: line items, reductions, etc.

Shipping: shipping option list/item/details

Payments: payment method list

Navigation/actions area (buttons)

B2) Checkout UI Extensions — Thank you & Order status pages (available as pages upgrade)

Shopify states these pages can be customized using checkout UI extensions

Shopify also states merchants can customize checkout + thank you/order status + customer accounts pages with blocks in the checkout and accounts editor

Non-Plus migration deadline: August 26, 2026 to upgrade old Thank you/Order status pages to the new version

Plus migration: plus guide references the August 28, 2025 upgrade deadline and auto-upgrades (Jan 2026 noted in the guide)

Targets (finite enums):

purchase.thank-you.* targets (Thank you page placements)

Order status often ties into customer accounts targets like customer-account.order-status.* (below).

Important tracking note for merchants: Additional scripts aren’t supported on the new Thank you/Order status pages; replace with blocks + pixels.

B3) Protected customer data (security gate)

Some checkout/thank-you/order-status/customer-account targets can require protected customer data access, which requires an application + strict review.

✅ Key message for merchants: “Checkout UI extensions add UI blocks inside checkout and post-checkout pages. Checkout-step UI is Plus-only; post-checkout pages are moving everyone to blocks/pixels via the upgrade path.”

C) Post-purchase Product Offers (the page between order confirmation and Thank you)

Where it appears: Post-purchase page (after payment, before Thank you).
Status: Beta.
Live store requirement: needs access request for live stores; dev stores are unrestricted.

✅ Key message for merchants: “This is the ‘one-click upsell after payment’ page.”

D) Shopify Functions (backend logic)

Where merchant configures it: usually via app UI + Shopify admin objects (discount nodes, payment/delivery customization settings, etc.).
What it changes: real checkout/cart logic (prices, shipping/payment availability, validation errors, cart transformation).

Function API list (finite):

Discount Function API — max 25 active per store

Payment customization — max 25 active

Cart & checkout validation — max 25 active; errors surface in cart + during checkout
(Shopify also announced the “25 active per Function API” expansion applies broadly across multiple Function APIs.)

✅ Key message for merchants: “Functions are the ‘logic engine’. If you want to change pricing, eligibility, payments/shipping, or enforce rules — it’s Functions.”

E) Web Pixels (tracking)

Where it runs: storefront/checkout tracking in Shopify’s pixel system.
What it does: event-based tracking without legacy “Additional scripts”.
Standard event list (finite): page_viewed, product_viewed, product_added_to_cart, checkout_started, checkout_completed, etc.

✅ Key message for merchants: “Pixels replace old tracking scripts on the upgraded pages.”

F) Customer Account UI Extensions

Where merchant configures it: Checkout and accounts editor.
What it changes: blocks/pages inside the new customer accounts UI.

Targets are finite (order index, order status, profile, footer, full pages). Example: Shopify’s “Add a survey…” tutorial uses both thank-you and customer-account order-status targets.

✅ Key message for merchants: “Account pages can show post-purchase content, surveys, support tools, reorder tools.”

G) Admin UI Extensions

Where it appears: Shopify admin pages (orders/products/customers/discounts/etc.)
What it changes: merchant/admin UI (actions/modals/cards/settings)
Targets are finite and enumerated in Shopify’s admin extension targets list.

✅ Key message for merchants: “Admin extensions power the configuration screens + operational tools.”

H) POS UI Extensions

Where it appears: Shopify POS app (home tile, cart/customer/order screens, receipts)
What it changes: in-store workflow UI.
Targets are finite and enumerated in Shopify’s POS targets list.

✅ Key message for merchants: “POS extensions add staff tools at checkout counter.”

I) Flow (automation)

Where it appears: Shopify Flow (workflows)
What it changes: automation logic (if-this-then-that)
Finite “kinds”: triggers, actions, templates, lifecycle events.

✅ Key message for merchants: “Flow is automation; your app supplies triggers/actions + templates (recipes).”

2) Cart vs Checkout vs Post-checkout (the clean distinction)
1) Storefront Cart UI (Theme)

Tools: Theme app blocks (target=section) on cart template, and/or cart drawer sections in a theme.
You can: show upsells, progress bars, donation options, cart messages.
You cannot: guarantee pricing logic changes (unless paired with Functions).

2) Cart/Checkout Logic (Backend)

Tools: Shopify Functions

Discounts change pricing

Cart transforms restructure cart lines (bundle-like behavior)

Validation can block checkout; errors appear in cart + checkout

Payment/Delivery customization hides/reorders payment/shipping options

This is the “truth layer.”

3) Checkout UI (During checkout)

Tools: Checkout UI extensions

UI during information/shipping/payment steps is Plus-only

UI can guide, nudge, collect input, explain rules, show offers — but logic changes still come from Functions.

4) Post-checkout pages (Thank you / Order status / Customer accounts)

Tools: Checkout UI extensions + customer account UI extensions + pixels

Shopify is moving everyone to blocks/pixels as pages upgrade (non-plus deadline Aug 26, 2026)

Great for surveys, downloads, support, reorder, tracking.

5) Post-purchase upsell page (between confirmation and Thank you)

Tools: Post-purchase offers (Beta)

Live store requires access request

3) How to present this inside your SuperApp AI UI (so it’s “systematic + stable”)

Use a 3-step picker that only exposes valid enums:

Where do you want this to run?
Theme | Checkout | Thank you/Order status | Customer accounts | Admin | POS | Automation (Flow) | Tracking (Pixels)

What are you trying to do?
UI Widget | Logic change | Tracking | Automation

Pick the exact placement (target)

Theme: section OR head/compliance_head/body + template/group filters

Checkout: target list (finite) + show plan badge “Plus-only” on purchase.checkout.*

Thank you/order status: show “Upgrade path / blocks + pixels” context

Functions: pick Function API (finite) and warn about the 25 active limit

If you want, I’ll now output this same matrix as a single JSON-ish manifest (no code, just structured text) that you can paste into your SuperApp AI documentation as the authoritative “Allowed Values Catalog.”

Continue
Thought for 3m 6s

Below is the SuperApp AI “Allowed Values Catalog” (structured manifest, copy/paste).

It contains only finite Shopify-defined enums (targets, template types, section groups, theme setting types, Functions APIs, pixel events) + constraints/notes so your AI generator can never “invent” invalid values.

SuperApp AI Allowed Values Catalog
Meta

catalog_version: 1

generated_on: 2026-03-04 (Asia/Kolkata)

Type: online_store.theme
Extension kinds (finite)

app_block

schema.target enum: section

purpose: merchant places your block inside Theme Editor sections.

app_embed_block

schema.target enum: head | compliance_head | body

purpose: global scripts + floating overlays (chat bubble, consent, badges).

important: embeds are deactivated by default after install; merchant enables via Theme Editor → Theme settings → App embeds.

Deep-link insertion modes (finite)

Use these for “Install block” UX:

target=newAppsSection

target=sectionGroup:{header|footer|aside}

target=mainSection

target=sectionId:{sectionId}

Placement filters for enable/disable (finite)

template_type enum (canonical theme templates):

404, article, blog, cart, collection, list-collections, index, page, password, product, search, metaobject/<type>, gift_card, robots.txt

note: gift_card and robots.txt can’t be JSON templates (must be Liquid).

section_group enum:

header | footer | aside | custom.<NAME> | ["*"]

note: section groups are intended mainly for header/footer; other groups (like sidebars) are typically custom.<name>.

Merchant setting input types (finite = 32)

basic: checkbox, number, radio, range, select, text, textarea

specialized: article, article_list, blog, collection, collection_list, color, color_background, color_scheme, color_scheme_group, font_picker, html, image_picker, inline_richtext, link_list, liquid, metaobject, metaobject_list, page, product, product_list, richtext, text_alignment, url, video, video_url

App block/embed schema knobs (finite fields you should allow)

Your generator should treat these as the “valid keys” set:

name, target, settings, javascript, stylesheet, tag, class, default, available_if, enabled_on, disabled_on

hard rule: app blocks and app embeds can’t be rendered on checkout step pages.

hard rule: use only one of enabled_on or disabled_on.

SuperApp categories (your labels; unlimited block names)

(Shopify doesn’t have a finite built-in list here—these are for organization.)

Universal UI (banners, FAQs, testimonials)

Product page modules (upsells, size chart, sticky helpers)

Collection/list modules (promo grids)

Cart UI modules (free shipping bar, donation, gift wrap UI)

Header/footer/aside modules

Global embeds: tracking, consent, floating widgets

Type: checkout.ui_extensions
Plan / availability constraints

Plus-only: checkout UI extensions for information, shipping, and payment steps are available only to Shopify Plus stores.

Target enum (finite, complete)

Source: Shopify “Targets” list.

Address

purchase.address-autocomplete.suggest (address suggestions)

purchase.address-autocomplete.format-suggestion (format the selected suggestion)

Announcement

purchase.thank-you.announcement.render (dismissible Thank you announcement)

Block (merchant-placeable)

purchase.checkout.block.render

purchase.thank-you.block.render

note: block targets render where merchant places them in checkout editor.

Footer

purchase.checkout.footer.render-after

purchase.thank-you.footer.render-after

Header

purchase.checkout.header.render-after

purchase.thank-you.header.render-after

Information

purchase.checkout.contact.render-after

purchase.thank-you.customer-information.render-after

Local pickup

purchase.checkout.pickup-location-list.render-before

purchase.checkout.pickup-location-list.render-after

purchase.checkout.pickup-location-option-item.render-after

Navigation

purchase.checkout.actions.render-before

Order summary

purchase.checkout.cart-line-item.render-after

purchase.checkout.cart-line-list.render-after

purchase.checkout.reductions.render-before

purchase.checkout.reductions.render-after

purchase.thank-you.cart-line-item.render-after

purchase.thank-you.cart-line-list.render-after

Payments

purchase.checkout.payment-method-list.render-before

purchase.checkout.payment-method-list.render-after

Pickup points

purchase.checkout.pickup-point-list.render-before

purchase.checkout.pickup-point-list.render-after

Shipping

purchase.checkout.delivery-address.render-before

purchase.checkout.delivery-address.render-after

purchase.checkout.shipping-option-item.details.render

purchase.checkout.shipping-option-item.render-after

purchase.checkout.shipping-option-list.render-before

purchase.checkout.shipping-option-list.render-after

Security / data constraints

Many checkout UI targets mention: “Requires access to protected customer data for some properties.”

Protected customer data access is requested via Partner Dashboard for public apps.

Performance constraint (useful “stable rule”)

UI extension compiled bundle ≤ 64 KB (enforced at deployment).

Type: checkout.post_purchase
What it is

Post-purchase checkout extensions add a post-purchase page into Shopify checkout (product offers, surveys, order info).

Notes

Treat this as a separate surface from checkout UI targets; it’s governed by Shopify’s post-purchase capability and program requirements (commonly access/review gated).

Type: checkout.thank_you_and_order_status_migration
Hard merchant-facing constraints (important for your docs/UI)

Non-Plus deadline: Aug 26, 2026 to upgrade Thank you + Order status pages to the new version.

Plus: Aug 28, 2025 deadline; auto-upgrades begin Jan 2026 and legacy customizations (additional scripts / script tags / checkout.liquid) can be lost.

Additional scripts replacement: tracking/analytics scripts on legacy Thank you must be replaced using pixels.

Type: functions
Function API enum (finite, complete)

Source: Function APIs (latest).

discount

max 25 active per store; functions run concurrently.

payment_customization

part of the “25 per Function API” expansion.

delivery_customization

part of the “25 per Function API” expansion.

cart_and_checkout_validation

max 25 active per store; errors exposed to Storefront API cart + cart template + checkout.

cart_transform

cart line transformations (bundling/merging patterns; API surface is its own Function API).

fulfillment_constraints

part of the “25 per Function API” expansion.

order_routing_location_rule

routing logic surface (fulfillment location selection influence).

SuperApp “logic categories” mapping

Cart logic → cart_transform

Pricing logic → discount

Checkout gating → cart_and_checkout_validation

Shipping logic → delivery_customization

Payment logic → payment_customization

Fulfillment logic → fulfillment_constraints + order_routing_location_rule

Type: customer_accounts.ui_extensions
Target enum (finite, complete)

Source: customer account targets list.

Footer

customer-account.footer.render-after

Full page

customer-account.page.render

customer-account.order.page.render

Order action menu

customer-account.order.action.menu-item.render

customer-account.order.action.render

Order index

customer-account.order-index.announcement.render

customer-account.order-index.block.render

Order status

customer-account.order-status.announcement.render

customer-account.order-status.block.render

customer-account.order-status.cart-line-item.render-after

customer-account.order-status.cart-line-list.render-after

customer-account.order-status.customer-information.render-after

customer-account.order-status.fulfillment-details.render-after

customer-account.order-status.payment-details.render-after

customer-account.order-status.return-details.render-after

customer-account.order-status.unfulfilled-items.render-after

Profile (B2B)

customer-account.profile.company-details.render-after

customer-account.profile.company-location-addresses.render-after

customer-account.profile.company-location-payment.render-after

customer-account.profile.company-location-staff.render-after

Profile (Default)

customer-account.profile.addresses.render-after

customer-account.profile.announcement.render

customer-account.profile.block.render

Behavior constraints

Block targets render between core features and are always rendered regardless of other elements.

Many targets note protected customer data for some properties (same policy framework).

Type: admin.ui_extensions
What it is

Admin UI extensions surface contextual app functionality inside Shopify Admin.

Target enum (finite, complete)

Source: Admin targets list.

Admin Actions (modal entry points)

admin.abandoned-checkout-details.action.render

admin.catalog-details.action.render

admin.collection-details.action.render

admin.collection-index.action.render

admin.company-details.action.render

admin.customer-details.action.render

admin.customer-index.action.render

admin.customer-index.selection-action.render

admin.customer-segment-details.action.render

admin.discount-details.action.render

admin.discount-index.action.render

admin.draft-order-details.action.render

admin.draft-order-index.action.render

admin.draft-order-index.selection-action.render

admin.gift-card-details.action.render

admin.order-details.action.render

admin.order-fulfilled-card.action.render

admin.order-index.action.render

admin.order-index.selection-action.render

admin.product-details.action.render

admin.product-index.action.render

admin.product-index.selection-action.render

admin.product-variant-details.action.render

admin.product-purchase-option.action.render

admin.product-variant-purchase-option.action.render

Admin Blocks (embedded cards)

admin.abandoned-checkout-details.block.render

admin.catalog-details.block.render

admin.collection-details.block.render

admin.company-details.block.render

admin.company-location-details.block.render

admin.customer-details.block.render

admin.draft-order-details.block.render

admin.gift-card-details.block.render

admin.discount-details.function-settings.render

admin.order-details.block.render

admin.product-details.block.render

admin.product-variant-details.block.render

Admin Print Actions

admin.order-details.print-action.render

admin.product-details.print-action.render

admin.order-index.selection-print-action.render

admin.product-index.selection-print-action.render

Segmentation templates

admin.customers.segmentation-templates.render

Product configuration

admin.product-details.configuration.render

admin.product-variant-details.configuration.render

Validation settings

admin.settings.validation.render

Extra gating enum (important)

Many Admin actions support a ShouldRender API to control visibility (show/hide action depending on context).

Type: pos.ui_extensions
What it is

Targets define where POS UI extensions appear inside Shopify POS.

Target enum (finite, complete)

Source: POS targets list.

pos.home.tile.render

pos.home.modal.render

pos.cart.line-item-details.action.menu-item.render

pos.cart.line-item-details.action.render

pos.customer-details.block.render

pos.customer-details.action.menu-item.render

pos.customer-details.action.render

pos.draft-order-details.block.render

pos.draft-order-details.action.menu-item.render

pos.draft-order-details.action.render

pos.order-details.block.render

pos.order-details.action.menu-item.render

pos.order-details.action.render

pos.exchange.post.block.render

pos.exchange.post.action.menu-item.render

pos.exchange.post.action.render

pos.purchase.post.block.render

pos.purchase.post.action.menu-item.render

pos.purchase.post.action.render

pos.return.post.block.render

pos.return.post.action.menu-item.render

pos.return.post.action.render

pos.product-details.block.render

pos.product-details.action.menu-item.render

pos.product-details.action.render

pos.receipt-header.block.render

pos.receipt-footer.block.render

pos.register-details.block.render

pos.register-details.action.menu-item.render

pos.register-details.action.render

Type: analytics.web_pixels
Standard event enum (finite, complete)

Source: standard events list.

alert_displayed

cart_viewed

checkout_address_info_submitted

checkout_completed

checkout_contact_info_submitted

checkout_shipping_info_submitted

checkout_started

collection_viewed

page_viewed

payment_info_submitted

product_added_to_cart

product_removed_from_cart

product_viewed

search_submitted

ui_extension_errored

Important event behavior (for accurate docs)

checkout_completed is typically triggered once per checkout on Thank you, but can trigger on the first upsell offer page instead (and then not again on Thank you).

Type: automation.flow
Extension kinds (finite)

flow.trigger

flow.action

flow.template

flow.lifecycle_event

What’s finite vs app-defined

Finite: the 4 kinds above.

App-defined: actual trigger IDs + action IDs your app publishes (your catalog will define those).

Template definition (for “recipes”)

A Flow template is an example workflow merchants can copy into their store.

There is an explicit Flow template reference that covers config + localization + approval process.

Type: payments.extensions
Availability constraint

Only approved Partners can build payments extensions on Shopify’s Payments Platform.

Approval/review constraints (finite requirements)

Payments extensions require approvals (Payments Partner application review + Payments app review).

Payments apps require a signed revenue share agreement before approval for live payments.

Final “generator rule”

When SuperApp AI generates anything, it must pick values in this order:

type

extension kind

target (must match that type’s finite target enum)

filters (theme: template_type + section_group, finite enums)

settings types (theme: must be one of the 32; others: your internal config)

constraints badges (Plus-only / protected data / review-required / migration deadline)

If you want, next I can turn this into your in-app “picker UI spec” (screens + fields + how the AI chooses targets automatically based on merchant intent like “upsell in cart” vs “hide COD for high value”).

Continue
Thought for 37s

Here’s the SuperApp AI Picker UI Spec — the screens, fields, guardrails, and the auto-mapping logic that converts “merchant intent” into valid Shopify targets using the Allowed Values Catalog you now have.

1) Core UX concept
Your 3 nouns (how they behave in product)

Category = business outcome bucket (Upsell, Trust, Shipping, Support, Tracking, Automation, Admin Ops, POS Ops).

Block = one deployable unit on one surface (Theme block, Checkout block, Customer Account block, Admin action, POS tile, Pixel, Function).

Recipe = a packaged solution that can include multiple blocks across surfaces (example: “COD Risk Control” = Payment Customization Function + Checkout UI message + Admin block).

This is how you get “12,000+ combinations” without inventing invalid types: it’s combinations of (Category × Surface × Target × Settings × Optional companion blocks).

2) Builder modes
Mode A: Guided (recommended default)

Merchant describes what they want → AI picks valid surfaces/targets → merchant confirms.

Mode B: Advanced (power users)

Merchant manually picks Type → Target → Filters → Settings from the finite enums.

3) Screen-by-screen UI spec
Screen 1 — “What do you want to achieve?”

Fields

Goal (Category) (single select)

Upsell & cross-sell

Trust & conversion

Shipping clarity

Payment nudges

Checkout rules (validation)

Discounts & pricing

Cart bundling / transforms

Post-purchase engagement (surveys, downloads)

Customer support & returns

Tracking / analytics

Automation (Flow)

Admin ops tooling

POS staff tooling

Payments provider (advanced/review-required)

Where should it happen? (optional; can be auto)

Storefront (Theme)

Cart (Theme)

Checkout (Plus-only targets badge)

Thank you / Order status

Customer account pages

Admin

POS

Background logic (Functions)

Tracking (Pixels)

Automation (Flow)

Primary KPI (optional)

AOV, conversion, shipping selection, COD reduction, returns deflection, etc.

Output

A suggested “Recipe plan” preview: 1–3 blocks that usually work together.

Screen 2 — “Recommended implementation plan”

This is where SuperApp AI shows the “recipe graph”.

UI

Cards like:

Block 1 (Theme App Block) → “Cart Upsell Widget”

Block 2 (Functions: Discount) → “Bundle discount rule”

Block 3 (Checkout UI Block) → “Checkout reassurance message”

Each card shows:

Type (Theme / Checkout UI / Functions / Pixel / Flow / Admin / POS)

Target (finite enum)

Plan badges:

“Plus-only” if it’s purchase.checkout.*

“Protected data” if required

“Review-required” for post-purchase / payments / Flow templates

“Migration note” for Thank you/Order status (blocks/pixels)

Controls

Toggle blocks on/off

“Replace with alternative surface” (example: if non-Plus store, swap checkout-step UI for Thank you + Customer Account blocks)

Screen 3 — “Placement picker” (per block)
If Type = Theme App Block

Fields

Template filter (multi-select, finite enum): product, cart, collection, etc.

Section group filter (optional): header/footer/aside/custom.*/*

Insertion mode (optional UI helper): new Apps section / main section / section group / section ID

Visibility rules (optional): enabled_on or disabled_on (enforce “only one”)

Preview

Theme editor deep link button: “Open theme editor and add block”

If Type = Theme App Embed

Fields

Target: head / compliance_head / body

“Embed is OFF by default” notice + enable steps

If Type = Checkout UI Extension

Fields

Target picker (single select, finite list grouped)

Address, Header, Footer, Order summary, Shipping, Payments, Block, etc.

Auto-check store plan and show:

“This target requires Shopify Plus” if purchase.checkout.* (steps)

For Thank you: allow purchase.thank-you.*

If Type = Customer Account Extension

Fields

Target group: Order index / Order status / Profile / Footer / Full page / Order action

Exact target (finite list)

If Type = Admin Extension

Fields

Select “Action / Block / Print / Configuration / Validation / Segmentation”

Exact target (finite list)

Optional: “ShouldRender gating” toggle (show/hide action based on context)

If Type = POS Extension

Fields

Select screen group (Home / Cart / Customer / Order / Product / Receipt / Register)

Exact target (finite list)

Screen 4 — “Configuration schema”

This screen is different per surface.

Theme block settings

Use only the 32 theme setting input types (checkbox/range/color/product_list/metaobject_list/etc.).
Your UI should expose a palette of allowed setting types and generate schema accordingly.

Checkout / Accounts / Admin / POS settings

These are not theme schema types, so use your internal config schema, but keep it structured:

input: text/number/select/multi-select/toggle/date/file/product picker/collection picker

advanced: conditionals, visibility rules, localization keys

Good UX pattern

“Simple” tab: common settings

“Advanced” tab: conditional visibility, layout, tracking tags

Screen 5 — “Data & permissions”

This screen is a derived summary, not manual by default.

Show

Required Shopify resources (Products, Orders, Customers, Discounts, Shipping rates, etc.)

Required scopes (derived)

“Protected customer data access” warning if needed (and how to request it)

“Review-required” warning if the recipe includes post-purchase, payments, Flow templates

Screen 6 — “Review & Deploy”

Checklist

Targets are valid (from finite enums)

Plan constraints satisfied (Plus-only targets not selected on non-Plus)

No illegal combos (example: Theme block trying to run on checkout)

Functions count limit awareness (25 active per Function API)

Pixel events selected are valid (standard event enum)

Deploy button creates:

Theme app extension artifacts (block/embed)

Checkout/Accounts/Admin/POS extension config

Functions registration + settings UI

Pixel subscription config

Flow trigger/action/template packaging

4) The auto-mapping engine (intent → valid surfaces/targets)

This is the heart of “don’t miss anything” while staying systematic.

Step 1 — Classify goal into one of 4 intent classes

UI Widget (show something)

Logic Change (change eligibility/price/shipping/payment/validation)

Tracking (measure events)

Automation (if-this-then-that)

Step 2 — Decide the best surface (with fallbacks)

Examples (these become your rules):

A) “Upsell in cart”

Primary: Theme App Block on template cart

Optional companion: Discount Function (if the upsell needs pricing rules)

Fallback: If merchant wants it post-checkout, add Thank you block.

B) “Upsell in checkout order summary”

Primary: Checkout UI target group “Order summary”

choose purchase.checkout.cart-line-item.render-after or purchase.checkout.cart-line-list.render-after

Fallback (non-Plus): Thank you block + Customer account order-status block

C) “Hide COD for high-value orders”

Primary: Functions → Payment Customization

Companion: Checkout UI message near payments (Plus-only); otherwise Thank you messaging

D) “Free shipping progress bar”

Primary: Theme App Block (cart + maybe header)

Companion: Discount Function if it becomes an actual shipping discount rule

E) “Block checkout if cart contains restricted product”

Primary: Functions → Cart & Checkout Validation

Companion: Theme block warning on product/cart pages

F) “Track checkout completed + add-to-cart”

Primary: Web Pixel using standard events

Companion: optional analytics embed (Theme App Embed) if needed

G) “Send Slack when VIP customer buys”

Primary: Flow trigger (order created/paid event from your app or Shopify) + Flow action (send Slack via your connector)

Step 3 — Pick the exact target within the surface

Use a deterministic target selection per intent:

If “message at top” → header/announcement targets

If “inline near line items” → cart-line-item targets

If “near shipping choice” → shipping option list/item targets

If “near payment methods” → payment-method-list targets

If “global injection” → embed head/body

Step 4 — Enforce constraints

If store is non-Plus → disallow purchase.checkout.* step targets; propose Thank you/Accounts alternatives.

If “needs customer email/phone” → flag protected customer data access.

If recipe includes Function API that hits 25 active limit → warn and suggest merging rules.

5) What to show merchants so they understand “where it runs”

Every block card should display:

Runs on: Storefront / Cart / Checkout / Thank you / Account / Admin / POS

Changes: UI only OR Logic (Functions) OR Tracking OR Automation

Requirements: Plus-only / Review-required / Protected data / Migration notes

This reduces support tickets a lot.

It explains Recipes, Categories, Blocks, the complete surface map, what each surface can/can’t do, and how SuperApp auto-picks the correct targets (without ever using invalid values).

SuperApp AI: How Recipes, Categories, and Blocks Work

SuperApp AI helps you create Shopify features by assembling Blocks (deployable units) into Recipes (complete solutions). Everything is organized by Categories (business goals).

Definitions
Category

A Category is the goal you want to achieve. Examples:

Upsell & Cross-sell

Discounts & Pricing

Shipping & Delivery

Payments & COD control

Checkout Rules (validation)

Tracking & Analytics

Automation (Flow)

Support & Returns

Admin Tools

POS Tools

Categories are human-friendly labels. They don’t change Shopify behavior by themselves — they help you find the right kind of solution fast.

Block

A Block is one deployable module on one Shopify surface. Each Block always has:

Type (Surface): where it runs (Theme, Checkout, Admin, etc.)

Target: the exact placement (finite Shopify-defined value)

Configuration: settings and inputs (schema)

Constraints: plan/review/protected-data requirements

A recipe can include one block or many blocks across different surfaces.

Recipe

A Recipe is a packaged solution made of 1+ blocks. It can include:

UI blocks (storefront, checkout, accounts)

Logic blocks (Shopify Functions)

Tracking blocks (Web Pixel)

Automation blocks (Flow)

Admin/POS blocks (merchant operations)

Example recipe:
“COD Risk Control”

Block 1: Functions → Payment customization (hide COD for risky orders)

Block 2: Checkout UI message (explains why COD is unavailable)

Block 3: Admin card (shows risk score and override tools)

Complete Surface Map: What SuperApp Can Build (No Missing Surfaces)

SuperApp AI supports all Shopify app extension surfaces. Each surface has a finite set of valid targets and constraints. (These are Shopify’s official extension types.)
Source: Shopify list of app extensions: (shopify.dev
)

1) Online Store Theme (Storefront)

Used for: storefront UI components (pages, product pages, cart page/drawer UI).
Does not change: checkout logic (pricing/eligibility) unless paired with Functions.

Theme App Block

Placed inside theme sections via Theme Editor.

Best for banners, product widgets, cart upsells, free shipping bars, FAQs, etc.

Theme App Embed

Global on/off injection (head/body) for scripts or floating overlays.

Best for consent banners, chat bubble overlays, analytics loaders.

Important: Theme app blocks/embeds don’t render on checkout pages/steps.

2) Checkout UI Extensions (Checkout/Thank you)

Used for: UI blocks inside checkout and post-checkout pages.
Plan note: checkout step UI (information/shipping/payment) is Plus-only.
Source: (shopify.dev
)

Best for:

Upsell messages inside order summary

Shipping option guidance

Payment method guidance

Checkout trust and reassurance messaging

Thank-you page blocks (surveys, support CTAs)

3) Shopify Functions (Backend logic engine)

Used for: pricing, eligibility, cart transformations, payment/shipping availability, and validation rules.
This is the truth layer for logic changes.

Function types include:

Discounts (pricing rules)

Payment customization (hide/reorder payment methods)

Delivery customization (hide/reorder shipping methods)

Cart & checkout validation (block checkout if rules fail)

Cart transform (bundle/merge patterns)

Fulfillment constraints / routing rules

Best for:

COD restrictions

Tier discounts, BOGO, shipping discounts

Blocking checkout on restricted items

Bundling logic

4) Post-purchase Offers (After payment, before Thank you)

Used for: post-purchase upsell page (one-click offers).
Status: Beta / access requirements may apply.
Source: (shopify.dev
)

5) Customer Account UI Extensions

Used for: new customer account pages (order status/index/profile/footer/full pages).
Best for:

Returns portal components

Reorder tools

Account surveys

Post-purchase education & support

6) Admin UI Extensions

Used for: merchant admin tools on orders/products/customers/discounts.
Best for:

Operational dashboards & cards

Admin actions/modals (bulk tools)

Discount function settings UI

Print actions (documents)

7) POS UI Extensions

Used for: staff tools inside Shopify POS (home tile, cart actions, receipts).
Best for:

Staff workflows (apply rules, verify customer, recommend add-ons)

Receipt customization blocks

POS action modals

8) Web Pixels (Tracking)

Used for: event-based analytics tracking.
Best for:

Tracking add-to-cart, checkout started/completed, product views, etc.

Replacing legacy “additional scripts” approaches on upgraded pages

9) Flow (Automation)

Used for: if-this-then-that automations.
Best for:

Send Slack/email, add tags, create tasks

React to events, schedule sequences

Publish templates (recipes) into Flow template library

What Surfaces Can and Can’t Do (Fast Reference)
Storefront Theme

✅ Show UI elements (banners, widgets, cart UI)
❌ Enforce checkout rules (without Functions)
❌ Modify checkout step pages

Checkout UI

✅ Show UI inside checkout / thank-you
✅ Improve conversion, reduce drop-off with guidance
❌ Change prices/eligibility by itself (needs Functions for logic)

Functions

✅ Change pricing, validation, shipping/payment availability
✅ Enforce logic reliably
❌ Show UI (needs Theme/Checkout/Account blocks to explain rules)

Pixels

✅ Track events for analytics/ads
❌ Change UI or logic

Flow

✅ Automate workflows (actions + triggers + templates)
❌ Directly render storefront UI

How SuperApp AI Chooses the Right Block Automatically

SuperApp AI converts your request into valid Shopify placements using a deterministic pipeline:

Step 1: Classify your request into an “Intent Class”

UI Widget (show something)

Logic Change (change eligibility/pricing/shipping/payment/validation)

Tracking (events/analytics)

Automation (Flow workflows)

Step 2: Choose the best Surface (with fallbacks)

Examples:

“Show upsell on cart page” → Theme App Block on cart

“Hide COD for high value orders” → Functions: Payment customization

“Show message near shipping methods” → Checkout UI: shipping option targets

“Track checkout completed” → Web Pixel: checkout_completed

“Send alert when order is paid” → Flow trigger + action

If a surface is unavailable (ex: checkout step UI on non-Plus):

SuperApp automatically suggests valid alternatives:

Thank you page blocks

Customer account order status blocks

Theme cart blocks + Functions logic

Step 3: Pick the exact Target (finite Shopify value)

SuperApp then selects the correct target from Shopify’s finite list:

Want “message at top” → header/announcement targets

Want “near line items” → cart-line-item targets

Want “near shipping choice” → shipping option list/item targets

Want “near payment methods” → payment method list targets

Want “sitewide” → theme embed head/body

Step 4: Enforce Constraints

SuperApp checks:

Shopify plan: blocks checkout-step targets if not Plus

Protected customer data: shows warning + access steps if needed

Review-required areas: flags post-purchase, payments, Flow templates

System limits: flags Functions “active limit” (e.g., 25 active per Function API)

This ensures SuperApp never produces invalid or unshippable output.

Example Recipes (How Blocks Combine)
Recipe: Free Shipping Booster

Theme block on cart page: free shipping progress bar

Optional discount function: shipping discount logic

Optional pixel: track conversion lifts

Recipe: COD Risk Control

Payment customization function: hide COD when risky

Checkout UI message: explain COD is unavailable (Plus-only targets; fallback to Thank you/account blocks)

Admin card: show risk score and override

Recipe: Returns Deflection

Customer account order status block: “self-serve returns + FAQs”

Thank you block: “how to use product” guide

Flow automation: create return ticket in helpdesk

Glossary

Surface / Type: where the feature runs (Theme, Checkout, Admin, POS…)

Target: exact placement enum defined by Shopify for that surface

Block: one module on one surface/target

Recipe: multi-block solution that achieves a goal

Category: business goal used to organize recipes