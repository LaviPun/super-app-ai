# Recharge Subscriptions

> Vocabulary study for constrained AI module generation. Facts labeled **confirmed** or **(inferred)**. Sourced from the Shopify App Store listing, Recharge support/help center, and the Recharge Developer API reference.

**Deprecation note:** No rename/merge/deprecation. Recharge Subscriptions is the live, current listing at `apps.shopify.com/subscription-payments` (the URL slug is the legacy "subscription-payments" but the app is actively maintained; App Store name is "Recharge Subscriptions App"). **confirmed.** Note only that Recharge shipped a *new* "Subscription Widget" (flow-canvas based, Shadow-DOM, app-block) that supersedes the "Legacy Subscription Widget"; both still ship, and the vocabulary below reflects the current widget. **confirmed.**

## identity
- **name:** Recharge Subscriptions App — **confirmed**
- **vendor:** Recharge (recharge / getrecharge.com; formerly "ReCharge Payments") — **confirmed**
- **category:** Subscriptions (Selling products > Subscriptions) — **confirmed**
- **App Store URL:** https://apps.shopify.com/subscription-payments — **confirmed**
- **rating:** 4.8 / 5 — **confirmed** (88% 5★, 5% 4★, 1% 3★, 1% 2★, 5% 1★)
- **review count:** ~2,177 reviews (grew from ~2,116–2,149 across 2026 snapshots) — **confirmed**
- **install signal:** ~52,000 Shopify stores (StoreLeads); markets itself as powering 20,000+ merchants; launched Oct 14, 2014; "Built for Shopify" / meets Shopify's highest standards — **confirmed** (install count is a third-party estimate, so treat exact figure as (inferred))
- **pricing model:** Tiered SaaS + per-transaction fee. Entry $25/mo (first 50 subscribers, no txn fee), Starter $99/mo (1.49% + 19¢/txn), Plus $499/mo (1.34% + 19¢, scaled), plus Custom/Enterprise. 60-day free trial. Hard auto-upgrade cliff at 50 lifetime subscribers ($25→$99); cannot downgrade back. — **confirmed**

## surfaces
Recharge is emphatically **multi-surface**. Mapped to internal allowlist:

- **theme.section** — The **Subscription Widget** renders on the product page as a theme **app block** (OS 2.0), built in Recharge's "flow canvas," isolated in a **Shadow DOM**. Shows: Subscribe & Save vs One-time toggle, frequency selector, per-plan discount labels, plan name. This is the primary storefront surface. — **confirmed**
- **customerAccount.blocks** — The **Customer Portal** ("no-code portal": subscribers skip, swap, reschedule, edit, pause, cancel) plus a "Manage Subscriptions" link injected into Shopify customer accounts. Hosted portal + native-account entry point. — **confirmed**
- **checkout.block / checkout.upsell** — Checkout integration for subscription line items; requires **Checkout Extensibility** (without it, subscription orders mis-report as one-time in analytics). Recharge also does in-portal and cancellation-flow upsells (quantity upsell plans). — **confirmed** (exact checkout UI extension type is (inferred))
- **flow.automation** — Two flavors: (1) native **Shopify Flow** connector (listed integration), and (2) Recharge's own **Cancellation Prevention flows** and **Failed Payment Recovery / dunning** — an internal rule/automation engine with A/B test nodes, offer branches, fallback offers. This is a background-job automation engine, not a single UI block. — **confirmed**
- **pos.extension** — Listed integration with **Shopify POS**. — **confirmed** (depth (inferred))
- **analytics.pixel** — Retention Analytics with industry benchmarking; Subscription Widget Analytics; integrations with Triple Whale, Klaviyo, Attentive for event/data sync. Behaves like an analytics/event surface. — **confirmed** (whether it registers a Shopify Web Pixel specifically is (inferred))
- **admin.block / admin.action** — Merchant runs configuration primarily in Recharge's own **merchant portal** (embedded app), not Shopify-admin blocks. Product Subscription Plans, Customer Portal settings, Widget editor, Bundles, Retention flows all live there. — **confirmed**
- **Not used:** functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, proxy.widget, postPurchase.offer — Recharge predates and largely sidesteps Shopify Functions; discounting is applied via its own selling-plan/discount engine, not a Function. — **(inferred)**

