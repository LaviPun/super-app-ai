# Omnisend Email Marketing & SMS

> Vocabulary study record. The app is live and current — NOT renamed, merged, or deprecated. Same vendor (Omnisend, Vilnius LT), same app slug `omnisend`, continuously listed since 2014. It carries the "Built for Shopify" badge. (confirmed)
> This is a **hosted SaaS marketing platform**, not a storefront widget. The Shopify app is a thin connector: it syncs Shopify data (customers/products/orders/carts) into Omnisend's cloud, injects a theme app embed for on-site tracking + forms, and hooks checkout via Checkout extensions. Almost all "settings" live in Omnisend's own web app, NOT in the Shopify theme editor. This makes it a poor fit for a single-module recipe (see mapping_note). (confirmed)

## identity
- **name**: Omnisend Email Marketing & SMS (subtitle: "Drive sales with email marketing, newsletters, SMS, and popups") (confirmed)
- **vendor**: Omnisend (Verkiu 25C, Vilnius, 08223, Lithuania); listing launched 2014-03-10 (confirmed)
- **category**: Email marketing (under Marketing and conversion) (confirmed)
- **App Store URL**: https://apps.shopify.com/omnisend (confirmed)
- **rating**: 4.8 / 5 (confirmed)
- **review count**: ~2,968 reviews (90% five-star ≈ 2.7K, 4% four-star ≈126, 1% three-star ≈17, 1% two-star ≈23, 5% one-star ≈144) (confirmed)
- **install signal**: ~67,000+ installed stores (StoreLeads reports ~67,486); listing markets "200+ integrations" and "24/7 email & live chat support." "Built for Shopify" badge present. (confirmed as reported; exact live-install count (inferred))
- **pricing model**: Freemium, **contact-based** subscription. You pay by "billable contacts" = subscribers + non-subscribers who received automated/transactional messages. Emails/SMS have monthly send caps that scale with the tier. (confirmed)
  - **Free** — free to install; up to **250 contacts**; **500 emails/month**; **500 web push/month**; global SMS via $1 sign-up credits; 250+ templates; popups & forms; pre-built workflows; 24/7 support. (confirmed)
  - **Standard** — from **$16/month** (scales with contacts); up to ~500 contacts at entry; **6,000 emails/month**; unlimited web push; SMS credits; 24/7 priority support; optional account expert (advertised $400+/mo). (confirmed)
  - **Pro** — from **$59/month** (scales with contacts); ~2,500 contacts at entry; **unlimited emails**; advanced reporting; **personalized product recommender**; account expert; more SMS credits. (confirmed)
  - SMS billing is credit/usage-based on top of the plan; charges billed every 30 days in USD. (confirmed)

## surfaces
Omnisend is fundamentally **multi-surface** and mostly OFF-Shopify: the "product" lives in Omnisend's cloud (contact DB + campaign engine + automation engine). The Shopify app connects several surfaces, all reading/writing one hosted **contact + event stream**. Mapped to our allowlist:

- **theme.section** (as a **theme app embed**, not a placed section) (confirmed): The Omnisend app embed must be enabled in Shopify OS 2.0 themes. It injects (a) the on-site **tracking script** (page views, product views, cart, checkout-start events) and (b) the **signup form renderer** (popups, flyouts, embedded/inline boxes, teasers, landing pages). Without the embed, front-end events do NOT fire and event-driven automations (Abandoned Cart, Browse Abandonment, Product Viewed) do NOT trigger. This is the primary storefront surface. It shows: popups/flyouts, inline embedded signup boxes, wheel-of-fortune, teaser tabs.
- **checkout.block** / **checkout.upsell** (confirmed as "Checkout extensions" on the listing): Omnisend uses Shopify **Checkout extensions** — at minimum a checkout **email/SMS consent capture** block (marketing opt-in at checkout) feeding the contact DB. (mechanism confirmed; the exact checkout UI element (inferred) — most likely a consent/subscribe block rather than a product upsell)
- **analytics.pixel** (confirmed in behavior; (inferred) as a formal Web Pixel extension): captures browsing/cart/checkout events for segmentation and automation triggers. Delivered via the theme app embed script and Shopify webhooks; whether it's registered as a Shopify **Web Pixel** vs. a raw injected script is (inferred).
- **flow.automation** (confirmed): "Shopify Flow compatible" — Shopify Flow can trigger Omnisend side-effects and vice versa. Separately, Omnisend has its OWN internal automation engine (its core feature) that is far more powerful than Flow (see functional_model).
- **customerAccount.blocks** — not a documented surface. (confirmed absent)
- **pos.extension** — not a documented surface for this app. (confirmed absent)
- **admin.block / admin.action** (inferred): merchant config lives inside Omnisend's **own embedded/standalone web admin** (Campaigns, Automations, Forms, Segments, Reports, Audience), not native Shopify admin blocks. A newer hook: "Connect ChatGPT or Claude to Omnisend via **MCP**" to build campaigns/segments by prompt. (confirmed)
- **postPurchase.offer / functions.\*** — not used. (confirmed absent)

