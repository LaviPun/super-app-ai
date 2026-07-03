# Judge.me Product Reviews

> Vendor status: ACTIVE, not renamed/deprecated on Shopify. Note: Judge.me is now **Shopify-only** — the vendor ended WooCommerce/Squarespace support and is sunsetting BigCommerce (Jan 12 2026) and Duda (Jan 31 2026) support. Its legacy standalone "Checkout Comments" app was sunset in 2024 and folded into the main Reviews app as native checkout/customer-account extensions. The full app studied here is the current flagship listing (`apps.shopify.com/judgeme`). (confirmed)

## identity
- **name:** Judge.me Product Reviews App (confirmed)
- **vendor:** Judge.me (developer registered in London, GB; team based in India) (confirmed)
- **category:** Product Reviews (Marketing and Conversion) (confirmed)
- **App Store URL:** https://apps.shopify.com/judgeme (confirmed)
- **rating:** 5.0 / 5.0 (confirmed — 98% five-star: 40K×5★, 703×4★, 63×3★, 34×2★, 146×1★)
- **review count:** ~41,112 App Store reviews (confirmed as of fetch; grows continuously — it is the single most-reviewed app in the Shopify App Store) (confirmed)
- **install signal:** ~580,000 live Shopify stores (StoreLeads: 579,911; marketing cites "500K+ stores") (confirmed) — extremely high install base, top of the reviews category
- **pricing model:** Freemium. **Free** plan (unlimited product + store reviews, unlimited photo/video reviews, core review widget + star badge, carousels, rich snippets, importer, Shop/Etsy/Amazon sync). **Awesome** plan **$15/month** (15-day free trial): AI replies/summaries/translations, 130+ integrations, 16 widgets (Snippets, Q&A, Reviews Page), advanced auto-reminders, coupons & referrals, Google Shopping, Meta/TikTok Shop sync, full widget/email CSS customization. Launched Jun 25 2015. (confirmed)

## surfaces
Judge.me is heavily multi-surface. Mapped to the internal extension-type allowlist:

- **theme.section** (confirmed) — Primary surface. Ships a fleet of Theme App Extension **app blocks** placed via the theme editor: Review Widget (product page), Preview/Star-rating Badge, All Reviews Widget + dedicated All Reviews Page, Reviews Carousel (Video/Cards/Testimonials), Review Snippets (collection/PDP star rows), Floating Reviews Tab, Media/photo gallery grid, Q&A widget, Trust Badge/medals, AI Review Summary. Each block shows the relevant slice of the review corpus for the current product (or store-wide for carousels/all-reviews).
- **checkout.block** (confirmed) — "Checkout Review" checkout-UI extension block placed in the Checkout Editor (recommended below order summary), showing published reviews as social proof during checkout. (Replaces the sunset "Checkout Comments" app.)
- **postPurchase.offer** / **checkout.upsell**-adjacent (confirmed) — Thank-you / Order-status page widgets: "Write a new review" button, Referrals widget, and Coupon-rewards widget rendered on the post-purchase Order Status page.
- **customerAccount.blocks** (confirmed) — Five widgets in Shopify's **new** Customer Accounts UI (not legacy accounts): "Write a New Review" button (Orders + Order Status), "View My Reviews" button/page (edit past reviews, review un-reviewed items, store reviews), Coupon-Rewards widget, Referrals widget. Buttons nest under a "Manage" dropdown when both are enabled.
- **flow.automation** (confirmed) — Shopify Flow **trigger** "New review received" (fires on reviews submitted via Judge.me request emails; NOT for manual/web-form/imported reviews) and Judge.me **actions**. Enabled via Settings > Integrations > Shopify Flow. Used to branch on rating (thank-you for 5★, support outreach for 1–2★), notify Slack/email, issue rewards, log to Sheets.
- **admin.block** / **admin.action** (inferred) — Judge.me runs a full embedded Shopify admin app (its own dashboard for moderation, request scheduling, widget config); embedded-admin surfaces exist but the granular Admin UI Extension block/action primitives are not individually documented. (inferred)
- **analytics.pixel** (inferred) — App reports conversion/analytics and A/B testing on widgets; whether via a Web Pixel extension vs. internal tracking is not explicitly documented. (inferred)
- **pos.extension** (inferred) — POS orders are a first-class review-request order type (separate POS delay setting), but a storefront-style POS review widget is not clearly documented; POS is a data/targeting concept here more than a rendered POS UI extension. (inferred)
- **proxy.widget** (confirmed, mechanism) — Storefront widgets are hydrated by Judge.me's own hosted JS/API pulling review data from Judge.me servers (widgets are dynamic, not static Liquid), i.e. an app-proxy/hosted-embed pattern under the theme blocks.

