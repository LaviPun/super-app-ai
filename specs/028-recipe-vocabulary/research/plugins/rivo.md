# Rivo: Loyalty Program, Rewards (Rivo Loyalty & Referrals)

> Status note: The app is **active and current** — no rename/merge/deprecation. It is listed as "Rivo: Loyalty Program, Rewards" (formerly marketed as "Rivo Loyalty & Referrals"); the App Store slug is still `rivo-loyalty` and the listing carries the **Built for Shopify** badge (confirmed). This is a native Shopify vendor (Rivo.io), not a legacy Bold app. Rivo has expanded from pure loyalty/referrals into a broader retention platform (Loyalty + Referrals + Memberships + Customer Accounts), so some surfaces below belong to sibling Rivo products that share the same admin/data model (noted where relevant).

## identity
- **name**: Rivo: Loyalty Program, Rewards (aka Rivo Loyalty & Referrals) — confirmed
- **vendor**: Rivo (rivo.io) — confirmed
- **category**: Loyalty and rewards (Marketing and conversion → Customer loyalty) — confirmed
- **App Store URL**: https://apps.shopify.com/rivo-loyalty — confirmed
- **rating**: 4.8 / 5 (App Store listing); some aggregators cite 4.9 — confirmed (4.8 primary)
- **review count**: ~1,347–1,352 on the App Store listing — confirmed
- **install signal**: No public install count on listing; long tenure (launched Jan 18, 2021), 1,300+ reviews, multiple merchants reporting 4–5 years of use, positions itself for "fast-growing DTC brands" → mid-market install base in the low thousands (inferred)
- **pricing model**: Freemium, order-volume-based tiers (confirmed): **Free** $0 (up to 200 orders/mo), **Essential** ~$15/mo (up to 500 orders/mo — loyalty page, theme extensions, prompts, 2 integrations, POS), **Scale** ~$49/mo (VIP tiers, analytics, custom CSS), **Plus** ~$499/mo (checkout extensions, custom integrations, developer toolkit; ~2,500 orders/mo). Above ~2,500 orders → custom/enterprise (aggregators cite a ~$1,999/mo floor). 14-day trials on paid tiers. Order overage drives the upgrade path. — confirmed, with (inferred) enterprise floor.

## surfaces
Rivo is explicitly **multi-surface**. Mapped to the internal allowlist:

- **theme.section** — CONFIRMED. Floating **Loyalty Widget** (launcher button + slide-out panel) installed via a Shopify **app embed** (app-embed block), plus a dedicated **Loyalty Landing Page** built from Rivo theme app-extension **app blocks** (Header/Banner, How It Works, Ways to Earn, Ways to Redeem, VIP Tiers). Also an **Account Page embed**. Shows: points balance, ways to earn/redeem, VIP tier progress, referral link, sign-up/sign-in.
- **proxy.widget** — (inferred). The floating widget and referral campaign embeds pull live customer point balances/state from Rivo's backend at render time; functionally an app-served widget over Shopify context (Rivo hosts the loyalty state, storefront JS fetches it).
- **checkout.upsell** / **checkout.block** — CONFIRMED (Plus plan). **Checkout extensions** including "refer friends at checkout" and points/redemption touchpoints in the checkout UI ("Touchpoints for checkout and account page").
- **postPurchase.offer** — (inferred). Referral share prompts appear post-order (thank-you / order-status surfaces); Rivo markets "refer friends at checkout" and share-order flows, which straddle checkout and post-purchase.
- **customerAccount.blocks** — CONFIRMED. **Customer Accounts extensions** / "branded account sidebar" and account-page embed showing points, tier status, referrals, and (via the Accounts product) order history, tracking, returns, wishlists, saved cart, recently viewed.
- **pos.extension** — CONFIRMED. Native **Shopify POS** integration: earn/redeem points in-store, POS-specific reward types (Amount Discount, Percentage Off), tier accrual on in-store orders.
- **analytics.pixel** — (inferred). On-site tracking of earn events (visit URL, email/SMS subscribe) implies client-side event capture; not confirmed as a formal Web Pixel extension.
- **flow.automation** — CONFIRMED. Native **Shopify Flow** connector (points/tier/referral events as Flow triggers/actions) plus ESP automations via Klaviyo, Postscript, Attentive, Gorgias, Fuego.
- **admin.block / admin.action** — (inferred). Merchant admin lives largely in Rivo's own embedded admin app rather than as Shopify admin action/block extensions; manual point adjustments and customer profile edits happen there.
- **functions.\*** (cartTransform / discountRules / delivery / payment) — NOT USED as Shopify Functions. Rewards are realized as **generated Shopify discount codes** (amount off, % off, free shipping, free product), not as Function-based automatic discounts (inferred from doc language: rewards "generate a code" with expiry windows).

