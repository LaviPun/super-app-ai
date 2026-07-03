# Hextom: Countdown Timer Bar

> Status note: App is live and actively maintained (not renamed/merged/deprecated). It is a Hextom app, not a Bold app. App Store handle/slug is `event-promotion-bar` (legacy slug — the app was launched Oct 20, 2015 as an "Event Promotion Bar" and later rebranded to "Countdown Timer Bar"; the slug never changed). "Built for Shopify" badge present. confirmed

## identity
- **name**: Hextom: Countdown Timer Bar — confirmed
- **vendor**: Hextom (Richmond Hill, ON, Canada) — confirmed
- **category**: Countdown timer / Marketing and conversion (urgency, flash sales, announcement bar). Task-assigned bucket: discounts. — confirmed
- **App Store URL**: https://apps.shopify.com/event-promotion-bar — confirmed
- **rating**: 4.9 / 5 — confirmed (App Store listing). Aggregators show drift (one reported 4.7/626, another 4.9/1474) — treat 4.9 as canonical. confirmed
- **review count**: 736 total on the App Store (691 5★ / 34 4★ / 4 3★ / 3 2★ / 4 1★ = 94% 5★) — confirmed
- **install signal**: "Popular with stores like yours" on listing; third-party trackers (StoreLeads/OpenStore) cite ~18,700 live installs — confirmed listing badge, (inferred) exact install count from third-party trackers
- **pricing model**: Freemium. **Free** plan + **Premium $9.99/mo** (or $99/yr, ~17% savings) with 7-day free trial. — confirmed
  - Free: event-based (Standard) timer, display at any position, device targeting, page targeting, add link to bar, emoji support
  - Premium: everything in Free + **unlimited active bars**, **daily/weekly/recurring/interval/session timers**, **geo targeting via Shopify Markets**, **social/UTM targeting**, **bar background images**

## surfaces
Primary rendering is a storefront theme injection (announcement/promo bar). It is single-storefront-surface but multi-*placement* within the theme, plus an admin configuration app.

- **theme.section** — PRIMARY. confirmed. Renders as a **Theme App Block / App Embed** for Online Store 2.0 themes ("Theme App Block for 2.0 Themes" help article). Shows a horizontal bar containing: message-before-timer text + live countdown timer widget + message-after-timer text + optional CTA button + optional close (X). Placements: **Top of page** (announcement/sticky), **Bottom of page**, **Below Add-To-Cart button** on product pages, and **Custom Placement** (block dropped anywhere in the theme editor). confirmed
- **admin.block** — (inferred, weak) The merchant-facing config lives in the embedded Shopify Admin app (bar list + editor). This is the app's own admin UI rather than an Admin UI Extension block; mapped here only to note the admin authoring surface exists. Not a checkout/POS/customer-account extension. confirmed that config is in-admin; (inferred) exact extension mechanism
- Explicitly NOT present: no Functions (cart/discount/delivery/payment), no checkout extensions, no post-purchase, no POS, no customer-account blocks, no analytics pixel, no Flow automation. The bar is display-only urgency; it does **not** create or apply discounts itself (a recurring merchant misunderstanding — see reviews). confirmed

**Coordination across placements**: Multiple bars can be authored (Premium = unlimited). Rendering is arbitrated by a precedence rule: **only one timer displays per page**, and a **top-position bar takes precedence** over others on the same page. To show a second bar (e.g. below Add-To-Cart) simultaneously, the merchant must use **targeting filters** so the two bars don't both resolve to the same page. So "shared state" is really a client-side resolution/precedence layer picking one eligible bar per page from the authored set. confirmed

## functional_model
Core entities (field names confirmed from the editor; value spaces partly (inferred)):

- **Bar** = {
    `name` (internal-only label),
    `content` → { messageBefore, messageAfter, cta, closeButton },
    `timer` → Timer,
    `style` → Style,
    `placement` → Placement,
    `targeting` → [TargetingRule],
    `customCode`,
    `active` (bool)
  } — confirmed
