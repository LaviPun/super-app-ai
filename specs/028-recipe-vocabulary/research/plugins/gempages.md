# GemPages Landing Page Builder

> Vocabulary-study research record. Facts labeled **confirmed** (from App Store listing, vendor docs/help center, or review aggregators) or **(inferred)** where I extrapolated from adjacent evidence. The app is live and actively developed (not deprecated/merged) — vendor is GEMCOMMERCE CO., LTD, not Bold. Current editor generation is **v7** (v6 is legacy; help center flags older articles as `[V6]`).

## identity
- **name:** GemPages Landing Page Builder — Build high-converting landing page, post-purchase upsell | CRO — **confirmed**
- **vendor:** GEMCOMMERCE CO., LTD (Hanoi, Vietnam) — **confirmed**
- **category:** Page builder / Store design (page-builder) — **confirmed**
- **App Store URL:** https://apps.shopify.com/gempages — **confirmed**
- **rating:** 4.9 / 5 — **confirmed**
- **review count:** ~3,585–3,795 reviews (grew across fetches during research; ~95% 5-star, ~1% 1-star) — **confirmed**
- **install signal:** ~65,000 active installs; vendor claims 165,000+ merchants served and 1,800,000+ pages created (cumulative marketing figure, not active installs) — **confirmed** (install count from storeleads-class aggregator + listing copy)
- **pricing model:** Freemium subscription. Free ($0, 1 published page) / **Build $29/mo** (unlimited published pages, CRO templates, AI Image-to-Layout capped ~300 sections, 20 theme sections) / **Optimize $59/mo** (sales funnels + post-purchase upsell, instant/A-B landing pages, unlimited AI Image-to-Layout, priority support) / **Enterprise $199/mo** (all Optimize + page scheduling, video-call support). Launched 2017-03-13. — **confirmed** (per-tier feature gating partly **(inferred)** — vendor pricing page is vague on exact matrices)

## surfaces
GemPages is fundamentally a **page-body renderer + funnel engine**. It owns the body between the theme header/footer and layers a post-purchase funnel on top. Mapped to our allowlist:

- **theme.section** — PRIMARY surface. Every GemPages page publishes as a Shopify page template (JSON template, e.g. `collection.gem-<id>-template.json`) whose body is a GemPages-rendered section, plus a standalone **Theme Section** feature that injects reusable global/standard sections into any OS 2.0 theme via the Theme Editor (app-embed/section blocks). Shows: the entire drag-and-drop-authored page (hero, product detail, collection grid, blog, FAQ, landing content, etc.). — **confirmed**
- **postPurchase.offer** — Sales Funnels feature renders a **native Shopify post-purchase page** after checkout with upsell → (decline) → downsell offers. Shows: 1–4 offer products per step, discount, accept/decline. Gated to Optimize+. — **confirmed**
- **checkout.upsell** — Listing explicitly names "Checkout upsell" alongside post-purchase; **(inferred)** this rides the same funnel engine on the checkout/thank-you surface (checkout UI extension). — **(inferred)**
- **analytics.pixel** — Injects an analytics/tracking script (~20KB of the 5-script bundle) for funnel + page performance/activity logs; A/B test result collection implies event capture. — **(inferred, strong)**
- **admin.block / admin.action** — The entire authoring experience is an embedded admin app (page list, editor canvas, funnel builder, template library, global styles) — this is the app's own admin UI rather than a Shopify `admin.*` block extension per se. Mapped here as the closest vocabulary. — **(inferred)**
- NOT used: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, checkout.block, pos.extension, customerAccount.blocks, flow.automation. Discounts on funnel offers are applied through the funnel/order path, not a Shopify Function. — **(inferred)**

**Cross-surface coordination:** The GemPages **backend/dashboard is the source of truth**. Editing a page/section/global-style in the dashboard re-generates and re-syncs the Shopify theme template code automatically (handoff = dashboard → Shopify template JSON/Liquid). **Global Styles** and **Theme Sections** are shared state: one edit propagates to every page/template that references them. The **Sales Funnel** coordinates the storefront product page (add-to-cart) → Shopify checkout → post-purchase offer page via **Dynamic Triggers** (order contents → which offer shows), so the funnel spans multiple surfaces bound by trigger rules on the completed order. — **confirmed**

## functional_model
Core entities (concrete shapes; field names **(inferred)** from documented behavior unless noted):

