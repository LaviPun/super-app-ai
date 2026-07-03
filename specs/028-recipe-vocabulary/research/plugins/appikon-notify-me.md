# Appikon ‑ Back In Stock (Notify Me)

> Research record for the constrained-generation vocabulary study. Target: "Back in Stock: Notify Me (Appikon)", category `back-in-stock`.
> **Rename note:** The App Store listing is titled **"Appikon ‑ Back In Stock"** (subtitle: "Send High-Converting Back In Stock Alert via Email and SMS"). This is the current, live, same-vendor app — not deprecated or merged. The common short name "Notify Me" refers to the storefront **"Notify Me When Available"** button the app injects, not a separate product. No rename/merge/deprecation detected (confirmed). Caveat: a handful of recent reviews report the vendor threatening/executing a shutdown of the app for some merchants; the listing itself remains live and actively sold (confirmed the reviews say this; the shutdown itself is unverified / disputed).

## identity
- **name:** Appikon ‑ Back In Stock (storefront button labeled "Notify Me When Available" / "Email when available") — confirmed
- **vendor:** Appikon Software Pvt Ltd — confirmed
- **category:** back-in-stock / restock alerts — confirmed
- **App Store URL:** https://apps.shopify.com/customer-back-in-stock-alert-user-notification-app — confirmed
- **rating:** 4.7 / 5 — confirmed
- **review count:** ~1,384 reviews — confirmed
- **install signal:** No public install count on listing; a Shopify "Pick" / "Staff Pick"–class app with 1,384 reviews and 4.7★ implies tens of thousands of installs (inferred). Marketed as "set up in less than 2 minutes / 30 seconds, no coding" (confirmed copy).
- **pricing model:** Freemium, tiered by monthly email volume, plus metered SMS. (confirmed)
  - **Free** — $0/mo: 10 emails/month; SMS billed per message ($0.05–$0.40/msg depending on destination) — confirmed
  - **Starter** — $19.99/mo ($192/yr): 300 emails/mo; Mailchimp/Klaviyo integration; custom theme support; multiple languages; email/SMS template customization; data export; 7-day trial — confirmed
  - **Pro** — $29.99/mo ($287.90/yr): 1,000 emails/mo; collection-page integration; 7-day trial — confirmed
  - **Premium** — $49.99/mo ($470/yr): 3,000 emails/mo; countdown timer; notification-quota check; 7-day trial — confirmed

## surfaces
Mapped to internal extension-type vocabulary (allowlist):

- **`theme.section` (primary storefront surface)** — confirmed. The "Notify Me When Available" button + signup form is injected on the **product page at the variant level** via a Shopify **theme app extension / app block** ("change the look and feel… change the placement of your widget"; "works with variants as long as they are selectable"). On **Pro+**, the same widget also renders on **collection pages** (per-product "notify me" on grid tiles). What it shows: an out-of-stock button that opens an inline form / popup capturing the subscriber's contact (email, optionally phone). (confirmed)
- **`admin.block` / embedded admin app (merchant config surface)** — confirmed. The full merchant control panel (button styling, templates, notification rate, channels, analytics, subscriber list) lives in the app's embedded admin UI, not a storefront surface. Mapped here as the settings host.
- **`analytics.pixel` (loose fit)** — (inferred). The app tracks demand/subscription events and reports "insights into customer demand" + revenue recovered. This is app-internal analytics, not a Shopify Web Pixel extension per se, but it is the closest vocabulary slot for its event-capture behavior.
- **`flow.automation` (behavioral core, not Shopify Flow)** — confirmed *behavior*, (inferred) *mechanism*. The heart of the app is an inventory-triggered background automation: on restock, fan out batched notifications by rate/interval/order. This is the app's own job engine, conceptually a `flow.automation` (trigger = inventory crosses 0→positive; action = send batched alerts), not a merchant-authored Shopify Flow.
- **NOT used:** `functions.cartTransform`, `functions.discountRules`, `functions.deliveryCustomization`, `functions.paymentCustomization`, `checkout.upsell`, `checkout.block`, `postPurchase.offer`, `admin.action`, `pos.extension`, `customerAccount.blocks`. (inferred — no evidence of any checkout/cart/POS/customer-account surface)

