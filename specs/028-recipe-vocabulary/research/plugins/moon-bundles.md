# Moon Bundles CartDrawer Upsell

> Research record for the constrained-generation vocabulary study. Facts labeled **confirmed** (from the App Store listing or review aggregators) or **(inferred)** (deduced from the app class, feature copy, and Shopify platform mechanics; not directly verified on a live install).

> **Rename / status note:** The plugin requested as "Moon Bundles / Bundle Discounts" is live and current, but its App Store listing title is now **"Moon Bundles CartDrawer Upsell — Increase AOV with Bundles, Volume Discount, Free Gift, BOGOs."** Same vendor (**CScorp LLC**, partner slug `beyond-apps2` / "Beyond Apps"), same app handle (`moonbundle`). It broadened from a quantity-break/bundle-discount app into a bundles + cart-drawer + upsell + post-purchase funnel. This is **NOT** a deprecated or merged Bold-style app — it is current, actively updated, and **Built-for-Shopify** certified. The "Bundle Discounts" framing is the discount half of a broader AOV suite that absorbed a cart-drawer/upsell surface. **confirmed.** Note: the vendor publishes no publicly-indexed help center, so most exact UI control labels below could not be verified verbatim and are marked **(inferred)** from standard theme-app-extension bundle-app conventions plus review/how-it-works text.

## identity
- **name:** Moon Bundles CartDrawer Upsell (handle `moonbundle`) — confirmed
- **vendor:** CScorp LLC (Albuquerque, NM, US; App Store partner slug `beyond-apps2` / "Beyond Apps") — confirmed
- **category:** Product bundles / Marketing and conversion → Upsell and bundles — confirmed
- **App Store URL:** https://apps.shopify.com/moonbundle — confirmed
- **rating:** 5.0 / 5.0 — confirmed
- **review count:** 580 reviews (97% five-star / 3% four-star / 0% at three-star or below) — confirmed
- **install signal:** Install count not published by Shopify; launched **June 7, 2024** and reached 580 reviews by mid-2026 → strong install velocity. Carries **"Built for Shopify"** certification (highest performance/design/integration tier). Precise install number: unknown.
- **pricing model:** Revenue-tiered subscription, billed every 30 days — confirmed:
  - Discovery (Free) — $0, up to $500 generated revenue
  - Essential — $14.99/mo ($143.88/yr) — up to $2,000 generated revenue
  - Pro — $29.99/mo ($299.88/yr) — up to $10,000 generated revenue
  - Premium — $59.99/mo ($599.88/yr) — unlimited revenue
  - All tiers: unlimited bundles/upsells/cart drawer, quantity breaks, mix-and-match, fixed bundles, add-on upsells, post-purchase upsells, volume-discount upsells, 7/7 chat support — confirmed.

## surfaces
Mapped to internal extension-type vocabulary:

- **theme.section** (confirmed) — Primary storefront surface. An **app block** ("quantity breaks block" / bundle widget) is injected into the **product template** via the theme app extension ("adds to your product template," "enhancing product page layouts"). Renders the tier/quantity-break table, mix-and-match / build-a-box selectors, and bundle offer cards. Also renders a **slide-out cart drawer** as a separate app-embed block — reviews consistently name "bundles" and "the cart drawer" as two distinct rendered components.
- **functions.discountRules** (confirmed) — Discounts "applied automatically at checkout" as percentage OR fixed reduction. Listing exposes Shopify Functions integration; the automatic tier/bundle/BOGO reward is a Discount Function that recomputes cart totals when bundle conditions are met.
- **functions.cartTransform** (inferred) — Fixed bundles / build-a-box / gift boxes behaving as a grouped or merged-price line item imply a Cart Transform Function (line grouping / price adjustment). Functions capability is confirmed but only "Delivery customizations" is enumerated verbatim.
- **functions.deliveryCustomization** (confirmed) — Listing lists "Edit Shopify Functions: Delivery customizations," tied to the **free-shipping** reward on qualifying bundles.
- **checkout.upsell** (inferred) — "Cart upsells" and add-on upsells surface pre-checkout; a Checkout UI upsell extension is plausible but the dominant upsell surface described is the cart drawer, not the checkout page.
- **postPurchase.offer** (confirmed) — "Post-purchase page upsells" / "one-click post-purchase upsell" / "thank-you page upsell offers" — a post-purchase extension offering a follow-on product after order confirmation.
- **admin.block / admin.action** (confirmed, as embedded admin app) — Full embedded Shopify Admin app: bundle/offer builder, revenue dashboard, A/B test config, campaign scheduling. The merchant control plane (not a resource-page admin block per se, but the admin surface).
- **analytics.pixel** (confirmed) — Listing lists "Edit store analytics: Web pixels" — a Web Pixel extension fires bundle-impression / add-to-cart / conversion events for revenue attribution.
- **flow.automation** — not used (inferred; no Flow triggers/actions advertised).
- **Not used:** proxy.widget, functions.paymentCustomization, checkout.block, pos.extension, customerAccount.blocks.

