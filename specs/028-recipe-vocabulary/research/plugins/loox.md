# Loox — Product Reviews & Referrals

## identity
- **name:** Loox ‑ Product Reviews App (listing title "Loox: Product Reviews App & AI") (confirmed)
- **vendor:** Loox (Loox Software Ltd., Ramat Gan, IL) (confirmed)
- **category:** Product reviews / Marketing and conversion (confirmed)
- **App Store URL:** https://apps.shopify.com/loox (confirmed)
- **rating:** 4.9 / 5 (confirmed)
- **review count:** ~8,191 reviews (94% five-star, 2% one-star) (confirmed)
- **install signal:** "Over 100,000 Shopify & Shopify Plus merchants" per Loox marketing; "Built for Shopify" badge (confirmed)
- Pricing anchors: Free Beginner tier → Convert $49.99/mo → Unlimited $299.99/mo; Referrals & Upsells gated to higher tiers; video reviews gated above free (confirmed; exact tier names/prices vary by source snapshot)

## surfaces
- `theme.section` — primary surface. App-block widgets injected via Online Store 2.0 theme editor: Reviews Widget (grid/list), Star Rating Widget, Carousel Widgets (Testimonials / Gallery / Cards), Trust Badge, Video Slider, "Happy Customers" media gallery, All-Reviews page block, Snippets (near add-to-cart). (confirmed)
- `proxy.widget` — dynamic review data (fetch, sort, filter, pagination), review-submission form with photo/video upload, floating reviews sidebar, and the on-product Pop-up widget are served/hydrated from Loox's backend, not static Liquid. (inferred — behavior is clearly server-backed)
- `checkout.upsell` / `postPurchase.offer` — Loox Post-Purchase Upsell offer on the order-status/thank-you page, product + discount + social-proof reviews, with "Smart Upsell" AI product selection. (confirmed)
- `checkout.block` — Checkout extension listed as a supported integration (review prompt / trust content in checkout). (confirmed listing; exact block content inferred)
- `customerAccount.blocks` — Customer accounts extension listed (surfaces reviews/referral status in new customer accounts). (confirmed listing; content inferred)
- `flow.automation` — Shopify Flow integration (review-collected / review-submitted triggers). (confirmed)
- `analytics.pixel` — Post-Purchase Referrals + Post-Review Referrals widgets render on order-summary/post-review pages; conversion tracking implied. (inferred)
- Cart page — Cart Reviews Widget showing ratings for in-cart items (via `theme.section`/proxy). (confirmed)
- NOT present: `functions.cartTransform`, `functions.discountRules` (Loox creates native Shopify discount codes for referrals/incentives rather than running discount Functions), `pos.extension`, `admin.action` (admin is Loox's own embedded app, not admin-block extensions). (inferred)

## functional_model
- `review = { id, rating(1–5), text, photos[], videos[], customer_name, product_ref, order_ref?, date, verified(bool), rewarded(bool/incentive), status(published|pending|rejected), featured(bool), merchant_reply?, translations[lang→text] }`
- `review_request = { order_ref, customer_email, channel(email|QR|form|SMS-via-Klaviyo), send_delay, incentive_discount?, status }`
- `incentive = { discount_type(%|fixed|free-ship), amount, min_purchase, applies_to(review|photo/video-review) }`
- `referral_program = { friend_discount{type,amount,min_purchase}, advocate_reward{type,amount,threshold}, advocate_balance_page }`
- `referral = { advocate_customer, referral_code, friend_order?, reward_status }`
- `upsell_offer = { trigger_product(s), offered_product, discount, reviews_shown[], duration, smart(bool) }`
- `product_group = { products[], shared_review_pool }` (product grouping so variants/related products share reviews)
- Relationships: review → product_ref (movable, groupable); review ← order/customer (verified badge); referral advocate = customer; upsell trigger product → offered product.

## settings_taxonomy

### content
- Star Rating Widget "Text" — text field (overrides default "([rating])") (confirmed)
- "Hide text" — toggle (confirmed)
- Carousel/section heading text — text (inferred)
- Referral offer copy: friend-discount title, advocate-reward title, subtitle, body/how-it-works text, CTA button label — text fields, with discount-amount placeholders (confirmed)
- Review request email subject/body, incentive messaging — text/rich fields (inferred)
- Merchant reply text per review — text (confirmed)
- Featured reviews selection (pin up to 10 per product) — pick-list (confirmed)

### style
- Rating icon shape/style — select (star and alternative icons) (confirmed)
- Icon/star color — color picker / hex text (confirmed)
- Text color — color picker (confirmed)
- Widget size — select (confirmed)
- Widget alignment — select (confirmed)
- Star Rating layout — select {Default, Single Icon} (confirmed)
- "Override default star color" — color picker (confirmed)
- Carousel: reviews-per-row desktop, reviews-per-row mobile — number (confirmed)
- Carousel font size + colors — select/color (confirmed)
- Carousel layout type — select {Testimonials, Gallery, Cards} (confirmed, chosen at block insert)
- Overall brand color / rating icon set — Branding settings (global) (confirmed)

### targeting
- Reviews Selection — select {all products | specific product} (confirmed)
- Product grouping — assign products to a shared review pool (confirmed)
- Show reviews for in-cart items (Cart widget) — implicit product targeting (confirmed)
- Upsell trigger — select trigger product(s) that fire the offer (confirmed)
- Smart Upsell — toggle (AI picks offered product per customer) (confirmed)
- Referral eligibility (post-purchase vs post-review vs onsite) — placement selection (confirmed)

### behavior
- Auto-publish mode — select {All reviews | 3–5 stars and up} (1–2★ held 14 days) (confirmed)
- "Open Floating Reviews Widget on click" — toggle (confirmed)
- "Show all reviews" — toggle (confirmed)
- "Show empty stars when there are no reviews" — toggle (confirmed)
- Pop-up widget display duration — number/duration (confirmed)
- Upsell offer availability duration — number/timer (confirmed)
- Review request send timing/delay — number (inferred)
- Sorting — AI smart-sort (best/visual first) vs recency; filters by rating/media (confirmed at feature level)
- Referral: min purchase amount, reward threshold — number (confirmed)
- Media upload allowed (photo/video) — governed by plan/toggle (confirmed)

### data
- Import reviews from other apps / migration — action (confirmed)
- Review syndication targets — toggles {Google Shopping, Meta Shops, TikTok Shop, Shop App} (confirmed)
- Rich snippets / SEO structured data — toggle (confirmed)
- Translations — enable AI translation (38 languages) (confirmed)
- API access + webhooks — programmatic read of review data (Convert+ plan) (confirmed)
- Integrations — Klaviyo, Omnisend, LoyaltyLion, Shopify Flow (confirmed)
- Discount code type for incentives/referrals — select {%, fixed, free shipping} (confirmed)

## data_model
Loox persists a first-party **reviews database** keyed by shop + product + order, storing rating/text/status/verified/rewarded/featured/reply/translations. **Media** (customer photos & videos) is uploaded and hosted on Loox's own CDN, not Shopify Files. It stores **customer references** (name, email, order) for verified-purchase badges and referral advocacy. **Referral state** — advocate records, generated referral codes, reward balances, and friend-discount codes — is persisted Loox-side; discount codes are pushed into Shopify as native price rules. **Review-request queue** (pending sends, delays, incentives) and **syndication feeds** (Google/Meta/TikTok/Shop) are maintained server-side. No permanent hard-delete of reviews (compliance-driven 14-day auto-publish, undo only within 7 days of import).

## visual_patterns
- **Archetypes:** review grid/masonry, list, three carousel variants (text testimonials, media gallery, mixed cards), inline star-rating snippet, aggregate trust badge, floating sidebar tab, on-product review pop-up, video slider, thumbnail/media strip, dedicated all-reviews page, cart mini-ratings.
- **Star primitive:** 1–5 icon row (star or alternate icon), configurable color/size; empty-state (hollow stars or hidden), "(count)" text suffix.
- **Review card:** avatar/name, star row, verified badge, rewarded badge, photo/video thumbnail (lightbox on click), body text, date, merchant reply block, "helpful"/featured pin.
- **States:** loading skeleton, empty (no reviews), pending/held, featured-pinned top, media-lightbox modal, "load more"/paginated.
- **Motion:** carousel auto-advance/drag scroll, pop-up timed enter/exit, lightbox zoom, sidebar slide-in. Emphasis on fast-loading, mobile-optimized, brand-matched styling ("Built for Shopify" performance bar).

## reviews_signal
**Praise (top):**
1. Fast, hands-on 24/7 support (agents editing the store directly).
2. Photo/video visual reviews genuinely collected and shown — strong social proof.
3. Feature-rich yet approachable setup; clean, brand-matching widget design.
4. Measurable conversion lift attributed to the widgets.
5. Broad ecosystem (Shop App / Google / Meta syndication, integrations).

**Complaints (top):**
1. Pricing / usage-based fees — surprise "usage" charges and cost escalation ("nearly 1K in usage fees") is the dominant grievance.
2. Limited granular styling — e.g. cannot vary review/star color scheme per page.
3. Feature gaps vs competitors (e.g. store-review feed into Google Merchant Center).
4. Free/entry plan caps (monthly review-request limits, video gated to paid).
5. Occasional import/moderation friction (no hard delete; 14-day forced publish window).

## mapping_note
A single `theme.section` recipe can express the **presentational** shell: star-rating snippet, review grid/carousel/badge with our existing knob vocabulary (color, size, alignment, layout select, heading text, per-row counts, product targeting). What clearly **exceeds a simple section** and forces `proxy.widget` + backend services: (1) a persisted **reviews data store** with rating/media/verified/status/reply/translation fields and per-product/grouped querying, sorting, filtering, pagination; (2) **media hosting** for customer photo/video uploads (own CDN, not static assets); (3) a **review-collection pipeline** — order-triggered email/QR/form requests with incentives, moderation/auto-publish rules, verified-purchase linkage to orders; (4) **referral & incentive flows** that mint native Shopify discount codes and track advocate reward balances (maps to `postPurchase.offer` + discount creation, not `functions.discountRules`); (5) **upsell** with AI product selection (`checkout.upsell`/`postPurchase.offer`); (6) outbound **syndication feeds** (Google/Meta/TikTok/Shop) and **API/webhooks**; (7) AI layer (smart-sort, highlight extraction, translation, AI replies). Our current section/widget vocabulary covers the display layer and its style/targeting/behavior knobs, but the entity model (reviews, media, referrals, requests), external side-effects (email, discount minting, syndication), and moderation state machine require a stateful backing service beyond any storefront section.
