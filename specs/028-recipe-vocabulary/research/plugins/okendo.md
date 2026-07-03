# Okendo: Reviews & Loyalty

> Status note: The app is **active and current** (not renamed/deprecated). It historically launched as "Okendo Product Reviews & UGC" and has since expanded into a 5-product customer-marketing suite (Reviews, Loyalty, Referrals, Quizzes, Surveys) now listed as **"Okendo: Reviews & Loyalty"** under a single Shopify listing/slug `okendo-reviews`. No vendor change. (confirmed)

## identity
- **name**: Okendo: Reviews & Loyalty (confirmed)
- **vendor**: Okendo (Sydney NSW, AU) (confirmed)
- **category**: Product reviews (primary); also Loyalty and rewards (confirmed)
- **App Store URL**: https://apps.shopify.com/okendo-reviews (confirmed)
- **rating**: 4.8 / 5 (confirmed) — distribution ~96% 5-star, ~2% 1-star (confirmed)
- **review count**: ~1,366–1,367 reviews (confirmed, as of 2026-07)
- **install signal**: ~18,111 live installs; "18,000+ Shopify brands" incl. SKIMS, Rhode, NOBULL, Dr. Squatch (confirmed via storeleads + vendor)
- **pricing model**: Freemium, **order-volume tiered** (monthly-order gated): Free (≤50 orders/mo), Essential $19/mo, Growth $119/mo, Power $299/mo; higher Advanced tier (~$499/mo) referenced for retail syndication (Bazaarvoice) (confirmed). Overage "credits" billed ~2× plan rate on order spikes (confirmed via aggregator).

## surfaces
Okendo is explicitly **multi-surface** and multi-product. Mapped to internal extension-type vocabulary:

- **theme.section** (confirmed — primary): Storefront review + loyalty displays delivered as **Online Store 2.0 App Blocks** plus an **App Embed**. App blocks: `Star Rating`, `Reviews Widget` (reviews / Q&A / both), `Reviews Carousel`, `Reviews Badge` (small/large), `Media Grid`, `Media Carousel`, `Questions Widget`. Loyalty adds a **Loyalty Page** (theme page/section) and an **always-on floating Loyalty bubble/launcher** (app-embed injected). Placed on product pages, PDP, homepage, collection pages, dedicated all-reviews page.
- **proxy.widget** (inferred): The floating loyalty launcher + widget hub and the review write/response modal behave like an app-served overlay hydrated client-side against Okendo's API (not a native theme block); functionally an app-proxy-style widget even though delivery is via app embed. (inferred)
- **checkout.upsell / checkout.block** (confirmed → maps to `checkout.block`): **Loyalty Checkout Extension** (Checkout UI Extension, Shopify Plus + checkout extensibility only). Renders on Information/Shipping/Payment pages, Order Summary, and Thank-You page. For non-members: enrollment CTA. For members: redeemable rewards, points balance (Thank-You), unredeemed non-expired rewards; optional Shop Pay placement. (confirmed)
- **customerAccount.blocks** (confirmed): Loyalty data + rewards surfaced in **Customer Accounts** (new customer account extensibility); redirect-after-login can target account/loyalty page. (confirmed)
- **pos.extension** (confirmed): **Loyalty integrates with Shopify POS** — earn/redeem in-store. (confirmed)
- **analytics.pixel** (inferred): Okendo tracks on-site engagement/attribution and syncs review+attribute data to Klaviyo/Meta/TikTok/Google; a Web Pixel or equivalent tracking layer is implied. (inferred)
- **flow.automation** (confirmed): Documented **Shopify Flow** triggers/actions (e.g. "award Yotpo Loyalty points for Okendo reviews via Flow"); Okendo emits review/loyalty events consumable by Flow. Plus internal review-request automations (email/SMS journeys). (confirmed)
- **admin.block** (inferred): Loyalty/review data pushed to Shopify **customer metafields** so it appears on the customer/admin profile; not a formal Admin UI extension but surfaces admin-side data. (inferred)
- Not used: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, postPurchase.offer, admin.action (confirmed absent — Okendo mints **native Shopify discount codes** for redemptions rather than running a cart-transform/discount Function). (inferred)

