# SURFACE × CAPABILITY Matrix

> Synthesis of the 58 plugin research records in
> `specs/028-recipe-vocabulary/research/plugins/` against our declared extension
> surfaces, cross-checked with `packages/core/src/extension-eligibility.ts`.
>
> **Rows** = plugin archetypes (the market categories the corpus clusters into).
> **Columns** = our extension-surface vocabulary.
> A cell is marked when at least one app in that archetype *requires* the surface
> as a **rendered/enforced runtime surface** (not merely as its own embedded-admin
> config UI, and not a "NOT used" line in the record).
>
> Legend:
> - `●` core / defining surface for the archetype (most apps use it, product breaks without it)
> - `○` common but optional (some apps use it, often Plus-gated or a secondary funnel stage)
> - `�syn` the *behavior* occupies this surface's role but is delivered by a legacy
>   mechanism (draft orders, hidden variants, companion line items, generated
>   discount codes) **instead of** the native Shopify runtime — a "shadow" surface
> - blank = not used by the archetype
>
> `admin.block`/`admin.action` is marked `●` almost everywhere because every app
> has an embedded admin config plane; that is analytically uninteresting, so it is
> shown but de-emphasized. The signal is in the *storefront/checkout/function/POS*
> columns.

---

## The matrix

Columns abbreviated: TS=`theme.section` · PW=`proxy.widget` · fCT=`functions.cartTransform` · fDR=`functions.discountRules` · fDC=`functions.deliveryCustomization` · fPC=`functions.paymentCustomization` · cUp=`checkout.upsell` · cBl=`checkout.block` · pPO=`postPurchase.offer` · aBl=`admin.block` · aAc=`admin.action` · POS=`pos.extension` · CAB=`customerAccount.blocks` · AX=`analytics.pixel` · FL=`flow.automation`

| Archetype (apps) | TS | PW | fCT | fDR | fDC | fPC | cUp | cBl | pPO | aBl | aAc | POS | CAB | AX | FL |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **reviews** (judge-me, yotpo-reviews, loox, okendo, stamped, fera, growave*) | ● | ● | | | | | ○ | ○ | ○ | ● | | ○ | ○ | ○ | ● |
| **upsell / cross-sell** (rebuy, bold-upsell, candy-rack, honeycomb-upsell, selleasy, foxkit, reconvert, zipify-ocu) | ● | ● | ▸ | ▸ | | | ● | ○ | ● | ● | | | ○ | ● | ○ |
| **bundle** (bundler, bold-bundles, fast-bundle, kaching-bundles, moon-bundles, wide-bundles, kickflip†) | ● | ○ | ●/�syn | ●/�syn | ○ | | ○ | | ○ | ● | | ○ | | ○ | |
| **cart-drawer / smart-cart** (upcart, slide-cart-corner, rebuy smart-cart) | ● | ○ | ●/▸ | ● | | | ○ | | | ● | | | | ● | ○ |
| **loyalty / rewards** (smile-io, loyaltylion, rivo, bon-loyalty, growave, okendo-loyalty, stamped-loyalty) | ● | ● | | ▸ | | | ○ | ● | ○ | ● | | ● | ● | ○ | ● |
| **popup / email / SMS / push** (klaviyo, omnisend, privy, justuno, pushowl, provesource) | ● | ● | | | | | ○ | ○ | | ● | | | ○ | ● | ● |
| **subscription** (recharge, appstle, loop, seal, bold-subscriptions, bold-memberships†) | ● | ○ | | ▸ | | | ● | ● | | ● | ● | ○ | ● | ○ | ● |
| **wishlist** (swym-wishlist-plus, growave-wishlist) | ● | ● | | | | | | | | ● | | ● | ● | ○ | ● |
| **discount / promo** (discount-ninja, bold-discounts, hextom-usb, ultimate-special-offers, bold-custom-pricing) | ● | ○ | ○/▸ | ●/▸ | ○ | | ○ | ○ | ○ | ● | | ○ | | ○ | ○ |
| **product-options / customizer** (bold-product-options, globo, hulk-infinite-options, kickflip) | ● | ● | ▸ | | | | | | | ● | ○ | ○ | | | |
| **back-in-stock** (appikon-notify-me) | ● | | | | | | | | | ● | | | | ○ | ● |
| **search / discovery** (boost-ai-search, shopify-search-discovery) | ● | ● | | | | | | | | ● | ○ | | | ○ | ○ |
| **social-proof / urgency** (provesource, hextom-countdown, hextom-usb, fera-badges) | ● | ● | | | | | | ○ | | ● | | | | ● | |
| **shipping** (intuitive-shipping) | | | | | ○◆ | | | ◆ | | ● | | | | | |
| **page-builder** (gempages, pagefly) | ● | ○ | | | | | ○ | | ○ | ● | | | | ● | |
| **checkout replacement** (bold-checkout) | | | | ▸ | ▸ | ● | ● | ● | ● | ● | | | | ○ | ○ |

