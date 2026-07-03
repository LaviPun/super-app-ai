# Stamped Reviews & Loyalty

> Vocabulary study record for the constrained AI generation system. Facts labeled `confirmed`
> (from App Store listing, Stamped Help Center, or review aggregators) or `(inferred)`
> (reasoned from behavior/docs but not directly stated).

**Rename/merge note (confirmed):** The vendor historically shipped two separate App Store
apps — "Stamped Product Reviews & UGC" and "Stamped Loyalty & Referrals"
(`apps.shopify.com/stamped-io-loyalty-rewards`). The standalone **Loyalty & Referrals listing
is now dead** ("This app is not currently available on the Shopify App Store"). Both products
have been consolidated into the single unified listing **Stamped Reviews & Loyalty**
(`apps.shopify.com/product-reviews-addon`), which now sells Reviews and Loyalty as two pricing
tracks under one app install. This record studies that unified current app. Loyalty internals
below are still served from the same Stamped backend / help center (`help-rewards.stamped.io`,
`stampedsupport.stamped.io`) that powered the old standalone loyalty app, so the vocabulary
carried over intact.

## identity
- **name:** Stamped Reviews & Loyalty `confirmed`
- **vendor:** Stamped.io (Stamped) `confirmed`
- **category:** reviews (also loyalty/rewards; unified app) `confirmed`
- **App Store URL:** https://apps.shopify.com/product-reviews-addon `confirmed`
- **rating:** 4.7 / 5 `confirmed`
- **review count:** ~3,609–3,625 reviews `confirmed` (varies by capture date)
- **install signal:** Not shown as an install count on the listing; long-tenured incumbent in
  the reviews category with thousands of reviews and enterprise/DTC positioning implies a very
  large install base (tens of thousands) `(inferred)`
- **pricing model:** Order-volume-tiered subscription, split into two tracks `confirmed`:
  - Reviews: $23/mo (200 orders) → $99/mo (1,000) → $199/mo (5,000) → custom (20k+)
  - Loyalty: $299/mo (5,000 orders) → custom (20k+); free/starter tier also exists historically
  - Several premium widgets/features gated to Professional / Business plan tiers `confirmed`

## surfaces
Stamped is deliberately **multi-surface**; a single install renders reviews, loyalty, and
collection UI across storefront, checkout, email/SMS, customer account, POS, and admin.

- **theme.section / theme app block** — the primary review surfaces. Main Reviews Widget
  (product-page review list + summary graph + Q&A tab), Product Rating Badge (star badge under
  title), and the full library of Display Widgets (Carousel, Full-Page all-reviews, Reviews
  Popup, Single Highlight, Visual Gallery/UGC, Wall Photos, Top Rated carousel, Site Badge,
  Instagram Feed, NPS carousel). Installed as Shopify 2.0 app blocks in the Theme Editor.
  `confirmed`
- **proxy.widget / floating launcher** — Loyalty & Rewards launcher (floating "rewards" bubble
  + slide-out panel showing points balance, ways to earn/redeem, referral link, VIP tier),
  the Side Drawer reviews tab, and the Reviews Popup. These are script-injected floating
  overlays rather than in-flow theme blocks. `confirmed` for existence; `(inferred)` that they
  ride the app-embed/script surface rather than a section