**Surface coordination**: All surfaces read/write a **single shared customer + points ledger** hosted by Okendo. A review submitted via the storefront `Reviews Widget` can fire a loyalty **Earn: Write a Review** rule → increments the member's points ledger → new redeemable reward becomes visible in the floating widget, customer account block, AND the checkout extension. Points earned in POS or at checkout reconcile to the same ledger. Redemption anywhere generates a Shopify discount code applied at checkout. Review data + points also mirror to **Shopify customer/product metafields** and to **Klaviyo** for downstream email/SMS, making the metafield layer the cross-surface handoff for theme rendering (pre-rendered snippets) and the Okendo API the handoff for live state.

## functional_model
Core entities (concrete shapes; field names confirmed where noted, else inferred):

- **review** = { rating: int(1–5), title: text, body: text, media: [photo|video][], verified_buyer: bool, reviewer: profile_ref, product_ref: `shopify-<productId>` (or group_ref), attributes: attribute_value[], feature_tags: tag[], merchant_response: text?, status: published|pending|hidden, helpful_votes: int } (rating/media/verified/attributes/product_ref confirmed; exact JSON keys inferred)
- **attribute** (product-scoped, collection-specific) = { type: Range(1–5) | CenteredRange(deviation-from-standard, e.g. sizing) | SingleSelect | MultiSelect(≤10 options), label: text, optional: bool (Range cannot be optional), private: bool } (confirmed). Recommended 3–5 per collection.
- **profile_attribute** (customer-scoped) = single/multi-select demographic question, created on a separate Profile Questions page (confirmed).
- **product_group** = GUID grouping multiple Shopify products so reviews aggregate across variants/SKUs (confirmed).
- **question** (Q&A) = { body, answer, product_ref, status } — rendered by the Questions Widget (confirmed).
- **loyalty_member** = { customer_ref, status: pending|enrolled, points_balance: int, tier_ref, birthday?, enrolment_date } (confirmed conceptually).
- **earn_rule** = { type ∈ {Join, Place-an-Order, Write-a-Review, Refer-a-Friend, Birthday, Enrolment-Anniversary, Follow/Like/Share on FB/IG/X/TikTok}, points/params, frequency limits } (confirmed).
- **redemption_rule** = { type ∈ {Fixed-Value Coupon, Fixed-% Coupon, Convert-Your-Points (ratio), Free Shipping, Free Product}, points_cost, expiry_days, min_purchase, collection_restrictions, freq_limits } (confirmed).
- **vip_tier** = { name, spend_threshold, eligibility_period: rolling-year|lifetime, perks[], rewards[] } — unlimited tiers, recommended 3–5 (confirmed).
- **reward / coupon** = a minted Shopify discount code (fixed/%/free-ship/free-product) or **store credit** applied at checkout without a code (confirmed).
- **referral** = { advocate_ref, friend_reward, advocate_reward } (confirmed feature; fields inferred).
- **quiz** = product-recommendation flow → product set (confirmed feature).
Relationships: customer 1—1 loyalty_member; member 1—* earn/redemption events (points ledger); review *—1 product (or *—1 product_group); review *—* attributes; tier 1—* members.

## settings_taxonomy
Actual merchant-facing controls, grouped.

### content
- Reviews Widget **display mode**: select[ Reviews only | Q&A only | Both ] (confirmed)
- **Review attributes** builder: add attribute → type select[ Range | Centered Range | Single Select | Multi Select ], label text, options list, `optional` toggle, `private` toggle (confirmed)
- **Profile Questions** builder: add profile attribute (single/multi-select) (confirmed)
- **Feature Tags / Featured Reviews**: tag creation, `order-by-tag-id` to pin featured reviews (confirmed)
- Response Form toggles: allow **photo/video upload** toggle, allow **social-login** submission toggle (confirmed)
- Star Rating widget **Content**: select[ total review count | average star rating ]; **Label** text following the number; `include brackets around text` toggle (confirmed)
- Reviews Badge **size**: select[ small | large ] (confirmed)
- Loyalty program **name**: text; **currency name** + **currency name (plural)**: text (confirmed)
- Merchant **response** to a review: text (confirmed)

