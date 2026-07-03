# Justuno ‑ Email & SMS Popups

> Vocabulary study record. Facts labeled **confirmed** (sourced from the live App Store listing, Justuno help center, or review pages) or **(inferred)** (reasoned from adjacent evidence). Sources listed at the bottom.

**Rename/merge note (confirmed):** The plugin the task names "Justuno Popups & Email Capture" is currently listed as **"Justuno ‑ Email & SMS Popups"** at `apps.shopify.com/justuno-pop-ups-email-conversion`. A second, older listing slug (`justuno-email-sms-popups`) exists but returns *"This app is not currently available on the Shopify App Store"* — a stale/removed duplicate. There is one live vendor listing; this record studies it. This is NOT a Bold app and has not been deprecated. Justuno positions itself as a broad "Conversion Automation Platform," so the Shopify listing is a subset of a larger SaaS product.

## identity
- **name:** Justuno ‑ Email & SMS Popups — **confirmed**
- **vendor:** Justuno (Fairfax, CA; app first launched Sept 17, 2013) — **confirmed**
- **category:** email / marketing & conversion (lead capture, popups) — **confirmed**
- **App Store URL:** https://apps.shopify.com/justuno-pop-ups-email-conversion — **confirmed**
- **rating:** 4.6 / 5 — **confirmed**
- **review count:** ~645–665 reviews (listing shows 645; aggregators cite 665+) — **confirmed**
- **install signal:** ~6,200+ Shopify stores (aggregator estimate, storeleads/shopify-spy) — **confirmed** as third-party estimate; Shopify does not publish exact installs
- **pricing model:** freemium + tiered subscription priced by **monthly visitor sessions**, with overage charges above tier. Listing tiers: **10K Lite $59/mo**, **20K Lite $99/mo**, **50K Lite $199/mo**, **100K Lite $299/mo** (14-day free trial, ~10% annual discount). Vendor site also references a free tier (<5K sessions), a **10K Essential $29/mo**, and higher **Plus/Flex/Enterprise** tiers ($399+/mo, custom). Overage = predetermined per-visitor cost above cap. — **confirmed**

## surfaces
Justuno is almost entirely **storefront-injected JavaScript** loaded via a Shopify **script tag** / theme app embed. It does not deeply touch checkout Functions or POS. Mapped to our allowlist:

- **theme.section / theme app embed (proxy.widget is the closer fit):** PRIMARY surface. Renders onsite overlays — popups (modal/lightbox), flyouts/slide-ins, message/announcement bars, banners, embedded inline promos, full-page "landing page" takeovers, and gamified units (Spin to Win, weather widget). All injected client-side by the Justuno tag; not native Liquid sections. What it shows: email/SMS capture forms, discount reveals, countdown timers, product recommendations, quizzes/surveys, age-gate, consent. — **confirmed**
- **analytics.pixel:** Justuno runs its own visitor-tracking/analytics layer (impressions, engagements, conversions, revenue attribution, A/B stats) and reads Shopify browsing/order/cart data. Functions like a first-party pixel/behavioral tracker rather than a Shopify Web Pixel extension per se. — **confirmed** (behavior); **(inferred)** that it is not a formal `web_pixel_extension`
- **checkout.block / checkout.upsell:** listing notes "Checkout extension compatibility." Extent is limited — Justuno can surface messaging on checkout-adjacent surfaces for Plus/Checkout-Extensibility merchants. — **confirmed** (compat claim); scope **(inferred, shallow)**
- **flow.automation:** Justuno has its OWN internal **Workflow** engine (enrollment trigger → if/then condition branches → actions), independent of Shopify Flow. It is an in-app rule/journey engine, not the Shopify Flow surface. — **confirmed**
- **admin.block / admin.action:** none native to Shopify Admin; all authoring happens in Justuno's own dashboard (external SaaS console), embedded via app iframe. — **(inferred)**
- **NOT used:** functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, postPurchase.offer, pos.extension, customerAccount.blocks. Discounts are *revealed/handed off* as codes, not enforced by a Shopify Function. — **(inferred, high confidence)**