**Coordination / shared state**: All surfaces read/write ONE shared customer-loyalty record keyed to the Shopify customer (points balance, VIP tier, referral link, redeemed rewards). The floating widget, landing page, account embed, checkout extension, and POS all render projections of that single server-side ledger; a redemption in any surface debits the same balance and emits a discount code. Referral link generated in the widget/account is the same link surfaced at checkout and in emails. Tier changes recalculated server-side propagate to every surface. This is a **hub-and-spoke** model: Rivo's backend is the source of truth, surfaces are thin views + action triggers.

## functional_model
Core entities (concrete shapes; field-level types are (inferred) from doc behavior unless noted):

- **member / participant** = { shopify_customer_ref, points_balance, lifetime_points, current_vip_tier_ref, referral_link, opt_in_state, zero_party_data, credits_balance } — confirmed entity ("Program participants")
- **earn_rule** (way to earn) = { action_type (enum: sign_up | place_order | birthday | anniversary | complete_referral | product_review | visit_url | email_subscribe | sms_subscribe | upload_receipt | product_purchase | follow_instagram | like_facebook | share_facebook | follow_twitter | share_twitter | follow_tiktok | custom_action), points_value (fixed OR per-$ increment), enabled (bool), per_tier_overrides[] } — confirmed action list
- **redeem_option** (reward) = { reward_type (enum: amount_discount | percentage_off | free_shipping | free_product | gift_card | pos_amount | pos_percentage), points_cost, model (fixed | flexible/incremental), min_points, max_points, min_order_value, product/collection/variant_scope, max_shipping_amount, code_expiry (hours|days|months), refund_points_on_expiry (bool), subscription_applicability, vip_tier_gating } — confirmed
- **redemption / issued_reward** = { member_ref, redeem_option_ref, points_spent, generated_discount_code, status, expires_at } — confirmed behavior
- **vip_tier** = { name, icon, threshold (numeric), based_on (points_earned | amount_spent | orders_placed), rank, tier_rewards[], point_multiplier } grouped under a **vip_program** = { entry_method, evaluation_period (lifetime | calendar_year | rolling_year | rolling_year_program_start), program_start_date, reset_and_recalculate (bool), carry_over (bool), allow_different_points_per_tier (bool) } — confirmed
- **referral_campaign** = { name, status, display_type (inline|popup), advocate_reward (reward shape), friend_reward (reward shape), qualifying_condition (first_order_only, min_order_value), new_customer_only (bool), exclusion_list[], reward_expiration, sharing_channels[], branding{} } → generates **referral_link** per advocate and **referral** events = { advocate_ref, friend_email, status, first_order_ref } — confirmed
- **points_ledger_entry** = { member_ref, delta, source_event, created_at, expires_at (per-event FIFO or bulk) } — confirmed (expiry model)
- **gift_card** = { value, recipient, delivery_date, message, earned_via (points|vip) } — confirmed
- **(sibling) membership** = { tier, billing (monthly|annual|daily|one_time), cashback_rules, auto_enroll, failed_payment_recovery } — confirmed (Rivo Memberships product)

Relationships: member 1—1 vip_tier (current), member 1—N ledger_entry, member 1—N redemption, earn_rule N—1 program, vip_tier N—1 vip_program, referral_campaign 1—N referral, referral 1—1 friend member (on conversion).

## settings_taxonomy
The ACTUAL merchant controls, grouped under the five headings. (All confirmed from Rivo help docs unless marked (inferred).)

