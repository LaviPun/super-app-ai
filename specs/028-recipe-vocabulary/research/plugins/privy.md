# Privy ‑ Email, SMS & Pop Ups

> Status note: The app is **active and current** on the Shopify App Store — NOT deprecated or renamed away. It is NOT a Bold app; the vendor is Privy Operations (listing owner), part of Attentive's family after a 2021 acquisition, a 2023 divestiture, then re-consolidation; Privy also acquired Emotive to expand SMS/conversational features. The listing title has drifted over time ("Privy ‑ Pop Ups, Email, & SMS" → "Privy ‑ Email, SMS & Pop Ups") but it is the same product line from the same vendor. All facts below reflect the currently-live listing + knowledge base. (confirmed)

## identity
- **name**: Privy ‑ Email, SMS & Pop Ups (confirmed)
- **vendor**: Privy Operations — Boston, MA, US (6 Liberty Square, PMB 6112, 02109); launched June 24, 2015 (confirmed)
- **category**: Email marketing + SMS marketing (confirmed)
- **App Store URL**: https://apps.shopify.com/privy (confirmed)
- **rating**: 4.5 / 5 (confirmed)
- **review count**: ~4,035 on the live listing (breakdown: 75% 5★ / 14% 4★ / 5% 3★ / 2% 2★ / 4% 1★); vendor/aggregators cite ~4,300–4,800 historically (confirmed)
- **install signal**: ~48,000 Shopify stores (aggregator estimate ~48,311); "#1 reviewed Email & SMS marketing app" (confirmed / partly inferred from third-party aggregators)
- **pricing model**: Freemium + tiered subscription that scales with usage. Free plan (basic popups, up to 100 mailable contacts). Paid: **Pop Ups & Displays** $24/mo (up to 10,000 monthly pageviews), **Email** $30/mo (up to 1,500 email contacts), **Email and SMS** $45/mo (1,500 contacts + 1,250 SMS credits). Price scales up with contact-list size / pageviews / SMS credits. (confirmed)

## surfaces
Privy is fundamentally an **on-site storefront widget engine + an off-site messaging/automation platform**, stitched to Shopify via data sync. Mapping to our allowlist:

- **theme.section** (confirmed) — Embedded/inline forms ("scroll boxes", embedded email-capture forms) and announcement bars/banners render as persistent on-page elements, installed via the Shopify App Embed / theme app extension. Shows: email/SMS signup fields, free-shipping/announcement bar, inline newsletter block.
- **proxy.widget** (confirmed) — The overlay display layer: pop-ups, flyouts, spin-to-win wheels, exit-intent overlays, multi-step / mini-quiz forms, cart-saver bars. Injected client-side by Privy's script (App Embed), evaluated against targeting + trigger rules in-browser. This is the primary storefront surface.
- **analytics.pixel** (confirmed) — Privy's on-site JS tracks pageviews, sessions, referrer/UTM, cart contents, and "Display Seen / Display Signed Up" events to drive targeting and revenue attribution; also offers "Audience Sync for Facebook & Google" (ad-audience push). This is a tracking/pixel role, not a native Shopify Web Pixel extension necessarily. (analytics.pixel confirmed; native Web-Pixel-API usage inferred)
- **flow.automation** (confirmed) — The **Flows** builder is Privy's own visual automation engine (triggers → delays → splits → email/SMS/tag steps). This is off-Shopify (Privy-hosted) but is a first-class "flow automation" surface conceptually.
- **admin.block** (inferred) — Merchant builds/manages everything inside Privy's embedded admin (campaign builder, editor, reporting) surfaced through the Shopify admin app frame. Not fine-grained Shopify admin action-extensions; it's a full embedded app UI.

Surfaces it does NOT use: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, checkout.upsell, checkout.block, postPurchase.offer, pos.extension, customerAccount.blocks, admin.action (as discrete extensions). Discounts are created as **native Shopify discount codes** (Coupon "Source: Shopify"), NOT via Shopify Functions. (confirmed)

**How surfaces coordinate (shared state / handoff)**: A single **contact/subscriber record** is the shared state that hands off across surfaces. (1) proxy.widget/theme.section capture an email/SMS + consent → creates/updates the contact and can reveal a coupon; (2) the analytics.pixel enriches that contact's browsing/cart/session profile in real time; (3) that profile feeds **audience targeting** (which displays show to whom) AND **Flow triggers** (which automations fire); (4) flow.automation sends off-site Email/SMS referencing the same coupon and contact tags. Coupons, contact tags, and consent status are the concrete tokens passed between the on-site widget layer and the off-site messaging layer.