**Cross-surface coordination (confirmed):** All surfaces share a single **visitor profile** keyed by a Justuno cookie/visitor ID. State (has-seen / has-engaged / has-closed a promo, cart contents this visit, quiz answers, opt-in status, session + all-time counters) is written to that profile and read by the **targeting rule engine** and the **Workflow** engine to decide which unit shows next. A visitor can be handed from one design to another ("link to frame" / multi-step), and captured data (email, quiz answers) flows forward into later steps and out to integrations. This shared-profile + rule-engine is the coordination fabric — the whole point of the product.

## functional_model
Core entities (names normalized; **confirmed** unless noted):

- **Promotion / Design** = `{ id, type(popup|flyout|bar|banner|embedded|landingpage|game), design_canvas(layers[]), targeting_ruleset_ref, ab_variants[], integration_bindings[], schedule }` — the authored unit.
- **Design Canvas / Layer** = `{ id, elementType, content, style(position,size,opacity,color,font,stroke), responsive(top|center|bottom|corner), clickAction, zOrder }` — stackable layers compose one design.
- **Targeting Rule / Ruleset** = `{ conditions[], polarity(positive|negative), operator_per_condition }` — grouped conditions defining the audience/segment that triggers display.
- **Audience / Segment** = `{ id, criteria[], time_scope(session|all-time) }` — a saved behavioral group (past behavior).
- **Workflow** = `{ enrollmentTrigger, conditionNodes[](all-of|any-of), actionNodes[] }` — real-time branching journey (no "else" branch).
- **Visitor Profile** = `{ visitorId, isNew|isReturning|isUnidentified, sessionKeys{}, allTimeKeys{}, cartThisVisit, ordersHistory, engagementHistory[], geo, device, capturedFields{} }` — the state store every rule reads.
- **Lead / Capture** = `{ email, phone, smsConsent, name, address, birthdate, trafficSource, urlOptedIn, quizAnswers{}, customProps{}, listRef }` — persisted to a Justuno list/profile and synced to ESP.
- **List** = `{ id, name, subscribers[], syncTarget(Klaviyo|Attentive|...) }`.
- **Discount code** = code string revealed in-design / copied to clipboard; created in Shopify or supplied; Justuno reveals but does not enforce it.
- **Analytics event** = `{ promotionId, type(impression|engagement|conversion), revenue, timestamp, variant }`.

Relationships: Design → (1) Ruleset → (n) Conditions; Design → (n) AB variants; Design → (n) Layers; Workflow enrolls Visitors and shows Designs; Captures append to Visitor Profile and to Lists; Lists sync to external ESPs.

## settings_taxonomy
The deepest section. Actual merchant-facing controls, grouped. Knob names are verbatim from Justuno docs where possible.

### content
- **Promotion type** — select[ popup / flyout / slide-in / message bar / banner / embedded / landing page / tab ] — **confirmed**
- **Design element: Text** — rich text block; content + font + color — **confirmed**
- **Design element: Image** — image (upload / asset library) — **confirmed**
- **Design element: Button** — text + **Click Action** = select[ Link to URL / Link to frame / Submit form / Close onsite / Copy to clipboard / Spin Wheel ] — **confirmed**
- **Form Fields** — multi-select of field types: **Email, Phone, SMS (tap-to-text), Name, Address, Consent (checkbox), Captcha, More Fields (custom)** — **confirmed**
- **Discount/Coupon element** — displays a code; per-frame a **discount code input** is required — **confirmed**
- **Timer** — countdown timer element — **confirmed**
- **Product Feed** — product recommendation element (feed of products) — **confirmed**
- **Video** — with autoplay + timing controls — **confirmed**
- **Progress Bar / Slider / Tabs / Map / Shapes / Icons / Effects / Code Block (custom HTML/JS)** — content elements — **confirmed**
- **Spin to Win wheel** — text/imagery per slice, multi-line prize via `^` separator; e.g. "Slice 4 = 10% Off" — **confirmed**
- **Weather widget** (geolocation-driven), **Messenger opt-in**, **Social elements** (Follow/Like/Social Bar across ~20 networks) — **confirmed**
- **Age Verification frame** — content element that gates entry — **confirmed**

