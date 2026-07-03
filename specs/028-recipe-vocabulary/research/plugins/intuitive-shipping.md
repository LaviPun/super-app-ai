# Intuitive Shipping

> Status: **LIVE, actively developed** (confirmed). Not renamed/merged/deprecated — this is an independent vendor (Intuitive Shipping Inc., St. Catharines ON, Canada), not a Bold app. Launched 2017-11-15 and still shipping updates as of 2026. No equivalent-substitution needed.
> Note on numbers: the live App Store listing fetch returns **5.0 / 476 reviews** (confirmed, most current); some review aggregators still cache **4.9 / ~301** (stale). Use 5.0/476.

## identity
- **name:** Intuitive Shipping (confirmed)
- **vendor:** Intuitive Shipping Inc. (confirmed)
- **category:** Shipping — "Orders and shipping > Shipping rates; Delivery and pickup" (confirmed)
- **App Store URL:** https://apps.shopify.com/intuitive-shipping (confirmed)
- **rating:** 5.0 / 5 (confirmed, live listing)
- **review count:** 476 (466×5★, 6×4★, 1×3★, 2×2★, 1×1★) (confirmed)
- **install signal:** No public install count; "trusted by global brands and growing stores"; positioned as best-in-category by reviewers; premium pricing implies a serious, lower-volume-but-high-ACV install base (inferred). Deep help center + version-2 doc set implies large mature install base (inferred).
- **pricing model:** Usage-tiered SaaS by monthly order volume, all with 15-day live trial (confirmed):
  - Sandbox — **Free** (config/testing only, no live rates)
  - Growth — **$70/mo** (500 orders/mo)
  - Business — **$150/mo** (2,000 orders/mo)
  - Professional — **$300/mo** (5,000 orders/mo)
  - Billed USD every 30 days. (confirmed)

## surfaces
The app's core is a **third-party carrier-calculated rate provider**, NOT a Shopify Function. This is the load-bearing architectural fact.

- **CarrierService (Shopify Admin REST/GraphQL `CarrierService`)** — *primary surface* (confirmed). Requires the merchant's Shopify plan to have "third-party carrier-calculated shipping" enabled. At checkout, Shopify POSTs the cart + destination to the app's endpoint; the app runs its scenario/condition/rate engine server-side and returns a list of rate objects (name, price, description, delivery estimate). **No item in our allowlist maps cleanly** — carrier-service is a distinct extension type outside our vocabulary. Closest conceptual sibling in our list is `functions.deliveryCustomization`, but that is explicitly a *different, complementary* mechanism (rename/sort/hide only) — the app does NOT primarily use it (confirmed via help center + shopify.dev cross-check).
- **checkout.block / checkout display** — the shipping-option list at checkout is what it populates: custom method **titles** (up to 90 chars), **descriptions below each option**, conditional messaging, branded naming (confirmed). This is rendered by Shopify's native checkout from the returned rate payload, not a custom checkout UI extension.
- **admin.block** — full embedded admin app: the entire scenario/zone/method/condition/box builder lives in the Shopify admin as the app UI (confirmed).
- **flow.automation** — *not* used; there is no Shopify Flow trigger/action surface. (inferred, no evidence of Flow integration)
- **analytics.pixel / pos.extension / customerAccount.blocks / postPurchase.offer / functions.\*** — none used (inferred).

**Cross-surface coordination:** single shared server-side config store (scenarios/zones/methods/boxes/conditions) authored in the **admin.block** builder is the source of truth; it is consumed at request time by the **CarrierService** endpoint to compute rates, whose output drives the **checkout** display. It is a config-authoring surface + a runtime-evaluation surface bound by one shared rule/rate database. Downstream, package/box decisions flow to fulfillment (ShipStation export). Handoff = author-in-admin → evaluate-at-carrier-callback → display-at-checkout → export-to-fulfillment.

## functional_model
Core entities (field lists confirmed from help center unless marked inferred):

- **Scenario** = `{ name, priority/order, cart_conditions[], zones[], enabled }` — top-level container of shipping logic; prioritized/tiered so the correct rate set wins per cart. Whole-cart conditions gate applicability.
- **Zone** = `{ name, countries[]/regions[], subzones[] (postal/ZIP ranges, incl. UK postcodes), restriction_flag }` — geographic scope; a zone can *restrict* checkout (block out-of-zone customers).
- **ShippingMethod** = `{ title (≤90 chars), description, zone_ref, calculation_method, rate_table[], adjustments, fees, rounding, free_shipping_threshold, blend_settings, split_cart }` — where price is computed and displayed.
- **RateRow** = `{ up_to_limit ("~" = unlimited), shipping_cost, per_unit? }` — tiered table; return-single-row vs return-highest-plus-lesser; percentage values allowed ("20%").
- **Condition** = `{ category (Product|Customer|Cart|Delivery), field, operator, value }` — 40+ fields (see settings). Combinable; **ConditionGroup** = reusable named set applied to a scenario as if one condition.
- **Origin** = `{ address }` — unlimited multi-warehouse origins.
- **Box/Package** = `{ name, outer_LWH, inner_LWH?, max_weight, ... }` — used by SmartBoxing packing algorithm.
- **Carrier account link** = `{ carrier (UPS/USPS/Canada Post/Australia Post/…), credentials, services[] }` — for live rate shop + backup rates.

