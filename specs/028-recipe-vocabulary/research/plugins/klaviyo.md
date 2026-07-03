# Klaviyo: Email Marketing & SMS

> Vocabulary research record for constrained module-spec generation. Facts labeled **confirmed** (from App Store listing, Klaviyo Help Center, reviews) or **(inferred)**. The listing is current and active — the app has NOT been renamed or deprecated (it is a first-party Klaviyo app, not a Bold app). No vendor migration applies.

## identity
- **name:** Klaviyo: Email Marketing & SMS — confirmed
- **vendor:** Klaviyo (Boston, MA; 125 Summer St, Floor 7) — confirmed
- **category:** Email marketing & SMS marketing (email) — confirmed
- **App Store URL:** https://apps.shopify.com/klaviyo-email-marketing — confirmed
- **rating:** 4.7 / 5 — confirmed
- **review count:** ~2,948 reviews — confirmed (moves over time)
- **rating distribution:** 5★ 87% (~2,558), 4★ 3% (~82), 3★ 1% (~29), 2★ 1% (~35), 1★ 8% (~244) — confirmed
- **install signal:** ~400,000+ Shopify stores (storeleads/aggregators report ~407k installs); listed live since Sept 20, 2012 — confirmed (aggregator figure)
- **pricing model:** Free to install; usage-based tiers scaling on contact count (email) and SMS/MMS credits. Free forever ≤250 email contacts / ≤150 SMS credits; Email tier from $20/mo (251–500 contacts); SMS tier from $15/mo (≤1,250 SMS/MMS credits, carrier fees included). Recurring + usage charges billed every 30 days in USD. Price escalates steeply with list growth (a recurring complaint) — confirmed

## surfaces
Klaviyo is a **multi-surface, externally-hosted platform** whose Shopify footprint is a thin embed layer over its own cloud. Mapped to our internal extension-type vocabulary:

- **theme.section** — confirmed. "Klaviyo Embedded Form" is a theme app-embed **section** merchants add via Shopify theme editor (Add section → Apps → Klaviyo Embedded Form); commonly placed in the Footer to persist site-wide. Renders an inline email/SMS capture form.
- **proxy.widget** — confirmed (functional equivalent). Popup / flyout / full-page sign-up forms are injected by the `klaviyo.js` **app embed** (theme App embeds tab, "Klaviyo app embed" toggle). These float over the storefront independent of theme sections — no code paste required, published directly from Klaviyo's cloud form builder.
- **analytics.pixel** — confirmed. `klaviyo.js` onsite tracking + a **Shopify Web Pixel** capture behavioral events: Active on Site, Viewed Product (client-side), and Added to Cart / Viewed Collection / Submitted Search (via Shopify pixel). Checkout Started fires from Shopify's checkout when "Track behavioral events" is on. Identity is resolved client-side then persisted in a Klaviyo cookie ("known/cookied browser").
- **flow.automation** — confirmed. Deep two-way integration with **Shopify Flow** (listed) AND Klaviyo's own far-richer internal Flows engine (triggers, splits, delays, multi-channel messages) that lives entirely in Klaviyo's cloud, driven by the events above.
- **checkout.block / checkout.upsell** — (inferred, partial). Listing names "Checkout" and "Customer accounts" as integration points; consent collection surfaces at checkout. Not a merchandising upsell — used for marketing-consent capture and order/event data. Map loosely to **checkout.block** for consent, not **checkout.upsell**.
- **customerAccount.blocks** — (inferred). "Customer accounts" integration listed; likely a preferences/subscription surface. Not deeply documented in sources reviewed.
- NOT used: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, postPurchase.offer, admin.action, pos.extension (no evidence). Discount **codes** are generated/inserted into messages, but via Klaviyo's engine, not a Shopify Function.

**Surface coordination:** The pixel/tracking layer (analytics.pixel) is the shared-state spine. It writes events onto a unified **Profile** in Klaviyo's cloud. Sign-up forms (theme.section + proxy.widget) write consent + custom properties onto that same Profile. Flows (flow.automation) read Profile state + event stream to trigger and branch messages. So: **form capture → profile/event store → segmentation → flow triggers → email/SMS/push send** is one continuous cross-surface pipeline, all stitched by profile identity (cookie + email/phone), none of it living in Shopify's own data plane.

