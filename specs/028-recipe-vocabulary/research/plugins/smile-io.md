# Smile: Loyalty Program Rewards (Smile.io)

> Vocabulary study record. The app is live and current (not renamed/deprecated). It was historically listed as "Smile: Rewards & Loyalty" and is now "Smile: Loyalty Program Rewards" — same vendor (Smile.io), same app ID `smile-io`, continuous since Dec 2014. No merge/deprecation; only a listing-title refresh. (confirmed)

## identity
- **name**: Smile: Loyalty Program Rewards (formerly "Smile: Rewards & Loyalty") (confirmed)
- **vendor**: Smile.io (Waterloo, ON, Canada) (confirmed)
- **category**: Loyalty and rewards (under Marketing and conversion) (confirmed)
- **App Store URL**: https://apps.shopify.com/smile-io (confirmed)
- **rating**: 4.9 / 5 (confirmed)
- **review count**: ~4,300 reviews (listing showed 4,296; ~85–91% five-star) (confirmed)
- **install signal**: ~57,000 live Shopify installs (StoreLeads reported 57,307) — one of the most-installed loyalty apps on the platform (confirmed)
- **pricing model**: Freemium, order-volume tiered subscription (confirmed):
  - **Free** — $0, 200 orders/mo: points, rewards, referrals, 15+ earning methods, branding, POS support
  - **Essential** — $15/mo, 500 orders/mo: dedicated loyalty page, free-product rewards, nudges, analytics, 1 integration
  - **Standard** — $79/mo, 1,000 orders/mo: bonus point events, product-page embeds, subscription rewards, 2 integrations
  - **Growth** — $199/mo, 2,500 orders/mo (+$20 per additional 100 orders): Loyalty Hub, VIP tiers, expiring points, benchmarks, 25+ reports, unlimited integrations
  - Enterprise/Plus tier exists above Growth (points-at-checkout, higher volume). (confirmed)
- **"Built for Shopify"** badge (confirmed)

## surfaces
Smile is fundamentally **multi-surface** — a hosted loyalty backend that projects itself onto many Shopify surfaces, all sharing one customer points ledger. Mapped to our allowlist:

- **theme.section** (as theme app blocks / app embeds) (confirmed):
  - **Rewards Launcher** — floating on-site button (app embed), bottom-left/right, opens the panel.
  - **Rewards Panel** — the slide-out loyalty widget (nudge/panel) rendered on-site over the launcher.
  - **Product-page points block** — theme app block showing "Earn [points_amount] points" near price.
  - **Nudges / pop-ups / banners** — on-site reminder surfaces (paid).
  - **Order thank-you / order-status promotion.**