**How surfaces COORDINATE (this is the crux):** All surfaces read/write one shared server-side subscription state hosted by Recharge (Subscription/Address/Charge/Customer objects), keyed to a Shopify customer + selling plan. The **product-page widget** creates the selling-plan selection → **checkout** persists it as a subscription contract → **customer portal** mutates the same Subscription object (skip/swap/reschedule/pause) → **cancellation-prevention flow** intercepts a cancel action on that object and can rewrite it (apply discount, delay next_charge, swap variant) → **dunning/failed-payment** background jobs retry the Charge → **analytics** aggregates across all of it. State handoff is via Recharge's backend + webhooks, not via Shopify metafields alone. It is a coordinated blueprint, not a widget.

## functional_model
Core entities (from Recharge Developer API + help center) — **confirmed** unless noted:

- **Customer** = { id, external_customer_id (Shopify), email, first/last name, has_valid_payment_method, subscriptions_active_count, subscriptions_total_count, has_many Address }
- **Address** = { id, customer_id, shipping fields, discount_id?, has_many Subscription } — subscriptions are grouped *by address*; all subscriptions on one address sharing a next_charge_date merge into one Charge.
- **Subscription** = { id, address_id, customer_id, product_id, variant_id, external_product_id, external_variant_id, product_title, variant_title, sku, quantity, price, status (active|cancelled|expired), next_charge_scheduled_at, order_interval_frequency, order_interval_unit (day|week|month), charge_interval_frequency, cancellation_reason, cancellation_reason_comments, properties[], has_many bundle_selections }
- **Charge** = { id, customer_id, address_id, status, scheduled_at, total, line_items[] (one per Subscription), has_many Orders (1 for pay-as-you-go, N for prepaid) } — the financial transaction, past or upcoming.
- **Onetime** = { id, address_id, product/variant, quantity, price, next_charge_scheduled_at } — non-recurring add-on riding on a scheduled charge.
- **ProductSubscriptionPlan / SellingPlan** = { plan_type (subscribe-and-save | prepaid), order_interval_frequency + unit, charge_interval_frequency, discount_type (percentage | fixed-price), discount_amount, plan_name (shown in widget), charge/cutoff schedule } — variant-level plans layer per-variant pricing on top.
- **Bundle** = { bundle_product, type (fixed-price | dynamically-priced), source Shopify collection(s) (≤250 products), quotas/min-max selections, has_many bundle_selections } — build-a-box.
- **CancellationPreventionFlow** = { cancellation_reason → offer node(s) (discount | skip | delay | swap | quantity-upsell), fallback_offer, A/B_test_node, offer time-limit } — retention rule graph.
- **Discount / Credit** = { code, type, value, applies_to } — including loyalty credits & referral credits. — **(inferred structure)**

Relationship shape: `Customer 1—N Address 1—N Subscription`; `Subscription N—1 SellingPlan`; `Subscription N—1 Charge` (merged by address+date); `Charge 1—N Order`; `Subscription 1—N bundle_selection` for boxes.

## settings_taxonomy
The actual merchant-facing controls, grouped. **confirmed** unless marked. (Types in brackets.)

### content
- **Widget "Subscribe & save" label** [text] — editable label — **confirmed**
- **Widget "One-time" label** [text] — **confirmed**
- **Delivery/frequency option labels** [text, per frequency] — e.g. "Deliver every 2 weeks" — **confirmed**
- **Plan name** [text] — per Product Subscription Plan; surfaces in widget dropdown, e.g. "Deliver monthly – 15% off" — **confirmed**
- **Cancellation reasons list** [repeatable text] — each reason maps to an offer CTA — **confirmed**
- **Retention offer copy / CTA text** [text] — per offer node — **confirmed**
- **Portal action labels & tooltips** [text] — **(inferred)**

