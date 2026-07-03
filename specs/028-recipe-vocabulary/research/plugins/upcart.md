# UpCart — Cart Drawer Cart Upsell

> Rename/vendor note: The app is live and current, but the vendor changed. UpCart was built by **AfterSell**, which was **acquired by Rokt (announced Jan 2024)**. The App Store developer now shows as "AfterSell by Rokt." No feature deprecation from the acquisition; the product is actively developed and recently shipped a **V2.0 cart engine** (React/JSX custom templates, `{{timer}}`/`{{cart_quantity}}` double-brace variables replacing V1 single-brace `{TIMER}`). Studied here is the current UpCart at `apps.shopify.com/upcart-cart-builder`. (confirmed)

## identity
- **name**: Upcart—Cart Drawer Cart Upsell (confirmed)
- **vendor**: AfterSell by Rokt (co-founded 2019 as AfterSell; acquired by Rokt, announced Jan 2024) (confirmed)
- **category**: Cart / cart drawer + upsell-cross-sell (confirmed)
- **App Store URL**: https://apps.shopify.com/upcart-cart-builder (confirmed)
- **rating**: 4.7 / 5 (confirmed)
- **review count**: ~827 reviews; star split 91% 5★, 2% 4★, 1% 3★, 1% 2★, 5% 1★ (confirmed)
- **install signal**: No public install count on listing; vendor states AfterSell/UpCart serves 20,000+ SMB merchants (portfolio-wide, post-acquisition figure — not UpCart-only) (inferred). Named brand users: Good American, KitchenAid, HexClad, Bloom Nutrition, Miami Heat (vendor marketing) (confirmed)
- **pricing model**: Recurring monthly, tiered by **monthly order volume**, all tiers include all features, 14-day free trial; free plan is dev/partner stores only. Tiers (confirmed): Dev stores Free; 0–200 orders $29.99; 201–500 $34.99; 501–1000 $54.99; 1001–2000 $89.99; 2001–3000 $119.99; 3001–5000 $149.99; 5001+ $199.99. Billed USD every 30 days.

## surfaces
UpCart is fundamentally a **theme app-embed** that replaces/augments the storefront cart drawer. It is NOT a checkout-extension app; nearly all its logic lives in the storefront cart, with discounts realized through native Shopify discount primitives.

- **theme.section** (via theme **app embed**) — CONFIRMED primary surface. UpCart injects a slide-in cart **drawer** + a floating **sticky cart button** into the live theme. Activated in Online Store → Themes → Customize → App Embeds. Renders header/logo, cart line items, announcement bar, rewards/progress bar, upsell cards, add-ons, discount field, notes, trust badges, express payment buttons, checkout button. This is the whole product's canvas.
- **functions.discountRules** — CONFIRMED (indirect/handoff). Rewards and triggered rewards do NOT compute discounts themselves; they instruct the merchant to create native **Shopify automatic discounts** (or free-shipping rates) and then the drawer surfaces progress toward them and can auto-apply/assign a discount code. The "reward" a customer earns resolves through Shopify's discount engine, not UpCart's. So the true side-effect surface is Shopify discounts, driven by UpCart's in-drawer rule/threshold UI.
- **analytics.pixel** — CONFIRMED (behavioral). A "Track cart events" toggle instruments cart impressions, checkout/order conversion, and per-module added revenue; functions like an in-app pixel over cart interactions (impressions → add-to-cart → checkout → order).
- **checkout.upsell / postPurchase.offer** — NOT in UpCart itself. These belong to the sibling **AfterSell** app (post-purchase/checkout upsells). UpCart is pre-checkout only. Worth noting because the vendor's blueprint spans cart→checkout→post-purchase across two apps that coordinate via shared analytics/branding, but UpCart alone stops at the cart. (confirmed that UpCart is pre-checkout only)
- NOT used: proxy.widget, functions.cartTransform (it manipulates the cart via storefront Cart AJAX API + add-on line items, not a Cart Transform Function), functions.deliveryCustomization, functions.paymentCustomization, checkout.block, admin.block/action (config is a custom embedded admin, not Admin UI extensions), pos.extension, customerAccount.blocks, flow.automation.

**Surface coordination**: Single surface (the drawer) hosts every module; state is the live Shopify cart (line items + attributes). Cross-module coordination is threshold-driven: rewards/triggered-rewards read cart total or item count and toggle discounts via Shopify's discount engine; add-ons/upsells mutate the cart which re-triggers reward progress. "Multicart" + "Traffic Allocation" add an experiment/targeting layer (which drawer config a visitor sees), persisted per-visitor via cookie.

## functional_model
Core entities (concrete):

