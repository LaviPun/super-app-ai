# Brevo PushOwl: Email, Push, SMS

> **Rename/merge note (confirmed):** The app formerly listed as "PushOwl — Web Push Notifications" was acquired by Sendinblue/Brevo and, by 2024, rebranded on the same App Store listing (same URL, `apps.shopify.com/pushowl`) to **"Brevo PushOwl: Email, Push, SMS."** It is NOT deprecated — it is the current, actively-maintained listing from the same vendor. What changed: web push is now one channel inside a multi-channel Brevo suite (adds email, SMS, WhatsApp, popups); installing the Shopify app silently provisions a Brevo account behind the scenes; billing for push/email runs through Shopify, but adding SMS/WhatsApp migrates billing to Stripe. Legacy PushOwl plan names (Basic/Business/Enterprise) were re-cut into "bundles" (Basic/Plus/Power). This record focuses on the **web push** vocabulary (PushOwl's original core, still the most distinctive part), with email/popup surfaces noted where they coordinate. (confirmed)

## identity
- **name:** Brevo PushOwl: Email, Push, SMS (formerly "PushOwl — Web Push Notifications") (confirmed)
- **vendor:** Brevo (app publisher shown as "Brevo PushOwl"; company HQ Bengaluru, India / Paris, France) (confirmed)
- **category:** Email Marketing (Shopify App Store primary category); functionally spans web push + email + SMS + popups (confirmed)
- **App Store URL:** https://apps.shopify.com/pushowl (confirmed)
- **rating:** 4.8 / 5 (confirmed; some aggregators cite 4.9 across a larger historical base)
- **review count:** ~1,900 on the Shopify listing (1,907 observed) (confirmed); higher counts (2,900+) appear on third-party aggregators pooling legacy reviews (inferred)
- **install signal:** Launched 2017-07-31; "trusted by thousands of Shopify stores"; long-tenured top-tier push app — high five-figure install base (inferred from tenure + review volume; exact installs not disclosed)
- **pricing model:** Freemium, metered by **impressions** (successfully delivered push notifications) + email/SMS credits. Basic Bundle free (500 push impressions/mo + 500 emails/mo, unlimited subscribers). Plus Bundle from $19/mo (10k impressions) scaling $38 (20k) / $57 (30k). Power Bundle from $79/mo up to ~$999 (500k) plus custom 1M+. Email priced separately by volume (500 free → 250k @ $300); SMS/WhatsApp as purchased credits. Feature-gating is tied to bundle tier, not just volume. (confirmed)

## surfaces
PushOwl is genuinely **multi-surface**. Mapping to the internal allowlist:

- **`proxy.widget` (primary):** The storefront opt-in prompt + flyout bell + service worker are injected into the live storefront via the app's script/theme-app-embed. This is where subscribers are captured and where the browser permission dialog is triggered. What it shows: custom pre-permission prompt box, two-step overlay, and a persistent bell "flyout" widget. (confirmed)
- **`analytics.pixel` (behavioral, not Shopify Web Pixel API):** Tracks impressions, clicks, revenue attribution, browse-abandonment (product-view) and cart events to fuel automations. Functionally a tracking layer; not necessarily implemented as a Shopify `analytics.pixel` extension, but that is the closest vocabulary slot. (inferred)
- **`flow.automation` (core):** Trigger→action automations run server-side off store events: abandoned cart (3-step), browse abandonment, back-in-stock, price-drop, shipping/fulfillment, welcome. Also lists Shopify Flow as an integration partner. (confirmed)
- **`admin.block` / embedded admin app:** The entire merchant control panel (campaign composer, automation toggles, opt-in designer, analytics dashboards, segments) is an embedded Shopify admin app surface. (confirmed)
- **`theme.section` / `checkout.block` (email/popup side):** Email-capture popups and forms render on the storefront; consent widgets may appear on customer-account/checkout surfaces per the listing's "checkout extensions / customer account pages" claim. Push itself does NOT use a theme section. (inferred; listing-level claim)

**Coordination:** Shared subscriber/contact identity is the handoff spine. A visitor who grants push permission on the storefront (`proxy.widget`) becomes a push-subscriber token stored server-side; store events (viewed product, added to cart, order fulfilled, inventory restocked) flowing through the tracking layer + Shopify webhooks feed the `flow.automation` engine, which dispatches notifications back out through the push channel. The admin app is the config plane that writes settings consumed by all three. Post-Brevo, the same contact record unifies push + email + SMS so one automation can fan out across channels. (confirmed for push; cross-channel unification inferred)

## functional_model
Core entities and relationships (concrete):

- **subscriber** = { push_token, browser, os, device_type, geo_country, subscribed_at, buyer_status(buyer|non-buyer), segment_refs[] } — captured via opt-in on storefront. (confirmed shape; exact stored fields inferred)
- **contact** (Brevo layer) = { email?, phone?, push_subscriber_ref?, attributes{}, list_refs[], consent_state } — unifies push subscriber with email/SMS identity post-merge. (inferred)
- **opt_in_config** = { type(browser|custom_prompt|two_step_overlay|flyout_bell), copy, allow_button_color, position, show_trigger, overlay_enabled } — one active storefront prompt strategy. (confirmed)
- **campaign** = { type(regular|flash_sale), notification_ref, segment_ref?, smart_delivery(bool), send_mode(now|scheduled), scheduled_at? } → one-shot broadcast. (confirmed)
- **notification** (the reusable message payload) = { title, message, primary_link(url), hero_image(desktop/Windows + mobile/Android variants, static or dynamic), icon/badge, buttons[≤2]{ label, url } } — used by both campaigns and automations. (confirmed)
- **automation** = { type(abandoned_cart|browse_abandonment|back_in_stock|price_drop|shipping|welcome), enabled(bool), steps[]{ enabled, delay_interval, notification_ref } } — event-triggered; abandoned cart supports up to **3** sequenced steps each with its own timing + copy. (confirmed)
- **segment** = { name, rules[ device, location, buyer_status, subscription_recency ] } — Power/Enterprise gated. (confirmed)
- **discount_link** = shareable coupon URL attachable to an automation notification (e.g. abandoned-cart nudge). (confirmed)

Relationships: `opt_in_config` produces `subscriber`s → grouped into `segment`s → targeted by `campaign`s; store events trigger `automation`s that reuse the `notification` payload shape; `notification` is the shared value object across campaigns and automations.

## settings_taxonomy
The actual merchant-facing controls, grouped:

### content
- **Notification Title** — text (confirmed)
- **Notification Message / body** — text (confirmed)
- **Primary Link (target URL)** — text/url; where the click lands (confirmed)
- **Hero Image** — image upload; separate desktop(Windows) vs mobile(Android) rendering; can be static or "dynamic" (auto-pulled product image) (confirmed)
- **Notification Icon / badge** — image (inferred; standard web-push icon slot)
- **Buttons** — repeatable list, up to **2**, each { button label: text, button link: url } (confirmed)
- **Opt-in prompt copy** — text for custom prompt / overlay / flyout (pre-subscribe message, post-subscribe message, subscribe button label) (confirmed)
- **Shareable discount link** — text/url attachable to automation copy (e.g. abandoned cart) (confirmed)
- **Campaign type** — select[ regular, flash_sale ] (confirmed)

### style
- **Allow button color** (custom prompt) — color (confirmed)
- **Flyout widget colors** — color picker(s) to match store aesthetic (confirmed; single "Colors" control noted, icon vs background split not confirmed)
- **Flyout widget position** — select (bottom-left default; positional options) (confirmed that position is configurable; exact enum inferred)
- **Branding removal ("Powered by PushOwl")** — toggle, gated to paid bundles (confirmed)
- **Popup/form template + brand styling** (email side) — template select + style controls (confirmed, email popups)

### targeting
- **Segment selector** on campaign — select[ existing segments ] (confirmed; Power/Enterprise gated)
- **Segment rule builder** — rule-builder over { device, location/geo, buyer vs non-buyer, subscription recency } (confirmed dimensions; gated)
- **Smart Delivery** — toggle; sends during each subscriber's active hours (confirmed; gated)
- **Opt-in display trigger / timing** — when the prompt fires (delay / page conditions) (confirmed for popups: "time delay, visibility settings, URL targeting, trigger conditions"; push-prompt timing inferred)
- **Send timing** — select[ send now, schedule ] + datetime picker (confirmed)

### behavior
- **Opt-in prompt type** — select[ browser(native single-step), custom_prompt, two_step_overlay, flyout_bell ] (confirmed)
- **Browser prompt overlay / hint screen** — toggle (shows a custom overlay alongside native prompt) (confirmed)
- **Flyout widget (bell icon)** — enable/disable toggle (confirmed)
- **Automation enable** — per-automation toggle: abandoned_cart, browse_abandonment, back_in_stock, price_drop, shipping, welcome (confirmed)
- **Abandoned-cart step enable** — per-step checkbox (up to 3 steps) (confirmed)
- **Reminder time interval** — select[ dropdown of delays, e.g. minutes→hours→days per step ] (confirmed control exists; exact enum not disclosed → unknown)
- **Multi-step abandoned-cart sequence** — gated to higher bundle (confirmed)

### data
- **Subscriber list / details export & migration** — data action, gated (confirmed)
- **Analytics scope** — impressions, clicks, CTR, conversions, revenue attribution, subscriber growth, demographics/location (confirmed; advanced revenue/conversion tracking gated to paid)
- **UTM tracking** — auto-appends UTM params to push click-throughs (confirmed via UTM-tracking doc)
- **Consent / GDPR collection** — consent capture on opt-in (confirmed at listing level)
- **Free-product guard** — abandoned-cart automation will not fire if all cart items are free (confirmed; a built-in behavior rule, not a knob)

## data_model
What it persists and where:
- **Push subscriber tokens + attributes** — PushOwl/Brevo backend DB (external, not Shopify metafields). Keyed by browser push endpoint. (confirmed external)
- **Contacts (email/phone/push unified)** — Brevo platform DB; a Brevo account is auto-provisioned per store. (confirmed)
- **Campaigns, automations, notification payloads, opt-in configs** — external app DB. (inferred)
- **Hero images / notification assets** — served from PushOwl/Brevo CDN. (inferred)
- **Service worker + opt-in script** — injected into storefront (theme app embed / injected script) to register the push subscription. (confirmed mechanism)
- **Discount codes** — not minted by PushOwl; merchant pastes a Shopify discount as a shareable link. (confirmed)
- **Analytics / event stream** — impressions, clicks, revenue events stored server-side for dashboard aggregation. (inferred)
- Shopify-side: reads store events via webhooks/API (orders, fulfillment, inventory/restock, product views) rather than owning that data. (inferred)

## visual_patterns
- **Storefront opt-in archetypes:** (1) native browser Allow/Block chip; (2) custom white pre-permission box under the address bar; (3) two-step overlay/slide-in banner that gates the native prompt; (4) persistent bell "flyout" pinned bottom-corner that expands on click. (confirmed)
- **Component states:** flyout has pre-subscribe (collapsed bell → expanded message) and post-subscribe (confirmation) states; automation rows are toggled cards; abandoned-cart shows an expandable multi-step list with per-step checkboxes + interval dropdown + edit (pencil) icon. (confirmed)
- **Notification archetype:** OS-native push card — icon + title + message + large hero image + up to 2 action buttons; rendered by the browser/OS, so layout is fixed by platform, only content is authored. (confirmed)
- **Admin composer:** 3-step wizard — Campaign Details → Create Notification → Summary/preview — with multi-device (desktop/mobile) live preview. (confirmed)
- **Motion/interaction:** collapse/expand flyout, slide-in overlays, dashboard toggles; deliberately "non-intrusive" framing. (confirmed)

## reviews_signal
**Top praises (confirmed):**
1. **Customer support** — the single most-cited strength; fast, human, names agents (Yash, Anjali), resolves within the hour.
2. **Ease of use / fast setup** — near-zero-config Shopify install, user-friendly design tools.
3. **Generous free plan** — unlimited subscribers + real automations on the free tier drives ROI for small stores.
4. **Reliable revenue / recovery** — abandoned-cart + back-in-stock push credited with measurable recovered sales; hero images lift CTR.
5. **Professional-looking campaigns** — polished output with minimal effort.

**Top complaints (confirmed):**
1. **Silent breakage / billing mismatch** — cases of paying for 10k impressions while only ~500 delivered for a long period with no alert.
2. **Onboarding gated by tier** — new/free users denied orientation calls, pushed to docs/email-only support.
3. **Aggressive upselling** — reps pushing higher plans over solving the actual problem.
4. **Brevo-migration friction / duplicate-account bug** — different emails spawn duplicate Brevo accounts ("known bug", no self-serve fix); confusion after the rebrand.
5. **Cancellation / billing responsiveness** — cancel requests reportedly ignored across replies; overage penalties bite high-volume stores.

## mapping_note
Maps cleanly to a `proxy.widget` (storefront opt-in) for the capture surface and an `admin.block` config plane — but PushOwl **decisively exceeds a single-module RecipeSpec** in several ways:

1. **Requires a persistent subscriber/contact data store + external side-effect channel.** A push subscriber token lives on the vendor backend and messages are dispatched to browser push services (FCM/APNs/Web Push) long after the shopper leaves the site. A single self-contained storefront module has no home for this durable identity or the outbound side-effect. This is the biggest gap.
2. **It is a genuine multi-surface blueprint with shared state.** The opt-in `proxy.widget`, the event/analytics tracking layer, the automation engine, and the admin config app are four coordinated surfaces sharing one subscriber identity — a coordinated set of modules, not one recipe.
3. **Needs a background job + rule/automation engine.** Abandoned-cart (3-step timed sequences), browse-abandonment, back-in-stock, and price-drop are event-triggered, delayed, stateful workflows (`flow.automation`) with per-step timing and segment rules — a scheduler + rule engine, not a render-time module.
4. **Needs cross-store event ingestion + segmentation.** It consumes Shopify webhooks (orders, fulfillment, inventory restock, product views) and evaluates segment rules (device/geo/buyer-status) — inbound integration + a rule builder beyond any single module's scope.
