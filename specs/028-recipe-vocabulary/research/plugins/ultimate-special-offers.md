# USO: Ultimate Special Offers (Orbit)

> Vendor/naming note: This is **Orbit's** Ultimate Special Offers (formerly **Pixel Union Apps**), NOT Bold's. Bold ships a similarly-named "Bold Discounts / Bold Sales & Discounts" app; they are distinct products from different vendors. The prompt's "common for some Bold apps" caveat does not apply here — Orbit's USO is live, actively maintained, and was rebuilt on a new stack (legacy billing plans and the "Advanced Analytics" earliest-data date of 2024-10-16 confirm a recent re-platform). No merge/deprecation. (confirmed)

## identity
- **name**: USO: Ultimate Special Offers (marketed as "Ultimate Special Offers") (confirmed)
- **vendor**: Orbit (orbitapps.com; formerly Pixel Union Apps; portfolio incl. Wholesale Club, Pixelpop, Bizzy Social Proof) (confirmed)
- **category**: Discounts (under Marketing and conversion) (confirmed)
- **App Store URL**: https://apps.shopify.com/special-offers (confirmed)
- **rating**: 4.5 / 5 (confirmed)
- **review count**: 397 reviews; distribution ~81% 5-star (321), ~9% 1-star (35) (confirmed)
- **install signal**: No public install count on listing; Orbit states its apps collectively power 23,000+ Shopify stores (vendor-level, not app-specific) (confirmed / (inferred) for app-specific share)
- **pricing model**: Freemium + usage-based. **Free** ($0/mo): 10 orders-with-discounts-or-upsells per month, all 9 offer types, all features, chat/email support. **Ultimate** ($9/mo): 1% usage fee on orders with discounts/upsells (capped $10/order), all features, 14-day free trial. "Premium/Advanced Analytics" tier gates the analytics dashboard. Legacy billing plans exist for grandfathered merchants. All charges USD, billed per 30 days. (confirmed)

## surfaces
Orbit USO is **multi-surface** and coordinates through one server-side offer engine that recomputes cart pricing whenever the online-store cart changes.

- **theme.section** (theme app embed / app blocks) — confirmed. Renders sale **badges** on product cards, product pages, and collection pages; injects the **notification/initial message** on product & collection pages, the **success/progress message** and **cart popup** on the cart page, plus **announcement/banner bars** and **pop-ups**. This is the primary storefront surface.
- **functions.cartTransform / functions.discountRules** — (inferred, mechanism partly confirmed). The app applies discounts by operating on the **cart page** ("relies on the cart page"), recomputing line prices/adding gift lines and carrying a **single synthesized discount into checkout**. Docs never name Shopify Functions; behavior reads as cart-page price transformation + generated discount code rather than a native discount Function. Modern USO likely uses cart-transform-style application, but the vendor doc language is cart-page-centric. (mechanism confirmed; exact API (inferred))
- **checkout.upsell** — confirmed. "Checkout upsell."
- **postPurchase.offer** — confirmed. "Post-Purchase Upsell" = one-click add-to-order embedded at checkout/after purchase; also "thank you page upsell."
- **pos.extension** — confirmed. Dedicated **Ultimate Special Offers POS tile** (Add tile → App → Ultimate Special Offers). POS discounts are **manually applied** by tapping the tile (green confirmation banner), unlike auto-apply online. Offer must have the POS sales channel box checked.
- **admin.block** — confirmed. Full embedded admin app: offer list, offer editor, appearance/badge settings, analytics dashboard.
- **analytics.pixel** — (inferred). Analytics attribute sales/AOV per offer and per customer tag with up-to-24h latency; implies order-webhook/attribution capture rather than a client pixel, but conversion tracking is a pixel-adjacent capability.
- **customerAccount.blocks** — partial (inferred). Offers can be gated to logged-in customers / customer-account-only visibility, but rendering is storefront-side, not a dedicated customer-account UI extension.

**Coordination**: single source of truth is the server-side **Offer** record set. Storefront theme embed reads active offers → renders badges/messages/popup; on cart change it calls the app to recompute; the app produces one combined discount (optionally merged with a native code) that hands off into checkout. POS reads the same offers but requires manual tile activation. Dynamic checkout buttons (Shop Pay / Apple Pay / PayPal) **bypass the cart page and therefore break offer application** — a documented cross-surface fragility. (confirmed)

## functional_model
Core entity is the **Offer**, one of 9 discriminated types sharing common targeting/scheduling/display fields.

