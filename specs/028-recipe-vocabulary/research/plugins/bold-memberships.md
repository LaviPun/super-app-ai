# Bold Memberships & Loyalty

> **Rename / status note (confirmed):** The app now lists as **"Bold Memberships & Loyalty — Sell Memberships, Member Perks & Custom Membership Access"** at the same App Store slug (`/recurring-memberships`). Historically it was just "Bold Memberships." The "& Loyalty" framing and the perks language (auto-applied store credits, discounts, free shipping) are the current positioning around the same core recurring-membership engine. Review-count signals disagree across aggregators (302 on some third-party mirrors vs 82 on the live listing snapshot) — the higher counts are stale/aggregated historical numbers; the live listing shows ~82 reviews at 4.3. This is a long-lived Bold app (launched Aug 31, 2016), not deprecated, but it is a legacy-architecture app: it does NOT use Shopify's native subscription/billing APIs and runs recurring billing through **Stripe** externally, which colors the whole data model below.

## identity
- **name:** Bold Memberships & Loyalty (legacy: "Bold Memberships"; App Store title also carries subtitle "Sell Memberships, Member Perks & Custom Membership Access") — confirmed
- **vendor:** Bold / Bold Commerce (partner page `apps.shopify.com/partners/bold`) — confirmed
- **category:** bold (membership / loyalty / gated-access / recurring-billing) — confirmed
- **App Store URL:** https://apps.shopify.com/recurring-memberships — confirmed
- **rating:** 4.3 / 5 — confirmed (live listing snapshot)
- **review count:** ~82 on the live listing (distribution ~67% 5-star, ~13% 4-star, ~15–20% 1-star); some aggregators report ~302 as a stale/historical figure — confirmed (discrepancy noted)
- **install signal:** ~507 stores (StoreLeads estimate) — (inferred, third-party estimate)
- **pricing model:** tiered by **number of members**, billed every 30 days in USD, plus a **1% Bold transaction fee** on membership charges (on top of Stripe's ~2.9% + $0.30). Free for first 10 members; paid tiers scale up. Two overlapping tier tables appear across sources (App Store vs help center) — **confirmed** figures below, both cited because they represent different pricing eras:
  - App Store snapshot: Free (1–10), Essential $9.99 (11–100, 30-day trial), Standard $24.99 (101–1,000), Complete $49.99 (1,001–5,000)
  - Help-center snapshot: $9.99 (≤50), $19.99 (≤100), $49.99 (≤1,000), $199.99 (≤5,000), $299.99 (≤10,000)
  - Pricing scales with member count — merchant must upgrade as membership base grows — confirmed

## surfaces
Bold Memberships is fundamentally a **theme-liquid + external-billing** app, NOT a modern extension-first app. Mapped onto our internal extension-type vocabulary (best-fit; most are approximations because the real app predates Shopify's extension framework):

- **theme.section / theme.block (proxy.widget-like):** confirmed — PRIMARY surface. Installs **liquid code into the theme** to (a) render the **membership registration form** either as a **Buy button that opens a modal** or as an **embedded widget**, and (b) wrap protected content in **show/hide liquid conditionals** driven by the member's customer tag. Also injects **member account management UI** (view/edit/cancel/pause) into the customer account area.
- **proxy.widget:** confirmed — the registration/signup + member self-service (manage, edit, cancel, pause) flow is served by Bold's own backend and embedded into storefront pages; it is effectively an app-proxy-style widget, not a native Shopify checkout.
- **admin.block / admin.action:** (inferred) — merchant-facing plan builder, member list, and settings live in the embedded Bold admin app inside Shopify Admin (this is the whole `settings_taxonomy` below).
- **pos.extension:** confirmed — "**Sell and redeem memberships at the Shopify POS register**." In-store staff can sell a plan and recognize existing members at the register; this is a coordinated surface (POS sale writes to the same member record the online storefront reads).
- **customerAccount.blocks:** (inferred) — member self-service (view plan, cancel, pause, update payment) is surfaced in the account area via injected liquid, functionally equivalent to a customer-account block.
- **flow.automation:** confirmed — listed integration with **Shopify Flow** (membership events can trigger Flow workflows).
- **analytics.pixel:** confirmed data access to device/activity data (geolocation, IP, browser) per the listing's data-permissions section, implying tracking, though not a merchant-configurable pixel surface. (inferred as non-configurable.)
- **NOT present:** functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, checkout.upsell, checkout.block, postPurchase.offer. Critically, the app **"does not interact with the Shopify checkout"** and **does not create Shopify orders** — confirmed. Member discounts are NOT applied via Shopify Functions; they are delegated to **Bold Custom Pricing** (a separate app) or handled as store credits / external logic.

**Cross-surface coordination (confirmed + inferred):** The **shared state is the Shopify customer record + its membership tag** plus Bold's external member/billing database. A purchase (online widget OR POS register) → Stripe charge approved → member record activated → **customer tag applied to the Shopify customer** → theme-liquid show/hide rules across every page now unlock for that customer → perks (store credit / discount tier via Bold Custom Pricing / free shipping) auto-applied each billing cycle. So the "handoff" is: **billing engine (Stripe) → member record → Shopify customer tag → liquid gating everywhere**. POS and online storefront both key off the same customer + tag, which is what makes online/in-store recognition consistent.

## functional_model
Core entities (concrete, field-level; confirmed unless marked):

- **MembershipPlan** = { plan_name (customer-facing), plan_tag (internal tag applied to member's Shopify customer), description, billing_options[], trial{enabled, length_days}, email_verification_required, registration_fields[], access_rules[], access_denied_message } — confirmed
- **BillingOption** = { cycle_price (currency), billing_cycle (weekly|monthly|quarterly|yearly), payment_count (integer) | forever (bool) } — a plan can have MULTIPLE billing options (e.g. monthly vs annual) — confirmed
- **AccessRule** = { type (show | hide), target_kind (product | collection | page | blog | blog_post | product_price | add_to_cart_button), target_ref } — show = members-only; hide = hidden from members — confirmed
- **RegistrationField** = { label, type (text | multi_line_text_area), order } — first/last name + email auto-populated; extra fields reorderable — confirmed
- **Member** = { shopify_customer_ref, plan_ref, status (active | paused | cancelled | trialing), stripe_subscription_ref, registration_field_values{}, join_date, next_bill_date } — confirmed (status set + Stripe linkage)
- **Perk** (applied per billing cycle) = { type (store_credit | discount | free_shipping), value, tier_ref } — store credit + discount + free shipping auto-applied each cycle; tiered discounts (bronze/silver/gold) delegated to Bold Custom Pricing — confirmed
- **MembershipTag** — the load-bearing join: written to the Shopify customer, read by theme liquid to gate content — confirmed

Relationships: Plan 1—N BillingOption; Plan 1—N AccessRule; Plan 1—N RegistrationField; Plan 1—N Member; Member 1—1 Shopify Customer; Member 1—1 Stripe subscription; Member N—N Perk (via plan/tier).

## settings_taxonomy
Merchant-facing controls (from the plan-builder + app settings). Grouped under the five headings; knob names and types are from the actual "Create a Membership Plan" flow (confirmed) plus setup/config (marked).

### content
- **Plan Name** — text (customer-facing title) — confirmed
- **Plan Description** — text/textarea — confirmed
- **Plan Tag** — text (internal identifier tag written to customer) — confirmed
- **Registration Fields** — repeatable list; each = **field label** (text) + **field type** = select[ Text Field | Multi-Line Text Area ]; reorderable; name/last name/email auto-included — confirmed
- **Edit Access Denied Message** — text/rich-text (message shown to non-members hitting gated content) — confirmed
- **Registration form placement** — select[ Buy button (modal) | Embedded widget ] — confirmed

### style
- Membership widget / form styling — (inferred) largely inherited from theme via injected liquid; app provides minimal native style knobs. The app "must make adjustments on your theme to display the correct information," implying theme-CSS-driven rather than a rich style panel. Access-denied message is text-only, not visually themed. — (inferred; weak style vocabulary is a known limitation)

### targeting
- **Access Rules** — repeatable rule-builder; each rule = **rule type** select[ Show | Hide ] + **resource type** select[ product | collection | page | blog | blog post | product price | add-to-cart button ] + **resource picker** (product-picker / collection-picker / page-picker) — confirmed. This is the core targeting engine: which content is members-only (Show) vs hidden-from-members (Hide).
- **Plan tier** targeting for perks — (inferred) bronze/silver/gold discount levels mapped to plans via **Bold Custom Pricing integration** — confirmed integration, granular knobs live in the other app
- **POS availability** — (inferred toggle) whether the plan is sellable at the POS register — confirmed capability, exact knob unconfirmed

### behavior
- **Cycle Pricing** — currency input (amount per cycle) — confirmed
- **Billing Cycle** — select[ weekly | monthly | quarterly | yearly ] — confirmed
- **How many payments** — number **+ "Forever" toggle** (finite payment count vs continuous recurring) — confirmed
- **Add Billing Option** — button to add alternative price/cycle combinations to one plan — confirmed
- **Enable Trial?** — toggle — confirmed
- **Trial Length** — number (days) — confirmed
- **Enable Email Verification?** — toggle (require email verification at signup) — confirmed
- **Auto-apply perks per cycle** — store credit / discount / free shipping applied automatically each billing cycle — confirmed (behavior; discount depth via Custom Pricing)
- **Member self-service** — members can manage / edit / **cancel** / **pause** their membership — confirmed (behavior surfaced in account UI)
- **Free vs paid** — a plan can be free (reward/invite-only) or paid recurring — confirmed
- **Invite free members** — invitation-based free enrollment; no documented bulk import — confirmed

### data
- **Stripe connection** — connect Stripe account (required to sell paid plans; **Stripe is the only supported gateway**; legacy PayPal restricted for new merchants post-Dec 2020 SCA) — confirmed
- **Customer accounts requirement** — Shopify customer accounts must be enabled (optional or required) — confirmed
- **Membership tag** — auto-written to Shopify customer on activation (the data key everything reads) — confirmed
- **Registration field values** — persisted per member — confirmed
- **Integrations toggles** — Shopify Flow, Bold Subscriptions, Bold Custom & VIP Pricing — confirmed

## data_model
What it persists and where (confirmed unless marked):

- **Bold external database (off-Shopify):** the authoritative member records — plan, status (active/paused/cancelled/trialing), registration-field answers, billing schedule, next-bill date. The app "does not create Shopify orders" and "does not interact with the Shopify checkout," so membership transactions live in **Bold + Stripe**, not in Shopify's order table — confirmed.
- **Stripe:** stores payment method, subscription object, and processes recurring charges (Bold adds a 1% fee) — confirmed.
- **Shopify customer record:** the **membership tag** (e.g. plan_tag) is written here — this is the ONLY reliable footprint inside Shopify and is what the theme reads — confirmed.
- **Shopify theme (liquid):** injected snippets that render the signup widget/modal and wrap gated content in tag-conditional show/hide logic; also account-management UI — confirmed.
- **Metaobjects / native metafields:** not used (legacy app predates metaobjects) — (inferred).
- **Media/CDN, codes:** no gift-card-style codes; no dedicated media store — (inferred). Store-credit balances are applied to the customer (store-credit account edit permission is requested) — confirmed permission.

## visual_patterns
- **Layout archetypes:** (1) **Registration form** — either a **modal** launched from a Buy button, or an **inline embedded widget** on a page; (2) **Gated content** — sections/pages/prices/add-to-cart that appear or vanish based on membership; (3) **Access-denied state** — a text message shown to non-members hitting Show-gated resources; (4) **Member account panel** — view/edit/cancel/pause plan inside the customer account area. — confirmed
- **Component states:** non-member (locked / access-denied message) vs member (unlocked content, add-to-cart visible, member price shown); trialing; paused; cancelled. Content states are **binary per rule** (show/hide), driven by the customer tag. — confirmed
- **Motion/interaction:** modal open/close for the Buy-button form; otherwise minimal — the app leans on **server-side liquid rendering** (content is present/absent in the HTML) rather than client-side animation, and it explicitly gates "at the resource level, not through hidden CSS," so unlocking is a real content swap, not a fade. — confirmed
- **Theme coupling:** strong — switching themes breaks gating and requires re-installing liquid ("a lot of back and forth"); incompatible with third-party page builders. — confirmed

## reviews_signal
**Top praises (confirmed):**
1. Solid core membership management — VIP tiers, access restrictions, and recurring payments handled straightforwardly.
2. Responsive, hands-on customer support that ships fixes and finds creative workarounds (e.g. customer groups + discount codes).
3. Easy-to-use settings with reasonable pricing at low member counts (free for first 10).
4. Real revenue outcomes — one merchant reported six figures in membership fees since 2020.
5. True resource-level gating (not CSS hiding) is valued for genuinely protecting content.

**Top complaints (confirmed):**
1. **Billing keeps running after uninstall** — the most severe, recurring complaint: "all of our members are continuing to be charged" after deleting the app (because billing lives in Stripe/Bold, not Shopify).
2. **No Shopify order/checkout sync** — membership signups don't create Shopify orders and don't sync with Shopify's native customer/subscription model; support has to be handled off-platform.
3. **Missing perk flexibility** — no member-exclusive/global shipping discounts natively, no customized signup emails, no pre-checkout member prompts.
4. **Theme-switch fragility** — moving/redesigning themes breaks gating and needs manual liquid re-installation; incompatible with page builders.
5. **Legacy-architecture gaps** — no native discount-code integration, no email-platform integrations (Klaviyo/Mailchimp), no manual approval workflow, no bulk member import.

## mapping_note
Onto our constrained **RecipeSpec** vocabulary, Bold Memberships maps only *partially* to a single-module recipe and **substantially exceeds** it. A single generated module could plausibly reproduce the **theme.section gating widget** (a control-packed section that shows/hides content by customer tag) and its **settings** (Show/Hide rule-builder, product/collection pickers, access-denied message, form placement). That part is squarely within a one-module recipe.

Where it EXCEEDS a single-module recipe:
1. **Persistent membership + billing data store off-Shopify** — a real member entity with status lifecycle (trialing/active/paused/cancelled) and a **Stripe recurring-billing subscription** per member. No single theme/checkout module owns durable member state or an external subscription; this needs a data store + payment-provider integration and outlives any one page.
2. **Background/recurring jobs (external side-effects)** — every-30-day billing cycles that auto-apply store credit / discount / free shipping and re-charge Stripe. This is a scheduled-job + external-API concern, not a render-time recipe. (It's also the source of the worst failure mode: billing that survives uninstall.)
3. **Cross-surface blueprint with shared state** — the SAME member record must be recognized by the storefront theme (liquid gating), the customer-account panel (self-service), and the **POS register** (sell/redeem in-store), all keyed off a Shopify customer tag that the billing engine writes. That's a coordinated multi-surface blueprint (theme + customer-account + POS + Flow), not one module.
4. **A rule engine + cross-app perk delegation** — an N-rule Show/Hide access engine spanning products, collections, pages, blogs, prices, and add-to-cart, PLUS tiered member discounting delegated to a companion app (Bold Custom Pricing) and store-credit account mutations. The pricing/discount side-effects reach beyond the module into other apps and into Shopify customer store-credit balances.

**Net:** reproducing its *vocabulary* (plan builder, rule-builder, billing options, registration fields, perks) is feasible as a spec; reproducing its *behavior* requires a stateful membership backend, scheduled billing jobs, an external payment integration, and a cross-surface (theme + account + POS + Flow) blueprint — none of which fit a single stateless RecipeSpec module.
