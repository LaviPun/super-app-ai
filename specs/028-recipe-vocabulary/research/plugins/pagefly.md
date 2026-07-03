# PageFly Landing Page Builder

> Status note: The app is live and actively developed under the same vendor (PageFly). Not renamed, merged, or deprecated. Some legacy help-center URLs are mirrored under `/manual/`, but the product is current. This is NOT a Bold app — no vendor migration to account for.

## identity
- **name**: PageFly Landing Page Builder — "Build proven CRO-focused pages with pro flexible customization" (confirmed)
- **vendor**: PageFly (confirmed) — team based in Hanoi, VN with India operations (inferred from listing metadata)
- **category**: Page builder / Store design → Storefronts (confirmed)
- **App Store URL**: https://apps.shopify.com/pagefly (confirmed)
- **rating**: 4.9 / 5 (confirmed)
- **review count**: ~5,644–5,760 reviews as of mid-2026 (confirmed; count is climbing — third-party aggregators cite 11,900+ lifetime but the live listing shows ~5.6–5.7k)
- **install signal**: ~184,006 stores per StoreLeads; vendor markets "200,000+ merchants" (confirmed via aggregator; vendor figure is marketing (inferred))
- **pricing model**: Freemium + "published slot" quota model, monthly recurring (confirmed). Free $0 (1 published slot); Builder $24/mo (5+ slots); Optimize $39/mo (20+ slots, AI CRO Beta); Accelerate $99/mo / $990/yr (unlimited slots, full AI CRO). "1 slot = 1 page or 1 section." Gradient color picker gated to PAYG/slot plans. (confirmed)
- **launched**: Sept 28, 2017 (confirmed)

## surfaces
PageFly is fundamentally a **theme-surface page/section builder**. It publishes full pages and reusable sections into the merchant's live theme via a Shopify **theme app extension**, and coordinates them from an embedded admin editor.

- **theme.section** — PRIMARY surface. PageFly builds full custom pages (landing, home, product, collection, blog, 404, coming-soon, about, contact, FAQ, thank-you, link-in-bio, pricing, etc.) AND standalone reusable "Sections" that drop into the theme via a theme app extension block. Published pages register as Shopify Online Store Pages with a theme template suffix; sections render through the theme extension. This is where ~all merchant-facing output lands. (confirmed)
- **admin.block** — the entire PageFly Editor is an embedded admin app surface (drag-drop canvas, element panel, styling inspector, page settings, version history, analytics dashboard, A/B test manager). Not a Shopify `admin.block` extension per se, but functionally the merchant-facing control plane. (inferred — it is an embedded app, not a Shopify admin UI extension of the checkout/order type)
- **analytics.pixel** — PageFly injects tracking and has its own event/analytics layer ("PageFly Event" tracking IDs set per element), reads web pixels, and integrates Facebook Pixel + store analytics. Built-in analytics captures Sessions, Visitors, Add-to-cart rate, Product view rate, Sales, Conversion rate; plus click/scroll heatmaps. (confirmed)
- **proxy.widget** — (inferred) some dynamic elements (forms, product recommendation blocks, third-party embeds) behave like app-served widgets inside theme pages, but the dominant delivery is theme-extension-rendered, not app-proxy.
- **checkout.upsell / checkout.block** — listing states "Checkout extensions compatible" and PageFly can build a Thank-You page, but PageFly does NOT own checkout UI extensions; it interoperates with them. (inferred — no first-party checkout extension surface)
- NOT used: functions.cartTransform, functions.discountRules, functions.deliveryCustomization, functions.paymentCustomization, postPurchase.offer, admin.action, pos.extension, customerAccount.blocks, flow.automation. (confirmed by absence — PageFly is presentation/CRO, not a pricing/logistics/automation engine)

**Cross-surface coordination**: The admin Editor is the single source of truth. Merchants build in the editor → hit **Publish** → PageFly writes the page/section into the theme via the theme app extension and links it to a Shopify Online Store Page + template. **Global Sections** and **Global Styles** propagate shared state (a change to a global section updates every page embedding it). A/B testing coordinates two theme-rendered variants (Control vs Variant) behind one URL, splitting traffic and reconciling into the analytics surface. So: admin editor (authoring) ⇄ theme extension (rendering) ⇄ analytics/pixel (measurement) form a closed CRO loop with shared global state.

