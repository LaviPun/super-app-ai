# BON Loyalty Program & Rewards

> Status: **Live, not deprecated.** The App Store slug is `bon-loyalty-rewards`; the listing title is "BON Loyalty Program & Rewards" (also marketed as "BON: Loyalty Rewards Referrals"). Same product, same vendor throughout — no rename/merge/deprecation to report. (confirmed)
> Note: BON is unrelated to the *Bold* apps (Bold Loyalty was sunset years ago). BON is a distinct vendor (VEGAHUB). The prompt's "some Bold apps" caveat does not apply here. (confirmed)

## identity
- **name**: BON Loyalty Program & Rewards / "BON: Loyalty Rewards Referrals" (confirmed)
- **vendor**: VEGAHUB Technology Inc. (developer HQ Oakville, ON, Canada; team based in India) (confirmed)
- **category**: Loyalty and rewards (under Marketing and conversion) (confirmed)
- **App Store URL**: https://apps.shopify.com/bon-loyalty-rewards (confirmed)
- **rating**: 5.0 / 5.0 (confirmed)
- **review count**: ~1,806 reviews, ~98% five-star (confirmed; grows over time)
- **install signal**: Install count not shown on listing; review volume (~1,800) + "one of the top loyalty apps" positioning implies tens of thousands of installs (inferred)
- **pricing model**: Freemium, order-volume-metered subscription with 4 tiers + 7-day trial on paid. Free Forever (150 orders/mo), then paid tiers priced by monthly order cap. Exact prices differ across sources/time — App Store listing showed Free / Starter $15 (300 orders) / Basic $29 (500 orders) / Growth $129 (unlimited); a hands-on review showed Free (250) / Basic $25 (500) / Growth $99 (2,500) / Professional $349 (7,500). Tiers gate features (POS on Basic+, VIP tiers on Growth+, custom CSS on Growth). (confirmed structure; specific $ figures vary by source/date — treat as (inferred) point-in-time)

## surfaces
BON is inherently **multi-surface** and coordinates them through one shared points ledger keyed to the Shopify customer. Mapping to our internal extension-type vocabulary:

- **proxy.widget** (confirmed) — The floating **loyalty launcher/widget** ("BON widget") injected on every storefront page (homepage, product, collection). Shows points balance, ways to earn, ways to redeem, referral link, VIP tier progress. This is the primary customer surface, available on ALL plans. It is an app-embed block (theme app extension) backed by an app-proxy/app data endpoint for authenticated per-customer state.
- **theme.section** (confirmed) — The dedicated **Loyalty Page** (Basic+ plan): a full standalone page with editable sections `header, profile, earning, redeeming, referral, FAQs` added via theme editor app blocks. Also a **product-page points display** ("earn X points on this product") on Growth. Rendered as theme app-extension blocks/sections merchants place in the theme customizer.
- **pos.extension** (confirmed) — **BON POS tile** on Shopify POS (Basic+): staff can look up a customer's points and apply earn/redeem in-store. Balance stays in sync with the same online ledger.
- **checkout.block** / **checkout.upsell** (confirmed for Plus) — **Checkout redemption** ("redeem points at checkout", Shopify Plus / Checkout Extensibility): a checkout UI extension letting customers apply points→discount inline. Marketed as "loyalty at every touchpoint … checkout." (confirmed it exists; exact extension target block vs. line-item = inferred)
- **customerAccount.blocks** (confirmed) — "Customer accounts extension available" per listing; surfaces points balance / rewards inside the new Shopify customer account pages.
- **flow.automation** (confirmed) — Listed as "Works with Shopify Flow." BON emits/consumes Flow triggers/actions (e.g., points events → Flow), used for automations like tagging and campaign triggers.
- **admin.block** (inferred) — Admin embedded app (the whole merchant console lives in Shopify Admin as an embedded app); customer detail may surface points. Not a lightweight admin action block — it's a full embedded SPA.
- **functions.discountRules** (inferred, indirect) — Redemptions are realized as **Shopify discount codes / discounts** applied to the cart. BON does not appear to ship a native Rust discount Function; it generates discount codes via the Admin API rather than a `cart_transform`/`discountRules` Function. (inferred)
- **analytics.pixel** (inferred) — Has an analytics/performance dashboard; likely uses app-side event tracking rather than a Web Pixels Extension. No confirmed pixel extension.