- **checkout.block / checkout.upsell** — Checkout Reviews collection prompt ("Why did you buy
  this item?") and review display at checkout; loyalty points-earning/redemption context can
  surface at checkout. Shopify paid plan required. `confirmed`
- **pos.extension** — Loyalty exposes **POS Amount discount** and **POS Percentage off**
  redemption reward types explicitly scoped to Shopify POS. `confirmed`
- **customerAccount.blocks** — Loyalty/rewards page and points history live in the customer
  account context; a dedicated rewards landing page is offered. `confirmed`
- **analytics.pixel** — App tracks review-request conversions, loyalty redemption, repeat-
  purchase attribution, and "Stamped IQ" AI insights; behaves as an analytics/event surface.
  `confirmed` (feature) / `(inferred)` (exact pixel-extension mechanism)
- **flow.automation** — Ships a **Shopify Flow** integration; loyalty/review events can trigger
  Flow, and internal automations (review request email/SMS sequences, review moderation
  automation, campaign automations) are effectively a flow engine. `confirmed`
- **admin.block / admin.action** — Merchant dashboard for moderating reviews, replying, points
  adjustment, manual tier assignment, bulk import/export. This is Stamped's own embedded admin
  (largely its own SPA, not native Admin UI extensions). `confirmed` (dashboard) / `(inferred)`
  (extension surface classification)
- **NOT used:** functions.cartTransform, functions.deliveryCustomization,
  functions.paymentCustomization, postPurchase.offer (native post-purchase page extension).
  Discounts are issued as **discount codes / Shopify price rules**, not Discount Functions.
  `(inferred)`

**Cross-surface coordination (confirmed pattern):** All surfaces read/write one shared
Stamped-hosted customer+loyalty+review store. A review submitted on the storefront widget or
via the email/SMS sequence lands in the same moderation queue that the admin block manages and
that the display widgets render. A loyalty action on one surface (e.g. "Write Review" earns
points) is credited to the same points ledger the launcher, customer-account page, checkout
redemption, and POS discount all read. Reviews→Loyalty is an explicit handoff: the UGC earning
rules ("Write Review / Upload Photo / Upload Video / Submit NPS / Answer Question") require the
Reviews app and feed the Loyalty points ledger. Aggregate rating/count are mirrored back into
Shopify **metafields** so the theme and Google Shopping can read them without hitting Stamped.

## functional_model
Core entities (names/shapes partly `(inferred)` from behavior; relationships `confirmed`):

- `review = { rating(1–5), title, body, author_name, author_email, verified_buyer(bool),
  photos[], videos[], product_ref, variant_ref, votes_up/down, custom_form_answers{},
  status(pending|published|rejected|spam), source(email|sms|onsite|checkout|import|
  syndication), reply(merchant), created_at, language }`
- `question = { body, answers[], product_ref, author, votes }` (Q&A tab, separate from reviews)
- `nps_response = { score(0–10), comment, customer_ref }`
- `product_rating_rollup = { product_ref, avg_rating, review_count }` → mirrored into Shopify
  metafields `stamped.reviews_average` / `stamped.reviews_count` and new
  `reviews.rating.value` / `reviews.rating_count.value` `confirmed`
- `customer_loyalty = { customer_ref, points_balance, lifetime_points, vip_tier_ref,
  referral_code, birthday, anniversary }`
- `points_transaction = { customer_ref, delta, reason(earn_rule|redeem|adjustment|expiry),
  rule_ref, created_at, expires_at }` (an append-only ledger) `(inferred)`
- `earn_rule` / `redeem_rule` (see settings_taxonomy) — configurable rule objects
- `vip_tier = { name, qualification_type(points|purchases|amount_spent), threshold,
  tier_term, benefits[], order }`
- `referral = { advocate_customer_ref, referred_email, reward_advocate, reward_friend,
  status }`
- `review_request = { order_ref, customer_ref, sequence_index, channel(email|sms), delay,
  send_time, status(scheduled|sent|opened|converted) }`
Relationships: review → product/variant → rating_rollup; review/UGC actions → earn_rule →
points_transaction → customer_loyalty → vip_tier; order → review_request(s) → review; customer
→ referral → points_transaction.

## settings_taxonomy
The deep section. Actual merchant-facing knobs from the Stamped dashboard/help center.

### content
Main Reviews Widget `confirmed`:
- Widget Style — `select[Standard, 2-Column, Slick Slider, Profile, Masonry, Minimalist]`
- Language — `select[ISO 2-letter codes]`
- Reviews Per Page — `number` (default 5, max 20)
- Limit Words — `number` (truncate long review bodies)
- Sort Type — `select[Most recent(default), Highest rating, Lowest rating, Most votes,
  Least votes, With photos, Language]`
- Date Format — `select[multiple formats]`
- Show Graph (rating summary) — `toggle`
- Show Photo Summary — `toggle`
- Show Recommended Percentage — `toggle`
- Show Reviews Tab — `toggle`
- Show Questions & Answers Tab — `toggle`
- Show Customer Avatar — `toggle`
- Show Verified Buyer Badge — `toggle`
- Show Review Date / Q&A Date — `toggle` (each)
- Show Product & Variant Info — `toggle`
Display widgets `confirmed`:
- Minimum Rating to display — `number` (default shows 5-star only; lower to include ≤4★)
- Checkout/collection prompt text (e.g. "Why did you buy this item?") — `text`
- Checkout Reviews style — `select[Box, Bubble, Gallery]`
Review-request emails/SMS `confirmed`:
- Subject line (per sequence) — `text`
- Email body / content — `text` + Liquid personalization variables
- Sender name — `text`
Loyalty launcher `confirmed`:
- Points currency name (e.g. "points", "stars", "coins") — `text`

### style
Branding (Settings → Branding → Widgets/Emails) `confirmed`:
- Theme Color — `color`
- Star Color — `color`
- Text Color — `color`
- Verified Badge Color — `color`
- Email button color — `color` (hex)
- Avatar Image — `image` (recommended 55×55 square)
- Custom CSS — `text/code` (CSS editor for the widget)
- Widget layout archetype selection (see Widget Style above) doubles as style
Loyalty launcher/pages: launcher color/position, panel theme, tier badge visuals `(inferred)`

### targeting
- Sort/filter surfacing: Sort Options Button — `toggle`; Custom Form Filter — `toggle`;
  Free Text Search — `toggle` `confirmed`
- Product grouping (share reviews across grouped products) — `rule/config` `confirmed`
- Earn/Redeem Rule Conditions — Include/Exclude by **VIP tier**, **product ID**,
  **customer tags** — `text` ID/tag lists `confirmed`
- Redemption "Applies to" — collections / products / orders — `text` ID lists `confirmed`
- Review-request delivery region gating (SMS: US/CA/IN only) — `select/region` `confirmed`
- Effective Dates (start/end) on earn & redeem rules — `date range` `confirmed`

### behavior
Widget behavior `confirmed`:
- Loading Type — `select[Pagination(default), Load-more/Lazy load]`
- Enable lazy loading — `toggle`
- Share Icons — `toggle`; Vote Icons — `toggle`
Review-request behavior `confirmed`:
- Number of email sequences — up to 4 total (1 base + 3 additional) `number/config`
- Trigger — `select[days after fulfillment, days after order placed]`
  (+ AfterShip/"delivered" trigger via integration)
- Delay Interval — `number` (days; e.g. 7–14 local, 14–21 international)
- Preferred Send Time — `time`
- SMS reminder — `toggle` (one sequence per account, region-gated)
Loyalty earn-rule behavior `confirmed`:
- Status — `toggle[Active/Inactive]`
- Points to award — `number` (2 decimals)
- Earning Limit period — `select[lifetime/year/month/week/day]` (Business+)
- Delay Interval (anti-abuse) — `number` (days/hours)
- Notifications — `toggle`
Loyalty redeem-rule behavior `confirmed`:
- Points to redeem — `number`
- Reward Expiration — `number` + `select[days/hours]`
- Return points after expiry — `toggle`
- Redeem Limit period — `select[lifetime/year/month/week/day]` (Business+)
VIP behavior `confirmed`:
- Tier Term — `select[Lifetime, Calendar Year, Calendar Month, Rolling Year]` /
  custom day count (min 30/Loyalty 2.0)
- Downgrade rule — `select[to next eligible tier, by single tier]`
- Tier ordering — arrow buttons (highest on top)
- Include sales tax in spend calc — `toggle`
- Points expiry (global) — `number` + `select[days/hours]` + refund `toggle`

### data
- **Ways to earn** (each: `toggle` on/off + `number` points): Make a Purchase (points per $,
  2 decimals; + Order Value Total Goal / Total Orders Goal), Account Creation, Subscribe to
  Newsletter, Celebrate Birthday, Account Anniversary, Instagram Follow, Facebook Like/Share,
  Twitter Follow/Share, YouTube Subscribe, TikTok Follow, Pinterest Follow, Write Review,
  Upload Photo, Upload Video, Submit NPS Survey, Answer Question, Custom Activity `confirmed`
- **Ways to redeem** (reward-type `select` + value `number`): Amount discount ($X off),
  Variable discount (X points = $Y), Percentage off (X%), Free Shipping, Free Product
  (product name/ID `text`), Gift Card ($), Store Credit ($, BigCommerce), POS Amount discount,
  POS Percentage off `confirmed`
- **Referrals:** advocate reward + friend reward configuration `confirmed`
- **Custom review form fields** — merchant-defined custom questions captured per review
  (Custom Form) — `rule-builder`/field config `confirmed`
- Import/Export reviews (CSV) — `data action` (export currently support-assisted, not fully
  self-serve — see complaints) `confirmed`
- Review syndication / migration from other review apps — `data action` `confirmed`
- Manual points adjustment & manual tier assignment per customer — `admin action` `confirmed`

## data_model
- **Primary store:** Stamped's own hosted database (multi-tenant SaaS backend). All review
  content, Q&A, NPS, photos/videos metadata, points ledger, tiers, referrals, and request
  schedules live in Stamped infrastructure, not in Shopify. `confirmed` (metafield doc states
  only aggregates sync; content resides in Stamped) / `(inferred)` on exact schema
- **Shopify metafields (mirror, as-requested sync):** `stamped.reviews_average`,
  `stamped.reviews_count` (legacy) and `reviews.rating.value`, `reviews.rating_count.value`
  (new). Used by theme + Google Shopping rich snippets. Also `product.metafields.spr.reviews`
  / `stamped.badge` seen in the wild. `confirmed`
- **Media/CDN:** review photos and videos hosted on Stamped's CDN and referenced by the widget
  `(inferred)`
- **Codes:** loyalty redemptions and referral rewards issued as Shopify **discount codes /
  price rules**; gift cards as Shopify gift cards `confirmed` (feature) / `(inferred)` (exact
  code type)
- **Access:** Public API Key + Private API Key under Settings → API Keys; REST API exposes
  reviews/ratings; widget script fetches reviews client-side from Stamped, not from Shopify
  `confirmed` (API keys) / `(inferred)` (client fetch path)
- **Jobs:** scheduled review-request email/SMS sequences, points expiry, tier re-evaluation on
  tier term, and review moderation automation run as Stamped-side background jobs `confirmed`
  (features imply scheduler)

## visual_patterns
- **Layout archetypes (confirmed):** review list — Standard, 2-Column, Slick Slider (carousel),
  Profile, Masonry, Minimalist; summary graph (rating histogram bar chart) + recommended-%
  header; UGC — Gallery grid and Wall-of-Photos; Site Badge (compact star+count); Side Drawer
  (edge tab → slide-out panel); Reviews Popup (corner modal, 4 positions); Top-Rated carousel;
  Loyalty launcher (floating bubble → slide-out panel with points balance, ways-to-earn list,
  redeem catalog, referral link, VIP progress bar).
- **Component states (confirmed/inferred):** star rating (empty/half/full), verified-buyer
  badge, photo/video thumbnail → lightbox, "load more"/pagination, sort dropdown open state,
  filter chips (custom form + free-text search), review helpful up/down vote, merchant reply
  block, pending-moderation (hidden), VIP tier badges per tier, points progress bar toward next
  reward/tier.
- **Motion/interaction (inferred):** carousel auto-advance/drag, popup/drawer slide-in,
  lightbox zoom, launcher panel expand/collapse, lazy-load fade-in, star hover fill on the
  submission form.

## reviews_signal
**Praises (confirmed, from App Store reviews):**
1. Fast, professional, "above and beyond" human support (named agents: Elvis, Eslam, Anthony).
2. Social proof measurably lifts conversion/trust — reviews visibly drive sales.
3. Clean, reliable, easy to set up for most merchants.
4. Strong Google Shopping integration + product rich snippets.
5. Long-tenured merchants trust it as a stable incumbent across years.

**Complaints (confirmed):**
1. Slow/unresponsive support in some cases (e.g. three outreaches ignored on a CSV export).
2. Performance: "buggy, slow," widgets sluggish ("sumamente lenta"), page-speed drag.
3. Setup requires developer-level theme/code work; non-technical merchants get stuck.
4. Support channel friction — replies via email, chat is only an AI chatbot.
5. Data export limits — CSV export gated behind support, not self-serve for merchants.

## mapping_note
Maps onto our RecipeSpec vocabulary as a **cross-surface blueprint**, not a single module.

- A single generated **theme.section** (recipe module) can plausibly recreate the *display*
  vocabulary: a product-page review widget with star summary, review list layout variants,
  filter/sort, verified badge, photo grid — driven by content/style/behavior settings and read
  from a data source. That is the recipe-sized slice.
- **Where it EXCEEDS a single-module recipe:**
  1. **Persistent multi-entity data store + moderation state machine.** Reviews, Q&A, NPS,
     media, and a points ledger must be persisted, deduped, moderated
     (pending→published→rejected), and mirrored to Shopify metafields. A stateless recipe
     module has no home for this; it needs a backing store + rollup jobs.
  2. **Background job / scheduler engine.** Timed multi-step review-request email+SMS sequences
     (trigger on fulfilled/placed/delivered, N-day delays, send-time, up to 4 stages), points
     expiry, and VIP tier re-evaluation are durable scheduled workflows — a background/queue +
     Flow-like automation layer, not a render-time module.
  3. **Rule engine for loyalty.** Earn/redeem/VIP rules with conditions (tier/product/tags),
     limits per period, effective dates, and multiple redemption reward types compile to a
     configurable rules evaluator plus **external side-effects** (issuing Shopify discount
     codes / price rules / gift cards, POS discounts). That is a rule engine + integration
     side-effects, beyond a recipe's declarative settings.
  4. **Coordinated multi-surface blueprint with shared state.** One coherent product spans
     theme sections, floating proxy widgets, checkout/POS extensions, customer-account pages,
     email/SMS channels, an analytics/pixel surface, and an admin moderation app — all reading
     one shared ledger. Recreating it requires composing many extension types into a single
     blueprint with a shared data plane and cross-surface handoff (review action → points →
     tier → discount), which is inherently multi-module.
