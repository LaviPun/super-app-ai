# Appstle℠ Subscriptions App

> Status: ACTIVE, not deprecated/renamed. This is Appstle's flagship subscriptions product and is
> current as of research date (2026-07-03). No vendor rename/merge occurred (contrast with Bold
> Subscriptions, a common deprecation case in this category — Appstle is unaffected).

## identity
- **name**: Appstle℠ Subscriptions App — confirmed
- **vendor**: Appstle Inc. (Menlo Park, CA, US; also India-based team) — confirmed
- **category**: Subscriptions (under Shopify "Selling products" taxonomy) — confirmed
- **App Store URL**: https://apps.shopify.com/subscriptions-by-appstle — confirmed
- **rating**: 5.0 / 5.0 (App Store rounds up; ~4.9 weighted; 97% five-star) — confirmed
- **review count**: ~7,617 reviews (grew from 7,438 → 7,617 across sources; count is climbing) — confirmed
- **install signal**: ~31,889 live Shopify stores (StoreLeads); "Built for Shopify" badge; launched 2021-04-08 and cited as fastest-growing subscription app in Shopify history — confirmed
- **pricing model**: Freemium, tiered by subscription revenue processed/month, 14-day free trial on all paid tiers — confirmed
  - Free — $0 — up to $500/mo subscription revenue, pay-as-you-go, migration support, customer portal, email templates, analytics — confirmed
  - Starter — $10/mo ($96/yr) — up to $5,000/mo, manual subscription creation, loyalty features, weekly reports, SMS notifications — confirmed
  - Business — $30/mo ($288/yr) — up to $15,000/mo, build-a-box, bundling, customizable widgets, retention tools — confirmed
  - Business Premium — $100/mo ($960/yr) — up to $100,000/mo, bulk automation, 1-click checkout, custom email domain, dedicated success manager — confirmed
  - No per-transaction fee on subscription revenue — confirmed

## surfaces
Mapped to internal extension-type vocabulary. Appstle is fundamentally **multi-surface**; the
subscription contract is the shared state that every surface reads/writes.

- **theme.section** (confirmed) — Product-page subscription **widget** (theme app embed / app block): renders the
  "Subscribe & Save" vs "One-time purchase" selector, delivery-frequency chooser, discount/save badge, and
  tooltip. Also a **Cart Widget** and a **Home Page / Collection Page Widget** variant (add-to-subscription
  from listing/cart surfaces). Build-a-Box selection UI also renders as a storefront section.
- **customerAccount.blocks** (confirmed) — Customer Portal: a customer-account extension where subscribers
  self-manage contracts (pause, skip, swap, reschedule, edit qty/frequency/address/payment, order-now,
  cancel with a flow). NOTE: Appstle is migrating this to the **updated Customer Portal extension**
  (Shopify new customer accounts), action-required deadline **6 June 2026** — confirmed. Legacy version was
  a classic-account/theme-embedded portal; this is a live surface-model migration.
- **checkout.block / checkout.upsell** (confirmed) — Checkout extensions: mixed-cart checkout (subscription +
  one-time in one order) and post/at-checkout subscription messaging; "1-click checkout" on premium tier.
  (Exact checkout UI extension surface is (inferred) beyond "mixed cart" support.)
- **admin.block / admin.action** (confirmed) — Embedded Shopify Admin app: subscription plan builder,
  subscriber management ("Merchant Portal"), analytics dashboards, automations, dunning config, bulk actions.
  This is the primary merchant control plane.
- **pos.extension** (confirmed) — Shopify POS integration: sell/create subscriptions in-person via POS.
- **flow.automation** (confirmed) — Integrates with Shopify Flow; also ships its own internal automation
  engine (bulk automations, product swap automation, win-back/campaign scheduling) — confirmed. Appstle's
  own automations are richer than Flow triggers alone (background scheduled jobs, not just event hooks).
- **analytics.pixel** (confirmed, partial) — "Storefront analytics forwarding: send subscription widget events
  to tracking tools" (forwards widget events to GA/pixels); it forwards rather than owning a dedicated pixel
  extension, so this is an event-forwarding capability more than a classic web-pixel extension.
- **functions.discountRules** (inferred) — Subscribe-and-save / tiered discounts are applied via Shopify
  selling-plan pricing policies (native selling-plan discounts), not necessarily a custom Function; but
  build-a-box tiered discounts (by qty or cart value) behave like a discount-rules engine. Mark as
  selling-plan-native pricing, with Function-style behavior for box tiers — (inferred).
