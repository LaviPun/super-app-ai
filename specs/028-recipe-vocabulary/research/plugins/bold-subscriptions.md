# Bold Subscriptions

> Status note: The app is **active, not deprecated or renamed** (confirmed). The current live product is "Bold Subscriptions App" (a.k.a. "Subscriptions for Shopify Checkout"), a rebuilt v2/v3 that runs on Shopify's **native checkout** and OS 2.0 app blocks. There was a disruptive forced migration/**account merge** from Bold Subscriptions V1 → the current checkout-native version (confirmed via reviews); V1 relied on Bold's older cart-replacement flow. This record studies the current version. It is a *separate* product from Bold Memberships & Loyalty (same vendor) and is unrelated to Recharge (a competitor, no merger — confirmed).

## identity
- **name**: Bold Subscriptions App (help-center product name: "Subscriptions for Shopify Checkout") — confirmed
- **vendor**: Bold (Bold Commerce) — confirmed
- **category**: Subscriptions / "Selling products" (bold vendor cluster) — confirmed
- **App Store URL**: https://apps.shopify.com/bold-subscriptions — confirmed
- **rating**: 4.0 / 5 (72% 5-star, 13% 1-star) — confirmed
- **review count**: 369 reviews — confirmed
- **install signal**: ~6,779 live installs per StoreLeads; skews Food & Drink (31%), Beauty & Fitness (15%), Health (15%) — confirmed (aggregator, approximate)
- **pricing model**: Tiered SaaS + revenue share. Launch $24.99/mo +2% of subscription revenue; Grow $49.99/mo +1%; Scale $74.99/mo +0.9%. 30-day free trial. Transaction fee on top of Shopify's own fees is a notable cost driver — confirmed

## surfaces
Bold is a **multi-surface, stateful platform**, not a single widget. Mapped to our allowlist:

- **theme.section** (as an OS 2.0 **app block**, closest allowlist match) — confirmed. The **Subscription Widget app block** renders on the product page inside "Product information," letting the shopper choose one-time vs subscribe-and-save and pick a delivery frequency. Also an **Express Add-ons** widget (add a product to an *existing* subscription in one click from the product page) and a **cart-page** display of subscription properties/discounts. Vintage themes get the same via manual Liquid snippet insertion.
- **proxy.widget** (closest match for the hosted **Customer Portal**) — confirmed. A Bold-hosted account portal (embedded in the storefront customer account area or reachable via passwordless magic-link) where subscribers self-manage. This is served/backed by Bold's platform, not native Shopify pages — hence "proxy" semantics.
- **customerAccount.blocks** — (inferred). Portal is surfaced through the storefront account; can *replace* the native storefront account login with a passwordless "manage subscription" page (confirmed as a toggle). Whether it's a true Shopify customer-account UI extension vs Bold-hosted embed is unconfirmed; treat as proxy.widget + customerAccount.blocks hybrid.
- **checkout.upsell** — confirmed. "Subscription upsells at checkout" (a Maximizer). Uses Shopify's native checkout, so this is a checkout UI extension surface.
- **flow.automation** — confirmed. Documented "Shopify Flow & Subscriptions" integration (subscription lifecycle events as Flow triggers/actions).
- **analytics.pixel** — (inferred). Dashboard analytics/reports exist; whether a Web Pixel is registered is unconfirmed.
- **admin (embedded app, no single allowlist type)** — confirmed. Full embedded admin app: subscription list, per-subscription editor, subscription-group config, settings (portal, dunning, notifications, shipping, integrations), reports. This is the app's own admin, broader than `admin.block`/`admin.action`.
- **NOT used**: Shopify Functions (cartTransform/discountRules/deliveryCustomization/paymentCustomization), postPurchase.offer, pos.extension, checkout.block — no evidence. Discounts are computed by Bold's own engine and passed into the order, not via a Discount Function (confirmed: "does not use Shopify's native selling plans").

**Coordination**: The four surfaces share one server-side subscription record as source of truth. Product-page widget selection → writes a subscription line into Shopify's native checkout → checkout completes → Bold creates/owns the recurring subscription in its own DB → Customer Portal reads/writes that record → Flow events fire on lifecycle changes → dunning/notification jobs run on schedule against the same record. State handoff is: **Shopify owns the initial order + payment vault + product catalog; Bold owns the recurring schedule, portal state, discount tiers, and dunning state.**

## functional_model
Core entities (field lists are (inferred) from documented behavior unless noted):