**How surfaces coordinate (shared state / handoff):** The storefront `theme.section` widget **writes** a subscription record (email/phone + product/variant ref) to the app's backend. The **background automation** watches Shopify inventory webhooks; when a subscribed variant restocks, it **reads** the subscription set and dispatches email/SMS/other-channel messages, throttled by the merchant's rate/interval config set in the `admin.block`. Analytics **reads** both the subscription log and send log to compute demand + recovered revenue. So it's a three-way handoff: **capture (storefront) → persist (backend) → fan-out (automation) → report (admin)** — all keyed by `(product_ref, variant_ref, contact)`.

## functional_model
Core entities and relationships (concrete; field lists partly inferred from behavior):

- **Subscription (a.k.a. "notify request" / waitlist entry)** = `{ id, email, phone?, product_ref, variant_ref, channel[email|sms|webpush|messenger], locale?, created_at, status[pending|notified|cancelled], notified_at? }` — confirmed variant-level; fields inferred.
- **Product / Variant watch target** = `{ product_ref, variant_ref, inventory_qty, in_stock:bool }` — mirrors Shopify inventory via webhooks (confirmed the app reacts to restock; representation inferred).
- **Notification (send record)** = `{ subscription_ref, channel, template_ref, sent_at, delivered?, opened?/clicked? }` — powers analytics + quota counting (inferred from "check notification quota" + analytics).
- **Template** = `{ channel[email|sms], subject?, body_html/body_text, merge_vars(product name, image, price, url), styling }` — per-channel, editable (confirmed customization; field list inferred).
- **NotificationPolicy / rate config** = `{ notification_rate:number, delivery_interval, notification_order }` — governs batching (confirmed the three knobs).
- **Analytics rollup** = `{ product_ref, subscriber_count, alerts_sent, recovered_revenue, top_demand_products }` (confirmed the reported dimensions; schema inferred).

Relationships: one **Product/Variant** ← many **Subscriptions**; a restock event on a Variant selects its pending Subscriptions and, per **NotificationPolicy**, generates batched **Notifications** rendered from **Templates**; **Analytics** aggregates over Subscriptions + Notifications.

## settings_taxonomy
Actual merchant-facing controls, grouped. Names in quotes are confirmed verbatim from listing/docs; unquoted names are (inferred) from described behavior.

### content
- **"Notify Me When Available" button label / text** — text (confirmed: "customize the text… of the 'Email when available'… button")
- **Signup form text / heading / description** — text (confirmed: "text and styling of the… signup form")
- **Signup form fields** — collects email; phone optional when SMS enabled (confirmed email; phone inferred). (inferred whether name field is capturable)
- **Email template: subject** — text (confirmed template customization; field inferred)
- **Email template: body / HTML** — rich text / html editor with product merge vars (product name, image, price, link) (confirmed customizable; merge vars inferred)
- **SMS template: message body** — text (confirmed SMS template customization)
- **Success / confirmation message** — text after a shopper subscribes (inferred)
- **Multiple languages / translations** — text per locale (confirmed "multiple languages," Starter+)

### style
- **Button look & feel** — style controls (confirmed: "change the look and feel of your product page back in stock widget button")
- **Button / widget placement on product page** — position select (confirmed: "change the placement of your widget")
- **Widget colors** (button bg/text, form accent) — color (inferred from "styling… 100% customizable")
- **Popup vs inline form** — the out-of-stock UI is described as a variant-level **pop-up** (confirmed pop-up); display-mode toggle (inferred)
- **Countdown timer** — toggle/enable (confirmed, Premium plan feature; a scarcity countdown component)
- **Email/SMS template styling** — style (confirmed: "styling of the… notifications")

