# Swym Wishlist Plus

> Research record for the RecipeSpec vocabulary study. Facts labeled `confirmed` (from App Store listing, vendor docs, developer docs, or reviews) or `(inferred)`. The app is live and actively maintained — NOT renamed/merged/deprecated. Listing handle is `swym-relay` (legacy slug from the original "Swym Relay" product); the app itself is branded **Swym Wishlist Plus**.

## identity
- **name**: Swym Wishlist Plus — `confirmed`
- **vendor**: Swym Corporation (HQ Seattle, WA; India dev office) — `confirmed`
- **category**: Wishlists (under Marketing and Conversion → Customer loyalty) — `confirmed`
- **App Store URL**: https://apps.shopify.com/swym-relay — `confirmed`
- **rating**: 4.7 / 5 — `confirmed`
- **review count**: 1,428 reviews (dist: ~92% 5★, 4% 4★, 1% 3★, 1% 2★, 3% 1★) — `confirmed`
- **install signal**: "Built for Shopify" certified badge; integrated with Shopify Sidekick; launched Jul 29, 2016; long-established category leader with 1.4k reviews — `confirmed` (exact install count not published by Shopify)
- **pricing model**: 30-day free trial + tiered subscription, metered by monthly "wishlist actions":
  - **Starter** $29.99/mo ($299.99/yr) — 3,000 actions/mo; add & view, Collections, Quick View, social share, email opt-in, automated reminders, price-drop + back-in-stock alerts — `confirmed`
  - **Pro** $59.99/mo ($599.99/yr) — 10,000 actions/mo; + Meta ads retargeting, customer segments, wishlist summary alerts, Klaviyo/Attentive/Tapcart/Omnisend integrations, chat support — `confirmed`
  - **Premium** $99.99/mo ($999.99/yr) — 25,000 actions/mo; + REST APIs, JavaScript SDK, custom data models, advanced config, 24/5 support — `confirmed`
  - Note: legacy free tier existed historically; reviews reference "free plan limits" being consumed by Smart-Save — `(inferred)` current paid-only entry.

## surfaces
Mapped onto internal extension-type allowlist:

- **theme.section** — `confirmed`. Primary surface. Theme App Extension provides App Embeds + blocks: **Wishlist Button** on product pages (5 "Look" variants, icon), **Collections** button embed on collection cards, **Launch Point** (floating button / header heart icon / nav menu item), **Wishlist Page** (separate page OR pop-up), **Wishlist Nudge** popup, **Save for Later** on cart. All render via the storefront theme.
- **proxy.widget** — `(inferred)`. The hosted Wishlist Page pop-up / rendered list and social-count fetches are served through Swym's JS SDK calling Swym's backend (app-proxy-like pattern), not pure Liquid — the list contents are dynamic and shopper-scoped.
- **customerAccount.blocks** — `confirmed`. New Customer Accounts UI extensions: **Wishlisted Products**, **Recently Viewed Products**, **Saved for Later Products** blocks; also a wishlist container on legacy account pages.
- **pos.extension** — `confirmed`. Shopify POS integration; POS staff can access a customer's wishlist in-store (frequently praised in reviews).
- **flow.automation** — `confirmed`. Listed as integrating with Shopify Flow (wishlist events as triggers for merchant automations).
- **admin.block** / **admin.action** — `confirmed` (admin app). Full embedded admin app: Manage Configuration screens, Insights/analytics dashboard, multi-language string editor, Sidekick AI config. (This is the app's own admin, not a fragment block on Shopify's product page, but occupies the admin surface.)
- **analytics.pixel** — `confirmed` (partial). Facebook/Meta Pixel integration for retargeting wishlisted products (Pro); pushes high-intent wishlist events. Not a Shopify Web Pixel extension per se but the pixel-side-effect surface.
- **checkout.upsell / checkout.block / postPurchase.offer / functions.\*** — NOT used. `confirmed` absent — Swym does not run checkout UI extensions or Shopify Functions; "Checkout" tag on the listing refers to add-to-cart handoff, not checkout extensibility.

**Cross-surface coordination**: All surfaces share ONE shopper-scoped wishlist store keyed by Swym `regid` (device/guest session) or `useremail` (authenticated). The storefront button (theme.section), the account blocks (customerAccount.blocks), and POS (pos.extension) all read/write the same list via Swym's backend + JS SDK. Guest lists live on-device by `regid`; on login/email-capture, guest session **merges** into the authenticated account, so a wishlist created anonymously on mobile appears on desktop and in POS — device sync is by email. Wishlist events fan out to Pixel (analytics), ESP/SMS (marketing side-effects), and Flow (automation) from the same event stream.

## functional_model
Core entities (concrete shapes from Swym List API / REST Lists API):