**Coordination**: The shared state is a **single hosted contact record + event timeline per person**, keyed to email/phone and reconciled with the Shopify customer. Storefront forms (theme embed) capture consent → write a contact. Checkout consent block → writes/updates the same contact. Tracking script → appends browse/cart/checkout events to that contact's timeline. Those events + contact properties feed **Segments** (real-time recomputed) and **Automation triggers**. Campaigns and automations then send email/SMS/push to the same contacts. So every surface is an input to, or an output of, ONE cloud contact-and-event graph — a storefront capture layer bolted onto an off-Shopify messaging engine.

## functional_model
Core entities (shapes inferred from documented behavior; field names concrete where confirmed):
- **contact** = { email, phone, firstName, lastName, gender, birthdate, subscriptionStatus (subscribed/unsubscribed/non-subscribed) per channel {email,sms,push}, consent{email,sms}, tags[], customProperties{...}, city/country/state/zip, lastDetectedCity/Country, customerLifecycleStage, computedTraits{averageOrderValue, totalSpent}, shopify_customer_ref, billable (bool) } (confirmed properties; some field names (inferred))
- **event** (timeline) = { type ∈ {viewedPage, viewedProduct, addedProductToCart, startedCheckout, placedOrder, paidForOrder, orderFulfilled/Canceled/Refunded, openedMessage, clickedMessage, messageSent, optedIn, optedOut, markedAsSpam, custom}, timestamp, productId?, orderId?, messageId?, customData{...} } (confirmed types)
- **segment** = { filterGroups[ { filters[], joinOperator ∈ AND|OR } ], groupJoin ∈ AND|OR, realtime (recomputes live) } across 11 filter categories (see settings_taxonomy → targeting) (confirmed)
- **form** (signup form) = { type ∈ {popup, flyout, embedded/inline, landing page, teaser, wheel-of-fortune}, blocks[], layout, theme, behavior{triggers, frequency, scheduling}, targeting{visitor, page, location, device, UTM}, successStep, tagsAssigned[], doubleOptIn, recaptcha, abTest } (confirmed)
- **campaign** = { channel ∈ {email, sms, push}, audience (segment/all), content (drag-drop blocks), subjectLine, abTest?, scheduledAt, tracking } (confirmed)
- **workflow** (automation) = { trigger, audienceFilter (segment), nodes[ Email | SMS | Push | Delay | ConditionalSplit(yes/no) | A/BSplit(%) | Tag | Action ], exitConditions } (confirmed)
- **message** = { channel, template, personalization tokens, productRecommendationBlock?, discountCode? } (confirmed)
- Relationships: order/product/cart data syncs from Shopify → attaches to `contact` and appends `event`s → drives `segment` membership → gates `workflow` entry/splits → sends `message` → engagement events append back to the same `contact`. A closed loop, entirely server-side.

## settings_taxonomy
The merchant-facing controls span TWO very different config surfaces: the **Form Builder** (the only thing rendered on the Shopify storefront) and the **cloud app** (campaigns, automations, segments — the bulk of the product). Grouped under the five headings:

### content
- **Form Items/Blocks** (drag-drop): Email field, Phone number field, Text block, Button, Image (JPG/PNG/GIF, max 2000px), Legal consent block, generic Input field, Date field, Dropdown, Line/Space separator, **Wheel of Fortune** block. (block palette) (confirmed)
- **Success step / Success message**: customizable text, buttons, image, layout; separate **Subscribed message** for already-existing contacts; per-field **Error message** text. (text) (confirmed)
- **Discount reveal**: success step can display a discount/coupon code (reward for signup). (text + code) (confirmed)
- **Email/SMS/Push campaign content**: drag-drop **Editor tool** with content blocks; 250+ **Templates**; **Custom code** (HTML) block; **Custom fonts**; **AI generation** (on-brand copy, subject-line generator); **Translation / Localization**; product **Import and export**. (confirmed)
- **Product recommendation block**: dynamic recommended-products block inserted into emails (Pro plan → personalized recommender). (block) (confirmed)
- **Subject line** (text) with AI-assist; **preheader** (inferred).

### style
- **Theme → Form layout**: Display type (select), Form width (number), Background image (image), Position (select). (confirmed)
- **Theme → Form styles**: Corner rounding (number/slider), Border { width (number), line style (select), color (color) }, Overlay color (color). (confirmed)
- **Theme → Buttons**: Style (select: Primary / Secondary / Tertiary), Font (select), Color (color), Shape (select), Hover styles. (confirmed)
- **Theme → Fields**: Shape (select), Color (color), Font (select), Border style (select), Error color (color). (confirmed)
- **Theme → Close button**: Visibility (toggle), Color (color), Style (select). (confirmed)
- **Teaser**: styleable clickable edge tab that reopens the popup; inherits form visibility rules. (confirmed)
- Email templates are styled in the drag-drop editor (colors, fonts, spacing per block); not exposed as a fixed knob set. (inferred)