- **cart_config** (a "cart" in Multicart) = { id, name, state: live|draft, modules[], design, settings, custom_templates? }. Exactly ONE live at a time; unlimited drafts. Publish promotes a draft to live and demotes the previous live to draft.
- **module** = an ordered, individually enable/disable-able block inside a cart_config. Types: Design, Header, Announcements, Upsells, Tiered Rewards, Triggered Rewards, Add-ons, Discount Codes, Additional Notes, Trust Badges, Recommendations (empty-cart), Subscription Upgrades, Express Payments, Sticky Cart Button, Settings. Each has enable/disable + reorder.
- **reward_tier** = { reward_type: shipping|discount|product, threshold: {basis: cart_total|item_count, min_amount|item_count}, reward_description, title_before_achieving (rich text w/ `{AMOUNT}`/`{COUNT}`), show_reward_icons, products[] (≤3, for product type) }. Max **3–4 tiers** per rewards bar.
- **triggered_reward** = { condition(s): product-in-cart | spend-threshold | subscription-status | logged-in-customer, action: discount | free_gift | free_shipping }. Rule-builder style.
- **upsell_rule** = { mode: ai | manual; ai:{ recommendation_intent: related|complementary, smart_variant_matching }; manual:{ trigger: specific_product(s)|all_products, upsell_products[] }; order (drag priority) }.
- **add_on** = { type: shipping_protection | product; shipping_protection:{ title, description, price, currency, auto_accept }; product:{ variant_ref }; include_in_item_count }.
- **cart_item (rawItem)** (exposed to custom templates) = { title, price, imageUrl, variant info, discounts, properties (line-item attributes), onAddClick(), onDeleteProduct() }.
- **custom_template** = a React/JSX component overriding a module's default render (Header, Announcements, Cart Items Product Tile, Upsells, etc.), fed module-specific props; overrides design only, preserves backend logic.
- Relationships: cart_config 1—n module; Tiered Rewards 1—n reward_tier; Upsells 1—n upsell_rule; visitor —(cookie)→ traffic-allocation decision → sees cart_config-or-not.

## settings_taxonomy

### content
- Header: **Cart Title** (text, supports `{{cart_quantity}}` token); **Brand Logo** (image upload, PNG/JPEG); logo **Alignment** (select[Side, Center]); logo size (slider).
- Announcements: **Announcement Text** (rich text: bold/italic/underline/color; NO hyperlinks — stripped on save); **Timer (minutes)** (number, countdown; variable `{{timer}}` V2 / `{TIMER}` V1); **Position** (select[above product list, below product list]).
- Tiered Rewards: **Reward Description** (text per tier); **Title before achieving tier** (rich text w/ `{AMOUNT}`, `{COUNT}`); **Text after completing full rewards bar** (rich text, final-tier message).
- Add-ons (Shipping Protection): **Title** (text); **Description** (text); **Price** (number + currency).
- Add-ons (Product): product/variant label pulled from Shopify.
- Discount Codes: **Discount Input Placeholder** (text); **Discount Apply Button Text** (text).
- Additional Notes: customer special-instructions field (label text) — order-note capture. (inferred exact label names)
- Recommendations (empty cart): **Edit Header Text** (text); **Product Recommendations Header Text** (text, e.g. "You may also like"); **Enable 'Shop Now' Button** (toggle) + **Edit Button Text** (text) + **Edit Button URL** (text).
- Subscription Upgrades: button text default = `{{selling_plan_group_name}}`; **Allow Subscription Plan Options Text Override** (checkbox) → custom labels via `{{selling_plan_name}}`; one-time label (text, default "One-time purchase").
- Upsells: **Section title** (text); **Add button label** (text). (confirmed such controls exist; exact labels partly inferred)
- Cart Translations: global text-label overrides across the whole drawer (confirmed as a dedicated settings surface).