## functional_model
Core entities and relationships (field lists are (inferred) from observed behavior + docs unless noted):

- **contact / subscriber** = { id, email?, phone?, emailConsent (bool), smsConsent (bool), suppressed (bool), customFields{}, region/country/postalCode, shopifyCustomerRef, privyTags[], shopifyTags[] (synced), sessionProfile, orderCount } — the central record; identity flag "known vs unknown". (confirmed fields: email, phone, consent, tags, region, custom fields, order count, suppressed)
- **display / campaign (on-site)** = { id, type (popup|flyout|bar|banner|embedded|spin-to-win|mini-quiz|multi-step), designConfig (desktop + mobile variants), formFields[], triggers[], targetingConditions[], frequencyRules, couponRef?, abTestVariants[], status } (confirmed structure)
- **display type** = one of: pop-up, flyout, scroll box, announcement bar, banner, embedded/inline form, spin-to-win, mini quiz, multi-step form, cart-saver/tab. (confirmed)
- **coupon** = { title (internal), source (Shopify|BigCommerce|Manual), couponType (Master|Unique), code | codePrefix, discountType (percentage|fixed amount|free shipping), discountValue, additionalRules (e.g. minimum purchase), startDate?, endDate? }. Unique coupons generate a per-contact random alphanumeric code synced as a native Shopify discount. (confirmed)
- **message / campaign (off-site)** = email campaign or SMS campaign = { subject/previewText (email), body (drag-drop blocks or SMS text), audience/segment, couponRef?, sendTime, revenue metrics }. (confirmed structure)
- **flow (automation)** = { trigger, entryFilters[], entryFrequency (immediate|delayed|no re-entry), exitCriteria, nodes[] } where nodes ∈ {Add email, Add SMS, Add Delay, Split Flow, Tag Contact, Update Contact}. (confirmed)
- **segment / audience** = saved set of targeting conditions over contacts (customer attributes + shopping activity + website behavior). (confirmed)

Relationships: contact 1—* display-signups; contact 1—1 shopifyCustomer (synced); display *—1 coupon; flow *—* contact (via trigger/entry); coupon 1—* message/display (reused by reference); segment *—* contact.

## settings_taxonomy
The actual merchant-facing controls, grouped into content / style / targeting / behavior / data.