- **Timer** = discriminated union on `type ∈ {Standard, Daily, Interval, Session}`:
  - Standard = { startBehavior: immediate | scheduledStart, endTime: datetime } — confirmed
  - Daily = { timezoneBasis: customerLocal | merchantLocal, dailyStart, dailyEnd, daysOfWeek: bool[7], repeatPerCustomer: oncePerCycle | everyVisit, campaignStart, campaignEnd } — confirmed
  - Interval = { countdownLengthHours, pauseLengthHours, startTime, repeat: once | everyVisit, campaignEnd } — confirmed
  - Session = { durationMinutes (per-visitor, starts on arrival), repeat: once | everyVisit, start, end } — confirmed
- **CTA** = { mode: buttonWithLink | entireBarClickable | none, url } — confirmed
- **Style** = { fontStyle, fontSize, padding, textColor, backgroundColor, backgroundOpacity(0–1), backgroundStyle: SingleColor | Gradient | PatternImage | FittedImage, backgroundImage?, timerStyle, timerBackgroundColor, digitColor, showLabels, labelLanguage } — confirmed
- **Placement** = { position: TopOfPage | BottomOfPage | BelowAddToCart | CustomPlacement, topBehavior } — confirmed
- **TargetingRule** dimensions: Pages, Device, Customer, ShopifyMarkets(geo), Source/UTM — confirmed

Relationships: one Shop → many Bars; each Bar has exactly one Timer, one Style, one Placement, and zero-or-more TargetingRules. Per-visitor timer state (Session/Interval "once per customer") is tracked client-side (cookie/localStorage) rather than server-persisted per shopper. (inferred)

## settings_taxonomy
The actual merchant-facing controls, grouped. Types in parentheses. All confirmed from the getting-started + timer-types + targeting help articles unless marked.

### content
- **Name** (text) — internal-only bar name, not shown to shoppers — confirmed
- **Message before timer** (text) — confirmed
- **Message after timer** (text) — confirmed
- **Emoji support** in message text (text w/ emoji) — confirmed (Free-tier feature)
- **Call to action** (select[ Button with link | Make entire bar clickable | None ]) — confirmed
  - **CTA link / URL** (text/url) — shown when a clickable mode is chosen — confirmed
- **Close button (X)** (toggle) — confirmed
- **AI Assistant** — AI-generated bar copy ("Using the AI Assistant in Countdown Timer Bar" help article) (select/generate action) — confirmed exists, (inferred) exact UX
- **Translation feature** — per-language message variants; storefront languages: English, French, Chinese (Simplified/Traditional), Spanish, Italian, Portuguese (BR/PT), German, Japanese (rule-builder / per-locale text) — confirmed

### style
- **Font Style** (select[typefaces]) — confirmed
- **Font Size** (number) — confirmed
- **Padding** (number) — space above/below text — confirmed
- **Text Color** (color) — confirmed
- **Background Color** (color) — confirmed
- **Background Opacity** (number/slider 0–1) — confirmed
- **Background Style** (select[ Single Color | Gradient | Pattern Image | Fitted Image ]) — confirmed
- **Background Image** (image upload) — Premium; shown for Pattern/Fitted image styles — confirmed
- **Timer Style** (select[ Flip Clock | Plain Numbers | Square Tiles | Circle Tiles | None ]) — confirmed
- **Timer Labels** (toggle) — show/hide Days/Hours/Minutes/Seconds labels — confirmed
- **Label Language** (select[locale]) — confirmed
- **Timer Background Color** (color) — confirmed
- **Digit Color** (color) — confirmed
- **Rotation & animation** (select/toggle) — rotate multiple messages / animate the bar; on listing + features. confirmed exists, (inferred) exact option names
- **Custom Code / Custom CSS** (text/code editor) — "custom styling or scripts that run when the bar loads" — confirmed