**Coordination:** All surfaces are backed by ONE shared review corpus on Judge.me's servers, keyed by product and shop. A review collected via a request email (behavior surface) instantly populates the PDP widget, carousels, all-reviews page, checkout block, and customer-account "View My Reviews" page. Aggregate rating/count is mirrored into Shopify **standard metafields** (`reviews.rating`, `reviews.rating_count`) so native theme elements and Google rich snippets read the same numbers. The Flow trigger fires off the same review-submitted event that writes the corpus — cross-surface state is a single source of truth with metafield mirroring for Shopify-native consumers and hosted-JS hydration for the rich widgets.

## functional_model
Core entities (concrete shapes; field names paraphrased from docs/import schema):

- **review** = { id, rating (1–5 star, int), title (≤100 chars, optional), body/content (text), reviewer_name, reviewer_email, ip_address, review_date, product_ref (product identifier/handle/SKU), verified_buyer (bool badge — awarded when reviewer matches a shop buyer), media[] (photos + videos), curated/published (bool), custom_form_answers[], source (request-email | web-form | manual | imported | syndicated), helpful_votes, store_reply (AI or manual) }
- **store_review** = product-less review about the shop itself (separate "Store reviews" tab in the widget)
- **product** ↔ has-many **reviews**; product carries derived **rating aggregate** = { average (decimal), count (int), scale_min 1.0, scale_max 5.0, star distribution / bar chart }. Product **grouping** lets variants/related products share one review pool.
- **qa_item** (Q&A) = { question, answer, product_ref } — paid widget.
- **review_request** = { order_ref, line_item_ref, customer, order_type (domestic | international | POS), scheduled_send_at (fulfillment/delivery + delay), reminder(s), status } — one request row per reviewable line item per order.
- **custom_form** = up to 10 templates; **custom_question** = extra prompt shown in the review form, answer stored on the review.
- **coupon / referral** = incentive entity tied to a submitted review (reward-for-review, referral program).
- **customer_review_count** = per-customer aggregate persisted as a Shopify customer metafield.

Relationships: order → (fulfillment/delivery event) → review_request(s) per line item → (customer submits) → review → attaches to product → recomputes product aggregate → mirrors to metafields + fires Flow trigger + may issue coupon.

## settings_taxonomy
Merchant controls, grouped. (Review-Widget "new version" knobs are confirmed verbatim from the Judge.me help center; naming is exact.)

### content
- **Show widget title** — toggle; **Widget title** — text (shown when enabled) (confirmed)
- **Review word (singular)** / **Review word (plural)** — text inputs (relabel "review"/"reviews") (confirmed)
- **No reviews text** — text input (empty-state copy) (confirmed)
- **Show reviewer avatar** — toggle (confirmed)
- **Show reviewer location** — toggle (confirmed)
- **Show reviewer country flag** — toggle (confirmed)
- **Show review date** — toggle (legacy) (confirmed)
- **Show media gallery** — toggle; **Show expanded media gallery** — toggle (nested) (confirmed)
- **Review title** field — toggle to include (≤100 chars) in the collection form (confirmed)
- **Custom form questions** — rule/template builder: up to 10 custom templates, add custom questions to the review form (confirmed)
- **Review request email content** — text/template editor (subject, body, custom HTML/CSS styling templates) (confirmed)

### style
- **Star and bar chart color** — color picker (confirmed)
- **Button color** / **Button text color** — color pickers (confirmed)
- **Text color** / **Lighter text color** — color pickers (confirmed)
- **Corner styling** — select [Square, Soft, Rounded, Extra round] (confirmed)
- **Header text size** — select [Small, Medium, Large]; **Header text weight** — select [Regular, Bold] (confirmed)
- **Average rating style** — select [Minimal, Compact, Bold, Extra bold, Stars only] (confirmed)
- **Show bar chart** — toggle; **Bar chart type** — select [Numbers, Stars]; **Bar chart style** — select [Standard, Bold] (confirmed)
- **Theme (layout archetype)** — select [Standard, Cards, Align, Carousel] (confirmed)
- **Number of columns (desktop)** — select [4, 3, 2, 1] (Cards theme); **Review section size** — select [Small, Medium, Tall] (Cards) (confirmed)
- **Image style** — select [Thumbnails, Highlight]; **Review image ratio** — select [Square, 3:4, 4:3, 9:16, Auto] (confirmed)
- **Stars size** — select [Small, Medium, Large] (confirmed)
- **Verified badge style** — select [Bold badge, Standard badge, Bold text, Standard text] (confirmed)
- **Review title text size** / **Review text size** — select [Small, Medium, Large] (confirmed)
- **Review text length** — select [Short, Medium, Long] (truncation) (confirmed)
- **Maximum width** — slider 200–1200 px (theme-editor block setting) (confirmed)
- **Add a border around the widget** — toggle; **Border Style** — select (legacy Theme section) (confirmed)
- **Corner/Theme dropdown** — select (global theme applying to Review Widget + Happy Customers + Floating Tab, legacy) (confirmed)
- **Custom CSS (Advanced)** — text editor, limited to 1000 chars in new widget; full CSS on Awesome plan (confirmed)