```
Offer = {
  id, name, enabled: bool,
  type: BOGO | Discount | Bulk | Volume | Bundle | FreeGift | Goal | Upsell | PostPurchaseUpsell,
  trigger: { products[], variants[], collections[] },      // "what must be in cart"
  triggerQuantity: number,                                  // min qty to activate
  reward: {                                                 // "what gets discounted / added"
    products[]|variants[]|collections[],
    discountKind: "new_price" | "percentage" | "amount",
    discountValue: number
  },
  offerLimit: number|null,                                  // max redemptions per order
  display: {
    saleBadges: bool,
    cartPopup: bool,
    messages: { initial, progress, success }               // storefront copy per state
  },
  availability: {
    salesChannels: ["online_store","pos"],
    schedule: { startAt, endAt } | null,
    customerAccountRequired: bool,
    customerTags[]: string,                                 // segment gating (VIP)
    uniqueOfferLink: url|null
  }
}
```

Relationships (confirmed):
- Offer 1—* trigger products/collections; Offer 1—* reward products/collections (BOGO/gift split trigger vs reward; Discount/Bulk collapse them).
- Volume/Bulk introduce a **tier**: `tier = { minQuantity, discountKind, discountValue }` (Volume = multiple tiers with increasing discounts; Bulk = single min-qty tier). (confirmed for Bulk single-tier; Volume multi-tier confirmed conceptually)
- FreeGift/Goal introduce a **threshold**: `threshold = { cartAmount, reward }` (gift added or discount unlocked when cart hits target). (confirmed)
- Combined discount: `synthesizedCode = offerDiscount (+ optional customerEnteredCode)` → one code into checkout. (confirmed)
- Analytics row per offer: `{ offerRef, totalSales, totalOrders, totalOrderValue, AOV, salesByCustomerTag, dateRange }`. (confirmed)

## settings_taxonomy

### content
- **Name** — text (required to save). (confirmed)
- **Initial / Notification message** — text, shown on product & collection pages. (confirmed)
- **Progress message** — text, shown as customer moves toward BOGO/goal completion. (confirmed, BOGO)
- **Success message** — text, shown on cart page once offer qualifies. (confirmed)
- **Banner / announcement bar copy** — text. (confirmed)
- **Pop-up content** — text/media (limited customization per reviews). (confirmed feature; depth (inferred))
- **Unique offer link** — text/url, private shareable offer URL. (confirmed)

### style
- **Sale badges** — toggle (on/off per offer). (confirmed)
- **Badge placement** — select (where badge appears in store). (confirmed)
- **Badge text color** — color. (confirmed)
- **Badge shape** — select (shape variations). (confirmed)
- **Appearance settings** — global theme-integration/appearance panel ("Changing your Appearance settings" article). (confirmed as a settings area; individual knobs (inferred): colors, badge styling, message styling)
- **Cart popup** — toggle (show offer popup on cart). (confirmed)

### targeting
- **Trigger product/variant/collection selector** — product-picker (single product, multiple products individually, collections, or specific variants). (confirmed)
- **Reward/"Offer" product selector** — product-picker (product, collection, or variant to discount/give). (confirmed)
- **Trigger quantity** — number (min items to activate). (confirmed)
- **Minimum quantity** (Bulk/Volume) — number. (confirmed)
- **Goal / gift threshold amount** — number (cart $ target to unlock discount or free gift). (confirmed)
- **Sales channel** — multi-select checkbox (Online Store, POS). (confirmed)
- **Customer account required** — toggle ("visible only to folks signed into their account"). (confirmed)
- **Customer eligibility by tag** — text/tag-input (segment/VIP gating). (confirmed)
- **250-variant limit** — hard constraint on any product used as trigger/target. (confirmed)

### behavior
- **Enabled/Disabled** — toggle per offer. (confirmed)
- **Choose discount / Discount type** — select[ New price | Discount percentage | Discount amount ]. (confirmed)
- **Discount value** — number (percent, dollar, or replacement price). (confirmed)
- **Offer limit** — number/toggle (max redemptions per order). (confirmed)
- **Schedule (Availability)** — date-time range (start/end; "set and forget" auto end). (confirmed)
- **Discount-code combining** — toggle: enable customers to stack a native Shopify code on top of an offer. (confirmed)
- **Combine order-of-operations** — select: apply code **before** or **after** the offer. (confirmed)
- **Replace vs combine** — toggle: entered code can replace rather than stack. (confirmed)
- **Pricing hierarchy** (BOGO) — fixed, non-editable order in which the app decides which items get discounted. (confirmed)
- Constraint: only simple % / fixed-amount codes combinable; automatic discounts, BXGY, free-shipping, and usage-limited codes cannot combine. (confirmed)

### data
- **Advanced Analytics dashboard** — read surface (Premium tier). Metrics: **total order value, total sales, total orders, AOV, total sales/orders by customer tag**. Date filter (default last 30 days; earliest 2024-10-16; up-to-24h latency). **Export to PDF**. Compare up to 3 offers at once. (confirmed)
- **30-day historical window** on the standard analytics view. (confirmed)