**Cross-surface coordination:** The product-page block, cart drawer, discount Function, and post-purchase offer are all driven by a **shared offer/campaign config** persisted app-side and keyed to product/collection/variant references. The product-page block writes bundle intent (selected items/quantities) into the cart via line-item properties / cart attributes; the **discount Function reads those cart signals at checkout** to apply the matching reward (handoff = cart line-item properties → Function input). The Web Pixel attributes resulting revenue back to the originating offer to gate the revenue-tier billing and feed the dashboard. The cart drawer re-renders the same offer catalog for in-cart upsells. State flow: admin config (source of truth) → storefront blocks (render + write cart signals) → Function (read cart signals + apply discount) → pixel (attribute revenue back to offer).

## functional_model
Core entities (concrete shapes; field names (inferred) except where noted):

- **offer / campaign** = { id, type: enum(`fixed_bundle` | `mix_and_match` | `build_a_box` | `quantity_break` | `volume_discount` | `bogo` | `frequently_bought_together` | `cross_sell` | `gift_with_purchase` | `subscription_box` | `mystery_box`), name, status: enum(active|scheduled|paused|draft), priority/stacking rank, schedule: { start_at, end_at }, targeting_ref, tiers[], reward, style_config, ab_test_ref } — offer type set is **confirmed** from listing; envelope fields (inferred).
- **tier** (quantity break / volume) = { min_qty (or spend threshold), reward_type: enum(`percentage`|`fixed_amount`|`fixed_price`), reward_value, badge_label, highlight: bool } — tiered/quantity-break structure confirmed; per-field shape (inferred).
- **bundle_item** = { product_ref | variant_ref | collection_ref, required: bool, min/max_qty, default_selected } — product/variant/collection targeting confirmed; shape (inferred).
- **reward** = { discount_kind: enum(`percentage`|`fixed`|`free_shipping`|`free_gift`), value, applies_to: enum(`bundle`|`cart`|`specific_products`) } — percentage/fixed/free-shipping/free-gift all confirmed as capabilities.
- **targeting** = { scope: enum(`product`|`collection`|`all_products`), refs[] } — "specific products, collections, or entire store" **confirmed**.
- **ab_test** = { variant_a_offer, variant_b_offer, split, metric } — A/B testing **confirmed**; shape (inferred).
- **revenue_record / attribution** = { offer_id, order_id, added_revenue, ts } — powers the revenue dashboard AND the billing-tier gate; existence confirmed, shape (inferred).
- **Relationships:** one offer → many tiers → each tier references products/variants/collections; offers belong to campaigns carrying schedule + A/B config; revenue_records fan-in to offers for attribution.

## settings_taxonomy
(Offer/discount capabilities are **confirmed**; specific control widget names are **(inferred)** from standard bundle-app theme-extension UIs unless noted.)

### content
- **Offer / bundle name** — text (confirmed feature; label inferred)
- **Headline / block title** — text (inferred, e.g. "Buy more, save more")
- **Tier labels** per row — text (e.g. "Buy 2", "Most popular") (inferred)
- **Badge / tag text** — text (e.g. "SAVE 20%", "BEST VALUE") (inferred)
- **Savings callout format** — text/template with token (e.g. `{amount} off`) (inferred)
- **CTA / add-to-cart button text** — text (inferred)
- **Free-gift name / description** (GWP) — text + product-picker (confirmed feature)
- **Countdown timer copy + expiry** — text + datetime (confirmed: countdown timers, limited-time offers)
- **Multi-language content** — offer text localizable across 9 store languages (EN/FR/ES/PT-BR/IT/DE/NL/SV/PL) (confirmed)