### targeting
Two rule engines. **(A) Form targeting** (who sees the popup) — all combine with AND logic:
- **Visitor targeting** (select): All visitors / Exclude existing contacts / Show only to existing contacts / Target by **segment**. (confirmed)
- **Page targeting** (rule): Appears on URL / Does not appear on URL / Out-of-stock products. (confirmed)
- **Location targeting**: Show or exclude by **countries** (multi-select). (confirmed)
- **Device visibility** (select): All devices / Mobile only / Desktop only. (confirmed)
- **UTM targeting** (text rules): utm_id, utm_source, utm_medium, utm_name (campaign), utm_term, utm_content. (confirmed)

**(B) Segment builder** (who receives campaigns/enters automations) — a full **rule-builder**: 11 filter categories, combined into Filter Groups joined by **AND/OR**, recomputed in real time (confirmed):
1. **Anniversary**: Birthdate, Date of Addition, ExternalCreated, Custom anniversary dates; operator "anniversary is in the next X days."
2. **Contact Properties**: Consent, Customer Lifecycle Stage, Email Address, First/Last Name, Gender, Phone Number, Subscription Status, Tag; operators is / is not / contains / pattern.
3. **Contact Location**: City, Country, Last Detected City/Country, Physical Address, State, Zip.
4. **Engagement**: Clicked Message, Marked Message as Spam, Message Delivery Failed, Message Sent, Opened Message, Opted In, Opted Out, Viewed Page.
5. **Orders**: Order Canceled/Fulfilled/Refunded, Paid for Order, Placed Order, Started Checkout (with Product-ID subfilters).
6. **Products**: Added Product to Cart, Ordered Product, Viewed Product.
7. **Custom Events**: API-synced events + their data.
8. **Custom Properties**: any extra contact fields.
9. **Computed Traits**: Average Order Value, Total Spent.
   (Plus RFM/Customer Lifecycle Map segments and 30+ pre-built segment templates, all editable.) (confirmed)

### behavior
- **Form display triggers** (behavior): Page visits (number required), Time on page (seconds, number), Scroll depth (percentage, number), **Exit intent** (toggle, desktop+mobile), **Custom trigger** (button click / custom JS event). (confirmed)
- **Frequency / reappear interval**: number + unit (Seconds / Minutes / Hours / Days). (confirmed)
- **Scheduling**: Always show / Start date / End date / Start-and-end dates (date pickers); auto-disable for expired countdown timers. (confirmed)
- **Consent & compliance**: Double opt-in (toggle), reCAPTCHA (toggle), assign Tags to submissions (multi-select), Redirect after submission (URL text). (confirmed)
- **A/B testing** (form): toggle to split form variants. (confirmed)
- **Automation workflow nodes** (rule engine): Trigger (event-based, e.g. subscribed/abandoned cart/order placed) → sequence of **Delay** (minutes→months, measured from prior block), **Email / SMS / Push** send nodes, **Conditional Split** (Yes/No paths on behavior/profile/engagement; up to **20 split blocks**; both paths need ≥1 step), **A/B Test Split** (% probability, default 50/50), **Tag** action, generic **Action** node; **audience filter** (segment) on entry; retrospective triggering; exit conditions. 20+ pre-built workflows (Welcome, Abandoned Cart, Browse Abandonment, Post-purchase, Win-back, Back-in-stock, Price-drop). (confirmed)
- **Campaign scheduling / send-time**: schedule at a time or send-now; omnichannel workflows chain channels conditionally (email day 1 → SMS day 3 if unopened → push day 5). (confirmed)

### data
- **Data sync**: Shopify customers, products, orders, carts, checkouts auto-sync into Omnisend (contacts/products/orders within ~1h; full historical import up to 24h). (confirmed)
- **Consent collection**: email + SMS consent captured at form, checkout, and via API; per-channel subscription status persisted. (confirmed)
- **Contact list & capture**: Email capture list, SMS capture list, tagging, custom properties, custom events via **APIs and webhooks**. (confirmed)
- **Reporting/Analytics**: campaign & automation reporting, revenue attribution, A/B results, RFM/lifecycle analytics — all stored and displayed in the Omnisend cloud app. (confirmed)

