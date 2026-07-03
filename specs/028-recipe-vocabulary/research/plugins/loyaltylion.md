# LoyaltyLion Loyalty Program

> Vocabulary study record. The app is live and current (not renamed/deprecated). Its App Store title has been refreshed over time ("LoyaltyLion Rewards & Referral" / "LoyaltyLion: Rewards & Loyalty" → current "LoyaltyLion Loyalty Program"), but it is the same vendor (LoyaltyLion) and same app slug `loyaltylion`, continuously listed. No merge or deprecation. (confirmed)
> One notable versioning split: merchants who joined **after 2022** use the newer **Integrated Loyalty Page / Theme Editor + Loyalty Pop-up**; merchants from before 2022 may still run the **legacy Loyalty Panel** SDK component. Field vocabulary below is drawn from the current product where they differ. (confirmed)

## identity
- **name**: LoyaltyLion Loyalty Program (formerly listed as "LoyaltyLion Rewards & Referral" / "LoyaltyLion: Rewards & Loyalty") (confirmed)
- **vendor**: LoyaltyLion (London, UK) (confirmed)
- **category**: Loyalty and rewards (under Marketing and conversion → Customer loyalty) (confirmed)
- **App Store URL**: https://apps.shopify.com/loyaltylion (confirmed)
- **rating**: 4.6 / 5 (confirmed)
- **review count**: ~507–511 reviews (~83% five-star, ~9% four-star, ~8% lower) (confirmed)
- **install signal**: "Trusted by 10,000+ Shopify brands" (vendor claim; not a Shopify-verified install count) (confirmed as a claim / (inferred) as literal live-install count)
- **pricing model**: Freemium, order-volume tiered subscription with a large jump to paid (confirmed):
  - **Free** — free to install; up to **400 monthly orders**; points for on-site activities; discount rewards (£ and %); branding/customization; analytics and segments; real-time notifications; 7 pre-written languages.
  - **Classic** — **$199/month**; free loyalty page design (advertised $1,500 value); customizable rules and rewards; unlimited integrations; VIP tiers; POS locations; revenue reporting; Klaviyo flows; 5-star onboarding; 14-day free trial.
  - Higher enterprise/"Advanced"/"Plus" tiers exist above Classic (higher order volume, guest referrals, gift-card rewards on Shopify Plus, advanced analytics) — negotiated/quote-based. (inferred — plan names referenced in help docs but exact prices not on the public listing)
- No "Built for Shopify" badge confirmed on the listing (inferred — not surfaced in fetches)

## surfaces
LoyaltyLion is fundamentally **multi-surface**: a hosted loyalty backend (points ledger + rules engine + reward catalog) that projects onto many Shopify surfaces, all reading/writing one customer points balance. Mapped to our allowlist:

- **theme.section** (as theme app embeds / SDK-injected components) (confirmed):
  - **Loyalty Widget / launcher** — a small floating bar/button (default bottom of page) showing the logged-in customer's points balance; click opens the Loyalty Pop-up/Panel modal. Shows on **every page** by default.
  - **Loyalty Pop-up / Loyalty Panel** — modal or embedded panel with tabbed sections: Home (welcome), ways to earn (activities), ways to spend (rewards), referral, tier progress, sign-up/login splash for guests, FAQ/content tab.
  - **Integrated Loyalty Page** — a full dedicated loyalty landing page embedded into the theme, edited via the LoyaltyLion **Theme Editor** / **Loyalty Page Editor** (sections, tiles, buttons).
  - **Product-page / on-site points displays** — "earn X points" style prompts (via SDK components). (inferred)