- **subscription** = { id, customer_ref, status (active | paused | cancelled | expired), next_order_date, frequency_ref, subscription_group_ref, line_items[], shipping_address, billing/payment_ref, discount_ref?, prepaid_state?, cancellation_reason? } — status set + next_order_date + cancellation_reason confirmed
- **subscription_group** = { id, products[] (product_refs), frequencies[] (interval options), discount_policy (subscribe-and-save % or dynamic tiers), type (recurring | prepaid | convertible), swap_pool (products swappable within group) } — confirmed as the central config object; "changes apply prospectively to existing subscribers"
- **frequency / interval** = { every_n, unit (day | week | month | year) } e.g. "every 6 weeks", "every 2 months" — confirmed; also "order-based" vs "fixed-date" billing cadence — confirmed
- **subscription_line_item** = { product_ref, variant_ref, quantity, price, recurring_or_next_order_only } — confirmed (add-to-recurring vs add-to-next-order distinction)
- **dynamic_discount** = { tiers[]: { after_n_orders, discount_value } } — a discount that auto-changes after N orders — confirmed
- **prepaid_state** = { shipments_prepaid, shipments_remaining, renewal_method } — confirmed ("change prepaid renewal method")
- **queued_order / upcoming_order** = { subscription_ref, scheduled_date, line_items_snapshot, skipped: bool } — confirmed (skip / recover shipment, "order now")
- **dunning_state** = { retry_attempts_made, max_retries (1–15), days_between_retries, terminal_action (pause | cancel) } — confirmed
- **payment_method** = vaulted in Shopify (native checkout) — confirmed
- **cancellation_reason** = enum captured at cancel time, exportable — confirmed

Relationships: customer 1—N subscription; subscription N—1 subscription_group; subscription 1—N line_item; subscription 1—N upcoming_order; subscription 1—1 dunning_state; subscription_group 1—N frequency and 1—1 discount_policy.

## settings_taxonomy

### content
- Notification/email templates: order confirmation, upcoming-order reminder, cancellation, failed-payment/dunning — **text/template editor with merge fields** — confirmed
- Widget language/label fields (Subscription Widget app block **Language Settings**): editable text for the subscribe-and-save labels, frequency labels, one-time vs subscription copy — **text[]** — confirmed the section exists; individual label names not fully enumerated in public docs (partial)
- Cancellation-reason list (reasons offered to customer at cancel) — **text[] / list** — (inferred from exportable cancellation reasons)
- Customer Portal copy/translations — **text + translation strings** (advanced/CSS-level) — confirmed

### style
- **Primary Color** — color (styles the "Subscribe and Save" section + delivery-frequency checkbox) — confirmed
- **Secondary Color** — color (subscription frequency text + highlight) — confirmed
- **Background Color** — color (whole widget; text auto-inverts to white on dark) — confirmed
- **Border Radius** — number/slider (corner roundness) — confirmed
- Widget **placement** — drag-and-drop position within Product Information — confirmed
- Customer Portal appearance — **custom CSS** (advanced) — confirmed

### targeting
- **Subscription group → products**: which products/variants are subscribable — **product-picker (multi)** — confirmed
- **Frequencies per group**: allowed intervals (every N day/week/month/year, order-based or fixed-date) — **rule-builder / interval list** — confirmed
- **Swap pool**: products a subscriber may swap between within a group — **product-picker** — confirmed
- **Fixed shipping rates** targeting (which subscriptions get fixed vs Shopify-computed rates) — **rule / rate table** — confirmed
- **Upsell targeting**: which products offered as checkout / portal / email upsells — **product-picker** — confirmed

### behavior
- **Subscribe-and-save discount**: fixed % or amount per group — **number + select(%/amount)** — confirmed
- **Dynamic Discounts**: tiered discount that changes after N orders — **rule-builder (after_n_orders → value tiers)** — confirmed
- **Prepaid**: enable prepaid, number of shipments prepaid, renewal method after prepaid ends — **toggle + number + select** — confirmed
- **Convertible subscriptions**: allow convert between subscription/one-time — **toggle** — confirmed
- **Default to subscribe**: preselect the subscribe option in widget — **toggle** — confirmed
- **Dunning Management → Retry attempts**: max 1–15 — **select[1..15]** — confirmed
- **Dunning → Days before retrying** — **select(number of days)** — confirmed
- **Dunning terminal action**: pause vs cancel after final failed retry — **select** — confirmed
- **Delay first subscription payment** — **toggle/number** — confirmed
- **Customer Portal permissions** (each a toggle) — confirmed:
  - Pause/resume subscriptions
  - Change next order date
  - Cancel subscriptions
  - Change prepaid renewal method
  - Change order frequency
  - Create an additional order ("order immediately")
  - Add products to existing subscriptions
  - Passwordless login access
  - Replace storefront account login with passwordless manage-subscription page
  - (default-on capabilities: modify quantity, update shipping address, edit customer info, update payment/billing address, apply/remove discount code, swap products, reactivate cancelled)

### data
- **Integrations / Integration Hub**: Klaviyo, Zapier, PayPal Express, Authorize.net, Shopify Flow — **connection toggles/keys** — confirmed
- **API access**: programmatic subscription API — **API keys** — confirmed
- **Customer/subscription export**: filter by group, status, cancellation reason — **export builder** — confirmed
- **Bulk Updates**: bulk price change & bulk product swap across subscribers — **bulk-action tool** — confirmed
- **Reports/dashboard**: analytics, reports, activity logs — **read surfaces** — confirmed