\* growave and stamped and okendo appear in multiple rows because they are unified
review+loyalty+wishlist suites — see the composite section.
† kickflip, bold-memberships listed where their dominant behavior lands.
◆ intuitive-shipping's true surface is Shopify `CarrierService` (a rate provider),
which **has no slot in our vocabulary**; `functions.deliveryCustomization` and
checkout display are the nearest siblings but are explicitly *not* what it uses.
This is a genuine vocabulary gap (see Gaps).

`▸` in fCT/fDR = the app achieves cart-transform / discount behavior through a
**legacy shadow mechanism** (draft orders, hidden/duplicate variants, companion
line items, or generated Shopify discount codes) rather than a native Function.
The market intent maps onto our Function types, but almost none of the corpus
actually ships a Rust/wasm Function — see "Shadow surfaces" below.

---

## Multi-surface composites (the important rows)

Four archetypes are **irreducibly multi-surface**: they are not "a widget" but a
*coordinated blueprint* where one logical entity (an offer, a contract, a ledger)
is authored on one surface, rendered on several, and driven forward by background
jobs. These are exactly the `platform.extensionBlueprint` cases, and the research
records are unanimous that the coordination — not any single surface — is the
product.

### 1. Bundler / bundle (bundler, fast-bundle, kaching-bundles, moon-bundles, wide-bundles)
- **Surfaces:** `theme.section` (product-page bundle widget) + `functions.cartTransform` (expand a "Bundle-As-A-Product" placeholder into real component lines) + `functions.discountRules` (tier/BOGO/volume pricing that survives to checkout) + often `postPurchase.offer` / `checkout.upsell` + `analytics.pixel` (revenue attribution to the bundle).
- **Shared state / coordination:** one server-side **Deal/Bundle record** (products + rule + display config) is the source of truth. Handoff chain: theme block reads the deal → shopper selects tier → **cart-transform Function expands lines** → **discount Function prices them** → pixel attributes revenue back to the deal. The theme widget writes *cart signals* (line-item properties / cart attributes / a hidden BAP variant) that the Function **reads at checkout** — the storefront→Function handoff via cart state is the defining coordination.
- **Coordination need:** the theme widget and the two Functions must agree on the *same* bundle identity and pricing, or display drifts from enforcement (the classic failure mode). Requires: shared config record + cart-signal contract + deterministic Function that reproduces the widget's computed price.
- **Kaching, fast-bundle, moon-bundles** use real Functions; **bundler, bold-bundles, wide-bundles(discount-mode), selleasy** use the `▸` shadow path (draft orders / hidden variants).

### 2. Smart-cart / cart-drawer (upcart, slide-cart-corner, rebuy smart-cart)
- **Surfaces:** `theme.section`/app-embed (the drawer replaces the native cart) + `functions.discountRules` (+ `functions.cartTransform` for free-gift lines with real inventory) + `analytics.pixel` (cart-event instrumentation) + in-drawer upsell widgets.
- **Shared state / coordination:** the **live Shopify cart** (line items + attributes) is the shared state — there is no separate offer store. The drawer hosts every module (progress bar, upsells, add-ons, rewards); a threshold-driven engine reads cart total/count and toggles discounts. slide-cart-corner is the cleanest: "Powered By Functions" gives *any* inventory product as a free gift via cart-transform + discount Function, vs upcart's `▸` handoff to native Shopify automatic discounts.
- **Coordination need:** cross-module reactivity within one surface — adding an upsell mutates the cart, which re-computes reward progress, which may auto-add/remove a gift line. A shared client-side event bus (`window.corner`, Rebuy JS) + a Function that honors the drawer's computed rewards through to checkout.

