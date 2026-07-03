# Rebuy Engine

## identity
- **name**: Rebuy Personalization Engine (marketed as "Rebuy Engine") — *confirmed*
- **vendor**: Rebuy — *confirmed*
- **category**: Upsell and cross-sell / Cart customization (personalization platform) — *confirmed*
- **App Store URL**: https://apps.shopify.com/rebuy — *confirmed*
- **rating**: 4.7 / 5 — *confirmed*
- **review count**: ~818–828 reviews (95% five-star) — *confirmed*
- **install signal**: ~13,497 stores (StoreLeads) — *confirmed*
- **pricing**: Free plan + free trial; paid from ~$25/mo with usage-based scaling (tiered on order/GMV volume) — *confirmed*
- **core packages**: Cart & Merchandising · Checkout & Post-Purchase · Search & Collections · Flows & A/B Testing — *confirmed*

## surfaces
Rebuy is explicitly a **journey-spanning** engine — the same Data Source rule logic drives every surface, and cart/checkout/post-purchase are designed to hand off to each other.

- **`theme.section` / `proxy.widget`** — PDP, cart, home, collection widgets. App Embed + theme app blocks inject Rebuy widgets (Product Cross-sell carousel, Add-to-Cart popups, Dynamic Bundle / "Frequently Bought Together", Product Add-Ons checkboxes, Gift-With-Purchase, Exit-Intent popup, Cart Cross-sell embedded/popup, Home/Collection cross-sell). Rendered client-side via Rebuy's JS + Storefront/GraphQL calls (proxy-widget pattern), not native Liquid. — *confirmed*
- **Smart Cart (slide-out drawer)** — takes over the theme's native cart. Maps to `theme.section`/`proxy.widget` (app-block replacement of cart) plus in-drawer cross-sell widgets, progress/shipping bar, discount + gift-card fields, notes, subscription switch. — *confirmed*
- **`checkout.upsell` / `checkout.block`** — Checkout Extensions: Recommendations block, Content Block, Line-Item Editor (Plus), Progress Bar (Plus), Rebuy Monetize ad block. — *confirmed*
- **`postPurchase.offer`** — Post-Purchase Widget renders a page between payment and order-confirmation (one-click add, no re-auth). — *confirmed*
- **Thank-You / Order-Status page** — recommendation widgets on TYP + order-status + account orders pages (also Checkout Extensions surface). — *confirmed*
- **`customerAccount.blocks`** — recommendations on the customer accounts "Orders" page; Reorder / Reactivate landing pages seeded from prior order history. — *confirmed*
- **`analytics.pixel`** — mandatory attribution tracking (`_r_experiment`, attribution cookies) for widget/experiment revenue. Behaves like a pixel; attribution cannot be disabled. — *confirmed*
- **`flow.automation`** — "Smart Flows": no-code logic-driven campaigns (cart rules, pop-ups, discount flows, post-purchase flows), triggered globally or by Smart Links. Rebuy-internal automation, not Shopify Flow (though it integrates with Shopify Flow too). — *confirmed*
- **Smart Search / Smart Collections** — replaces native search (dropdown + results page) and merchandises personalized collection pages. — *confirmed*
- **`pos.extension`** — no evidence; POS not a stated surface. — (inferred: not present)
- **`functions.cartTransform` / `functions.discountRules`** — Rebuy applies discounts and "in-cart bundles (individually discounted line items)," free-gift auto-add, and tiered rewards. Merchant-facing this is rule-driven, not exposed as raw Shopify Functions; likely implemented via draft-order/discount APIs rather than cart-transform Functions. — (inferred)

**Cross-surface coordination (key Rebuy trait):** a single Data Source ruleset can power a PDP add-to-cart popup → the Smart Cart cross-sell → a pre-purchase popup → a checkout Recommendations block → a post-purchase offer, sharing customer/cart/order context. Progress-bar / free-shipping thresholds set in Smart Cart mirror into the checkout Progress Bar block. Reorder landing pages consume prior-order state.

