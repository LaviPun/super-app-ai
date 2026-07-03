# Corner Cart Drawer & Free Gift

> **Rename / identity note (confirmed):** This is the app the study calls "Corner / Slide Cart Drawer." It is **not** deprecated, but it **has been renamed/repositioned several times** on the same App Store URL (`apps.shopify.com/cornercart`). Listing history: it began life as **CornerCart / Corner Cart** (originally a wishlist + cart-sharing / "share your cart" tool), was later positioned as **"Corner Free Gift & Cart Upsell" / in-cart upsells**, and is now titled **"Corner Cart Drawer & Free Gift."** The vendor org is now branded **"Corner: Referrals, Upsell & Rewards"** (the same brand also ships separate referral/rewards apps — it is a suite). The slide-cart drawer studied here is the current, actively-maintained equivalent. **Bold has no involvement** — the maker is Corner (Messengerify Labs, Kochi, India), so the "Bold rename/merge" caveat in the brief does not apply here. What changed over time: from a social cart-sharing/wishlist utility → to an AOV/upsell drawer whose gifting/discounts are now powered by **Shopify Functions** against real inventory.

## identity
- **name:** Corner Cart Drawer & Free Gift (confirmed) — product line branded "Corner" / "CornerCart" (confirmed)
- **vendor:** Corner: Referrals, Upsell & Rewards (confirmed listing vendor) — maker Corner / Messengerify Labs, Kochi IN (confirmed from prior listing history); a multi-app suite (cart drawer + referrals + rewards/store credit + upsell); docs at help.cornercart.io, site cornercart.io
- **category:** Cart customization; also tagged Product bundles (confirmed). Maps to our internal `cart` category (confirmed).
- **App Store URL:** https://apps.shopify.com/cornercart (confirmed)
- **rating:** 4.9 stars (confirmed, as of 2026-07)
- **review count:** ~310 reviews (confirmed)
- **install signal:** Merchant count not shown on the App Store card. Vendor claims "3000+ merchants" across the suite (confirmed as a vendor claim; not a per-app Shopify-verified figure). Launched 2019-11-20 — mature, ~6+ years live (confirmed).
- **pricing model:** Freemium + flat monthly tiers (NOT usage/revenue-share). (confirmed)
  - **Free — $0:** Cart Drawer, Sticky Add to Cart, Floating Mini Cart, email support. No campaigns/automations. (confirmed)
  - **Basic Shopify — $15/mo:** Unlimited campaigns, Free Gift campaigns, Buy X Get Y, urgency timers & announcements, volume discounts, one-click upsell, up to 5,000 orders/mo. 30-day free trial. (confirmed)
  - **Grow / "Shopify Plan" — $29/mo:** Same feature set, higher order/scale ceiling. (confirmed price; ceiling inferred)
  - **Advanced Shopify — $59/mo:** Same features, Plus/high-volume scale. (confirmed price; scale gating inferred)
  - Gating is by ORDER VOLUME + Free-vs-paid campaign access, not feature-per-paid-tier. (inferred)

## surfaces
Corner is **multi-surface**; the cart drawer is the hub and everything else feeds it. Mapped to our allowlist:

- **theme.section** (confirmed) — the primary render target. Installed as a Shopify **App Embed block** (theme app extension) enabled under Online Store → Themes → Customize → App embeds. Renders three storefront widgets:
  - **Slide Cart Drawer** — the slide-out cart panel (overrides the theme's native cart): line items, progress bar, upsells, discount field, notes, checkout CTA.
  - **Sticky Add-to-Cart bar** — persistent bar on product/home/custom pages.
  - **Floating Mini Cart** — floating cart bubble/button.
- **functions.discountRules** (confirmed) — "Powered By Functions": free gifts, BXGY, and volume/tiered discounts are applied via **Shopify Functions** (discount functions) rather than $0 draft products or fragile discount codes. Headline differentiator: "give any product in inventory as a free gift using real inventory — no $0 products."
- **functions.cartTransform** (inferred) — auto-adding the free-gift line and overriding its price at cart level is most cleanly done with a cart-transform Function; the vendor markets "auto add to cart free gifts using real inventory," implying cart-transform alongside discount functions.
- **checkout.upsell / checkout.block** — NOT a primary surface. Upsell stays IN the drawer, and reviews confirm it does **not** support non-native / third-party checkouts. Treat as absent. (confirmed absence for third-party checkout)
- **analytics.pixel** (inferred) — emits cart/goal/upsell analytics events (GA integration listed; Web SDK exposes the events), but via its own JS eventing, not necessarily a Shopify Web Pixel extension.
- **admin.block / admin.action** — configuration lives in the app's own embedded Admin dashboard (campaign builder, appearance editor), not as merchant-facing admin blocks on other resources. It's a standalone embedded admin app, not our `admin.block` vocabulary. (confirmed)
- **flow.automation, pos.extension, postPurchase.offer, proxy.widget, customerAccount.blocks, functions.deliveryCustomization, functions.paymentCustomization** — not used. (confirmed by absence)

**Cross-surface coordination:** All three storefront widgets share ONE cart state and ONE campaign engine. A **Web SDK** (`window.corner`) is the coordination bus: `corner.on(...)` events, `corner.get()` readers, `corner.do()` actions, plus override hooks. Sticky ATC and mini-cart both call into the same drawer (`openCart`, `cartAdder`). Campaign progress (goal milestones, unlocked gifts) is computed once and reflected in the drawer's progress bar, so adding an upsell in the drawer live-recomputes goal state and can auto-add/remove the gift line. Handoff to checkout preserves the Function-applied discounts.

## functional_model
Core entities (field types inferred from UI + Web SDK payloads):

- **CartDrawer (appearance config)** = { theme/layout preset, colors, button styles, enabled widgets: [drawer, stickyAtc, miniCart], announcement, custom HTML, custom CSS, terms-checkbox, gift-wrap, discount-field toggle, note toggle }
- **Campaign** = { id, type: `cart_goal` | `free_gift` | `bxgy` | `volume_discount` | `upsell` | `announcement` | `timer`, active, priority, targeting: TargetAudience, schedule }
- **CartGoal (progress bar)** = { goalType: `total_cart_value` (also free-shipping / quantity variants), tiers: [Milestone] }
- **Milestone (tier)** = { index (1-based), threshold (money or qty), reward: `free_product` | `free_shipping` | `discount`, rewardProducts: [product_ref] (multiple ⇒ customer chooses), progressText.before, progressText.after (unlocked) }
- **FreeGift** = { product_ref/variant_ref, sourcedFromRealInventory: true, appliedVia: shopifyFunction, autoAdd: bool, chooseFromMultiple: bool }
- **Upsell** = { source: `frequently_bought_together` | `related` | `manual list` | Shopify recommendations, placement: in-drawer, oneClickCheckbox: bool (e.g. gift-wrap add-on) }
- **BXGY** = { buyProducts:[ref], buyQty, getProducts:[ref], getQty, discountOnGet }
- **VolumeDiscount** = { productScope, tiers:[{minQty, discount}] } ("buy more, save more")
- **Timer/Announcement** = { message text, countdown end, style, placement in drawer }
- **TargetAudience** = { customerTags:[...], B2B/B2C segment, include/exclude rules }
- **ProductDisplayOverride** = tag-driven per-product rendering (see data_model tags): hide qty/price/title/image, non-clickable, exclude from cart/upsell.

Relationships: one Store → many Campaigns; a Cart Goal → ordered Milestones; a Milestone → one reward (+ optional multi-product choice); Campaigns filtered by TargetAudience against the current customer; the drawer renders the union of active campaigns over the live cart, recomputing on every `onCartEdit`.

## settings_taxonomy
Actual merchant-facing knobs, grouped. Backticked names are confirmed from docs/SDK; others are inferred control shapes from UI descriptions.

### content
- **Announcement message** — text, per-campaign (confirmed feature).
- **Custom HTML block** in drawer — html/text (confirmed).
- **Progress-bar messaging** — text, distinct **before-unlock** and **after-unlock (achieved)** strings per milestone (confirmed per-goal text edits; before/after split inferred from milestone-achieve/lost events).
- **Checkout button label / CTA text** — text (inferred).
- **Empty-cart message** — text (inferred).
- **Terms-and-conditions checkbox** — toggle + text/link (confirmed "Terms checkbox").
- **Gift-wrap / add-on label** — text tied to one-click upsell checkbox (confirmed).
- **Multi-language / translations** — text per locale (confirmed "Multi-language").
- **Free-gift chooser copy** ("choose your reward") — text when multiple gift products offered (confirmed multi-product chooser).

### style
- **Cart layout / theme preset** — select of drawer presets (inferred).
- **Colors** — color pickers: background, text, accent/primary button, progress-bar fill, progress-bar track (inferred; custom CSS + "cleaner, higher-end drawer" confirm the styling surface).
- **Button style** — select/color + likely border-radius (inferred).
- **Custom CSS** — text (confirmed "Custom CSS").
- **Confetti / unlock animation** — toggle (confirmed; reviewers mention confetti on goal unlock).
- **Mobile responsiveness** — automatic (confirmed "Mobile responsive").
- **Sticky ATC bar appearance** — placement + style; product/home/custom pages (confirmed scope).
- **Floating mini-cart** — toggle + position (confirmed widget).
- **Drawer slide side (left/right)** — select (inferred; standard for slide carts).

### targeting
- **Target Audience** — segment rule: `customerTags` include/exclude, B2B vs B2C (confirmed feature name; used for B2B/B2C).
- **Campaign schedule** — start/end datetime (inferred; timers confirm time awareness).
- **Product eligibility via tags** (confirmed exact): `corner-hide-from-cart-upsell`, `corner-hide-all-cart-upsells`, `corner-hide-all`, `corner-bundle-editable`.
- **Sticky-ATC page scope** — product / home / custom (confirmed).
- **Goal threshold** — number (money for `total_cart_value`; qty for quantity goals) (confirmed, e.g. "Spend 700 INR").

### behavior
- **Widget enablement** — three independent toggles: Cart Drawer, Sticky Add-to-Cart, Floating Mini Cart (confirmed).
- **Goal type** — select: `Total Cart Value` (+ free-shipping, quantity variants) (confirmed `Total Cart Value`).
- **Reward type per milestone** — select: `Free Product` | free shipping | discount (confirmed `Free Product`).
- **Auto-add free gift to cart** — toggle (confirmed "auto add to cart").
- **Multiple gift products ⇒ customer choice** — toggle/implicit when >1 gift added (confirmed).
- **Discount-code field in drawer** — toggle (confirmed "Discount fields").
- **Order notes** — toggle (confirmed "Custom notes").
- **One-click upsell checkbox** — toggle per add-on (confirmed, e.g. gift wrap).
- **Upsell source** — select: Frequently Bought Together | Related | Shopify recommendations | manual list (confirmed).
- **Countdown timer** — toggle + end time (confirmed "Urgency timers").
- **Accelerated/express checkout buttons** — toggle (confirmed express-checkout support in SDK docs).
- **Per-product display controls (tags)** (confirmed exact): `corner-hide-qty`, `corner-hide-price`, `corner-hide-title`, `corner-hide-img`, `corner-hide-options`, `corner-non-clickable-product-title`, `corner-hide-close-btn`, `corner-hide-all`.

### data
- **Web SDK event hooks** (confirmed) — subscribe via `corner.on`: `onCartEdit`, `onCowiOpen`, `onCowiClose`, `onCartCtaClick`, `onUpsellCtaClick`, `onDiscountCodeAdd`, `onDiscountCodeRemove`, `onSatcCtaClick`, `onCartGoalMilestoneAchieve`, `onCartGoalMilestoneLost`.
- **SDK actions** (confirmed) — `corner.do(...)`: `openCart`, `closeCart`, `refreshCart`, `cartAdder(productId)`; readers `corner.get(...)`: `cartInfo`, `currentProduct`, `pageType`; overrides `corner.overrideCartEdit(cartObject, ajaxJobQueue)`, `corner.overrideCheckout(cartObject, discountCodeApplied)`, `window.showCornerCartModal(config)`.
- **Analytics integration** — Google Analytics event tracking (confirmed).
- **Order-volume metering** — plan cap (e.g. 5,000 orders/mo) implies order counting (confirmed cap).

## data_model
- **App-hosted database (external to Shopify)** — persists campaign definitions, goal tiers, appearance config, targeting rules, per-store settings. The embedded admin is a hosted service (help center + SDK confirm a backend, not theme-only). (inferred, strongly evidenced)
- **Shopify Functions (discount + likely cart-transform)** — the runtime side-effect layer that applies free gifts / BXGY / volume discounts against **real inventory** at cart/checkout. Server-side wasm, not merchant-authored per campaign. (confirmed Functions; cart-transform inferred)
- **Product tags** — targeting/display logic keyed off Shopify product tags (`corner-*`), read at render time. (confirmed)
- **Theme app extension assets** — App Embed block + widget JS/CSS injected into the storefront. (confirmed)
- **No $0 gift products / no draft-order hacks** — explicit design choice; gifts come from real catalog inventory, so no synthetic products/codes persisted for gifting. (confirmed)
- **Customer segments** — derived from Shopify customer tags at runtime for Target Audience; not a separate persisted CRM. (inferred)
- **Media/CDN** — product images from Shopify CDN; no separate media store evident. (inferred)

## visual_patterns
- **Layout archetype:** right/left slide-out drawer over a scrim; stacked top→bottom: announcement/timer banner → progress bar with milestone markers → line items → upsell carousel/list → discount + notes + terms → sticky footer with subtotal + checkout CTA (+ express buttons). Sticky-ATC is a fixed bottom/inline bar; mini-cart is a floating badge/button.
- **Component states:**
  - Progress bar: locked (partial fill, "spend X more…"), approaching, unlocked/achieved (full fill + confetti), regressed (milestone lost on item removal).
  - Free gift line: absent → auto-added on unlock → removed on regress; "choose your reward" selector when multiple.
  - Upsell item: default → adding (loading) → added → excluded (via tags).
  - Cart: empty vs populated; loading/refresh on `refreshCart`.
  - Discount field: input → applied (chip) → invalid/removed.
- **Motion/interaction:** slide-in/out drawer; scrim fade; progress-bar fill transition; **confetti** celebration on goal achievement (signature delight moment); quantity steppers; one-click checkbox toggles that instantly recompute totals; live recompute on every cart edit (`onCartEdit` drives re-render). Marketed as fast/stable "under peak load," so animations are lightweight and cart ops are optimistic via an ajax job queue (`overrideCartEdit(..., ajaxJobQueue)`).

## reviews_signal
**Praises (confirmed from App Store reviews):**
1. **Real AOV lift** — concrete jumps (e.g. "AOV from £50 to £70"); the progress-bar-to-free-gift loop is the driver.
2. **Most complete feature set in the category** — chosen over 4-5 competitors for breadth (upsell + gifts + progress bar + BXGY + volume + subscription compatibility).
3. **Exceptional, fast support** — named agents (Arun, Sreemon, Sujil); "best customer service of any Shopify app."
4. **Cleaner, higher-end drawer than native** — design polish + confetti delight.
5. **Flat monthly pricing** — merchants like avoiding per-use / revenue-share billing.

**Complaints (confirmed):**
1. **No third-party / non-native checkout support** — breaks for custom/headless checkouts.
2. **Occasional support gaps** — a weekend with no replies drew a harsh review (vendor acknowledged staffing gap).
3. **Missing PWP (pay-with-product), only GWP** — feature-scope requests beyond gift-with-purchase.
4. **UI/aesthetic mismatch for some brands** — one reviewer called the drawer UI "cheap"; styling controls don't always reach a high-end look.
5. (Implied) **Free plan is bare** — all campaigns/automations are paywalled, so value lives entirely in paid tiers.

## mapping_note
A **basic Corner drawer = a theme-app-extension module** and fits our RecipeSpec as roughly a `theme.section`-style storefront widget with an appearance/settings schema (colors, toggles, layout, copy). That part is single-module-shaped.

Where it **EXCEEDS a single-module recipe** (gap-analysis surface):
- **Cross-surface blueprint, not one module.** Drawer + Sticky ATC + Floating Mini Cart are three coordinated storefront widgets sharing one cart state and one campaign engine via a Web SDK bus. A single recipe emitting one section can't express the shared-state handoff; this needs a multi-surface blueprint with a coordination contract.
- **Persistent campaign store + rule engine.** Campaigns, ordered goal tiers, targeting (customer-tag/B2B-B2C segments), schedules, and priority live in an external DB and are evaluated by a rule engine against the live cart on every edit — a stateful data store + rules layer, not a static spec.
- **Real external side-effects via Shopify Functions.** Free gifts / BXGY / volume discounts are applied through discount (and likely cart-transform) Functions against real inventory — server-side wasm side-effects the module must provision and wire, not declare.
- **Live runtime API surface.** The Web SDK (events + actions + `overrideCartEdit`/`overrideCheckout` hooks + order-volume metering) is programmable runtime behavior and analytics eventing beyond a rendered module — closer to an embedded app with its own JS runtime than a generated section.

---
_Sources: apps.shopify.com/cornercart (+ /reviews); help.cornercart.io (CornerCart category, cart-goal free-gift article, setup guide, Web SDK docs, product-display-tags article); pickyourapp.com/products/cornercart; storecensus.com/shopify-apps/cornercart; cornercart.io. Facts labeled confirmed vs (inferred) inline._