### style
- **Position** — number/drag (x,y) — **confirmed**
- **Size** — number (w,h) — **confirmed**
- **Opacity** — number/slider — **confirmed**
- **Colors** — color pickers (background, text, element) — **confirmed**
- **Fonts** — select (incl. custom font upload) — **confirmed**
- **Stroke/Border** — color + pixel width + pattern (dashed/solid) — **confirmed**
- **Responsive Options** — per-layer sticky/anchor = select[ top / center / bottom / corners ] + separate mobile vs desktop layout — **confirmed**
- **Layer management** — drag-and-drop z-order reorder; pin form layers on top — **confirmed**
- **Templates** — pick from free high-performing template gallery — **confirmed**
- **Custom code / Custom fonts / Code Block** — text (CSS/JS/HTML) — **confirmed**
- **Animation/Effects** — animated overlay element + entrance effects — **confirmed** (element); granular params **(inferred)**

### targeting (the rule engine — this is where the product is unusually deep; 80+ conditions)
Grouped as Justuno documents them. Operators/types noted. All **confirmed** from the Advanced Targeting Rule Breakdown.
- **URL:** `Current URL` (contains / does not contain, text) · `Referring URL` · `Previous Domain Referring URL` · `First URL this session` · `First URL all-time`
- **Visit frequency:** `Number of visits to my site` (greater than / exactly-not, number) · `Pages visited this visit` · `Pages viewed all time` · `Days since visitor last saw/engaged any|this|specific promotion` (number + promo selector) · `Days since last matched this targeting rule` · `Sessions since ...` (full parallel set of session-scoped counters)
- **Geolocation:** `Visitor Language Settings` (dropdown) · `Country currently located in` (are / are not, dropdown) · `Region/State` · `Zipcode` (US only, text)
- **User engagement:** `Have seen any pop up this visit` / `ever` (have / have not) · `Engaged with any pop up this visit` / `ever` · `Seen/Engaged THIS pop up this visit` / `ever` · `Closed this pop up this visit` / `ever` · `Has ever seen/engaged a specific pop up` (promo selector) · `Has seen/engaged THIS promo less than X times` (number)
- **Date & time:** `Visitor Local Date` (date) · `Local Day of Week` (dropdown) · `Local Time` (time range) · `Seconds on current page` (number) · `Minutes on site this visit` · `Minutes on site all time` (greater than)
- **Technological / triggers:** `Intent to Leave` (exit intent, boolean) · `Exit with Back Button` · `Idle User` (seconds) · `IP Address` (text) · `Has scrolled X% down page` (number %) · `Has scrolled X pixels from top` (number px) · `Matching Element Exists` / `Clicked` / `Hovered` (CSS selector) · `Optimizely` (integration)
- **Cart & past orders:** `Item Added To Cart This visit` / `Last 7 Days` (equal/not/greater/less/contains, item selector: number, name, color, quantity, price, size) · `Cart Total This visit` / `Last 7 Days` (number comparators) · `Has placed an order before` (have / have not) · `Item purchased before` · `Purchased (Total Qty / Days / Amount)` · `Custom Value` (JavaScript) · `Matching Cookies Name/Value` · `Custom JSON Value` · `Arbitrary Profile Session Key/Value` · `Arbitrary Profile All-Time Key/Value`
- **Rule-set logic:** **positive vs negative rule sets** (include audience / exclude audience); within a rule editor conditions combine with **AND/OR**; but multiple rules attached to one promotion each independently trigger display (additive). — **confirmed**