## data_model
Everything persists in **Omnisend's own cloud database**, NOT in Shopify metaobjects/metafields or the theme (confirmed):
- **Contacts DB** (external): the contact record + per-channel subscription/consent + tags + custom properties + computed traits, keyed to Shopify customer. (confirmed)
- **Event/timeline store** (external): browse/cart/checkout/order + message-engagement events per contact; feeds real-time segments. (confirmed)
- **Segments** (external, computed): stored rule definitions; membership recomputed live. (confirmed)
- **Forms** (external definitions) rendered client-side via the theme app embed script; not stored as theme sections/blocks. (confirmed)
- **Campaigns, Automation workflows, Templates** (external): definitions + send logs + analytics. (confirmed)
- **Media/CDN** (external): uploaded images/logos for emails & forms hosted on Omnisend's CDN. (inferred)
- **Discount codes**: campaigns/forms can surface Shopify discount codes; codes are generated in/synced from Shopify. (inferred)
- **On Shopify side**: only the app connection, theme app embed toggle, checkout extension registration, and OAuth/webhook subscriptions. Essentially no merchant-configurable data lives in Shopify. (confirmed)

## visual_patterns
- **Layout archetypes** (storefront, form renderer only): centered **popup** modal (with dimming overlay), corner **flyout**, inline **embedded** signup box, full-page **landing page**, edge **teaser** tab, and the animated **Wheel of Fortune / spin-to-win** dial. Multi-step forms (email step → phone step → success step). (confirmed)
- **Component states**: default / focused field / **error** (per-field error color + message) / submitting / **success step** / already-subscribed message; countdown-timer live tick; teaser collapsed vs. popup expanded. (confirmed)
- **Motion/interaction**: exit-intent detection (cursor leave), scroll-depth and time-delay reveals, spin-wheel rotation animation, reappear-frequency throttling, redirect-on-submit. (confirmed)
- **Cloud-app (merchant) patterns**: drag-drop email/form builders, node-graph automation canvas (trigger → delay → split → send), rule-builder rows for segments, dashboard reporting charts. (confirmed)
- Overall aesthetic: clean, templated, on-brand-configurable; "Built for Shopify" performance/design compliance on the storefront embed. (confirmed)

## reviews_signal
**Praises** (confirmed):
1. **Affordability / value** — "the price tier is great for my small business," "pricing is insanely reasonable"; strong free tier.
2. **Ease of use** — "very easy to use," "intuitive," "hasn't been overwhelming"; drag-drop builders praised.
3. **Fast human support** — "human contact within a few minutes," issues "resolved quickly"; 24/7.
4. **Speed to value** — "created a discount campaign for our shop in seconds"; pre-built workflows/templates.
5. **Business results** — omnichannel (email+SMS+push in one) drives revenue; one merchant cites "millions of $ a year through Omnisend."

**Complaints** (confirmed):
1. **Account suspension for high unsubscribe rates** — "put through a long process just to reactivate."
2. **Slow support during reactivation/reviews** — "customer support has been very slow to respond," review process "slower and heavier than expected."
3. **Downgrade friction** — "unable to downgrade your subscription unless you contact their live chat."
4. **Contact-based billing surprises** — non-subscribers counted as billable (transactional/automation recipients inflate the bill). (confirmed as a recurring model complaint)
5. **Migration pain** — issues after migrating from other tools (e.g. "migrate over from Yotpo"), leading some to switch away.

## mapping_note
Omnisend maps onto our RecipeSpec vocabulary only at its THINNEST edge — the storefront **signup form** (a `theme.section` / theme-embed rule-driven popup with content/style/targeting/behavior knobs) and a checkout consent **`checkout.block`**. A single-module recipe could plausibly reproduce a spin-to-win popup or an inline signup box. Everything ELSE about Omnisend is beyond a single module. It exceeds a single-module recipe because:

1. **It's an off-Shopify hosted platform with an external contact + event database** — the product is a cloud CRM/messaging engine; the Shopify surfaces are just capture/tracking taps into it. A recipe emits a module spec; it has no external DB, no contact store, no message-send infrastructure.
2. **It runs a real automation/workflow rule engine with background jobs** — trigger → delay(minutes–months) → conditional split (up to 20) → A/B split → multichannel send, evaluated server-side over time. That is a durable, scheduled, stateful DAG engine, not a module.
3. **It has a live segmentation rule engine** — 11 filter categories, AND/OR filter groups, real-time recomputation over the event stream — a query/rules layer no single module owns.
4. **It performs external side-effects across channels** — sends transactional/marketing **email, SMS, and web push** (with per-channel consent/compliance, deliverability, SMS credits, billing). These are outbound network side-effects to third-party gateways, entirely outside a storefront module's remit.

In short: the popup is a module; the platform behind it (contact DB + event pipeline + segmentation engine + timed multichannel automation + outbound messaging) is a **cross-surface blueprint plus external data store, background job scheduler, rule engine, and side-effect layer** — well outside one RecipeSpec.