### targeting
- **Preview data** — select [Sample data, Real data, No reviews] (theme-editor preview) (confirmed)
- **If no reviews show** / **If no reviews:** — select [Show empty widget, Reviews for other products, Hide widget] (confirmed)
- **Show store reviews** — toggle (adds Product-reviews + Store-reviews tabs) (confirmed)
- **Order type routing** — per-type request settings for [Domestic, International, Point of sale (POS)] orders (confirmed)
- **Marketing-consent gating** — send review requests only to customers who accepted marketing (rule/toggle) (confirmed)
- **Per-line-item dispatch** — manage which line items in an order get a request/reminder (rule) (confirmed)
- **Product grouping** — product-picker/rule to share one review pool across variants/related products (confirmed)

### behavior
- **Request timing / delay after fulfillment** — number (days) per order type, range 0–60 days (confirmed)
- **If not delivered send after fulfilment** — toggle (fulfillment fallback when Shopify never marks delivered) (confirmed)
- **Sending after order delivery** — toggle/mode (delivery-based vs fulfillment-based trigger) (confirmed)
- **Automatic reminder emails** — toggle + schedule (reminder cadence for non-responders) (confirmed)
- **Default sorting method** — select [Most recent, Highest rating, Lowest rating, Only pictures, Pictures first, Videos first, Most helpful] (confirmed)
- **Show search bar** — toggle (confirmed)
- **Reviews per page** — number 1–15 (or select 1–4 in Carousel) (confirmed)
- **Pagination type** — select [Load more button, Page number] (confirmed)
- **Transition speed** — number 0–60 s (Carousel autoplay) (confirmed)
- **Show social share buttons** — toggle with nested platform multiselect [Facebook, X, Pinterest, LinkedIn] (confirmed)
- **Coupons / rewards for reviews** — toggle + config (incentive on submission; Awesome plan) (confirmed)
- **Referrals program** — toggle + config (Awesome plan) (confirmed)
- **AI replies / summary / translations** — toggles (Awesome plan) (confirmed)
- **Shopify Flow enable** — toggle "Use Shopify Flow to create workflows based on Judge.me events" (confirmed)
- **Auto-publish / moderation** — moderation controls for incoming reviews (curate before publish) (inferred)

### data
- **Reviews importer / migration wizard** — file/rule mapper (CSV import: product id, title, body, rating, review_date, reviewer_name, reviewer_email, ip_address) (confirmed)
- **AliExpress / Amazon / Etsy / Shop App sync** — toggles/connectors to pull external reviews (confirmed)
- **Review syndication** — toggle (share reviews across Judge.me network) (confirmed)
- **Meta / TikTok Shop / Google Shopping / Google MyBusiness feeds** — connector toggles (push reviews to external channels) (confirmed)
- **130+ integrations** (Klaviyo, Gorgias, LoyaltyLion, PushOwl, PageFly, AfterShip…) — connector list (Awesome plan) (confirmed)
- **Export** — reviews export (confirmed)

## data_model
- **Full review records live on Judge.me's own servers/DB (external to Shopify)**, exposed through the Judge.me REST API and hydrated into storefront widgets via hosted JS. This is the system of record for review bodies, media, verified status, Q&A, replies, and moderation state. (confirmed for external hosting; DB internals inferred)
- **Shopify standard metafields** mirror aggregates for native/theme + SEO consumption: `product.metafields.reviews.rating` (decimal, with `scale_min` 1.0 / `scale_max` 5.0) and `product.metafields.reviews.rating_count` (int). A per-customer review count is stored as a **customer metafield**. (confirmed)
- **Media (photos/videos)** are uploaded through the review form and hosted/served by Judge.me (CDN); referenced from review records. (confirmed that media is Judge.me-hosted; specific CDN inferred)
- **Rich snippets / JSON-LD** injected into storefront pages for Google (SEO structured data), reading the same aggregate. (confirmed)
- **Coupons/referral codes** issued as incentive entities tied to reviews (codes generated by Judge.me; may create Shopify discount codes via integration). (inferred)
- **Metaobjects:** Shopify offers a native `product_review` metaobject type, but Judge.me's own storage is its external DB + the two standard metafields, not a Judge.me-owned metaobject definition (importing INTO Shopify's native metaobject is a separate migration path). (confirmed)

