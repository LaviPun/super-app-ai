# Bold AI Upsell & Cross-Sell (formerly "Bold Upsell" / "Product Upsell")

> **RENAME / REBRAND NOTE (confirmed):** The plugin historically called **"Bold Upsell"** (App Store slug `product-upsell`, originally listed as "Product Upsell") is now listed as **"Bold AI Upsell & Cross-Sell — Boost AOV w/ Checkout Upsells and Post Purchase Upsell Funnels"** at the same URL `apps.shopify.com/product-upsell`. Same vendor (Bold Commerce), same install base, same core funnel/offer engine — rebranded around an "AI Smart Offers" layer and re-plated onto Shopify's modern theme-app-embed + checkout-extensibility surfaces. It was NOT deprecated; it was renamed and modernized. **What changed:** (1) pricing flipped from legacy tiered subscription (Free / $9.99 Basic / $19.99 Plus / $29.99 Complete / $59.99 Unlimited "views" plans) to, as of **Oct 6 2025**, either a commission model (Standard free +3.5%, Advanced $10/mo +2.5% — App Store card) OR a subscription+"SmartFlex" usage model (Essential free / Standard $25 / Complete $50 / Enterprise $500, billed on monthly "offer views") depending on cohort; the two coexisting descriptions reflect the legacy-vs-new split. (2) legacy jQuery/theme-injection delivery replaced with a Built-for-Shopify theme app embed + native checkout/post-purchase extensions. (3) an "AI Smart Offers" auto-recommendation mode was added on top of the manual funnel builder. Stores installed before Oct 6 2025 stay on legacy plans unless they opt to migrate (confirmed).

## identity
- **name:** Bold AI Upsell & Cross-Sell (legacy name: Bold Upsell / Product Upsell) — confirmed
- **vendor:** Bold Commerce ("Bold") — confirmed
- **category:** Upsell and cross-sell (under Marketing and conversion) — confirmed
- **App Store URL:** https://apps.shopify.com/product-upsell — confirmed
- **rating:** 4.4 / 5 — confirmed
- **review count:** 580 reviews (distribution: 5★ 465 / 4★ 52 / 3★ 17 / 2★ 8 / 1★ 38) — confirmed
- **install signal:** No public install count on card; "Built for Shopify" certified badge; one of the longest-running upsell apps on the platform (listing predates 2015), 580 reviews over ~decade implies a large but churned base; vendor is an established Shopify Plus Technology Partner — (inferred, from badge + review age)
- **pricing model:** Two coexisting models by cohort (confirmed both exist, App Store card vs. Help Center differ):
  - **New App Store card:** Standard = free to install, +3.5% commission on upsell-attributed revenue; Advanced = $10/mo + 2.5% commission, adds Free Gift offers + In-Checkout offers (Plus).
  - **New Help Center (SmartFlex):** Essential (free, <50 orders/mo, auto-upgrades to Standard) / Standard $25 / Complete $50 / Enterprise $500 — plus per-"offer view" usage surcharges (0–500 free, then +$25 → +$500 stacking by view bucket).
  - **Legacy (pre-Oct-6-2025 installs):** grandfathered tiered subscription plans keyed on monthly offer "views."

## surfaces
Mapped to internal extension-type vocabulary. Bold Upsell is emphatically **multi-surface**; a single "offer" or "funnel" is one logical entity that can render on any one trigger location, and funnels chain across a sequence.