### style
- **Widget colors** — color pickers for background, text, accent/highlight, badge, button (confirmed: "adjustable colors, text, and style" to match branding; individual pickers inferred)
- **Layout / template style** — select[ card grid | horizontal tiers | stacked list | radio-row ] (inferred; "each section is ready made" → preset templates)
- **Highlight / selected-tier emphasis** — toggle + color (inferred)
- **Border radius / spacing** — number (inferred)
- **Custom font** — select/text (confirmed: "Custom fonts" referenced)
- **Custom CSS / custom code** — text/code block (confirmed: "Custom code support")
- **Cart drawer theme** — color/style controls for the slide cart (background, header, progress bar) (confirmed drawer exists; specific knobs inferred)
- **Free-shipping / reward progress bar** — toggle + color (inferred; tied to free-shipping reward)

### targeting
- **Apply-to scope** — select[ specific products | collections | entire store ] (confirmed)
- **Product picker** — product/variant multi-select (confirmed via product-level targeting)
- **Collection picker** — collection multi-select (confirmed)
- **Bundle item slots** (mix-and-match / build-a-box) — product-picker list with per-slot min/max (confirmed feature; control inferred)
- **Customer/market targeting** — unknown (not advertised)

### behavior
- **Offer type** — select[ fixed bundle | mix & match | build a box | quantity break | volume discount | BOGO | frequently-bought-together | cross-sell | GWP | subscription box | mystery box ] (confirmed set)
- **Discount type** — select[ percentage | fixed amount | fixed price | free shipping | free gift ] (confirmed)
- **Tier / quantity-break rows** — rule-builder table: rows of { qty threshold → discount } (confirmed: quantity breaks, tiered pricing)
- **BOGO rule** — buy X get Y config: quantity + reward product/discount (confirmed)
- **Auto-apply at checkout** — toggle (confirmed: "automatically at checkout")
- **Discount-code vs automatic** — select (confirmed: supports discount codes AND automatic)
- **Schedule / limited-time** — start/end datetime (confirmed)
- **Countdown timer** — toggle (confirmed)
- **A/B test** — toggle + variant split (confirmed)
- **Cart drawer enable + upsell triggers** — toggle + trigger rules (confirmed: cart drawer, cart upsells, trigger-based activation)
- **Post-purchase offer** — toggle + product-picker (confirmed)
- **Subscriptions / selling-plan attach** — toggle (confirmed: subscriptions, selling-plan scope in permissions)
- **Stacking / offer priority** — ordering control (inferred; multiple offer types coexist)

### data
- **Revenue dashboard** — read-only analytics of added revenue per offer (confirmed)
- **A/B test results** — variant performance readout (confirmed feature)
- **Plan / revenue-cap indicator** — usage against tier limit (confirmed via revenue-tier billing)
- **Templates library** — saved/prebuilt offer templates ("ready made sections") (confirmed)

## data_model
- **App-side database (external to Shopify)** — offers/campaigns, tiers, targeting refs, style configs, A/B configs, schedules, and revenue-attribution records persist in CScorp's own backend (implied by revenue-tier billing that must meter attributed revenue, plus the admin builder). (inferred, high confidence)
- **Shopify Discounts** — automatic discount + Discount Function nodes created via the Discounts API / Functions to enforce rewards at checkout (confirmed: writes discounts, edits Functions).
- **Selling plans** — subscription/selling-plan groups for subscription-box offers (confirmed: selling-plan scope requested).
- **Theme app extension assets** — app blocks + app-embed (cart drawer) shipped as an extension; per-block settings stored in theme settings JSON / block schema. (inferred)
- **Line-item properties / cart attributes** — bundle selections written onto cart lines so the Function and cart drawer can read them (inferred).
- **Web Pixel events** — impression/add-to-cart/purchase events feeding attribution (confirmed pixel scope).
- **Media/CDN** — bundle/gift imagery served via Shopify product media + app CDN (inferred).
- **Codes** — supports generated/automatic discount codes as an alternative to auto-apply (confirmed).

