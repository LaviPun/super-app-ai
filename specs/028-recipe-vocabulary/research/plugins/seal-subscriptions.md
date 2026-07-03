# Seal Subscriptions

> Status: ACTIVE, not deprecated/renamed. Listed under two categories ("Subscriptions – Selling Products" and "Loyalty and Rewards"). Built for Shopify badge. Vendor is Seal Subscriptions (self-published; not a Bold app). No merge/rename event found. (confirmed)

## identity
- **name**: Seal Subscriptions App — "Increase sales & retention with subscriptions & memberships!" (confirmed)
- **vendor**: Seal Subscriptions (self-published; Ljubljana, Slovenia listed as address) (confirmed). App Store lists a developer location field inconsistently; vendor operates sealsubscriptions.com. (inferred)
- **category**: Subscriptions (primary); also cross-listed in Loyalty and Rewards (confirmed)
- **App Store URL**: https://apps.shopify.com/seal-subscriptions (confirmed)
- **rating**: 4.9 / 5 (confirmed)
- **review count**: ~2,772 reviews (2,689 seen in an earlier index snapshot; grew to 2,772) (confirmed). Distribution: 93% 5-star, 5% 4-star, ~2% combined 1-3 star. (confirmed)
- **install signal**: ~33,504 Shopify stores (storeleads / listing signal) (confirmed); launched March 18, 2020 (confirmed)
- **pricing model**: Flat monthly fee by subscription-count tier, **0% transaction fee** on all plans (a core differentiator). Free (50 subs) → SUPERSALE $5.95/mo (100 subs) → RISING STAR $9.95/mo (250 subs) → LEGEND $24.95/mo (500 subs) → Custom (up to 150k+ subs). Annual billing saves 20%; paid tiers include 30-day free trial. (confirmed)

## surfaces
Seal is genuinely multi-surface; the widget and portal are its two visible storefront surfaces, plus admin. Mapped to internal extension-type vocabulary:

- **theme.section** (as theme app block / app embed + JS injection): the **subscription widget** on the product page (radio/segmented selector: one-time vs subscribe, interval picker, savings badge, crossed-out price). Injected two ways — as a theme app embed/block OR "dynamically inject subscription widget to theme" via JavaScript when auto-injection is off. Fires custom JS events e.g. `sealsubs:subscription_widget_created`. (confirmed)
- **customerAccount.blocks** (+ hosted magic-link portal): the **customer portal** where subscribers edit/pause/skip/cancel. Reachable two ways — (a) via the account menu "subscriptions list" inside the shop, and (b) a **passwordless magic link** hosted page emailed to the customer. This is the coordination point: the same subscription entity is edited from either entry. (confirmed)
- **admin.block / admin.action**: full embedded admin app — subscriptions list, subscription rules, dashboard/analytics, payment calendar, inventory forecast, bulk actions (reschedule billing), notification editor, translations. (confirmed)
- **pos.extension**: POS listed as a supported surface (create/attach subscriptions in POS). (confirmed at listing level; exact POS UI unconfirmed) (inferred depth)
- **analytics.pixel** (indirect): Google Analytics tracking ID field + toggle, and Klaviyo/Attentive event data (with magic link injected into Klaviyo payload). Not a first-party Web Pixel extension per se; event data pushed to third parties. (confirmed for the integrations; "pixel extension" classification is inferred)
- **flow.automation** (internal engine, not Shopify Flow): product swaps, automated interval changes, loyalty-discount tiers, dunning/retry — all run on Seal's own scheduler/rule engine, NOT via `flow.automation` triggers exposed to merchants. (confirmed the behavior; it is app-internal jobs, not Shopify Flow)

**NOT used**: `functions.cartTransform`, `functions.discountRules`, `functions.deliveryCustomization`, `functions.paymentCustomization`, `checkout.upsell`, `checkout.block`, `postPurchase.offer`. Seal relies on **native Shopify selling plans** for auto-charging subs (so the discount/interval flows through native checkout without a Function), and on **email + hosted checkout links** for recurring-invoice subs. It does not inject checkout UI extensions. (confirmed)