### style
- Design › General: **Inherit Fonts from Theme** (toggle); **Show Strikethrough Prices** (toggle, shows Compare-At).
- Design › Colors: **Background Color** (color — cart bg excluding footer/upsell cards); **Cart Accent Color** (color — footer + upsell card bg); **Cart Text Color** (color); **Savings Text Color** (color).
- Design › Buttons: **Corner Radius** (number px — 0=square … pill); **Button Color** (color); **Button Text Color** (color); **Button Text Hover Color** (color).
- Header styling: title **Font Weight** (select[Normal, Semibold, Bold]); **Font Size** (slider 14–48px); **Text Alignment** (select[Side, Center]); **Heading Level** (select[H2, H3, H4]); **Text Color** (color); Close button: **Position** (select[Left, Right]), **Icon Size** (select[Small, Medium, Large]), **Icon Stroke** (select[Normal, Thick]), **Icon Color** (color), normal/hover **Background** (color), **Border** (select[None, Thin, Normal, Thick]) + hover color.
- Announcements style: **Height** (select[slim, thick]); **Font size** (slider 10–24px); **Background Color** (color); **Border Color** (color).
- Tiered Rewards style: **Bar Background Color** (color, unearned); **Bar Foreground Color** (color, earned); **Show reward icons** (toggle, truck/tag/gift icons).
- Trust Badges: **image upload** (drag/drop; PNG/JPEG/GIF incl. animated; 1000px+ wide, ~1037×94); **Position** (select[top, bottom]); **Preset** (dropdown, e.g. Payment Icons).
- Custom CSS (code editor); Custom HTML (code/markup + scripts); Premade Customizations database (snippet library); CSS Selector Library V1/V2; HTML Location Library.
- Custom Templates: React/JSX per-module component editor (TypeScript IntelliSense, locked wrapper lines, reset) — full layout override.

### targeting
- Multicart: which **cart_config** is live (one live at a time; drafts for seasonal/experiment). (confirmed)
- Traffic Allocation: **Traffic Allocation Percent** (slider 0–100%) — % of visitors who see UpCart at all; decision cookie-persisted per visitor. Note: this is on/off visibility gating, NOT true multi-variant A/B split (a documented limitation; "A/B testing via drafts" is marketing framing). (confirmed)
- Tiered Rewards eligibility filters (which items count toward threshold): **Product filter** (product-picker include/exclude); **Collection filter** (include/exclude by Shopify collection); **Item Property filter** (key/value line-item attribute match); **Subscription Status filter** (subscription vs one-time).
- Triggered Rewards conditions: product-in-cart (product-picker), spend threshold (number), subscription status, logged-in customer.
- Upsell targeting: **Trigger Product(s)** = specific product(s) (product-picker) OR All Products.
- Device/page/collection targeting for the whole drawer: not a first-class feature; responsive by design (mobile/desktop) but no explicit device rule engine. (confirmed absent)

### behavior
- Settings › Cart Settings: **Open cart drawer on add to cart** (toggle); **Track cart events** (toggle, gates analytics); **Traffic Allocation Percent** (slider).
- Sticky Cart Button: floating cart icon (position/size/color customization). (confirmed module; exact knobs inferred)
- Upsells behavior: **Use AI Recommended Upsells** (toggle) → **Recommendation Intent** (select[Related, Complementary]) + **Smart Variant Matching** (toggle, auto-picks variant matching cart); manual mode uses trigger→upsell mapping; **Order of Upsell Appearance** (drag-and-drop priority).
- Rewards behavior: **Reward Basis** (select[Cart Total, Item Count]); **Reward Type** per tier (select[Shipping, Discount, Product]); **+ Add tier** / delete (X); "**Enable Use of Pre-Discounted Cart Total**" (toggle — compute rewards on original total, ignore discounts); **Show rewards on empty cart** (toggle).
- Add-ons behavior: **Auto-Accept** toggle (shipping protection pre-accepted) — NOTE the older "Accept Offer by Default" for product add-ons was **removed Feb 17 2025** for Shopify compliance; product add-ons now require manual opt-in toggle; **Include Add-ons in Cart Item Count** (checkbox).
- Subscription Upgrades: **Prevent Downgrades** (toggle, removes one-time option).
- Recommendations layout: **Recommendation Direction** (select[Carousel, Block]); **Maximum Number of Recommendations to Display** (number).
- Express Payments: show accelerated checkout buttons (e.g. Shop Pay) in drawer (toggle).
- Publish/Unpublish/Delete lifecycle on cart_config.

### data
- Discount realization: reward "Discount" type requires a **Shopify Automatic Discount** (or 100%-off approach for free gifts); "Shipping" type requires a **free-shipping rate** in Shopify. Optional **manual discount code assignment** per tier (overrides other codes).
- Order attributes: add-ons attach as **cart line items** (optionally excluded from item count); Additional Notes writes the **cart/order note**; item-property filters read **line-item properties**.
- Analytics store: cart events (impressions, checkouts completed, orders, per-module added revenue, top products) — persisted app-side, gated by Track cart events.

