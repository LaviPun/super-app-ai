# ProveSource: Sales Pop Ups (Social Proof)

> Vocabulary-study research record. Facts labeled **confirmed** (from App Store listing, ProveSource help center, or review aggregators) or **(inferred)** where derived. The app is live and current — NOT renamed/deprecated. The Shopify listing title is "ProveSource: Sales Pop Ups"; the underlying product/brand is "ProveSource Social Proof" (same vendor, provesrc.com), which is a cross-platform social-proof pixel that also serves WordPress/WooCommerce/Wix/etc. No merge or deprecation to note.

## identity
- **name**: ProveSource: Sales Pop Ups — confirmed (Shopify listing title; brand "ProveSource Social Proof")
- **vendor**: ProveSource — confirmed (Be'er Sheva, IL; provesrc.com)
- **category**: social-proof (Marketing & conversion → Social proof) — confirmed
- **App Store URL**: https://apps.shopify.com/provesource — confirmed
- **rating**: 5.0 / 5 — confirmed
- **review count**: 83 reviews (78 five-star / 5 four-star, 0 lower) — confirmed
- **install signal**: Long-lived (launched 2018-11-26); "Built for Shopify"/high-standards badge; cross-platform product with large non-Shopify footprint — confirmed. Exact active install count: unknown
- **pricing model**: Freemium, **metered by monthly unique visitors** (not by orders/impressions). Free Forever ($0, 1k visitors, ProveSource logo shown, unlimited sites & impressions), Starter ($29/mo, 20k visitors, branding removal), Growth ($54/mo, 50k), Monster ($109/mo, 200k) — confirmed. Price scales with traffic, a recurring complaint

## surfaces
ProveSource is fundamentally a **storefront pixel/overlay** injected site-wide, plus a **merchant admin console** (hosted at app.provesrc.com, embedded in Shopify admin). It does not touch checkout, cart logic, discounts, or POS. Mapped to internal extension-type vocabulary:

- **theme.section** — confirmed for the *inline / embedded* variant. ProveSource supports "Display inline / embedded social proof" placed directly on the product page (PDP) as an inline trust widget, injected via a theme block/embed. The primary popup overlay is script-injected (theme app embed / `<head>` snippet) rather than a section, but the inline widget is the closest allowlist match.
- **proxy.widget** — best match for the **primary popup/toast overlay** (Stream, Combo, Live-visitor counter, Reviews, Informational notifications). It is a floating widget rendered by an injected JS pixel that fetches events from ProveSource's backend, not from Shopify page data. (inferred mapping — the runtime is an external pixel, functionally a proxy-served widget.)
- **analytics.pixel** — confirmed. The core install IS a tracking pixel: it records impressions, clicks, hovers, CTR and (via goals) conversions, and it auto-captures on-page form submissions (email field) as social-proof events.
- **flow.automation** — (inferred, partial). Not Shopify Flow, but ProveSource ingests events via **Zapier / Make.com / webhooks**, which is an automation/event-ingestion surface. Maps conceptually to the "external event pipeline" idea behind flow.automation.
- NOT used: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, checkout.upsell, checkout.block, postPurchase.offer, admin.block, admin.action, pos.extension, customerAccount.blocks — confirmed absent (no checkout/cart/discount/POS involvement).

**How surfaces coordinate**: A single injected **pixel** (one snippet / theme app embed) is the shared runtime. The merchant admin console defines "notifications" (templates + tracking sources + rules); the pixel pulls the active notification set for the site, evaluates URL/geo/timing rules client-side, and renders either the corner popup (proxy.widget) or the inline PDP widget (theme.section) from the **same event store**. State handoff = server-side event stream keyed by site ID; the storefront pixel is read-mostly (also writes impression/click analytics and captures form events back to the backend). No Shopify-native data passes between surfaces — coordination is entirely through ProveSource's own backend.

## functional_model
Core entities (concrete):

- **site / project** = { site_id, domain, pixel_installed:bool, visitor_quota, branding_removed:bool } — one account can hold multiple sites (all plans "unlimited sites"). — confirmed
- **notification** = a template: { id, type: enum(Stream | Combo | Live-visitors | Reviews | Informational | Social-counter), tracking_sources[], display_rules{}, message_template, style{}, goal? } — "a template that defines what events to show, under what conditions, how it looks." — confirmed
- **event** (Stream data unit) = { email?, firstName?, lastName?, name, product.name?, product.link?, location.country, location.countryCode, location.city, location.state, location.stateCode, timestamp, custom{…webhook fields} } — location derived from IP geolocation; product/name from integration or captured form. — confirmed
- **tracking_source** = enum(native integration [Shopify orders/signups], on-page form capture [any form with an email field], webhook, Zapier, Make.com, manual). Each notification owns its own set of sources. — confirmed
- **counter / combo aggregate** = { metric, window: enum(24h | 7d | 30d | all-time), count } — big-number aggregates over a time frame. — confirmed
- **review** (Reviews notification) = pulled from external sources: Google, Facebook, Trustpilot, Reviews.io, Judge.me, Loox, Fera — { rating, text, author, source }. — confirmed
- **goal** (optional) = { name, url/condition } used for ROI/conversion attribution. — confirmed
- **analytics record** = per-notification { impressions, clicks, hovers, CTR (~4% avg cited), goal-conversions }. — confirmed

Relationships: site 1—* notification; notification *—* tracking_source; tracking_source 1—* event; notification 1—* analytics_record; notification 0—1 goal. Stream renders individual events; Combo/Live render aggregates over events; Reviews render imported review objects; Informational renders a static authored message (no events).

## settings_taxonomy
Merchant-facing controls, grouped. Editor flow is a wizard: **Type → Track → Display → Message → Customize → Goals → Launch** (confirmed). Knob names/types below; concrete where the docs name them, else (inferred) from the editor sections.

### content
- **Notification type** — select[ Stream | Combo | Live visitors | Reviews | Informational | Social counter ] — confirmed
- **Message text** — text (rich) with live preview; **Markdown + HTML** supported for Stream/Informational/Counter (NOT Combo/Reviews) — confirmed
- **Text variables/tokens** — token-insert: `{{name}}`, `{{product.name}}`, `{{product.link}}`, `{{location.country}}`, `{{location.countryCode}}`, `{{location.city}}`, `{{location.state}}`, `{{location.stateCode}}`, plus custom webhook fields — confirmed
- **Notification title / heading** — text — confirmed
- **Icon / avatar image** — image (via external URL; no direct file upload — docs point to Imgur/Icons8 hosting) — confirmed
- **Map icon** — toggle (adds a geo map marker to Stream notifications) — confirmed
- **Language** — select (multilingual; per-notification language) — confirmed
- **Combo/Counter time window** — select[ 24h | 7d | 30d | all-time ] — confirmed
- **Call-to-action button** — text + link (in Customize step) — confirmed
- **Click-through link (whole-notification)** — text(url) — confirmed
- **Reviews source** — select/connect[ Google | Facebook | Trustpilot | Reviews.io | Judge.me | Loox | Fera ] — confirmed

### style
- **Notification theme/skin** — select (preset templates) — (inferred, Customize step "visual properties")
- **Position** (desktop) — select[ bottom-left | bottom-right | top-left | top-right ] — confirmed (position is configurable)
- **Mobile position** — select (separate mobile placement control) — confirmed
- **Hide on mobile / mobile size** — toggle + size control — confirmed
- **Title color** — color — confirmed
- **Colors (background/text/accent)** — color — confirmed ("colors" in Customize)
- **Border radius / shape** — number/select — (inferred)
- **Animation / entrance style** — select — confirmed ("speed"/animation referenced)
- **Close (X) button** — toggle — (inferred)
- **Z-index** — number (dedicated help article to prevent overlap) — confirmed
- **Branding ("Powered by ProveSource")** — toggle, but **locked on free plan** (removal is a paid feature) — confirmed

### targeting
- **Display on pages / URLs** — rule-builder using **URL match types**: All Pages | Contains | Regex | (exact) — confirmed
- **Exclude pages / URLs** — rule-builder (URL patterns) — confirmed
- **Include / exclude specific products** — product-level rule (product-picker/pattern) — confirmed
- **Geo include/exclude** — rule-builder[ country list ] "Include or Exclude Events from Specific Countries" — confirmed
- **Tracking sources selection (Track step)** — multi-select of event sources per notification; for Counter, select the URLs/pages where events occurred — confirmed
- **Device targeting (mobile on/off)** — toggle — confirmed

### behavior
- **Delay before first notification** — number(seconds), recommended 0 — confirmed
- **Delay between notifications** — number(seconds), recommended ≥4 — confirmed
- **Display each notification for** — number(seconds), recommended ≥6 — confirmed
- **Loop notifications** — toggle — confirmed
- **Random order** — toggle ("Display Notifications in a Random Order") — confirmed
- **Show only once per session** — toggle — confirmed
- **Time frame** — setting (only show events within a recent window) — confirmed ("Setting a Time Frame and Minimum Limit")
- **Minimum limit** — number (min events/count before showing) — confirmed
- **"Recently/ago" time text** — behavior on how the relative timestamp renders — (inferred)
- **Show notification on mobile** — toggle — confirmed

### data
- **Tracking source config (Track step)**: native Shopify integration (orders/signups), on-page form auto-capture (any form with an email field), webhook endpoint, Zapier, Make.com, manual events — confirmed
- **Webhook / custom fields** — text (map extra JSON fields into custom `{{…}}` tokens) — confirmed
- **Goal (ROI tracking)** — text/rule (optional conversion goal per notification) — confirmed
- **Pixel install method** — select[ `<head>` snippet | Google Tag Manager | Shopify app embed ] — confirmed
- **Analytics dashboard (read-only)** — impressions / clicks / hovers / CTR / goal conversions — confirmed

## data_model
- **Persisted OFF the Shopify store, in ProveSource's own backend** (external DB) keyed by site_id — confirmed. Shopify does not store the events; the app is a hosted SaaS with a storefront pixel.
- **Events store**: captured social-proof events (form submissions, integration webhooks, manual) with the field set above; IP→geo enrichment done server-side. Retention window: unknown (a configurable display "time frame" exists, but raw retention is unstated). — confirmed store exists; retention unknown
- **Notifications config**: templates, rules, styles stored per site in the ProveSource console. — confirmed
- **Analytics store**: per-notification impression/click/hover/conversion counters. — confirmed
- **Media/images**: NOT hosted by ProveSource — icons/avatars referenced by external URL (docs recommend Imgur/Icons8). No CDN of its own for user images. — confirmed
- **Reviews**: pulled/synced from external review providers, not authored in-app. — confirmed
- **Shopify-side footprint**: only the injected pixel/app-embed (script tag / theme app embed) + the inline PDP embed block. No metaobjects, no metafields, no discount codes. — (inferred, consistent with docs)

## visual_patterns
- **Primary archetype**: small floating **toast/popup** pinned to a screen corner — avatar/icon on the left, 1–2 lines of text (≤12–15 words recommended), optional map marker, optional "Powered by" footer. Auto-dismiss after N seconds, queued/looped stream. — confirmed
- **Live-visitor counter**: compact badge/pill showing a live number ("X people viewing"). — confirmed
- **Combo/Counter**: single "big number" badge over a time window (e.g. "1,204 bought this in the last 7 days"). — confirmed
- **Reviews popup**: star rating + quote + author + source logo. — confirmed
- **Informational**: static message toast (announcement / coupon / policy), no event data. — confirmed
- **Inline / embedded**: same content rendered *in-flow* on the PDP rather than as an overlay (a trust-signal block). — confirmed
- **Component states**: enter animation → visible (hover pauses/registers hover analytics) → optional click (CTA / link-through) → timed exit; queue advances to next event; loop/random ordering. Session-frequency cap ("once per session"). — confirmed
- **Motion**: slide/fade entrance with configurable speed/delay; sequential queue with inter-notification delay. — confirmed
- **Responsive**: separate mobile position, mobile size, and hide-on-mobile controls; z-index knob to sit above theme UI. — confirmed

## reviews_signal
**Praises (App Store, 5.0/83):**
1. Extremely easy, fast install and clear interface — confirmed
2. Real, measurable sales/conversion lift via FOMO/social proof — confirmed
3. Reliable and low-maintenance ("doesn't drop off the site," runs untouched) — confirmed
4. Fast, responsive support (minutes-to-hours resolution) — confirmed
5. Good breadth of customization options for look/behavior — confirmed

**Complaints (thin on Shopify listing — sourced from aggregators: Capterra/GetApp/WiserNotify/SMBGuide):**
1. **Pricing scales with traffic** — visitor-metered plans get expensive fast for higher-traffic stores; stores "outgrow it within months" — confirmed
2. **Limited design/template customization** vs competitors (fewer skins/templates) — confirmed
3. **Targeting/display rules not precise enough** for advanced segmentation ("not as precise as some competing products") — confirmed
4. **Email-notification / unsubscribe gaps** and limited connector marketplace — confirmed
5. **Low visitor quotas at low tiers** (1k free / 20k starter) feel small; images require external hosting (no in-app upload) — confirmed
6. On Shopify itself: essentially the only negative was a theme/z-index conflict, resolved by support (not a defect) — confirmed

## mapping_note
Onto our constrained RecipeSpec vocabulary, a single generated module could reproduce the **surface veneer** — a corner popup / inline PDP trust widget driven by a client script — but ProveSource **materially exceeds a single-module recipe** in several structural ways:

1. **Requires a persistent external event store + ingestion pipeline.** The whole product is a stateful stream: it captures events (form submits, order webhooks, Zapier/Make, manual) into an off-store DB, enriches them (IP→geo), aggregates them (Combo/Counter windows), and replays them. A single RecipeSpec module has no backing data store, no ingestion webhook endpoints, and no server that outlives a page render. This is the core gap.

2. **Cross-surface blueprint over one shared runtime.** One pixel simultaneously powers a proxy.widget overlay, a theme.section inline embed, and an analytics.pixel — all reading/writing the same backend, evaluating URL/geo/timing rules client-side. That's a coordinated multi-surface blueprint with shared state, not one isolated module.

3. **A real rule engine + scheduling/aggregation layer.** URL match (Contains/Regex/All), country include/exclude, product include/exclude, time-frame + minimum-limit gating, session frequency caps, loop/random ordering, and 24h/7d/30d/all-time aggregation windows constitute a runtime rule/aggregation engine and background rollups — beyond static module config.

4. **External side-effects & analytics feedback loop.** It writes impression/click/hover/CTR/goal-conversion analytics back to its backend and pulls reviews from 7+ third-party providers (Google, Judge.me, Loox, Trustpilot, etc.). A recipe module can't own third-party integrations, metered billing by visitor count, or a two-way analytics loop.

Net: reproducible as a *look-alike* single module (static/faked social-proof toast), but the real vocabulary needs a data store + webhook ingestion, a cross-surface blueprint, a rule/aggregation engine with background jobs, and external integrations — none expressible in one RecipeSpec.
