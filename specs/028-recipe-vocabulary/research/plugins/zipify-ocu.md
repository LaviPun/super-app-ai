# One Click Upsell ‑ Zipify OCU

> Status note: The app is **live and actively developed** (not renamed/deprecated). Listing headline is "One Click Upsell ‑ Zipify OCU — Increase AOV with AI post-purchase upsells & checkout upsells." This is a Zipify (Smart Marketer) product, NOT a Bold app, so no merge/deprecation caveat applies. It has recently been repositioned around AI funnels ("self-optimizing AI offers", "pre-built AI funnels") and native Shopify checkout-extensibility upsells, replacing the older custom "OCU offer page between checkout and thank-you page" era.

## identity
- **name**: One Click Upsell ‑ Zipify OCU (a.k.a. OneClickUpsell, "OCU") — confirmed
- **vendor**: Zipify Apps (by Smart Marketer) — confirmed
- **category**: Upsell and cross-sell, under Marketing and conversion — confirmed
- **App Store URL**: https://apps.shopify.com/zipify-oneclickupsell — confirmed
- **rating**: 4.5 / 5 — confirmed (85% 5★, 5% 4★, 2% 3★, 2% 2★, 5% 1★)
- **review count**: ~521 reviews (518–521 across snapshots) — confirmed
- **install signal**: "Trusted by over 3,000 Shopify stores" (vendor claim; App Store shows no exact install count) — confirmed as vendor claim, (inferred) as true install base
- **pricing model**: 30-day free trial; free on development stores; single paid plan **$8/month** base + a **usage-based component that "scales with generated upsell revenue"** ("only pay for what you earn — never for order volume") — confirmed. This is a **revenue-share / usage-metered** model layered on a low flat fee, not pure flat-rate.

## surfaces
Multi-surface by design; a single "Funnel" coordinates offers across the customer journey. Mapped to internal extension-type vocabulary:

- **theme.section** / **proxy.widget** — Product-page offer widget + cart popup + cart-drawer upsells. Rendered via the storefront **"OCU Upsells Extension" app embed** (theme app embed block) plus an app-proxy-served offer payload. Shows: pre-purchase upsell popup, product-page add-on widget, "frequently bought together", multi-product buy-boxes. *(theme app embed = confirmed; whether the offer HTML is app-proxy vs injected script is (inferred))*
- **checkout.upsell** — In-checkout upsells for **Shopify Plus with checkout extensibility** ("up to 8 upsells directly inside the checkout"). Native checkout UI extension. — confirmed
- **postPurchase.offer** — Post-purchase upsell/downsell page shown after payment, before/at the Thank-You/Order-Status page, using Shopify's post-purchase extension surface. Max 2 offers per order. — confirmed
- **checkout.block** — Thank-You / Order-Status page upsell block (distinct "TY Page" offer editor, separate settings from post-purchase). — confirmed
- **admin.block** / **admin.action** — Embedded admin app: Funnels list, offer/page editors, split-test setup, analytics dashboard, Settings, Plan & Billing. (Merchant-facing config UI, not a storefront surface.) — confirmed
- **analytics.pixel** — "Zipify Analytics" (toggle, on by default) tracks customer behavior + funnel/conversion metrics; dashboard shows "AOV with upsells vs without, side by side". Behaves like an owned analytics/pixel layer. — confirmed
- **customerAccount.blocks** — Listing mentions customer-account-page support. — (inferred, listing-level only; no builder detail found)

**Coordination:** A **Funnel** is the coordinating unit. Triggers (products / collection / cart count / cart total / customer location) fire a Funnel; the Funnel then sequences offers across surfaces (pre-purchase popup → checkout upsell → post-purchase upsell → downsell → TY-page). Conditional rules pass state *between* surfaces, e.g. **"Hide offer if upsell product is purchased at Checkout"** and **"Hide offer if post-purchase upsell was shown"** — i.e. later surfaces read what earlier surfaces did. When multiple trigger products are in one cart, **Funnel Priority** decides which single funnel runs. — confirmed

## functional_model
Core entities:

- **Funnel** = `{ id, name, status(published/draft/unpublished), triggers[], offers[] (ordered), priority(number), splitTests[] }` — the top-level container. — confirmed
- **Trigger** = `{ type: product | collection | cart_item_count | cart_total | customer_location, value }` — decides whether the funnel shows. — confirmed
- **Offer** = `{ kind: pre_purchase_popup | checkout_upsell | post_purchase_upsell | post_purchase_downsell | ty_page, offerProducts[], discount, quantity, layout, copy, designTokens, conditionalRules[] }` — confirmed
  - Offers reference **offer products** distinct from the **trigger products**. — confirmed
  - **Multi-product offer**: `offerProducts[]` = 2–5 products, each a "buy box" = `{ product_ref, quantity, discountType($|%), discountLevel, starRating{enabled, value, filledColor, emptyColor}, uspText{enabled, text}, uspImage{enabled, src} }`. — confirmed
  - **Dynamic / AI offer**: `offerProducts` resolved at runtime by AI (e.g. "best selling products (AI)", "same product / different variant") instead of a fixed pick. — confirmed