### style
- **Widget colors / fonts** [color, font] — via widget editor — **confirmed**
- **Custom CSS** [code/text] — injected into widget root; Shadow-DOM means only exposed `part`-attribute components are styleable — **confirmed**
- **Widget template selection** [select] — choose/change widget template — **confirmed**
- **Portal theming** [color/CSS] — customer-portal branding — **(inferred)**

### targeting
- **Widget display condition** [select / rule] — show to all customers vs only when product uses a specific **product template**; trigger conditions to limit widget to specific pages — **confirmed**
- **Which products get plans** [product-picker] — assign Product Subscription Plans per product — **confirmed**
- **Variant-Level Plans** [toggle + per-variant config] — different plans per variant, enables dynamic pricing — **confirmed**
- **Bundle source collection(s)** [collection-picker, ≤250 products] — **confirmed**
- **A/B test node** [rule/branch] — split traffic across two widget/discount variants or two retention offer paths — **confirmed**
- **Offer eligibility / time-limit** [number: days] — gate monetary offers so customers can't re-claim — **confirmed**

### behavior
- **Subscription type** [select: one-time only | subscription only | one-time & subscription] — **confirmed**
- **Plan type** [select: subscribe-and-save | prepaid] — **confirmed**
- **Order interval frequency** [number] + **unit** [select: days | weeks | months] — **confirmed**
- **Charge interval frequency** [number] — decouples billing from shipping (prepaid) — **confirmed**
- **Discount** [select type: percentage | fixed-price] + [number amount] — per interval; fixed-price is an Early-Adopter option — **confirmed**
- **Dynamic pricing** [rule] — discount changes over successive orders — **confirmed**
- **Charge & cut-off schedule** [select day / schedule] — charge customers on a specific day — **confirmed**
- **Customer Portal — "Allow customers to…"** [multi-toggle group]: edit shipping address; edit product details (quantity, variant); reschedule/gift/skip upcoming orders; switch subscription→prepaid; change frequency; view plan entitlements — **confirmed**
- **Cross-sells & swaps in portal** [toggle: can add products / can swap products] (swap off by default) — **confirmed**
- **Cancellation & retention** [flow builder]: pause options ("show 3 pause durations before cancel") [toggle], per-reason incentive [select: discount | skip next charge | subscription delay | product swap | quantity upsell], first offer + **fallback offer** [ordered select] — **confirmed**
- **Failed Payment Recovery / dunning retry** [schedule config] — automated retries + win-back — **confirmed** (exact retry-cadence knobs (inferred))
- **Loyalty credits / referral program** [toggle + config] — **confirmed** (depth (inferred))

### data
- **Product/subscription metafields** [key-value] — e.g. `shipping_interval_frequency`, `discount_percentage` stored as metafields — **confirmed**
- **Analytics / benchmarking** [read-only config + integration keys] — Retention Analytics, industry benchmarks — **confirmed**
- **Integration connections** [connect/API keys]: Klaviyo, Attentive, Gorgias, Avalara, Stripe, Triple Whale, Shopify Flow/POS — **confirmed**
- **Storefront API / JS SDK access** [API credentials] — headless/custom portals — **confirmed**
- **Quick Action URLs** [generated URLs] — one-click skip/delay/swap/portal-access links for email/SMS — **confirmed**

## data_model
What it persists and where:
- **External DB (Recharge-hosted):** the source of truth. Customer, Address, Subscription, Charge, Onetime, SellingPlan, Bundle, bundle_selection, CancellationFlow, Discount/Credit records live in Recharge's backend, not in Shopify. — **confirmed**
- **Shopify side:** selling plans / selling-plan groups (subscription contracts), plus **product & subscription metafields** (`shipping_interval_frequency`, `discount_percentage`, etc.) mirror config into Shopify. Orders/Charges are reflected as Shopify orders. — **confirmed**
- **Metaobjects:** not the primary store (predates metaobjects); config is Recharge-DB + metafields. — **(inferred)**
- **Media/CDN:** Recharge serves the widget bundle and store JSON from its own CDN (front-end store info accessible from Recharge CDN). — **confirmed**
- **Codes:** discount codes / retention-offer codes generated and stored by Recharge; can override existing subscription discount. — **confirmed**
- **Webhooks:** emits charge/subscription/order lifecycle webhooks consumed by third-party automations. — **confirmed**

