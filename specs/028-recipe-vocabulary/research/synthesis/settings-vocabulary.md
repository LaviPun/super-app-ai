# Consolidated Settings Vocabulary → Candidate Control Packs

**Phase 28 · Synthesis artifact #1.** Union of every `settings_taxonomy` across all 58 plugin records → deduped → organized into reusable, composable **control packs**. This is the raw material for turning the static, hand-authored `RecipeSpec` into a compositional, per-type vocabulary (feeds phase #3 control-packs and #4 composites).

**Method.** Every plugin file groups its merchant knobs under `content / style / targeting / behavior / data`. Those five buckets are *presentation groupings*, not reusable packs — the same field (e.g. "discount type") recurs across bundles, upsells, loyalty, and reviews. This document re-cuts the union along **capability lines**: each pack is a bundle of settings that recurs together and can be attached to many module types.

**Field types** use the existing recipe vocabulary from [`packages/core/src/control-packs/types.ts`](../../../../packages/core/src/control-packs/types.ts) plus the widget hints there (`textarea | color | select | datetime | toggle`), extended with the picker/rule types the corpus demands:
`text · textarea/richtext · number · money · toggle · select · multiselect · color · image · datetime · daterange · duration · product-picker · collection-picker · variant-picker · tag-picker · rule-builder · repeater · code(css/html/js/liquid) · file · metafield-picker · segment-picker · icon-picker`.

**Priority scale** (how often the pack recurs → build order):
- **P0 — universal** (≥40/58 plugins): every module needs it; build first.
- **P1 — very common** (20–39): most module families need it.
- **P2 — common** (10–19): whole categories need it.
- **P3 — category-specific** (4–9): one or two families; ship as opt-in advanced packs.
- **P4 — specialized** (≤3): rare; candidate for a narrow pack or a bespoke field.

**Existing packs** (already in `control-packs/packs/`): `content`, `style`, `page-targeting`, `audience`, `trigger`, `schedule`, `frequency-cap`, `countdown`, `behavior`, `advanced-custom`. Each candidate below is annotated **[exists]**, **[thin — expand]**, or **[new]**. A blunt finding of this study: the current packs are far thinner than the corpus demands (esp. `style`, `targeting`, and everything discount/pricing/recommendation-shaped, which has no pack at all today).

**Plugin category legend** (the "which categories use it" column): `bundles · upsell · reviews · loyalty · popup/email · subscriptions · wishlist · discounts · shipping · checkout · options · restock · search · trust/urgency · page-builder · social-proof · cart`.

---

## Pack index (by priority)

| # | Pack | Priority | Bucket | Status |
|---|------|----------|--------|--------|
| 1 | `content.text` | P0 | content | [exists — expand] |
| 2 | `content.media` | P1 | content | [thin] |
| 3 | `content.i18n` (translations) | P1 | content/data | [new] |
| 4 | `style.tokens` (color/type/spacing) | P0 | style | [exists — expand hard] |
| 5 | `style.layout-archetype` | P1 | style | [new] |
| 6 | `style.placement` | P1 | style | [thin] |
| 7 | `style.badge` | P2 | style | [new] |
| 8 | `advanced.custom-code` | P1 | style/data | [exists] |
| 9 | `targeting.product-scope` | P0 | targeting | [new] |
| 10 | `targeting.audience` | P1 | targeting | [exists — expand] |
| 11 | `targeting.page-url` | P1 | targeting | [exists] |
| 12 | `targeting.geo` | P1 | targeting | [new] |
| 13 | `targeting.device` | P1 | targeting | [new] |
| 14 | `targeting.rule-engine` (conditions) | P1 | targeting | [new — flagship] |
| 15 | `targeting.priority` | P2 | targeting | [new] |
| 16 | `trigger.display` | P1 | behavior | [exists — expand] |
| 17 | `schedule` | P1 | behavior | [exists] |
| 18 | `frequency-cap` | P2 | behavior | [exists] |
| 19 | `countdown` / timer | P2 | behavior/content | [exists — expand] |
| 20 | `pricing.discount` | P0 | behavior | [new — flagship] |
| 21 | `pricing.tiers` (volume/BMSM) | P1 | behavior | [new] |
| 22 | `pricing.bogo` | P2 | behavior | [new] |
| 23 | `pricing.gift` (GWP) | P2 | behavior | [new] |
| 24 | `pricing.discount-mechanism` | P1 | behavior/data | [new] |
| 25 | `recommendation.source` | P1 | behavior/data | [new — flagship] |
| 26 | `experiment.ab` | P1 | behavior | [new] |
| 27 | `offer.funnel` (accept/decline chain) | P2 | behavior | [new] |
| 28 | `progress-goal` (reward bar) | P2 | behavior | [new] |
| 29 | `form.fields` (capture) | P2 | content/data | [new] |
| 30 | `options.builder` (product options) | P3 | content/behavior | [new] |
| 31 | `conditional-logic` (show/hide) | P2 | behavior | [new] |
| 32 | `option-pricing` | P3 | behavior/data | [new] |
| 33 | `review-collection` | P3 | behavior | [new] |
| 34 | `review-display` | P3 | behavior/style | [new] |
| 35 | `loyalty.earn-rules` | P3 | behavior | [new] |
| 36 | `loyalty.redeem-rules` | P3 | behavior | [new] |
| 37 | `vip-tiers` | P3 | behavior/targeting | [new] |
| 38 | `referral` | P3 | behavior | [new] |
| 39 | `subscription.plan` | P3 | behavior | [new] |
| 40 | `subscription.portal-perms` | P3 | behavior | [new] |
| 41 | `dunning` (retry/recovery) | P3 | behavior | [new] |
| 42 | `notifications` (email/SMS/push templates) | P2 | content/data | [new] |
| 43 | `channels` (email/SMS/push/messenger) | P3 | behavior | [new] |
| 44 | `automation.flow` (trigger→action) | P3 | behavior | [new] |
| 45 | `data-store` (schema/records) | P3 | data | [new] |
| 46 | `data-io` (import/export) | P2 | data | [new] |
| 47 | `integrations` (connectors) | P1 | data | [new] |
| 48 | `metafield-binding` | P2 | data | [new] |
| 49 | `analytics.attribution` | P1 | data | [new] |
| 50 | `pixel` (tracking) | P2 | data | [new] |
| 51 | `seo.structured-data` (rich snippets) | P3 | data | [new] |
| 52 | `shipping.rate-engine` | P4 | behavior | [new] |
| 53 | `cart-drawer` (composite) | P3 | style/behavior | [new] |
| 54 | `accessibility` | P2 | style/content | [new — cross-cutting] |
| 55 | `responsive` (per-breakpoint override) | P2 | style | [new — cross-cutting] |