## data_model
- **External Bold platform DB (primary source of truth for recurring state)**: subscriptions, subscription_groups, frequencies, upcoming/queued orders, dynamic-discount tiers, dunning state, cancellation reasons, portal permissions, activity logs. Confirmed — Bold explicitly does **not** use Shopify native selling plans; recurring scheduling lives on Bold's side.
- **Shopify (native)**: product catalog, the *initial* order + each generated recurring order, fulfillment, and the **vaulted payment method** (via native checkout). Confirmed.
- **Theme**: OS 2.0 app-block settings stored in the theme/template JSON; vintage themes store a Liquid snippet. Confirmed.
- **Storefront JS**: `window.BOLD.subscriptions` object exposes shop data + helper methods; the "BS JS" library injects the widget, cart line-item subscription properties, and cart-page discount display. Confirmed.
- **CDN/media**: none app-specific of note (uses Shopify product media). (inferred)
- **Codes**: works with Shopify discount codes (apply/remove in portal) in addition to its own subscribe-and-save engine. Confirmed.

## visual_patterns
- **Product-page widget archetype**: a radio/checkbox pair — "One-time purchase" vs "Subscribe & Save (X% off)" — plus a frequency selector (dropdown), with the subscribe option optionally preselected. Primary/secondary color theming, rounded corners. Confirmed.
- **Express Add-ons**: one-click "add to your subscription" affordance on PDP. Confirmed.
- **Cart display**: subscription properties + discount shown per line item. Confirmed.
- **Customer Portal archetype**: list of active subscriptions → detail view with action buttons (Skip, Pause, Change date, Swap, Add product, Edit quantity, Update payment/address, Cancel, Reactivate). Passwordless magic-link entry pattern. Confirmed.
- **Component states**: subscription status chips (active / paused / cancelled / expired); upcoming-order states (scheduled / skipped / recovered); dunning states (retrying / failed / paused-after-dunning). Confirmed conceptually.
- **Admin archetype**: data table of subscribers + faceted filters (group, status, reason) → per-subscription editor with the same action set as the portal plus "Log in to customer portal" (impersonation) and "Order now (within 60 min)." Confirmed.
- **Motion/interaction**: standard form-driven CRUD; drag-and-drop widget placement in theme editor; no notable custom motion documented. (inferred)

## reviews_signal
**Praises** (confirmed from App Store reviews):
1. Exceptional, hands-on customer support (specific reps named, e.g. "Daniel") and free white-glove migration.
2. Solid core subscribe-and-save / recurring-revenue management; does the job reliably for years (3–5 yr tenured merchants).
3. User-friendly setup and "seamless Shopify integration" now that it's checkout-native.
4. Breadth of features (prepaid, dynamic discounts, dunning, bulk updates, portal permissions).

**Complaints** (confirmed):
1. **Forced V1→checkout account merge** was "stressful and confusing," poorly communicated, with deactivation threats.
2. **Billing errors**: a merchant reports being "double charged for nearly 3 yrs" post-merge, only partially refunded — trust hit from the added transaction fee + billing bugs.
3. **Support responsiveness is inconsistent** — despite praise elsewhere, several report "no one ever gets back to you," week-long silence.
4. **Stability incidents**: an app update reportedly "took down my shop for 48 hours," with refund refused.
5. **Feature gaps**: cannot easily create a subscription *for* a customer from scratch; poor discount visibility on receipts.

## mapping_note
Bold Subscriptions maps only *partially* onto a single constrained RecipeSpec. The storefront-facing shell — the product-page subscribe-and-save **theme.section/app block** with color/label/frequency knobs — is expressible as one module recipe (content + style + a product-picker target + a subscribe toggle). Everything else **exceeds** a single-module recipe:

- **Requires a persistent external data store**: subscriptions, subscription_groups, upcoming orders, dunning state, portal permissions, and dynamic-discount tiers are long-lived server state Bold owns outside Shopify — not renderable from a stateless module spec.
- **Requires background/scheduled jobs**: recurring billing on the next_order_date, dunning retry loops (1–15 attempts, N days apart), prepaid renewals, and reminder emails are cron/queue-driven side-effects, not render-time logic.
- **Is a cross-surface blueprint with shared state**: PDP widget + cart display + native-checkout upsell + hosted customer portal + admin editor all read/write ONE subscription record and must be provisioned together and kept in sync.
- **Needs a rule engine + external side-effects**: dynamic-discount tiers, dunning policy, fixed-shipping rules, and Flow/Klaviyo/Zapier/PayPal/Authorize.net integrations are rule evaluation and outbound integrations that a validated module spec cannot encode.