- **Page** = { id, page_type (home | product | collection | landing | advertorial | blog | article | faq | help-center | contact | about | pricing | reviews | press | career | legal | link-in-bio | quick-view | footer | popup | form | custom), title, status (draft | published | scheduled), shopify_template_handle, assigned_products[], sections[], seo{...}, schedule_at? } — page_type list **confirmed**; template handle **confirmed**
- **Section** = { id, kind (standard | global | theme-section), rows[] } — global/theme-section reuse **confirmed**
- **Row** = { columns (1–6 preset layouts), layout, gap, background, spacing } — **confirmed**
- **Element** (leaf) = { type, settings{}, design{}, advanced{} } where type ∈ Text/Heading, Button, Image, Video, Icon, Icon List, Countdown Timer, Tab/Product Tabs, Accordion, Carousel, Hero Banner, Form (email/text/dropdown/checkbox), Product, Product List, Product Variants & Swatches, Product Add-to-Cart Button, Product Description, Bundle, Before & After, Stock Counter, Testimonial — **confirmed** (element roster from help center)
- **GlobalStyle** = { typography_presets (H1–H6 + 3 paragraph presets: family, size, line-height, weight, style, letter-spacing), color_palette (up to 15 colors across Button/Text/Background/Line/Accent categories), spacing_scale (10 responsive spacing tokens), row_width, page_padding, corner_radius (Small/Medium/Large) } — **confirmed**
- **DynamicProductBinding** = Page ↔ products: "0 Products Assigned" picker linking one/many products OR "Apply to all products" (template scope). Product elements auto-pull { title, price, images, SKU, inventory, variants, metafields }. — **confirmed**
- **SalesFunnel** = { trigger (DynamicTrigger), offer_step, downsell_step } where **DynamicTrigger** = { conditions[], logic (AND | OR) } evaluated against the customer's order; each offer/downsell = up to 4 products; each step supports A/B (version A + B, ≤4 products each) → max 16 products/funnel. — **confirmed**
- **ABTest** = { variant_a, variant_b, split, metric } on funnel offers (and landing pages on Optimize+). — **confirmed** (funnel A/B **confirmed**; landing A/B **(inferred)**)
- Relationships: Page → Sections → Rows → Columns → Elements (tree). GlobalStyle and Theme Section are many-to-many shared references. SalesFunnel is order-scoped, decoupled from Page. DynamicTrigger is the rule engine linking order state → offer.

## settings_taxonomy
The actual merchant-facing controls, grouped. Element-level UI is split into **Settings**, **Design**, and **Advanced** tabs. Sources: help center element/style/background/advanced/funnel articles.

### content
- **Text / Heading:** rich text body (text), heading level H1–H6 (select), link (text/URL). — confirmed
- **Button:** label (text), link/URL (text), icon (select — 700+ icons), icon position (select). — confirmed
- **Image:** source (image picker / media library), alt text (text), link (text). — confirmed
- **Video:** source (select: YouTube / Shopify-hosted / URL), URL (text), autoplay/loop (toggle). — confirmed
- **Countdown Timer:** end date & time (datetime), evergreen/recurring vs fixed (select), labels (text). — confirmed (target date/time confirmed; evergreen **(inferred)**)
- **Stock Counter:** stock quantity source / number (number), scarcity message (text). — confirmed (element exists; field detail **(inferred)**)
- **Before & After:** two images (image ×2), slider/handle (implicit). — confirmed (element exists)
- **Accordion / Tab:** items[] (repeater of title + content), accordion type (select: Single | Multiple). — confirmed
- **Form:** field set (email, text, dropdown, checkbox), field labels (text), submit action (**(inferred)**). — confirmed (field types)
- **Product elements:** product source (product-picker "Assign Products" OR dynamic "Apply to all products"), fields shown (title/price/SKU/description/inventory — toggles), Add-to-Cart behavior (select: redirect to checkout | open cart drawer | stay on page). — confirmed
- **Product Variants & Swatches:** display style (select: color swatch | dropdown | button), attributes (color/size/material), variant metafield binding (select/source). — confirmed
- **Bundle:** bundled products (product-picker, multi). — confirmed (element exists)