---

# Packs (detailed)

## Group A — CONTENT

### 1. `content.text` — P0 (universal) [exists — expand]
Every widget has editable copy. The recurring shape is **a namespace of labelled string keys**, some rich-text, most short. Bigger apps expose 20–250+ keys (Appstle "23 label articles"; BON "200–250 languages simultaneously"), which argues for a **repeatable string-catalog** shape rather than a fixed field list.

| field | type | notes |
|---|---|---|
| `heading` / `title` | text | widget/section title; often toggle-able "show title" |
| `subheading` / `description` | text/textarea | |
| `body` | richtext | rich blocks (Loox how-it-works, GemPages text element) |
| `ctaLabel` / `buttonText` | text | accept / add-to-cart / "Notify me" / "Invite friends" |
| `declineLabel` | text | "No thanks" (upsell/funnel) |
| `badgeText` | text | "SALE", "Most Popular", "-25%" |
| `emptyState.{title,body,button}` | text ×3 | recurs in carts, reviews, search no-result |
| `successMessage` / `errorMessage` | text | forms, popups, cart |
| `tooltipText` | text | |
| `stringCatalog` | repeater<{key,value}> | for the 20–250-key apps; escape hatch |
| `variableTokens` | (system) | `{amount_left}`, `{{product.name}}`, `{count}`, `{{timer}}`, `[points_amount]` — pervasive; pack must support token interpolation |

**Uses:** ALL categories. **Signal:** merchants expect every visible string editable + translatable; token support is table stakes (free-shipping bars, tiered rewards, social-proof).

### 2. `content.media` — P1 [thin, expand]
| field | type | notes |
|---|---|---|
| `image` | image | logo, banner, hero, side/background image; per-tier gift image |
| `imageAlt` | text | |
| `imageRatio` | select[square, 3:4, 4:3, 9:16, portrait, landscape, adapt] | Foxkit, Judge.me, Search&Discovery |
| `imageFit` | select[cover, contain, fit, fill] | |
| `icon` | icon-picker + custom-upload | launchers, badges, stars, payment icons |
| `video` | select[YouTube, Shopify-hosted, URL] + url + autoplay/loop toggles | GemPages, PageFly, Justuno |

**Uses:** page-builder, loyalty, reviews, popup, trust, cart, restock, social-proof. **Note:** several apps host media on their own CDN (Loox photos/videos, review media) — see `data-store` for the persistence side.

### 3. `content.i18n` / translations — P1 [new]
Nearly universal but currently unmodelled. Shape: per-string, per-locale overrides gated by a locale selector.

| field | type | notes |
|---|---|---|
| `enabled` | toggle | |
| `locales` | multiselect[locale] | 9–250 languages across corpus; RTL noted (Seal AR/HE, Wide Bundles) |
| `strings` | repeater<{locale, key, value}> | |
| `aiTranslate` | toggle | Loox (38 langs), Fera, Hextom AI |
| `textDirection` | select[LTR, RTL] | Wide Bundles, Seal, Globo |

**Uses:** ALL. Confirmed in 40+ records. **Priority note:** could ship as a cross-cutting *modifier* over `content.text` rather than a standalone pack.

---

## Group B — STYLE

### 4. `style.tokens` — P0 (universal) [exists — expand HARD]
The **#1 pain** (shallow visuals) lives here. The corpus range is enormous: thin apps expose 3–5 preset colors (Growave, Seal); page-builders expose a full token system (GemPages/PageFly: typography scale, ≤15-color palette, 10 spacing tokens, radius S/M/L). The pack must span both. This is also the direct consumer of the phase #2 design-vocabulary tokens.

| field | type | notes |
|---|---|---|
| `colors.{background,text,accent,button,buttonText,border,link}` | color ×N | most common quartet: background/text/accent/button. Dual-state (selected vs unselected) in bundle cards (Wide Bundles, Kaching). |
| `colorPalette` | repeater<color> or preset-select | ≤15 named colors (GemPages); preset circles (Kaching purple/lime/orange/black) |
| `font.family` | select + custom-upload | Google Fonts + custom (.ttf/.otf/.woff); primary+secondary (Rivo, Yotpo) |
| `font.size` | number | per-element |
| `font.weight` | select[normal, medium, semibold, bold] | |
| `font.lineHeight` / `letterSpacing` | number | page-builders |
| `textAlign` | select[left, center, right] | |
| `textTransform` | select[none, uppercase, …] | Boost "all values uppercase" |
| `borderRadius` | number | 0–90 range seen (Growave); corner presets [square, soft, rounded, extra] (Judge.me) |
| `border.{style,color,width}` | select+color+number | |
| `spacing.{padding,margin}` (T/R/B/L) | number ×4 each | page-builders expose full box model |
| `gap` | number | flex/grid gap |
| `shadow` | {color, blur, spread, offsetX, offsetY} | GemPages, PageFly |
| `opacity` | number/slider | |
| `background.type` | select[color, gradient, image, video] | GemPages, PageFly, Hextom |
| `gradient` | {stops[], type[radial,linear], angle} | |
| `shapePreset` | select[rounded, circle, square] | Rivo shape controls (button/section/field/launcher) |

**Uses:** ALL rendering categories. **Signal:** the top recurring complaint across bundles/loyalty/reviews is *"styling could be more flexible / thin native controls / CSS-only"* (Bold Bundles, Bold Options, Kaching, Loox "can't vary per page"). Depth here directly answers "not YC-tier."

### 5. `style.layout-archetype` — P1 [new]
Apps universally offer a **layout/template select** whose option set is type-dependent. Model as a select whose enum is provided by the module type.