### targeting
- **Variant-level targeting** — the button/subscription is per selectable variant (confirmed: "live on your product pages at the variant level"; "works with variants as long as they are selectable")
- **Collection-page enablement** — toggle/plan-gated (confirmed: "collection page integration," Pro+)
- **Product/variant scope for a restock alert** — "Subscribe to in-stock alerts for a product variant or entire range" (confirmed) → implies variant-or-product-range selector (rule-ish; inferred as a picker)
- **Inventory-quantity threshold for send** — the app ties sends to available inventory qty (confirmed via rate model: at rate 1, notify exactly as many customers as units available) — this is an implicit qty-gated target
- **Channel eligibility per subscriber** — "give customers an option to pick from multiple channels" (confirmed multi-channel choice)

### behavior
- **Channels enabled** — multi-select: Email, SMS, Web Push, Facebook Messenger (confirmed email+SMS core; Web Push via PushOwl integration; Facebook Messenger claimed on listing but flagged as a gap by one aggregator → mark as **partially confirmed / integration-dependent**)
- **"Notification Rate"** — number (confirmed). Governs batch size vs inventory: rate `1` = notify as many customers as units in stock; higher values spread across time. (confirmed docs example: 10 restocked units + 100 subscribers, rate `2` ⇒ 2-hour interval between alerts to batches of ~20)
- **"Delivery Interval"** — duration/number (confirmed: "how long the app should wait before the next set of customers are notified")
- **"Notification Order"** — select (confirmed: "which customers should be notified first" — e.g. first-come vs other ordering)
- **Auto-stop on re-depletion** — behavior rule (confirmed: "If the product goes out of stock again before sending to the 100th subscriber, we stop sending notifications for that product")
- **Notification speed** — "notify customers within 60 seconds when an item is restocked" (confirmed marketing claim; effectively the trigger latency)
- **Back-order / reminder alerts** — "back order reminders" automatic (confirmed on listing; note one aggregator lists preorder/backorder as *absent* → contested)
- **Notification quota check** — view remaining send quota (confirmed, Premium)

### data
- **Subscriber / waitlist list** — view + manage subscribers (confirmed "subscriber management" / waitlist)
- **Data export** — export subscriber/demand data (confirmed, Starter+; also a top complaint that export sometimes fails)
- **Marketing-platform sync** — one-click integrations: Klaviyo, Mailchimp, Omnisend, Postscript, HubSpot, Campaign Monitor, Salesforce, Elastic Email, Zapier, PushOwl, Wiser (confirmed set varies by source; Klaviyo/Mailchimp confirmed everywhere)
- **Analytics dashboard** — demand insights, alerts sent, recovered revenue, top-demand products (confirmed dimensions)

## data_model
What it persists and where:
- **External app-owned database (Appikon backend)** — subscriptions/waitlist entries, send logs, templates, per-shop notification policy, analytics rollups. NOT Shopify metafields/metaobjects (inferred; standard SaaS app pattern — no metaobject usage documented).
- **Shopify data it reads (not owns):** product/variant identifiers, inventory levels/availability via Admin API + inventory webhooks (confirmed it reacts to restock; mechanism inferred as webhooks/polling).
- **Contact PII:** subscriber email and (for SMS) phone number stored app-side (confirmed the app holds these; storage location app-side inferred).
- **Media/CDN:** email templates reference product images from Shopify CDN; no evidence the app hosts its own media beyond template assets (inferred).
- **Codes:** none (no discount codes, gift cards, or unlock codes — not a coupon app) (inferred).
- **Third-party mirrors:** subscriber data can be synced/exported to Klaviyo/Mailchimp/etc. (confirmed integrations) — so PII may also live in connected ESPs.