- **proxy.widget** (inferred) — App proxy likely backs headless/JS-API widget data and the magic-link portal
  entry; Appstle documents a JS API and headless integration — (inferred).
- Not used / not evidenced: functions.cartTransform, functions.deliveryCustomization,
  functions.paymentCustomization, postPurchase.offer (no post-purchase upsell page extension evidenced).

**How surfaces coordinate**: The **Shopify Subscription Contract** + **Selling Plan Group** are the shared
canonical state. The storefront widget writes intent (selling plan chosen) → Shopify creates a contract at
checkout → the Admin merchant portal and the customer-account portal both read/mutate that same contract →
background jobs (dunning, prepaid order generation, win-back) act on it on a schedule → Flow/automations and
analytics observe contract lifecycle events. A single subscriber's state is authored by the storefront,
edited by both customer and merchant, and driven forward by cron-like server jobs — no single surface owns it.

## functional_model
Core entities (concrete shapes; field types (inferred) from documented behavior):

- **SubscriptionPlan / SellingPlanGroup** = {
    planName (internal), frequencyName (customer-facing label), planDescription,
    billingType ∈ {payAsYouGo, prepaidOneTime, prepaidAutoRenew, prepaidSeparateOrders},
    frequencies[] (e.g. weekly/monthly/quarterly — billing+delivery interval pairs),
    discount { type ∈ {percentage, fixed, none}, value },
    trial { enabled, duration }, minBillingCycles, maxBillingCycles,
    recurringDay, cutoffDays, inventoryPolicy ∈ {onSale, onFulfilment},
    appliesTo (products[] / collections[]), customerTagsRequired[], customerTagsExcluded[]
  } — mostly confirmed
- **SubscriptionContract** (Shopify-native, Appstle-managed) = {
    customer_ref, sellingPlan_ref, lineItems[], billingPolicy, deliveryPolicy,
    nextBillingDate, status ∈ {active, paused, cancelled, expired}, paymentMethod_ref,
    deliveryAddress, orderHistory[]
  } — confirmed (Appstle explicitly manages Shopify subscription contracts + order history)
- **Box / Bundle** = {
    bundleType ∈ {fixedPrice, dynamicPrice}, enabled, boxName, parentProduct_ref (sets final price for fixed),
    childProducts[] / sourceCollections[], minProducts, maxProducts,
    tieredDiscounts[] { basis ∈ {quantity, cartValue}, threshold, discountValue },
    subscriptionPlan_ref, allowOneTime, redirectLocation ∈ {cart, checkout}
  } — confirmed (tiered discounts confirmed for dynamic-price boxes; fixed-price box uses parent product)
- **DunningProfile** = { retryCount, retrySchedule, failedPaymentEmail, updatePaymentMethodLink } — confirmed
- **CustomerPortalConfig** = { permissions{...toggles}, labels{...text}, magicLinkEnabled } — confirmed
- **Automation / Campaign** = { trigger, action (e.g. productSwap, winBack reactivation, targeted offer),
    schedule, audience } — confirmed (win-backs, campaigns, product-swap automation)
- Relationships: SellingPlanGroup 1→N frequencies; SellingPlanGroup applies to N products/collections;
  Customer 1→N SubscriptionContracts; Contract N→1 SellingPlan; Box composes N childProducts into 1 contract;
  DunningProfile & Automations operate globally over Contracts.

## settings_taxonomy
The five-heading merchant-facing control taxonomy. Most-important section.

### content (labels / text shown to shoppers & subscribers)
- Subscription option label (e.g. "Subscribe & Save") — text — confirmed
- One-time purchase label — text — confirmed
- Delivery / subscription frequency label — text — confirmed
- Frequency display names per interval (custom customer-facing name per frequency) — text — confirmed
- Discount / "save" badge text — text — confirmed (inferred exact key)
- Tooltip text — text — confirmed (widget tooltip is editable)
- Plan description shown to customers — textarea — confirmed
- Widget Labels (documented as 21 label articles) + Thank-You-Page labels + Customer-Portal labels
  (23 label articles) — large flat namespace of editable text keys — confirmed
- Email template content: subject/body/HTML per notification type (active, renewal, update, failed payment,
  cancellation, win-back) — text / HTML editor — confirmed