### 3. Loyalty / rewards (smile-io, loyaltylion, rivo, bon-loyalty, growave, okendo, stamped)
- **Surfaces:** the widest fan-out in the corpus — `theme.section`/`proxy.widget` (floating launcher + loyalty page) + `customerAccount.blocks` (points in new customer accounts) + `checkout.block`/`checkout.upsell` (redeem points at checkout, **Plus-gated**) + `pos.extension` (earn/redeem in-store) + `flow.automation` (points events as Flow triggers) + `functions.discountRules` (`▸` almost always a **generated Shopify discount code**, not a Function).
- **Shared state / coordination:** ONE **hosted points ledger per Shopify customer** is the hub; every surface is a read/write *view* over it. Earning anywhere credits the balance; redeeming anywhere mints a discount code applied at checkout. Tier changes recompute server-side and propagate; VIP tier often writes back to **Shopify customer tags** (a cross-surface side effect into the merchant's own data that then drives Flow/email segmentation).
- **Coordination need:** hub-and-spoke — one authoritative backend ledger keyed to `customer_id`, thin surface views, and an eventing path (order webhook → accrual → balance reflected everywhere). Redemption must mint a real Shopify discount the checkout honors. This is the archetype most under-served by "one surface per module."

### 4. Subscriptions (recharge, appstle, loop, seal, bold-subscriptions)
- **Surfaces:** `theme.section` (Subscribe-&-Save selling-plan widget on PDP) + `customerAccount.blocks` + `proxy.widget` (magic-link hosted customer portal) + `checkout.block`/`checkout.upsell` (mixed-cart, requires Checkout Extensibility) + `flow.automation` (own dunning/cancellation-prevention engine **plus** Shopify Flow) + `pos.extension` + `admin.block`/`admin.action`.
- **Shared state / coordination:** the **Subscription Contract** (Shopify contract + selling-plan group, mirrored to the app's backend) is the shared spine. PDP widget writes the selling-plan selection → checkout persists a contract → customer portal AND merchant admin both mutate the *same* contract → **background scheduled jobs** (dunning, prepaid order generation, win-back, cancellation-prevention offers) drive it forward → analytics aggregates. No single surface owns state; it is authored by storefront, edited by both customer and merchant, advanced by cron.
- **Coordination need:** durable server-side contract state + a scheduler/automation engine (this is where our `flow.automation` "engine never built" reality bites — see Gaps) + customer-account + checkout surfaces all bound to one contract id. The richest blueprint in the corpus.

**Common thread across all four composites:** a **single authoritative record** (deal / cart / ledger / contract) + **multiple thin render surfaces** + a **background/enforcement layer** (Function at checkout, or a scheduled job). Our `platform.extensionBlueprint` composite type is the right shape; what it needs is (a) a shared-state provisioning primitive (metaobject/metafield or app-backend row) that all member surfaces read, and (b) a checkout-time enforcement member (Function) that reproduces what the storefront displayed.

---

## Shadow surfaces (the biggest cross-cutting finding)

A large share of the corpus produces **cart-transform / discount behavior WITHOUT
native Shopify Functions**. They predate Functions and use:
- **draft orders** (bundler, bold-bundles, honeycomb, some bundle apps)
- **hidden / duplicate variants** (bold-bundles variant-mode, wide-bundles variant-mode, bold-custom-pricing V1)
- **companion / hidden line items** (bold-product-options, globo, hulk-infinite-options — priced options)
- **generated Shopify discount codes** (every loyalty app, loox/okendo/fera review incentives, privy/klaviyo/foxkit popup coupons)

Implication for our vocabulary: the *market intent* maps cleanly onto
`functions.cartTransform` / `functions.discountRules`, but a faithful generator
should treat "native Function" vs "shadow mechanism" as an **implementation
strategy**, not a different capability. Our eligibility registry already ships
real `cart-transform-function` and `discount-function` handles, so we can render
the *native* version of what the market fakes — a genuine differentiation, but
only if `runtimeShipped` for those handles is actually in the deployed manifest.

---

## Coverage vs our 22 declared types (extension-eligibility.ts)

Our declared surface (`RECIPE_SPEC_TYPES`) has **22** entries. Mapping market
demand onto them:

### Well-covered (demand ↔ type, runtime shipped)
| Type | Runtime shipped? | Market demand |
|---|---|---|
| `theme.section` | ✅ yes | **Universal.** Every archetype's primary/only render surface. Highest-leverage type by far. |
| `proxy.widget` | ✅ yes | Very high — every hosted-JS widget (reviews, loyalty launcher, search, popups) is really app-served over a theme mount. |
| `admin.block` / `admin.action` | ✅ yes | Universal (every app has an embedded config plane) but usually the app's *own* SPA, not fine-grained admin UI extensions. |
| `checkout.upsell` / `checkout.block` | ✅ yes (Plus) | High — upsell, loyalty-redeem, subscription mixed-cart, review social-proof. Correctly Plus-noted. |
| `postPurchase.offer` | ✅ yes | High in the upsell/bundle rows (rebuy, honeycomb, zipify, reconvert, selleasy). Available on all plans — a real edge. |
| `customerAccount.blocks` | ✅ yes | High for loyalty + subscription + wishlist + reviews. |
| `pos.extension` | ✅ yes | Medium-high for loyalty/subscription/options; usually a listing-level claim, shallow depth. |
| `analytics.pixel` | ✅ yes | Near-universal *behaviorally* (attribution/impression tracking) but rarely a formal Web Pixel extension — most are app-side JS. |
| `functions.cartTransform` / `functions.discountRules` | functions (manifest) | High demand via bundles/cart/loyalty, but mostly as **shadow** mechanisms today (see above). Native = our differentiation. |
| `flow.automation` | ⚠️ `runtimeShipped:false` | High demand, but see gap — most apps mean their *own* scheduler, not Shopify Flow. |

### Over-supply (declared types with little/no market pull in this corpus)
- **`functions.paymentCustomization`** — only bold-checkout (a full checkout *replacement*) touches payment-method reorder/hide. No standalone app in the corpus needs it. Plus-gated, thin demand.
- **`functions.cartAndCheckoutValidation`** — **zero** apps in the corpus. Pure validation/blocking is not a merchandising category anyone sells.
- **`functions.fulfillmentConstraints`** — **zero** apps. Fulfillment-grouping is an ops concern, not an app-store category here.
- **`functions.orderRoutingLocationRule`** — **zero** apps; and per the registry it has *no wasm template* (`needs_runtime`, no handle). Correctly parked.
- **`admin.discountUi`** (Spring 2026) — **zero** apps yet (too new); `runtimeShipped:false`. Speculative but forward-looking; pairs with `functions.discountRules`.
- **`integration.httpSync`** — not an app-store *category*, but the corpus is full of implicit ERP/ESP/webhook sync (klaviyo, omnisend, bold-checkout order-stream, provesource Zapier). So it is over-supply *as a user-facing type* but under-modeled *as plumbing* many composites need.

### Gaps (market demand with no clean slot)
1. **`CarrierService` rate provider** — intuitive-shipping's entire product is a third-party carrier-calculated rate endpoint. `functions.deliveryCustomization` is explicitly the *wrong* mechanism (it only renames/reorders/hides). **No type models "compute and return shipping rates."** Real gap for the whole shipping archetype.
2. **Transactional / marketing email + SMS + web-push as a surface** — klaviyo, omnisend, privy, pushowl, bold-upsell's post-purchase email, back-in-stock alerts, subscription dunning notices. The single most common *action* in the corpus (fan-out messaging) has **no extension-type slot**. bold-upsell's record flags this explicitly. Everything routes it through `flow.automation` as a proxy, which is a poor fit.
3. **Background scheduler / durable jobs** — subscriptions (dunning, prepaid orders), back-in-stock fan-out, loyalty points expiry, review-request sequences, search index sync all need *timed/cron* automation. `flow.automation` is the nearest type but (a) it means Shopify Flow (event hooks), not a scheduler, and (b) per MEMORY + the eligibility file, **the engine was never built** (`runtimeShipped:false`, "durable-wait/DAG engine never implemented"). This is the biggest capability-vs-demand mismatch: many composites *require* a scheduler we don't ship.
4. **Search / merchandising index** — boost-ai-search and shopify-search-discovery need an app-owned search index synced from the catalog + a storefront filter/results renderer. We model the render as `theme.section`, but the **index + sync + Liquid-filter-API integration** has no type. Partial gap.
5. **Native customer-tag / metafield write-back as a first-class effect** — loyalty (VIP tag), bold-memberships (member tag → liquid gating), search (product boost metafields) all rely on writing back to Shopify customer/product data as the cross-surface handoff. It's implicit in `write_metaobjects` scope but not a modeled capability.
6. **"Replacement" surfaces** — bold-checkout (whole checkout) and several cart drawers (upcart, corner) *replace* a native surface rather than inject a block. Our vocabulary is additive-only; a full-takeover is coarsely mapped and under-described.

### Net read
- The **storefront/checkout/customer-account/POS** columns are well-served and correctly Plus-noted — these carry ~80% of real demand and their runtimes ship.
- The **Function** columns are half over-supply (payment/validation/fulfillment/routing = ~zero corpus demand) and half high-demand-but-faked-in-market (cartTransform/discountRules), where shipping the *native* version is our edge — contingent on the deployed-function manifest actually containing the handles.
- The **two real holes** are **messaging (email/SMS/push)** and a **durable scheduler** — both are load-bearing for the loyalty, subscription, popup/email, and back-in-stock archetypes, and `flow.automation` (unbuilt) is standing in for both. Closing these two would unlock the composites more than any additional Function type.