| field | type | notes |
|---|---|---|
| `layout` | select (type-scoped enum) | reviews: [grid, list, masonry, carousel, cards, sidebar/tabs]; bundles: [card-grid, horizontal-tiers, stacked-list, radio-row, dropdown]; upsell: [popup, embedded-checkbox, embedded-button, list, carousel]; options: swatch styles; search: [list, box, swatch, slider] |
| `template` | select[preset templates] | 6 templates (Kaching, Wide Bundles); "Arctic Seal" etc. |
| `columns` | number/select | desktop columns (reviews 4/3/2/1); reviews-per-row desktop+mobile |
| `productsPerView` | number | carousels |
| `direction` | select[horizontal, vertical] | |

**Uses:** reviews, bundles, upsell, options, search, loyalty, cart. **Note:** the enum is per-type — this pack is the clearest argument for **per-type vocabulary**: the same `layout` field carries a different option set per module type.

### 6. `style.placement` — P1 [thin, expand]
Where the widget injects. Split into *surface* (which page) and *anchor* (position on it).

| field | type | notes |
|---|---|---|
| `surface` | select[product, cart, checkout, post-purchase, thank-you, home, collection, blog, customer-account, POS] | |
| `position` | select (surface-scoped) | corner presets (bottom-left…), "below add-to-cart", top/bottom of page, custom |
| `customSelector` | text (CSS selector) | non-standard themes (Candy Rack, Swym, Hextom "Custom Position") |
| `insertionMode` | select[auto app-block, manual snippet] | |
| `zIndex` | number | ProveSource dedicated article |

**Uses:** ALL storefront widgets. **Signal:** custom-selector escape hatch recurs for theme compatibility (a top complaint source).

### 7. `style.badge` — P2 [new]
Recurs as a distinct sub-widget across discounts/urgency/bundles.

| field | type | notes |
|---|---|---|
| `enabled` | toggle | |
| `text` | text | "SALE", "-25%", "Most Popular", "Best Value" |
| `shape` | select[tag, banner, starburst, pill, …] | Bold Discounts, Ultimate Special Offers |
| `position` | select | over product image / on card |
| `color` / `textColor` | color | |
| `size` | number | |

**Uses:** discounts, bundles, upsell, trust/urgency. Note: overlaps `style.tokens`; keep separate because it's an independent toggleable element with its own placement.

### 8. `advanced.custom-code` — P1 [exists]
The scoped escape hatch (spec explicitly keeps this as the single freeform outlet, storefront surfaces only).

| field | type | notes |
|---|---|---|
| `customCss` | code(css) | near-universal; char-limited in some (Judge.me 1000) |
| `customHtml` | code(html) | |
| `customJs` | code(js) | paid-tier gated (Honeycomb, upcart) |
| `customLiquid` | code(liquid) | page-builders |