Relationships: `Scenario 1─N Zone`; `Zone 1─1 ShippingMethod` (per scenario); `ShippingMethod 1─N RateRow`; `Scenario/Method N─N Condition (via ConditionGroup)`; `ShippingMethod N─N Box (via packing algorithm)`; `ShippingMethod N─1 Origin`; carrier-service methods reference `Carrier account link`.

## settings_taxonomy
The most important section. Grouped under the five headings; knob names + types are confirmed from help center / features page unless marked (inferred).

### content
- **Shipping method title** — text (≤90 chars); supports custom/branded naming (confirmed)
- **Shipping method description** — text, rendered below the option at checkout (confirmed)
- **Conditional messaging** — text + rule ("based on cart value or contents") (confirmed)
- **Estimated delivery date/time display** — toggle + config (delivery date, prep/processing time added to estimate) (confirmed)
- **Custom messages on delivery options** — text (confirmed)

### style
- **Checkout branding / option naming** — text override (the app's "style" is limited to naming + descriptive copy; it does NOT theme visual CSS — checkout renders natively) (confirmed)
- (No color/font/image knobs — visual presentation is Shopify checkout's; app only shapes the label/description strings) (inferred)

### targeting
The **Conditions** engine (40+), grouped as the app groups them (confirmed):
- **Product conditions:** Title, SKU, Collections, Quantity, Price, Weight, Volume, Length, Width, Height, Pack Separately (toggle), Has pieces — each is field + operator + value (rule-builder rows)
- **Customer conditions:** Customer groups/tags, Postal code, Address, City, Company, Email, Telephone, Fax, Prev order count (number), Prev order total (number), Order source
- **Cart conditions:** Quantity, Total, Weight, Volume, Day of week (select), Date, Time, Free shipping (flag), Custom shipping (flag)
- **Delivery conditions:** Same-day, Tag, Distance (number km; requires Google Cloud Services), Day of week, Date, Time (Store-Pickup/Zapiet dependency for some)
- **Condition Groups** — named reusable bundle of conditions (rule-builder) (confirmed)
- **Zone restrictions** — select regions where checkout is allowed/blocked (confirmed)
- **PO Box restrictions** — toggle (confirmed)
- **Per-item / per-product exclusions** — product-picker + rule (confirmed)
- **Order limits / minimum order values** — number (confirmed)

### behavior
- **Calculation method** — select[ cart quantity | cart total | cart weight | cart volume | distance | product quantity | product price | product total | product weight | product volume | carrier live rates | custom formula | 3rd-party (Printful) ] (confirmed)
- **Rate table rows** — rule-builder: rows of `{up_to, cost, per_unit?}` (confirmed)
- **Row return mode** — select[ single highest qualifying row | highest row + all lesser rows (cumulative) ] (confirmed)
- **Split Cart** — toggle (repeat rate table for overflow as new shipment) (confirmed)
- **Markup rates** — number (% or $) (confirmed)
- **Markdown rates** — number (% or $) (confirmed)
- **Rounded rates** — select[ nearest $0.50 | $1 | $5 | $10 ] (confirmed)
- **Min / Max cost caps** — number (confirmed)
- **Rate overrides** — free / discounted / max-cap override (confirmed)
- **Free shipping threshold** — number (confirmed)
- **Advanced rate blending** — rule-builder defining how rates from multiple vendors/methods/cart-rules combine (confirmed)
- **Handling fee** — number (confirmed)
- **Insurance fee** — number (confirmed)
- **Signature required** — toggle/option (confirmed)
- **Hide rates** — toggle/rule (confirmed)
- **Backup rates** — config (fallback if carrier service outage) (confirmed)
- **Rate shopping** — toggle (compare multiple carriers, show best) (confirmed)
- **Cutoff times / preparation times / block dates** — time/date pickers (confirmed)
- **Multi-currency** — toggle (confirmed)
- **SmartBoxing packing algorithm** — select[ SmartBoxing | volume-based | weight-based | points-based | quantity-based | simple ] (confirmed)
- **Box definitions** — per box: outer L/W/H (number), inner L/W/H (number, optional), max weight (number), name (confirmed)

### data
- **Carrier account credentials** — text/OAuth per carrier (UPS, USPS, Canada Post, Australia Post, +) (confirmed)
- **Shipping origins** — address entries, unlimited (confirmed)
- **Product settings** — per-product shipping weight (required for parcel/SmartBoxing) + dimensions (required for volume/SmartBoxing) — sourced from Shopify product data + app-level overrides (confirmed)
- **Google Cloud Services key** — for distance conditions (confirmed)
- **Integrations** — ShipStation (fulfillment export), Zapiet/Store Pickup + Delivery, Zonos, Printful (confirmed)

## data_model
- **App-owned external DB (server-side)** (inferred, strongly): scenarios, zones, subzones, methods, rate tables, conditions, condition groups, boxes, origins, per-product shipping overrides, carrier credentials. This must persist outside Shopify because the CarrierService callback needs to evaluate it in real time on every checkout rate request.
- **Shopify-native reads:** product weight/dimensions, collections, tags, customer data, cart contents, destination address — pulled from the rate-request payload + Admin API (confirmed).
- **Shopify config write:** registers a `CarrierService` record on the shop (confirmed).
- **No metaobjects / no theme assets / no CDN media** — the app stores no storefront media; it is pure rules + numbers (inferred).
- **External calls at runtime:** carrier rate APIs (UPS/USPS/etc.), Google Maps (distance) — live per checkout (confirmed).
- **Fulfillment side-effect:** package/box decisions exported to ShipStation (confirmed).

## visual_patterns
- **Admin archetype:** dense multi-level configuration builder — list of Scenarios → each expands to Zones → Methods → rate-table grid + condition rule rows. Classic "rule engine console" layout (inferred from doc structure + reviews).
- **Component states:** enabled/disabled scenarios; priority ordering (drag/reorder implied); conditional show/hide of rate rows; "~" sentinel for unlimited tier; validation states (weight/dimensions required warnings) (confirmed pieces, inferred UI).
- **Checkout-facing pattern:** vertical list of shipping options, each = title + secondary description line + price; optional delivery-date/estimate string; conditionally hidden/renamed options (confirmed).
- **Motion/interaction:** minimal — this is a config tool + server engine, not an animated storefront widget. The only "live" behavior is real-time rate recomputation at checkout (inferred).

## reviews_signal
**Praises (top):**
1. Handles extreme complexity — "incredibly robust and handles even the most complex conditional shipping scenarios" (multi-box, volume, conditional rules).
2. Outstanding, hands-on support — fast tickets, 30-min video/Zoom sessions for setup.
3. Fills Shopify's native gap — "Shopify only seems to calculate shipping by weight… like back in the 80's"; adds volume/dimension/regional pricing.
4. Best-in-category — "used every shipping app on Shopify and Intuitive is by far the best."
5. Direct margin impact — "We stopped leaking money on shipping. Which is a HUGE game changer."

**Complaints (top):**
1. Steep learning curve — "Because it's so powerful, there is a steep learning curve." Complexity is the cost of the power.
2. Pricing tier gaps — "The jump from the 500-order plan to the 2,000-order plan is too large"; hurts seasonal merchants; no intermediate tier.
3. Scope limits — merchants want it to also purchase/print labels & ship directly ("so that we can purchase and ship from it directly").
4. Price point itself — $70 entry is steep vs. simpler rate apps (inferred from tier-gap + category comparisons).

## mapping_note
This plugin is a **poor fit for a single-module RecipeSpec** and exceeds it in several structural ways:

1. **Wrong extension type entirely.** Its primary surface is a **Shopify CarrierService** (real-time rate callback), which is NOT in our allowlist (theme.section / proxy.widget / functions.* / checkout.* / admin.* / pos / customerAccount / pixel / flow). `functions.deliveryCustomization` only renames/sorts/hides existing options — it cannot *originate* computed rates the way this app does. A recipe for this needs a new extension-type primitive (carrier-service) that our vocabulary lacks.
2. **Server-side rule + rate engine as a runtime dependency.** Every checkout triggers server-side evaluation of scenarios/conditions/rate-tables plus **external carrier + Google Maps API calls**. That is a live external side-effecting service, not a declaratively-rendered module. A recipe can declare the config schema but cannot embody the always-on evaluation endpoint.
3. **Persistent multi-entity relational data store.** Scenarios ↔ zones ↔ methods ↔ rate rows ↔ conditions ↔ condition-groups ↔ boxes ↔ origins ↔ carrier accounts — a normalized DB with cross-references and reuse. Far beyond a single module's flat settings object; needs a data store + a rule engine.
4. **Cross-surface blueprint + fulfillment handoff.** Config authored in an embedded admin app, evaluated at the carrier callback, displayed at checkout, and exported to ShipStation — a coordinated multi-surface + external-integration flow, not one module.

---
**Sources:** apps.shopify.com/intuitive-shipping (+/reviews); intuitiveshipping.com/features; help.intuitiveshipping.com (how-to-set-up-shipping-costs, zones, scenarios, SmartBoxing, add-a-package, product-settings); shopify.dev CarrierService & Delivery Customization Function API docs.