### targeting
- **Page Targeting** (rule-builder): options include **All pages**, **Homepage**, **Product pages** (further scoped to specific products individually, **by collection**, or **by product tags**), **Collection pages**, and **specific page by URL** (paste storefront URL into a text field). Cart-page targeting is attempted by merchants but is not a first-class reliable target (see complaints). — confirmed
- **Device Targeting** (select/multi[ Desktop | Mobile ]) — confirmed (Free-tier)
- **Customer Targeting** (rule-builder — logged-in / customer characteristics/segments) — confirmed exists, (inferred) exact segment predicates (tags vs. Shopify segments)
- **Shopify Markets / Geo Targeting** (rule-builder by market/country) — Premium — confirmed
- **Visitor Source / UTM Targeting** (rule-builder matching referral source + UTM params) — Premium ("social/UTM targeting") — confirmed

### behavior
- **Timer Type** (select[ Standard | Daily | Interval | Session ]) — confirmed
- **Timer Display Time / start** (toggle+datetime: display immediately | Schedule to display at a specific time) — confirmed
- **End Time** (datetime) — Standard countdown target — confirmed
- **Timezone basis** (select[ Customer's local time | Your (merchant) local time ]) — Daily timer — confirmed. Caveat: editor UI shows the *editing browser's* timezone, which causes confusion when collaborators edit from different zones. confirmed
- **Days of week** (multi-toggle grid; blue=shown / white=hidden) — Daily timer — confirmed
- **Countdown length (hours)** + **Pause length (hours)** (number+number) — Interval timer — confirmed
- **Session duration (minutes)** (number) — Session timer, starts on visitor arrival — confirmed
- **Repeat / recurrence** (select[ show once per customer (per cycle) | show every visit ]) — Daily/Interval/Session — confirmed
- **Campaign start / end** (datetime range, or manual stop) — confirmed
- **Display Position** (select[ Top of page | Bottom of page | Below Add To Cart button | Custom Placement ]) — confirmed
- **Top-position behavior** (select — sticky vs. static / push-content options) — confirmed exists, (inferred) exact behavior labels
- **Active / Enable** (toggle per bar) — confirmed
- **Precedence**: one bar per page; top bar wins (system behavior, not a knob) — confirmed

### data
- **Bar configuration records** persisted app-side (the authored bars) — confirmed conceptually, storage (inferred)
- **Uploaded background images** persisted to CDN/media — confirmed (Premium image upload implies media store)
- **Per-visitor "shown once" flags** persisted client-side (cookie/localStorage) — (inferred)
- No product/order/customer records are created or mutated; the app does not manage discount codes or inventory. confirmed

## data_model
- **Bar definitions**: stored in Hextom's own backend (app DB), keyed by shop domain; not Shopify metaobjects/metafields visible to merchants. (inferred — no confirmation it uses metaobjects; behavior consistent with an external app DB)
- **Media**: background/pattern/fitted images uploaded and served from a CDN. confirmed (upload capability), (inferred) which CDN
- **Storefront delivery**: a theme app block/embed + injected script reads the shop's active bar set and resolves one eligible bar per page at render time; countdown math runs client-side. confirmed (theme app block), (inferred) resolution mechanism
- **Per-shopper state**: recurrence / "show once" tracked via browser cookie or localStorage (no server-side per-shopper table implied). (inferred)
- **No codes/coupons persisted** — bar does not generate or store discount codes. confirmed

## visual_patterns
- **Layout archetype**: full-width single-row horizontal bar. Left/center message text, inline countdown widget, optional right-aligned CTA button, optional trailing X close. Also a compact inline variant when placed **below Add-To-Cart**. confirmed
- **Countdown widget states**: 4 render styles — **Flip Clock** (animated flip digits), **Plain Numbers** (bare HH:MM:SS), **Square Tiles**, **Circle Tiles** — plus "None" (text-only, no timer). Each with configurable digit color, timer background color, and optional D/H/M/S labels. confirmed
- **Background states**: Single Color, Gradient, Pattern Image (tiled), Fitted Image (cover) with 0–1 opacity. confirmed
- **Motion/interaction**: message **rotation** (cycles multiple messages) + entrance/attention **animations**; sticky vs. static top behavior; whole-bar-clickable vs. button-clickable; dismissible via X. confirmed rotation+animation exist, (inferred) exact animation catalog
- **Timer end state**: on reaching 00:00:00 the bar reaches its end; recurring types (Daily/Interval/Session) restart per their cadence. Standard simply expires. confirmed behavior, (inferred) exact expired-state visual (hide vs. show zeros)
- **Responsive**: renders on mobile; a known weak spot is CTA/button tap behavior on iPhone (see complaints). confirmed weakness

## reviews_signal
**Praises (top):** confirmed
1. Extremely easy setup — "1-click to enable, no coding required"; installs and looks good across themes.
2. Fast, hands-on support — named agents (e.g. "Henry", "Angelo C") resolving issues (incl. mobile) in minutes with custom code.
3. Genuinely useful free tier — event/Standard timer + positioning + device/page targeting + links + emoji at no cost.
4. Conversion/FOMO impact — merchants credit it with lifting conversion by manufacturing urgency.
5. Reliable/stable in normal use — "runs great, no issues."

**Complaints (top):** confirmed except where noted
1. **Mobile/iPhone breakage** — most consistent complaint: bar/CTA buttons don't work on iPhones; "doesn't work well on mobile."
2. **Discount misconception / no auto-apply** — merchants expect the bar to apply a discount; it doesn't (display-only), and "doesn't automatically take the discount" reads as a bug to them.
3. **Leftover code after uninstall** — "after deleting the app it messes up all the coding" (residual theme injection).
4. **Checkout/cart-page targeting fails** — merchants "tried lots of methods," couldn't get a bar to load on checkout pages (checkout is not a supported surface).
5. **"Free but not really" billing frustration** — perception that core/desired features (recurring timers, geo, background images) are paywalled behind Premium despite "free" framing.
   - Note: one 1★ review referenced a *different* app (Searchanise) and is not about this timer bar. (inferred / vendor-clarified)

## mapping_note
Onto our constrained RecipeSpec vocabulary, the happy path is a clean single-module recipe: **one `theme.section` module** (announcement/promo bar block) with a rich but bounded settings schema — text (message before/after, CTA), style (colors, opacity, font, background style, 4 timer styles), a `select` timer-style, a datetime end, and a placement select. A basic **Standard event timer with page + device targeting** maps almost 1:1 to a single theme-section recipe with a client-side countdown.

Where it **EXCEEDS a single-module recipe:**

1. **Cross-placement blueprint with a client-side resolution/precedence engine.** It is not "a bar" but a *fleet* of unlimited bars competing for one slot per page, arbitrated by targeting + a "top bar wins / one per page" precedence rule. That's a multi-instance + runtime-selection layer, not a static section — closer to a coordinated blueprint of theme blocks plus an eligibility resolver than a single module.

2. **A real targeting rule engine** across five orthogonal dimensions (page/product/collection/tag/URL, device, customer/segment, Shopify Markets geo, source/UTM). Evaluating geo + customer + UTM at render time requires runtime context (market, login state, referrer) that a static RecipeSpec settings schema doesn't capture — it needs a rule-builder + client-side evaluator.

3. **Recurring/scheduled timer types with per-visitor state and timezone semantics** (Daily w/ day-of-week grid + customer-vs-merchant timezone basis, Interval run/pause cadence, Session per-visitor duration, "show once per customer"). This is stateful, time-driven behavior (persisted per-shopper recurrence flags; timezone-relative scheduling) — beyond declarative static content into scheduling + per-visitor state that a single render-once module can't express.

4. **Persisted media + external app-side config store.** Background image uploads (CDN) and shop-scoped bar definitions living in the app's own backend imply a data store and asset pipeline, not just inline theme settings — a side-effectful backend a pure single-module recipe doesn't own.