**Uses:** 45+ plugins. **Constraint:** sandboxed away from checkout/POS (Shopify limitation, noted in spec #2).

---

## Group C — TARGETING

### 9. `targeting.product-scope` — P0 (universal) [new]
The single most recurrent targeting shape: *which products/collections does this apply to.* Currently unmodelled as a pack.

| field | type | notes |
|---|---|---|
| `scope` | select[all-products, specific-products, specific-collections, entire-store, homepage-featured] | |
| `products` | product-picker (multi) | |
| `collections` | collection-picker (multi) | |
| `variants` | variant-picker | variant-level targeting (restock, options, discounts) |
| `exclusions` | product/collection-picker | exclude already-discounted / OOS / specific items |
| `productFilter` | rule (title/type/vendor/tag/price) | filter-based selection (Bold Discounts, Globo, Hulk bulk-apply) |

**Uses:** bundles, upsell, discounts, reviews, options, loyalty, subscriptions, search, restock, cart. Confirmed in ~50 records.

### 10. `targeting.audience` — P1 [exists — expand]
*Who* sees/qualifies. Distinct from product scope.

| field | type | notes |
|---|---|---|
| `visitorType` | select[all, guests, signed-in, both, existing-contacts, exclude-existing] | Discount Ninja, Klaviyo, Omnisend |
| `customerTags` | tag-picker (include/exclude) | VIP gating pervasive |
| `customerSegment` | segment-picker | Shopify segments / app segments |
| `newVsReturning` | select | ReConvert, upcart |
| `totalSpent` / `orderCount` | number + operator | Hextom USB, Justuno, Rebuy |
| `loginRequired` | toggle | Ultimate Special Offers, bold-memberships |
| `b2bVsB2c` | select | Appstle, BON, slide-cart |

**Uses:** discounts, upsell, loyalty, popup, subscriptions, cart, reviews.

### 11. `targeting.page-url` — P1 [exists]
| field | type | notes |
|---|---|---|
| `pageTypes` | multiselect[home, product, collection, cart, checkout, blog, all] | |
| `urlRules` | rule[contains, exactly, regex, not-contains] + text | Klaviyo, Privy, Justuno, ProveSource |
| `referrerUrl` | rule | Justuno, Privy |

**Uses:** popup, email, trust/urgency, social-proof, countdown.

### 12. `targeting.geo` — P1 [new]
| field | type | notes |
|---|---|---|
| `countries` | multiselect (include/exclude) | |
| `regions` / `states` / `zip` | multiselect / text | Privy, Justuno |
| `markets` | multiselect[Shopify Markets] | Hextom, Boost |
| `language` | select | |

**Uses:** discounts, popup, loyalty, reviews, social-proof, trust, search, shipping. ~20 records.

### 13. `targeting.device` — P1 [new]
| field | type | notes |
|---|---|---|
| `devices` | select[both, desktop-only, mobile-only] | |
| `hideOnMobile` / `hideOnDesktop` | toggle | Rivo, ProveSource, Foxkit |

**Uses:** popup, countdown, social-proof, loyalty, wishlist, trust. ~20 records.

### 14. `targeting.rule-engine` (conditions) — P1 [new — FLAGSHIP]
The single **highest-leverage** target-vocabulary gap. The best apps (Rebuy Data Sources, Justuno 80+ conditions, Intuitive Shipping 40+, ReConvert, Boost, Omnisend segment builder) all converge on the same primitive: an ordered list of **condition rows** combined with AND/OR, evaluated top-to-bottom. Today's recipe has no vocabulary for this. Model as a first-class reusable `rule-builder`.

**Condition row shape:** `{ object, attribute, operator, value }`
- **objects**: Product · Customer · Cart · Order · Inventory · Geolocation · Behavioral · Temporal · Order-History · Delivery
- **attributes** (per object): Product{tags,title,vendor,type,handle,price,weight,metafields,collections,inventory}; Customer{login-status,tags,order-count,lifetime-spend,country}; Cart{subtotal,line-count,item-count,contents,discount-codes}; Behavioral{recently-viewed,pages-viewed,session-count,URL/UTM,exit-intent,scroll-%,idle,cart-value-7d}; Temporal{date-range,day-of-week,time,seconds-on-page}
- **operators**: equals · not-equals · contains · not-contains · greater-than · less-than · regex · starts/ends-with · is-in
- **value**: text / number / product-picker / tag / date (type follows attribute)

| field | type | notes |
|---|---|---|
| `rules` | repeater<condition-row> | |
| `logic` | select[AND (match all), OR (match any)] | per group |
| `ordering` | drag-order | sequential, cumulative-fill (Rebuy), first-match-wins (ReConvert) |
| `exitIfMatched` | toggle | Rebuy |
| `defaultRow` | (system catch-all) | ReConvert undeletable default |

**Uses:** upsell (Rebuy/ReConvert/Selleasy/Honeycomb), discounts (Discount Ninja), shipping (Intuitive), popup (Justuno/Privy/Omnisend/Klaviyo), search (Boost), options (Globo/Hulk conditional), cart (upcart). ~25 records at meaningful depth. **This is what "express a full plugin" requires.** Related but distinct: `conditional-logic` (#31) is the *intra-widget* show/hide variant of the same primitive.

### 15. `targeting.priority` — P2 [new]
| field | type | notes |
|---|---|---|
| `priority` | number | which offer/bundle/funnel wins when several match (Bundler, Selleasy, Kaching, Zipify, Candy Rack) |
| `tieBreak` | (system) | "most recently modified wins" (Bold Upsell) as a documented default |

**Uses:** upsell, bundles, discounts, options (set-stacking), countdown.

---

## Group D — BEHAVIOR: DISPLAY / TIMING

### 16. `trigger.display` — P1 [exists — expand]
*When* a popup/offer fires.

| field | type | notes |
|---|---|---|
| `trigger` | select[on-load, after-delay, on-scroll-%, exit-intent, after-N-pages, element-click, cart-value, manual] | Klaviyo, Omnisend, Privy, Foxkit, Justuno |
| `delaySeconds` | number | |
| `scrollPercent` | number | |
| `pagesViewed` | number | |
| `customEvent` | text (JS event) | |

**Uses:** popup, email, upsell (popup), trust, social-proof, restock (nudge), wishlist (nudge).

### 17. `schedule` — P1 [exists]
| field | type | notes |
|---|---|---|
| `startAt` / `endAt` | datetime | near-universal for time-boxed offers |
| `timezone` | select[customer-local, merchant-local] | Hextom caveat |
| `recurrence` | select[one-time, daily, weekly, interval, session] | Hextom timer types |
| `daysOfWeek` | multiselect | |
| `activeHours` | time-range | |

**Uses:** discounts, countdown, bundles, upsell, loyalty (bonus events), popup, reviews (campaigns), search (merchandising).

### 18. `frequency-cap` — P2 [exists]
| field | type | notes |
|---|---|---|
| `showOncePerSession` / `perVisitor` | toggle | |
| `reappearInterval` | number + unit | "show again after N days" (Klaviyo, Omnisend, Privy) |
| `suppressOnSuccess` | toggle | don't re-show after submit/convert |
| `endAfterNSignups` | number | Privy |
| `maxImpressions` | number | |

**Uses:** popup, email, social-proof, trust, restock.

### 19. `countdown` / timer — P2 [exists — expand]
| field | type | notes |
|---|---|---|
| `mode` | select[standard/fixed, daily, evergreen/recurring, interval, session] | Hextom, Foxkit |
| `endTime` | datetime | |
| `durationMinutes` | number | evergreen / cart-reserve timers |
| `onExpire` | select[hide, restart, freeze-00:00, redirect] | |
| `timerStyle` | select[flip-clock, plain, square-tiles, circle-tiles] | Hextom |
| `labels` | text ×4 (D/H/M/S) | translatable |
| `showLabels` | toggle | |

**Uses:** trust/urgency, discounts, bundles, upsell, cart, page-builder, restock.

---

## Group E — BEHAVIOR: PRICING & OFFERS

### 20. `pricing.discount` — P0 (near-universal in commerce modules) [new — FLAGSHIP]
The atomic discount primitive, recurring across every offer-shaped module. No pack exists today.

| field | type | notes |
|---|---|---|
| `discountType` | select[percentage, fixed-amount, fixed-price, free-shipping, free-gift, none] | universal enum |
| `value` | number/money | |
| `overrideCents` | number | force price endings (.99) — Bold Discounts/Bundles |
| `combinable` | toggle | stack with Shopify codes |
| `combineOrder` | select[before, after] | Ultimate Special Offers order-of-operations |
| `minPurchase` / `minQuantity` | number/money | threshold gate |
| `usageLimit` | number | |

**Uses:** discounts, bundles, upsell, loyalty (reward), subscriptions, reviews (incentive), cart, options. ~35 records.

### 21. `pricing.tiers` (volume / buy-more-save-more) — P1 [new]
| field | type | notes |
|---|---|---|
| `tiers` | repeater<{threshold(qty or cart-value), discountType, value, label, badge, highlighted}> | up to 5 (Discount Ninja), 4 (Rebuy) |
| `basis` | select[quantity, cart-value] | |
| `preselectedTier` | select | default-highlighted tier |

**Uses:** bundles (Kaching, Fast Bundle, Wide Bundles, Moon), discounts (Discount Ninja spend-to-save), subscriptions (dynamic after-N-orders), cart (tiered rewards), loyalty. ~15 records.

### 22. `pricing.bogo` — P2 [new]
| field | type | notes |
|---|---|---|
| `buySet` | product/collection-picker + qty | trigger arm |
| `getSet` | product/collection-picker + qty | reward arm |
| `getDiscount` | select[free, %, fixed] | |
| `showAsFree` | toggle | Kaching |

**Uses:** bundles, discounts, upsell, cart. ~10 records.

### 23. `pricing.gift` (gift-with-purchase) — P2 [new]
| field | type | notes |
|---|---|---|
| `giftProduct` | product-picker | |
| `threshold` | number/money (qty or cart-min) | |
| `autoAdd` | toggle | auto-drop into cart |
| `selectable` | toggle | multiple gifts → customer choice (slide-cart, Candy Rack, Moon) |

**Uses:** bundles, cart, discounts, upsell, loyalty. ~10 records.

### 24. `pricing.discount-mechanism` — P1 [new — store-level]
A distinct, high-consequence knob several apps expose: *how* the price change is materialized at checkout. Store-level, not per-offer, with major behavioral consequences (stacking, inventory, code-field). Belongs in vocabulary because it gates what the compiler emits.

| field | type | notes |
|---|---|---|
| `method` | select[Shopify-Functions, discount-code, draft-order, variant-dependent, accelerated-draft] | Foxkit, Bundler, Bold (Variant/Draft/Accelerated), bold-custom-pricing (V1/V2/V3) |
| `autoApply` | toggle | vs code entry |

**Uses:** bundles, discounts, upsell, custom-pricing. ~10 records. **Maps to** our Functions surfaces (cartTransform/discountRules) — the compiler-side lever for #4 composites.

### 25. `recommendation.source` — P1 [new — FLAGSHIP]
The other half of "express a full plugin." How offered/recommended products are chosen. Rebuy/ReConvert/upcart/Selleasy/Bold-Brain converge on a *strategy select* with per-strategy config.

| field | type | notes |
|---|---|---|
| `source` | select[manual, ai-recommended, similar, complementary, related, top-sellers, trending, buy-it-again, recently-viewed, most-expensive-in-cart, cheapest-in-cart, collection-random, metafield, endpoint] | |
| `manualProducts` | product-picker | when manual |
| `sourceCollection` | collection-picker | when collection |
| `recommendationIntent` | select[related, complementary] | Shopify rec engine |
| `exclusionTags` | tag-picker | |
| `hideCartProducts` | toggle | |
| `productLimit` | number | |
| `aiEngine` | select | Candy Rack (incl. Gemini); Smart/autopilot toggles |
| `smartVariantMatching` | toggle | upcart |

**Uses:** upsell (Rebuy, ReConvert, Selleasy, Candy Rack, Honeycomb, Bold-Upsell, Bold-Brain), cart (upcart, slide-cart, Rebuy), search (Search&Discovery complementary/related), reviews (top-rated widget). ~18 records.

### 26. `experiment.ab` — P1 [new]
Recurs as a first-class construct across offer/popup/page apps.

| field | type | notes |
|---|---|---|
| `enabled` | toggle | |
| `variants` | repeater<variant> | 2–4 (Kaching A/B/C/D); each = independent product/discount/copy/design |
| `trafficSplit` | number/percent | |
| `goal` | select[conversion, revenue] | |
| `duration` | number/daterange | ≤30d (Rebuy) |
| `primaryMetric` | select | PageFly, Kaching |
| `keepWinner` | action | |

**Uses:** upsell (Rebuy, Honeycomb, ReConvert, Zipify, Candy Rack), bundles (Kaching, Moon, Wide, Fast), popup (Justuno, Privy, Omnisend, Klaviyo forms), page-builder (PageFly, GemPages), search (Boost), reviews (Fera), cart (Moon). ~20 records. **Wraps** any other pack — model as an experiment envelope over a config.

### 27. `offer.funnel` (accept/decline chaining) — P2 [new]
| field | type | notes |
|---|---|---|
| `steps` | repeater<offer> (ordered ≤3) | Bold funnel, Honeycomb downsell, Selleasy funnel, Zipify OCU |
| `onAccept` | select[next-step, checkout, cart, stay] | |
| `onDecline` | select[next-step/downsell, skip, checkout] | |
| `postAccept` | select[proceed-checkout, go-to-cart, stay] | |

**Uses:** upsell, post-purchase, checkout. ~10 records (the upsell-funnel core).

### 28. `progress-goal` (reward/free-shipping bar) — P2 [new]
| field | type | notes |
|---|---|---|
| `enabled` | toggle | |
| `basis` | select[cart-total, item-count] | |
| `tiers` | repeater<{threshold, rewardType[shipping,discount,product], label, icon}> | up to 3 bars × 4 tiers (Rebuy); multi-milestone |
| `beforeText` / `afterText` | text | pre/post-unlock (slide-cart, upcart with `{amount}`/`{count}`) |
| `usePreDiscountTotal` | toggle | upcart |
| `barColors` | color ×2 (track, fill) | |

**Uses:** cart (upcart, slide-cart, Rebuy, Moon), upsell (Candy Rack rewards bar), discounts (Foxkit free-ship goal), bundles. ~10 records.

---

## Group F — BEHAVIOR: FORMS & OPTIONS

### 29. `form.fields` (capture) — P2 [new]
| field | type | notes |
|---|---|---|
| `fields` | repeater<{type[email,phone,name,address,date,dropdown,checkbox,text,consent,captcha,custom], label, placeholder, required, order}> | Klaviyo, Omnisend, Privy, Justuno, Foxkit, ReConvert |
| `consentType` | select[email, sms, both] | separate per channel |
| `doubleOptIn` | toggle | |
| `successStep` | {message, discount-reveal} | |

**Uses:** popup, email, upsell (custom form), reviews (custom questions), loyalty (zero-party), restock (signup form). ~12 records.

### 30. `options.builder` (product options) — P3 [new]
The options/personalization family's core. Very deep (Bold/Globo/Hulk/Kickflip ~15–30 option types).

| field | type | notes |
|---|---|---|
| `options` | repeater<option> | each: label, type, values[], help/tooltip, placeholder, default |
| `optionType` | select[dropdown, radio, checkbox, swatch(color/image), text, textarea, number, email, phone, date, file-upload, color-picker, button, popup, info/richtext, quantity, dimensions, font, gift-wrap] | 15–30 types |
| `values` | repeater<{label, swatchColor, swatchImage, sku}> | |
| `required` | toggle | |
| `charLimit` / `min` / `max` | number | |
| `fileUpload` | {acceptedTypes[], maxSize, maxCount} | |

**Uses:** options (Bold, Globo, Hulk, Kickflip), plus swatches in search. ~5 records but foundational for that category.

### 31. `conditional-logic` (intra-widget show/hide) — P2 [new]
The *within-a-widget* branching primitive (sibling of #14 rule-engine).

| field | type | notes |
|---|---|---|
| `rules` | repeater<{sourceField, operator, value, action[show,hide,enforce,prevent], target}> | Bold/Globo/Hulk 3-tier; Kickflip NL rules |
| `combine` | select[AND, OR] | |

**Uses:** options (all), page-builder (interactions), forms, subscriptions (portal rules). ~8 records.

### 32. `option-pricing` — P3 [new]
| field | type | notes |
|---|---|---|
| `mode` | select[per-value add-on, fixed, percentage, one-time/setup, multiplication, tiered/bulk, formula] | Hulk, Globo, Kickflip |
| `amount` | number/money | per value |
| `formula` | rule/expression | `Width × Length × Price` (Kickflip, Hulk) |
| `perCharacter` | toggle | |
| `dynamicDisplay` | toggle | reflect in shown price |

**Uses:** options, configurators. ~5 records.

---

## Group G — REVIEWS / UGC (category packs)

### 33. `review-collection` — P3 [new]
| field | type | notes |
|---|---|---|
| `autoRequest` | toggle | |
| `trigger` | select[order-fulfilled, order-delivered, purchase-date] | |
| `delayDays` | number (0–60; default 14) | |
| `channel` | select[email, sms, popup] | |
| `reminders` | repeater<{delay}> | follow-up cadence |
| `incentive` | {type[discount,points,cashback], value, requiredSubmission} | |
| `moderation` | select[auto-publish, moderate, rating-gated] | |
| `mediaUpload` | toggle (photo/video) | plan-gated |

**Uses:** reviews (Loox, Judge.me, Yotpo, Fera, Okendo, Stamped, Growave). ~8 records.

### 34. `review-display` — P3 [new]
| field | type | notes |
|---|---|---|
| `widgetKind` | select[reviews, star-rating, media-gallery, carousel, badge, Q&A, all-reviews, write-a-review] | |
| `sortBy` | select[recent, highest, lowest, most-helpful, with-media, pictures-first] | |
| `reviewsPerPage` | number | |
| `paginationType` | select[load-more, numbered, infinite] | |
| `showElements` | toggle set[avatar, name, location, flag, date, verified-badge, bar-chart, summary] | |
| `ifNoReviews` | select[hide, show-empty, other-products] | |
| `starColor` / `starSize` | color / select | |

**Uses:** reviews, social-proof. ~8 records. **Note:** heavy overlap with `style.layout-archetype` (layout enum) + `content.text` — compose, don't duplicate.

---

## Group H — LOYALTY / SUBSCRIPTIONS / MEMBERSHIPS (category packs)

### 35. `loyalty.earn-rules` — P3 [new]
| field | type | notes |
|---|---|---|
| `rules` | repeater<earn-rule> | each: action-type, enabled, points, cadence-limit |
| `actionType` | select[place-order, signup, complete-profile, birthday, anniversary, newsletter, review, social-follow/share, daily-checkin, streak, referral, custom] | ~18 actions (BON, Smile, Stamped) |
| `pointsPerDollar` | number | order accrual |
| `limit` | {period[day,week,month,year], maxCount} | |
| `earnBasis` | multiselect[subtotal, taxes, shipping] | Okendo, Rivo |

**Uses:** loyalty (Smile, BON, Rivo, LoyaltyLion, Growave, Okendo, Stamped). ~8 records.

### 36. `loyalty.redeem-rules` — P3 [new]
| field | type | notes |
|---|---|---|
| `rewardType` | select[amount-off, percentage, free-shipping, free-product, gift-card, store-credit] | |
| `pointsCost` | number | |
| `redemptionStyle` | select[fixed, incremental] | |
| `conversionRatio` | number | X points = $Y |
| `minMaxPoints` | number ×2 | margin protection |
| `expiry` | {enabled, period} | |

**Uses:** loyalty. ~8 records.

### 37. `vip-tiers` — P3 [new]
| field | type | notes |
|---|---|---|
| `tiers` | repeater<{name, threshold, perks}> | |
| `entryMethod` | select[points-earned, amount-spent, orders-placed] | |
| `resetPeriod` | select[lifetime, calendar-year, rolling-year] | |
| `perTierMultiplier` | number | accelerated earning |
| `autoTag` | toggle | writes `BON_[tier]` etc. |

**Uses:** loyalty (all), also memberships. ~8 records.

### 38. `referral` — P3 [new]
| field | type | notes |
|---|---|---|
| `advocateReward` | {type, value, threshold} | |
| `friendReward` | {type, value, minPurchase} | |
| `trigger` | (system) friend's first order | |
| `antiFraud` | toggle[self-referral, IP-block] | |
| `shareChannels` | multiselect[email, FB, X, SMS, WhatsApp, copy-link] | |
| `monthlyLimit` | number + enforcement[soft, hard] | |

**Uses:** loyalty (Loox, Smile, Rivo, LoyaltyLion, BON, Growave, Yotpo). ~8 records.

### 39. `subscription.plan` — P3 [new]
| field | type | notes |
|---|---|---|
| `subscriptionType` | select[one-time+sub, sub-only, prepaid, gift, membership, trial, bundle-builder] | |
| `billingFrequency` | number + select[day,week,month,quarter,year] | |
| `deliveryFrequency` | number + unit | decoupled for prepaid |
| `discount` | {type[%,fixed,set-price], value} | |
| `trial` | {enabled, days} | |
| `minMaxCycles` | number ×2 | commitment/cap |
| `cutoffDays` | number | |

**Uses:** subscriptions (Appstle, Recharge, Loop, Seal, Bold, Rivo memberships). ~7 records.

### 40. `subscription.portal-perms` — P3 [new]
A large toggle group (each a portal capability).

| field | type | notes |
|---|---|---|
| `permissions` | toggle set[cancel, pause/resume, skip, reschedule, swap-product, edit-qty, change-frequency, change-address, change-payment, order-now, add-product, order-notes] | 10–20 toggles (Appstle, Loop, Recharge, Bold, Seal) |
| `magicLinkLogin` | toggle | passwordless |
| `orderRestrictions` | {minValue, minWeight, maxOrdersPerDay, maxQtyPerItem} | Loop |

**Uses:** subscriptions. ~6 records.

### 41. `dunning` (retry / recovery) — P3 [new]
| field | type | notes |
|---|---|---|
| `retryCount` | number (1–15) | |
| `retrySchedule` | number + unit | days between |
| `terminalAction` | select[pause, cancel] | after final fail |
| `dunningEmails` | toggle + cadence | |

**Uses:** subscriptions, memberships. ~6 records.

---

## Group I — MESSAGING & CHANNELS

### 42. `notifications` (templates) — P2 [new]
| field | type | notes |
|---|---|---|
| `templates` | repeater<{event, subject, body(richtext/html), enabled}> | per lifecycle event |
| `mergeVars` | (system) | `{{customer_name}}`, `{{order_number}}`, product vars |
| `banner` | image | email banner |
| `senderName` / `customDomain` | text / DNS | |
| `testSend` | action | |

**Uses:** subscriptions, loyalty, reviews (request email), restock, email, wishlist. ~15 records.

### 43. `channels` — P3 [new]
| field | type | notes |
|---|---|---|
| `channels` | multiselect[email, sms, web-push, messenger] | |
| `perChannelConsent` | toggle | |
| `smartDelivery` | toggle | active-hours send (PushOwl) |
| `rate` / `interval` | number | batch/delivery pacing (Appikon notify rate + interval + order) |

**Uses:** restock, email, push, loyalty, reviews. ~8 records.

### 44. `automation.flow` (trigger→action) — P3 [new]
The workflow-builder primitive (Klaviyo/Omnisend/Loop/Privy/Justuno).

| field | type | notes |
|---|---|---|
| `trigger` | select[event: subscribed, abandoned-cart, order-placed, back-in-stock, price-drop, birthday, …] | |
| `triggerFilters` | rule-builder | |
| `steps` | repeater<node[delay, send(email/sms/push), conditional-split, ab-split, tag, update-contact, action]> | |
| `entryFrequency` | select[immediate, delayed, no-re-entry] | |
| `exitCriteria` | rule | auto-remove on purchase |

**Uses:** email, subscriptions (Loop flows), popup (Privy/Justuno workflows). ~6 records. **Note:** this is Rebuy "Smart Flows"-shaped, adjacent to our (built-not-wired) flow engine — see Track B `flow-automation`.

---

## Group J — DATA / INTEGRATIONS / MEASUREMENT

### 45. `data-store` (schema + records) — P3 [new]
For modules that persist first-party entities (reviews DB, subscriber lists, wishlists, loyalty ledgers, referral state). Maps to our dormant `DataStore.schemaJson`.

| field | type | notes |
|---|---|---|
| `entitySchema` | schema-builder<{field, type}> | reviews, subscribers, wishlist items, points ledger |
| `mediaHosting` | (system) | own-CDN photo/video (Loox, review apps) |
| `retention` | config | 14-day auto-publish, 7-day undo (Loox) |

**Uses:** reviews, loyalty, subscriptions, wishlist, restock, popup (lead lists), social-proof (event stream). ~15 records persist state. **Track B:** `DataStore.schemaJson` exists but no export routes / renderer.

### 46. `data-io` (import/export) — P2 [new]
| field | type | notes |
|---|---|---|
| `import` | file(csv) + column-mapper | reviews, wishlists, options, prices, subscribers |
| `export` | action(csv) | |
| `migration` | connector | from competitor apps (reviews) |

**Uses:** reviews, options, loyalty, wishlist, discounts (bulk price CSV), subscriptions, custom-pricing. ~18 records.

### 47. `integrations` (connectors) — P1 [new]
| field | type | notes |
|---|---|---|
| `connectors` | multiselect/toggle-set[Klaviyo, Omnisend, Mailchimp, Attentive, Postscript, Gorgias, Recharge, Shopify Flow, PageFly, Yotpo, Judge.me, Smile, …] | |
| `apiAccess` | {keys, webhooks} | plan-gated |

**Uses:** nearly every category (~35 records list an integration matrix). Model as a connector registry rather than a fixed enum.

### 48. `metafield-binding` — P2 [new]
| field | type | notes |
|---|---|---|
| `source` | metafield-picker (namespace.key) | Boost filters, PageFly/GemPages binding, Rebuy returns, Search&Discovery |
| `writeBack` | {namespace, key} | reviews write `reviews.rating`/`rating_count`; Yotpo/Okendo pre-render snippets |
| `metaobjectRef` | metaobject-picker | swatch/image filters |

**Uses:** search, page-builder, reviews, upsell (Rebuy/Selleasy metafield offers), options. ~10 records.

### 49. `analytics.attribution` — P1 [new]
Read-surface but merchant-visible everywhere; belongs in vocabulary as a declarable output.

| field | type | notes |
|---|---|---|
| `metrics` | (system) | impressions, CTR, conversion, attributed-revenue, AOV-lift, per-offer/variant |
| `dashboard` | read-surface | |

**Uses:** upsell, bundles, discounts, loyalty, reviews, popup, cart — ~30 records surface an analytics dashboard. Often the billing meter (revenue-cap tiers).

### 50. `pixel` (tracking) — P2 [new]
| field | type | notes |
|---|---|---|
| `pixels` | multiselect[FB, GA/GA4, TikTok, Snapchat, Pinterest] + ids | ReConvert, Honeycomb, PageFly, PushOwl UTM |
| `installMethod` | select[head-snippet, GTM, app-embed] | ProveSource |
| `utmAppend` | toggle | |

**Uses:** social-proof, upsell (post-purchase), page-builder, push, popup. ~8 records. **Maps to** `analytics.pixel` surface.

### 51. `seo.structured-data` (rich snippets) — P3 [new]
| field | type | notes |
|---|---|---|
| `richSnippets` | toggle | aggregateRating schema.org (reviews) |
| `canonicalUrls` | toggle | Boost SEO |
| `seoFields` | {title, metaDescription, handle} | page-builders |

**Uses:** reviews, search, page-builder. ~8 records.

---

## Group K — SPECIALIZED / COMPOSITE

### 52. `shipping.rate-engine` — P4 [new]
Deep but single-category (Intuitive Shipping, Bold Checkout shipping, Recharge fixed-rates).

| field | type | notes |
|---|---|---|
| `calculationMethod` | select[cart-qty/total/weight/volume, distance, carrier-live, custom-formula, 3rd-party] | |
| `rateTable` | repeater<{upTo, cost, perUnit}> | |
| `conditions` | rule-builder (40+ product/customer/cart/delivery) | reuses #14 |
| `markup/markdown` | number (% or $) | |
| `freeShippingThreshold` | number | |
| `boxDefinitions` | repeater<{L,W,H,maxWeight}> | SmartBoxing |

**Uses:** shipping. 2 records — narrow but self-contained.

### 53. `cart-drawer` (composite) — P3 [new]
The slide-cart is a *composite* of several packs, worth naming because it recurs whole (upcart, slide-cart, Rebuy Smart Cart, Moon).

Composed of: `style.tokens` + `content.text` (title/empty/announcement) + `progress-goal` + `recommendation.source` (cross-sell) + `pricing.gift` + discount-field toggle + order-notes toggle + express-checkout toggle + `countdown`. **Model as a manifest, not a monolith** — validates the compositional thesis.

**Uses:** cart. ~4 records but flagship for #4 composites.

### 54. `accessibility` — P2 [new — cross-cutting]
Sparse in the corpus but explicitly present (Rebuy "Accessibility Heading Level h1–h6", ReConvert heading levels, upcart H2/H3/H4, Judge.me header weight) and mandated by DESIGN.md/QA. Ship as a cross-cutting pack.

| field | type | notes |
|---|---|---|
| `headingLevel` | select[h1–h6] | |
| `ariaLabels` | text | |
| `altText` | text | (also in media) |
| `focusOrder` / `contrastSafe` | (system/validation) | QA gate |

**Uses:** all rendering categories (currently only a few expose it — a *gap vs "up to the mark"*, since good a11y is table-stakes, not a competitor feature).

### 55. `responsive` (per-breakpoint override) — P2 [new — cross-cutting]
Page-builders (GemPages, PageFly) and popup apps (Klaviyo, Privy, Omnisend "separate mobile design") expose per-breakpoint overrides on style/visibility. Model as a **modifier** over `style.*` rather than a standalone pack.

| field | type | notes |
|---|---|---|
| `breakpoint` | select[all, desktop, tablet, mobile] | device switcher |
| `visibility` | toggle per breakpoint | show/hide per device |
| `overrides` | (any style field, per breakpoint) | |

**Uses:** page-builder, popup, cart, reviews. ~10 records with real per-device control.

---

# Cross-cutting findings (for the vocabulary build)

1. **Per-type enums are the core insight.** The same field (`layout`, `discountType`, `recommendation.source`, `optionType`, `widgetKind`) recurs everywhere but with a **type-specific option set**. The new vocabulary should let a pack declare a field whose enum is *supplied by the module type* — this is exactly the "compositional, per-type vocabulary" the phase targets. `style.layout-archetype` (#5) and `recommendation.source` (#25) are the cleanest examples.

2. **A rule-builder is the biggest missing primitive.** `targeting.rule-engine` (#14) + `conditional-logic` (#31) are the same `{object, attribute, operator, value}` shape and appear at depth in ~25 records. Nothing in today's recipe expresses it. This single primitive unlocks upsell targeting, discount conditions, shipping conditions, popup targeting, search merchandising, and option branching — i.e. most of "express a full plugin."

3. **Discount/pricing is a whole missing family.** Packs #20–#24 (`discount`, `tiers`, `bogo`, `gift`, `mechanism`) have **zero** representation in current packs, yet are P0/P1 across bundles/upsell/discounts/loyalty/cart. Highest-leverage net-new area after style depth.

4. **Style depth is the #1-pain lever.** `style.tokens` (#4) must go from ~5 fields to a full token system (palette, type scale, box-model, shadow, gradient, radius) to hit "YC-tier." This is where phase #2's design-vocabulary tokens plug in directly. The recurring complaint "styling is thin / CSS-only / can't vary per page" is a direct instruction.

5. **Composites are manifests, not monoliths.** `cart-drawer` (#53) and multi-surface offers (Rebuy one-ruleset→many-widgets) are best modelled as a **manifest composing existing packs** + a shared entity (a Data Source / ruleset referenced by N surfaces). This validates the `ModuleManifest` architecture already in `control-packs/module-manifests.ts` and is the shape phase #4 needs.

6. **Experiment + i18n + responsive + accessibility are envelopes/modifiers,** not leaf packs — they wrap or modify other packs (A/B over a config, per-locale over strings, per-breakpoint over style, a11y over any rendered surface). The vocabulary should support **pack modifiers**, not just pack composition.

7. **Cross-app connectors and analytics are near-universal but declarative** — model `integrations` (#47) as a connector registry and `analytics.attribution` (#49) as a declared output, not a fixed field list.

**Coverage:** all 58 plugin `settings_taxonomy` sections consumed; 55 candidate packs across 11 groups; every pack cites the plugin categories that use it and a recurrence-based priority. Directly consumable by phase #3 (control-packs) with the existing `ControlPack`/`ModuleManifest` contracts in [`packages/core/src/control-packs/`](../../../../packages/core/src/control-packs/).