## visual_patterns
- **Layout archetypes:** four PDP review layouts — **Standard** (stacked list), **Cards** (1–4 column grid, Small/Medium/Tall), **Align**, **Carousel** (autoplay, 1–4 per view). Plus off-PDP archetypes: star-rating badge row, media-grid gallery, floating side tab, all-reviews page, testimonials/cards/video carousels, snippet star rows on collections.
- **Header composite:** average-rating hero (Minimal→Extra bold→Stars-only variants) + 5-bar rating distribution chart (numbers or stars) + optional search bar + sort dropdown + media gallery strip + "Write a review" CTA.
- **Review card:** avatar, reviewer name, location + country flag, verified-buyer badge (4 style variants), star row, title, truncatable body (Short/Medium/Long), photo/video thumbnails (thumbnail vs highlight, multiple aspect ratios), helpful votes, social share row, store reply.
- **Component states:** empty (custom no-reviews copy / show-other-products / hide), loading (async hydration), populated, filtered (only-pictures / pictures-first / videos-first), paginated (load-more vs numbered), expanded media lightbox, sample-data preview mode in the editor.
- **Motion/interaction:** carousel auto-transition (0–60s), load-more async append, media lightbox open, star hover in the collection form, corner-radius + color theming applied live in the customizer preview; floating tab slides in from screen edge.

## reviews_signal
**Praises (App Store, top):**
1. **Exceptional, fast support** — merchants repeatedly cite responses "within a couple minutes," help even on the free tier, AI + human blend. (confirmed)
2. **Genuinely generous free plan** — unlimited reviews + unlimited photo/video + core widgets at $0, unusual in the category. (confirmed)
3. **Easy, fast setup** — installs and runs "in a short amount of time," minimal technical skill needed. (confirmed)
4. **Seamless Shopify integration / blends into the theme** without slowing the storefront. (confirmed)
5. **Automated review collection** — request emails + incentives reliably grow review volume. (confirmed)

**Complaints (top — thin on the App Store itself given 98% 5★; drawn from vendor docs + third-party):**
1. **Platform lock-in / ecosystem retreat** — now Shopify-only; ended Woo/Squarespace, sunsetting BigCommerce & Duda → risk of broken widgets and lost social proof for non-Shopify users; migration away is painful. (confirmed, third-party)
2. **Widget-migration/CSS breakage** — upgrading from legacy to new Review Widget does NOT carry over Custom CSS; selectors/class names change and must be manually reapplied. (confirmed, vendor docs)
3. **Leftover code on theme change** — widgets/customizations are not auto-transferred when switching themes; requires manual reinstall/cleanup. (confirmed, vendor docs)
4. **Feature gating behind Awesome $15/mo** — Q&A, most of the 16 widgets, AI, coupons/referrals, advanced reminders, full CSS all require the paid plan; free tier is core-only. (confirmed, listing)
5. **Custom CSS cap** — new Review Widget limits inline Custom CSS to 1000 characters (heavier theming needs paid/full CSS). (confirmed, vendor docs)

## mapping_note
A single Judge.me widget (e.g. the PDP Review Widget as a `theme.section`) maps cleanly onto one constrained RecipeSpec: it's a themeable app block with a well-bounded settings schema (colors, layout enum, content toggles, pagination) — our style/content/behavior knob vocabulary covers it well. But **Judge.me as a product decisively exceeds a single-module recipe** in several structural ways:

- **It requires a persistent external data store.** The review corpus (bodies, media, verified status, Q&A, replies, votes) lives on Judge.me's own servers and is far more than metafields can hold; every surface is a read-view over that store. A recipe that only emits a Shopify module + a couple of metafields cannot BE the system of record.
- **It is a cross-surface blueprint, not one module.** One shared corpus fans out to PDP theme blocks, off-PDP carousels/all-reviews page, a checkout.block, post-purchase/order-status widgets, and customerAccount.blocks — all reading/writing the same state. That is a coordinated multi-extension package with shared state + metafield mirroring, i.e. a blueprint set, not a single recipe.
- **It runs background jobs / a scheduler + rule engine.** Review-request emails and reminders fire on fulfillment/delivery + configurable 0–60 day delays, per order type (domestic/international/POS), per line item, gated on marketing consent — a durable scheduling + targeting rule engine with reminder cadences. This is exactly the "background jobs / rule engine" territory beyond a stateless render module.
- **It performs external side-effects and event automation.** Inbound review-collection UGC pipeline, a Shopify Flow trigger/action, coupon/referral issuance, and outbound syndication/feeds to Google/Meta/TikTok + 130+ integrations. It both consumes and emits external side-effects around review events — well past a self-contained module's remit.
