# Bold Checkout (Bold Cashier)

> **DEPRECATION NOTE (confirmed).** "Bold Checkout" on Shopify shipped as **Bold Cashier** — a full *replacement* checkout that bypassed Shopify's native checkout. Shopify **closed it to new installs on ~Jan 20, 2020** and it is effectively deprecated on the platform (StoreLeads shows it on ~**52 stores**, installs down ~87% YoY). New Shopify merchants cannot install it; only pre-2020 installs (and rare enterprise exceptions) run it. Shopify's own **checkout.liquid → Checkout Extensibility** migration (in-checkout customizations dead Aug 2024; Plus thank-you/order-status Aug 2025; non-Plus Aug 2026) closed the door on third-party replacement checkouts on Shopify entirely.
>
> Bold Checkout **still exists and is actively sold on other platforms** (BigCommerce, commercetools, Adobe Commerce/Magento) as a headless replacement checkout — that is the living product and the richest source of its vocabulary. **This record documents the Bold Checkout / Bold Cashier product vocabulary** (drawn from Bold's own docs, which are platform-agnostic) and, for the *live Shopify review signal*, studies the **closest current same-vendor equivalent still on the Shopify App Store: "Bold AI Upsell & Cross-Sell"** (checkout upsells + post-purchase funnels), noting what carried over vs. what died. This split is called out per-section.

## identity
- **name**: Bold Checkout (Shopify product name: **Bold Cashier**) — confirmed
- **vendor**: Bold Commerce (boldcommerce.com) — confirmed
- **category**: bold / checkout-replacement + payments + post-purchase upsell — confirmed
- **App Store URL**: Bold Cashier is **no longer a public App Store listing** (closed to new installs); vendor page https://apps.shopify.com/partners/bold. Living equivalents: product page https://boldcommerce.com/cashier (403 to bots, confirmed live); BigCommerce listing https://www.bigcommerce.com/apps/bold-checkout/; commercetools https://marketplace.commercetools.com/integration/bold-checkout — confirmed
- **rating**: Bold Cashier itself has **no active public Shopify rating** (legacy/closed). Same-vendor live proxy "Bold AI Upsell & Cross-Sell" = **4.4/5** — confirmed. Bold Commerce Trustpilot for the company is mixed/low — confirmed
- **review count**: Bold Cashier = unknown/none public. Proxy "Bold AI Upsell & Cross-Sell" = **580 reviews** — confirmed
- **install signal**: ~**52 Shopify stores**, declining ~87% YoY (StoreLeads); demo store bold-cashier.myshopify.com exists — confirmed
- **pricing model**: **No monthly fee**; a **per-order transaction fee** on every order routed through Cashier, **plus** the payment gateway's own fees (~2.9% + $0.30 typical); merchants **avoid Shopify's transaction fees** because payment leaves Shopify's checkout — confirmed. On BigCommerce/headless it is quote-based enterprise pricing (inferred)

## surfaces
Bold Checkout is fundamentally a **replacement checkout**, not a surface add-on — on Shopify it swaps the entire native checkout for Bold's hosted flow. Mapping onto our allowlist is therefore **coarse and imperfect** (that is itself the headline finding):

- **checkout.block** — the whole thing. Bold renders a full custom checkout (one-page OR three-page) with brandable header/footer, logo, order summary, address forms, shipping picker, discount box, and a payment iframe. In our vocab this is the closest anchor but under-describes it: Bold *owns* the checkout, it doesn't inject a block into Shopify's. Confirmed.
- **checkout.upsell** — in-checkout cross-sell / order-bump offers shown before payment (SMART/AI offers on the live upsell app). Confirmed.
- **postPurchase.offer** — **core feature**: last-second upsell shown *after* payment auth, *before* the thank-you page; "Accept" adds to the existing order **without re-entering card/shipping**. Confirmed (this survives on Shopify via the AI Upsell app's post-purchase funnels).
- **functions.paymentCustomization** — payment method surfacing/ordering, multi-card split payment, saved-card selection, installment ("5 Easy Payments"), pre-order (defer charge). Confirmed (conceptually; on Bold this is native checkout config, not a Shopify Function).
- **functions.deliveryCustomization** — live carrier rates, shipping "padding" by % or $ amount, product-specific shipping, shipping zones. Confirmed.
- **functions.discountRules** — discount codes + plugin-driven `discount_line_items` actions; tweet-for-discount, loyalty-points-as-currency. Confirmed.
- **admin.block / admin.action** — Bold's own out-of-the-box admin (Settings, Payment Options, Shipping, Discount Codes, Appearance) — a *separate admin*, not a Shopify admin block. Staff can create orders + generate payment links. Confirmed but note: not really a Shopify admin extension.
- **analytics.pixel** — conversion/checkout tracking; historically a pain point because a *replacement* checkout breaks native Shopify + third-party pixels. Confirmed (inferred that it exposes its own tracking hooks).
- **flow.automation** — order-stream **webhooks** (async) fire downstream automations (ERP sync, fulfillment, fraud). Confirmed.
- **(not mapped)** theme.section, proxy.widget, functions.cartTransform, pos.extension, customerAccount.blocks — not core to this product.

**How the surfaces COORDINATE (confirmed, and this is the crux):** Bold Checkout runs a **synchronous event-action loop** over a shared **`application_state`** (the live order object). As the shopper moves through checkout, Bold **dispatches events** (e.g. `initialize_checkout`) to every installed **plugin's event-dispatch endpoint**; each plugin **synchronously returns an array of actions** (e.g. `add_cart_params`, `discount_line_items`, `add_fee`) that mutate the shared state, gated by **scopes** (e.g. `modify_cart`). **Overrides** (five types — e.g. inventory/shipping/tax/payment/address) register a callback URL that Bold calls mid-flow with shop+order data and awaits a response. So upsell, discount, fee, shipping, and payment surfaces are **not independent widgets** — they are all participants co-mutating one order document in a request/response loop, with **async webhooks** handing the finished order off to external systems. This is a **coordinated cross-surface engine with shared state**, not a bag of isolated extensions.

## functional_model
Core entities (confirmed structure; some field lists inferred from Bold's Checkout API docs):

- **order / application_state** = `{ id, public_order_id, platform_id, cart, customer, billing_address, shipping_address, shipping_lines[], line_items[], discounts[], fees[], payments[], totals, status }` — the single mutable document the whole flow revolves around. Confirmed as the central object.
- **line_item** = `{ product_ref, variant, title, quantity, price, taxes[], fees[], discounts[] }` — "line items contain the product and the taxes, fees, and discounts associated with it." Confirmed.
- **address** = `{ first_name, last_name, line1, line2, city, province, country, postal_code, phone }` — billing + shipping. Confirmed.
- **shipping_line** = `{ carrier, service, rate, padded_amount }` — selectable; supports live carrier rates + padding. Confirmed.
- **payment** = `{ gateway, method, amount, saved_card_ref, auth_status, capture_status }` — supports **multi-card split** (multiple payment objects per order), saved cards, deferred capture (capture on fulfillment/shipment). Confirmed.
- **discount** = `{ code | rule, type(%|$), value, target }` — merchant discount codes + plugin-injected discounts. Confirmed.
- **fee** = `{ label, amount }` — added via `add_fee` action; part of `application_state`. Confirmed.
- **upsell_offer** = `{ trigger, product_ref, discount, placement(in-checkout|post-purchase), accept_action }` — post-purchase accept re-uses the existing auth. Confirmed (inferred field names).
- **plugin** = `{ client_id, client_secret, oauth_token, scopes[], event_dispatch_url, override_callbacks{} }` — the extensibility unit. Confirmed.
- Relationships: order **1—N** line_items, **1—N** shipping_lines, **1—N** payments (multi-card), **1—N** discounts/fees; order **N—1** customer; plugins **N—N** orders via events/webhooks.

## settings_taxonomy
Merchant controls live in Bold's own admin under **Settings → General Settings**, **Payment Options**, **Shipping**, **Appearance**. (Confirmed groupings; some individual knob types inferred from Bold help docs.)

### content
- **Store logo** — image upload; formats `.jpeg/.png/.bmp/.svg` or GIF; max **600×200px**, **2MB**. Confirmed.
- **Favicon** — image upload; `.png` only; max **256×256px**, **512KB** (resized to 16×16). Confirmed.
- **Header / footer content** — text/links regions on the checkout chrome. Confirmed (inferred exact fields).
- **Discount code messaging / order-summary labels** — text. (inferred)
- **Upsell offer copy** — headline + description + CTA text per offer (SMART/AI-generated option on the live app). Confirmed.
- **Language / localization strings** — multi-language checkout copy. (inferred)

### style
- **Checkout design** — select **{ one-page, three-page }** (Settings → General → **Checkout Process**). Confirmed.
- **Display colors / color scheme** — color pickers (hex) for buttons, text, hover, backgrounds; "Customize Display Colors" screen. Confirmed.
- **Two background regions** — separate backgrounds behind the *information* section and behind the *order summary*. Confirmed.
- **Custom CSS** — free-text CSS field (Settings → General → **Appearance → Custom CSS**); accepts any CSS color format; applies immediately on save. Confirmed.
- **Payment iframe (SPI/PIGI) styling** — limited CSS scoped to identifier **`#iframe-payment-gateway`** (isolated iframe for PCI). Confirmed.
- **Fonts / typography** — via custom CSS (no dedicated font picker documented). (inferred)

### targeting
- **Shipping zones** — rule-builder / zone editor: **Create with Presets** or **Create Custom Zone**; select countries/provinces/states you ship to. Confirmed.
- **Payment gateway availability** — select which gateways/methods are offered (Adyen, Braintree, Worldpay, Stripe, Authorize.net, PayPal, wallets). Confirmed (gateway list from commercetools listing).
- **Discount code conditions** — code, type, value, product/collection targeting. Confirmed (via Payment Options → Discount Codes).
- **Upsell offer targeting** — trigger by product/cart contents; placement in-checkout vs post-purchase. Confirmed (upsell app).
- **A/B test assignment** — built-in A/B testing of one-page vs multi-page (and offer variants) to compare conversion. Confirmed (commercetools/BigCommerce).
- **Customer-specific flows** — "customer-specific checkout flows" (e.g. B2B vs retail) — confirmed marketing claim; likely plugin/segment driven (inferred).

### behavior
- **Enable Bold Checkout** — toggle ("Turn Bold Checkout On"). Confirmed.
- **Checkout flow length** — one-page vs three-page (also a style knob; drives behavior). Confirmed.
- **Multi-card / split payment** — toggle: allow splitting one order across multiple cards. Confirmed.
- **Saved cards** — toggle: let customers save cards to their account for faster repeat checkout. Confirmed.
- **Installment payments** — "5 Easy Payments" timed-payment option. Confirmed.
- **Pre-order / deferred charge** — don't charge card at order; batch-charge later. Confirmed.
- **Auth-and-capture-on-fulfillment** — capture payment when order status changes to shipped. Confirmed.
- **Shipping rate padding** — number: add **% or $** to carrier rate. Confirmed.
- **Live carrier rates** — toggle: pull real-time rates (no merchant carrier account required). Confirmed.
- **Post-purchase upsell** — toggle + offer config; accept adds to existing order without re-auth. Confirmed.
- **Tweet-for-discount / social share** — toggle: share order for instant discount. Confirmed.
- **Loyalty points as currency** — toggle: redeem points at checkout. Confirmed.
- **Multi-currency billing** — let customer pick currency and be billed in it. Confirmed.
- **Tax integration** — connect external tax provider (e.g. tax engines) for correct rates. Confirmed.
- **Fraud / anti-fraud integration** — connect fraud provider (e.g. ClearSale) for review/approval. Confirmed.
- **Staff-created orders + payment links** — generate an order and send a pay link. Confirmed.

### data
- **Discount codes** — created/stored in Bold admin (Payment Options → Discount Codes). Confirmed.
- **Shipping zones & rates** — stored in Bold admin (Shipping → Shipping Zones). Confirmed.
- **Tax settings / zones** — presets or custom, tied to shipping zones. Confirmed.
- **Payment gateway credentials** — stored/configured per gateway. Confirmed.
- **Plugin OAuth tokens & scopes** — per-shop token stored by each plugin. Confirmed.
- **Order webhook / event-dispatch endpoints** — URLs registered for the event-action loop. Confirmed.

## data_model
Where things persist (confirmed unless noted):
- **Bold's own backend DB** holds the canonical **order / `application_state`**, carts, addresses, shipping/tax config, discount codes, saved-card *references* (tokens, not PANs), upsell offers, and plugin install/token records. Bold Checkout is a **stateful replacement checkout**, so the order lives in Bold's system and is then synced to the commerce platform.
- **PCI-isolated payment vault** — card data entered in the **SPI/PIGI iframe** (`#iframe-payment-gateway`); raw card data never touches Bold's page JS or third-party scripts; gateway tokenizes. Confirmed.
- **Media/CDN** — merchant logo + favicon uploaded and served from Bold's asset store. Confirmed.
- **Codes** — discount codes are first-class stored records in Bold admin. Confirmed.
- **Platform sync** — completed orders pushed back to Shopify/BigCommerce/commercetools as orders via API + order-stream **webhooks** to external ERPs/fulfillment/fraud. Confirmed.
- **Plugin state** — each plugin keeps its own OAuth token + scopes + its own datastore; Bold holds the registration and calls out synchronously (events/overrides) and asynchronously (webhooks). Confirmed.

## visual_patterns
- **Layout archetypes**: (a) **three-page checkout** — Information → Shipping → Payment, classic stepped flow; (b) **one-page checkout** — condensed single-scroll with all sections stacked. Two-column desktop pattern: customer-info column + sticky **order-summary** column (each with its own background). Confirmed.
- **Component states**: address form (empty/typing/validation-error/valid), shipping method radio list (loading rates → selectable), discount box (apply → applied/rejected), payment iframe (idle → focused → processing → error), multi-card add-another-card state, upsell modal (offered → accepting → added), post-purchase offer interstitial (pre-thank-you). Confirmed (inferred exact states).
- **Motion/interaction**: instant CSS-driven re-render on save (merchant side); shopper side is a request/response flow — selecting shipping or applying a discount triggers an event round-trip that re-totals the order; post-purchase "Accept" is a **single-click add without a new payment step** (reuses auth). A/B variant swap between one-page/three-page. Confirmed.
- **Branding surface**: logo top-of-checkout, favicon in tab, hex color scheme on buttons/text/hover/backgrounds, custom CSS override — brand consistency is the explicit design goal. Confirmed.

## reviews_signal
Bold Cashier itself has no live public Shopify review corpus (deprecated). Signal below is from the **closest current same-vendor checkout product on Shopify (Bold AI Upsell & Cross-Sell, 4.4★, 580 reviews)** plus Bold Commerce company reviews — clearly labeled as such.

**Praises (confirmed):**
1. **Real AOV lift** — merchants cite concrete gains ("30% increase in accessory sales", claimed high ROI) from checkout + post-purchase upsells.
2. **Easy setup** — "pop-ups super easy to set up", user-friendly offer builder.
3. **SMART / AI offers** — auto-generated offers that learn and optimize praised as a standout.
4. **Hands-on support / onboarding** — co-founders and support team "quick to respond", helpful with customization and migration (Cashier-era praise: support "top notch", smooth migration).
5. **Deep payment flexibility (Cashier-era)** — multi-card, saved cards, installments, multi-currency seen as conversion drivers on high-ticket carts.

**Complaints (confirmed):**
1. **Code conflicts / conversion crashes** — a merchant reported a **~70% drop** in add-to-cart and completed-checkout after Bold pushed custom offers that interfered with their code — the single scariest failure mode for a checkout-layer product.
2. **Silent breakage** — app "just stopped working for no reason", no notification, even after years of use.
3. **Slow / timezone-bound support** — "days to reply", chat only during Bold's business hours; some report shops down ~48h and refused refunds without granting full store access.
4. **Inconsistent ROI** — "not getting the revenue in to make it worth the cost" for some.
5. **Regressions after updates** — "more buggy than ever" post-update, affecting both upsell and discount features.

## mapping_note
Bold Checkout maps onto our **RecipeSpec** vocabulary only at the very edges, and it **blows past a single-module recipe in almost every dimension** — it is arguably the strongest "anti-recipe" in the study because a *replacement checkout* is categorically not a module you drop into a store. Specifically it EXCEEDS a single-module recipe because it:

1. **Needs a persistent stateful order store + external side-effects.** The entire product is a canonical **`application_state`/order document** persisted in Bold's backend, a PCI card vault (SPI/PIGI iframe), and a two-way sync back to the platform. A recipe emits a spec; this thing *owns and mutates transactional financial state* and tokenizes real card data — no single module can hold that.

2. **Is a coordinated cross-surface blueprint, not one surface.** It simultaneously drives checkout, in-checkout upsell, post-purchase offer, payment customization, delivery customization, discount rules, an admin app, a pixel, and Flow-style webhooks — all reading/writing **one shared order object**. Mapping it forces a *composeBlueprint of 8+ extension types with shared state and a handoff protocol*, far beyond `theme.section` + settings.

3. **Runs a synchronous rule/plugin engine (event → action loop with scopes + overrides).** Events dispatch to plugin endpoints that return `discount_line_items` / `add_fee` / `add_cart_params` actions gated by scopes (`modify_cart`), plus five override types with callback URLs Bold awaits mid-flow. That is a **live rule engine / durable request-response orchestration**, not a static declarative spec.

4. **Requires background jobs + external integrations.** Deferred/pre-order capture, capture-on-fulfillment, installment charging, order-stream webhooks to ERP/fraud/tax, and A/B test bucketing all imply **schedulers, async webhook processing, and third-party service integrations** that no self-contained recipe module provisions.

(Bonus platform fact worth flagging for gap analysis: on Shopify this class of product is now *impossible* post-Checkout-Extensibility — a constrained generator targeting Shopify should treat "replace the checkout" as out-of-envelope and instead emit `checkout.upsell` / `postPurchase.offer` / `functions.*` primitives, which is exactly the sliver of Bold Checkout that survived as the live upsell app.)