## functional_model
Core entities PageFly manages:

- **Page** = { id, name, pageType (Regular | Home | Product | Collection | Blog Post | Password), urlHandle, themeTemplateName (template suffix), publishStatus, elementTree (JSON layout), globalStyleRef, seo/socialShareImage, assignment } (confirmed)
- **Section** = reusable element subtree publishable independently into theme via extension block; can be **Global Section** (single definition, many embeds) (confirmed)
- **Element** = node in the page's element tree: { type, generalSettings, stylingSettings, responsiveOverrides{device→style}, animation, trackingId } — types drawn from Containers / Basic / Media / Social / Advanced / Shopify-data element libraries (confirmed)
- **GlobalStyle** = shared design tokens (fonts, colors) applied across pages (confirmed)
- **PageVersion** = snapshot in Version History for rollback (confirmed)
- **ABTest** = { controlPage, variantPage(s), trafficSplit, primaryMetric, durationTarget, Bayesian result } — control is a duplicate of the live page; winner is published (confirmed)
- **PageAssignment** = mapping of a Product/Collection page template to specific product(s)/collection(s) OR "apply to all" (confirmed)
- **AnalyticsEvent** = per-element trackable event keyed by a merchant-set trackingId, aggregated into conversion/engagement metrics + heatmaps (confirmed)

Relationships: Page 1—* Element (tree); Page *—1 GlobalStyle; Section (global) 1—* Page (embed); Page 1—* PageVersion; ABTest 1—* Page(variant); Page *—* Product/Collection via PageAssignment.

## settings_taxonomy
Merchant-facing controls, grouped. Element-level Styling-tab controls confirmed from the help-center Styling Tab inventory; page-level from Page Settings.

### content
- **Element library (add via drag-drop)** — palette: **Containers** (Layout/rows/columns, Content List), **Basic** (Heading, Paragraph/Text, Button, Image, Icon, Divider, List), **Media** (Image, Video, Slideshow, Hero Banner), **Social** (share/follow), **Advanced** (Countdown Timer, Mailchimp Form, Google Map, Progress bar, Table, Tabs, Accordion), and **Shopify-data** elements (Product List, Product Details, Collection List, Customer Form, Blog). (confirmed)
- **Heading / text content** — text (rich text input) (confirmed)
- **Button** — label text, link/URL target (text) (confirmed)
- **Image / Video** — media source (image upload / video URL) (confirmed)
- **Shopify Product Details / Product List / Collection List** — product-picker / collection-picker bindings to live Shopify catalog (confirmed)
- **Page Title** — text (confirmed)
- **Custom Code element** — HTML / Liquid / CSS / JS injection (text/code editor) (confirmed)
- **100+ page templates & 100+ premade sections** — select (template gallery) (confirmed)

### style
(Element Styling tab — all support **per-device responsive overrides** via a Device Switcher: All Devices | Desktop | Tablet | Mobile) (confirmed)
- **Size & Layout**: Width `select[Fill container|Hug content|Fixed]`, Height `select[Fill|Hug|Fixed]`, Max/Min Width, Max/Min Height `number`; Direction `select[Horizontal|Vertical]`; Reverse Order `toggle`; Horizontal Gap / Vertical Gap `number`; Align Items `select[Top/Left|Middle|Bottom/Right|Stretch|Baseline]`; Justify Content `select[Start|Center|End|Space between|Space around|Space evenly]`; Content Width `select[Fill container|Max width]` (Flex Sections). (confirmed)
- **Spacing**: Padding (Top/Right/Bottom/Left) `4× number`; Margin (Top/Right/Bottom/Left) `4× number`. (confirmed)
- **Typography**: Font Family `select` (6 predefined + custom fonts supported); Font Size `number`; Text Alignment `select`; Text Style `select`; (More Settings) Font Weight `select`, Line Height `number`, Letter Spacing `number`, Text Transform `select`. (confirmed)
- **Content Color** (text/icon color) `color`. (confirmed)
- **Background**: Background Color `color`; Background Gradient `toggle` → Color Stops (up to 10) `color`, Gradient Type `select[Radial|Rotational]`, Position `number` (slot-plan gated); Background Image `image upload`. (confirmed)
- **Border**: Border Style `select`, Border Color `color`, Border Radius `number`. (confirmed)
- **Effects**: Opacity `slider/number`; Shadow `toggle` → Horizontal Offset / Vertical Offset / Blur `number`, Shadow Color `color`. (confirmed)
- **Animation**: apply animation to element, trigger `select[on load | on hover]`, animation type `select`. (confirmed)
- **Advanced (per element)**: Custom CSS `code editor`; Override Theme Styling `toggle`; Enable Theme Styling `toggle`. (confirmed)
- **Copy Styles / Paste Styles** — action buttons to replicate styling across elements. (confirmed)
- **Global Styles** — shared fonts/colors `select/color` applied store-wide. (confirmed)