- **Discount** = `{ type: percent | fixed_amount, level, extraShipping? }` applied per offer/product. — confirmed
- **SplitTest** = `{ variantA(offer config), variantB(offer config), dimension: product_combination | discount_level | discount_type | copy }` — attached to a funnel step; app auto-splits traffic. — confirmed
- **Order linkage**: accepted post-purchase offers are **appended to the original Shopify order via the Order-Edit API** (no separate order); OCU applies an order **tag** ("Zipify Upsell Tag"). Fulfillment held via Fulfillment API until the offer sequence resolves. — confirmed

## settings_taxonomy

### content
- **Headline Banner / Incentive Type** — select[ standard banner | Free Shipping Bar ] — confirmed
- **Progress Message** (free-shipping bar) — text, supports `{{amount_left}}` variable — confirmed
- **Goal Reached Message** (free-shipping bar) — text — confirmed
- **USP Text** (per buy-box) — toggle + text — confirmed
- **USP Image** (per buy-box) — toggle + image (default or custom upload) — confirmed
- Offer page copy: headline / subhead / button labels / decline-link text — text (edited in Post-Purchase Offer Page Editor and TY Page Offer Editor) — confirmed (editors exist), exact field names (inferred)
- **Translations** — per-language enable toggles for post-purchase offers (matched to storefront language) — confirmed

### style
- **Products Alignment / layout** — select[ Vertical | Horizontal ] — confirmed
- **Star Rating** (per product) — toggle — confirmed
- **Star Value** — number — confirmed
- **Filled Star Color** — color — confirmed
- **Empty Star Color** — color — confirmed
- **Progress Bar Color** (free-shipping bar) — color — confirmed
- **Custom CSS** — toggle + code/text editor (class-selector based) — confirmed
- **Builder Preview Styling** — config that mirrors live checkout styling in the builder preview (post-purchase inherits checkout theme) — confirmed
- Cart-drawer design customization — (inferred; listing says "customizable design", no exposed knob list found)

### targeting
- **Triggers** — rule-builder: product-picker | collection-picker | cart item count (number) | cart total (number/currency) | customer location (select) — confirmed
- **Funnel Priority** — number/ordering (which funnel wins when several match) — confirmed
- **Cart Popup Frequency** — select[ Show popup every time | Show popup until accepted or declined | Show popup once per session ] — confirmed
- **Skip Cart** — toggle (checkout directly from product/collection, bypassing cart) — confirmed
- **Products Limitation** — number/dropdown (max products addable from a popup) — confirmed
- Conditional offer rules — toggles: **"Hide Offer if post-purchase upsell was shown"**, **"Hide offer if upsell product is purchased at Checkout"** — confirmed
- **Split test** — variant A/B builder across dimensions: product combination, discount level, discount type ($ vs %), page copy — confirmed

### behavior
- **Application Status** — toggle (master on/off + product syncing) — confirmed
- **OCU Upsells Extension** — app-embed enable (required for storefront widgets/pre-purchase) — confirmed
- **Discount Type & Level** (per product) — select[ $ | % ] + number — confirmed
- **Quantity** (per offer product) — number — confirmed
- **Free Shipping Threshold** — number/currency (draft-order offers) — confirmed
- **Remove Unpaid Item From Orders** (post-purchase) — toggle + time field (default 1 hour) — confirmed
- **Remove Unpaid Item From Orders** (TY page) — toggle + time field (default 30 min) — confirmed
- **Offer Expiration Time** (TY page) — toggle + time field — confirmed
- **Zipify Upsell Tag** — toggle (auto order-tagging of OCU orders) — confirmed
- **Show AI Tips on Funnels list** — toggle — confirmed
- Dynamic/AI offer mode — select (fixed products vs AI best-sellers vs same-product-different-variant) — confirmed

### data
- **Zipify Analytics** — toggle (on by default; behavioral tracking) — confirmed
- **Plan & Billing** — view-only (tier, invoices, billing history) — confirmed
- **Integrations** — pre-built, no-config (Recharge/subscriptions, Zipify Pages) — confirmed
- **Zipify PostProfit** — separate monetization: **Create Account** (button → Stripe onboarding) + **Ad Category Management** (checkboxes to filter ad categories shown on TY page) — confirmed