## visual_patterns
- **Layout archetypes:** (1) storefront **out-of-stock button** that replaces/augments the disabled "Add to cart" on a sold-out variant; (2) **inline expand or modal popup** signup form (email field + submit); (3) optional **countdown timer** scarcity element; (4) email/SMS **notification templates** (product card: image, title, price, CTA button to PDP). Admin side: dashboard with metrics cards + subscriber table + template editors.
- **Component states:** button — `in-stock (hidden)` / `out-of-stock (visible)` / `subscribed (confirmation)`; form — `default` / `submitting` / `success` / `error/duplicate`; per-variant re-render when the shopper switches variant selector.
- **Motion/interaction:** popup open/close; inline form reveal on button click; variant-change reactivity (button appears only for out-of-stock selectable variants); "within 60s" restock → async email/SMS dispatch (server-side, not a storefront animation). Countdown timer = live-ticking element.

## reviews_signal
**Top praises (confirmed from reviews):**
1. **Fast, responsive customer support** — repeatedly called out ("amazing… fast and responsive," resolves theme integration "within minutes").
2. **Seamless theme integration / easy setup** — works across themes, "super easy to customize," survives theme changes without reinstall.
3. **Real revenue lift** — "game changer," recovers sales on restocks "without having to keep track."
4. **Multi-channel notifications** — email + SMS (+ Facebook restock notifications) appreciated.
5. **Effective, low-effort automation** — set-and-forget waitlist capture.

**Top complaints (confirmed from reviews):**
1. **Catastrophic notification failures** — "system completely failed to send the mass emails" during launches, "tens of thousands in sales" lost. The single most damaging failure mode.
2. **Support goes silent during outages** — praised in calm times, but "ignored for days" when it broke, "left us hanging."
3. **Silent breakage / stopped sending** — "customers stopped receiving notifications," "randomly stopped working for one month" with no alert to the merchant.
4. **Data export failures** — "not been able to export our data after 4 months," forcing platform migration.
5. **Shutdown / abandonment fears** — reports the vendor "decided to close down this app… no support for exporting data," without preemptive notice.

Net: the *up-to-the-mark* bar is invisible capture + reliable, timely fan-out + honest analytics; the *failure modes* are all about the **background delivery engine** silently failing at scale and lock-in of subscriber data.

## mapping_note
How this maps onto our constrained RecipeSpec vocabulary — and where it **exceeds a single-module recipe**:

- **Fits a recipe (storefront layer):** the visible piece — a variant-aware "Notify Me When Available" button + signup form on the PDP — maps cleanly to a single **`theme.section`** module with content/style/targeting knobs (label, colors, placement, variant-level display). That much *is* a one-module recipe.

- **Exceeds a single-module recipe (the load-bearing 80%):**
  1. **Requires a persistent data store, not stateless config.** Subscriptions (email/phone × product/variant, with status lifecycle) must be persisted, queried, and mutated over time. A RecipeSpec that only emits UI + static settings cannot hold this; it needs a backing table/collection with reads and writes across two surfaces.
  2. **Requires background jobs driven by external events.** The core value is an **inventory-webhook-triggered fan-out engine** with **rate limiting, batching, delivery intervals, ordering, and an auto-stop-on-re-depletion rule**. That is a durable, retryable job/queue system (a `flow.automation` with a real scheduler), not a synchronous request handler.
  3. **Cross-surface blueprint with shared state.** Storefront capture, an embedded **admin.block** config/analytics panel, and the async sender must coordinate over the same `(product_ref, variant_ref, contact)` keyspace — a coordinated multi-surface set, not one module.
  4. **External side-effects + PII egress.** It sends email/SMS/web-push/Messenger and syncs subscribers to Klaviyo/Mailchimp/Omnisend/etc. — outbound integrations, credential handling, per-message metering/quota, and PII storage/export — all outside a self-contained module's remit.

  The reviews confirm the *whole product is the reliability of items 1–2*: merchants don't churn over the button; they churn when the **store + background engine** silently fails to deliver. Any faithful generation of this vocabulary must model a data-store + job-engine + cross-surface blueprint, not just a themed button.