**Cross-surface coordination**: The subscription is the shared-state spine. Widget (product page) *creates* a subscription via a selling plan → native checkout confirms it → subscription row is owned by Seal's backend → customer portal (account or magic link) *mutates* it (skip/pause/swap/address) → Seal's scheduler re-derives next charge, recalculates delivery cost, and fires notifications → admin surfaces reflect the same row. Handoff is via the persisted subscription record + Shopify order/selling-plan association, not shared front-end state.

## functional_model
Core entities and relationships (confirmed unless noted):

- **subscription_rule** = { name, plan_selector_label, mode(auto_charging | recurring_invoice), product_refs[] (or "all products"), selling_plan_ref, billing_interval(daily|weekly|monthly|yearly) + count, min_payments, max_payments, preferred_billing_day, subscription_discount_pct, loyalty_discount(after_N_payments, pct), is_prepaid(bool)+prepaid_multiple, fixed_schedule(cron-like: match intervals + cutoff), offer_one_time(bool) }. A rule is the *template*; it maps to a Shopify **selling plan / selling plan group**.
- **subscription** (a subscriber's instance) = { status(active|paused|cancelled), rule_ref, selling_plan_ref, line_items[{product_ref, variant, qty, price}], billing_interval, initial_order_date, next_billing_date, payment_count, discount_applied, shipping_cost, shipping_address, customer_ref, payment_method_ref, tags[] }.
- **customer/subscriber** = { email, payment_method(vaulted via Shopify Payments / Authorize.net / Shop Pay / PayPal Express), subscription_refs[], custom_tags[](active/inactive subscriber tags) }.
- **order** = { type(initial | subsequent), subscription_ref, line_items[], pricing, status(paid|failed|skipped|pending), tags[] }.
- **notification/email template** = { audience(customer|admin), event(new_sub|payment_failed|upcoming_renewal|cancellation|edit_alert|out_of_stock), html_body, enabled }.
- **automation** = { trigger(stock_event | payment_count | product_purchased | date_range), action(add/remove/swap product | change interval | apply loyalty discount), scope(all subs | rule-filtered) }.

Relationships: rule 1→N subscriptions; subscription 1→N orders; subscription N→1 customer; rule N↔M products; automation applies across subscriptions by filter.

## settings_taxonomy
The deepest section. Actual merchant-facing controls grouped by our five headings. (All confirmed from the vendor manual unless marked.)

### content
- Plan name — text
- Plan selector label (widget) — text
- Products to connect to rule — product-picker (multi) OR "all products" toggle
- Notification/email templates (new subscription, payment failure, upcoming renewal reminder, cancellation confirmation, admin edit alert, admin payment-failure alert, out-of-stock alert) — rich-text/HTML editor each, with enable toggle
- Translations — text (every customer-portal + widget string is editable; 18+ languages incl. AR/HE RTL)
- Customer/order tags: active-subscriber tag, inactive-subscriber tag, new-subscription-order tag, subsequent-order tag — text each
- "Show one-time purchase option above subscription options" — toggle (content ordering)

### style
- Widget design preset — select ["Default", "Arctic Seal"]
- Widget text color — color
- Interval-selector border color — color
- Interval-selector background color — color
- Interval-selector text color — color
- Price text color — color
- Selected-option border color (recurring-invoice widget) — color
- Discount-description text color — color
- Details text color — color
- "Show savings badge" — toggle
- "Show original crossed-out price" — toggle
- "Use compare-at price as original price" — toggle
- Portal background color / button color / text color / back-button color — color each
- "Show back button" (portal) — toggle
- Custom CSS for widget — textarea
- Custom CSS for customer portal — textarea

### targeting
- Product picker per rule (which products get the widget/plan) — product-picker
- "Hide widget if only one option available" — toggle
- "Hide interval selector if only one interval available" — toggle
- "Show interval as plain text if only one available" — toggle
- Exclude widget on URLs — text (list of paths)
- Portal access method — select [magic link via email, account menu, both]
- Default selected option — select [subscription | one-time]
- Preferred billing day — select (day-of-week / day-of-month)
- Fixed schedules — rule-builder (interval matching + cutoff periods; e.g. magazine issue dates)

### behavior
- Billing interval — select [daily, weekly, monthly, yearly] + count
- Min payments required — number
- Max payments — number
- Subscription discount — number (percent)
- Loyalty discount — number (after N payments) + number (percent)
- "This is a pre-paid selling plan" — toggle; prepaid interval multiple — number
- Recurring-invoice: subscription-vs-one-time offering — select [subscription only | both | default one]; invoice interval — select; invoice send day — select; discount application — select [initial+subsequent | subsequent only]
- Dunning: retry attempts — number; delay between retries — number + time-unit
- Auto-charging price propagation: "Automatically propagate price changes" — toggle; "Apply subscription discounts on price propagation" — toggle; "Match products by SKU and variant IDs" — toggle
- Recurring-invoice pricing: price source — select [newest prices | keep initial prices]; "Always bypass inventory" — toggle; "Keep initial discount in recurring orders" — toggle; "Apply subscription discounts on initial orders" — toggle
- Shipping recalculation triggers (7 toggles): after subscription creation / on product edit / on address change / after product swap / after shipping-profile change / "always set shipping FREE on updates" / "update only if new cost is higher"
- Delivery profiles — rule-builder (assign free/paid shipping by interval; min order value)
- Customer portal permission toggles: allow add/remove products, allow interval change, allow email change, allow address change, allow pause, allow cancellation, allow skip upcoming payments — toggle each
- Custom cancellation flow (LEGEND) — flow/reason config (retention) — (inferred exact UI)
- Product swaps / automated interval changes / loyalty tiers — rule-builder (trigger → action → scope)
- "Dynamically inject widget to theme" — toggle
- "Auto-delete cancelled subscriptions after 7 days" — toggle
- "Connect subscriptions with same email" — toggle
- Date/time format — select
- Order-status-page: "show subscription box with link" — toggle; "show resend email option" — toggle

### data
- Google Analytics tracking ID — text + enable toggle
- Klaviyo API integration — toggle; "Include magic link in Klaviyo data" — toggle
- Attentive integration — toggle (inferred; listed integration)
- Gorgias integration — toggle (read-only subscription data in support tickets)
- Bundler bundle-discount application in portal — toggle
- Full REST API + webhooks access — (developer surface, all plans)
- Quick Checkout Wizard / 1-click checkout links — generator (produces direct checkout URLs for auto-charging selling plans)
- Bulk actions: reschedule billing attempts — date-picker (bulk) + new-date select
- Export/analytics: payment calendar (filter by status), inventory forecast 7/30/60 days — table views

## data_model
What it persists and where (confirmed unless noted):
- **Subscriptions, subscription rules, subscribers, orders, automations, notification templates, translations** — persisted in **Seal's own external database** (app backend, not Shopify metafields as the system of record). (inferred that it is Seal's DB; strongly implied — magic-link portal, scheduler, analytics all require server-side state)
- **Selling plans / selling plan groups** — created in **Shopify** (native selling-plan objects) so auto-charging subs flow through native checkout and appear on orders. This is the Shopify-side mirror of a Seal rule. (confirmed via "selling plan" language + payment-gateway requirement)
- **Payment methods** — vaulted by the **payment gateway** (Shopify Payments / Authorize.net / Shop Pay / PayPal Express), not by Seal. (confirmed)
- **Customer & order tags** — written back to Shopify customer/order records. (confirmed)
- **Magic-link tokens** — issued/stored by Seal to grant passwordless portal access. (confirmed behavior; storage inferred)
- **Emails** — sent from Seal's mail service; white-label custom email domain supported. (confirmed)
- **No metaobject/CDN media dependency** surfaced; widget assets are app-served JS/CSS. (inferred)

