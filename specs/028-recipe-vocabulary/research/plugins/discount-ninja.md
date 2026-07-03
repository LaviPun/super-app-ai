# Discount Ninja Promo Engine

> Vocabulary study record for the constrained recipe-generation system.
> Sources: Shopify App Store listing + reviews (apps.shopify.com/discount-url), vendor site (discountninja.io), developer hub (developers.discountninja.io), help center (support.discountninja.io / support.ninja-commerce.com). Facts labelled **confirmed** or **(inferred)**.

**Rename/vendor note (confirmed):** The listing is now titled **"Discount Ninja Promo Engine - Personalized Promotion Platform. Special Offers & Secret Deals"** at the stable slug `discount-url`. The vendor's help center domain migrated from `support.discountninja.io` to `support.ninja-commerce.com` (301), and the vendor umbrella is branded both **Limoni/Limonia Apps** and **Ninja Commerce** — same product, rebranded shell/company name; the Shopify app slug and engine are unchanged. This is NOT the Bold "Discount Ninja" confusion and NOT the unrelated "Marketwise Discount Ninja" (`beacon-smart-market-discount`, different vendor) — that is a distinct app and was excluded. Studied the current live product.

## identity
- **name:** Discount Ninja Promo Engine — **confirmed**
- **vendor:** Discount Ninja / Limoni Apps (a.k.a. Limonia Apps / Ninja Commerce) — **confirmed**
- **category:** Discounts (under Marketing and conversion) — **confirmed**
- **App Store URL:** https://apps.shopify.com/discount-url — **confirmed**
- **rating:** 4.4 / 5 — **confirmed** (78% 5-star, ~13% 1-star)
- **review count:** ~180 reviews (sources vary 177–195; listing snapshot ~180) — **confirmed**
- **install signal:** ~20,000 stores (storeleads/appstoreanalytics report ~20,046 installs) — **confirmed**
- **pricing model:** Tiered subscription metered by monthly order volume, 14-day free trial — **confirmed**. Starter $49/mo (500 orders, $0.20 per extra), Pro $99/mo (1,000 orders, $0.175 extra), Grow $199/mo (2,500 orders, $0.125 extra), Plus $399/mo (10,000 orders, $0.10 extra), Enterprise from $599 (20,000+). Annual pricing discounted (~10%).

## surfaces
Discount Ninja is fundamentally **multi-surface**: one promotion projects itself across the entire buyer journey (PDP → PLP/collection → cart/drawer → checkout) plus site-wide announcement/notification chrome. Mapped to our internal extension-type allowlist:

- **theme.section** — **confirmed.** The bulk of the storefront presence. Delivered as an **App Embed** ("Discount Ninja" app embed, injects the engine site-wide) plus discrete **theme app blocks**: `Product Page Banner`, `Product Price` (Q1 2025), `Promotion Summary` (cart), `Promo Code Field` (cart). Additional widgets injected via code edits where app-block placement is unsupported: `Announcement Bar` (site-wide), `Notification` (site-wide toast), `Offer Rules Popup`, `Promotional Badge` (collection/PLP/search/related), `Collection Price`, `Item Price`, `Line Price`, `Cart Subtotal`, `Gift With Purchase` block. Shows: strikethrough/discounted prices, savings text, "you saved / add X more to unlock" messaging, badges, tier progress, GWP add-to-cart.
- **functions.discountRules** — **confirmed.** "Unlocks the power of Shopify Functions for a scalable and native experience." Order-level and product-level discount Functions apply the actual price reduction at checkout (entitlement levels `product` / `order` / `shipping`). Constraint: limited to Shopify's ~2 discount-function cap; cannot co-exist with Shopify automatic discounts.
- **functions.deliveryCustomization** — (inferred → **confirmed** for the discount half.) Free-shipping / percentage-shipping / fixed-amount-shipping discounts run as a shipping-level discount Function (`entitlement.level = "shipping"`). Markets-aware (exchange rates, rounding). It discounts rates rather than reordering/renaming them, so this is discount-Function-shaped delivery logic.
- **functions.cartTransform** — (inferred.) BOGO / GWP add free-gift and entitled line items into the cart; docs reference hidden line-item properties for BOGO/GWP products and `entitledItems` sets. Whether implemented as cart-transform vs. JS cart mutation + discount Function is not fully documented, but the behavior (inject/modify lines) is cart-transform-shaped.
- **proxy.widget** — **confirmed (mechanism).** Discount links carry a `?token=ABCD` that triggers a private/hidden promotion; the engine resolves tokens and active-promotion state server-side (app proxy / storefront API calls), then the theme JS renders. Emits custom events (`la:dn:cart:updated`, `la:dn:product:discount:calculated`, etc.).
- **analytics.pixel** — (inferred.) Real-time reporting on AOV/uplift implies event capture; no dedicated Web Pixel extension is documented by name, so treat as app-side analytics rather than a Shopify pixel extension.
- **checkout.block / checkout.upsell / postPurchase.offer** — **not used (confirmed exclusion).** Docs explicitly state incompatibility with apps that add/remove products at checkout via Checkout UI extensions; DN pushes discounting into Functions and keeps merchandising on the online store, NOT in checkout UI. No post-purchase offer surface.
- **pos.extension / customerAccount.blocks / admin.block / admin.action / flow.automation** — **not used** (no evidence). All promotion authoring lives in the app's own embedded admin, not as admin action/block extensions.