### content
- **Program Title** (text) — widget header/banner caption
- **Points currency name** e.g. "points" / "stars" (text) (inferred — standard for the category, implied by "customizable messaging")
- **Points Introduction Text** / **Member Header Text** (text) — widget copy above balance
- **Account Creation Section** copy — sign up / sign in messaging (text)
- **Ways to Earn action labels & descriptions** (text per rule) + **modal copy fields** for interactive earn methods
- **Landing page — Banner (logged-out)**: Title, Subtitle, Sign Up Button Text, Login Button Text (text)
- **Landing page — Banner (logged-in)**: Title, Subtitle, Earn Button Text, Redeem Button Text (text)
- **How It Works**: Step Titles[] + Step Descriptions[] (repeatable text)
- **VIP Tiers table**: per-tier custom threshold descriptions + perk descriptions (text; blank rows auto-hidden)
- **Referral advocate signup**: Header title, Title, Subtitle, Button Text (default "Invite Friends"), Disclaimer text, Terms & Conditions URL (text/url)
- **Referral share**: Email subject, Personal note, share message fields (text)
- **Program translations** (text; multi-locale) — customizable messaging across locales
- **Transactional email copy** (loyalty / referral / membership emails), gift-card delivery + reminder email copy (text)

### style
- **Widget colors** (color pickers): Header Background, Header Text, Title Text, Regular Text, Button Background, Button Text, Widget Button (launcher) Background, Widget Button Text, Link Color, Icon Color
- **Shape controls** (select rounded | circle | square): Button Shape, Sections Shape, Text Fields Shape, Launcher Edges
- **Fonts** (dropdown): Primary Font, Secondary Font
- **Custom Banner Image** (image upload) — widget banner
- **Launcher button**: Button Type (select: icon+text | image only | text only), Button Text (text), Icon (default icon **or** custom image upload, 32×32px)
- **Panel Order** (drag-and-drop reorder of widget sections)
- **Landing page**: Theme Selection dropdown (sync assets to chosen theme), Button class-name fields (CSS class text inputs)
- **Referral campaign design**: color pickers (header bg/font, title, subtitle, button bg/border/font, footer), font-size inputs (px) for title/subtitle/button/footer, text alignment (left|center|right), font-family selectors, custom height (desktop & mobile), background type (Cover | Columns), background position (left|right), background image upload (≥500×400)
- **Custom CSS** field (Scale+; widget, account embed, referral campaign) — free-form stylesheet injection; premade CSS themes provided
- **Account Page embed premade CSS themes** (select)

### targeting
- **VIP tier gating of rewards** — restrict a redeem_option to specific tier(s) (select/multiselect)
- **Per-tier earn overrides** — Allow Different Points on Different Tiers (toggle) → point multipliers per tier
- **Reward product/collection/variant restrictions** (product-picker / collection-picker) — which products a Free Product or scoped discount applies to
- **Referral: New-customer-only restriction** (toggle) + **Minimum order value** (number) + **Customer exclusion list** (manual list input)
- **Widget/launcher visibility targeting** (select: show both | hide mobile | hide desktop | hide permanently; plus **Hide launcher on mobile** toggle) — device targeting
- **Subscription vs one-time applicability** (toggle/select) — whether a reward applies to subscription orders
- **Order eligibility for earning**: include/exclude discounts, taxes, shipping in the points-earning base (toggle/checkbox set)
- **Campaign display trigger**: Display Type inline | popup (select)

