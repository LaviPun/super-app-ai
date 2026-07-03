# Honeycomb Upsell & Cross Sell

> Vocabulary research record for constrained module-spec generation. Facts labeled **confirmed** (App Store listing, vendor pages, vendor support/SDK docs, third-party setup walkthroughs) or **(inferred)** where behavior is deduced from the platform model but not directly stated. The app is live under its original name (no rename/merge/deprecation) — the "Honeycomb" name and Conversion Bear vendor are current as of Jul 2026.

## identity
- **name**: Honeycomb Upsell & Cross Sell (listing title; also marketed as "Honeycomb Upsell & Cross-sell Funnels" / "Honeycomb Upsell Funnels") — **confirmed**
- **vendor**: Conversion Bear — **confirmed**
- **category**: Upsell and cross-sell (Shopify "Marketing and conversion") — **confirmed**
- **App Store URL**: https://apps.shopify.com/honeycomb-upsell-funnels — **confirmed**
- **rating**: 4.7 / 5 — **confirmed** (one aggregator cited 4.9; listing itself shows 4.7)
- **review count**: ~151–152 reviews — **confirmed**
- **install signal**: Long-standing app (listed since ~2020), established Conversion Bear portfolio; review velocity modest (~150 over multiple years) but high-AOV-impact positioning. Not a top-100k-installs juggernaut; solid mid-tier upsell app — **(inferred)** from review count + tenure
- **pricing model**: Freemium, metered by **monthly funnel views** — **confirmed**
  - FREE — $0, 100 monthly funnel views, all core funnel types + split testing, Conversion Bear branding shown
  - SILVER — $54.99/mo, 2,000 views, 7-day trial, branding removal
  - GOLD — $109.99/mo, 5,000 views
  - PLATINUM — $169.99/mo, 10,000 views
  - (Historical/aggregator sources cite lower legacy prices e.g. $49.99; current listing tiers above. Views are the hard meter — offers stop showing once the monthly cap is hit — **(inferred)** from "funnel views" being the metered unit)

## surfaces
Honeycomb is fundamentally **multi-surface**: one funnel definition can fire on several storefront touchpoints, and a single merchant runs many funnels across the purchase journey. Mapping to our internal extension-type vocabulary:

- **theme.section** / theme app embed — **confirmed** (core). Product-page and cart-page funnels render as injected upsell blocks/widgets on the storefront via a theme app embed + Honeycomb JS SDK (vendor publishes a "Honeycomb JS SDK" support article). Shows the offer card(s): product image, title, price, discount, offer text/description, accept/decline CTAs. "No theme code needed."
- **proxy.widget** — **(inferred)** the storefront widget is served/hydrated by the app (JS SDK loads offer config from Honeycomb's backend, not from Liquid). Functionally an app-served widget layer over the theme.
- **postPurchase.offer** — **confirmed** (core, flagship). One-click post-purchase upsell shown immediately after payment, on the native Shopify post-purchase extension surface. Customer accepts **without re-entering payment**; accepted item is **merged into the original order** (no second transaction). Supports conditional accept/decline → downsell chaining. Vendor documents "post purchase offers limitations."
- **checkout.upsell** — **confirmed** (Plus-only). In-checkout funnel via Shopify Checkout Extensibility (checkout UI extension) — offers rendered inside the checkout for Shopify Plus stores.
- **Thank-you page funnel** → maps to **checkout.block** / **postPurchase.offer** — **confirmed**. Offer on the order-status / thank-you page (order summary). Distinct from the true post-purchase (pre-order-confirmation) offer: thank-you-page offers are placed after the order is complete and typically create a new order or add-on. In our vocabulary this is a checkout/thank-you extension block.
- **admin.block** / merchant admin app — **confirmed**. The whole funnel builder, analytics dashboard, A/B test results, and design editor live in the embedded Shopify admin app. (This is the merchant control plane, not a storefront surface.)
- **Blog-page / custom-page funnels** → **theme.section** with page-scoped targeting — **confirmed** (a cross-sell funnel can be placed on blog pages / specific blog posts).
- **analytics.pixel** — **confirmed** integrations: Facebook Pixel, Google Analytics, TikTok, Snapchat Pixel, Pinterest Tag. Honeycomb fires conversion/upsell events into these (event forwarding, not a full custom pixel extension necessarily).
- **NOT used**: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, admin.action, pos.extension, customerAccount.blocks, flow.automation — **(inferred)**. Discounts are applied via draft-order / checkout mechanics and the post-purchase API rather than Shopify Functions; no evidence of Flow triggers/actions, POS, or customer-account surfaces.

**How surfaces COORDINATE**: A **funnel** is the shared-state unit. Each funnel is bound to one placement (product / cart / post-purchase / thank-you / checkout / blog) and carries an **ordered offer chain**. The chain is a state machine: Offer 1 → on **accept** or **decline**, branch to Offer 2 (downsell), etc. Handoff between offers is driven by the customer's accept/decline signal; the "skip this offer / redirect to checkout" flag short-circuits the chain. Across surfaces the coordination is looser: product/cart funnels influence what enters the cart; the post-purchase funnel reacts to the just-placed order's contents (order-merge). The **AI "autopilot" recommendation engine** is a cross-cutting service that can auto-select the offered product per shopper cart instead of a fixed product pick. Targeting rules (product / variant / collection / cart value) gate which funnel fires. Split-test **Version A / Version B** is shared funnel-level state that randomly routes each view.

## functional_model
Core entities (concrete shapes; field types **(inferred)** from the builder UI unless noted):

```
Funnel = {
  id,
  name: string,                          // confirmed
  placement: enum(product_page | cart_page | post_purchase | thank_you_page | checkout | blog_page),  // confirmed
  status: enum(active | paused | draft),
  trigger: Trigger,                      // confirmed (targeting)
  offers: Offer[] (ordered chain),       // confirmed
  splitTest: { enabled: bool, variants: [VersionA, VersionB] },  // confirmed
  design: DesignConfig,                  // confirmed (per-funnel look & feel)
  postAcceptAction: enum(checkout | cart_page | stay_on_page),   // confirmed
  views, conversions, revenue            // analytics rollups (confirmed as tracked)
}

Trigger = {
  scope: enum(any_product | specific_product | collection),      // confirmed (cross-sell)
  productRefs: ProductRef[] | null,       // when specific_product
  collectionRef: CollectionRef | null,    // when collection
  variantRef | null,                      // variant-level for variant upsell (confirmed)
  cartValueCondition | null,              // "cart values" targeting (confirmed on vendor LP)
  blogScope: enum(all_posts | specific_post) | null              // blog placement (confirmed)
}

Offer = {
  kind: enum(cross_sell | upsell),        // confirmed (radio)
  upsellType: enum(variant_upsell | product_upsell) | null,      // confirmed (upsell only)
  offeredProductRef | offeredVariantRef,  // product picker (confirmed)
  replacementVariantRef | null,           // variant upsell: trigger variant -> replacement variant (confirmed)
  discount: Discount,                     // confirmed
  offerText: string,                      // title shown to shopper (confirmed)
  offerDescription: string,               // body copy (confirmed)
  freeShipping: bool,                      // "free shipping on accepted offer" toggle (confirmed)
  branch: { onAccept -> nextOfferId|end, onDecline -> nextOfferId|end },  // downsell chaining (confirmed)
  skipToCheckout: bool                     // "skip this offer / auto-redirect to checkout if accepted" (confirmed)
}

Discount = {
  type: enum(percentage | fixed_amount | fixed_price | none),    // confirmed
  value: number                           // confirmed
  // also: BOGO, bulk/quantity discount, discount stacking (confirmed at feature level)
}

ProductRef / VariantRef / CollectionRef = Shopify GID pointers  // (inferred)
```

Relationships: `Funnel 1—* Offer` (ordered, branching). `Offer *—1 ProductRef` (offered item). `Trigger *—* Product/Collection/Variant`. `Funnel 1—2 SplitTestVariant`. Analytics roll up per Funnel and per Variant.

## settings_taxonomy
The actual merchant-facing controls in the funnel builder, grouped under the five headings. **This is the heart of the vocabulary.**

### content
- **Funnel name** — text — **confirmed**
- **Offer text / title** — text (per offer, per split variant) — **confirmed**
- **Offer description** — textarea (body copy under the offer) — **confirmed**
- **Accept button text** — text — **(inferred)** (standard for the category; not individually named in sources)
- **Decline button text** — text — **(inferred)**
- **Offered product** — product-picker (single product per offer; per split variant) — **confirmed**
- **Offered variant / replacement variant** — select (variant upsell: trigger variant → replacement variant) — **confirmed**
- **Translation / localization** — toggle ("translation enablement option") to translate offer copy — **confirmed**

### style
- **Brand match** — the design editor lets merchants "match your offers design with your brand **fonts, color and style**" — **confirmed**
- **Colors** — color pickers (background, text, button, accent) — **(inferred)** from "color" being a documented axis
- **Fonts / typography** — font selection to match brand — **confirmed** (as an axis) / specific control **(inferred)**
- **Layout / template style** — offer-card layout presets — **(inferred)**
- **Custom CSS & JS** — code fields, available on **paid tiers** — **confirmed** (vendor LP: "custom CSS & JS across paid tiers"; a "Honeycomb JS SDK" exists for deeper customization) — **confirmed**
- **Branding removal** ("Powered by Conversion Bear") — implicit toggle gated by plan (removed on Silver+) — **confirmed**

### targeting
- **Placement / page type** — select (product page / cart page / post-purchase / thank-you page / checkout [Plus] / blog page) — **confirmed**
- **Trigger scope** — radio (any product / specific product / collection added to cart) — **confirmed**
- **Trigger product(s)** — product-picker (when "specific product") — **confirmed**
- **Trigger collection** — collection-picker (when "collection") — **confirmed**
- **Trigger variant** — select (variant-level upsell trigger) — **confirmed**
- **Cart value condition** — number / range (target by cart total) — **confirmed** (vendor LP lists "cart values" as a targeting dimension); exact operator UI **(inferred)**
- **Blog scope** — radio (all blog posts / specific blog post) for blog placement — **confirmed**
- **AI autopilot targeting** — toggle: let the AI engine auto-match the offered product to the shopper's cart instead of a fixed pick — **confirmed**

### behavior
- **Offer kind** — radio (cross-sell / upsell) — **confirmed**
- **Upsell type** — radio (variant upsell / product upsell) — **confirmed**
- **Post-accept action / follow-up navigation** — select (proceed to checkout / go to cart page / stay on page) — **confirmed**
- **Downsell chaining** — "Add downsell condition" button → adds Offer 2 with accept/decline branch off Offer 1 — **confirmed**
- **Skip this offer / auto-redirect to checkout on accept** — checkbox — **confirmed**
- **Discount type** — select (percentage / fixed dollar amount / fixed price / none) — **confirmed**
- **Discount value** — number — **confirmed**
- **BOGO / bulk discount / discount stacking** — feature toggles/config — **confirmed** (at feature level)
- **Free shipping on accepted offer** — toggle — **confirmed**
- **A/B split test** — toggle → creates Version A / Version B with independent product + discount + copy; keep-winner action — **confirmed**
- **Order merge (post-purchase)** — behavior: accepted post-purchase item merges into original order, no re-payment — **confirmed** (largely automatic, minimal config)

### data
- **Analytics dashboard** — views, conversion rate, revenue per funnel and per split variant — **confirmed** (read surface, not a knob)
- **Pixel / tracking integrations** — connect Facebook Pixel, Google Analytics, TikTok, Snapchat Pixel, Pinterest Tag — **confirmed**
- **Subscription integration** — Recharge compatibility for subscription upsells — **confirmed**
- **Funnel-view meter** — plan-bound usage counter (100 / 2,000 / 5,000 / 10,000 monthly views) — **confirmed**

## data_model
What Honeycomb persists and where:
- **Funnel/offer definitions** live in Conversion Bear's **own external backend DB** (not Shopify metaobjects) — the JS SDK fetches offer config at runtime from Honeycomb's servers — **(inferred)** strongly from the JS-SDK-driven architecture and app-served widget model.
- **Product/variant/collection references** stored as Shopify GIDs pointing into the merchant's catalog — **(inferred)**.
- **Analytics / view counts / conversions / A-B split assignment** persisted server-side per funnel and per variant (drives the metered billing and the dashboard) — **confirmed** (dashboard exists; **(inferred)** it is external DB).
- **Discounts**: applied at runtime via Shopify draft-order / checkout line pricing and the post-purchase API; may create discount codes or line-level price overrides rather than durable Function config — **(inferred)**.
- **Post-purchase acceptances**: written back to Shopify as **order line additions / order merge** on the original order (Shopify order object mutated), not a separate persisted store — **confirmed** (order-merge behavior).
- **Media/CDN**: offer imagery pulled from Shopify product images / Shopify CDN; custom uploads (if any) via app storage — **(inferred)**.
- **Storefront hook**: theme app embed injects the JS SDK; no per-page Liquid persisted in the theme (marketed as "no theme code") — **confirmed**.

## visual_patterns
- **Layout archetypes** — **(inferred)** from category norms + "offers appear as customers head to checkout" framing:
  - Product/cart page: **embedded offer card or slide-in/modal** with product image, title, was/now price, discount badge, offer text + description, Accept / Decline (or "No thanks") buttons. Cart funnels often present as a slide-in near add-to-cart / a modal on cart action.
  - Post-purchase: **full-width native post-purchase page** ("Wait! Complete your order with…") — one-click accept, single offer, order-summary context.
  - Thank-you page: **order-status-page embedded block** below the order summary.
  - Checkout (Plus): **inline checkout UI extension block** between checkout sections.
- **Component states** — offer shown → accepted (adds to cart / merges to order, may show confirmation) → declined (advances chain to downsell or closes) → loading (SDK fetch) → capped/hidden (monthly view limit reached) — **(inferred)**.
- **Motion/interaction** — modal/slide-in entrance animation; button press → optimistic add; countdown/urgency framing possible; one-click (no card re-entry) is the signature interaction on post-purchase — **confirmed** for one-click, **(inferred)** for specific animations.
- **Brand-adaptive skinning** — the design editor is meant to make the widget visually match the host store (fonts/colors/style), i.e. it is a **themeable component**, not a fixed-chrome popup — **confirmed** as intent.

## reviews_signal
**Top praises**:
1. **Real revenue / AOV lift** — merchants report a meaningful share of sales attributed to the upsell funnels — **confirmed**.
2. **Exceptional, fast support with free custom design** — support team sets up/customizes the funnel design for merchants at no cost, quickly — **confirmed** (recurring).
3. **Easy to set up, no code** — intuitive builder, installs cleanly, works with existing themes without theme edits — **confirmed**.
4. **Professional, trustworthy funnel design** — offers look native/branded, which merchants believe boosts conversion — **confirmed**.
5. **Full-journey coverage + split testing** — one app covers product → cart → post-purchase → thank-you with built-in A/B — **confirmed**.

**Top complaints**:
1. **Support goes dark on critical bugs** — a merchant waited 7 days with no developer investigation for a revenue-impacting bug; another reported being "ghosted twice." Praise for support is real but inconsistent under pressure — **confirmed**.
2. **Functional bugs** — funnels break after store/theme updates; **collection-filter targeting fails**; **cart-exclusion rules malfunction** — **confirmed**. (Targeting rule-engine reliability is the weak spot.)
3. **Free plan too limited / pricing gap** — 100 views/mo is tiny; merchants want a mid-tier between free and the premium plans — **confirmed**.
4. **No resolution timeline** — "be patient" without workarounds or accountability when things break — **confirmed**.
5. **Premium price vs reliability** — high monthly cost feels unjustified when responsiveness/quality slips; admin UI called "a bit complex and hard to navigate" — **confirmed**.

## mapping_note
Onto our constrained **RecipeSpec** vocabulary, a single Honeycomb *offer card* on the product page maps cleanly to **one theme.section / proxy.widget module** with a product-picker, discount, offer copy, and CTA styling — that part is in-vocabulary and generatable as one module. But Honeycomb as a product substantially **EXCEEDS a single-module recipe**:

1. **It's a cross-surface blueprint, not one module.** A funnel spans theme.section (product/cart/blog) + postPurchase.offer + checkout.upsell + thank-you (checkout.block), all coordinated by shared funnel state. Recreating it needs a **multi-module blueprint** (matching our BLUEPRINTS_ENABLED path), not a lone RecipeSpec.

2. **It requires a persistent external data store + metered state.** Funnel/offer definitions, per-shopper A/B assignment, and view/conversion counters live server-side and drive both the widget and the billing meter. A stateless generated module can't hold this — it needs a **backend data model + counters** (our "additive data-model provisioning").

3. **It's a branching rule engine + state machine, not static config.** Offers form an ordered accept/decline downsell chain with targeting predicates (product / variant / collection / cart-value / blog-scope) and post-accept navigation. This is a **conditional flow / rule-builder** that exceeds flat module settings — and it's exactly where reviews say the app is buggy, so correctness matters.

4. **It performs privileged external side-effects.** One-click post-purchase acceptance mutates the *original Shopify order* (order-merge, no re-payment), applies runtime discounts, and forwards conversion events to third-party pixels (FB/GA/TikTok/Snap/Pinterest). These are **background/side-effecting operations against Shopify + external APIs**, plus an **AI recommendation service** ("autopilot") that dynamically selects the offered product — none of which fit inside a single self-contained generated module.
