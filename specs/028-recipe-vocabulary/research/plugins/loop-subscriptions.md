# Loop Subscriptions

> Vocabulary-study research record. Facts labeled **confirmed** (from App Store listing, help.loopwork.co, or reviews) or **(inferred)** (reasoned from the vendor's model, not directly stated). Compiled 2026-07-03.
> Not renamed/deprecated. Loop is an active, standalone, independent vendor (not a Bold app). No merge/deprecation caveat applies.

## identity
- **name**: Loop Subscriptions App — confirmed
- **vendor**: Loop Solutions Inc (brand "loopwork.co") — confirmed
- **category**: Subscriptions — confirmed
- **App Store URL**: https://apps.shopify.com/loop-subscriptions — confirmed
- **rating**: 5.0 / 5 — confirmed
- **review count**: 693 reviews (98% 5-star / 681 five-star, 6 four-star, 1 three-star, 5 one-star) — confirmed
- **install signal**: "2,400+ Shopify subscription brands"; "$4B+ subscription revenue processed"; "1,100+ migrations (400+ from Recharge)" per vendor marketing — confirmed (vendor-reported, not Shopify-verified install count)
- **pricing model**: Freemium + tiered SaaS + revenue share. Free (≤50 active subscriptions); Starter $99/mo (1.0% per transaction); Pro $399/mo (0.75% per transaction). 14-day trial on paid tiers. No per-order fee, only a % transaction fee. Enterprise tier exists (custom). — confirmed
- **launch date**: July 27, 2021 — confirmed

## surfaces
Mapped to internal extension-type allowlist. Loop is strongly **multi-surface**; the coordinating spine is a **subscription contract** persisted in Loop's backend, referenced by every surface.

- **theme.section** — confirmed. Product-page subscription **widget** (selling-plan selector: frequency, discount badge, strikethrough price, subscription-details popup). Installed as a **Shopify 2.0 App Block** (theme app extension) with manual/Liquid fallback for custom themes. Also the **Build-a-Box / bundle builder** UI renders on a product/landing page surface.
- **proxy.widget** — confirmed (app-proxy customer portal). A **standalone customer portal** served at a Loop-provided URL, entered via emailed **magic link** (48h token, 30-day session). This is the app-proxy-style hosted page equivalent, distinct from the native customer-account block below.
- **customerAccount.blocks** — confirmed. "Manage Subscription" entry point embedded in the Shopify **customer account** page; App Store lists "Customer accounts" as a supported Shopify extension surface.
- **checkout.upsell / checkout.block** — confirmed (partial). App Store lists "Checkout" as a supported extension surface; bundle "show bundle name on checkout" and one-click checkout links imply checkout-surface participation. Exact checkout UI extension scope is **(inferred)** — likely bundle/line-item presentation rather than a full upsell widget.
- **flow.automation** — confirmed. **Loop Flows** is a native When–If–Then rule/workflow engine (see functional_model). This is Loop's own engine, not Shopify Flow, though it can emit third-party app events (Klaviyo).
- **analytics.pixel** — (inferred). Loop tracks MRR/churn/LTV/retention and "one-click checkout links with tracking"; whether it registers a Shopify Web Pixel vs. server-side event capture is unconfirmed.
- **admin.block / admin.action** — (inferred). Loop is primarily a full embedded admin app (its own multi-section admin UI: Acquire / Retain / Bundles / Flows / Selling plans / Customer portal / Analytics) rather than injected admin blocks on native Shopify order/product pages. Native admin-block extensions are not evidenced.
- **NOT used**: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, postPurchase.offer, pos.extension — no evidence Loop ships Shopify Functions or POS extensions. Subscription discounting is implemented through **selling plans / discount codes**, not a Discounts Function. — (inferred)

**How surfaces coordinate**: The **subscription contract** (Loop-side, mirrored to Shopify Subscription Contract) is shared state. Product-page widget writes a selling-plan selection → creates the contract at checkout → the customer portal + cancellation flow + Loop Flows all read/mutate that same contract → dunning and billing attempts drive recurring orders → analytics aggregates over all contracts. A **cancellation flow** launched from the portal hands off to **offer/reason** logic that can mutate the contract (skip/pause/swap/discount) instead of cancelling. Flows react to contract lifecycle events (new sub, recurring order placed, payment failure) and can push actions back onto the contract or fire notifications.

## functional_model
Core entities (field lists are **confirmed** for named fields, **(inferred)** where marked):

- **selling_plan** = { name, subscription_type (one-time+sub / sub-only / prepaid / gift / membership / trial / bundle), billing_frequency (weekly|monthly|quarterly|annual + custom interval), delivery_frequency, discount { type: fixed_amount | percentage | set_price, value }, anchor_day (inferred), product_mappings[] }
- **subscription_contract** = { customer_ref, selling_plan_ref, line_items[], status (active|paused|cancelled|failed), next_order_date, billing_schedule, delivery_schedule, discounts[], custom_attributes[], streak/gamification_state (inferred), bundle_ref? }
- **bundle** = { type: preset_fixed | BYOB, internal_name, display_name, image, description, footer, bundle_size { mode: fixed | range, min, max }, category_groups[]{ name, min_per_category, max_per_category }, discount, checkout_mode: parent_product | child_products } — confirmed
- **cancellation_flow** = { benefits_page{ headings, descriptions }, reasons[]{ label, condition, recommended_action: skip|delay|pause|swap|discount, offer_ref }, offers[]{ type: discount|gift, value }, texts{...}, regulatory_settings{ ca_arl_override } } — confirmed
- **flow (Loop Flow)** = { triggers[] (When), conditions[] (If), actions[] (Then) } — confirmed
- **dunning_profile** = { retry_count (Starter: 15 retries), retry_schedule, dunning emails } — confirmed
- **portal_theme** = { layout (drag-drop components), styles{colors, custom_css}, custom_js, texts{localized}, published: bool } — confirmed
- **relationships**: customer 1—* subscription_contract; selling_plan 1—* subscription_contract; bundle 1—* subscription_contract; subscription_contract 1—* recurring_order → billing_attempt; flow *—* subscription_contract (event-driven).

## settings_taxonomy
The most important section. Actual merchant-facing controls, grouped. Types in brackets.

### content
- Plan selector title text [text] — e.g. "Frequency", "Select your delivery options" — confirmed
- Widget button text / plan names / plan descriptions [text] — confirmed
- Selling plan description display [toggle] — confirmed
- Bundle name (display) [text], Internal name [text], Description [text], Footer [text] — confirmed
- Cancellation flow **Texts** tab: headings, descriptions, button labels, offer texts [text, per-string] (Retain > Cancellation flows > Texts) — confirmed
- Benefits page copy (headings + descriptions) [text] — confirmed
- Customer portal **Texts**: messages, button labels, success notifications, full localization [text] — confirmed
- Multilingual / multi-language experience [toggle/config] (Pro) — confirmed
- Email notification content for admins + subscribers [text/template] — confirmed

### style
- Widget layout [select: radio group | button group | checkbox] — confirmed
- Frequency selector display [select: dropdown | buttons] — confirmed
- Background color / border color [color] — confirmed
- Border width / border radius [number] — confirmed
- Margins / padding [spacing number] — confirmed
- Button styles: color, hover state, rounded corners, vertical|horizontal layout [mixed + custom CSS] — confirmed
- Discount badge visibility [toggle] — confirmed
- Strikethrough pricing [toggle] — confirmed
- Custom CSS field (widget) [text/code] — confirmed
- Customer portal **Styles**: element colors (text, error blocks), custom CSS injection [color + code] — confirmed
- Portal **Layout**: drag-and-drop component arrangement on listing + details pages; custom sections with variable insertion — confirmed
- Portal **Custom JS** [code] — confirmed
- Portal themes: create multiple, one-click publish (seasonal/promo) [theme manager] (Pro) — confirmed

### targeting
- Product → selling-plan mapping [product-picker / rule] — confirmed
- Widget active/inactive per product page [toggle per product] — confirmed
- Template mapping: which product-page templates show the widget [select/multi-select] — confirmed
- "Hide bundle selling plans on individual product pages" [toggle] — confirmed
- Flow **If** conditions (targeting subscribers): plan type, order count, monetary value, discount presence, prepaid status, streak enrollment, acquisition date, shipping rate, custom attributes; product present/absent, collection membership, product count, weight, title, variant; customer total orders / spend / sub-order history / tags; bundle present/absent; country [rule-builder, multi-condition] — confirmed
- Cancellation reason conditions (which reason → which offer) [rule/condition] — confirmed
- Upsell/swap profiles: cohort-based product recommendations with granular discounting [rule + product-picker] — confirmed
- Bundle category groups with per-category min/max [rule/number] — confirmed

### behavior
- Subscription type [select: one-time+sub | sub-only | prepaid | gift | membership | trial | bundle-builder] — confirmed
- Billing frequency [select/number: weekly|monthly|quarterly|annual + custom] — confirmed
- Delivery frequency [select/number] — confirmed
- Discount type [select: fixed amount | percentage | set price] + value [number] — confirmed
- Default widget selection (sub vs one-time) [select] — confirmed
- Purchase option order [ordering control] — confirmed
- Subscription details popup [toggle] — confirmed
- Prepaid plan pricing display [toggle] — confirmed
- Storefront widgets master switch [toggle] — confirmed
- Bundle size mode [select: fixed | range] + min/max [number] — confirmed
- Bundle checkout experience [select: checkout with parent bundle product | checkout with child products] — confirmed
- Out-of-stock product handling in BYOB [select: show as disabled] — confirmed
- Show product description drawer / auto-open drawer / one card per variant [toggle] — confirmed
- Portal subscriber actions (each a [toggle] in Preferences): skip order (+ consecutive-skip limit [number]), place order now, delay order, reschedule order, gift order, edit/remove products, edit billing/delivery schedule, pause (+ configurable durations), create subscription, reactivate (+ recharge option), merge subscriptions, charge on resume, update/change payment method (+ failed-charge retry), update delivery address, change pickup location, change delivery method, apply discounts (multiple codes), add/edit order notes, show unlisted products — confirmed
- Portal order restrictions: minimum order value [number], minimum order weight [number], max orders per day [number], max quantity per item [number], scheduled-order display count [number] — confirmed
- Dunning: retry count (e.g. 15 retries) [number], retry schedule, dunning email cadence — confirmed
- Cancellation button behavior + California ARL override [toggle] — confirmed
- Flow **When** triggers [multi-select: new subscription | recurring order placed | products modified | discounts modified | order payment failure] — confirmed
- Flow **Then** actions [multi-select]: change plan, update shipping, add/remove discount, add trial, set next order date, change status, manage attributes; add/remove/swap product (one-time or recurring); add/remove customer tag; add/remove/split bundle; skip/delay/charge order; send email / portal banner / third-party event (Klaviyo) / reward text in order email — confirmed

### data
- Selling plans (create/manage/map) — confirmed
- Subscription analytics dashboard: MRR, churn, LTV, retention, growth & revenue — confirmed
- Customer alerts / email notifications config — confirmed
- User permissions & account logs (Pro) [role config + audit log] — confirmed
- Admin/Storefront APIs + webhooks (Pro): subscription contracts, orders, billing attempts, customers [API keys, webhook subscriptions] — confirmed
- Integrations config: 35+ apps (Klaviyo, Attentive, Postscript, Gorgias, Rebuy, Fondue, Smile, Stamped, Recart, Omnisend, Postpilot, Marsello, Glow) [connect/toggle] — confirmed

## data_model
What it persists and where:
- **Loop-side application DB** (external to Shopify): subscription contracts, selling-plan config, bundle definitions, cancellation-flow definitions + collected reasons/feedback, Loop Flow definitions, dunning/retry state, portal theme configs, analytics aggregates (MRR/churn/LTV), gamification/streak state, account logs. — (inferred, standard for this app class; API entity names confirmed)
- **Shopify-side**: Selling Plans + Selling Plan Groups (native), Shopify **Subscription Contracts** mirrored/created, discount codes, customer + order records, product/variant refs. Widget config stored as **theme app extension / app block settings** in the theme. — confirmed (extension surfaces confirmed; exact metafield/metaobject usage (inferred))
- **Media/CDN**: bundle images, portal theme assets → Shopify CDN or Loop CDN — (inferred)
- **Codes**: discount codes for cancellation offers / apply-discount actions; one-click checkout links with tracking tokens; magic-link portal tokens (48h). — confirmed
- **Webhooks**: outbound event stream for subscription lifecycle (contracts, orders, billing attempts, customers). — confirmed

## visual_patterns
- **Layout archetypes**: (1) inline product-page selling-plan selector card (radio/button/checkbox group + frequency chooser + price/strikethrough/badge); (2) full-page bundle/BYOB builder (category tabs → product grid → selection drawer → summary/checkout bar); (3) hosted customer portal (subscription list view → subscription detail view, drag-drop component layout); (4) multi-step cancellation modal/flow (benefits page → reason survey → reason-matched offer → confirm); (5) embedded admin with left-nav sections (Acquire/Retain/Bundles/Flows/Selling plans/Portal/Analytics) and a When–If–Then flow builder canvas. — confirmed / (inferred layout specifics)
- **Component states**: widget default-selected option, discount-badge on/off, strikethrough-vs-plain price, out-of-stock product "disabled" state in BYOB, subscription-details popup open/closed, drawer auto-open on first add, paused/active/failed contract badges, dunning-retry state. — confirmed
- **Motion/interaction**: drag-and-drop portal layout editor; drawer slide-in on product add; one-click theme publish; multi-step wizard progression in cancellation flow; magic-link passwordless entry; live style preview (inferred).

## reviews_signal
**Top praises** (defines up-to-the-mark):
1. Exceptional, personal 1-on-1 support / dedicated CSM — reviewers name individuals as "genuine partners." — confirmed
2. White-glove migration (esp. from Recharge) — team maps and validates every data piece, not just docs. — confirmed
3. Churn reduction via flexible cancellation flows + retention offers — "noticeable reduction in churn." — confirmed
4. Analytics dashboard depth — "incredible insight," helps spot revenue risk early. — confirmed
5. Scales reliably — "many thousands of active subscribers," "everything just works." — confirmed

**Top complaints** (failure modes):
1. Onboarding/migration can be cumbersome — subscribers "drop off" during provider migration. — confirmed
2. Premium price point — $99–$399/mo + % transaction fee is a real cost concern (mitigated by "worth it" framing). — confirmed
3. Depth = learning curve — the breadth of flows/portal/bundle settings implies configuration complexity for smaller merchants. — (inferred from feature surface; few explicit negative reviews given 98% 5-star)
4. Negative signal is sparse (5 one-star of 693) — hard to extract systematic failure modes from the public sample. — confirmed

## mapping_note
Onto our constrained **RecipeSpec** vocabulary:
- The **product-page subscription widget** maps cleanly to a single `theme.section` recipe: a control pack of style knobs (layout select, colors, borders, badges, texts) + selling-plan-driven content. This is the ONE piece a single-module recipe can genuinely represent.
- The **customer portal**, **cancellation flow**, **bundle/BYOB builder**, and **Loop Flows** each **exceed** a single-module recipe. They are stateful, multi-surface, backend-backed products, not render-once sections.

Where it exceeds a single-module recipe (for gap analysis):
1. **Persistent subscription-contract data store + recurring billing engine** — a subscription contract with lifecycle (active/paused/failed), next-order-date scheduling, and dunning/retry state. No single render-time recipe holds mutable per-customer state or a billing clock.
2. **Background job / scheduler + dunning** — recurring order generation, retry schedules (15 retries), scheduled skips/pauses, magic-link token expiry. Requires cron/queue workers, not a section.
3. **Rule/workflow engine (Loop Flows)** — a full When–If–Then automation engine with ~5 triggers, dozens of conditions, dozens of actions, event-driven over contracts. This is a rule-engine subsystem, not a knob.
4. **Cross-surface blueprint with shared state + external side-effects** — widget → checkout → hosted portal → cancellation flow → customer-account block all coordinate through one contract, and actions fire external side-effects (discount codes, emails, Klaviyo/third-party events, webhooks, API). Needs a coordinated multi-extension blueprint plus an external data store and outbound integration layer.
