# Upsell & Cross Sell — Selleasy

> Research record for the constrained-generation vocabulary study. Facts labeled **confirmed** (from App Store listing + vendor help center + review aggregators) or **(inferred)** where derived from behavior/analogy but not explicitly documented. App is live and actively maintained — no rename/merge/deprecation. Note: this is a **Logbase** app, NOT a Bold app; the "Bold apps get renamed" caveat does not apply here.

## identity
- **name**: Upsell & Cross Sell — Selleasy — **confirmed**
- **vendor**: Logbase (logbase.io) — **confirmed**
- **category**: Marketing and conversion → Upsell and cross-sell / Product bundles (internal: **upsell**) — **confirmed**
- **App Store URL**: https://apps.shopify.com/upsell-cross-sell-kit-1 — **confirmed**
- **rating**: 4.9 / 5 — **confirmed** (distribution ~97% five-star, 1% four-star)
- **review count**: ~2,444 reviews (as of Jul 2026; was ~2,428 mid-2026, ~1,551 earlier) — **confirmed**, still climbing
- **install signal**: ~45,000+ Shopify stores installed (storeleads/analyzify signal; not shown on listing itself) — **confirmed** via aggregators
- **pricing model**: Freemium, order-volume tiered. Free = up to 50 orders/mo; Tier II ≈ $9/mo up to 500 orders; Tier III ≈ $19/mo up to 1,000 orders; Tier IV ≈ $29/mo for 1,000+ orders. All tiers include every upsell feature + styling + support; paid tiers carry a 30-day trial. (Exact price points drift; order-volume banding is the stable structure.) — **confirmed**

## surfaces
Selleasy is **multi-surface** — it renders across the entire purchase funnel from PDP to post-purchase. Mapped to our internal extension-type vocabulary:

- **theme.section / theme app embed** — **confirmed**. Product-page widgets (Frequently Bought Together, Product Add-ons) and cart-page widgets (Cart Add-ons, Upsell Funnel popup) are injected via a **theme app extension / app embed block** plus custom code the app writes into the theme's cart drawer. "Each theme implements the cart drawer differently, so the app adds custom code within it." Closest allowlist fit: `theme.section` (storefront-rendered widget block).
- **checkout.upsell** — **confirmed**. "Checkout upsell" offers rendered inside the Shopify checkout flow (a checkout UI extension surface).
- **postPurchase.offer** — **confirmed**. One-click Post-Purchase Upsell page shown *after payment details entered, before order confirmation*; adds product to the SAME order in one click without re-entering payment. Requires Shopify Payments (credit card) or PayPal Express with Automatic Payments; checkout currency must equal store default currency.
- **checkout.block** — **confirmed** (Thank-you / Order-status page add-ons). "Cross sell related products on thank you page & order status page after sale." Distinct from post-purchase: this creates a **separate new checkout/order** rather than modifying the original. Maps to a checkout/thank-you-page UI extension block.
- **proxy.widget** — **(inferred)**. The storefront widgets fetch offer config + recommendations at render time; there is an app-backend endpoint serving offer data to the theme (App Proxy or app-embed data fetch). Not explicitly documented as an App Proxy but the render-time data dependency is confirmed.
- **admin.block / admin.action** — **(inferred)**. Merchant configures everything in an embedded admin app (offers list, offer editor). Not a Shopify admin *block extension* per se, but the admin UI is the primary authoring surface.
- **analytics.pixel** — **(inferred)**. App reports offer views/conversions and AOV lift, implying view/click/add-to-cart event capture. Not confirmed to be a Web Pixel Extension specifically.
- NOT used: `functions.cartTransform`, `functions.discountRules`, `functions.deliveryCustomization`, `functions.paymentCustomization`, `pos.extension`, `customerAccount.blocks`, `flow.automation` — no evidence. Bundle discounts appear to be applied via draft-order / discount-code / line-item price mechanics rather than a Cart Transform / Discount Function. **(inferred)**