## functional_model
- `data_source = { rules[] (ordered), filters[], endpoint_refs[] }` — the central engine; a widget binds to exactly **one** Data Source.
- `rule = { IF: condition[], logic: AND|OR, RETURN: output, exit_if_matched: bool }` — evaluated **top-to-bottom, sequential, cumulative-fill** until slots full or "Exit If Matched."
- `condition = { object, attribute, operator, value }` — object ∈ {Product, Customer, Cart, Inventory, Geolocation, Behavioral, Temporal, Order-History}.
- `return = { type, product_settings, widget_language, widget_discount, custom_data }` where type ∈ {Input Products, No Products, Specific Products, Products-with-Tags, Metafield-matched, Collections, Products-in-Metafield, Endpoint}.
- `endpoint ∈ {Recommended(AI), Similar(AI), Top Sellers, Trending, Buy It Again, Recently Viewed, Custom Endpoint(chains data sources)}`.
- `widget = { type, data_source, layout, style, placement_selector, ab_variant? }`.
- `smart_cart = { layout(1|2-col), header, goal_box(progress/shipping/tiered/BMSM), body(line_items[], quantity, nested_bundle), cross_sell_widget[], footer(discount, giftcard, notes, terms, checkout_buttons), scheduler, apps[] }`.
- `experiment = { control, variant[≤2], goal(conversion|revenue), traffic_split, schedule(≤30d), attribution(forced) }`.
- Recommendations are **data-driven (AI endpoints) OR manual (specific products / tags / collections)** — merchant chooses per rule. Rules are hand-built (rule-builder), not ML-authored.

## settings_taxonomy

**content**
- Cart Title (text); Accessibility Heading Level (select h1–h6)
- Empty-cart heading / body / button (text)
- Announcement Bar messages (repeatable text, "+ Add message", cycling)
- Notes: Label / Placeholder / Char-limit (number) / Remaining message (text)
- Product-recommendation widget copy / titles / button labels (text; overridable per-rule via Widget Language RETURN)
- Terms & Conditions text + link (text/url); Login button label + redirect (text/url)
- Custom Code Blocks (HTML editor, above checkout button)

**style**
- Layout (select: Single Column | Double Column)
- Custom CSS (code editor); Custom HTML blocks
- Theme selectors: Cart Count Class, Cart Subtotal Class (text)
- Widget layout per widget (select: Grid | Carousel; products-per-view number)
- Colors / fonts (via drag-and-drop editor + CSS) — (inferred exact knobs)
- Countdown timers, discount badge style (percentage | fixed) — *confirmed as concept*

**targeting** (the rule/Data-Source engine — deepest area)
- Rule-builder rows: Object (select) → Attribute (select) → Operator (select: Contains / Does Not Contain / Equals / Greater Than / Less Than / Regex) → Value (text/number/product-picker/tag)
- Objects & attributes: Product (tags, title, vendor, type, handle, metafields, collections); Customer (login status, tags, order count, lifetime spend); Cart (subtotal, line count, item count, discount codes, contents); Inventory (any/each item stock); Geolocation (country, province, city, coords); Behavioral (Klaviyo segment, recently viewed, URL/UTM); Temporal (date range / specific date); Order-History (past order tags)
- Rule logic (AND / OR); rule ordering (drag); Exit-If-Matched (toggle)
- Global filters: filter out-of-stock products / variants (toggle); exclude input products (toggle); custom exclusion; global `exclude_rebuy` tag
- Rule-count guidance: ≤25 rules per Data Source (perf)
- Scheduler: start/end datetime (Smart Cart + widgets)
- A/B experiment targeting: page targeting, placement selector, traffic split, goal (conversion | revenue), schedule ≤30 days

**behavior**
- Publish/Enable cart (toggle); Preview mode (button)
- Quantity input: enable (toggle), min/max (number), type (Buttons/Manual | Dropdown), error messages
- Nested cart items / bundle grouping (toggle + label + collapsed state)
- Switch-to-Subscription (toggle)
- Discount Codes (toggle) + Storefront-API real-time validation (toggle); Gift Card support (toggle)
- Tiered Progress Bar (toggle; up to 3 bars/geographies × up to 4 tiers, 1 free-shipping + up to 3 gift tiers); Buy-More-Save-More (toggle)
- Cross-Sells widget (toggle); Pre-Purchase Cross-Sell popup (toggle); Gift-With-Purchase (auto | selectable)
- Checkout Button routing (select: Shopify | Recharge | custom URL); View-Cart / Continue-Shopping buttons (toggle); Shop Pay / accelerated checkout (toggle); Product-form submission behavior (select: Stay | Cart | Checkout); Cart-page override / enable-disable cart page (toggle)
- Share Cart (toggle); Scheduler (toggle); Payment installments (provider + count + terms)
- Endpoint selection per rule (AI Recommended / Similar / Top Sellers / Trending / Buy-It-Again / Recently-Viewed); Product Limit / Quantity / Discount per RETURN (number)

**data**
- Product Metafields returned (select); Products-in-Metafield editorial picks; Metafield-matched recommendations
- Custom Data key-value pairs (RETURN, for dev customization)
- App integrations (select/toggle: Klaviyo, Attentive, Route, Recharge, Okendo, Malomo, Shopify Flow)
- Multi-currency / multi-language (toggle)

