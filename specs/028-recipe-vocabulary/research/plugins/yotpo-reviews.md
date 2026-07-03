# Yotpo: Product Reviews App (Product Reviews & UGC)

> Note on naming: The App Store listing title currently reads **"Yotpo: Product Reviews App - Build trust and boost revenue with product reviews & UGC"** at the URL slug `yotpo-social-reviews` (confirmed). The task target "Yotpo Product Reviews & UGC" is the same app — Yotpo has re-titled the listing over time but the app, vendor, and slug are unchanged; it is **not** deprecated or merged (confirmed). One material change to note: Yotpo permanently **shut down its Email and SMS Marketing products on Dec 31, 2025** (confirmed via aggregators). The Reviews app still sends review-request emails/SMS as a reviews-collection channel, but Yotpo is no longer a general email/SMS marketing suite. This is a vendor-scope change adjacent to, but not removing, the reviews product.

## identity
- **name**: Yotpo: Product Reviews App (a.k.a. "Yotpo Product Reviews & UGC") (confirmed)
- **vendor**: Yotpo (confirmed)
- **category**: Product reviews / "Marketing and conversion" (confirmed)
- **App Store URL**: https://apps.shopify.com/yotpo-social-reviews (confirmed)
- **rating**: 4.8 / 5 (confirmed)
- **review count**: ~4,404 App Store reviews; ~92% five-star (confirmed)
- **install signal**: One of the largest, longest-tenured reviews apps on Shopify; merchants report 6–7 year tenures; enterprise-grade brand with tens of thousands of merchants across its platform (inferred from review corpus and vendor positioning)
- **pricing model**: Order-volume tiered subscription (confirmed): **Free** ($0, up to 50 monthly orders), **Starter** ($15/mo base, scales with order volume — e.g. ~$79/mo at ~500 orders), **Pro** ($119–$169/mo base, scaling to ~$469/mo at 10,000 orders). Annual billing discounted but reported **non-refundable**. CSS editor / advanced customization gated to premium tiers (confirmed).

## surfaces
Yotpo Reviews is fundamentally a **multi-surface storefront-widget system backed by an external review database**. Mapped to internal extension-type vocabulary:

- **theme.section** (confirmed, primary): The core surface. Installed as Shopify Online Store 2.0 **theme app extension app blocks** ("Yotpo Reviews Widget", "Star Rating") that merchants add/remove/reorder in the theme editor, plus legacy `<div>` embeds. Renders on:
  - Product page: full **Reviews Widget** (review list, media, filters, custom-question breakdowns, write-a-review), **Star Rating** anchor (aggregate stars + review count near title), and **Q&A** section.
  - Collection / category / featured-collection pages: **Star Rating** badges per product card.
  - Homepage / cart / blog / landing pages: **Reviews Carousel**, **Review Highlights** (AI testimonial callouts), **Media Gallery**.
  - A dedicated **SEO / All-Reviews page** (site + product reviews) for Google visibility.
- **proxy.widget** (inferred): Widgets are hydrated client-side from Yotpo's CDN/API (the app block injects a mount point and script; review content is fetched from Yotpo servers, not stored in the theme). Functionally an app-proxy-style external-content widget even where delivered via theme blocks.
- **analytics.pixel** (inferred): Rich-snippet / aggregateRating schema injection + on-site widget impression/conversion tracking; syndication to Google Seller Ratings and Google Shoppable Ads implies a tracking/feed layer.
- **flow.automation** (confirmed): Listing declares **Shopify Flow** integration — review events (e.g. new review, low-star review) can trigger Flow workflows.
- **admin.block** (inferred): Shopify Admin integration is declared; the merchant-facing configuration largely lives in Yotpo's own admin, but there is embedded-admin surface within Shopify.
- **checkout.upsell / checkout.block** (partial, inferred): Reviews Carousel lists "checkout page" as a placement target; on Plus/checkout-extensibility this would be a checkout UI extension, but this is a social-proof display block, not a functions-based offer.

**NOT used**: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, postPurchase.offer, pos.extension, customerAccount.blocks are not core to the reviews product (coupon incentives for reviews are email-side, not a Shopify discount Function).