**How surfaces coordinate (confirmed):** Shared promotion state is computed by the engine and broadcast to every widget via a client-side event bus and conditional CSS classes (`limoniapps-discountninja-whenproductdiscounted-show/hide`, `-whenactivepromotions-`, `-whenpromotionsincart-`). A single promotion's price rule simultaneously: (a) rewrites PDP/PLP prices with strikethrough, (b) shows a product banner + badge, (c) drives the cart Promotion Summary + tier-progress messaging, (d) is enforced for real at checkout by the discount Function. The token/handoff from a shareable link or promo-code field flips the same shared state on. This cross-surface consistency (storefront display ↔ Function enforcement) is the app's core value and its main failure mode (drift between the two).

## functional_model
Core hierarchy (confirmed from engine docs + object model):

```
Promotion = {
  token, name, schedule{start,end},
  trigger,            // one trigger governs ALL offers in the promotion
  offers[],           // 1..N offers
  stackingRules,
  widgets[]           // presentation bindings
}

Trigger = {
  type: "automatic" | "shareable_link" | "promotion_code",
  code?: string,                 // for promotion_code
  linkToken?: string,            // for shareable_link (?token=…)
  audience: { guests: bool, signedIn: bool, customerTags: [string] },
  geo: { includeCountries: [iso], excludeCountries: [iso] },
  referrers?: [string]           // e.g. facebook-only
}

Offer = {
  template,                      // one of the offer templates below
  prerequisite: {                // what the buyer must do
    prerequisiteItems[],         // products/collections/variants
    quantity? | subtotal?,       // qty-break vs spend-based
    tiers[]?                     // up to 5 tiers
  },
  entitlement: {                 // what they get (== our price rule)
    type: "gift" | "percentage" | "fixed_amount" | "fixed_price",
    level: "product" | "order" | "shipping",
    amount,
    target: { products, collections, variants, allProducts, shipping },
    entitledItems: { quantity, claimed, sets[], lineItems[] }
  }
}
```

Concrete relationships: **Promotion 1—1 Trigger**, **Promotion 1—N Offer**, each **Offer 1—1 entitlement (price rule) + 1 prerequisite**, **Promotion N—N Widget** (a widget renders whatever offers are live). Tokens link a Promotion to storefront activation. `EntitlementInfo.source` = `"app" | "native"` distinguishes DN Functions vs. a redeemed native Shopify code.

## settings_taxonomy
Merchant-facing controls, grouped. Knob names are the actual UI/engine vocabulary where confirmed; types in brackets. This is the vocabulary the recipe system must cover.

### content
- **Offer template** [select] — one of: Percentage Discount, Fixed Amount Discount, Fixed Price, Volume Discounts (quantity break), Spend-to-Save Tiers (buy-more-save-more, up to 5 tiers), Auto Free Gift (GWP), Choose Your Gift, Cross-Sell Discount, Mix-and-Match BOGO, Multi-Tier BOGO, Percentage Shipping Discount, Fixed Amount Shipping Discount; *coming:* Strict Match BOGO, Bundle Discounts — **confirmed**
- **Promotion name** [text] — **confirmed**
- **Announcement bar message(s)** [text, rotating list] — multi-message with next/prev/highlight controls — **confirmed**
- **Notification / toast text** [text] — "you saved…", "gift unlocked" — **confirmed**
- **Product banner text** [text] — PDP promo message — **confirmed**
- **Promotion Summary labels** [text] — savings text, discount line labels, "add X more to unlock" progress copy — **confirmed**
- **Promo code field placeholder / apply-button label** [text] — **confirmed**
- **Promotional badge label** [text] — e.g. "SALE", "-25%" — **confirmed**
- **Offer Rules popup body** [text/rich] — explains conditions — **confirmed**
- **Localized strings** [text per locale] — localization is a first-class widget guiding principle — **confirmed**