### style
- **Typography:** font family (select — Google Fonts + custom fonts), font size, line-height, letter-spacing, font weight (select), font style, text color (color), alignment (select). — confirmed
- **Background (per row/column/element):** type (select: Color | Gradient | Image | Video). Color = HEX/color-picker + eyedropper. Gradient = multi-stop slider + direction selector. Image = image picker + scale (select: Cover | Contain), position (select), repeat (select), attachment (select: scroll | fixed/parallax), **LCP pre-load toggle**. Video = source (YouTube/external) + URL + loop toggle. — confirmed
- **Spacing (Design tab):** margin T/R/B/L (number/px), padding T/R/B/L (number/px), column gap / item spacing (slider/number). — confirmed
- **Shape (Advanced):** border (width/style/color composite), corner/border radius (number px or %), shadow (color + blur + spread + offset). — confirmed
- **Effects:** opacity (slider 0–100%). — confirmed
- **Layout / Row:** columns per row (select: 1–6 presets), row width (number px), responsive column stacking. — confirmed
- **Global Styles (page-wide):** typography presets H1–H6 + 3 paragraph presets; color palette (≤15 colors across Button/Text/Background/Line/Accent); 10 responsive spacing tokens; row-width default (1200px desktop); page padding; corner-radius Small/Medium/Large. — confirmed

### targeting
- **Responsive visibility ("Display On"):** Desktop / Tablet / Mobile show-hide (toggles per breakpoint) — per element. — confirmed
- **Product assignment scope:** "Apply to selected products" (product-picker) vs "Apply to all products" (template-wide) — the dynamic-binding targeting knob. — confirmed
- **Sales Funnel Dynamic Trigger:** condition rule-builder over order (product / collection / cart-value conditions) with AND | OR logic — determines which post-purchase offer appears to whom. — confirmed
- **Page scheduling / publish window:** schedule publish date (datetime) — Enterprise. — confirmed
- **A/B test split:** variant A vs B assignment on funnel offers (and landing pages). — confirmed

### behavior
- **Animation (Advanced):** enable (toggle); "When Appear" (select: Fade | Slide | Zoom | Shake | None) with speed/delay/easing; "When Hover" (select: Zoom | Shake | None). — confirmed
- **Interactions:** custom interaction builder ("Create" button launches setup) — element event→action bindings. — confirmed
- **Position (Advanced):** position property (select: Static | Relative | Absolute | Sticky | Fixed) + T/R/B/L offsets (number). — confirmed
- **Add-to-Cart behavior:** redirect to checkout | open cart drawer | stay (select). — confirmed
- **Countdown expiry action:** implicit hide/redirect on zero — **(inferred)**.
- **Funnel decline flow:** accept → next; decline → downsell branch. — confirmed
- **LCP pre-load:** eager-load banner near-viewport (toggle). — confirmed

### data
- **Product source binding:** product-picker (assign 1..n) OR dynamic template scope; auto-pulls Shopify product data (title/price/images/SKU/inventory/variants). — confirmed
- **Variant metafield binding:** display Shopify variant/product metafields (source select). — confirmed
- **Collection / Product List source:** collection or product set (product-picker / collection source) with sort/limit. — confirmed (element exists; sort/limit **(inferred)**)
- **Blog / Article List source:** blog/article dynamic source. — confirmed (element exists)
- **SEO fields:** page title, meta description, URL handle (text) — **(inferred, standard)**.
- **Custom code / CSS:** custom CSS class (text), custom code embed / custom fonts. — confirmed
- **Integrations pull-in:** 160+ app integrations (Judge.me reviews, Klaviyo, Instafeed, Parcel Panel, Releasit COD, Bundles) surfaced as embeddable third-party blocks/elements. — confirmed

## data_model
- **Primary store = GemPages backend/dashboard** (external DB, source of truth for page trees, sections, global styles, funnels, A/B configs). — confirmed
- **Shopify theme templates:** on publish, GemPages generates/syncs a **Shopify page template** (JSON template + generated Liquid/section, e.g. `collection.gem-<timestamp>-template.json`) visible in the theme code editor; changes in the editor re-write this automatically. — confirmed
- **Theme Sections / app-embed:** reusable sections injected into OS 2.0 themes via Theme App Extension blocks (Theme Editor add/move/remove). — confirmed
- **Runtime bundle:** ~5 JS files ≈ 330KB (core render engine, element libs, interaction handlers, CSS generator, analytics) loaded on the storefront; rendering engine loads synchronously and blocks render. — confirmed
- **Media/CDN:** images/video uploaded to a media library (Shopify CDN and/or GemPages CDN). — **(inferred)**
- **Product data:** NOT copied — bound dynamically from Shopify at render (title/price/inventory/variants/metafields). — confirmed
- **Funnel/A-B data:** offer definitions, trigger rules, and test results persisted in GemPages backend; post-purchase offer rendered via Shopify's native post-purchase surface. — confirmed
- **Uninstall/theme-switch behavior:** switching themes does NOT auto-carry GemPages templates (store reverts to Shopify defaults until republished); vendor provides an "Uninstall Safely" cleanup to strip leftover code — implies orphaned theme code/lock-in risk if not used. — confirmed