**Coordination**: All surfaces are **read models over one shared external review store**. The Star Rating badge (aggregate) and the Reviews Widget (detail) render the same product's `bottomline` and review set; a click on the Star Rating scrolls/links to the Reviews Widget or Reviews Summary (configurable handoff via the "Click to" dropdown). Aggregate rating is also mirrored into **Shopify product metafields** (`yotpo.reviews_count`, `yotpo.reviews_average`) so themes and other apps can read it. The collection-page badge and PDP widget stay consistent because both derive from the same server-side bottomline metafield/API — the app maintains cross-surface consistency by centralizing state off-platform and projecting it into each surface.

## functional_model
Core entities (field names confirmed from Yotpo UGC API where noted):

- **review** = { id, product_ref (product_id), score (1–5 rating), title, content, created_at, **verified_buyer** (bool), **is_incentivized** (bool), sentiment (AI-scored), votes_up, votes_down, source_review_id (for syndicated/imported), custom_fields (key→value answers to custom questions), media[] (photos/videos), reviewer { name, email, avatar/initials, country } } (confirmed)
- **bottomline** (per product & per site aggregate) = { total_reviews, average_score, star_distribution } — this is the object mirrored into Shopify metafields (confirmed)
- **custom_question** = { key (e.g. "--12159"), question_text, type (star-scale / multiple-choice / free-text), location } → produces `custom_fields` on each review; supports "Product feedback" and "Customer details" question groups (confirmed)
- **qna** = { question, answer, product_ref, bottomline } — separate Q&A entity with its own bottomline metafield (confirmed)
- **review_request** (collection campaign) = { trigger (purchase_date | delivery_date), delay_days (default 14), reminder(s), request_type (product | site | both), email/SMS template, coupon/incentive, promoted_products, past-orders backfill window (≤180 days) } (confirmed)
- **site_review** = business/store-level review (distinct from product reviews), shown in Reviews Tab / SEO page (confirmed)
- **moderation state** = published | pending | rejected, with sentiment + **profanity check** gating (confirmed)

Relationships: product 1—N review; product 1—1 bottomline (derived aggregate); review 0—N media; review 0—N custom_field; order/fulfillment 1—1 review_request → 0—1 review; review N—1 reviewer.

## settings_taxonomy

### content
- **Headline text** — toggle + text field (default "Customer Reviews") (confirmed)
- **BottomLine Text** — text field (confirmed)
- **Media Gallery headline text** — text field (confirmed)
- **Star Rating review-count label** — text field (default `{{reviews_count}} reviews`) (confirmed)
- **Empty-state Title / Body / Button text** — three text fields (confirmed)
- **Store comment title** — text field (label above merchant replies) (confirmed)
- **Custom Questions** — rule/list builder: add custom questions, each with type (star-scale / multiple-choice / free-text), grouped as "Product feedback" and "Customer details" (confirmed)
- **Review request email — Subject line & Body** — text fields with merge/personalization tags (customer name, store name, product, order, unsubscribe) (confirmed)
- **Review request type** — Product Review (default on) / Site Review toggle / both (confirmed)
- **Q&A section content** — enable Q&A block on PDP (confirmed)

### style
- **Layout** — select [Standard, Bold] (confirmed)
- **Primary color / Stars color / Text color / Background color** — four color pickers (confirmed)
- **Primary font / Secondary font** — dropdowns with custom-font option (confirmed)
- **Widget width** — number (percentage) (confirmed)
- **Line separator style** — dropdown (confirmed)
- **Star Rating: Stars color** — color picker (confirmed)
- **Star Rating: Text color** — color picker (confirmed)
- **Star Rating: Font** — dropdown (confirmed)
- **Star Rating: Alignment** — dropdown (position relative to product title) (confirmed)
- **Avatar Style** — select [Icon, Initials] (confirmed)
- **Reviewer name format** — select [First name + initial, Initials only] (confirmed)
- **Date format** — dropdown (default DD/MM/YY) (confirmed)
- **Edit CSS** — raw CSS editor (premium-tier only) (confirmed)