## visual_patterns
- **Product-page widget archetype**: vertical stack of selectable options (one-time vs subscribe), each a card/radio row; interval dropdown or segmented control appears when a subscribe option is selected; "Save X%" savings badge; original price shown struck-through next to discounted price. Two presets ("Default", "Arctic Seal"); heavily color-tokenized (6+ color knobs) + custom CSS escape hatch. (confirmed)
- **Component states**: option selected/unselected (border-color change), single-option collapse (hide selector), one-time-above-subscribe ordering, price-update-on-select. (confirmed)
- **Customer portal archetype**: list of subscriptions → detail view with edit affordances (pause, skip, cancel, swap products, change address/interval), back button; themeable via color tokens + CSS; RTL-aware. (confirmed)
- **Admin archetype**: dashboard KPIs (total/active/paused/cancelled), payment calendar (status-filtered grid), inventory forecast table, subscription list + bulk-action bar, WYSIWYG email editors, translations table. (confirmed)
- **Motion/interaction**: lightweight — selection state transitions, dynamic price swap on interval change, JS-event-driven widget lifecycle (`sealsubs:subscription_widget_created`). No heavy animation surfaced. (confirmed/inferred)

## reviews_signal
**Top praises** (confirmed):
1. Fast, easy setup — subscription live in under ~30 minutes; intuitive UI.
2. 0% transaction fee / flat pricing — explicitly preferred over percentage-taking competitors (Recharge/Bold).
3. Generous free plan (50 subs) — great for small/startup merchants.
4. Responsive, engaged support with good tutorials.
5. Reliable day-to-day operation; "works exactly as expected."