### style
- **Star color / rating color**: color (Settings > Widgets > Styling) (confirmed)
- Star Rating **Stars Height**: number (confirmed)
- **Space Above / Space Below**: number (px) (confirmed)
- Widget Plus visual editor: card layout, fonts, colors, spacing (confirmed broadly; exact per-element knobs partly (inferred))
- Reviews Widget **layout**: grid | list | carousel | tabs/sidebar (confirmed at feature level; per-block layout select (inferred))
- Media Grid **layout type**: select (grid variants) (confirmed)
- Loyalty page + floating-widget **branding** (colors/logo): color/image (inferred — vendor markets full brand match; explicit knob names unconfirmed)

### targeting
- Widget **product targeting**: `data-oke-reviews-product-id` = `shopify-<id>` | `data-oke-reviews-group-id` (GUID) | `data-oke-all-reviews` = true (store-wide aggregate) (confirmed)
- Attributes are **collection-scoped** (different questions per Shopify collection, incl. "All Products") (confirmed)
- Redemption **collection restrictions**: product-picker/collection-picker limiting where a reward applies (confirmed)
- **Customer Tags Blocklist**: multi-select of Shopify tags excluded from loyalty (confirmed)
- **Discount Combinations**: multi-select — allow loyalty discounts to stack with Shopify discounts (confirmed)
- **Restrict Discount to Redeemer**: toggle (confirmed)
- Checkout extension **placement**: select pages (Information/Shipping/Payment/Order Summary/Thank-You) + Shop Pay checkbox (confirmed)

### behavior
- **Review request** automations: channel (email/SMS via Klaviyo/Attentive/Omnisend), **delay** = X days after fulfillment **or after delivery**, send-window day-of-week/time-of-day (confirmed)
- Earn rule params: points amount, **points per $1**, frequency limit (once per order vs per review), **bonus points for photo/video**, **bonus for social login**, max per order, wait-time delay (confirmed)
- Order Spend calc: multi-checkbox[ subtotal | taxes | shipping ] (confirmed)
- **Backdate Program Start**: toggle + **Program Start Date** (lookback ≤12 mo) (confirmed)
- Redemption rule params: **points required**, discount value ($ or %) or points→$ **ratio** (Convert Your Points) with min/max, **expiry days**, **minimum purchase**, redemption frequency limits (confirmed)
- Points **expiry**: select[ Never | Custom period 1–60 mo / 1–365 days ] for enrolled vs pending members (confirmed)
- **VIP tier eligibility period**: select[ Rolling Year | Lifetime ]; **Launch VIP Program**: toggle (confirmed)
- Star Rating **Action when clicked**: select[ scroll to reviews widget | scroll to custom target ]; `data-oke-scroll-disabled` toggle (confirmed)
- **Hide when no reviews**: toggle (confirmed)
- Star Rating `data-oke-all-reviews` aggregate toggle (confirmed)

### data
- **Shopify Customer Metafields** push (loyalty): toggle (confirmed)
- Reviews pre-rendered to **product/shop metafields** for SEO + fast load (confirmed; namespace `app--<id>--reviews`, keys `reviews_widget_snippet`, `star_rating_snippet`)
- **Rich snippets / structured data** for Google: toggle/feature (confirmed)
- **Review syndication / migration / import-export**: settings for importing from other providers and syndicating to retail (Bazaarvoice, Walmart, Google Shopping, Shop app) (confirmed)
- **Integrations** config: Klaviyo, Meta, TikTok, Postscript, Gorgias, Google, Walmart, Shop (API keys / connect) (confirmed)

## data_model
- **External Okendo DB** is the system of record: reviews, Q&A, attributes, media metadata, loyalty members, points ledger, earn/redemption rules, VIP tiers, referral graph (confirmed conceptually — order-volume billing + suite features imply a hosted backend).
- **Media (photo/video)**: hosted on Okendo/CDN, referenced from review records (confirmed feature; CDN specifics (inferred)).
- **Shopify Metafields** (mirror/cache for storefront rendering + SEO):
  - product: `product.metafields.okendo.ReviewsWidgetSnippet`, `product.metafields.okendo.StarRatingSnippet` (pre-rendered HTML) (confirmed)
  - shop: `shop.metafields.okendo.WidgetPreRenderBodyStyleTags` and namespace `app--<appId>--reviews` keys `reviews_widget_snippet` / `star_rating_snippet` (confirmed)
  - customer: loyalty metafields (points, tier) when the push toggle is on (confirmed)