### style
- **Widget style / CSS** [style-override + color/typography per widget] — each widget has a dedicated style article; badges, banners, summary, promo field are themeable — **confirmed** (granular knob names not fully enumerated publicly → (inferred): color, background, border, font-size, badge shape/position)
- **Strikethrough (compare-at) price display** [toggle + placement] — rewrites PDP/PLP/cart prices with struck original + discounted price; requires vendor-assisted theme setup — **confirmed**
- **Badge position / shape** [select] — on PLP/PDP cards — (inferred)
- **Announcement bar placement & rotation** [position select + interval] — **confirmed** (start/stop/next/prev events)
- **Promotion Summary placement** [app-block position in cart template] — **confirmed** (theme-dependent)
- **Cart/drawer rendering targets** [selectors] — code-edit hooks for cart root, cart item, subtotal, line price — **confirmed**

### targeting
- **Trigger type** [select: automatic rule / shareable link / promotion code] — **confirmed**
- **Promotion code** [text] — custom code entered in DN promo field (also redeems native Shopify codes) — **confirmed**
- **Shareable link token** [generated] — private/secret deal URL `?token=` — **confirmed**
- **Audience: guests / signed-in / both** [select] — **confirmed**
- **Customer tag filter** [tag-picker] — restrict to tagged customers (VIP) — **confirmed**
- **Geotargeting: include / exclude countries** [multi-country-picker] — **confirmed**
- **Referrer restriction** [text, e.g. facebook-only] — **confirmed**
- **Prerequisite products/collections/variants** [product-picker / collection-picker / variant-picker] — the "buy X" set — **confirmed**
- **Entitlement target: products / collections / variants / all products / shipping** [picker + allProducts toggle] — the "get Y" set — **confirmed**
- **Exclusions** [collection-picker / product filter] — exclude collections or already-discounted products — **confirmed**

### behavior
- **Prerequisite type: quantity break vs. subtotal threshold** [select + number] — **confirmed**
- **Tiers** [rule-builder, up to 5 rows of {threshold → discount}] — Volume & Spend-to-Save — **confirmed**
- **Entitlement level: product / order / shipping** [select] — **confirmed**
- **Entitlement value type: percentage / fixed_amount / fixed_price / gift** [select] — **confirmed**
- **Entitled quantity / claimed limit** [number] — how many gift/BOGO items — **confirmed**
- **Stacking rules** [rule-builder / toggles] — combine & stack multiple offers; controls which offers may co-apply — **confirmed**
- **Schedule: start / stop datetime** [datetime, automatic] — **confirmed**
- **Usage / redemption limits** [number] — (inferred, standard for the category)
- **Combine with native Shopify discount codes** [toggle] — DN promo field accepts Shopify codes — **confirmed**
- **Show/hide conditions** [conditional classes] — whenProductDiscounted / whenActivePromotions / whenPromotionsInCart — **confirmed**

### data
- **Reporting / analytics dashboard** [read-only, real-time AOV & uplift] — **confirmed**
- **Discount link generation & tracking** [generated tokens, per-link] — **confirmed**
- **Import/redeem external codes** [Klaviyo, LoyaltyLion, Smile.io, Swell generated codes redeemable in DN field] — **confirmed**