## visual_patterns
- **Layout archetypes:** section → row (1–6 column presets) → column → element tree; hero banners, product-detail splits, testimonial carousels, FAQ accordions, before/after sliders, countdown-driven urgency bars, bundle grids, sticky add-to-cart bars. 400+ CRO-expert templates as starting archetypes. — confirmed
- **Component states:** hover (Zoom/Shake), appear-on-scroll (Fade/Slide/Zoom/Shake), responsive breakpoint variants (Desktop/Tablet/Mobile with independent visibility + spacing), accordion single/multiple expand, A/B variant swap, funnel accept/decline/downsell states. — confirmed
- **Motion/interaction:** entrance animations with speed/delay/easing; sticky/fixed positioning; parallax (fixed-attachment background); custom interaction builder (event→action); LCP eager-load; drag-and-drop authoring with blue-slider spacing handles and inline visual editing. — confirmed
- **Design tokenization:** global typography presets, ≤15-color palette, 10 responsive spacing tokens, 3 corner-radius sizes — a lightweight design system applied page-wide. — confirmed

## reviews_signal
**Praises (top):**
1. Exceptional, fast customer support — custom fixes, video walkthroughs, responsive even weekends/holidays (most cited). — confirmed
2. Intuitive drag-and-drop editor; low learning curve despite depth. — confirmed
3. Produces professional, "expensive-looking," high-converting pages with no developer. — confirmed
4. Large CRO template library + 160+ integrations; seamless Shopify integration. — confirmed
5. AI Image-to-Layout (image/URL → editable layout) praised as a fast starting point; v7 improvements. — confirmed

**Complaints (top):**
1. **Page-speed / performance drag** — adds ~300–550ms load, ~330KB across 5 blocking scripts, LCP +0.3–0.55s, INP +60–110ms, mobile PageSpeed −8 to −18 points; render engine loads synchronously. Recurring merchant gripe that it "slows down sections and performance score." — confirmed
2. **Bugginess / reliability** — "incredibly buggy and unreliable," editor going "wonky/unresponsive," especially post-v7; some report pages unusable. — confirmed
3. **Breaks on theme change** — pages go blank / must be republished after switching or updating themes (templates don't auto-carry). — confirmed
4. **Lock-in / leftover code** — dependence on the app for critical landing pages; orphaned theme code unless "Uninstall Safely" is used; long unresolved support cases in worst cases (one alleged 8-month unfixed). — confirmed
5. **Feature paywalling** — key CRO features (funnels, post-purchase upsell, unlimited AI, scheduling, A/B) gated behind Optimize/Enterprise tiers. — confirmed

## mapping_note
Maps cleanly onto our RecipeSpec only for its **theme.section** core: a single GemPages landing/section page is expressible as one `theme.section` recipe with content + style + responsive-visibility + animation knobs, dynamic product binding, and a global-style token set. That single-module slice is squarely in-vocabulary.

Where it **EXCEEDS a single-module recipe:**
- **Persistent multi-entity data store + own source of truth.** Page trees, global styles, reusable Theme Sections, funnel configs, and A/B results live in GemPages' backend and are re-synced into Shopify templates on every edit. A recipe emits one artifact; GemPages maintains a stateful design database with shared references (one global-style edit fan-out to N pages) — that is a cross-surface **blueprint with shared state**, not a module.
- **Rule engine over order state (Dynamic Triggers).** Post-purchase offers are chosen by an AND/OR condition builder evaluated against the completed order — a runtime rule engine + branching (accept → offer, decline → downsell), well beyond static recipe fields.
- **Cross-surface funnel blueprint.** It coordinates storefront product page → Shopify checkout → native post-purchase offer (+ checkout upsell), i.e. multiple extension surfaces (theme.section + postPurchase.offer + checkout.upsell + analytics.pixel) handed off and bound together — a coordinated blueprint, not one surface.
- **A/B experimentation with side-effecting analytics.** Variant split, event capture, and result aggregation require background data collection + an analytics pixel — external side-effects and stored experiment state a lone recipe cannot own.
- **Template-scope dynamic binding (`apply to all products`).** One authored page acting as a product/collection template across the whole catalog is a one-to-many binding closer to a Shopify template type than a single fixed module instance.