- **theme.section / theme app embed** — confirmed. The **Product Page Pop-up** (fires on Add-to-Cart click) and **Cart Page Pop-up** (fires on Checkout click) are delivered via the "Bold Upsell App Embed" enabled once in the Theme Editor. Shows the upsell/cross-sell modal with offer product cards, qty, Add-to-Cart / Replace-Item / No-Thanks buttons. The **Cart Drawer Widget** also renders inline in the theme's AJAX cart drawer.
- **proxy.widget** — (inferred). The pop-up modals and cart-drawer widget are storefront JS injected by the embed; offer selection/eligibility is resolved by a Bold-hosted service the storefront calls at trigger time (classic Bold app-proxy pattern). What it shows: the eligible offer set for the current cart/product context.
- **checkout.upsell** — confirmed. **In-Checkout Widget** (Shopify Plus only) renders an upsell/cross-sell offer inside Shopify checkout via checkout extensibility. Gated to the Advanced/Complete tier.
- **postPurchase.offer** — confirmed. **Post-Purchase Pop-up** renders on the Shopify thank-you/order-status page after checkout; this is the ONLY trigger location where offer products can be discounted natively (without Bold Discounts). One-click add, no re-auth.
- **customerAccount.blocks** — confirmed (via Bold Subscriptions integration). **Subscription Customer Portal** trigger location surfaces upsell offers to existing subscribers managing their plan.
- **analytics.pixel** — (inferred). Tracks "offer views," impressions, click-through, conversion, and AOV lift per offer; integrates with Google Analytics. Billing itself is metered on offer-view events, so an impression/event pipeline exists.
- **flow.automation** — (inferred, weak). **Funnels** implement accept/decline branching (a mini decision tree), but it is an in-session offer sequencer, not a Shopify Flow automation. Included here only as the closest vocabulary match for the branching logic; it is NOT a background workflow engine.
- **(email, no clean mapping)** — confirmed but out-of-allowlist: **Post-Purchase Email Upsells** and **Subscription Upcoming-Order Email** trigger locations send offers by email. No internal extension-type covers transactional email; flag as a surface our vocabulary does not model.

**Coordination:** All surfaces read a shared offer/funnel definition and shared eligibility state (trigger products in cart + conditions). A **Funnel** hands off across sequential pop-up renders on the SAME trigger location: offer N's accept/decline decision selects offer N+1 (accept → next chained offer; a single decline → one more offer then stop). Cross-surface handoff is looser: the same catalog of offers is evaluated independently per trigger location, with a "most-recently-modified offer wins" tiebreak when multiple offers qualify at once. State that must persist across the handoff: which offers were shown/accepted/declined in this session, and cart membership (an offer suppresses itself once its offer product is already in cart).

## functional_model
Core entities (concrete shapes; field names confirmed from docs, structure inferred):

- **Offer** = { id, type: `upsell | cross_sell | free_gift(BOGO) | smart(AI)`, trigger_location: enum(8 locations), trigger_products: `product[] | variant[] | collection | entire_store`, offer_products: `product[]` (max 3 shown, more via nav arrows), conditions: Condition[], display: DisplayConfig, discount?: DiscountRef, priority (implicit via last-modified), active: bool }
- **Funnel** = ordered chain of up to **3** Offers on one trigger location (Product-Page or Cart-Page Pop-up only), with rule: only the FIRST offer may be `upsell`; all subsequent must be `cross_sell`. Branch semantics: accept → advance to next; decline → show at most one more then terminate. — confirmed
- **Condition** (targeting) = { cart_value_min: number, date_range: {start,end}, hide_if_offer_in_cart: bool (implicit/always), hide_if_out_of_stock: bool } — confirmed
- **DisplayConfig** (per-offer + global text overrides) = { title, description, continue_text, no_thanks_text, add_to_cart_text, added_text, qty_text, replace_item_text, you_added_text, show_all_offered_products: bool, link_image_to_pdp: bool, link_title_to_pdp: bool } — confirmed
- **Constraint invariant:** trigger_product ≠ offer_product (an offer never shows if its offer product is already in cart) — EXCEPT the Product-Page Pop-up trigger, where they may coincide because the cart is empty at add-to-cart time. — confirmed
- **DiscountRef** — native only on Post-Purchase; otherwise a handoff to the separate **Bold Discounts** app (integration entity), where discount = { amount: number, unit: `% | $` }. — confirmed
- **SmartOffer (AI)** = auto-generated cross-sell recommendation derived from the store's historical order data (co-purchase patterns); no manual trigger/offer product selection. — confirmed

## settings_taxonomy
Actual merchant-facing controls. Types in brackets. Confirmed unless marked (inferred).