**Surface coordination**: All surfaces read/write ONE points balance per Shopify customer (the shared ledger). The storefront widget, POS tile, checkout extension, and customer-account block are all *views* over that ledger. Handoff: an order placed in POS or online → order webhook → points accrued → balance instantly reflected in the widget and next login. Redemption anywhere mints a Shopify discount that the cart/checkout honors. VIP tier changes write back to Shopify **customer tags** (`BON_[tier]`), which then drive Flow/email segmentation — a cross-surface side effect into the merchant's own Shopify data.

## functional_model
Core entities and relationships (names normalized; concrete shapes):

- `LoyaltyProgram = { status: enabled|disabled (off by default at install), pointsCurrencyName (e.g. "points"/"stars"), earnRatio, redeemRatio, expirationPolicy }`
- `Member (customer) = { shopify_customer_ref, pointsBalance, lifetimePoints, vipTier_ref, birthday?, referralCode, tags[] }` — one per Shopify customer.
- `EarnRule = { type, enabled, pointsValue | pointsPerDollar, cadence (one-time | repeatable), limits, appliesToTier? }` — up to ~18 rule types.
- `RedeemReward = { type ∈ {amount_discount, percentage_discount, free_shipping, free_product, custom}, pointsCost, value, combinesWithOtherDiscounts?, expiry, collection/product exclusions }`
- `VipTier = { name, entryMethod ∈ {points_earned, money_spent}, entryRequirement (threshold), pointsMultiplier (e.g. x2/x3/x5), perks[] (rewards, early access, free shipping, custom), resetPolicy (forever | yearly), addShopifyTag: BON_[name] }` — ordered set of tiers.
- `ReferralProgram = { referrerReward, referredReward (each independently points OR % discount OR coupon), triggerEvent = referred_friend_first_order_completed, antiCheat: true, popup: {type, colors, size, icon, title, text}, socialShareChannels[] }`
- `Reward/Coupon (issued) = { member_ref, shopify_discount_code, value, expiry, redeemed? }` — a redemption instantiates a Shopify discount.
- `Campaign / LimitedTimeOffer = { multiplier or bonus, window (start/end), targeting }`; `Nudge = { on-site reminder config }`.
- `Email/Notification = { type (5–9 types), banner, logo, sender, content, enabled }`.

Relationships: Member 1—* PointsTransaction (ledger); Member *—1 VipTier (auto-assigned by threshold, re-evaluated on spend/earn; birthday points excluded from tier eval); Member 1—1 referralCode 1—* Referral→issued Reward; RedeemReward → issued Shopify discount code on redemption.

## settings_taxonomy
The five buckets. Control names are as merchants see them; type in brackets. Marked (inferred) where the type is deduced.

### content
- **Points currency / name** [text] — what points are called (e.g. "points", "coins"). (confirmed)
- **Widget texts / translations** [text, per-string, per-language] — every label on the widget is editable; 200–250+ languages can run simultaneously. (confirmed)
- **Loyalty Page section content** [rich text per section: header, profile, earning, redeeming, referral, FAQs] — edit or hide each section. (confirmed)
- **Email content** per notification type [text/rich text] — banner image, logo, sender name, body copy, + send test email. (confirmed)
- **Referral popup copy** [text] — title + body text of the "refer a friend" popup. (confirmed)
- **Reward names / descriptions** [text] — label shown for each redeem option. (inferred)
- **FAQ entries** [repeatable text] — Q/A list on loyalty page. (inferred)

### style
- **Widget / launcher icon** [select + image] — choose icon or upload custom. (confirmed)
- **Brand colors** [color] — widget/page accent colors. (confirmed)
- **Banner image** [image] — custom banner on widget/page/email. (confirmed)
- **Custom CSS** [text/code] — free-form CSS (gated to Growth plan). (confirmed)
- **Widget visibility settings** [toggle(s)] — show/hide widget, per-context visibility. (confirmed)
- **Display mode** [select: Widget | Hyperlink | Loyalty Page] — how the program surfaces (plan-dependent). (confirmed)
- **Widget position** [select: corner placement] (inferred)
- **Referral popup style** [select popup type; color; size; icon] (confirmed)
- **Language** [select from 250+] (confirmed)