- **customerAccount.blocks** (confirmed): loyalty program embedded directly in **customer account pages** (points balance, rewards, tier status) — listing explicitly claims embedding "in your storefront, checkout, and customer account pages."
- **checkout.block** / **checkout.upsell** (confirmed as a claim): listing claims the program embeds "in your checkout." On Shopify this is a **Checkout UI extension** surfacing points/rewards at checkout (Plus + higher plan gated). (inferred: mechanism = Checkout UI extension; exact reward types redeemable at checkout not confirmed)
- **pos.extension** (confirmed): Shopify **POS** integration — customers earn points for in-store purchases and redeem rewards across online + physical locations; "POS locations" is a Classic-plan feature.
- **flow.automation** (confirmed): **Shopify Flow** compatible — Flow triggers/actions can award points / drive loyalty side-effects on arbitrary store events. Also integrates with Klaviyo/Attentive/Gorgias for loyalty-driven email/SMS.
- **analytics.pixel** (inferred): LoyaltyLion tracks loyalty events and exposes analytics/segments internally; not confirmed as a Shopify Web Pixel extension — event tracking is via its own SDK.
- **admin.block / admin.action** (inferred): merchant configuration lives inside LoyaltyLion's **own embedded admin** (Activity rules, Rewards, Loyalty tiers, Customize, Settings), not native Shopify admin blocks/actions.

**Coordination**: A single **hosted points ledger per customer**, keyed to the Shopify customer identity, is the shared state. Widget → Pop-up/Panel → Integrated Loyalty Page → customer-account block → checkout extension → POS all read/write the **same balance and reward catalog**. Guest vs logged-in is the primary state switch (guests see a "Loyalty Splash" / sign-up prompt; members see full functionality). Redeeming a reward anywhere mints a **Shopify discount code** (or Plus gift card) applied to the order; earning anywhere credits the same balance. Referral links, tier state, and point approval/expiry are all evaluated server-side against this one ledger, so every surface is a read/write view of one backend, not an independent widget.

## functional_model
Core entities (shapes inferred from documented behavior; field names concrete where confirmed):
- **customer/member** = { shopify_customer_ref, points_balance (approved), points_pending, lifetime_spend_12mo, lifetime_points_12mo, current_tier_ref, birthday?, referral_link } (confirmed concept; field names inferred)
- **activity_rule** (earning rule) = { type ∈ {make_purchase, join_program, newsletter_signup, birthday, social_follow[facebook|instagram|x|tiktok], celebrate/anniversary, refer_a_friend, leave_review, purchase_from_collection, custom}, points_awarded (numeric) OR points_per_currency (e.g. 5 pts per £1), limit_cap (X times per day/week/month/year), active, tier_overrides } (confirmed types; some fields inferred)
- **reward** = { type ∈ {discount_flat, discount_percentage, free_shipping, free_product_voucher, free_product_seamless, product_discount_voucher, auto_topup_voucher, custom, subscription, gift_card(Plus), in_cart_product(Shopify)}, points_required (numeric), active (toggle), country_restrictions, discount_combinations (toggle, Shopify), expiry_period, minimum_spend?, tier_visibility } (confirmed)
- **tier** = { name (text), entry_mode ∈ {amount_spent | points_earned}, boundary_value (numeric, 0–999,999), reset_period ∈ {rolling_12mo | calendar_year | lifetime}, benefits[] (activity multipliers, reduced reward cost, exclusive rewards, free shipping), refund_downgrade (toggle) } (confirmed)
- **referral** = { referrer_points, referrer_reward_ref, approval_period (default 14 days), referrer_minimum_spend, friend_voucher_type ∈ {amount_off | percentage_off(+max cap) | free_shipping}, friend_voucher_minimum_spend, friend_collection_restriction (Shopify/Plus), ip_block (toggle), monthly_limit (+ soft/hard stop), guest_referrals (toggle, Advanced+) } (confirmed)
- **points_transaction** (ledger entry) = { customer_ref, activity_ref?, reward_ref?, points_delta, status ∈ {pending | approved | used | expired}, created_at } (inferred)
- **discount_code / gift_card** (side-effect artifact minted on redemption) = { code, value, type, applied_order } (confirmed concept)

Relationships: member → many activity events → points_transactions (credit) → balance; balance → redemption → reward → points_transactions (debit) + minted discount/gift card; balance/spend → tier assignment; tier → modifies earning multipliers + reward costs + reward visibility; referral link → referred order → credits referrer + issues friend voucher.

## settings_taxonomy
Actual merchant-facing controls, grouped under five headings.