## data_model
Persists: **Data Sources** (rulesets + filters, versioned per widget); **Widgets** (config, placement, style, bound data source); **Smart Cart config**; **A/B experiments** (variants, goals, results, `_r_experiment` participation cookies); **attribution/analytics** (CTR, conversion, Rebuy-attributed revenue-per-visitor, per-widget performance); **recommendation/behavioral data** (recently-viewed, buy-it-again history, AI model inputs from catalog + orders); **cart/order state** for reorder/reactivate landing pages; catalog snapshot (products, inventory, metafields, collections). Runtime cart mutations (discounts, gifts, bundles) applied as individually-discounted line items rather than persisted transforms.

## visual_patterns
- **Smart Cart drawer**: right slide-out, 1- or 2-column; header (title/login) → goal box (animated progress/shipping/tiered bar) → line items (qty steppers, nested bundle groups) → cross-sell carousel → footer (discount field, notes, terms checkbox, sticky checkout CTA). Slide-in + progress-fill motion; empty state; loading skeleton for recs.
- **PDP cross-sell**: carousel (default 4 products, bottom of page) or grid; add-to-cart per card.
- **Add-to-cart popups**: modal overlay on ATC (cross-sell / upsell-swap / subscription), exit-intent overlay.
- **Dynamic Bundle**: "Frequently Bought Together" horizontal card row with combined price + single add.
- **Checkout upsell card**: compact recommendation block inside Checkout Extension; content block; progress bar.
- **Post-purchase offer**: full interstitial page, single/duo product, one-click "Add & pay" with countdown.
- **Reorder/Reactivate landing pages**: pre-filled cart-like list from order history.
- States: loading skeleton, empty, out-of-stock filtered, discount badge, tier-unlocked celebration. Interaction: qty steppers, checkbox add-ons, drag-editor preview.

## reviews_signal
**Praises**: (1) Measurable AOV/conversion/revenue lift (Smart Cart, checkout cross-sell, AI recs). (2) Exceptional/responsive customer + onboarding support (most-cited). (3) Deeply customizable yet largely no-code; drag-and-drop + CSS escape hatch. (4) Breadth — one app spans PDP→cart→checkout→post-purchase→search. (5) Powerful rule/Data-Source engine for precise targeting.
**Complaints**: (1) Usage-based pricing scales expensively as orders grow; can feel costly for smaller stores. (2) Steep learning curve on Data Sources / rule builder; power = complexity. (3) Advanced customization / theme edge-cases often need developer or support help. (4) Occasional performance / load-time concerns (widget JS, rule-count limits). (5) Setup/migration friction and occasional bugs with theme compatibility. — *confirmed from aggregated review sources*

## mapping_note
- **Direct maps**: PDP/cart/home/collection widgets + Smart Cart → `theme.section` + `proxy.widget` (client-rendered app blocks). Checkout blocks → `checkout.upsell` + `checkout.block`. Post-Purchase → `postPurchase.offer`. TYP/order-status/account recs → `customerAccount.blocks`. Attribution → `analytics.pixel`. Smart Flows → `flow.automation`. Gift/bundle/tiered discounts → conceptually `functions.discountRules` / `functions.cartTransform` (Rebuy implements via discount/draft-order APIs, so a faithful blueprint would need our Function surfaces to express auto-gift, tiered-reward, and bundle-line-item discounting). No `pos.extension`.
- **A coordinated blueprint** would need to express: (a) one shared **ruleset entity** (Data Source) referenced by N surface-widgets; (b) per-surface widget config (layout, placement selector, copy overrides) all pointing at that ruleset; (c) a Smart-Cart drawer spec with goal-box/progress/discount/notes sub-blocks; (d) cross-surface state handoff (cart context → checkout offer → post-purchase); (e) an experiment wrapper (control + variants + goal + split) over any widget.
- **Exceeds today's RecipeSpec**: (1) the **rule/targeting engine** (IF-object/attribute/operator/value with AND-OR, sequential cumulative-fill, exit-if-matched) — far richer than static settings; (2) **AI recommendation endpoints** (Recommended/Similar/Top-Sellers/Trending/Buy-It-Again) as a data source type; (3) **A/B testing** as a first-class construct with attribution; (4) **cross-surface shared state / one-ruleset-many-widgets** composition; (5) **tiered/multi-geo progress-reward** model and **conditional auto-gift/bundle discounting**. RecipeSpec today captures per-module settings but has no vocabulary for a shared reusable ruleset, AI-endpoint data sources, experiment variants, or cart→checkout→post-purchase state continuity.