### targeting
- **Loyalty Program status** [toggle: enabled/disabled] — master on/off, off by default. (confirmed)
- **VIP tier entry method** [select: points earned | money spent] + **Entry requirement per tier** [number threshold]. (confirmed)
- **Tier reset policy** [select: forever | reset yearly]. (confirmed)
- **Collection / product exclusions** [product-picker / collection-picker] — exclude items from earning or from reward eligibility (free plan feature). (confirmed)
- **Earn-rule tier applicability** [per-tier multiplier: x2/x3/x5] — accelerated points by tier. (confirmed)
- **Limited-time offer window** [date range] + multiplier — time-boxed bonus targeting. (confirmed)
- **B2B tier program** [toggle/config] — separate wholesale tier track (Growth+). (confirmed)
- **Reward combinability** [toggle: allow combine with other discounts]. (confirmed)
- **Customer eligibility / tags** [rule] — segment who sees/earns (inferred; via Flow + BON_ tags).

### behavior
Earn rules (up to ~18; each has [toggle enabled] + [number points] + cadence):
- **Place an order** [pointsPerDollar number] — e.g. $1 = 5 points; the core accrual. (confirmed)
- **Sign up / create an account** [fixed points, one-time]. (confirmed)
- **Complete profile** [fixed points, one-time]. (confirmed)
- **Celebrate a birthday / Happy Birthday** [fixed points, yearly; excluded from tier eval] + birthday-date capture. (confirmed)
- **Anniversary reward** [fixed points, yearly] (Growth). (confirmed)
- **Subscribe to newsletter** [fixed points]. (confirmed)
- **Leave a review** [fixed points on published review; integrates Judge.me / Fera / LAI]. (confirmed)
- **Follow / share on social** [fixed points, per network] (paid). (confirmed)
- **Streak purchases** [config: consecutive-order bonus] (Growth). (confirmed)
- **Daily check-in** [fixed points/day] (Growth). (confirmed)
- **Order booster** [multiplier/bonus config]. (confirmed)
- **Referral** [see referral entity]. (confirmed)

Redeem behavior:
- **Reward type** [select: amount discount | percentage discount | free shipping | free product | custom]. (confirmed)
- **Points cost** [number] per reward. (confirmed)
- **Reward value** [number/currency or %]. (confirmed)
- **Points ratio** [number] — X points = $Y off. (confirmed)
- **Reward / points expiration** [toggle + duration] — expire points and/or issued rewards. (confirmed)
- **Anti-cheat referral** [toggle/built-in] — blocks self-referral/fraud. (confirmed)
- **Referral trigger** = referred friend's first completed order (fixed logic). (confirmed)
- **VIP points multiplier** [x-number per tier]. (confirmed)
- **Auto-tagging** [toggle: "Add tag for this tier"] → writes `BON_[tier]` to Shopify customer. (confirmed)
- **Nudges** [toggle(s)] — on-site reminders/prompts (paid). (confirmed)
- **Automated emails** [per-type toggle] — 5–9 lifecycle emails. (confirmed)

### data
- **Analytics dashboard** [read-only reports] — members, points issued/redeemed, ROI, program performance. (confirmed)
- **Points expiration policy** [duration] — data-retention/liability control. (confirmed)
- **Integrations** [connect toggles] — Klaviyo (email/SMS), Judge.me / Fera / LAI (reviews), PageFly, Shopify Flow, headless/Hydrogen, API + developer toolkit. (confirmed)
- **API access** [keys/toggle] — full developer API to read/write points and extend (Growth/API tier). (confirmed)
- **Import/export** of members/points [action] (inferred).
- **Manual points adjustment** per customer [action: add/deduct points] (inferred, standard for the category).