### behavior
- **Points Program Status** (master toggle ON/OFF)
- **Referral Program Status** (master toggle) + per-campaign **Campaign Status** (toggle)
- **Earn rule enable/disable** per action (toggle) + **points value** per action (number; fixed or per-$1 increment for Place an Order)
- **Redemption model** per reward: Fixed Point Rewards vs Flexible/Incremental Point Rewards (select) with **points cost**, **min points to redeem**, **max points to spend**, **point-to-discount conversion** (numbers)
- **Point exchange rate** (number; e.g. 500 pts = $5)
- **Reward conditions**: min order value, min quantity for free product, max shipping amount for free shipping (numbers)
- **Reward/discount-code expiry** (number + unit hours|days|months) + **return points on expiry** (toggle)
- **Points expiry**: per-event FIFO vs bulk expiry method (select), separate points-vs-credits expiry config, **expiry reminder emails** (toggle)
- **VIP evaluation**: Entry Method (points earned | amount spent | orders placed — select), Evaluation Period (calendar year | rolling year | rolling year from program start — select; lifetime implied), Program Start Date (date picker), Reset and Recalculate After Period (toggle), Extended Calendar-Year Carry-over (toggle)
- **Referral reward trigger** — advocate rewarded after friend's first order (behavior; qualifying condition configurable)
- **Referral emails**: reminder email (3-day follow-up) toggle, email consent checkbox toggle, UTM append option (toggle)
- **Sharing channels** (toggles): Email, Facebook, Twitter/X, SMS, WhatsApp, copy personal link; Share Mode (tabs | blocks)
- **Manual point adjustments** (admin action; add/subtract points per member)
- **Manual reward revocation with point refund** (admin action)
- **Membership billing** (select: monthly | annual | daily | one-time), auto-enroll free tier (toggle), failed-payment recovery settings, cancellation handling (sibling product)

### data
- **Email delivery mode**: Rivo domain vs custom domain vs ESP integration (select) for transactional loyalty/referral/membership emails
- **Integrations** (connect/enable per service): Klaviyo, Gorgias, Postscript, Attentive, Fuego, Shopify Flow, Shopify POS, Shopify Customer Accounts; Google & Shop sign-in options (toggles). Plan-gated integration count (2 on Essential).
- **Zero-party data / preferences collection** (fields the merchant defines to collect at signup) — data-capture config
- **Developer toolkit / custom integrations** (Plus) — API/webhook access to points, tiers, referrals
- **Analytics dashboards** (Loyalty / Referrals / Memberships) — read surfaces; gift-card delivery tracking; not a knob but a data output
- **Embedded referral campaign snippet** = `<div id="rivo-referral-campaign-{ID}"></div>` (merchant pastes into theme) — data/placement handoff
- **Custom JavaScript field** (referral friend-claim) + **Custom Action** earn hook (external event → points) — external side-effect config

## data_model
What Rivo persists and where (confirmed unless noted):
- **External SaaS DB (Rivo-hosted)** — source of truth for the loyalty ledger: members, points balances, points_ledger entries (with per-entry expiry for FIFO), VIP tier state, earn rules, redeem options, referral campaigns, referrals, redemptions, membership records. Keyed to Shopify customer ID. This is NOT stored in Shopify metafields/metaobjects as the primary store (inferred — Rivo runs its own admin + API, order-volume-priced backend).
- **Shopify discount codes** — every redemption/referral reward is realized as a generated Shopify discount code (amount/%/free-shipping/free-product) with an expiry window. Referral links are Rivo-issued URLs carrying a referral token.
- **Gift cards** — Shopify gift cards (or Rivo-managed credit) issued as rewards, with recipient/delivery-date/message metadata.
- **Store credit / credits balance** — a separate credit ledger (distinct from points), with its own expiry config; constraint noted that "only credit-based loyalty programs can be used with Memberships."
- **Media/CDN** — merchant-uploaded assets (widget banner image, launcher custom icon 32×32, referral background image ≥500×400, tier icons) hosted by Rivo/Shopify CDN.
- **Theme assets** — app-embed + app-block settings persisted in the theme's settings_data (widget enable, landing-page blocks), pointing back to Rivo config.
- **ESP/CRM mirror** — profile + event data synced outward to Klaviyo/Postscript/Attentive/Gorgias for automations (data leaves Shopify).
- **Wallet passes** — Apple/Google Wallet passes with live points balance, VIP status, QR code (Rivo-generated, externally hosted).