**Top complaints** (confirmed from aggregators / 1-star reviews):
1. **Renewal/charge failures** — merchants report "half of subscriptions don't go through each month," charges silently failing; blame ping-pongs between Seal and Shopify.
2. **Charged-after-cancellation & billing bugs** — customers billed post-cancel; automation/renewal edge-case failures — the most damaging since it undercuts the core promise.
3. **Migration pain** — importing from Stripe/other apps leaves charges still running in the old processor (double-charge / orphaned subs).
4. **Functionality gaps** — no bulk editing in places, weak inventory management, some subscription models unsupported (drives churn/migration away).
5. **Customer-portal edit limitations** + support reply *quality* (fast but shallow, many round-trips) despite overall support praise.

## mapping_note
Maps onto a RecipeSpec only in its thinnest slice — the product-page **subscription widget** is a legitimate single `theme.section`/theme-app-block module with a rich but bounded settings schema (content/style/targeting knobs above translate almost 1:1 to a control pack). Everything else exceeds a single-module recipe:

- **Needs a persistent external data store + system of record**: subscriptions, rules, subscribers, orders, tokens, templates all live server-side. A one-shot recipe emitting theme code cannot own this state.
- **Needs native Shopify selling-plan provisioning**: creating selling plans / selling-plan groups is an Admin-API side-effect, not a theme artifact — cross-surface (widget → checkout → orders) coordination is mandatory.
- **Needs a background scheduler / rule engine (recurring jobs)**: next-charge computation, dunning retries, product swaps, interval changes, fixed schedules, loyalty tiers, delivery-cost recalculation, auto-delete — all are cron/queue-driven side-effects with retries, not declarative module config.
- **Is an inherent cross-surface blueprint**: widget (theme) + customer portal (customer account + hosted magic-link page) + admin app + POS + tag write-back + email/CDN — these must share the subscription entity. This is a coordinated set of modules with shared state and handoff, not one recipe.
- **External side-effects**: transactional email (white-label domain), magic-link token issuance, GA/Klaviyo/Attentive/Gorgias event push, payment-gateway vaulting.