### style (visual / theming)
- Widget template selection (multiple prebuilt widget templates, previewable) — select[templates] — confirmed
- Frequency display mode: radio buttons vs dropdown — select/radio — confirmed
- Subscription option selected by default — toggle — confirmed
- Custom CSS (built-in editor for widget + portal look/feel) — text (CSS) — confirmed
- Email template branding: colors, logo/images, content styling — color / image / text — confirmed
- Customer portal "Theme Engine Settings" (portal visual theming) — style config — confirmed
- Widget colors / button styling — color (inferred exact fields; CSS-driven) — (inferred)

### targeting (who / what a plan applies to)
- Products the plan applies to — product-picker — confirmed
- Collections the plan applies to — collection-picker — confirmed
- Customer Tags Required (restrict plan to tagged customers) — tag-selector — confirmed
- Customer Tags Excluded — tag-selector — confirmed
- Restrict number of subscriptions per account — number — confirmed
- B2B vs B2C plan targeting — config — confirmed
- Build-a-Box source collections / child product set — collection-picker / product-picker(multi) — confirmed
- Disable one-time purchase option (force subscription) — toggle — confirmed

### behavior (rules / logic / lifecycle)
- Billing type — radio[payAsYouGo | prepaidOneTime | prepaidAutoRenew | prepaidSeparateOrders] — confirmed
- Billing frequency (unit + interval; billing & delivery tied unless prepaid-separate) — number + select — confirmed
- Delivery/fulfillment frequency (independent only for prepaid-separate) — number + select — confirmed
- Discount type — radio[percentage | fixed] — confirmed
- Discount value — number — confirmed
- Tiered discounts (build-a-box): basis by quantity or by cart value, threshold → discount — rule-builder — confirmed
- Free trial: enabled + duration — toggle + number — confirmed
- Min billing cycles / Max billing cycles (commitment + cap) — number — confirmed
- Custom recurring day (fixed monthly billing day) — number — confirmed
- Cut-off days (order deadline before renewal) — number — confirmed
- Inventory policy — radio[onSale | onFulfilment] — confirmed
- Minimum order value / Maximum number of orders — number — confirmed
- Dunning: retry count + retry schedule + auto-email on failure — number + schedule — confirmed
- Customer Portal permissions (each a toggle): allow cancel, allow pause/resume, allow skip, per-order skip,
  process next order now ("Order Now"), remove product, add/swap product, edit quantity, change frequency,
  reschedule (with time picker), change address, change payment, order notes, show loyalty, show past-orders
  history tab — toggle (each) — confirmed
- Customer Portal advanced rules: restrict which products are editable/swappable/available in portal — rule — confirmed
- Magic-link (password-free) portal login — toggle — confirmed
- Automations: bulk automation workflows, product-swap automation, auto-sync settings — workflow config — confirmed
- Win-back / reactivation campaigns + targeted subscriber campaigns — schedule + offer — confirmed
- Cancellation flow / churn "quick action" controls (gaming prevention) — flow config — confirmed
- Mixed-cart checkout (subscription + one-time together) — toggle — confirmed (inferred exact toggle)

### data (integrations, exports, notifications, plumbing)
- SMS notifications (Starter+) — toggle/integration — confirmed
- Email: custom HTML templates, custom email domain (Premium) — text / domain config — confirmed
- Webhooks (10 documented webhook articles for subscription events) — endpoint config — confirmed
- Storefront analytics forwarding (widget events → GA / tracking tools) — integration toggle — confirmed
- Third-party integrations: Klaviyo, Omnisend, Mailchimp, PostScript, Gorgias, Growave, Rebuy, Zapier,
  PageFly, Zapiet, Transcy/Langify (translations), bundle apps — per-integration config — confirmed
- Multi-language / translation support — config — confirmed
- JavaScript API (widget + cart-page) + headless integration — developer config — confirmed
- Analytics & Reports (revenue active/projected, top products, churn) + weekly reports — dashboard/export — confirmed

## data_model
- **Selling Plan Groups + Selling Plans** persisted in Shopify (native subscription primitive Appstle
  authors via Admin API) — confirmed.
- **Subscription Contracts + order history** are Shopify-native records Appstle reads/mutates; Appstle
  requests scopes over order history, contracts, fulfillment, shipping — confirmed.
- **Appstle-side database / infrastructure**: Appstle keeps its own dedicated storage/infra for plan config,
  portal config, labels, automations, dunning profiles, campaigns, analytics rollups, and box definitions
  (documented "dedicated storage and infrastructure"; plan/portal/label config clearly lives app-side, not
  purely in Shopify metafields) — confirmed app-side DB; exact schema (inferred).