### behavior
- **Display trigger** — derived from targeting (exit intent / scroll / idle / time-on-page / element interaction) — **confirmed**
- **Frequency capping** — via the "days/sessions since last saw/engaged" + "less than X times" conditions (no single "cap" field; expressed as rules) — **confirmed**
- **Scheduling** — start/end via local date/day/time conditions; promotion schedule — **confirmed**
- **A/B testing** — split-test multiple design/offer/targeting variants; tracks statistical significance % — **confirmed**
- **Workflows** — enrollment trigger + `ALL OF` / `ANY OF` condition branches + actions (show design, route to integration, delay/wait, apply next step); multi-step journeys, no else-branch — **confirmed**
- **Click actions** (per button, see content) drive close / navigation / form submit / clipboard / spin — **confirmed**

### data
- **Capture list selection** — select the subscriber **List**/segment leads land in — **confirmed**
- **Field-to-property mapping** — captured form fields map to Justuno profile properties; predefined props auto-sync + add custom Justuno properties (e.g. quiz answers, birthdate, product preferences, traffic source, URL-opted-in) — **confirmed**
- **Integration binding** — select ESP/SMS sync target: **Klaviyo, Attentive, Omnisend, Postscript, Iterable** (+ others) — **confirmed**
- **Consent handling** — Consent field + Captcha for compliant capture; SMS consent tracked — **confirmed**
- **Custom properties / zero-party data** — arbitrary key/value props written to profile from quizzes/surveys — **confirmed**

## data_model
- **External SaaS DB (Justuno cloud), NOT Shopify metafields/metaobjects.** Persists: **Visitor Profiles** (session + all-time behavioral keys, engagement history, cart snapshots), **Leads/Captures** (email, phone, SMS consent, name, address, birthdate, custom + quiz props, trafficSource, urlOptedIn), **Lists/Audiences**, **Promotion/Design definitions** (canvas layers, rulesets, A/B variants, schedules), and **Analytics events** (impressions, engagements, conversions, revenue). — **confirmed**
- **Retention fallback:** if no ESP is connected, captured emails are retained in Justuno's **Audience → Profiles** area. — **confirmed**
- **Media/CDN:** images/custom fonts/assets hosted in Justuno's asset library/CDN. — **confirmed**
- **Shopify side:** installs a **script tag / theme app embed** on the storefront; reads Shopify customer, product, order, discount, and cart data (OAuth scopes shown on listing: customer names/emails/addresses, geolocation/IP, browsing behavior, edit customer data, view products/orders/discounts, modify Online Store script tags). — **confirmed**
- **Codes:** discount codes are strings revealed in-design / copied to clipboard; created in Shopify Admin or supplied — Justuno does not mint or enforce them via a Function. — **confirmed** (reveal), **(inferred)** (no Function enforcement)
- **External side-effects:** real-time sync of captured leads + properties to Klaviyo/Attentive/etc. via API/webhooks. — **confirmed**

## visual_patterns
- **Layout archetypes:** center modal/lightbox popup (with dark overlay), corner flyout/slide-in, top/bottom sticky message bar, full-width banner, inline embedded block, full-page landing takeover, floating "tab" trigger, and gamified circular Spin-to-Win wheel. — **confirmed**
- **Composition:** free-form **layered canvas** (drag/drop, z-ordered, absolutely positioned), separate desktop/mobile layouts, per-layer sticky anchoring. — **confirmed**
- **Component states:** teaser/tab → open popup → (multi-frame) success/reveal frame → minimized/closed; has-seen / has-engaged / has-closed states drive re-display suppression. — **confirmed**
- **Motion/interaction:** entrance animations + animated Effects overlay, countdown timer tick, progress bar animation, video autoplay, carousel slider, wheel spin animation, exit-intent + scroll + idle triggers, copy-to-clipboard feedback. — **confirmed**
- **Multi-step:** "Link to frame" moves the visitor between frames of the same design (e.g. offer → email form → code reveal). — **confirmed**