## visual_patterns
- **Layout archetypes**: (1) **Floating launcher + slide-out panel** — pill/circle launcher pinned bottom-left/right with configurable side/bottom padding; opens a card-stack panel (header/banner → points balance → ways to earn list → ways to redeem list → referral → VIP progress), sections drag-reorderable. (2) **Full-page loyalty landing page** — hero banner (logged-out vs logged-in variants) → "How It Works" step row → Ways to Earn grid → Ways to Redeem grid → VIP tiers comparison table. (3) **Account-page sidebar embed** — compact points/tier/referral module. (4) **Referral campaign block** — inline or popup, hero image (cover or two-column) + share tabs/blocks. (5) **Checkout & POS touchpoints** — inline points/redeem + refer-a-friend.
- **Component states**: logged-out (sign up / sign in CTAs) vs logged-in (balance + earn/redeem CTAs); earn-action states (available / completed / locked-by-tier); redeem states (affordable / not-enough-points, with progress toward threshold); VIP progress bar (current tier, next-tier threshold, progress %); referral states (invite → shared → pending → converted/rewarded); flexible-reward slider (variable points → variable discount).
- **Motion/interaction**: slide-in/out launcher panel; drag-and-drop section reordering in the editor; auto-save with instant storefront reflection ("changes are saved automatically and appear instantly"); copy-link + native share sheet; popup entry animation for popup-mode referral campaigns; live-updating balances across surfaces after an earn/redeem event.
- **Editor pattern**: separate **Mobile vs Desktop tabs** for widget styling/position; color-picker + hex-entry palette; shape toggles (rounded/circle/square); font dropdowns; blank-field-auto-hides on landing page.

## reviews_signal
Overall 4.8/5, ~1,347 reviews, ~94% five-star (~2% one-star). Sources: App Store listing/reviews + aggregators (Analyzify, Zigpoll, Yuko, Voucherify).

**Top praises**
1. **Standout human support** — most-repeated theme: "quick, professional, very responsive," named reps going "above & beyond" (Arianne, Keveny). 24/7 human support cited as the differentiator.
2. **Easy setup / smooth Shopify integration** — "easy to set up," installs and integrates cleanly with the store.
3. **Generous free plan + strong value at entry tiers** — free up to 200 orders/mo lets small stores run a real program.
4. **Customization & flexibility** — adjustable points, custom CSS, styleable widget/landing page; works across POS + online.
5. **Long-term reliability** — merchants report 4–5 years of continuous, satisfactory use.

**Top complaints**
1. **Confusing / steep pricing jumps** — the $0 → $49 → $499 → custom (aggregators cite ~$1,999+) ladder is hard to reason about; website vs in-app pricing conflicts; must install to see real prices. Biggest recurring gripe and a leading reason merchants seek alternatives.
2. **Bugs after updates / save failures** — reports of "faults and errors on every click," pages that "cannot be saved… loading forever" following updates.
3. **In-app upselling / pop-up fatigue** — "continuous upselling attempts and pop-ups within the app."
4. **Leftover code after uninstall** — residual theme/script code remaining post-removal.
5. **No native product reviews** — loyalty-only; merchants must bolt on Judge.me/Loox, so it isn't a full retention suite on its own.

## mapping_note
Maps cleanly to a RecipeSpec **only for the single storefront view** (the loyalty widget/landing-page = one `theme.section` recipe with content/style/targeting/behavior knobs). Everything else **exceeds a single-module recipe**:

1. **Requires a persistent server-side data store + ledger.** Points balances, a FIFO points_ledger with per-entry expiry, VIP tier state, redemptions, and referral graphs are stateful, per-customer, and mutated by events — impossible to express as a stateless generated module. Needs an external DB / durable store, not metafields alone.
2. **Requires background jobs / a rule engine.** VIP tier recalculation on rolling/calendar windows, points expiry (bulk + per-event), reset-and-recalculate, referral-conversion detection on the friend's first order, and expiry-reminder emails are scheduled/event-driven side effects — a background worker + rule evaluator, well beyond a rendered spec.
3. **Requires a cross-surface blueprint with shared state.** The same loyalty record must project into ≥5 coordinated surfaces (floating widget, landing page, account extension, checkout extension, POS) that read and WRITE the same balance and emit the same discount codes/referral links. This is a multi-extension blueprint with a shared backend, not one module.
4. **Requires external side effects & integrations.** Generating Shopify discount codes / gift cards on redemption, issuing referral tokens, syncing profiles/events to Klaviyo/Postscript/Attentive/Gorgias, minting Apple/Google Wallet passes, and Shopify Flow triggers are outbound effects into other systems — outside the boundary of a self-contained recipe.