- **List** = `{ lid, lname (name), notes, properties, isPublic/sharing_settings, ownerRegid, itemCount }` — a shopper can own MANY lists (multiple wishlists / collections / gift registry / save-for-later). — `confirmed`
- **ListItem (wishlisted product)** = `{ empi (master product id), epi (variant id), du (product url), qty, note, cprops (custom key/value object for metafield-derived data), bundle? }` — Swym's `empi/epi/du` triad is the canonical product identifier. `cprops` carries arbitrary custom attributes. — `confirmed`
- **Shopper identity** = `{ regid (per-device/guest id from generate-regid), sessionid, useremail }` — regid ↔ useremail merge on auth. — `confirmed`
- **Watchlist / Alert subscription** = `{ product(empi/epi/du), shopper, alertType: back_in_stock | price_drop }` — separate entity powering notifications; price-drop fires at ≥10% drop, back-in-stock on availability. — `confirmed`
- **Recently Viewed / Save-for-Later** = shopper-scoped product lists (distinct API categories: Shopper APIs, Save For Later API). — `confirmed`
- **SocialCount** = per-product aggregate count of how many shoppers wishlisted it (social proof). — `confirmed`
- **Comment** = list-scoped comments (List API has comment-management ops for shared/registry lists). — `confirmed`

Relationships: Shopper 1—* List; List 1—* ListItem; ListItem *—1 Product(empi); Product 1—* Watchlist alert-subscription; Product 1—1 SocialCount aggregate.

## settings_taxonomy
Merchant-facing controls (Admin → Apps → Wishlist Plus → Features → **Manage Configuration**, plus Theme Editor App Embeds). Grouped:

### content
- **Wishlist button text** — text (label before click) — `confirmed`
- **Wishlist button text after-click / "added" state text** — text — `confirmed`
- **Wishlist Page label / heading name** — text — `confirmed`
- **Multi-language string overrides** — per-string text fields for every app string, gated by a **language selector** — select[English, German, French, Italian, Spanish, Japanese, Polish, …] — `confirmed`
- **Email template content** (reminders, price-drop, back-in-stock, wishlist summary) — template editor / text — `confirmed`
- **Add-to-Cart button text** (on Wishlist Page) — text — `confirmed`
- **Nav menu link label** ("Wishlist" text + `#swym-wishlist` anchor) — text/manual menu config — `confirmed`

### style
- **Button "Look"** — select[Solid button with icon | Plain button with icon | Solid button without icon | Plain button without icon | Icon-only plain button] — `confirmed`
- **Icon style** — icon selector (heart / star / bookmark, etc.) — `confirmed`
- **Primary Background Color** (button backgrounds) — color — `confirmed`
- **Primary Text Color** (button text) — color — `confirmed`
- **Secondary Background Color** (list header/footer bg) — color — `confirmed`
- **Secondary Text Color** (list header/footer text) — color — `confirmed`
- **Launch Point color** — color — `confirmed`
- **Button border radius** — number/slider (roundness) — `confirmed`
- **Image border radius** — number/slider — `confirmed`
- **Add-to-Cart button color / corner radius** (Wishlist Page) — color + number — `confirmed`
- **Product card appearance** (Wishlist Page) — dropdown/toggles — `confirmed`

### targeting
- **Launch Point location** — select[Floating button | Navigation menu item | Header menu item] — `confirmed`
- **Floating button position** — select[Bottom right | Bottom left | Left | Right] — `confirmed`
- **Collections button placement** — theme selector / custom CSS selector text (where on the collection card the button injects) — `confirmed`
- **Custom product-container selectors** — text (CSS selectors for non-standard themes, product & collection pages) — `confirmed`
- **Customer Segments targeting** (Pro) — segment selector for who gets summary alerts / campaigns — `confirmed`
- **Meta ads retargeting audience** (Pro) — pixel-driven audience of wishlisters — `confirmed`