- **Metafields**: selling-plan and product association plus widget config likely surfaced via metafields for
  theme rendering — (inferred).
- **Media/CDN**: email template images uploaded to Shopify CDN — confirmed.
- **Codes**: magic-link tokens (time-limited, single-use portal access) — confirmed. No coupon-code table
  evidenced (discounts are selling-plan pricing policies, not generated codes).
- **Background/scheduled state**: prepaid order generation, dunning retries, campaign/win-back schedules
  imply server-side job/queue state — confirmed behavior, (inferred) storage.

## visual_patterns
- **Layout archetypes**: (a) product-page purchase-option selector — radio group ("One-time" vs "Subscribe &
  save") with an expandable frequency chooser (radio or dropdown) and inline save/discount badge + tooltip;
  (b) build-a-box grid — product picker grid with running count (min/max) and live total (dynamic) or fixed
  price, add/remove per tile; (c) customer portal — card/list of subscriptions with per-contract action rows
  (pause, skip, swap, reschedule, edit, cancel) and a next-order date/timeline; (d) admin — plan builder form
  + subscriber data table + analytics dashboard cards.
- **Component states**: option selected/unselected, subscribe-default-on, discount-applied vs none,
  contract active/paused/skipped/cancelled/expired, box below-min (CTA disabled) / valid / at-max,
  payment-failed (dunning) state, prepaid vs pay-as-you-go rendering (hide "Order Now" for prepaid).
- **Motion/interaction**: live price recalculation as box items change; expand/collapse of frequency options;
  inline label swaps on toggle; magic-link passwordless entry (no form); rescheduling via date + time picker;
  quantity steppers. Largely form-driven, low-motion; emphasis on inline reactivity, not animation.

## reviews_signal
**Praises (top):**
1. Fast, hands-on, 24/7 live-chat support that ships custom solutions — the single most-cited strength — confirmed.
2. Powerful, flexible customer portal — subscribers can edit, add one-time items, and reschedule themselves — confirmed.
3. Build-Your-Own-Box / bundling flexibility fits many business models — confirmed.
4. Reliable with complex setups ("handles complex subscription setups without breaking") — confirmed.
5. Better value vs competitors (esp. Recharge) — pricing seen as fairer — confirmed.

**Complaints (top):**
1. Features moved behind higher tiers with minimal notice; legacy merchants feel functionality "disappeared
   overnight unless they upgrade" — confirmed (recurring gripe).
2. Analytics/email-report inaccuracy — dashboard/summary emails "always seemed to say 0 for all metrics" — confirmed.
3. Poor transparency around pricing/feature migrations affecting legacy accounts — confirmed.
4. Configuration depth → learning curve for complex setups; power comes with UI density — (inferred from
   "straightforward once set up" framing + support-dependence).

## mapping_note
Onto our constrained RecipeSpec vocabulary, Appstle maps only partially — it is a **platform**, not a single
module. A minimal slice (product-page subscribe-and-save widget with a fixed discount) fits a single
`theme.section` recipe with a selling-plan-backed pricing policy. But the real product **exceeds** a single
module in several structural ways:

1. **Requires a persistent, mutable data store + Shopify subscription-contract lifecycle** — plans, portal
   config, box definitions, dunning profiles, and campaigns live app-side and drive long-lived contracts;
   this is a stateful backend, not a rendered module.
2. **Cross-surface blueprint with shared state** — the same contract is authored on the storefront
   (theme.section), edited in the customer account (customerAccount.blocks), managed in admin
   (admin.block/action), and sold via POS. A recipe would need to emit a *coordinated set* of extensions that
   read/write one shared entity, not one surface.
3. **Background/scheduled jobs (cron-like side effects)** — prepaid order generation, dunning retries,
   win-back and campaign scheduling all run server-side on timers, independent of any page render. No
   single-module recipe expresses recurring background work.
4. **A rule/discount engine + external side-effects** — build-a-box tiered discounts (by qty or value),
   customer-tag targeting, and outbound integrations (Klaviyo/SMS/webhooks/analytics forwarding) are
   rule-driven and reach outside Shopify — beyond a declarative single-surface spec.

Net: treat Appstle as a **multi-surface, stateful, job-backed blueprint** in the gap analysis; a single
RecipeSpec captures at most its storefront widget veneer.