**How the surfaces COORDINATE**: all surfaces read from a single shared **Offer** store keyed by trigger→offer product mapping. State handoff is *product-graph-based*, not session-based: an FBT offer on the PDP, a cart popup, a checkout upsell, and a post-purchase offer are independent offers that reference the same product catalog + targeting rules. The **Upsell Funnel** is the one surface with true sequential/branching state — accept/reject of offer #1 determines whether #2A (upsell) or #2B (downsell) shows. A **priority (numeric)** field resolves which offer wins when multiple offers target the same trigger product on the same surface. Discounts created by an offer flow through to the cart/checkout so the shared cart is the coordination point across storefront surfaces.

## functional_model
Core entity is the **Offer** (a.k.a. campaign). Concretely:

```
Offer = {
  id,
  name,                         // internal reference only, not shown to shopper
  type,                         // enum: frequently_bought_together | product_addon
                                //       | cart_addon | upsell_funnel
                                //       | post_purchase | thankyou_page_addon
  surface,                      // product_page | cart_page | checkout | post_purchase | thankyou
  trigger,                      // TriggerRule
  offerProducts: [ProductRef], // manual list OR "automatic" (Shopify recommendation engine) OR metafield-sourced
  discount: DiscountRule | null,
  layout,                       // enum varies by type (see settings)
  styling: StyleConfig,
  text: TextConfig,             // translatable strings
  priority: number,             // tiebreak when multiple offers match same trigger
  enabled: boolean
}

TriggerRule = {
  match: "specific_product" | "product_tags" | "all_products",
  productRefs?: [ProductRef],
  tags?: [string],
  // + "10+ product and customer attributes" for targeting (product tags, customer attributes)
}

DiscountRule = {
  enabled: boolean,
  kind: "percentage" | "fixed" | "cheapest_item_free" | "free_shipping",
  value?: number,
  combineWithOtherDiscounts: boolean
}

// Upsell Funnel adds a branching sequence on top of Offer:
FunnelStep = {
  offer: ProductRef,
  onAccept: FunnelStep | null,   // e.g. #2A
  onReject: FunnelStep | null,   // e.g. #2B
  countdownTimer?: DurationSeconds
}

// FBT-specific relationship:
Bundle = { triggerProduct, offerProducts: [ProductRef, ...], bundleDiscount: DiscountRule }
```

Relationships: **Offer 1→1 TriggerRule**, **Offer 1→N ProductRef (offer products)**, **Offer 0/1 DiscountRule**, **Upsell Funnel Offer 1→N FunnelStep (accept/reject tree)**. Offer products can be **sourced from a product metafield** for bulk product-wise recommendations ("set up offer products in metafields… useful for bulk product-wise recommendations"; app can pre-fill offer quantity based on trigger quantity). — **confirmed**

## settings_taxonomy
The single most important section. Grouped under the five required headings. Type in parentheses. All **confirmed** unless marked.

### content
- **Offer name** (text) — internal reference only.
- **Upsell type** (select[ frequently_bought_together | product_addon | cart_addon | upsell_funnel | post_purchase | thankyou_page_addon ]).
- **Display location / surface** (select[ product_page | cart_page | checkout | post_purchase | thankyou_page ]).
- **Offer products source** (select[ manual (product-picker) | automatic (Shopify recommendation engine) | metafield ]).
- **Widget title** (text, editable default, translatable).
- **Price label** (text, translatable).
- **Cart / Add-to-cart button text** (text, translatable).
- **Discount label text** (text, translatable).
- **Default content strings** (text × many, under a "Text and translations" section — full string catalog per widget).
- Post-purchase caveat: **offer text is NON-editable** on the post-purchase surface (Shopify platform restriction) — **confirmed**.

### style
- **Layout style** — value set is **type-dependent**:
  - FBT: select[ card | classic (Amazon-style) ] — **confirmed** (2 layouts; docs elsewhere mention up to 3 variants).
  - Product Add-ons: select[ card_list | card_slider | grid | grid_slider ] (4 layouts) — **confirmed**.
  - Add-on selection control: select[ button | checkbox ] — **confirmed**.