## data_model
- **External app DB (Orbit-hosted)**: Offer records (all fields above), schedules, appearance/badge config, per-store settings, combine settings — persisted app-side, NOT as native Shopify price rules. Storefront reads them via app embed/API. (inferred, strongly implied — offers are not native Shopify discounts)
- **Synthesized Shopify discount code**: for the combine-with-code path, the app creates a new merged discount code carried into checkout (one code = one Shopify discount slot). (confirmed)
- **Order/analytics store**: aggregated order attribution keyed by offer and customer tag, populated from order events (up-to-24h latency, retained ≥ from 2024-10-16). (confirmed metrics; storage location (inferred))
- **Customer tags**: reads native Shopify customer tags for segment gating (not stored by app). (confirmed)
- **Media/CDN**: pop-up / gift imagery served via Shopify/app CDN. (inferred)
- No metaobjects/metafields explicitly documented as the persistence layer. (unknown — likely app DB not metaobjects)

## visual_patterns
- **Layout archetypes**: (1) product/collection **badge** overlay on product imagery; (2) **cart-page callout** — success message + progress bar + optional popup; (3) **announcement/banner bar** site-wide; (4) **checkout upsell** card + **post-purchase / thank-you one-click add** card; (5) **admin offer-list table** → **offer editor form** (targeting → discount → messages → availability); (6) **analytics dashboard** with metric tiles + date filter + PDF export; (7) **POS tile** button. (confirmed)
- **Component states** (BOGO/goal are stateful): **initial → progress → success** messaging tied to how close the cart is to qualifying; badge on/off; offer enabled/disabled; scheduled (pending/active/expired). (confirmed)
- **Motion/interaction**: cart-change → live re-evaluation and price update on the cart page; popup appears on qualification; POS uses tap-to-apply with green confirmation banner; storefront preview via eye-icon in editor. Minimal decorative motion — utility-first. (confirmed)

## reviews_signal
**Praises** (confirmed):
1. Versatility — 9 offer types, multiple concurrent promotions "surpassing Shopify's native features"; BOGO + tiered discounts called game-changers.
2. Support quality — repeatedly "second to none," "very patient," "quick to respond," fixes "in double quick time," proactively does theme/compatibility fixes.
3. Ease of setup / revision — easy to configure and to update when product line changes.
4. Theme integration — clean storefront fit; support resolves theme compatibility fast.
5. Reliable execution of scheduled sales ("set and forget").

**Complaints** (confirmed / (inferred)):
1. Limited customization on **pop-ups** (merchant wanted more control). (confirmed)
2. Missing offer logic — e.g. "up-to" discounts not supported. (confirmed)
3. Dynamic/express checkout (Shop Pay/Apple Pay/PayPal) **bypasses cart → offers don't apply**; requires disabling those buttons — a real conversion tradeoff. (confirmed limitation; framed as complaint (inferred))
4. Combine/stacking restrictions — only simple codes combine; automatic/BXGY/free-shipping/usage-limited codes can't; recommended max ~2 simultaneous offers for performance. (confirmed as friction)
5. Scattered 1–2★ reports of occasional technical/compatibility breakage (details vague). (confirmed pattern)

## mapping_note
Maps cleanly onto a **discounts-family RecipeSpec** for the storefront-visible parts (badge + message + cart popup = `theme.section`; a percentage/amount/new-price rule = `functions.discountRules`/`cartTransform`; checkout and post-purchase upsells = `checkout.upsell` + `postPurchase.offer`). A *single* offer like "Discount" or "Bulk" is close to a one-module recipe.

Where it **EXCEEDS a single-module recipe**:
- **Persistent multi-entity offer store + rule engine**: 9 discriminated offer types with shared targeting/threshold/tier/schedule schema, evaluated live against cart state, with a fixed discount-precedence hierarchy — this is a stateful rule engine + data store, not a static rendered module.
- **Cross-surface blueprint with shared state**: one Offer must simultaneously drive a theme badge/message, a cart-page recompute, a checkout/post-purchase upsell, a POS tile, and an analytics row — coordinated handoff across ≥5 surfaces, exceeding any single extension.
- **External side-effect: discount synthesis at checkout**: merging an app offer with a customer-entered native code into one generated Shopify discount code (with before/after/replace ordering) is a real mutation into Shopify's discount system, not module rendering.
- **Background attribution / analytics pipeline**: per-offer and per-customer-tag revenue/AOV aggregation with up-to-24h latency and PDF export implies an ingestion/job pipeline and its own analytics dataset — outside a rendered recipe.
- **Scheduling + segmentation**: time-boxed activation (start/end, auto-expire) and tag/account-gated eligibility require server-side scheduling and customer-segment evaluation, i.e. background jobs + audience logic.