### content
- **Offer Title** [text] — heading shown when multiple offer groups trigger at once — confirmed
- **Offer Description** [text] — confirmed
- **Continue text** / **Continue button text** [text] — accept-button label (product-page vs cart-page variants) — confirmed
- **No Thanks text** [text] — decline-button label — confirmed
- **Add to Cart text** [text] — CTA override for pop-ups — confirmed
- **Added text** [text] — post-add confirmation copy — confirmed
- **You added text** [text] — label shown beside the trigger product in the modal — confirmed
- **QTY text** [text] — quantity-field label — confirmed
- **Replace item text** [text] — button label for upsell (replace) flow — confirmed
- **Offer product images / titles** [product-picker → media] — chosen with offer product; PDP-linkable — confirmed

### style
- Modal "automatically inherits your theme's fonts, colors, and button styles" — themed by default rather than a color palette in-app — confirmed
- **Custom CSS / HTML** [text/code] — advanced styling override for the offer modal — confirmed (App Store listing)
- **Link product image to product page** [toggle] — confirmed
- **Link product title to product page** [toggle] — confirmed
- Layout archetype selectors: pop-up vs embedded vs **list** vs **carousel** [select] — confirmed (App Store listing); carousel/nav-arrows engaged by "Show all offered products"
- **Show all offered products** [toggle/checkbox] — off = max 3 offers; on = adds prev/next navigation arrows — confirmed

### targeting
- **Offer Type** [select: Upsell | Cross-sell | Free Gift (BOGO) | Smart/AI | Funnel] — confirmed
- **Trigger Location** [select of 8: Product Page Pop-up | Cart Page Pop-up | Cart Drawer Widget | In-Checkout Widget (Plus) | Post-Purchase Pop-up | Post-Purchase Email | Subscription Customer Portal | Subscription Upcoming-Order Email] — confirmed
- **Trigger product(s)** [product-picker / variant-picker / collection-picker / "entire store" option] — one or many — confirmed
- **Offer product(s)** [product-picker, multi, max 3 displayed] — confirmed
- **Cart value minimum** [number/currency] — offer shows only above threshold — confirmed
- **Date range** [date-range] — auto activate/deactivate window — confirmed
- **Hide offers for out-of-stock products** [toggle] — confirmed
- **Offer priority** — implicit rule "most recently modified offer wins" when multiple qualify (no explicit priority number in legacy UI) — confirmed
- **Smart/AI offers** — no manual targeting; auto-selected from order history [toggle/mode] — confirmed

### behavior
- **True upsell = Replace Item** vs **Cross-sell = Add to Cart** — behavior determined by offer type — confirmed
- **Auto-add / auto-suppress** — offer stops displaying once its offer product is detected in cart — confirmed
- **Funnel chaining** [ordered list, up to 3] with accept/decline branch logic — confirmed
- **Function to call before Upsell** [text — JS function name] — run a merchant JS hook (e.g., T&C acceptance) before the cart-page modal appears — confirmed
- **Free Gift auto-add on condition** [toggle + condition] — auto-drop a gift into cart when a rule is met — confirmed
- **Quantity selector in modal** [toggle/qty input] — confirmed
- **In-Checkout / Post-Purchase enable** — plan-gated toggles — confirmed

### data
- **Discount amount** [number] + **% or $** [select] — via Post-Purchase native or Bold Discounts integration — confirmed
- **Google Analytics integration** [toggle/config] — confirmed
- **Bold Subscriptions integration** — enables subscription trigger locations + subscription-upsell offers — confirmed
- **Bold Discounts integration** — enables discounts on non-post-purchase locations — confirmed
- **Analytics/reporting** — revenue, AOV lift, conversion, click-through, per-offer performance, "offer views" (the billing meter) — confirmed

## data_model
- **Bold-hosted external DB** (confirmed by architecture, not schema): offers, funnels, conditions, per-offer text overrides, trigger/offer product references (stored as Shopify product/variant/collection GIDs), and offer-view/impression/conversion event log all live in Bold's backend, not in Shopify metafields. The app has historically been a hosted-service model (app proxy + external store).
- **Offer-view event stream** — persisted counter feeding usage/SmartFlex billing and the analytics dashboard — confirmed (billing is metered on it).
- **Shopify-side writes:** discounts (native on post-purchase; otherwise draft/automatic discounts via Bold Discounts), cart line mutations (add/replace offer product), post-purchase order edits via Shopify's post-purchase API, checkout-extension config — confirmed.
- **Theme:** the App Embed block registration in the merchant theme (theme settings), plus injected storefront JS/CSS — confirmed.
- **Media/CDN:** offer product imagery pulled from Shopify product media (not separately stored) — (inferred).
- **AI model input:** historical Shopify order data read to compute Smart Offers co-purchase recommendations — confirmed (source), storage/derived-table location (inferred).