- **Widget position** (position selector — where in the PDP/cart the widget injects) — **confirmed**.
- **Background color** (color) — **confirmed**.
- **Button color** (color) — **confirmed**.
- **Text color** (color) — **confirmed**.
- **Border radius** (number) — **confirmed**.
- **Widget size** (select / number) — **confirmed**.
- **Font size** (number) — **confirmed**.
- **Font weight** (select) — **confirmed**.
- **Custom CSS** (textarea) — **confirmed**.

### targeting
- **Trigger match type** (select[ specific_product | product_tags | all_products ]) — **confirmed**.
- **Trigger products** (product-picker, when specific) — **confirmed**.
- **Trigger tags** (tag-selector, when tags) — **confirmed**.
- **Targeting attributes** — "10+ product and customer attributes" (rule-builder over product tags + customer attributes) — **confirmed** (breadth confirmed; full attribute list not enumerated in public docs → **(inferred)** which specific attributes).
- **Priority** (number) — display order when multiple offers target the same trigger; higher shows first — **confirmed**.
- **Multiple trigger conditions** per campaign to control when it shows — **confirmed**.
- **Auto-rotate underperforming campaigns** (toggle, Pro-tier) — **confirmed**.

### behavior
- **Enable bundle/offer discount** (toggle) — **confirmed**.
- **Discount type** (select[ percentage | fixed | cheapest_item_free | free_shipping ]) — **confirmed** (cheapest-free / free-shipping confirmed for FBT; percentage+fixed+free-shipping across types).
- **Discount value** (number, when percentage/fixed) — **confirmed**.
- **Combine with other discounts** (toggle) — **confirmed**.
- **Countdown timer** (toggle + duration) — urgency, on Upsell Funnel + post-purchase — **confirmed**.
- **After-click action** (select — action after shopper clicks the offer; options not enumerated publicly) — **confirmed** field exists, options **(inferred)** (e.g. add-to-cart-and-stay / go-to-cart / go-to-checkout).
- **Add-on requirement** (toggle — offer product purchasable only *with* main product, vs. standalone) — **confirmed**.
- **Funnel accept/reject branching** (rule-builder — onAccept→step, onReject→step) — **confirmed**.
- **Pre-fill offer quantity from trigger quantity** (toggle/behavior, metafield offers) — **confirmed**.