### targeting
- **Widget Placement** — per-surface config: Product Page vs Other Pages (homepage / collection / cart) with independent settings (confirmed)
- **"Show when there are no reviews"** — toggle (hide/show empty widget) (confirmed)
- **"Allow shoppers to write a review"** (when unpublished/no reviews) — toggle (confirmed)
- **Carousel placement targets** — homepage / cart / checkout / blog / landing pages (confirmed)
- **Review request trigger source** — select [purchase date, delivery date] (delivery-date targeting Starter+) (confirmed)
- **Past-orders backfill** — date-picker window for historical order inclusion (≤180 days) (confirmed)
- **Promoted products** — product-picker of products to feature/request in emails (confirmed)
- **Minimum media** (media gallery) — number (min media count to show gallery) (confirmed)
- **Segmentation** — request/reminder eligibility rules (customers who reviewed on reminder 1 excluded from reminder 2) (confirmed)

### behavior
- **Average star rating** — toggle (confirmed)
- **Star distribution** — toggle (confirmed)
- **Disable "Write a Review" button** — toggle (confirmed)
- **Media Gallery** — toggle (confirmed)
- **Sort by** — select [Most relevant, Most recent, With media, Verified purchase, Rating] (confirmed)
- **Filter by** — multi-toggle set: free-text search, star rating, images/videos, country, variants (confirmed)
- **Smart filters** — toggle (AI-driven filter chips) (confirmed)
- **Reviews per page** — number (confirmed)
- **Avatar** — toggle (confirmed)
- **Reviewer badge (verified buyer)** — toggle (confirmed)
- **Country flag** — toggle (confirmed)
- **Show variants** — toggle (confirmed)
- **Date** — toggle (confirmed)
- **Link to original product** — separate toggles for grouped products / syndicated reviews (confirmed)
- **Shopper feedback / Product feedback / Customer details** — toggles with location + color options (confirmed)
- **Clickable star rating** — toggle (confirmed)
- **"Click to"** — select [Reviews Widget, Reviews Summary] (handoff destination) (confirmed)
- **Empty State** — master toggle (confirmed)
- **Review request delay** — number (days after trigger, default 14) (confirmed)
- **Reminder / follow-up email** — toggle + days-after config (confirmed)
- **Review request status** — Activate / Deactivate (confirmed)
- **Sentiment & profanity check / auto-moderation** — toggle/behavior (confirmed)
- **Coupon/incentive on review submission** — configurable (confirmed)

### data
- **Rich snippets / aggregateRating schema** — inject structured data for Google (confirmed; removal is support-only)
- **Google Seller Ratings / Google Shoppable Ads syndication** — feed toggle/integration (confirmed)
- **Metafield exposure** — Yotpo writes `yotpo.reviews_count`, `yotpo.reviews_average`, star bottomline, `q&a_bottomline` metafields (must be exposed to Storefront API; private by default) (confirmed)
- **Reviews import/export & syndication** — import from other tools, syndicate reviews across grouped/related products (confirmed; export reported as non-trivial)
- **Klaviyo / TikTok / Walmart / Facebook / Instagram integrations** — data push toggles (confirmed from listing)

## data_model
- **Primary store is EXTERNAL** — all reviews, media, Q&A, custom-question answers, reviewer identity, and moderation state persist in **Yotpo's own cloud database**, not in Shopify (confirmed). Review content is served to widgets from Yotpo's API/CDN at render time.
- **Media (review photos/videos)** hosted on **Yotpo CDN** (confirmed).
- **Shopify-side persistence is a thin projection**: aggregate **metafields** on products — `yotpo.reviews_count`, `yotpo.reviews_average`, star-rating bottomline, and `q&a_bottomline` — so themes/other apps can read ratings without calling Yotpo (confirmed). No full review corpus is stored in Shopify.
- **Codes/incentives**: review-for-coupon discount codes issued via the email/collection flow (confirmed).
- **Theme footprint**: app-block mount points + injected scripts in the live theme; merchants report **leftover Liquid/code after uninstall** that must be manually removed (confirmed).
- **API surface**: public Yotpo UGC API exposes review objects, bottomlines, and metadata (create-review, retrieve-reviews-for-a-product, reviews-metadata) (confirmed).