- **checkout.block** / points-at-checkout (Shopify **Checkout UI extension**) (confirmed): signed-in customers view balance, browse rewards, apply a discount reward inline at checkout. **Requires Shopify Plus + Smile Growth/Plus.** Supports only fixed dollar/percent discount rewards (no free product/shipping/gift-card at checkout). Recommended left-column placement.
- **customerAccount.blocks** (Customer Account UI extension / account app block) (confirmed): "Points on account page" block + full **Loyalty Hub** (member area to track points, claim rewards, see VIP status) embedded in new customer accounts.
- **pos.extension** (confirmed): Shopify POS support — earn/redeem points in-store; in-store earning has separate settings from online.
- **flow.automation** (confirmed): integrates with **Shopify Flow**; "automate bonus point rewards based on custom triggers" — Flow triggers/actions award points on arbitrary store events. Also drives transactional/marketing emails (points earned, reward reminders, points-expiry warnings, tier changes).
- **analytics.pixel** — not a storefront pixel per se, but Smile records loyalty events/analytics and 25+ reports/benchmarks internally (inferred — event tracking, not a Shopify Web Pixel extension).
- **admin.block / admin.action** — the merchant configures everything inside the embedded Smile Admin (Shopify-embedded app), not via native admin blocks. (inferred: config lives in the app's own embedded admin, not Shopify admin action/block extensions.)

**Coordination**: A single hosted **points/loyalty ledger per customer** (keyed to the Shopify customer) is the shared state. Launcher → Panel → Loyalty Hub → checkout extension → POS all read/write the same balance and reward catalog. Redemption anywhere mints a **Shopify discount code** applied to the order; earning anywhere credits the same balance. Referral links, VIP tier state, and points expiry are all evaluated against this one ledger, so surfaces are read/write views of one backend, not independent widgets.

## functional_model
Core entities (concrete shapes, inferred field names from documented behavior):
- **member** = { customer_ref (Shopify customer id), points_balance, vip_tier_ref, birthday?, referral_link, joined_at, last_activity_at } — a member is a Shopify customer enrolled in the program.
- **earning_action** (a "way to earn") = { type ∈ {place_order, signup/create_account, celebrate_birthday, social_follow_instagram, social_like_facebook, social_share_facebook, social_follow_tiktok/x, product_review, click_a_link, custom/Flow_trigger}, points_value (number), points_per_currency (for orders), repeatable | one_time, earning_limit?, icon, display_name, status(active/disabled), link_url? (for click-a-link/social) }.
- **earning_limit** = { enabled(bool), timeframe (per day/week/month/year), max_completions (number) } — attached to an earning_action; caps redemption frequency / fraud.
- **reward** (a "way to redeem") = { type ∈ {amount_discount, percentage_discount, free_shipping, free_product}, points_cost (number), discount_value (number or %), redemption_style ∈ {fixed, incremental}, min_points?, max_points? (incremental only), product_ref? (free product), name, icon }.
- **redemption** = { member_ref, reward_ref, points_spent, generated_discount_code (Shopify code), created_at }.
- **vip_tier** = { name (e.g. Silver/Gold/Platinum), threshold (spend OR points), entry_reward[], ongoing_perks[] (points multiplier, early access, exclusive rewards/events), order } — evaluated over calendar-year or lifetime window.
- **referral** = { advocate_ref, referred_email, advocate_reward (reward-like), friend_reward (reward-like, guest, no points), status ∈ {pending, completed}, referral_url } — friend reward emailed on email capture; advocate reward issued only after referred purchase.
- **points_expiry_policy** = { enabled, inactivity_period, warning_emails } — whole-balance reset on inactivity.
- **bonus_event / points_campaign** = { multiplier or bonus, start/end, scope } — time-boxed accelerated earning.

Relationships: member 1—* redemption; member *—1 vip_tier; earning_action 1—1 earning_limit; referral *—1 advocate(member); reward → generates discount_code per redemption.

## settings_taxonomy
The real merchant-facing knobs, grouped. This is the deepest section.

### content
- **Points currency name** — text (e.g. "stars", "glam bucks"); singular/plural. (confirmed)
- **Ways to earn** — add/enable a set of action types, each with **Display name** (text) and **Icon** (image/preset picker). Action types: Place an order, Create an account / Sign up, Celebrate a birthday, Follow on Instagram, Like on Facebook, Share on Facebook, Follow on TikTok / X, Leave a product review, Click a link (custom engagement w/ URL), Shopify Flow custom trigger. (confirmed)
- **Ways to redeem (reward names)** — each reward has a **Name** and **Icon**. (confirmed)
- **Program card titles & descriptions** — text per program card in the panel (Points / Referrals / VIP). (confirmed)
- **Panel banner headline / homepage text** — text shown at top of panel. (inferred)
- **Product-page block text** — separate messaging for **members vs non-members**; supports `[points_amount]` variable token. (confirmed)
- **Nudge / pop-up copy** — text (paid). (confirmed)
- **Referral share copy & channels** — Facebook, X, Email by default. (confirmed)

### style
- **Launcher position** — select: left / right (Settings > Branding > Placement). (confirmed)
- **Launcher spacing** — number: side offset + bottom offset (Spacing menu). (confirmed)
- **Launcher color** / **Launcher text color** — color picker or hex code (On-site content > Launcher > Customize). (confirmed)
- **Launcher style/shape** — icon vs text button (preset). (inferred)
- **Launcher visibility** — show/hide rules (which pages, mobile). (confirmed — "launcher visibility" article)
- **Panel banner image** — image upload (top of panel). (confirmed)
- **Brand icon / logo** — image upload (top-left of panel). (confirmed)
- **Wallpaper / background pattern** — patterned background behind banner + cards (preset/pattern). (confirmed)
- **Theme colors** — Settings > Branding > Theme (primary/accent). (confirmed)
- **Program card order** — reorder cards within panel (drag/sort). (confirmed)
- **Product-page block styling** — Primary color (text), Secondary color (background), image on/off toggle, custom image upload with **height 16–80px** (number), Points vs currency-name label (select). (confirmed)
- **Checkout extension placement** — left/right column (recommend left; right collapses on mobile). (confirmed)

### targeting
- **Program participation** — select: All customers / Only customers with a store account (Settings > Program Participants). (confirmed)
- **VIP tier thresholds** — number: spend amount OR points earned per tier milestone. (confirmed)
- **VIP tier period** — select: single calendar year / lifetime. (confirmed)
- **Earning limits** — per earning_action: toggle "Limit the number of times each customer can complete this action" + timeframe (select) + max count (number). (confirmed)
- **Reward min/max points** (incremental rewards) — number floor/ceiling to protect margin. (confirmed)
- **Launcher visibility by page / device** — targeting which pages/devices show the launcher. (confirmed)
- **Bonus point events** — time-window targeting (start/end) for accelerated earning (Standard+). (confirmed)

### behavior
- **Points per dollar (order earning)** — number, whole points per 1 currency unit; standard rounding. (confirmed)
- **Points value per action** — number for each non-order action. (confirmed)
- **Redemption style** — select: Fixed reward (set points→discount) vs Incremental reward (customer chooses amount in steps). (confirmed)
- **Reward type** — select: Amount discount / Percentage discount / Free shipping / Free product. (confirmed)
- **Points cost / Discount value** — number pair per reward (free product: points_cost + max dollar the reward covers). (confirmed)
- **Points expiry** — toggle + inactivity period; whole-balance reset; warning emails (Growth/Plus). (confirmed)
- **Order settings** — when points calc happens (on order paid/fulfilled), refunds/cancellation behavior. (confirmed — "update order settings")
- **Referral: advocate reward** — type (amount/%/free ship/free product/gift card/points) + value; issued only after referred purchase; default $5. (confirmed)
- **Referral: friend/guest reward** — type (amount/%/free ship/free product) + value; NO points (guest has no account); emailed on email capture. (confirmed)
- **VIP entry rewards** — one-time rewards on tier entry (free product, discount, points-multiplier boost). (confirmed)
- **VIP ongoing perks** — points multiplier, early/exclusive access, events, auto contest entry. (confirmed)
- **Nudges** — enable on-site reminders (Essential+). (confirmed)

### data
- **Integrations** — connect Klaviyo, Mailchimp, Judge.me, Loox, Gorgias, Recharge, Shopify Flow (# of integrations gated by plan: 1 / 2 / unlimited). (confirmed)
- **Analytics / reports** — 25+ reports + industry benchmarks (Growth+). (confirmed)
- **Manual points adjustment** — issue/deduct points to a member (admin action). (confirmed)
- **Program status** — activate/deactivate whole program; per-action active/disabled. (confirmed)

## data_model
- **Persisted in Smile's hosted backend** (external DB, not Shopify): per-customer **points balance/ledger**, earning-action config, reward catalog, VIP tier definitions + member tier state, referral records, points-expiry state, bonus events, analytics events. Keyed to the Shopify **customer id**. (confirmed / inferred for storage location)
- **Shopify discount codes**: redemptions and referral rewards materialize as native **Shopify discount codes** applied to orders — "Smile uses Shopify's discount codes, so your existing store rules apply." (confirmed)
- **Shopify customer / metafields & customer-account surfaces**: points balance surfaced via customer-account UI extension / account app block; product-page app block reads live product price to compute `[points_amount]`. (confirmed for blocks; metafield mirroring is inferred)
- **Media/CDN**: launcher/panel banner image, brand icon, wallpaper patterns, reward/action icons, product-block custom image uploaded and hosted by Smile. (confirmed)
- **Emails**: transactional (points earned, reward redeemed, referral, points-expiry warnings, tier change) sent from Smile. (confirmed)
- **POS**: in-store earn/redeem events recorded against the same ledger. (confirmed)

## visual_patterns
- **Layout archetypes**: (1) floating **circular/pill launcher** pinned to a screen corner; (2) **slide-in panel** (right or over launcher) with a branded banner header, brand icon, and a stack of **program cards** (Points / Ways to earn / Ways to redeem / Referrals / VIP); (3) **inline product-page badge** ("Earn N points"); (4) **customer-account Loyalty Hub** full-width member dashboard; (5) **checkout dropdown** of redeemable rewards. (confirmed)
- **Component states**: member vs non-member (different copy/CTA — "Sign up to earn" vs balance shown); reward affordable vs not-yet-enough-points; action available vs already-completed (one-time social/birthday actions collapse after click); VIP locked vs unlocked tier; points-expiry warning banner. (confirmed / inferred)
- **Motion/interaction**: launcher click toggles panel slide/fade; social & birthday earning actions require **clicking directly in the panel** (opens platform link / captures birthday) rather than passive tracking; incremental reward has a **slider/stepper** to pick discount amount; redeem action generates a code + apply-to-cart CTA. (confirmed)
- **Branding**: every surface (launcher, panel, emails, notifications, hub) is themeable to the store's colors/patterns "without touching code." (confirmed)

## reviews_signal
**Praises** (top):
1. Exceptionally responsive, friendly customer support. (confirmed)
2. Easy, near-zero-code Shopify integration / fast setup. (confirmed)
3. Real lift in customer engagement and repeat purchases. (confirmed)
4. Long-term reliability — merchants cite 5+ years of continuous use. (confirmed)
5. Intuitive UI that scales with the business; generous free tier to start. (confirmed)

**Complaints** (top):
1. **Checkout redemption gated to Shopify Plus** — standard-plan customers accrue points but can't redeem at checkout; cited as a reason to switch apps. (confirmed)
2. **Aggressive feature-gating / paywall UX** — features unavailable on your plan still appear clickable, "wasting time" and pressuring upgrades. (confirmed)
3. **Pricing steep for small merchants** — key features (VIP, expiry, Loyalty Hub, integrations) locked behind $199 Growth. (confirmed)
4. **Order-based pricing scales unpredictably** — overage fees ($20/100 orders) sting high-volume stores. (inferred from pricing model + complaints)
5. **Pushy post–negative-review outreach** (email/phone follow-ups after critical feedback). (confirmed)

## mapping_note
Maps to our RecipeSpec vocabulary as a **cross-surface loyalty blueprint**, not a single module. Direct fits: theme app blocks (launcher/panel/product badge) → `theme.section`; account hub → `customerAccount.blocks`; points-at-checkout → `checkout.block`; POS earn/redeem → `pos.extension`; bonus-point automations → `flow.automation`; internal loyalty analytics → `analytics.pixel`-adjacent.

Where it **exceeds a single-module recipe**:
- **Requires a persistent stateful data store**: a per-customer points ledger + reward catalog + VIP/referral/expiry state that lives across sessions and surfaces. A stateless module recipe cannot hold this.
- **Coordinated multi-surface blueprint sharing one state**: launcher, panel, product block, account Loyalty Hub, checkout extension, and POS are all read/write views of the SAME balance — needs a blueprint of ≥6 coordinated extensions with a shared backend, not one section.
- **Rule engine + background jobs**: earning rules with time-window limits, VIP tier evaluation (calendar-year vs lifetime), points-expiry with scheduled warning emails, and bonus-event windows require a scheduler/worker and rule evaluation, not declarative config alone.
- **External side-effects**: mints native Shopify discount codes on redemption, sends transactional/marketing emails, fires Shopify Flow triggers, and fans out to third-party integrations (Klaviyo/Judge.me/Recharge/etc.) — real outbound effects beyond rendering a module.