## data_model
- **External DB (Zipify-hosted)**: funnels, offers, triggers, split-test configs, per-funnel analytics/behavioral events all persist in Zipify's own backend (not Shopify metaobjects). — confirmed (external app), storage engine (inferred)
- **Shopify order mutations**: accepted upsells written back to the live Shopify **order via Order-Edit API**; **order tags** applied; fulfillment holds via **Fulfillment API**. — confirmed
- **Media/CDN**: USP images / custom offer imagery hosted on Zipify/Shopify CDN. — (inferred)
- **Discounts**: applied as per-offer price adjustments / draft-order pricing rather than shared Shopify discount codes (free-shipping bar path noted as "Draft Orders only"). — confirmed (draft-order path), general mechanism (inferred)
- **Payment token**: relies on Shopify-vaulted payment method (Shopify Payments, Shop Pay, PayPal Express, or direct processor) to charge the one-click upsell with no re-entry. — confirmed
- **App embed / theme**: storefront rendering enabled via theme app-embed block ("OCU Upsells Extension"). — confirmed

## visual_patterns
- **Layout archetypes**: (1) modal/popup over product or cart page; (2) inline product-page widget / buy-box list; (3) cart drawer with embedded upsell; (4) full-width post-purchase offer page styled to match checkout; (5) TY/order-status inline offer block; (6) horizontal or vertical multi-product buy-box grid. — confirmed
- **Components**: buy-box (image + title + star rating + USP text/image + discounted price + qty + add button), free-shipping progress bar with dynamic `{{amount_left}}`, incentive/headline banner, accept (one-click add) vs decline link. — confirmed
- **States**: offer shown / accepted (adds without payment re-entry) / declined (advances to downsell or ends) / expired (Offer Expiration Time) / unpaid-removed (auto-cleanup timer). — confirmed
- **Motion/interaction**: single-click add-to-order (no re-checkout), popup show-frequency gating (once per session / until accepted-or-declined / every time), drag-and-drop product reordering in builder. — confirmed
- **Design constraint**: post-purchase offers inherit live checkout styling (limited independent theming) — a known merchant complaint (see below). — confirmed

## reviews_signal
**Praises**
1. Real, measurable AOV/revenue lift (e.g. "$53 AOV with upsells vs $45 without", "11x ROI", six-figure attributed revenue). — confirmed
2. Support quality — repeatedly called best-in-class; team proactively helps optimize funnels. — confirmed
3. No-code, fast setup ("setup took minutes"). — confirmed
4. Honest/transparent analytics — with-vs-without AOV side by side; merchants trust it over competitors that over-claim credit. — confirmed
5. Built-in split testing + AI/pre-built funnels lower the effort to optimize. — confirmed

**Complaints**
1. **Payment-capture failures** — an upsell is added to every order but payment silently isn't captured, forcing manual processing (the highest-severity failure mode). — confirmed
2. **Limited design customization** — can't fully match store look/feel (esp. post-purchase inheriting checkout styling). — confirmed
3. **Customer friction** — extra offer steps add friction; some merchants weigh it against conversion. — confirmed
4. **Uncertain fit for high-ticket/premium AOV** (e.g. £400+) items. — confirmed
5. **Integration / offer-setup gaps** historically (partly addressed in newer versions). — confirmed

## mapping_note
Maps to our RecipeSpec vocabulary as a **cross-surface blueprint**, not a single module. A one-shot pre-purchase popup (`theme.section`/`proxy.widget` with product-picker + discount + copy + style tokens) fits a single RecipeSpec cleanly. Everything past that **exceeds** a single-module recipe:

- **Multi-surface coordinated funnel**: one logical offer sequence spans `proxy.widget` + `checkout.upsell` + `postPurchase.offer` + `checkout.block`, with **state handoff between surfaces** (conditional rules like "hide if purchased at checkout" / "hide if post-purchase already shown"). Needs a blueprint that provisions several extension types and a shared runtime funnel object — not one recipe.
- **Persistent stateful data store + rule engine**: Funnels, triggers, split-test variants, priority ordering, and per-funnel analytics live in an owned DB with a trigger/priority evaluation engine (product/collection/cart-count/cart-total/location → which funnel wins). This is a rule engine + entity store, well beyond declarative module settings.
- **External side-effects on live orders**: accepting an upsell mutates the real Shopify order via **Order-Edit API**, holds **Fulfillment API**, applies order tags, and one-click-charges the **vaulted payment token** — real transactional side effects our module vocabulary doesn't express.
- **Background jobs**: timed **auto-removal of unpaid items** (1 hr / 30 min) and **offer expiration** require scheduled/deferred workers; split-test traffic allocation + AI dynamic-offer resolution are ongoing background processes, not render-time config.