- **Discount codes**: redemptions mint native **Shopify discount codes**; store-credit redemptions apply as Shopify store credit at checkout (no code) (confirmed).
- **Hydrogen/headless**: `@okendo/shopify-hydrogen` npm package for headless storefronts (confirmed).
- Uses **metafields, not metaobjects**, for review storage per available docs (inferred — no metaobject usage documented).

## visual_patterns
- **Layout archetypes**: star-rating inline badge (PDP title area); full reviews module (grid / list / masonry with left summary rail: average score, star distribution bars, attribute averages, filter chips); reviews carousel (auto-scroll, homepage social proof); media gallery grid + lightbox (UGC photos/videos); reviews badge (compact aggregate); Q&A accordion; dedicated all-reviews page; loyalty page hub (points balance, tier ladder progress bar, rewards catalog cards, ways-to-earn list); floating loyalty bubble/launcher (bottom-corner, expands to panel). (confirmed features)
- **Component states**: empty (hide-when-no-reviews), pending vs published review, verified-buyer badge, has-media badge, "helpful" vote toggled, merchant-response expanded, member vs non-member (checkout/loyalty), tier locked vs unlocked, reward affordable vs insufficient-points. (confirmed conceptually)
- **Motion/interaction**: click star rating → smooth-scroll to reviews (configurable target); carousel auto-advance; media thumbnail → lightbox; filter/sort chips re-query; write-review + ask-question modals; loyalty bubble expand/collapse animation; points/tier progress bar fill. (confirmed)

## reviews_signal
**Praises (top):**
1. Responsive, high-quality customer support ("top notch", proactive onboarding). (confirmed)
2. Intuitive setup + clean Shopify/theme integration (App Blocks). (confirmed)
3. Effective, high-volume review collection (measurable lift, "a handful/day → two dozen+"). (confirmed)
4. Rich visual UGC (photo/video reviews) + attribute insights (sizing/fit/quality). (confirmed)
5. Flexible all-in-one suite (reviews + loyalty + quizzes + referrals) and Klaviyo/Google syndication. (confirmed)

**Complaints (top):**
1. **Order-volume pricing is expensive & unpredictable** — overage credits ~2× on BFCM spikes punish seasonal spikes. (confirmed via aggregator)
2. **Steep upgrade cliff** — key integrations (e.g. Klaviyo) and retail syndication gated behind $299/$499 tiers. (confirmed)
3. **Secondary products underbaked** — quiz builder "clunky"; loyalty shallower than dedicated tools (LoyaltyLion). (confirmed via aggregator)
4. **No automatic negative-review alerts** — requires manual dashboard monitoring. (confirmed via aggregator)
5. **Shopify-only lock-in** — no WooCommerce/BigCommerce/etc., migration risk. (confirmed via aggregator)
> Note: the App Store review tab surfaces almost exclusively praise (96% 5-star); the substantive complaints come from third-party review aggregators.

## mapping_note
Onto our constrained RecipeSpec vocabulary, Okendo maps cleanly to a **theme.section** review/rating module (a single generatable widget with content/style/targeting knobs — this is the recipe-sized slice). But the full plugin **massively exceeds a single-module recipe** in ways relevant to the gap analysis:

1. **Requires a persistent data store + write path.** A recipe emits presentational modules; Okendo *captures and persists* user-generated content (reviews, Q&A, media, attributes) and a **loyalty points ledger** with earn/redeem transactions. This needs an external DB / metaobject-backed store and authenticated write endpoints, not just a rendered section.
2. **Cross-surface blueprint with shared state.** One logical product spans theme.section + checkout.block + customerAccount.blocks + pos.extension + a floating proxy widget, all reconciling to one member/points ledger. That is a coordinated multi-extension blueprint, not one module.
3. **Rule engine + background jobs.** Earn/redemption rules, VIP tier thresholds, points expiry, and **timed review-request automations** (email/SMS N days after delivery, Flow triggers) require a scheduler/queue and a rules evaluator — background side-effects far beyond a static recipe.
4. **External side-effects (mint Shopify discounts/store credit, syndicate data).** Redemptions create native Shopify discount codes / store credit at checkout, and review data is pushed to metafields, Klaviyo, Google, Walmart, Shop, Bazaarvoice — outbound integrations a single-module recipe cannot express.