### content
- **Program name / points currency name** — text (e.g. rename "points" to "Lion Coins"). (confirmed)
- **Welcome message** (Loyalty Pop-up Home tab) — text. (confirmed)
- **Sign-up / login message** (guest splash) — text. (confirmed)
- **FAQ / content tab** — rich text editor, per-question, translatable. (confirmed)
- **Activity rule copy** — name + description shown to shoppers per earning rule. (inferred)
- **Reward name / description** — text per reward. (confirmed)
- **Tier names** — text (e.g. "Baby Lion / Growing Lion / Lion King" or "Bronze / Silver / Gold"). (confirmed)
- **Loyalty emails** — fully customizable email templates (earned points, reward reminders, tier changes). (confirmed)
- **Languages** — 7 pre-written language packs (Free); translatable UI strings. (confirmed)

### style
- **Primary color** — color picker. (confirmed)
- **Secondary color** — color picker. (confirmed)
- **Widget button background color** — color picker. (confirmed)
- **Widget button text color** — color picker. (confirmed)
- **Widget position** — select/dropdown (where the floating button appears). (confirmed)
- **Loyalty Panel / Integrated Loyalty Page styling** — per-section colors, buttons, tiles, icons via Theme Editor / Loyalty Page Editor (no HTML/CSS required). (confirmed)
- **Panel icons** — swap icons on the standard loyalty panel. (confirmed)
- **Loyalty page layout / section order & placement** — editable section positions on the page. (confirmed)

### targeting
- **Country restrictions** (per reward) — limit reward availability by geographic region. (confirmed)
- **Collection restriction** (referral friend voucher, and purchase-from-collection activity) — product collection ID (Shopify/Plus). (confirmed)
- **Tier visibility / exclusive rewards** — restrict a reward to specific higher tiers. (confirmed)
- **Guest vs logged-in display** — splash/sign-up prompt for guests; full panel for members. (confirmed)
- **Guest referrals enable** — toggle (Advanced+ plans). (confirmed)
- **Show-on-page** — toggle to hide the widget (note: page-specific display not fully supported; widget designed to show on all pages). (confirmed)

### behavior
- **Points-per-currency (purchase rule)** — numeric (e.g. 5 points per £1). (confirmed)
- **Points awarded (per activity)** — numeric per rule. (confirmed)
- **Rule limit / cap** — reward X times per day / week / month / year (select + numeric). (confirmed)
- **Points required (per reward)** — numeric. (confirmed)
- **Reward active status** — toggle (show/hide without deleting). (confirmed)
- **Discount combinations / stacking** — toggle (Shopify). (confirmed)
- **Reward / point expiry period** — duration. (confirmed)
- **Minimum spend (voucher condition)** — numeric. (confirmed)
- **Tier entry mode** — select {amount spent | points earned}. (confirmed)
- **Tier boundaries** — numeric up to 999,999 (editable only before launch). (confirmed)
- **Tier reset period** — select {rolling 12 months | calendar-year | lifetime}. (confirmed)
- **Tier benefits** — per-tier: earn multiplier (activity points), reduced reward cost, exclusive rewards, free shipping. (confirmed)
- **Refund downgrade behavior** — toggle (auto-demote on refund, spend-based tiers). (confirmed)
- **Referral approval period** — duration (default 14 days). (confirmed)
- **Referrer minimum spend** — numeric (friend must spend over this on first order). (confirmed)
- **Referral fraud: IP address blocking** — toggle. (confirmed)
- **Referral monthly limit** — numeric + enforcement mode {keep link active (soft) | deactivate link (hard)}. (confirmed)
- **Referred-friend voucher type** — select {amount off | percentage off (+ optional max cap) | free shipping}. (confirmed)

### data
- **Birthday collection** — collect birthday data field to gift points annually. (confirmed)
- **Custom activities** — define custom data-collecting actions (profile completion, quizzes). (confirmed)
- **Customer segments** — build/segment members for win-back campaigns. (confirmed)
- **Analytics / revenue reporting** — loyalty-attributed revenue, reward engagement, customer behavior metrics. (confirmed)
- **Integrations config** — connect Klaviyo, Attentive, Gorgias, ReCharge, Loox, Yotpo, Tapcart, POS, Shopify Flow (50+). (confirmed)
- **Gift card rewards config** — Shopify Plus only. (confirmed)