### targeting
- **Page Type** `select[Regular|Home|Product|Collection|Blog Post|Password]`. (confirmed)
- **Page Assignment** (Product/Collection pages): assign to specific product(s)/collection(s) via product-picker/collection-picker, OR "apply to all products/collections" `toggle/select`. (confirmed)
- **Header/Footer Visibility** `toggle` (show/hide theme header/footer). (confirmed)
- **Theme Sections show/hide** `toggle` per component (blog pages add: blog info, tags, featured image, comments toggles). (confirmed)
- **A/B test traffic split** — variant allocation `number/select` + primary metric `select`. (confirmed)
- Per-visitor/geo/segment display rules — NOT a first-party feature; PageFly relies on A/B split + assignment, not audience targeting rules. (inferred)

### behavior
- **Publish / Unpublish status** `toggle` (publishing auto-enables the theme extension). (confirmed)
- **Lazy Loading** for images `toggle` (page-level optimization). (confirmed)
- **Animation triggers** (on load / on hover) `select` — behavioral, listed above. (confirmed)
- **A/B Testing**: create Control (auto-duplicate) + Variant, run test, `primary metric select`, `duration target`, Bayesian evaluation, publish winner. Also integrates external **Shoplift A/B Testing**. (confirmed)
- **Per-element Tracking ID** (`text`) → "PageFly Event" conversion tracking. (confirmed)
- **Bulk publishing**, **Import/Export** of pages, **Version History** rollback `action`. (confirmed)
- **Countdown Timer** behavior (end date/time, on-expire action) `datetime/select` (confirmed element exists; exact sub-controls inferred).

### data
- **SEO / Social Sharing Image** `image upload` (Regular pages); SEO title/meta controls exist in page settings (confirmed image; title/meta inferred — not enumerated in the Page Settings help page).
- **Custom Code (page-level)**: HTML / CSS / JS / Liquid injection `code editor`. (confirmed feature; page-level scope inferred)
- **130+ app integrations** (Klaviyo, Judge.me, Loox, etc.) surfaced as embeddable Third-party Elements `select/embed`. (confirmed)
- **Shopify metafield binding** — supports Product Definition and Variant Definition metafield types, bound into elements (e.g., product page fields) `metafield-picker`. (confirmed)
- **Facebook Pixel / web pixel / store analytics** connection `text (pixel ID)` / integration toggle. (confirmed)

## data_model
- **Published pages** are written into the merchant's **Shopify store database as Online Store Pages** (visible under Online Store → Pages) with a **theme template suffix**; content renders through PageFly's **theme app extension** block. (confirmed)
- **Page layout / element tree** (the actual design JSON), versions, global sections, global styles, and A/B test config are persisted in **PageFly's own external database/backend** (the app is the source of truth; the Shopify page is the published render target). (inferred — standard for this class; the editor state and version history clearly live app-side)
- **Media/assets** — images uploaded via the editor are stored on Shopify's CDN and/or PageFly asset storage; custom fonts hosted for the theme. (confirmed images use Shopify CDN; PageFly asset hosting inferred)
- **Metafields** — reads Product/Variant Definition metafields from Shopify to bind dynamic content. (confirmed)
- **Analytics/events** — per-element tracking events and aggregated metrics (sessions, CVR, ATC, heatmaps) stored in PageFly's analytics backend. (confirmed the data exists; storage location inferred)
- **Data access scopes** (from listing): customer browsing behavior, device/activity/geolocation/IP, products, orders, store analytics, Online Store pages, theme files, web pixels, inventory, product tags, translations. (confirmed)
- **Uninstall behavior**: removing the app deletes PageFly-authored pages/renders (recurring complaint), implying the live render is bound to the extension, not fully native content. (confirmed via reviews)