## reviews_signal
**Praises (confirmed from App Store + aggregators):**
1. Strong measurable results — email/SMS list growth (one cites 15,000+ new subscribers), lowered abandoned-cart rate, added revenue.
2. Exceptional, consultative **account/CSM support** — named reps praised as responsive and idea-generating; "more than a tech solution."
3. **Powerful customization + deep targeting/workflows** — "super powerful… our most complex strategies a reality."
4. Easy Shopify integration and onboarding; quick to launch.
5. Rich template library gets merchants started fast.

**Complaints (confirmed):**
1. **Glitchy / unreliable** — settings that don't save, work lost across attempts, "super glitchy."
2. **Promotions turning off unexpectedly** — merchant had to re-check every 30 min to confirm it was still live.
3. **Time-consuming to build custom units** — "will take you hours" and may still not work reliably (steep learning curve on rules/editor).
4. **Pricing gets expensive / convoluted as traffic scales** — session-based tiers + overages; costly for small stores relative to revenue.
5. **Billing/cancellation friction** — hard to cancel; some report managed-service charges and refund difficulties.

## mapping_note
Justuno maps onto our vocabulary primarily as a **`proxy.widget` / theme-app-embed storefront overlay** carrying an **email-capture form + offer**, plus an **`analytics.pixel`**-style behavioral tracker. A *single* RecipeSpec module can represent ONE Justuno design (e.g. "exit-intent email popup with 10% code"): content layers → module content slots, style knobs → theme tokens, one targeting condition or two → simple display rules, a form → a lead field set.

Where it **EXCEEDS a single-module recipe** (the gap analysis):
1. **It needs a persistent visitor/lead data store with cross-session state.** The entire product is built on a Justuno-hosted **Visitor Profile + Lead + List** database (session + all-time counters, engagement history, captured PII, quiz/zero-party props). A stateless single module cannot hold "days/sessions since last engaged" or store captured leads — this demands a backing data store (metaobjects or external DB) and retention.
2. **It is a rule/segmentation engine, not a static config.** 80+ targeting conditions with AND/OR + positive/negative rule sets, plus a **Workflow** journey engine (enrollment trigger → ALL-OF/ANY-OF branches → actions, multi-step, A/B split). This is a first-class rule-engine + branching state machine, far beyond a fixed `targeting` field on one recipe.
3. **It is a cross-surface, multi-frame blueprint with shared state.** Popup + flyout + bar + embedded + landing + Spin-to-Win + checkout messaging all coordinate through one shared visitor profile and hand visitors frame-to-frame. That's a coordinated **blueprint of several modules sharing state**, not one module.
4. **It performs external side-effects and background sync.** Real-time lead sync to Klaviyo/Attentive/Postscript/etc. via API/webhooks, plus its own analytics attribution pipeline — background jobs and outbound integrations outside any single storefront module's scope.

---

### Sources
- App Store listing: https://apps.shopify.com/justuno-pop-ups-email-conversion
- App Store reviews: https://apps.shopify.com/justuno-pop-ups-email-conversion/reviews
- Stale duplicate listing (removed): https://apps.shopify.com/justuno-email-sms-popups
- Advanced Targeting Rule Breakdown: https://support.justuno.com/article/954-advanced-targeting-rule-breakdown
- Design Studio / Canvas overview: https://hub.justuno.com/knowledge/design-canvas-overview
- Spin to Win: https://hub.justuno.com/knowledge/gamification-spin-to-win
- Workflow conditions: https://hub.justuno.com/knowledge/workflow-conditions
- Lead capture sync: https://hub.justuno.com/knowledge/creating-syncing-lead-capture-designs
- Analytics dashboards: https://hub.justuno.com/article/509-analytics-dashboards-overview
- Klaviyo sync: https://hub.justuno.com/knowledge/syncing-klaviyo-to-justuno
- ATTN Agency review (2026), G2, Capterra, GetApp — pricing/complaint corroboration