## visual_patterns
- **Layout archetypes:** (1) inline product-page card with a segmented **Subscribe & Save / One-time** radio/toggle, a frequency `<select>`, dynamic price + discount badge, and Add-to-Cart; (2) hosted **customer portal** — list of active subscriptions, per-item action rows (skip / swap / reschedule / edit / pause / cancel), upcoming-order schedule/calendar; (3) merchant **flow canvas** — node-graph editor (widget builder + cancellation flow builder with A/B branches). — **confirmed**
- **Component states:** subscription status (active / paused / cancelled / expired); charge (upcoming / processed / failed→retry); offer (shown / accepted / declined → fallback); widget (default / one-time-selected / subscription-selected). — **confirmed**
- **Motion/interaction:** frequency-select re-renders price live; skip/swap are optimistic in-portal actions; cancellation is a multi-step funnel (reason → offer → fallback → confirm); Shadow-DOM isolation so host theme CSS can't leak in; `part`-attribute hooks for controlled styling. — **confirmed**

## reviews_signal
**Praises (top):**
1. Human, expert customer support — real troubleshooting, screenshots/videos, not canned bots. — **confirmed**
2. Smooth migration/onboarding with a hands-on step-by-step plan (esp. off legacy platforms). — **confirmed**
3. Measurable retention wins — subscriptions up, cancellations down, failed payments down, win-backs up. — **confirmed**
4. Handles scale — hundreds/thousands of weekly subscriptions reliably. — **confirmed**
5. Easy for non-technical merchants to manage day-to-day. — **confirmed**

**Complaints (top):**
1. **Cost** — platform fee + per-transaction fee compounds; 4%+ of subscription revenue at ~$10K/mo. — **confirmed**
2. **50-subscriber cliff** — forced $25→$99 upgrade, no downgrade. — **confirmed**
3. **Subscriber-facing UX friction** — customers struggle to navigate their accounts; occasionally can't edit their own subscriptions; "glitchy." — **confirmed**
4. **Slow support on the Standard/lower tiers** (good support gated to Pro/Enterprise). — **confirmed**
5. **Lock-in / migrating away is hard**; one merchant reported renewal-success collapse and new decline codes post-migration with poor transparency. — **confirmed**

## mapping_note
Recharge maps loosely onto a single `RecipeSpec` only for its thinnest slice — the **product-page Subscription Widget** ≈ a `theme.section` module with content/style/targeting/behavior knobs (labels, colors, frequency options, discount, display condition). Everything else **exceeds a single-module recipe**:

- **Needs a persistent data store + entity model.** Subscription/Address/Charge/Onetime/Bundle records with lifecycle state — a stateful backend keyed to Shopify customers, not a stateless render. A recipe emits UI; this owns a database.
- **Cross-surface blueprint with shared state.** Product widget → checkout → customer-account portal → retention flow all mutate one shared Subscription object. That is a multi-surface *blueprint* (theme.section + customerAccount.blocks + checkout.block + flow.automation) coordinating via backend + webhooks, not one module.
- **Background jobs / recurring side-effects.** Scheduled charges, dunning retries, prepaid multi-order fulfillment, win-back campaigns — a cron/queue engine producing real financial side-effects. No single-render recipe can do this.
- **Rule engine.** The cancellation-prevention flow (reason → offer → fallback → A/B branch, time-limited eligibility) plus dynamic-pricing-over-time is a branching rule/decision graph, closer to `flow.automation` + a visual builder than to a settings form.
- **External side-effects & integrations.** Discount-code minting, third-party syncs (Klaviyo/Attentive/Avalara/Triple Whale), Storefront API/JS SDK — outbound effects beyond Shopify's own surfaces.