## data_model
- **Points ledger + member records** — persisted in **LoyaltyLion's own hosted database** (external DB, keyed to Shopify customer id), NOT in Shopify metafields/metaobjects. Holds balances, pending/approved/used/expired transactions, tier assignment, referral links, birthday. (confirmed concept / (inferred) storage location)
- **Reward catalog + activity rules + tier config** — persisted in LoyaltyLion admin backend. (confirmed)
- **Discount codes** — on redemption, LoyaltyLion mints **Shopify discount codes** via the Shopify API (or **gift cards** on Plus) representing the redeemed reward. (confirmed)
- **Referral links / codes** — generated per member, tracked server-side with approval windows + fraud checks (IP, monthly caps). (confirmed)
- **UI assets / theme injection** — loyalty widget, panel, and Integrated Loyalty Page injected via SDK / theme app embed; styling config stored in LoyaltyLion admin. (confirmed)
- **Emails** — customizable loyalty email templates stored/sent by LoyaltyLion (or via Klaviyo flows). (confirmed)
- **Media/CDN** — panel icons/imagery hosted by LoyaltyLion. (inferred)

## visual_patterns
- **Layout archetypes**: floating launcher bar (bottom, points balance visible) → tabbed modal pop-up (Home / Earn / Spend / Referral / Tier / FAQ); plus a full-page **Integrated Loyalty Page** with stacked sections and tiles (points balance card, ways-to-earn grid, rewards grid, tier progress bar, referral share block). (confirmed)
- **Component states**: guest state ("Loyalty Splash" / sign-up CTA) vs logged-in member state (balance + claimable rewards + tier progress); reward active/inactive; points pending vs approved; tier locked/unlocked; referral link active vs deactivated (fraud cap). (confirmed)
- **Motion/interaction**: click launcher → modal opens; tab switching within panel; redeem reward → discount code generated + copyable/applied; referral → share via link/email/social; tier progress bar fills toward next boundary; real-time balance notifications. (confirmed)
- **Branding**: primary/secondary color theming, widget button color + position, editable per-section colors/buttons/icons/tiles via no-code Theme Editor. (confirmed)

## reviews_signal
**Praises (top):**
1. Responsive, genuinely helpful support team (specific reps named — Hannah, Sathiya). (confirmed)
2. Fast, "speedy and seamless" onboarding — some live in under 48 hours; setup described as "easy and self explanatory." (confirmed)
3. Flexible, effective tier + points system that "incentivises repeat purchases and customer engagement," with visible ROI. (confirmed)
4. Strong integration ecosystem (Shopify, Klaviyo, POS, 50+ tools). (confirmed)
5. Smooth migration from competing loyalty platforms. (confirmed)

**Complaints (top):**
1. **Pricing** — the jump from Free (400 orders) to $199/mo Classic is a major friction point; called a "predatory price increase," long-time free-plan users churning. (confirmed)
2. **Support delays on critical issues** — some report fixes taking "DAYS, WEEKS," escalations met with "one big shoulder shrug." (confirmed)
3. **Slow time-to-value** — realistic setup 3–6 months, results at 6–12 months; not a quick win. (confirmed)
4. Cost escalation over multi-year tenure driving established customers away. (confirmed)

## mapping_note
LoyaltyLion maps onto our RecipeSpec only at the **surface/widget layer** (the theme app embed / loyalty widget, panel, and Integrated Loyalty Page are theme.section-shaped; the account block is customerAccount.blocks; checkout embed is checkout.block; POS is pos.extension). But the app **massively EXCEEDS a single-module recipe**:

- **Requires a persistent external data store** — a per-customer points ledger (balances, pending/approved/expired transactions, tier state, referral links) lives in LoyaltyLion's own hosted DB, not in a single module's config or Shopify metafields. No stateless recipe can hold this.
- **Is a cross-surface blueprint with one shared backend** — widget + panel + loyalty page + customer-account block + checkout extension + POS all read/write the same balance and reward catalog; they coordinate via server-side identity + ledger, not independent modules.
- **Contains a rule/tier engine with background jobs** — earning rules with per-period caps, point approval windows, tier re-evaluation (rolling 12-mo / calendar / lifetime), point expiry, referral approval periods, and fraud checks (IP block, monthly caps) all require scheduled/async server-side evaluation.
- **Performs external Shopify side-effects on redemption** — mints Shopify discount codes (or Plus gift cards) via the Admin API when points are spent, and integrates outward to Klaviyo/Attentive/Flow to trigger loyalty emails/automations.