## visual_patterns
- **Layout archetypes:** (1) product-page **quantity-break / tier table** — stacked selectable rows, each row = qty + price + savings badge, one row "highlighted" as best value; (2) **mix-and-match / build-a-box** grid — product cards with add/select controls and a running total/progress bar; (3) **fixed-bundle card** — grouped product images with combined price and single CTA; (4) **slide-out cart drawer** — right-side panel with line items, in-cart upsell strip, free-shipping progress bar, and CTA; (5) **post-purchase / thank-you offer** — single-offer card with accept/decline one-click. (Archetypes confirmed by feature + review descriptions; exact pixel layout inferred.)
- **Component states:** default / hover / **selected (highlighted tier)** / disabled (out-of-stock slot) / loading (add-to-cart pending) / applied (discount reflected in cart total) / expired (countdown ended). (inferred)
- **Motion/interaction:** slide-in cart drawer animation; live price/savings recomputation as tiers or box items change; countdown ticking; progress-bar fill toward free-shipping/gift threshold; one-click accept on post-purchase. (Confirmed drawer + countdown + auto-recompute; easing details inferred.)
- **Design intent:** "ready-made, easy to personalise" preset sections designed to inherit store branding via color/font controls (confirmed).

## reviews_signal
**Praises (confirmed from reviews):**
1. **Real AOV / sales lift** — merchants report measurable order-value and revenue increases, "especially during exclusive drops."
2. **Fast, hands-on support** — repeatedly called out ("extremely réactif," "quick and very supportive," helps "even on weekends and late hours"), including deep-diving theme-specific bugs.
3. **Easy, ready-made setup** — "each section is ready made and very easy to personalise"; intuitive builder with many options.
4. **All-in-one value for the price** — "so much feature for a surprisingly cheap price"; one app covers bundles + cart drawer + upsells + post-purchase.
5. **Broad compatibility / integrations** — works smoothly with themes and with GemPages, PageFly, Klaviyo, Global Pickup, and third-party cart apps.

**Complaints (confirmed but sparse — near-zero negative reviews published):**
1. **Theme-caused bugs on install** — "a few bugs (caused by my theme)" needing support to fix; storefront rendering is theme-sensitive.
2. **Occasional glitches** — "all apps have the odd glitch" (resolved by support, but present).
3. **Reliance on support to resolve issues** — several "praises" are really "support fixed my problem," implying non-trivial self-serve edge cases.
4. **(inferred, common for this category)** revenue-tier pricing means cost scales with success — crossing a tier boundary is a step-up in cost.
5. **(inferred)** discount-stacking / interaction with other discount apps and native Shopify automatic discounts is a known failure mode for Function-based bundle apps generally; not explicitly evidenced here given the overwhelmingly positive review set.

## mapping_note
Onto our constrained RecipeSpec vocabulary, a **single** Moon Bundles offer (e.g. one quantity-break table on a product page) maps cleanly to a single theme.section-style module: a product-page app block with content/style/targeting/behavior knobs. But the plugin as a whole **materially exceeds a single-module recipe** on several axes:

1. **Cross-surface blueprint with shared state, not one block.** A real offer spans FOUR coordinated surfaces — product-page block, cart drawer, checkout discount Function, and post-purchase offer — all reading one shared offer config and handing state along the cart (line-item properties → Function input). This is a multi-module blueprint with a handoff contract, not a lone section.
2. **Server-side rule engine + external side effects at checkout.** The reward is enforced by Shopify **Discount / Cart-Transform / Delivery Functions** that must be generated, deployed, and fed cart signals — plus automatic-discount and selling-plan (subscription) records written via Admin APIs. That is external side-effect provisioning and a rule engine (tiers, BOGO, thresholds, stacking priority), well beyond declarative section settings.
3. **Persistent data store + revenue attribution / metered billing.** Offers, tiers, A/B variants, schedules, and per-order attributed-revenue records live in an app-owned database, with a Web Pixel feeding attribution. Metering revenue for tier billing and A/B stats requires durable storage and background aggregation — no single recipe carries a DB or jobs.
4. **Scheduling + experimentation as background jobs.** Limited-time offers, countdowns, scheduled campaign start/stop, and A/B split evaluation imply time-driven background jobs and stateful experiment tracking, not one-shot render.

---
_Confidence: identity / pricing / surfaces / offer-type set / reviews = **confirmed** from App Store listing + reviews. Individual UI control labels and internal entity field names = **(inferred)** — vendor publishes no indexed help center, so exact knob nomenclature could not be verified._
