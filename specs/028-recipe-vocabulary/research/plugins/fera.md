# Fera Product Reviews App

> Study record for the RecipeSpec vocabulary corpus. Facts labeled `confirmed` (seen on App Store listing, Fera help center, or developer docs) or `(inferred)` (deduced from behavior/architecture, not directly documented). The app is live and actively maintained — **not renamed, merged, or deprecated**. (This is Fera Commerce Inc's own app, not a Bold app; no vendor migration applies.) `confirmed`

## identity
- **name**: Fera Product Reviews App `confirmed`
- **vendor**: Fera Commerce Inc (Sheridan, WY, US; app launched June 22, 2017) `confirmed`
- **category**: Product reviews, under Marketing and conversion (internal target category: reviews) `confirmed`
- **App Store URL**: https://apps.shopify.com/fera `confirmed`
- **rating**: 4.7 / 5 (distribution ~95% 5★, 2% 4★, 2% 1★) `confirmed`
- **review count**: ~1,909 App Store reviews `confirmed` (Fera markets 4.95/5 across Shopify+Wix+BigCommerce combined — different denominator) `confirmed`
- **install signal**: ~9,700+ live Shopify installs per third-party trackers (storeleads/open.store) `confirmed`; long-tenure merchants report 7+ years of continuous use `confirmed`
- **pricing model**: Freemium-style tiered SaaS billed monthly in USD, metered on review-requests/month + orders/month + users + media storage, with a 60-day free trial. Tiers: **Startup $9** (100 requests/mo, 200 orders/mo, 2 users, 100MB), **Small $29** (1,000 requests, 2,000 orders, 3 users, 1GB, custom email domain), **Medium $99** (10,000 requests, 20,000 orders, 5 users, 10GB, multi-store sync), **Semi-Large $199** (25,000 requests, 50,000 orders, 7 users, 50GB, priority support). `confirmed`

## surfaces
Fera is fundamentally a **storefront-display + collection-engine** app. Its widgets install as Shopify **theme app extension blocks / app embeds** (Online Store 2.0 / "Dawn" themes: theme editor → Add Block → "Fera Product Review" from Apps). `confirmed`

Mapped to internal extension-type vocabulary:

- **theme.section** (primary, multi-instance): the entire widget fleet renders as theme app blocks/embeds. Distinct widget "kinds": Product Reviews Widget (review list on PDP), Product Detail Rating (star summary under title/price), Product Media Gallery (photo/video from that product's reviews), Product Collection Rating (avg rating on collection cards), All Reviews page (site-wide feed), Testimonial Carousel (curated best reviews slider), Media Gallery (site-wide UGC photos/videos), Floating Rating Badge (fixed-corner store rating), Overall Rating Banner (top/bottom store-rating strip), Product Questions & Answers, Store Questions & Answers, Write-a-Review form. `confirmed`
- **proxy.widget** (inferred backing): widgets are hydrated by Fera's hosted JS (`fera.js`) pulling review data from Fera's own servers/API at runtime, not from Liquid data. The theme block is a mount point; content is fetched client-side. `(inferred)` — consistent with confirmed "Fera maintains the actual review data on its own servers." `confirmed`
- **analytics.pixel** (inferred): review-request funnel tracking, widget impression/conversion analytics, and A/B-adjacent quality-sort telemetry imply client-side event capture. `(inferred)`
- **flow.automation** (behavioral, Fera-internal not Shopify Flow): the automated review-request engine is an event-triggered scheduler (order-fulfilled → delay → send → follow-up) — a durable timed workflow, though run on Fera infra rather than as a Shopify Flow extension. `confirmed` that the behavior exists; `(inferred)` that it is not a native Shopify Flow connector.
- **admin.block / admin.action**: the merchant management UI (moderation queue, widget editor, campaign builder) runs largely on Fera's **external** app site rather than embedded in Shopify admin — reviewers explicitly note "App UI is not embedded into your Shopify platform but runs on an external site." So admin presence is thin/linked, not a rich embedded admin surface. `confirmed`
- **NOT used**: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, checkout.upsell, checkout.block, postPurchase.offer, pos.extension, customerAccount.blocks. Incentive discounts are generated as **plain Shopify discount codes emailed to the shopper**, not as checkout Functions. `confirmed`/`(inferred)`

**Cross-surface coordination**: all storefront widgets are views over one shared review dataset held on Fera's servers; the aggregate (avg rating + count) is **also** written back to Shopify standard product metafields (`reviews.rating`, `reviews.rating_count`) so Liquid, Google rich snippets, and collection widgets stay in sync. The collection-rating and floating-badge widgets read the same aggregates the PDP widget computes. The review-request campaign (collection side) feeds new reviews into the same store that the display widgets render (handoff: request → submission → moderation → published → widget). `confirmed`

## functional_model
Core entities and relationships (field names partly `(inferred)` from documented behavior + standard reviews-app schema; Fera exposes a v3 REST API with these resources — `confirmed` resource names, `(inferred)` exact field spellings):

- **Review** = { rating (1–5 stars), heading/title, body/text, media[] (photos + videos), customer_ref, product_ref (or store-level for store reviews), verified_buyer (bool), source (native | Google | Facebook | Amazon | AliExpress | Etsy | Judge.me | Yotpo | Stamped | Loox | Trustpilot | Shopify Reviews | CSV | manual), status (pending | approved | rejected/hidden), reply/merchant_response, helpful_votes, quality_score, created_at, country/location }. `confirmed` (rating/media/verified/source/status/reply/product+customer refs); `(inferred)` (exact field keys, helpful_votes, quality_score)
- **Product** (mirror of Shopify product) = { shopify_product_ref, avg_rating, review_count } — aggregates synced to metafields. `confirmed`
- **Customer** = { name, email, verified_buyer flag, order history link } used for verification + request targeting. `confirmed` (verification concept); `(inferred)` fields
- **Question / Answer** (Product Q&A + Store Q&A) = { question_text, answer_text, product_ref (or store), asker, status }. `confirmed` (Q&A exists); `(inferred)` fields
- **ReviewRequest / Campaign** = { trigger_event (order fulfilled), delay_days (default 14), channel (email | SMS | returning-visitor popup), goal (Reviews | Photos | Videos | Product reviews | Store reviews), incentive_ref, follow_up_enabled, follow_up_delay, conditions[], on_repeat_orders (bool, 12-mo suppression) }. `confirmed`
- **Incentive/Reward** = { type (discount | loyalty points via Smile.io | cashback), value, required_submission (bool), dynamically-generated coupon code on approval }. `confirmed`
- **Media asset** = { type (photo|video), url on Fera CDN, review_ref } counted against plan storage quota (100MB–50GB). `confirmed`

Relationships: Product 1—* Review; Review *—1 Customer; Review 1—* Media; Campaign 1—* ReviewRequest; ReviewRequest —1 Incentive; approved Review → triggers Incentive coupon issuance. `confirmed`/`(inferred)`

## settings_taxonomy
Merchant-facing controls grouped under the five headings. Widget-design knobs live in each widget's **Design tab** (accordions vary per widget: Layout, Body, Header, Stars, Buttons); global tokens live in **Configuration → Branding & Design**. `confirmed` structure.

### content
- **Widget kind** — select[ Product Reviews | Product Detail Rating | Product Media Gallery | Product Collection Rating | All Reviews | Testimonial Carousel | Media Gallery | Floating Rating Badge | Overall Rating Banner | Product Q&A | Store Q&A | Write-a-Review ] `confirmed`
- **Reviews per product page (count shown)** — number `confirmed`
- **Header / title text** — text `(inferred)` (standard "Header" accordion) 
- **Show verified-buyer badge** — toggle `confirmed`
- **Show reviewer name / date / photos** — toggle each `(inferred)`
- **Review summary / bottom-line rating block** — toggle (avg + star breakdown) `confirmed` ("Review summaries" listed)
- **Q&A question/answer prompts** — text `confirmed` (Q&A widgets)
- **Import reviews source** — select[ Google Business, Trustpilot, Judge.me, Facebook, Yotpo, Stamped, Shopify Reviews, Loox, AliExpress, Etsy, Amazon ] + CSV upload + manual entry `confirmed`
- **Syndicate/sync reviews** — toggle (Facebook, Google, Amazon into one feed; multi-store sync on Medium+) `confirmed`

### style
- **Layout** — select[ List | Masonry | Carousel/Grid ] (List↔Masonry toggle sits below the "Body" accordion; Carousel is a separate widget) `confirmed`
- **Colors** — color pickers (text, background, accent) per-widget and global `confirmed`
- **Star color** — color `confirmed` (implied by star-widget design)
- **Fonts / font family** — select/text (global Branding & Design + per-widget) `confirmed`
- **Font sizes** — number `confirmed` ("customize the colors, sizes, fonts")
- **Border radius / corner rounding, spacing, alignment** — number/select `(inferred)` (standard design-tab knobs)
- **Floating badge position** — select (corner placement, customizable positioning) `confirmed`
- **Banner placement** — select[ top | bottom ] `confirmed`
- **Branding & Design (global) preset** — global color/font tokens applied across all widgets `confirmed`
- **Modern-vs-legacy widget style** — migration toggle (Advanced tab) `confirmed`

### targeting
- **Display conditions** — rule-builder (e.g. show reviews only to users in a specific country) `confirmed`
- **Which products/pages a widget renders on** — placement selection via theme editor block insertion `confirmed`
- **Campaign send conditions** — rule-builder on order/customer attributes (order total, customer country) `confirmed`
- **Product exclusions from review requests** — product/list picker in Store Settings `confirmed`
- **On repeat orders** — toggle (suppress re-requesting same product within 12 months) `confirmed`

### behavior
- **Automatic review requests** — toggle (auto vs one-time) `confirmed`
- **Trigger event** — select (order fulfilled is the documented default) `confirmed`
- **Delay before send** — number (days; default 14) `confirmed`
- **Channel** — select[ Email | SMS | Returning-visitor popup ] `confirmed`
- **Email/message goal** — select[ Reviews | Photos | Videos | Product reviews | Store reviews ] `confirmed`
- **Message builder** — visual/WYSIWYG builder with test-send `confirmed`
- **Follow-up (2nd) message** — toggle + timing number `confirmed`
- **Moderation / auto-publish** — moderate submissions before publish (approve/reject); manage product + store reviews and photo/video `confirmed`
- **Review quality sorting** — toggle (surfaces higher-quality/verified reviews near top) `confirmed`
- **Rich snippets / schema.org output** — auto-enabled (product rating in Google Search & Shopping); auto-detects existing store schema `confirmed`
- **Launch state** — Test | Launch | Save as draft `confirmed`

### data
- **Incentive type** — select[ Discount code | Loyalty points (Smile.io) | Cashback (Shopify only) ] `confirmed`
- **Incentive value** — number/discount config `confirmed`
- **Required submission for reward** — toggle (must submit before receiving cashback/discount) `confirmed`
- **Dynamically-generated coupon on approval** — toggle `confirmed`
- **Custom email domain** — text/DNS (Small+ plans) `confirmed`
- **Metafield sync** — writes `reviews.rating` + `reviews.rating_count` to Shopify product metafields (default for stores after 2022-03-15) `confirmed`
- **Import/export & migration** — CSV import/export, review migration from other apps `confirmed`
- **Media storage quota** — plan-metered (100MB–50GB) `confirmed`

## data_model
- **Primary store: Fera's own external database/servers** — full review content, reviewer details, media metadata, Q&A, campaigns, and rewards live in Fera's systems, NOT in Shopify. `confirmed`
- **Media/CDN**: photos and videos hosted on Fera's CDN, counted against per-plan storage quota. `confirmed`
- **Shopify write-back**: aggregate-only sync to Shopify **standard product metafields** `reviews.rating` (avg) and `reviews.rating_count` (count), consumable in Liquid as `{{ product.metafields.reviews.rating.value }}`. Only summary stats leave Fera; content stays remote. `confirmed`
- **Codes**: incentive/discount codes generated dynamically (issued as native Shopify discount codes on review approval). `confirmed`
- **No documented use of Shopify metaobjects** for review bodies — the metafield sync is aggregate summary only. `confirmed`
- **API**: Fera exposes a v3 REST API (`developers.fera.ai`) with `fera.js` runtime, Widgets API, JavaScript API, URL API, and Webhooks — implying an externally queryable review/product/customer/media object graph. `confirmed`

## visual_patterns
- **Layout archetypes**: vertical **List** (text-first review feed, default); **Masonry** grid (photo/video-heavy UGC wall); **Carousel/slider** (curated testimonials); compact **star-summary + count** inline block; **floating fixed-corner badge**; full-width **rating banner** strip. `confirmed`
- **Component states**: verified-buyer badge (verified vs unverified); pending vs published (moderation-gated, hidden until approved); with-media vs text-only review card; expandable review body / "read more"; empty state (carousel recommended "when you don't have many reviews"). `confirmed`/`(inferred)`
- **Interaction/motion**: carousel auto-rotate/slide, media lightbox for photos/videos, star hover/selection in Write-a-Review form, helpful-vote interaction, Q&A expand/collapse, returning-visitor popup trigger. `confirmed` (carousel, media gallery, popup); `(inferred)` (lightbox, hover)
- **Responsiveness**: new-version widgets explicitly "more responsive"; mobile-friendly review list is a headline claim. `confirmed`
- **Trust/SEO surface**: star rich-snippets rendered into Google via schema.org (visual outcome outside the theme). `confirmed`

## reviews_signal
**Top praises**
1. Exceptionally responsive human support ("real people," fast, goes "above and beyond" on customization + migration). `confirmed`
2. Easy setup / user-friendly, seamless Shopify + theme-editor integration, no code needed. `confirmed`
3. Reviews display "beautifully" and are highly customizable — strong perceived design quality and conversion lift. `confirmed`
4. Robust feature set: automated photo/video review requests, imports/syndication, long-term reliability (7+ year users). `confirmed`

**Top complaints**
1. Reliability/stability: reports of the app "constantly crashing," widgets/"reviews on websites often offline," and cross-user "projects merging." `confirmed`
2. Pricing creep: "a bit pricey," and "every few months changes conditions to charge you more money." `confirmed`
3. Long-standing bugs unfixed: recurring problems reportedly persisting "for years" despite support contact. `confirmed`
4. External/non-embedded admin UI runs off-Shopify (context-switch friction). `confirmed`
5. Some capabilities (live support, design customization, multi-language) gated behind paid tiers. `confirmed`

## mapping_note
Fera maps onto internal vocabulary primarily as a **multi-instance theme.section fleet over a shared remote dataset**, plus an event-driven request/reward engine. A single RecipeSpec module can capture *one* Fera widget's surface + settings vocabulary (e.g. a PDP reviews list block with Design-tab knobs and display conditions). But Fera **materially exceeds a single-module recipe** on several axes:

1. **Requires a persistent external data store + media CDN.** Reviews, media, Q&A, and reward state live on Fera's servers with per-plan storage quotas; a recipe that only emits a theme block cannot own this backing store. Needs a real data-store dependency, not just presentation config.
2. **Cross-surface blueprint with shared state.** 10+ distinct widgets (PDP list, collection rating, floating badge, carousel, media gallery, banner, Q&A, write-a-review, all-reviews page) are coordinated views over one review corpus, with aggregate write-back to Shopify metafields keeping Liquid + rich snippets in sync. This is a coordinated multi-module blueprint, not one module.
3. **Background-job / durable-workflow engine.** The automated review-request pipeline (order-fulfilled → configurable delay → email/SMS/popup send → conditional follow-up → 12-month suppression) is a timed, event-triggered, stateful scheduler — background jobs + a rule engine, well beyond a synchronous module render.
4. **External side-effects and a rule engine.** Dynamic Shopify discount-code issuance on review approval, Smile.io loyalty-point grants, cashback, third-party import/syndication (Google/Facebook/Amazon/Judge.me/etc.), and rule-builder display/targeting conditions all imply outbound integrations, conditional logic, and moderation state transitions that a constrained single-module RecipeSpec cannot express.