### behavior
- **Wishlist Page display mode** — toggle/select[separate page | pop-up window] — `confirmed`
- **Click-again-to-remove** — toggle (re-clicking button removes product; requires Swym support enablement) — `confirmed`
- **Show Social Count** — toggle (display # of shoppers who wishlisted) — `confirmed`
- **Display item counter** on launch point / **Header Counter** — toggle — `confirmed`
- **Enable Multiple Wishlists / Collections** — toggle — `confirmed`
- **Enable Share Wishlist** — toggle (methods: link / email / social) — `confirmed`
- **Wishlist Nudge popup** — toggle (fires after ~15s dwell on a product) — `confirmed`
- **Smart-Save** — toggle (auto-adds product after 3+ views of the same PDP) — `confirmed` (reviews note it can be ON by default → complaints)
- **Guest / anonymous wishlist** — toggle (no login needed; device-scoped by regid) — `confirmed`
- **Email opt-in for guests** — toggle (capture email to convert guest list) — `confirmed`
- **Price-drop alert** — behavior (fires at ≥10% price drop) — `confirmed`; threshold configurable — `(inferred)`
- **Back-in-stock alert** — enable toggle — `confirmed`
- **Automated reminder / abandoned-wishlist emails** — enable + cadence — `confirmed`
- **Wishlist summary alerts** (Pro) — toggle — `confirmed`
- **Add to Cart from wishlist** — toggle — `confirmed`
- **QuickView button injection** — toggle (add wishlist btn to quick-view popups) — `confirmed`

### data
- **ESP / marketing integrations** — connect toggles + API keys: Klaviyo, Yotpo, Mailchimp, Omnisend, Listrak, DotDigital, Sailthru, HubSpot, ReSci, Bloomreach, Ometria, BlueCore — `confirmed`
- **SMS integrations** — Postscript, Attentive, Twilio — `confirmed`
- **Mobile / builder integrations** — Tapcart, PageFly, Stikky — `confirmed`
- **REST API + JavaScript SDK access** (Premium) — enable + credentials/regid generation — `confirmed`
- **Custom data models / cprops** (Premium) — attach custom metafield-derived key/values to wishlist items — `confirmed`
- **Import / export wishlists** — action — `confirmed`
- **Insights / analytics dashboard** — read surface (revenue from wishlisted items, top wishlisted products, activity, conversions) — `confirmed`

## data_model
- **Swym-hosted backend (external DB), NOT Shopify metafields** — wishlists, list items, watchlist alert-subscriptions, recently-viewed, save-for-later, social counts, and shopper regid↔email mappings all persist in Swym's own datastore keyed by shop + regid/useremail. — `confirmed` (Swym runs its own APIs/SDK; Shopify metafields are read as inputs, not the store of record)
- **Product refs** stored as Swym `empi`/`epi`/`du` triad + `cprops` custom object — `confirmed`
- **Media/CDN**: product images referenced by URL from Shopify CDN; Swym serves its JS SDK + button/list widget assets from Swym CDN — `(inferred)`
- **Share links**: server-generated shareable list URLs (public list flag) — `confirmed`
- **No discount codes / no Functions** — does not mint codes or persist discount rules — `confirmed`
- **Events**: high-intent wishlist events streamed out to ESP/SMS/Pixel/Flow (event bus / webhooks) — `confirmed`

## visual_patterns
- **Layout archetypes**: (1) inline **wishlist button** adjacent to Add-to-Cart or overlaid in a product-image corner; (2) **floating action button** pinned to a screen corner with item counter; (3) **header heart icon** with counter badge; (4) **wishlist page** as full page OR modal/pop-up drawer showing product-card grid; (5) **nudge/toast popup** on dwell; (6) **account-page blocks** (wishlisted / recently viewed / saved-for-later product rails). — `confirmed`
- **Component states**: button has **default vs added ("wishlisted")** state with distinct text + filled/outline icon toggle; counter badge updates live; social-count label ("N shoppers saved this"). — `confirmed`
- **Motion/interaction**: click toggles add/remove (optimistic), heart fill animation `(inferred)`; nudge popup enters after ~15s dwell; smart-save silently adds after 3rd PDP visit; quick-view injection. Reviews flag a **perceptible button-render lag** (~couple seconds) on some themes — a known interaction failure mode. — `confirmed`
- **Product card**: image (border-radius configurable), title, price, add-to-cart (color + radius configurable), remove control. — `confirmed`

## reviews_signal
**Praises (top 5)** — `confirmed`:
1. Support team — fast, hands-on, does custom theme integration work (most-cited, named staff).
2. Revenue / behavioral insight — "key revenue driver"; dashboard reveals customer product preferences.
3. Seamless theme integration + multi-wishlist support.
4. Shopify **POS** integration (staff see customer wishlists in-store).
5. Ease of use for shoppers + intuitive merchant dashboard.

**Complaints (top 5)** — `confirmed`:
1. **Smart-Save auto-enabled** silently — auto-adds products, burns metered "wishlist action" quota before launch, forces upgrade.
2. **Cannot delete items** — shoppers report inability to remove products, ending up with duplicate lists.
3. **Button render lag** — 1–3s delay before button appears, "looks terrible."
4. **Limited out-of-box customization** — can't fully match store style without support intervention.
5. **Unclear setup docs** — install instructions confusing; some needed AI/support to get it working.

## mapping_note
Maps to our RecipeSpec as a **wishlist blueprint**, but decisively **EXCEEDS a single-module recipe**:

1. **Requires a persistent, shopper-scoped external data store** — lists + items + alert subscriptions + guest↔email identity merge live in a backend keyed by regid/useremail, synced across devices. A single theme.section recipe has no durable per-shopper state; this needs a data store + identity-merge logic.
2. **Cross-surface coordinated blueprint** — one shared wishlist state must render consistently across theme.section (storefront button/page), customerAccount.blocks (account rails), and pos.extension (in-store), all reading/writing the same store. That is a multi-extension composeBlueprint, not one module.
3. **Background jobs + external side-effects** — price-drop (≥10%) and back-in-stock alerts require watching inventory/price and firing email/SMS via 15+ ESP/SMS integrations; abandoned-wishlist reminders and summary alerts are scheduled campaigns. Needs cron/queue + outbound integrations, not a static widget.
4. **Behavioral rule engine + analytics pipeline** — Smart-Save (3-view trigger), 15s-dwell nudge, social-count aggregation, Meta-Pixel retargeting audiences, and a revenue/insights dashboard require event ingestion, aggregation, and a rule engine beyond declarative module settings.
