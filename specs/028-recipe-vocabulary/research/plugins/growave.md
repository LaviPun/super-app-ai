# Growave: Loyalty & Wishlist

> Renaming note (confirmed): The product formerly listed as "Growave: Loyalty Wishlist Reviews" is now listed as **"Growave: Loyalty & Wishlist"** — same vendor (Growave), same app, no deprecation/merge. It is an all-in-one retention suite (Loyalty/Rewards + Wishlist + Reviews + Referrals + Instagram UGC). This record studies the current listing. The Wishlist module is treated as the primary lens per the target category, with Reviews and Loyalty documented because they share surfaces and the settings vocabulary.

## identity
- **name**: Growave: Loyalty & Wishlist (confirmed)
- **vendor**: Growave (confirmed; partner page `apps.shopify.com/partners/growave-io`)
- **category**: Loyalty and rewards / Wishlists (confirmed; App Store dual-category). Primary study category per task = wishlist.
- **App Store URL**: https://apps.shopify.com/growave (confirmed)
- **rating**: 4.8 / 5 (confirmed)
- **review count**: ~1,235 reviews (confirmed; was 1,226 in an earlier fetch this session — actively accruing)
- **install signal**: "Built for Shopify" badge (confirmed, highest App Store tier); ~12,600 live installs reported by StoreLeads/App Store aggregation (confirmed via search snippet, ~12,639)
- **pricing model**: Freemium, order-volume-tiered subscription (confirmed). Free ($0, up to ~100–200 monthly orders); Entry ~$15–49/mo (referrals, nudges, POS, 1 integration); Growth ~$199/mo (VIP tiers, store credit, checkout extensions, on-sale + back-in-stock wishlist emails, Google Shopping reviews, video reviews); Plus ~$499/mo (full API, headless, CSM). 14-day trial on paid plans. (confirmed; exact free-tier order cap drifts between 100 and 200 across sources — (inferred) it is order-count gated, not a hard install cap)

## surfaces
Mapped to internal extension-type vocabulary:

- **theme.section** (confirmed): The bulk of the storefront footprint. Multiple named theme app extension blocks / app-embed blocks:
  - Add-to-Wishlist button (product info block; heart icon, outline→filled state; drag-repositionable above/below price/ATC)
  - Wishlist floating launcher/drawer (app embed, sitewide except wishlist page)
  - Reviews widget (full review list + Write-a-review + Q&A tabs, on product page)
  - Star-rating badge (compact, under product title; product info block)
  - Reviews Slider + Reviews Mini Slider (home page section / product info section, added via "Add section → Apps")
  - Reviews floating widget (sitewide launcher)
  - Rewards launcher/panel (loyalty points widget, app embed, sitewide)
  - Review-stars block on collection pages (uses Shopify's native `Review stars` block)
- **proxy.widget** (inferred, strong): The dedicated **Wishlist page** and dedicated **Reviews page** and the loyalty/rewards standalone page are served as app-owned pages (app-proxy-style routes) rather than as pure theme sections — the floating drawer header links out to a full "My Wishlist" page that Growave renders and brands. Guest wishlist state + multi-list data is fetched/persisted through Growave's backend, not Shopify metafields.
- **customerAccount.blocks** (confirmed): First-class **customer account UI extensions** on Shopify's new customer accounts:
  - Wishlists Page extension (Profile page — dashboard: create lists, share, filter/sort, product details)
  - Loyalty Info widget (Profile + Orders pages — points balance, expiration, rewards, referral link, VIP tier progress bar, POS QR code)
  - Rewards Page extension (dedicated account menu section — earn/redeem/referral)
  - Ask-Review block (Order Status page — per-purchased-product review prompt)
  - Earned-Points banner (Order Status page — "You earned X points for this order")
- **checkout.block** (confirmed, Growth+): Checkout extensions — loyalty/points redemption + reward display surfaced in checkout UI (Checkout Extensibility).
- **pos.extension** (confirmed, Entry+): POS rewards — redeem/earn points at point of sale; customer identified via QR code from the account loyalty widget.
- **analytics.pixel** (inferred): Conversion analytics for wishlist ("wishlist → sale" attribution) and reviews implies storefront event capture; whether via Web Pixel extension or app JS is unconfirmed.
- **flow.automation** (inferred, as internal analogue): The automated wishlist/review notification engine (reminder series, on-sale, back-in-stock) is trigger-driven background automation — not a Shopify Flow connector per se, but occupies that role in our vocabulary.

**Coordination**: Surfaces share one server-side customer/loyalty/wishlist state keyed on the Shopify customer (or captured guest email). The storefront heart button, the floating drawer, the app-proxy wishlist page, and the customer-account Wishlists extension all read/write the **same wishlist record** in real time ("real-time syncing across all widgets"). Loyalty points earned via a storefront review action appear in the account loyalty widget, the checkout redemption block, and the POS QR flow — one points ledger, many render surfaces. This is an explicit multi-surface, shared-datastore handoff, not independent widgets.

## functional_model
Core entities (concrete shapes; field types (inferred) from observed UI):
- **wishlist** = { id, owner_ref (customer_id | guest_email), name, is_default:bool, is_public:bool, share_token, items: WishlistItem[] } — supports multiple named lists per owner ("Add a new list", "boards").
- **wishlist_item** = { product_ref, variant_ref, added_at, price_at_add, in_stock_snapshot } — price/stock snapshots power on-sale + back-in-stock notifications.
- **review** = { id, product_ref, rating:1–5, title, body, author_name, verified_buyer:bool, media: Media[≤5 img/video], attributes: {k:v}[], helpful_votes:int, owner_reply, source_indicator, status: pending|published|hidden, created_at, translated_variants }.
- **question** (Q&A) = { product_ref, question_text, answer_text, author, status } — separate tab, coupled to the reviews module.
- **loyalty_member** = { customer_ref, points_balance, points_expiry, lifetime_spend, vip_tier_ref, referral_code, store_credit_balance }.
- **points_ledger_entry** = { member_ref, delta, reason (order|signup|review|photo_review|birthday|social_share|referral|redemption), reference_id, expires_at }.
- **earning_rule** = { action_type, reward_type (points|discount|gift_card|free_product|store_credit), value, conditions (min_spend, order_count for punch-card, "spend X get Y") }.
- **vip_tier** = { name, entry_threshold (points|spend), perks[], multiplier }.
- **reward / redemption** = { type (fixed_discount|percent_discount|free_product|store_credit|free_shipping), cost_in_points, generated_discount_code }.
- **referral** = { referrer_ref, referee_ref, reward_referrer, reward_referee, fraud_flags }.
- **notification** = { channel:email, template_ref, trigger, delay, active:bool, content_overrides }.

Relationships: one owner → many wishlists → many items (each item → Shopify product/variant). One product → many reviews + many questions. One customer → one loyalty_member → many ledger entries; member → one vip_tier; redemptions consume points and emit discount codes. Notifications are scoped to a module (rewards/reviews/wishlist) and fire off entity state changes.

## settings_taxonomy
The actual merchant-facing controls, grouped. Confirmed where sourced from help docs; (inferred) where deduced.

### content
- **Button text** — text (Add-to-Wishlist label) (confirmed)
- **Languages / label editor** — text, per-string, per-module (Branding → Languages → Wishlist / Reviews) covering every visible string; 16-language multi-language support (confirmed)
- **Email subject / title / body / button text** per notification — text, with Liquid variables `{{customer_name}}`, `{{order_number}}`, product vars (confirmed)
- **Email banner image** — image upload per notification (confirmed)
- **Review widget display type** — select[ stars only | text+stars | text+stars+Q&A link ] (confirmed)
- **Q&A section enabled** — toggle (Reviews → Settings → Questions & Answers) (confirmed)
- **Wishlist multiple lists / boards** — toggle-ish (support for multiple named lists) (inferred)

### style
- **Wishlist launcher position** — select[ Left | Right ] (default Right) (confirmed)
- **Launcher background** — select[ White | Black ] (default White) (confirmed)
- **Launcher font color** — select[ Black | White ] (default Black) (confirmed)
- **Launcher icon background** — select[ Primary | Secondary ] (default Primary) (confirmed)
- **Button color** ("Add a new list") — select[ Primary | Secondary ] (default Primary) (confirmed)
- **Buttons font color** — select[ White | Black ] (default Black) (confirmed)
- **Button style** — select[ Outlined | Filled ] (default Outlined) (confirmed)
- **Border radius** — number (0–~90; default 90) (confirmed)
- **Link color** ("Save my Wishlist") — select[ Primary | Secondary ] (default Secondary) (confirmed)
- **Wishlist icon style** — select/custom (heart icon appearance) (confirmed)
- **Launcher device visibility** — multi-toggle[ mobile | desktop ] (confirmed, v1.0 wording)
- **Primary / Secondary brand colors** — color (global palette the Primary/Secondary selects resolve to) (inferred)
- **Reviews branding** — colors, star icon, layout, custom CSS (Branding → Reviews) (confirmed)
- **Email branding** — background color, button color, text color, font (Branding → Emails) (confirmed)
- **Star icon style** — select/icon (confirmed)

### targeting
- **Rewards availability / eligibility** — select[ everyone | Specify customers' eligibility ] (Rewards → Settings → General) (confirmed)
- **Allow reviews only from verified buyers** — toggle (Reviews → Settings → Review request rules) (confirmed)
- **Reviews slider filter by rating** — select[ 5★ | 4★+ | all ] (confirmed)
- **Reviews slider image source** — select[ product images | customer-uploaded ] (confirmed)
- **Featured / pinned reviews only** — toggle (slider + mini slider) (confirmed)
- **Star badge: hide when no reviews** — toggle (confirmed)
- **VIP tier entry thresholds** — number (points or spend) per tier, rule-like (confirmed)
- **Guest email required before saving** — toggle (wishlist) (confirmed)

### behavior
- **Wishlist feature on/off** — toggle (Growave → Settings) (confirmed)
- **App Embed on/off** — toggle (Shopify theme customizer → App embeds) (confirmed)
- **Earning rules / rewardable actions** — rule-builder: per action (order $ spent, signup, review, photo/video review, birthday, social share, referral, punch-card by order count) → reward type (points | discount | gift card | free product | store credit) + value + conditions (min spend, "spend X get Y", order count) (confirmed)
- **Points redemption options** — configurable rewards: fixed/percent discount, free product, free shipping, store credit; cost-in-points per reward (confirmed)
- **Points expiration** — toggle + number (expiry window) (confirmed)
- **Points-per-$1 value** — number (e.g. "$1 = 5 points") (confirmed)
- **Saved-wishlist reminder series** — toggle + number[] (3-email cadence with per-email delay days, e.g. 1 / +3 / +5) (confirmed)
- **Wishlist item on-sale notification** — toggle (Growth+) (confirmed)
- **Back-in-stock notification** — toggle + restock threshold number (default 5) + rate caps (≤3 products/email, 10-min window, 1 email/customer/day) (confirmed)
- **Review request email automation** — toggle + delay/timing (post-fulfillment) (confirmed)
- **Q&A new-question notifications** — toggle (confirmed)
- **Reviews list: default count displayed / min images to trigger slider** — number (confirmed)
- **Reviews sort** — select[ relevance | recency | rating | helpfulness ] (confirmed)
- **Reviews slider sequence** — select[ Default | Shuffle ] (confirmed)
- **Media upload allowed types** — img (jpg/png/webp) always; video (mov/mp4/avi/mkv/webm) Growth+ (confirmed)

### data
- **Import Wishlist (CSV)** — file upload (≤10MB), template with customer + product identifiers, validate-then-import (confirmed)
- **Export Wishlist (CSV)** — action, delivered by email (confirmed)
- **Import/Export Reviews & Q&A (CSV)** — file upload / export, column-header-aligned template (confirmed)
- **Import customer data / Export Rewards (points, referrals, VIP tiers)** — CSV import/export (confirmed)
- **Custom email domain** — text/DNS config (Settings → Custom email domains) (confirmed)
- **Integrations** — connectors: Klaviyo, Omnisend, Recharge, Gorgias, Attentive, TikTok Shop, PushOwl, GemPages, PageFly (plan-gated integration count) (confirmed)
- **API / headless access** — toggle/keys (Plus) (confirmed)

## data_model
- **External Growave database** (confirmed as the system of record): wishlists, wishlist items (with price/stock snapshots), reviews, Q&A, points ledger, VIP tiers, referrals, and notification config are stored server-side in Growave's backend, not in Shopify. Evidence: CSV import/export is routed through Growave's own admin and emailed out; guest wishlists are keyed on captured email with no Shopify customer object; real-time cross-surface sync implies a shared external store.
- **Shopify linkage**: entities reference Shopify product/variant/customer IDs; requires Shopify **customer accounts enabled** for member-bound features. Redemptions emit **Shopify discount codes / store credit / gift cards**. (confirmed)
- **Media/CDN** (inferred): review photos/videos (≤5 per review) are hosted on Growave/third-party CDN.
- **Codes**: generated discount codes, referral share codes/tokens, wishlist public share tokens, POS QR code payload. (confirmed/inferred mix)
- **Shopify metafields/metaobjects** (inferred, likely minimal): star-rating aggregates may be mirrored to product metafields to feed Shopify's native `Review stars` collection block; core data is not metaobject-native.

## visual_patterns
- **Layout archetypes**: (1) inline product-page injections (heart button, star badge under title, full reviews section with tabs); (2) floating launcher → slide-in drawer/sidebar (wishlist drawer, reviews floating widget, rewards panel) pinned left/right; (3) horizontal carousel/slider (reviews slider, mini slider) with click-to-expand modal; (4) full app-owned page (My Wishlist page, Reviews page, Rewards page); (5) account-page dashboard blocks (Wishlists, Loyalty info with tier progress bar + QR).
- **Component states**: heart icon outline (not saved) → filled (saved); review card states (pending/published/hidden, verified-buyer badge, owner-reply expanded, helpful-vote toggled, translated); star badge empty/hidden-when-zero; slider empty state (needs ≥5 reviews); VIP tier progress bar; guest-vs-authenticated wishlist.
- **Motion/interaction**: launcher click → drawer slide-in; review card click → enlarged modal with prev/next slider buttons; star badge hover → distribution-graph tooltip + "See all reviews"; anchor-scroll from star badge to reviews tabs; drag-to-reposition block in theme editor; real-time optimistic add/remove syncing across surfaces; filter/sort dropdowns re-render lists in place.

## reviews_signal
**Praises (confirmed):**
1. Exceptional, fast, hands-on support — repeatedly singled out ("professional, patient, knowledgeable"; help with custom CSS/theme integration).
2. All-in-one consolidation — loyalty + reviews + wishlist + referrals in one app replaces a stack of separate apps.
3. Reviews/social-proof measurably boost purchase confidence and repeat/referral sales.
4. Seamless Shopify integration + customizable, branded email notifications.
5. Deep customization and unique reward types (store credit, gift cards, VIP perks).

**Complaints (confirmed):**
1. ROI/billing pain — e.g. charged for years with "$0" attributed value; unclear value for the price at higher tiers.
2. "Bloatware" — installs functionality across the whole site; can slow the storefront unless every feature is used (performance overhead).
3. Theme editor / in-app customizer not robust enough — wishes for more built-in customizability without CSS.
4. Occasional attribution/data bugs (e.g. review mis-attribution) and initially defensive support responses in some cases.
5. Price steps are steep between tiers; key wishlist notifications (on-sale, back-in-stock) gated behind Growth ($199).

## mapping_note
How this maps onto our constrained RecipeSpec vocabulary, and where it **exceeds** a single-module recipe:

- A single Growave storefront element (the Add-to-Wishlist heart, or a star-rating badge, or a reviews carousel) maps cleanly to one `theme.section` recipe with a settings schema in our five-axis taxonomy — that part is in-vocabulary.
- **Exceeds via a persistent external data store**: wishlists, points ledgers, reviews, and Q&A are stateful, cross-session, cross-surface records keyed on customer/guest — a stateless generated theme.section cannot own this. Needs a backing datastore + read/write API, plus guest-email identity and CSV import/export tooling.
- **Exceeds via cross-surface blueprint with shared state**: one logical feature renders on theme.section + customerAccount.blocks + checkout.block + pos.extension simultaneously, all reading one ledger/wishlist with real-time sync. This is a coordinated multi-extension blueprint, not one module.
- **Exceeds via a background-job / trigger engine**: reminder email series (delayed cadence), price-drop and back-in-stock notifications with rate-limiting/threshold logic, and review-request automation are event-triggered background jobs — outside a render-time recipe.
- **Exceeds via a rule engine + external side-effects**: loyalty earning rules, VIP tier thresholds, and redemption emit real Shopify discount codes / store credit / gift cards and generate referral/share tokens — a configurable rule engine driving external mutations, not declarative section settings.