## visual_patterns
- **Layout archetypes**: (1) full **Reviews Widget** — header block (headline + average stars + star-distribution bars + write-review CTA) over a paginated/filterable review **list** or **grid**, each row = avatar/initials + name + verified badge + country flag + date + star row + title + body + review media thumbnails; (2) **Star Rating anchor** — compact inline stars + review count near product title; (3) **Media Gallery** — masonry/grid of review photos/videos with lightbox; (4) **Reviews Carousel** — horizontally scrolling review cards for homepage/cart; (5) **Review Highlights** — AI-selected pull-quote testimonial cards; (6) **AI Reviews Summary** — generated synopsis block; (7) **Q&A** accordion; (8) **SEO/All-Reviews page** — long-form list. Two named style presets: **Standard** and **Bold**.
- **Component states**: empty state (custom title/body/button, or hidden), loading/hydration (async fetch from Yotpo), unpublished/no-reviews "be the first to write a review" CTA, filtered/sorted list state, star-distribution bar interactions, verified-buyer badge, incentivized-review badge, media lightbox open, "write a review" modal/form with custom questions.
- **Motion/interaction**: clickable star anchor scroll-to-widget or open summary (configurable), smart-filter chips, carousel auto-scroll/swipe, media lightbox, star-distribution bar click-to-filter, write-a-review modal, in-email inline review form (submit from email; redirect to landing page on missing field).

## reviews_signal
**Praises (top):**
1. **Support quality** — fast, clear, named reps resolving issues quickly ("less than 15 minutes"); most-cited positive (confirmed).
2. **Ease of use / setup** — "user-friendly," straightforward customization; strong for long-tenured merchants (confirmed).
3. **Effectiveness / results** — measurable lift in review volume and conversion; social-proof value (confirmed).
4. **Customization flexibility** — extensive widget styling to match brand; multiple widget types (confirmed).

**Complaints (top):**
1. **Pricing / order-volume penalty** — ~42% of negative reviews are about cost; "penalizes successful businesses," "WAY too pricey," compared unfavorably to Judge.me ("95% of features for 3% of cost") (confirmed).
2. **Lock-in & painful exit** — export of review data is non-trivial; **no clean uninstall** (leftover theme code); **annual fees non-refundable** (confirmed).
3. **Inconsistent support at lower tiers** — long-time merchant reported 15 support requests with no help; multi-day/no responses at non-enterprise tiers (confirmed).
4. **Review-generation reliability / accountability** — one merchant went from hundreds of reviews/month to 7 with "useless" support; legal-grade data export failures in a court context (confirmed).
5. **Trust erosion from product sunsets** — Email & SMS shutdown Dec 31 2025 burned merchants who bought into "all-in-one" (confirmed).

## mapping_note
A single **Reviews Widget** or **Star Rating** placement maps cleanly onto our constrained RecipeSpec vocabulary as a `theme.section` module with a settings schema drawn directly from §settings_taxonomy (color/font/toggle/select/number/text/product-picker/rule-builder controls). That single-surface projection is well within a one-module recipe.

**Where it EXCEEDS a single-module recipe:**
1. **Needs a persistent external data store + write path.** Reviews are user-generated content collected over time and moderated — not merchant-authored config. A recipe module renders config-driven markup; Yotpo requires a review database (create/read/moderate reviews, media, custom-question answers, per-product bottomlines) that lives outside Shopify. Our vocabulary has no "durable UGC store + submission endpoint + moderation state machine" primitive.
2. **Needs background jobs / scheduled side-effects.** The review-request engine (trigger on purchase or delivery date, delay N days, reminder cascades, 180-day backfill, exclusion logic) is a durable, time-based workflow with external email/SMS side-effects — a cron/queue + rule engine, not a rendered module. This is exactly the `flow.automation` / durable-wait territory the repo memory flags as spec-only.
3. **Is a coordinated cross-surface blueprint, not one section.** Star Rating badge (collection cards), full Reviews Widget (PDP), Carousel (home/cart), Media Gallery, Q&A, and an SEO/All-Reviews page must share one aggregate state (bottomline mirrored into metafields) and hand off between surfaces. That is a multi-module blueprint with shared server-side state, exceeding a lone recipe.
4. **Has external integrations & feed side-effects.** Google Seller Ratings / Shoppable Ads syndication, rich-snippet injection, Klaviyo/TikTok/Walmart push, and metafield provisioning are outbound integrations and data-provisioning steps a pure render-time recipe cannot perform.