### content (what the display/message says)
- **Display type** — select[pop-up, flyout, scroll box, announcement bar, banner, embedded form, spin-to-win, mini quiz, multi-step form] (confirmed)
- **Template** — select from templates library (per campaign type) (confirmed)
- **Headline / body text** — text (rich) (confirmed)
- **Form fields** — field set: Email field, Phone/SMS field, Name, plus **Custom Fields** (add/remove capture fields) (confirmed: email, phone, custom fields)
- **Email vs SMS capture** — toggle/field-config (which consent + which channel this form captures) (inferred)
- **Button label / CTA text** — text (confirmed)
- **Coupon reveal** — couponRef select + on-screen code reveal (Master or Unique) (confirmed)
- **Multi-step / mini-quiz steps** — step builder (question → answer → outcome/branch) (confirmed as feature; step-editor detail inferred)
- **Spin-to-win wheel segments** — repeatable list of prize slices w/ odds + coupon per slice (inferred)
- **Email editor blocks** (drag-and-drop) — content elements: **Text**, **Image**, **Button**, **Product block** (pulls image + description from product catalog), **Coupon** block, layout/**Blocks** (columns/rows), divider/spacer/social (confirmed: text, image, button, product, coupon, layout blocks; divider/spacer/social inferred)
- **Email subject line / preview text / sender** — text (confirmed subject; preview text + sender inferred standard)
- **Personalization / merge tags** — insert-token (real customer data personalization) (confirmed feature; token names inferred)
- **SMS message body** — text w/ character/segment awareness (confirmed)

### style (how it looks)
- **Built-in theming** — "on-brand" auto-theme toggle (confirmed)
- **Advanced styling options** — colors, fonts, images to match mockups (confirmed generically; individual pickers inferred)
- **Colors** — color pickers for background, text, button, accent (inferred)
- **Fonts / typography** — select + size (inferred)
- **Images / background image** — image upload (confirmed images supported)
- **Desktop vs mobile appearance** — separate design per breakpoint ("Customize look for desktop vs mobile") (confirmed)
- **Position / layout** — display placement (bar top/bottom, popup center, flyout corner) (inferred)
- **Close/dismiss control styling** — X button / close behavior (inferred)

### targeting (who sees it)
Two-level logic: **Match All (AND)** vs **Match Any (OR)** across conditions. (confirmed)
- **Customer Attributes**: Country, Region (US states / UK counties / CA provinces / AU states), Postal Code, Language, Custom Fields (confirmed)
- **Shopping Activity**: Cart Value (number), Cart Product IDs, Cart Variant IDs, Order Count (confirmed)
- **Website Behavior**: Current URL, Initial URL (this session), Initial URL (all time), Referring URL, Traffic type, Initial traffic type, Pageviews (this session), Pageviews (all time), Sessions Count, Day of week, Time of day, Device category (Desktop / Mobile — tablet counts as mobile) (confirmed)
- **Display history**: Display Seen, Display Seen (this session), Display Signed Up, Display Signed Up (this session) (confirmed)
- **User identity**: known (is a contact) vs unknown (confirmed)
- **Custom JavaScript** — arbitrary JS condition (confirmed)
- **Segment / audience** selection for email/SMS sends (advanced segmentation, smart segment recommendations, VIP / lapsed / high-value buyer segments) (confirmed)

### behavior (when / how often it fires; automation)
- **Display Triggers** (When To Show): **Time on Page** (number, seconds), **Show on scroll**, **Show on exit intent**; first event wins if multiple set; none set = won't auto-show (confirmed)
- **Limit display appearance** — toggle + duration; default 1 day cooldown per visitor; unchecking = no per-session limit (confirmed)
- **Automatically end the display after X signups** — number threshold (confirmed)
- **Cart-value trigger** — show based on cart value (confirmed as trigger option)
- **Flow triggers** — select[Welcome, Subscriber Conversion Series, Abandoned Cart, Abandoned Cart SMS, Browse Abandonment, Purchase Follow Up, Post-Purchase SMS, Customer Winback, Winback SMS, Back in Stock, Integration Event (Rivo/Yotpo), Special Occasion, Start From Scratch] (confirmed)
- **Flow trigger filters** — Privy Tag Added / Removed, Shopify Tag Added / Removed, audience entry filters (confirmed)
- **Flow steps** — Add Delay (time gap), Split Flow (if/else by attribute), Tag Contact, Update Contact (suppress/unsuppress) (confirmed)
- **Entry frequency** — select[immediate re-entry, delayed re-entry, No re-entry] (confirmed)
- **Exit criteria** — auto-remove on purchase, etc. (confirmed)
- **A/B testing** — variant split on displays and email campaigns ("Automation splits and A/B testing") (confirmed)

### data (integrations, coupons, consent, sync)
- **Coupon config** — Title (internal), Source (Shopify|BigCommerce|Manual), Coupon Type (Master|Unique), Code / Code Prefix, Discount Type (percentage|fixed amount|free shipping), discount value, Additional Rules (min purchase), Start/End dates (confirmed)
- **Consent collection** — email consent + SMS consent capture toggles (confirmed)
- **Email domains** — sender domain setup/authentication (confirmed)
- **Import / export** — contact list import/export (confirmed)
- **Tagging** — Privy tags + synced Shopify tags (confirmed)
- **Integrations** — Checkout, Attentive, Emotive, Klaviyo, Mailchimp, Postscript, Smile.io; Audience Sync for Facebook & Google (confirmed)
- **Shopify sync** — products, collections, customer tags, purchase history, orders (for revenue attribution) (confirmed)

## data_model
Privy persists the bulk of state in its **own external database + hosted platform** (Privy-hosted app), not in Shopify metafields/metaobjects:
- **External DB (Privy-hosted)**: contacts/subscribers, consent + suppression status, custom fields, Privy tags, segments/audiences, display/campaign definitions, flow definitions, message content, A/B variants, and all analytics/attribution events (pageviews, sessions, display seen/signup, revenue). (confirmed platform is external; storage mechanics inferred)
- **Shopify (native)**: **discount codes** are written as real Shopify discounts (Coupon Source: Shopify), including per-contact **unique codes** (random alphanumeric strings). Shopify customer records/tags are synced bidirectionally with contacts. Orders/products/collections are read from Shopify. (confirmed)
- **Media / CDN**: uploaded images (display backgrounds, email images) hosted on Privy's CDN. (inferred)
- **Client-side**: on-site JS reads/writes cookies/localStorage for session profile, display-frequency caps, and "seen/signed-up" flags used by targeting. (confirmed behavior; storage mechanism inferred)
- **Codes**: coupon codes (master = single shared; unique = one-per-contact, generated + synced to Shopify). (confirmed)

## visual_patterns
- **Layout archetypes**: centered modal pop-up (with dimmed overlay); corner flyout / scroll box; top/bottom announcement bar & free-shipping bar; full-screen mini-quiz; spin-to-win wheel; inline/embedded newsletter block; multi-step wizard (step 1 email → step 2 SMS/phone → step 3 coupon reveal). (confirmed)
- **Component states**: teaser/collapsed tab → expanded display; empty form → filled → success/coupon-reveal state; error (invalid email/phone); "already seen / suppressed" (won't re-show within cooldown); desktop vs mobile responsive variants. (confirmed)
- **Motion / interaction**: exit-intent detection (mouse-leave), scroll-depth reveal, timed reveal, spin-wheel animation (gamified), multi-step transitions, dismiss/close, coupon copy-to-clipboard. (confirmed)
- **On-brand theming**: auto-pull brand colors/fonts; per-breakpoint restyle. (confirmed)

## reviews_signal
**Top praises**
1. Responsive, expert human customer support (live chat + Zoom/video; named reps like Henry/Jose repeatedly praised). (confirmed)
2. Pop-ups + forms measurably lift signup/conversion (e.g. "5x better signup rate" after redoing popups). (confirmed)
3. Ease of use — intuitive builder, drag-and-drop, no expertise needed; strong Shopify integration inside one dashboard. (confirmed)
4. Broad feature set for the price — "handles pretty much anything a larger contact platform can," continuous feature additions over years. (confirmed)
5. Effective targeting (exit intent, scroll triggers) for personalized experiences. (confirmed)

**Top complaints**
1. **Billing / cancellation failures** — charged for months after uninstalling/canceling; hard-to-reach billing support; partial-only refunds. (confirmed, recurring)
2. **Pricing gets unclear / climbs as you scale** (contact-count & pageview-based tiers surprise merchants). (confirmed)
3. **Reporting depth** — merchants want more granular analytics (e.g. per-link click detail for email subscribers). (confirmed)
4. **Accountability gaps** on historical billing disputes ("internal system changes" cited to deny recourse). (confirmed)
5. Occasional deliverability / platform-change friction (inferred from mixed low-star reviews and acquisition churn). (inferred)

## mapping_note
Onto our constrained RecipeSpec vocabulary, the **on-site display** is the recipe-shaped core: a single Privy pop-up/bar/embedded form maps cleanly to a **proxy.widget** (overlay) or **theme.section** (inline/bar) with a settings schema covering content/style/targeting/behavior — this is well within a single-module recipe (form fields + trigger + targeting + coupon reveal + A/B variant).

Where it **decisively EXCEEDS a single-module recipe**:
1. **Persistent contact/subscriber data store + consent state** — it owns a first-class contact database (email/SMS/consent/suppression/custom fields/tags/segments) that survives across sessions and surfaces; a stateless single-module recipe has no such store. This is the biggest gap.
2. **Cross-surface blueprint with shared handoff** — one coherent product spans an on-site capture widget, an analytics/pixel enrichment layer, an off-site Email/SMS sender, and a discount surface, all coordinating through the shared contact + coupon + tag tokens. That's a multi-module blueprint, not one module.
3. **Background-job automation / flow engine** — the **Flows** builder (triggers → delays → conditional splits → email/SMS/tag steps, with entry-frequency + exit criteria) is a durable, time-based, event-driven workflow engine requiring scheduled/queued execution far beyond a recipe's render-time logic.
4. **External side-effects + real-time rule engine** — writes native Shopify discount codes (incl. per-contact unique-code generation/sync), pushes ad audiences to Facebook/Google, sends transactional/marketing email+SMS, and evaluates a rich AND/OR targeting rule engine over live browsing/cart/order data. These are stateful external effects a single-module recipe cannot own.