## data_model
- **App-side DB (AfterSell/Rokt hosted)**: cart_config objects (modules, design JSON, settings), reward tiers, upsell rules, add-on defs, custom-template code, analytics event rollups (impressions, checkout/order conversion, added revenue, top-performing products by module). (inferred store, confirmed data)
- **Shopify-native side-effects**: Automatic Discounts + free-shipping rates (the actual reward mechanism); order/cart **note** (Additional Notes); **line items** for add-ons and free-gift products; **line-item properties** (item-property targeting).
- **Media/CDN**: uploaded logo + trust-badge images (PNG/JPEG/GIF) → app/Shopify CDN.
- **Client-side**: per-visitor **cookie** storing the Traffic-Allocation show/hide decision.
- **Theme**: app-embed block registration in the live theme (Online Store 2.0).
- Codes: no self-generated coupon codes; leans on Shopify automatic discounts + optional merchant-supplied code per tier.

## visual_patterns
- **Layout archetype**: right/left slide-in cart **drawer** overlaying storefront; sticky **footer** (subtotal + checkout CTA) pinned; scrollable body: header(logo/title/close) → announcement bar → rewards/progress bar → line items → upsell cards → add-ons → discount field → notes → trust badges → express-pay buttons. A floating **sticky cart button** persists on all pages.
- **Progress bar**: horizontal fill (foreground=earned over background=unearned) with `{AMOUNT}`/`{COUNT}` "spend X more to unlock…" copy; icon per tier (truck/tag/gift).
- **Upsell card**: image + title + price + variant selector + add button; carousel or vertical list; drag-ordered.
- **Component states**: enabled/disabled per module (immediate on save); reward tier achieved vs unachieved; add-on accepted vs not; loading/async states on add/delete/quantity; empty-cart state (Recommendations module); strikethrough compare-at price state.
- **Motion/interaction**: slide-in drawer open (auto-open on add-to-cart if enabled), one-tap add-on/upsell add without redirect, countdown timer tick, hover states on buttons/close icon, quantity steppers, live re-computation of reward progress on any cart mutation.
- **Responsive**: single mobile/desktop-responsive drawer; heavy emphasis on mobile checkout friction reduction.

## reviews_signal
**Praises (top):**
1. Measurable AOV / conversion lift from in-cart upsells + reward bar ("noticeable boost in conversion rates").
2. Clean, intuitive, no-code editor — "clean, intuitive, and very easy to use."
3. Standout customer support — fast, named agents (Mark, Hailey, Dom, Michelle, Denisse), even weekends.
4. Flexible promo/free-gift-with-purchase logic — "the only way" one merchant could run FGWP.
5. On-brand look that matches storefront across desktop/mobile.

**Complaints (top):**
1. **Reward/discount exclusion logic is unreliable with complex discount stacks** — one merchant lost revenue when low-margin items pushed orders over a high reward threshold; tiered exclusion breaks under stacking.
2. **Ceiling for complex needs** — "if you only have basic upsell needs this works, anything more I'd go elsewhere"; hard 3–4 tier cap with no workaround.
3. **AI chatbot first-line support is disliked** — "get rid of it and direct immediately to a human."
4. **Theme/replacement friction** — replaces (not extends) the native cart; heavily customized themes can require weeks of dev fixes; CSS conflicts can hide the announcement bar; leftover code after uninstall reported.
5. **Klaviyo abandoned-cart conflict** (add-to-cart script) and occasional inaccurate analytics readings; no public API / no Zapier.

## mapping_note
Maps to our RecipeSpec as a **theme.section** module (the drawer + sticky button) with a rich `settings_taxonomy` (content/style/targeting/behavior/data) that a single generated module could largely reproduce for the *visual* cart drawer. But it **exceeds a single-module recipe** in several structural ways:

1. **Persistent app-side data store + config objects**: Multicart's live/draft cart_configs, reward-tier rows, upsell rules, add-on defs, and custom-template code are stateful records outside any one storefront render — a recipe would need a backing data model + admin CRUD, not a stateless section.
2. **External side-effects via Shopify's discount engine (rule → discount handoff)**: rewards/triggered-rewards don't compute value in-widget; they require provisioning **native Automatic Discounts + free-shipping rates** and reading cart state to gate them. That's a `functions.discountRules`-class side-effect plus a **rule engine** (conditions: product/collection/item-property/subscription/spend/logged-in → actions: discount/gift/shipping), which is cross-surface and stateful.
3. **Cross-surface analytics pipeline**: a "Track cart events" instrumentation layer aggregating impressions→checkout→order→added-revenue per module (an `analytics.pixel`-style collector + rollup store), beyond a module's own render.
4. **Experiment/targeting layer**: Traffic Allocation (cookie-persisted per-visitor gating) + Multicart publish lifecycle is orchestration/targeting logic, not module content — effectively a mini blueprint/experiment engine sitting above the drawer.

Net: the drawer *shell* is one recipe; the full plugin is a **cross-surface blueprint** = theme.section (drawer) + a rule engine that emits Shopify discount side-effects + an analytics collector + a config/data store + a traffic-targeting layer.