## data_model
What it persists and where (confirmed unless noted):
- **App-side database (external to Shopify)** — Promotions, Offers, Triggers, price rules, tiers, audience/geo config, discount-link tokens, redemption/usage counters, schedules, analytics events. The `?token=` link resolution and per-store config imply a vendor-hosted DB (Ninja Commerce backend). (Storage engine not publicly documented → (inferred) it is the vendor's own DB, not Shopify metafields for the primary model.)
- **Shopify Functions (owned by the app)** — the actual discount logic deployed as product/order/shipping discount Functions; configuration flows from the app DB into Function input.
- **Shopify native discount objects** — the app can also drive/redeem native automatic or code discounts (`source: "native"`), coexisting up to the 2-function limit.
- **Theme assets** — app embed block + theme app blocks + code-edit snippets persisted in the merchant's theme (this is the theme-update fragility surface).
- **Line-item properties** — hidden props on BOGO/GWP line items to mark entitled/free items in the cart.
- **CDN** — vanilla-JS widget runtime and assets served from vendor CDN; badge/gift imagery via Shopify CDN. (inferred)
- No POS/customer-account persistence.

## visual_patterns
- **Layout archetypes:** site-wide announcement bar (rotating banner); PDP promo banner + inline strikethrough price + badge; PLP/collection badges + struck prices on cards; cart/drawer **Promotion Summary** card (line-item savings, order-level savings, "add $X more to unlock next tier" progress, applied-promotion list); dedicated **Promo Code Field** row; **Offer Rules popup** modal; toast **Notification**; **Gift With Purchase** selector block.
- **Component states:** default / discount-active (struck original + red discounted) / tier-locked vs tier-unlocked (progress toward threshold) / gift-available vs gift-claimed / code-empty vs code-applied vs code-invalid (error messages) / promotion-in-cart vs none. Conditional show/hide driven by shared-state CSS classes.
- **Motion/interaction:** announcement-bar auto-rotation (next/prev/highlight); live cart recalculation on add/remove (event-driven, no reload) via `la:dn:cart:updated`; drawer-open recompute (`la:dn:drawer:cart:opened`); variant-change price refresh (`la:dn:variant:changed`); popup open/close; badge/price fade-in on discount calculation. Vanilla JS, minimal bundle, accessibility + localization are stated guiding principles.

## reviews_signal
**Top praises (confirmed):**
1. Handles complex promotion logic other apps can't (dynamic pricing, BOGO, tiered, stacking) — the "does exactly what we need after testing every GWP app" story.
2. Responsive, professional, knowledgeable support (named reps praised, e.g. "Jaypee"); helps with complex setup.
3. Reliable at high volume / peak seasons when configured correctly.
4. Intuitive to operate once set up; simplifies ongoing promotion management.
5. Active development — ships requested features, listens to feedback.

**Top complaints (confirmed):**
1. **Theme-update breakage** — the #1 recurring pain; Shopify theme updates break the widgets/strikethrough and cause revenue loss (direct fallout of persisting code in the theme + storefront/Function drift).
2. **Slow / gated support at crunch time** — a "3-day rule" for assistance (up to ~5 days incl. weekends); "slow when we actually need them," contradicting 24/7 claims.
3. **Setup complexity + extra cost** — strikethrough/technical bits often need vendor or developer implementation; steep learning curve.
4. **Edge-case promotion math** — specific patterns like "2 for $12" / third-item pricing miscalculate; some logic not customizable enough.
5. **Occasionally glitchy admin UI / dashboard instability.**

## mapping_note
**Where it fits our RecipeSpec vocabulary:** A single Discount Ninja *offer* maps cleanly onto one constrained recipe emitting a `theme.section` (banner/badge/summary/promo-field) plus a `functions.discountRules` (and `functions.deliveryCustomization` for shipping) module — the offer-template → prerequisite → entitlement structure is exactly a targeting + behavior + content spec.

**Where it EXCEEDS a single-module recipe (the gap):**
1. **Cross-surface blueprint with shared state.** One promotion must simultaneously emit and *keep consistent* PDP price rewrite, PLP badge, cart Promotion Summary, promo-code field, announcement bar, AND the checkout-enforcing discount Function. That is a coordinated multi-module blueprint bound by shared runtime state and an event bus — not one section. Display-vs-enforcement consistency is a hard invariant a lone module can't guarantee.
2. **A rule engine, not static settings.** Trigger (automatic/link/code) × audience/tag/geo/referrer targeting × up-to-5-tier prerequisites × stacking rules is a real conditional evaluation engine that must run per cart at request time — beyond declarative recipe knobs.
3. **A persistent external data store + code lifecycle.** Promotions, tokens, tier config, redemption counters, schedules, and analytics live in a vendor DB and generate/redeem discount codes and shareable `?token=` links — stateful, not stored in a static module.
4. **Background jobs / scheduling + external side-effects.** Scheduled auto start/stop, real-time AOV analytics, and redeeming codes minted by third parties (Klaviyo/LoyaltyLion/Smile.io/Swell) require background processing and cross-app integrations no single-surface recipe covers.