## visual_patterns
- **Layout archetypes:** (1) centered **modal pop-up** over dimmed overlay (product-page & cart-page triggers); (2) **inline widget** embedded in cart drawer / checkout / post-purchase page; (3) offer-card **list**; (4) **carousel** with prev/next arrows when >3 offers. — confirmed
- **Offer card component:** product image + title (optionally PDP-linked) + price/discounted price + quantity input + primary CTA (Add to Cart / Replace Item) + secondary decline (No Thanks). — confirmed
- **Component states:** default → hover CTA → adding (spinner) → **Added** confirmation ("You added" line next to trigger product) → suppressed (offer removed once product in cart) → out-of-stock hidden. — confirmed/(inferred for spinner)
- **Motion/interaction:** modal appears on Add-to-Cart or Checkout click (interrupt pattern); accept advances funnel to next offer in-place; decline dismisses (or advances one more in a funnel); carousel arrow paging; one-click accept on post-purchase (no re-checkout). — confirmed
- **Theming:** inherits store fonts/colors/button styles so offers look native; overridable via custom CSS/HTML. — confirmed

## reviews_signal
**Top praises (confirmed):**
1. Measurable AOV / revenue lift — "30% increase in accessory sales," reports of "minimum 10X ROI" with good setup.
2. **Smart/SMART offers** and pop-ups are "super easy to set up"; friendly config UI.
3. Native, seamless placement across checkout, cart drawer, and product pages (feels part of the theme).
4. Standout **customer support** — co-founder (Jay) personally helps with setup/strategy; "best customer service," responsive one-on-one optimization guidance.
5. Breadth of offer types (true upsell, cross-sell, BOGO, funnels) at every funnel stage.

**Top complaints (confirmed):**
1. **Reliability regressions** — app "just stopped working for no reason" with no notification.
2. **Post-update bugs** hurting the store — one merchant cited a "70% drop in add-to-cart rates"; "more buggy than ever."
3. **ROI not always worth the cost** — some merchants don't net enough incremental revenue to justify the fee.
4. **Pricing/billing friction** — historical billing model misaligned with merchants' business (reportedly improved, but 1★ cohort at ~7% flags it).
5. Results hard to attribute/see despite long-term use.

## mapping_note
Maps onto our constrained RecipeSpec vocabulary partially, and **exceeds a single-module recipe in several structural ways**:

1. **Cross-surface blueprint, not one module.** A single Bold "offer/funnel" concept renders across up to 8 distinct trigger locations spanning our `theme.section`/`proxy.widget`, `checkout.upsell`, `postPurchase.offer`, and `customerAccount.blocks` extension types — plus two email surfaces we don't model. Recreating its vocabulary requires a coordinated multi-extension blueprint that shares one offer definition and eligibility state, not a single-surface module.

2. **Persistent data store + event/metering pipeline.** Offers, funnels, per-offer copy, product/collection references, and an **offer-view/impression/conversion event stream** must be persisted server-side (external DB or metaobjects) and aggregated for analytics AND for usage-based billing. A stateless single-module recipe cannot hold this; it needs a backing store and an ingest pipeline.

3. **A real rule/condition engine + funnel decision tree.** Eligibility (trigger product set ∈ {product|variant|collection|entire store} × cart-value-min × date-range × in-cart-suppression × stock) plus accept/decline **funnel branching** (sequenced offers, "first-may-be-upsell / rest-cross-sell," "one-decline-then-stop," last-modified-wins tiebreak) is a stateful runtime rule engine, not declarative static config.

4. **External side-effects & cross-app orchestration.** Native post-purchase discounts, cart line replace/add mutations, post-purchase order edits, checkout-extension provisioning, plus handoffs to **Bold Discounts** (discount codes) and **Bold Subscriptions** (subscription portal/email surfaces), and an **AI recommendation job** reading historical order data — all are side-effecting, cross-system operations beyond a single validated module spec.