## visual_patterns
- **Layout archetypes**: section → row/column (Layout container) → element nesting; Flex Sections with direction/gap/align/justify (a flexbox model exposed as GUI controls); Hero Banner, Slideshow, Tabs, Accordion, Content List, sticky sections, multi-column grids, product grids/lists. (confirmed)
- **Component states**: hover (animation + style), on-load animation, responsive per-device variants (desktop/tablet/mobile overrides), A/B Control vs Variant states, published vs draft, global-section synced state. (confirmed)
- **Motion/interaction**: element animations triggered on load or hover; parallax; lazy loading; countdown timers; slideshow/carousel transitions; sticky sections; drag-drop authoring with Copy/Paste Styles and an Inspector panel. (confirmed)
- **Editor UX**: left vertical toolbar (Page Content, Elements [PageFly/Shopify tabs], Third-party Elements, Templates, Page Assignment, Page Settings, Version History, Custom Code, Live Chat); Inspector toolbar (context settings + General/Styling/Advanced tabs); Header toolbar (save/publish, device switcher, canvas size, preview). (confirmed)

## reviews_signal
**Top praises** (confirmed):
1. Exceptional, responsive 24/7 support — most-cited positive; agents "go the extra mile," fast resolution.
2. Intuitive drag-drop editor — build custom pages with no code, "easier and more efficient."
3. Deep design flexibility — extensive control plus HTML/CSS/JS escape hatch for advanced needs.
4. Long-term reliability for many — multi-year users report "zero problems."
5. SEO-friendly output — designers value not compromising SEO.

**Top complaints** (confirmed):
1. Crashes / internal server errors / console downtime — "constantly crashes," lost editor access ~monthly for extended periods; unacceptable for revenue-critical sites.
2. Theme-update conflicts — pages break after theme changes; one report of "100+ unauthorized changes" to the store.
3. Destructive uninstall — removing the app deletes PageFly pages even if rebuilt, forcing wholesale page rebuilds.
4. Poor damage-recovery support — support denies responsibility, demands elevated access instead of restoring.
5. Page-speed / performance degradation after heavy customization; theme-compatibility issues.

## mapping_note
A single **PageFly Section** maps cleanly onto our `theme.section` RecipeSpec vocabulary: it's an element tree with content bindings, a responsive-per-device styling model, product/collection pickers, and animation/behavior toggles — all expressible as a validated module spec. Our settings_taxonomy headings (content/style/targeting/behavior/data) line up almost 1:1 with PageFly's General/Styling tabs, page assignment, and integrations.

Where PageFly **EXCEEDS a single-module recipe**:
1. **It's a multi-page/site builder with a persistent app-side data store and Global Sections/Styles** — one authored change propagates across many pages and template assignments (cross-surface, shared-state blueprint), not one self-contained module. Requires an external DB owning the element-tree JSON, versions, and global tokens — far beyond a stateless recipe.
2. **A/B testing = a background experimentation engine**: traffic-split rendering of Control vs Variant behind one URL, event collection, and Bayesian statistical evaluation over days/weeks with automatic winner selection — a stateful rule/experiment engine plus scheduled evaluation jobs, not a module knob.
3. **A first-party analytics + heatmap pipeline**: per-element tracking IDs feeding continuous event ingestion, aggregation, and click/scroll heatmaps — an external side-effect data pipeline (pixel + backend) that a recipe cannot own.
4. **Publish/lifecycle orchestration into the theme + Shopify Pages, with template assignment and 130+ integration embeds** — provisioning a theme-app-extension render target, wiring Online Store Pages, binding metafields, and coordinating cross-app integrations is an orchestration/side-effect layer above a single validated module spec.