## functional_model
Core entities (all persisted in Klaviyo's cloud, keyed to a Shopify store integration):

- **Profile** = { email, phone_number, first/last_name, location, consent{email: subscribed|unsubscribed, sms: subscribed|never}, custom_properties{…}, UTM_attribution, predictive_analytics{CLV, churn_risk, expected_next_order} } — the customer record; deduplicated by email/phone.
- **List** = { name, static membership } — explicit opt-in group; sign-up forms subscribe to a List.
- **Segment** = { name, definition = dynamic rule-set over profile properties + event history } — recomputed live; drives targeting.
- **Metric / Event** = { name (Active on Site, Viewed Product, Added to Cart, Checkout Started, Placed Order, custom), profile_ref, timestamp, properties{value, items[], …} } — behavioral stream.
- **Sign-up Form** = { display_type (popup|flyout|full_page|embedded), steps[], teaser, success_message, style, targeting_rules, behavior_rules, list_ref } — a multi-step capture unit.
- **Flow** = { trigger (list|segment|metric|date_property|price_drop), trigger_filters[], nodes[] } where node ∈ { email_message, sms_message, push_message, time_delay, conditional_split, trigger_split, update_profile, webhook }.
- **Campaign** = { channel (email|sms|push), template_ref, audience (list/segment include/exclude), schedule, A/B_variants[] } — one-off blast.
- **Template** = { blocks[], style } — reusable message design.

Relationships: Profile ∈ many Lists/Segments; Events belong to Profile; Form subscribes Profile → List and sets consent/properties; Segment definition references Metrics + properties; Flow trigger references List/Segment/Metric; Campaign audience references List/Segment.

## settings_taxonomy
The richest merchant-facing control surface is the **sign-up form builder** (the piece closest to our module vocabulary). Grouped:

### content
- **Display type** — select[ popup | flyout | full-page | embedded ] — confirmed
- **Form steps** — repeatable multi-step container (step 1 email, step 2 phone, etc.) — confirmed
- **Email input field** — block; max 1 per form; subscribes to connected List — confirmed
- **Phone number field** — block; validates format; collects SMS promo consent by default — confirmed
- **Text block / heading / body copy** — rich-text — confirmed
- **Image block** — image (side image or background image) — confirmed
- **Button block** — submit / "next step" / URL button; label text — confirmed
- **Consent checkbox** — toggle-field (dedicated SMS consent recommended; generic marketing checkbox insufficient for SMS) — confirmed
- **Dropdown field** — select; requires profile_property + label set + value set — confirmed
- **Radio buttons** — single-choice; profile_property + labels + values — confirmed
- **Multi-checkbox field** — multi-choice; profile_property + labels + values — confirmed
- **Custom profile property** — text/select mapping arbitrary field → profile — confirmed
- **Teaser** — collapsed tab/pill that re-opens form; own copy — confirmed
- **Success message** — separate step shown post-submit; can inject discount code — confirmed

### style
- **Form Styles** — background color, border color, padding, margin (applies across all steps) — confirmed
- **Input Field Styles** — colors, border, padding, margin for fields — confirmed
- **Input Field Text Styles** — font, size, color per field — confirmed
- **Fonts** — select[ web-safe native | Klaviyo-hosted custom | your own custom font ] — confirmed
- **Button styles** — background color, text color, font size, radius — confirmed (color + typography controls)
- **Side image / background image** — image placement (left/right vs behind fields) — confirmed
- **Per-block style override** — block-level color/text settings override form-level — confirmed
- **Mobile-specific design** — separate mobile layout tuning — confirmed

### targeting
- **Visitors** — select[ show to all | any existing profile | email subscribers only | SMS subscribers only | don't show to existing Klaviyo profiles | specific list/segment ] with include-lists/segments + exclude-lists/segments — confirmed
- **URLs — only show on** — checkbox + match-type select[ Containing | Exactly Matching ] + URL text — confirmed
- **URLs — don't show on** — checkbox + match-type + URL text — confirmed
- **UTM parameters** — select[ Source | Medium | Campaign | Term | ID ] + value text; "Store UTM parameters in shopper's profile upon consent" (toggle) — confirmed
- **Location — show to** — location selector (countries/regions) — confirmed
- **Location — don't show to** — location selector — confirmed
- **Cart contents** (Shopify only) — rule over cart total value + item count (number inputs) — confirmed
- **Devices** — radio[ both desktop & mobile | desktop only | mobile only ] — confirmed

### behavior
- **Timing** — select[ Immediately | Based on rules | Only on a custom trigger ]; "Based on rules" sub-triggers: on exit intent, after time delay (seconds, number), after scroll % (number), after N pages viewed (number) — confirmed
- **Frequency** — "show again after ___ day(s)" (number; 0 = every visit) — confirmed
- **Suppress-on-success** — "Don't show again if a form was submitted or a URL button was clicked" (checkbox) — confirmed
- **Click-outside-to-close** — checkboxes: on desktop / on mobile — confirmed
- **Custom trigger** — fire form only on a JS/custom event — confirmed

### data (message + automation controls, beyond the form)
- **Flow trigger** — select[ List | Segment | Metric/event | Date property | Price drop ] — confirmed
- **Trigger filters** — rule-builder over event/property (e.g. limit to certain product types) — confirmed
- **Profile filters** — rule-builder (e.g. "has placed order 0 times since starting this flow") — confirmed
- **Conditional split** — rule-builder → true/false branches on profile properties + activity — confirmed
- **Trigger split** — branch on trigger-event properties (event-triggered flows only) — confirmed
- **Time delay** — number + unit between flow steps — confirmed
- **Message channel per node** — email | SMS | push — confirmed
- **Segment definition** — rule-builder over properties + metric history (recomputed live) — confirmed
- **Campaign audience** — include list/segment + exclude list/segment; smart send-time; A/B variants — confirmed
- **Consent collection** — email vs SMS collected separately per channel/step — confirmed
- **Discount code injection** — insert generated/static codes into message + success message — confirmed

## data_model
- **All primary state lives in Klaviyo's external cloud DB**, not in Shopify — confirmed. Profiles, Lists, Segments, Metrics/Events, Forms, Flows, Campaigns, Templates are Klaviyo-hosted records keyed to the store's integration.
- **Shopify side** contributes: a **theme app-embed** (`klaviyo.js` block) + **Web Pixel** extension writing events; the "Klaviyo Embedded Form" theme section; consent/checkout hooks. No merchant business data is persisted in Shopify metafields/metaobjects by the core flow (inferred — sources show data flowing OUT to Klaviyo, not stored in Shopify).
- **Identity/cookie:** a first-party Klaviyo cookie tracks the "known browser"; identity resolved client-side then persisted — confirmed.
- **Ingestion:** hybrid client-side JS (`klaviyo.js`) + server-side Shopify **webhooks** for order/checkout events; Added-to-Cart/Collection/Search via Shopify pixel — confirmed.
- **Media/CDN:** form images and email template assets hosted on Klaviyo's CDN; custom fonts either Klaviyo-hosted or merchant-supplied — confirmed.
- **Codes:** discount codes generated by Klaviyo or synced from Shopify, embedded in messages — confirmed.

## visual_patterns
- **Layout archetypes:** centered modal **popup**; corner **flyout/slide-in**; **full-page** takeover; inline **embedded** section (footer/landing); collapsed **teaser** tab that expands. Message side: single-column email templates + short-form SMS.
- **Component states:** form pre-submit (fields) → validation error (bad phone/email format highlighted) → success step (thank-you + optional discount code) → teaser/minimized. Suppressed state after submit or per frequency cap.
- **Multi-step pattern:** step-by-step progressive disclosure (email → phone → custom props) with "next" buttons and optional skip-to-success — reduces field overwhelm and separates email vs SMS consent.
- **Motion/interaction:** entrance triggered by exit-intent, scroll %, time delay, or page-count; click-outside-to-close (per-device); teaser expand/collapse; mobile-specific layout. Timing/animation feel is configured, not free-form.
- **Style discipline:** form-level styles cascade to all steps + success message; block-level overrides win — a token/cascade model, not per-element chaos.

## reviews_signal
**Praises (up-to-the-mark bar):**
1. Abandoned-cart & automation flows that "set and forget" and recover revenue with no ongoing effort.
2. Powerful segmentation + reporting/analytics that make customer behavior legible.
3. Deep, reliable Shopify integration ("integration has been fantastic… good growth").
4. Responsive, knowledgeable customer support.
5. Ongoing training / product improvement.

**Complaints (failure modes):**
1. **Aggressive, escalating pricing** — jumps like $80→$150/mo; costs balloon as the list grows (the dominant 1-star theme, ~8% of reviews).
2. **Feels exploitative / lock-in** — "the more dependent you get, the more they take advantage"; can't throttle cost in slow periods.
3. **Pricing punishes pausing** — resubscribing quoted at a premium (~$200) vs prior rate.
4. **Not fully user-friendly / smooth** — steep learning curve on the builder and platform.
5. **Cost tied to contacts you already own** — merchants resent paying per-contact for their own audience.

## mapping_note
A single **sign-up form** maps cleanly onto our RecipeSpec vocabulary: it is essentially a `theme.section` (embedded) or `proxy.widget` (popup/flyout/full-page) with a content/style/targeting/behavior settings tree that our five-heading taxonomy already covers (display-type select, style tokens, rule-based targeting, timing/frequency behavior). That slice is recipe-shaped.

**Where Klaviyo EXCEEDS a single-module recipe:**
1. **Requires an external profile/event data store + identity graph** — nothing works without a persisted, deduplicated Profile keyed by cookie/email/phone accumulating a behavioral event stream. That's a stateful backing DB, not a stateless module render.
2. **Is a cross-surface blueprint, not one surface** — theme.section + proxy.widget (forms) + analytics.pixel (tracking) + flow.automation must be provisioned together and share state; capture on one surface changes send behavior on another. Needs a coordinated multi-extension blueprint with shared handoff, not a lone recipe.
3. **Carries a rule engine + background job pipeline** — Segments (live-recomputed rule-builder), Flows (trigger → filters → conditional/trigger splits → time-delays → multi-channel sends), and scheduled campaigns are durable, long-running, branching automation with waits/retries — an orchestration engine well beyond a recipe's static config.
4. **Performs external side-effects** — sends email/SMS/push, injects/generates discount codes, ingests Shopify webhooks + Web Pixel events, and runs predictive analytics. These are outbound network actions and event ingestion, not client-rendered UI a module owns.