### data
- **Offer products via metafield** (metafield binding — bulk product-wise recommendations) — **confirmed**.
- **Automatic recommendations** (toggle → Shopify recommendation engine as offer source) — **confirmed**.
- **Payment gateway gating** (post-purchase requires Shopify Payments / PayPal Express + matching currency) — a **precondition config**, not a knob — **confirmed**.
- **Multi-currency / multi-language** (auto — offers render in store's active currency/locale; text catalog is translatable) — **confirmed**.

## data_model
- **Offer/campaign config** persisted in **Logbase's own external app database** (per-shop offers, targeting rules, styling, discount config, funnel trees). Not stored as native Shopify objects. — **(inferred, high confidence)** — the admin app is the source of truth; widgets fetch from it at render time.
- **Product metafields** — offer products can be stored in **Shopify product metafields** for bulk/product-wise recommendation setup; app reads these at render time. — **confirmed**.
- **Discounts** — implemented via Shopify discount/draft-order mechanics so bundle/offer discounts land in cart & checkout (auto-applied). Exact mechanism (discount code vs. draft order vs. line-item price) not documented → **(inferred)**.
- **Theme injection** — app writes **custom Liquid/JS into the theme cart drawer** per store (theme-specific patching), plus theme app extension embed for widget mount points. — **confirmed**.
- **Post-purchase order mutation** — post-purchase accept **appends line item to the existing order** (no new checkout); thank-you/order-status add-on creates a **separate order**. — **confirmed**.
- **Analytics/event data** — view/click/conversion + AOV metrics captured to app backend. — **(inferred)**.
- **Media/CDN** — product imagery served from Shopify CDN; app supplies no separate media store. — **(inferred)**.

## visual_patterns
- **Layout archetypes**: (1) Amazon-style "classic" FBT — horizontal product row with "+" connectors, combined total price, single "Add all to cart"; (2) "card" FBT — bundled card block; (3) Add-on lists — card_list / card_slider (carousel) / grid / grid_slider; (4) Cart-page **popup/modal** funnel triggered on checkout-click; (5) in-cart-drawer inline add-ons; (6) full-width post-purchase offer page between payment and confirmation; (7) thank-you/order-status recommendation strip. — **confirmed**
- **Component states**: default / hover / selected (checkbox or button toggles item into bundle) / discount-applied (shows strikethrough + discount label) / added-to-cart / countdown-active / accepted vs rejected (funnel branch) / sold-out or unavailable (offer suppressed when product out of stock or handle changed). — **confirmed** (out-of-stock suppression noted in FAQ).
- **Motion/interaction**: carousel/slider paging for add-on layouts; modal popup entrance on checkout intent; **countdown timer** decrementing for urgency; one-click add (no page reload) for FBT "add all" and post-purchase accept; live total recompute as items are toggled. — **confirmed / (inferred)** for exact easing.
- Emphasis on being **lightweight / performance-optimized** and theme-matching (colors/fonts adopt store aesthetic via style config). — **confirmed**.

## reviews_signal
**Top praises** (define "up to the mark"):
1. **Support quality** — the dominant praise by far; fast chat replies, free **Zoom/onboarding calls**, hands-on setup and theme-customization help. Repeatedly cited as the reason for the 4.9. — **confirmed**
2. **Ease of setup / intuitive UI** — "so easy to use and does the job"; quick to configure. — **confirmed**
3. **Seamless theme integration** — matches store design, works even on older themes and with custom cart drawers. — **confirmed**
4. **AOV lift** — merchants report meaningful AOV/sales increases (vendor claims ~up to 20%). — **confirmed**
5. **Breadth for the price** — all upsell types available on the free/low tiers. — **confirmed**

**Top complaints** (failure modes to design around):
1. **Requires credit-card details to start the free trial** — friction, flagged by small merchants. — **confirmed**
2. **Can feel pricey for brand-new/small stores** (order-volume banding bumps cost as you grow). — **confirmed**
3. **Free-gift / promo edge cases** — customers able to add more than one free gift despite settings intended to prevent it. — **confirmed** (concrete bug class)
4. **Theme / third-party app conflicts** — breakage after theme updates, product handle changes, or another app touching the cart drawer; sometimes needs manual per-theme customization. — **confirmed**
5. **Page-builder gaps** — Cart add-ons, Upsell funnel, and Thank-you-page add-ons NOT integrated with GemPages; incompatible with GemPages preview mode. — **confirmed**

## mapping_note
Selleasy maps onto our RecipeSpec vocabulary as a **cross-surface upsell blueprint**, not a single module. Individual offer types line up cleanly with single surfaces (an FBT widget ≈ `theme.section`, a checkout upsell ≈ `checkout.upsell`, a post-purchase offer ≈ `postPurchase.offer`), but the app *as a whole* exceeds a single-module recipe on several axes:

- **Persistent offer/rule store**: needs a durable per-shop **Offer entity** (trigger→offer mapping, discount config, funnel trees, priority) — a real data store + admin authoring surface, not a stateless render-time module.
- **Cross-surface blueprint with shared state**: one logical "upsell program" spans PDP + cart + checkout + post-purchase + thank-you, coordinated through a shared product graph, a **priority tiebreak**, and cart/discount handoff. This is a **composeBlueprint** of ≥4 extension types, not one recipe.
- **Rule engine / targeting**: trigger match (product/tags/all) + "10+ product & customer attributes" + priority + auto-rotate is a genuine **rule-builder**, beyond a single module's static config.
- **Stateful sequential funnel**: the Upsell Funnel's accept/reject branching (onAccept→#2A, onReject→#2B) with countdown timers is **runtime session state / a small decision tree**, which a stateless recipe can't express.
- **External side-effects on orders**: post-purchase **mutates an existing order** (append line item, one-click, no re-auth) and thank-you add-ons **create new orders**; bundle discounts inject Shopify discount/draft-order side-effects. These are backend order-mutating actions, not client-only render.
- **Metafield-backed bulk data**: offer products sourced from product metafields for store-wide recommendations = a **data-provisioning / bulk-binding** step beyond a single module's inline config.
