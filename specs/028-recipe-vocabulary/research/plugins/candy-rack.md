# Candy Rack • All‑in‑One Upsell

> Naming note: the target was listed as "Candy Rack (AAA) Upsell". This is the SAME app — it is **not** a Bold app and has **not** been deprecated or merged. The "(AAA)" fragment does not appear in the current branding; the App Store listing name is **"Candy Rack • All‑in‑One Upsell"** by **Digismoothie** (an EU/Slovakia-based vendor). Historically the app was marketed as "Candy Rack — One Click Upsell"; it has since been rebranded to "All‑in‑One Upsell" and expanded from a single product-page popup into a multi-surface suite that now includes a proprietary slide cart. Study target below is the current live app. (confirmed)

## identity
- **name**: Candy Rack • All‑in‑One Upsell (confirmed)
- **vendor**: Digismoothie (EU-based; claims "Built in the EU, no sensitive data collected, fully GDPR-compliant") (confirmed)
- **category**: upsell / cross-sell (confirmed)
- **App Store URL**: https://apps.shopify.com/candyrack (confirmed)
- **rating**: 4.8 / 5 (confirmed)
- **review count**: ~202 reviews, 97% five-star (confirmed as of fetch; vendor marketing also cites higher legacy counts) (confirmed)
- **install signal**: "trusted by over 5,000 Shopify merchants" (vendor marketing) (confirmed); carries the **"Built for Shopify"** badge (confirmed)
- **pricing model**: Order-volume-tiered monthly subscription with 8-day free trial + 60-day money-back guarantee; all tiers unlock full functionality (no feature gating by tier — only order volume). (confirmed)
  - Trial & Dev stores: Free
  - Lite: $29.99/mo (0–50 orders/mo)
  - Starter: $39.99/mo (51–200 orders/mo)
  - Growth: $59.99/mo (201–500 orders/mo)
  - (higher tiers exist above 500 orders/mo; marketing elsewhere quotes "$49.99+" — pricing has shifted over time) (inferred)

## surfaces
Candy Rack is explicitly **multi-surface** — it fires an offer at each stage of the funnel and shares cart state across them. Mapping to our internal extension-type vocabulary:

- **theme.section** (confirmed) — Product-page app blocks (OS 2.0 "app blocks"): the **Embedded (Checkbox layout)** and **Embedded (Button layout)** upsells rendered inline on the PDP; also embedded blocks on Thank-you / Order-status pages. These are theme-app-extension blocks the merchant drops into the theme editor.
- **proxy.widget** (confirmed) — The **product-page pop-up** and **cart pop-up** are injected client-side via a theme app embed / script, triggered by intercepting the Add-to-Cart or Checkout button click (custom CSS selectors supported). Behaves like an app-served overlay widget rather than a native theme section. Also the **proprietary Slide Cart drawer** (a full cart-drawer replacement rendered by the app) with an **embedded offer block** and a **rewards bar**.
- **checkout.upsell** (confirmed) — Checkout **Embedded Block (pre-purchase)** via checkout extensibility. **Shopify Plus only.**
- **postPurchase.offer** (confirmed) — **Native post-purchase upsell** shown after order confirmation, before the thank-you page, no re-entry of payment details (Shopify's post-purchase extension surface). Available on all plans.
- **admin.block** (inferred) — Merchant configuration lives in the embedded Shopify admin app (offer editor, slide-cart settings, analytics dashboard). Not a merchant-store surface but the config home.
- **flow.automation** (inferred) — Listed integration with **Shopify Flow**; used as a trigger/action node rather than a core surface.
- **analytics.pixel** (inferred) — Ships an analytics dashboard tracking offer impressions/acceptance/revenue; almost certainly backed by a web-pixel/JS events layer (fires `candyrack-offer-added`, `candyrack-offer-removed`, `addToCartButtonClicked`, etc.).

NOT used (from allowlist): functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, checkout.block (uses checkout.upsell block specifically), admin.action, pos.extension, customerAccount.blocks. Discounts are applied via Shopify discount codes/automatic discounts stacked on the offered line item, **not** via a cart-transform Function. (inferred)

**Coordination across surfaces**: All surfaces read/write the **same Shopify cart** (Ajax cart / cart line items), so an add-on accepted in a PDP popup is already present when the shopper opens the slide cart, and the rewards-bar progress recalculates live off cart subtotal. There is no separate offer-state store handed between surfaces — the Shopify cart *is* the shared state. Post-purchase and checkout offers are keyed off order/cart contents. Offer *targeting* (which trigger products fire which offer) is centrally defined in the admin and evaluated per surface. (confirmed cart-sharing; inferred mechanism)

## functional_model
Core entities (concrete, field-level):

- **Offer** = { id, type, title, description, placement, trigger_targeting, offered_products[], discount, layout, design_overrides, additional_conditions[], priority/order }
- **OfferType** ∈ { Native/manual upsell, **Smart (AI) Auto-Upsell** (product chosen by recommendation engine, not the merchant), Cross-sell, **True Upsell / Upgrade** (swap current variant for a higher-value one), Product add-on (warranty, shipping protection, gift wrap), Frequently-bought-together, Bundle (mix-and-match / upsell / cross-sell), Collection upsell, Free gift }
- **Placement** ∈ { PDP pop-up, PDP embedded (checkbox), PDP embedded (button), Cart pop-up, Slide-cart embedded block, Checkout embedded pre-purchase (Plus), Post-purchase page, Thank-you/order-status embedded block }
- **Targeting rule** ("Displays for") = { mode: all_products | specific_products | specific_collections, refs[], additional_conditions[] }
- **Condition** = { field: product_title|product_type|vendor|price|tags|collection_title|weight|inventory_stock|variant_title, operator, value } with match mode `all` or `any`
- **OfferedProduct** = product_or_variant_ref (manually chosen) OR resolved-at-runtime by the recommendation engine (Smart upsell)
- **Discount** = { enabled, type: percentage|fixed (inferred), value, stackable_with_shopify_discounts: bool }
- **SlideCart** = { enabled, theme/design, rewards_bar, embedded_offer_slots[] }
- **RewardsBar** = { threshold (min purchase amount), reward_type: free_shipping|free_gift, in_progress_message, unlocked_message, visuals }
- **Analytics event stream** = per-offer impressions, accepts, added/removed, revenue attributed

Relationships: an **Offer** is triggered by 1..N trigger products/collections (via Targeting), presents 1..N offered products, optionally carries a Discount, renders in exactly one Placement with one Layout. Multiple offers can match a trigger and are ordered. The Slide Cart owns the RewardsBar and can host embedded offers.

## settings_taxonomy
The most important section — actual merchant-facing controls grouped under five headings.

### content
- **Offer title** — text (confirmed)
- **Offer description / subtitle** — text (confirmed)
- **Promotional badge text** — text ("badges and descriptions") (confirmed)
- **CTA / Add-to-cart button label** — text (inferred; part of popup copy)
- **Offered product(s)** — product-picker (multi-select products or specific variants) (confirmed)
- **Smart Auto-Upsell**: no product chosen — recommendation-engine driven; merchant only writes copy + trigger (confirmed)
- **Rewards bar in-progress message** — text (confirmed)
- **Rewards bar unlocked message** — text (confirmed)
- **Localization / translations** — text per language (13 languages supported) (confirmed)

### style
- **Layout** — select[ pop-up | embedded checkbox | embedded button | slide-cart embedded block ] (confirmed)
- **Drag-and-drop editor** — visual editor to arrange offer elements (confirmed)
- **Pop-up Customization settings** — panel of visual controls (colors, font sizes, spacing, show/hide elements) (confirmed)
- **Product Page app block Customization** — theme-editor block settings (confirmed)
- **Custom CSS** — text/code field (paste CSS to restyle popup + slide cart) (confirmed)
- **Custom HTML** — text/code (confirmed)
- **Slide cart CSS customization** — text/code (dedicated field for the drawer) (confirmed)
- **Rewards bar visuals** — color/design controls to match store (confirmed)
- **Promotional badge styling** — (inferred, part of design)
- **Multi-currency display** — money formatting honored (toggle/automatic) (confirmed)

### targeting
- **Displays for** — select[ All products | Specific products | Specific collections ] (confirmed)
- **Trigger products** — product-picker (any number of products that fire the offer) (confirmed)
- **Trigger collections** — collection-picker (must be published to Online Store channel) (confirmed)
- **Additional conditions** — rule-builder (currently limited to PDP pop-ups): field ∈ { product title, type, vendor, price, tags, collection title, weight, inventory stock, variant title }, with match mode **Must match all conditions** / **Must match any condition** (confirmed)
- **Placement / surface selector** — select[ product page | cart | checkout | post-purchase | thank-you ] (confirmed)
- **Custom Add-to-Cart button selectors** — text (CSS selectors to hook the trigger on non-standard themes) (confirmed)

### behavior
- **Offer type** — select[ manual upsell | Smart Auto-Upsell (AI) | cross-sell | True upsell/upgrade | add-on | frequently-bought-together | bundle | collection upsell | free gift ] (confirmed)
- **AI recommendation engine** — select (choice of engine, including **Google Gemini**) for Smart upsell product selection (confirmed)
- **Discount** — number (value) + type; **stackable with other Shopify discounts** toggle (confirmed)
- **One-click add** — behavior (add offered product without leaving page) (confirmed)
- **Checkbox add independently vs with main product** — behavior of embedded checkbox layout (confirmed)
- **A/B testing** — toggle/experiment (native + Intelligems integration) (confirmed)
- **Rewards bar threshold** — number (minimum purchase amount to unlock reward) (confirmed)
- **Reward type** — select[ free shipping | free gift (via Gift Box app) ] (confirmed)
- **Offer priority/order** — ordering when multiple offers match (inferred)
- **Subscription product support** — behavior toggle/compatibility (confirmed)
- **Public API callbacks** — override variant selection, money formatting, form validation via window-level JS functions (confirmed)

### data
- **Bulk import/export of offers via CSV** — file upload/download (confirmed)
- **Analytics dashboard** — impressions, accept rate, attributed revenue per offer (confirmed)
- **Custom rules configuration** (see targeting rule-builder) (confirmed)
- **Integrations** — Shopify Flow, PageFly, Intelligems (A/B), Gift Box, Currency Conversion, Checkout (confirmed)

## data_model
- **Offer configs** persisted in Digismoothie's **external app database** (not Shopify metaobjects) — the offer editor, targeting rules, layouts, copy, CSS, and slide-cart/rewards-bar config all live app-side and are served to the storefront at runtime. (inferred — standard for this class of app; no metaobject usage documented)
- **Cart / line items** — live in Shopify's native Ajax cart; offered products are added as standard cart lines. No custom persistence of cart state. (confirmed)
- **Discounts** — realized as Shopify **discount codes / automatic discounts** applied to offered lines (leverages Shopify's discount-code stacking), not a private ledger. (confirmed)
- **Analytics events** — impression/accept/revenue events streamed to the app backend (JS custom events like `candyrack-offer-added`); aggregated in the admin dashboard. Backing store is app-side. (inferred)
- **Media/CDN** — product imagery comes from Shopify product media; badge/gift-wrap assets likely served from Shopify or the app CDN. (inferred)
- **Bulk data** — offers importable/exportable as **CSV**. (confirmed)
- No customer PII stored ("no sensitive data collected"). (confirmed)

## visual_patterns
- **Layout archetypes**: (1) **Modal pop-up** overlay triggered on add-to-cart / checkout click, with product thumbnail + title + price + CTA; (2) **Inline embedded block** on PDP — either a **checkbox list** (multi-select add-ons) or **per-item "Add" buttons**; (3) **Slide-cart drawer** — full-height right-side cart panel with a **rewards/progress bar pinned in the header**, cart lines, and embedded upsell slots; (4) **Post-purchase interstitial** — full-width offer card with prominent hero visual and single-click accept.
- **Component states**: offer added / offer removed / popup closed; checkbox checked/unchecked; rewards-bar **in-progress** (partial fill + "spend $X more") vs **unlocked** (full fill + reward message); loading/adding spinner on CTA.
- **Motion/interaction**: popup appears on ATC-button interception; slide cart animates in from the side; rewards-bar progress fill animates as cart subtotal changes; one-click accept adds line item without navigation and updates cart badge/count in real time.
- **Theming**: designed to inherit store look via drag-and-drop editor + custom CSS; multi-currency and 13-language localization so copy/pricing match the storefront.

## reviews_signal
**Praises (top):**
1. Real, attributable **AOV / revenue lift** — merchants cite ~25% revenue increases and "paid for itself in the first week." (confirmed)
2. **Exceptional, fast support** that ships **custom code changes** on request ("nothing is too much trouble"). (confirmed)
3. **Multi-surface coverage** (PDP + cart + post-purchase) that **blends seamlessly with the store design**. (confirmed)
4. **No-code, easy setup** with a powerful analytics dashboard. (confirmed)
5. Effective at **moving slow-selling inventory** via add-ons/cross-sells. (confirmed)

**Complaints (top):**
1. **Weak conversion for some use cases** — a long-tenured merchant reported poor results (though only using one placement); implies results are placement/config-dependent. (confirmed)
2. **Order-volume pricing** can bite fast-growing stores (tier jumps at 50/200/500 orders). (inferred from pricing structure; not a direct review quote)
3. **Checkout pre-purchase block is Shopify Plus-only** — a real capability gap for non-Plus merchants. (confirmed as limitation)
4. **Advanced targeting ("Additional conditions") is limited to PDP pop-ups** — rule-builder not available on every surface. (confirmed as limitation)
5. **Reliance on custom CSS / support for deep visual matching** on non-standard themes (custom selectors sometimes needed to hook ATC). (inferred)

## mapping_note
Onto our constrained **RecipeSpec** vocabulary, Candy Rack maps to a **cross-surface blueprint**, not a single module. A single "upsell popup" offer is expressible as one `proxy.widget` (or `theme.section` for the embedded block) recipe with content/style/targeting/behavior knobs. But the full app **materially exceeds one module** in several ways:

1. **Cross-surface blueprint with shared cart state** — one logical "offer program" spans `proxy.widget` (PDP/cart popup + slide cart), `theme.section` (embedded PDP/thank-you blocks), `checkout.upsell` (Plus), and `postPurchase.offer`, all coordinating through the live Shopify cart. This is inherently a multi-module set, not a single recipe.
2. **Persistent offer + rule store with a targeting rule-engine** — offers, trigger targeting ("Displays for"), and the `Additional conditions` rule-builder (field/operator/value with all/any match) require a durable data store and per-request rule evaluation, beyond a static module spec.
3. **AI recommendation engine as a runtime side-effect** — Smart Auto-Upsell resolves the offered product at runtime via a pluggable engine (e.g. Gemini)/Shopify recommendations, i.e. an external inference call per impression, not a fixed picked product.
4. **Slide-cart replacement + stateful rewards bar** — a full cart-drawer surface with a live progress bar (threshold → free shipping/free gift, in-progress vs unlocked states) is its own stateful component plus a discount/free-gift side-effect, not a leaf module.

Secondary excess: an **analytics/event pipeline** (impression/accept/revenue attribution) and **discount issuance** (Shopify automatic/code discounts stacked on offered lines) are external side-effects a single recipe cannot own.