## data_model
BON persists loyalty state in its **own external database** (VEGAHUB-hosted app backend), NOT in Shopify metafields as the source of truth:
- **Points ledger + member profiles** — external app DB keyed by `shop` + `shopify_customer_id`; holds balance, lifetime points, transaction history, birthday, referral code, tier assignment. (inferred — standard architecture; BON exposes it via its own API/toolkit rather than Shopify-native storage)
- **Program config** (earn rules, rewards, tiers, referral, branding, translations, emails) — external app DB per shop. (inferred)
- **Shopify-side writes (side effects into merchant's own data)**:
  - **Discount codes / price rules** minted via Admin API when a member redeems — these live in Shopify. (confirmed behavior)
  - **Customer tags** `BON_[tier]` written to Shopify customers for VIP segmentation. (confirmed)
- **Media/CDN** — banner images, custom widget icons, email logos stored on BON's CDN/asset store. (inferred)
- **Codes** — referral codes and issued reward coupon codes (referral coupons live as Shopify discounts; referral link codes tracked in BON DB). (confirmed)
- **Webhooks** — subscribes to `orders/create`, `orders/paid`, `customers/create`, etc. to accrue points; POS orders flow through the same order webhooks. (inferred)
- **Multi-language strings** — stored per-shop in BON DB (200–250+ locales). (confirmed)

## visual_patterns
- **Layout archetypes**: (1) Floating **launcher bubble** bottom-corner → expands into a **panel/drawer** with tabbed views (Earn / Redeem / Referral / My balance / My rewards / VIP). (2) Full **loyalty landing page** with stacked, reorderable, hideable sections. (3) **Popup/modal** for referral share. (4) **POS tile** list view. (5) Embedded **admin SPA** with left-nav (Dashboard, Point programs → Earn/Redeem, VIP, Referral, Branding, Settings, Analytics, Integrations).
- **Component states**: logged-out (join/sign-in CTA) vs. logged-in (balance + progress); reward locked (insufficient points) vs. unlockable (redeem button active); tier progress bar with current/next tier; toggle on/off per rule; empty states for zero history; "test email" preview state.
- **Motion/interaction**: launcher expand/collapse slide, points-earned confirmation, progress-bar fill toward next tier/reward, social-share popup, copy-referral-link affordance, plug-and-play editor with live preview (no-code). Emphasis on "on-brand, no coding" configurability.

## reviews_signal
**Praises (top 5):**
1. Exceptional 24/7 customer support — named agents (Hazel, Ame, Dannie), fast, patient, proactive. The single most-cited strength.
2. Easy setup / plug-and-play — "just works out of the box," well-organized, no coding for basic launch.
3. Comprehensive feature set without feeling overwhelming — earn rules, redemption, VIP, referrals, reporting.
4. Native multi-language / translation support — a genuine differentiator vs. competitors (200–250+ languages).
5. Seamless POS ↔ web sync — one balance across in-store and online, "works in the background."

**Complaints (top 5):**
1. Interface not always intuitive — "configuration settings are difficult to find," some tasks require contacting support.
2. Custom CSS / deeper branding gated to top (Growth) plan — merchants want it on all tiers.
3. Some integrations not standard — must request custom connections (e.g., certain review-app earning) rather than one-click.
4. Occasional support knowledge gaps — a reviewer cited "misleading answers" (post-login redirect blamed on false "Shopify limitation").
5. Order-metered pricing jumps — cost scales with monthly order volume and feature gating pushes growing stores up tiers quickly.

## mapping_note
Onto our constrained **RecipeSpec** vocabulary, a *fragment* of BON maps cleanly: a single storefront widget/section (proxy.widget or theme.section) with content/style/targeting settings is expressible as one module recipe. But BON as a product **far exceeds a single-module recipe**. Where it breaks the boundary:

1. **Persistent stateful data store + ledger** — a per-customer points balance with a full transaction history and lifetime totals. A RecipeSpec emits a *module*, not a durable multi-tenant DB; BON needs backend persistence, mutation endpoints, and read APIs that outlive any one render.
2. **Cross-surface blueprint with shared state** — the SAME balance must render and mutate across proxy.widget + theme.section + pos.extension + checkout.block + customerAccount.blocks. This is a coordinated multi-extension *blueprint*, not a single surface, and all views must reconcile to one source of truth.
3. **Rule engine + event-driven background jobs** — ~18 earn rules, tiered multipliers, expirations, streaks, LTO windows, and VIP re-evaluation are evaluated off webhooks (orders/paid, customers/create) and schedules (birthday, anniversary, daily check-in, expiry sweeps). That's a background worker + cron + rules DSL, none of which a static recipe encodes.
4. **External side effects into Shopify + third parties** — minting Shopify discount codes on redemption, writing `BON_[tier]` customer tags, emitting Flow events, and syncing Klaviyo/review apps. The module must reach OUT and cause durable changes in the merchant's store and external systems, beyond rendering UI.

---
### Sources
- App Store listing: https://apps.shopify.com/bon-loyalty-rewards
- Reviews: https://apps.shopify.com/bon-loyalty-rewards/reviews
- Vendor docs: https://bonloyalty.com/docs/ (general settings, earn/redeem tabs, VIP tier setup, referral setup)
- Vendor site: https://bonloyalty.com/
- Hands-on review: https://tiny-img.com/reviews/bon-loyalty-review/
- Aggregator: https://analyzify.com/shopify-apps/bon-loyalty-rewards-referrals
