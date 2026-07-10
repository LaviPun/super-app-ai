# Storefront Module Design System

> **⭐ STATUS — SOURCE OF TRUTH.** This document (with its token layer in `assets/superapp-modules.css`) is the **authoritative source of truth for the UI & styling of every AI-generated storefront module.** Generation, compilation, rendering, and the design-QA gate all derive from it. If any prompt, service, or CSS disagrees with this doc, **this doc wins** and the other is the bug. It is the visual contract that makes generated modules "Apple-level, never a miss."
>
> **Scope.** Every **storefront-renderable** template the app generates — the theme-app-extension module kinds and the native-section archetypes the 200+ library entries compile to. It governs *look, tokens, layout, effects, and micro-interactions*. It sits **under** the root `DESIGN.md` "Generated-Module Bible" (Apple-HIG floor) and **over** the raw recipe schema (`packages/core/src/recipe.ts`, `storefront-style.ts`, `allowed-values.ts`).
>
> **Two selectable style packs — Minimal Luxe & Bold DTC — over one shared token grammar.** A pack is a *grammar mapping* (which enum value each token resolves to). Brand **colors + fonts inherit from the merchant's live theme** (extracted `StorePalette`/`StoreTypography`); the pack supplies structure + one tweakable accent. Every render still clears the Apple-HIG floor.
>
> **Binds to the pipeline (§9.1):** pack selection (`style-packs.server.ts`) · token compilation to `--sa-*` (`style-compiler.ts`) · the generation prompt (grammar + packs + effects + micro-interactions) · the design-QA gate (`design-qa.server.ts`) · the runtime CSS (`assets/superapp-modules.css`). Every generated module is authored, compiled, and QA'd against the vocabulary below — nothing here is decorative documentation.
>
> **Reference build:** `Template Gallery.dc.html` — a full visual guide, not just a gallery. §01 Foundations · §02 Token grammar · §03 The two packs · §04 Layout & responsiveness · §05 Component library (atoms: buttons, inputs, radio/selection types, cards, badges, tabs, accordions, toggles — each in both packs) · §06 Template catalog (option **1a** = Minimal Luxe, **1b** = Bold DTC, every template in both) · §07 Effects (45-entry index) · §08 Micro-interactions (81-entry index) · §09 Motion. The guide is **fully responsive** — documentation grids reflow (auto multi-col → 2-col → 1-col) and the template/component previews stack below ~860px via a scoped media-query layer.

---

## 0. How to read this document

1. **§1–2 Foundations & token grammar** — the invariant substrate (`StorefrontStyle`) every template is styled from.
2. **§3 The two packs** — concrete value mapping for each token, per pack, **plus the pack toggle (`stylePack`), theme color/font inheritance, and the settings-override precedence chain (§3.3)**.
3. **§4 Template catalog** — all module kinds + section archetypes, their config surface, and per-pack treatment.
4. **§5 Building blocks** — blocks, layout archetypes, placement, display rules, recommendation/pricing vocab.
5. **§6 Effects** — the full seasonal/ambient effect catalog, per pack.
6. **§7 Micro-interactions** — the mandatory + optional interaction catalog, per state, per pack.
7. **§8 Motion**, **§9 Implementation**, **§10 Decisions log**.

Every enum below is quoted verbatim from `allowed-values.ts` / `storefront-style.ts` — the generator emits **only** these values.

---

## 1. Foundations (shared)

### 1.1 Type roles (inherit families, fix roles)
`font: inherit` at runtime — the store's stack fills these roles; the gallery shows a representative pairing.

| Role | Minimal Luxe (demo) | Bold DTC (demo) | Runtime |
|---|---|---|---|
| Display / heading | Cormorant Garamond (high-contrast serif) | Archivo 800–900 (heavy grotesk) | store heading font |
| Body / UI | Instrument Sans | Instrument Sans | store body font |
| Labels · data · numerals | IBM Plex Mono | IBM Plex Mono | mono |

**Type floor (HIG):** body ≥ 16px mobile; weight ≥ 400 (no thin); ≤ 2 families + mono for numerals; hierarchy via weight/size/color, never a 3rd family. Scale `12·14·16·18·20·24·30·36·44·58`. Fluid `clamp()` — body `clamp(16px,1.1vw,18px)`, display `clamp(28px,4.5vw,44px)`.

### 1.2 Spacing
8px base · `2·4·8·16·24·32·48·64`. The **density dial** (`spacing.density`) picks the resting rhythm: Luxe → `airy`, Bold → `comfortable`/`compact`.

### 1.3 Accent — the one tweakable token
- `--sa-luxe` default `#B08D57`; swatches `#B08D57 · #8C6A4A · #6E7F6B · #1F3A5F`.
- `--sa-bold` default `#FF4D2E`; swatches `#FF4D2E · #E8FF3A · #3A5BFF · #FF2E88`.
- Consumed as `var(--sa-luxe, #B08D57)` so it paints from a literal fallback and is overridden live by the tweak / merchant brand (`colors.seed`).

### 1.4 Accessibility floor (both packs, non-negotiable — `[AUTO]` gated)
Touch targets ≥ 44×44px · body contrast ≥ 4.5:1 (large/bold ≥ 3:1) · status = **icon + text**, never color alone · visible focus ring, never removed · popups over imagery add a scrim ≥ 35% · content surfaces ≥ 85% opaque · motion 80–500ms with a `prefers-reduced-motion` fade branch · `env(safe-area-inset-*)` honored · no clipping at 200% type · QA at 375×812 + 320×568, light+dark.

---

## 2. The token grammar — `StorefrontStyle`

Every storefront template (`theme.section`, `proxy.widget`) is styled from this one schema. The generator emits **named tokens only** (never a raw px / ms / cubic-bezier); the compiler (`style-compiler.ts`) lowers them to `--sa-*` CSS custom properties scoped to `[data-module-id]`.

### 2.1 `layout`
| Token | Values | Purpose |
|---|---|---|
| `mode` | `inline · overlay · sticky · floating` | how the module attaches to the page |
| `anchor` | `top · bottom · left · right · center` | edge/point it pins to |
| `width` | `auto · container · narrow · wide · full` | content measure |
| `zIndex` | `base · dropdown · sticky · overlay · modal` | stacking layer |
| `offsetX/Y` | int `-100…100` | fine nudge |

### 2.2 `spacing`
`padding` · `margin` · `gap` ∈ `none · tight · medium · loose`; `density` ∈ `compact · comfortable · airy`.

### 2.3 `typography`
`size` ∈ `XS · SM · MD · LG · XL · 2XL`; `weight` ∈ `normal · medium · bold`; `lineHeight` ∈ `tight · normal · relaxed`; `align` ∈ `left · center · right`.

### 2.4 `colors`
`text · background` (req) · `border · buttonBg · buttonText · overlayBackdrop` (opt, `#RRGGBB`) · `overlayBackdropOpacity` `0–1` (default `.45`) · **`seed`** (merchant accent → seeds the **OKLCH 12-step semantic ramp**: `--sa-solid / -content / -surface / -text-high / -border …`). Flat colors drive legacy `--sa-text/-bg`; `seed` drives the semantic ramp — both coexist.

### 2.5 `shape`
| Token | Values | Notes |
|---|---|---|
| `radius` | `none · sm · md · lg · xl · full` | corner ladder |
| `borderWidth` | `none · thin · medium · thick` | |
| `shadow` | `none · sm · md · lg` | raw drop-shadow depth |
| **`elevation`** | `soft · glow · border · emboss` | **coherent elevation idiom** — the shadow *personality* |
| `scaling` | int `50…150` | global radius-ladder scaling % (tight↔soft in one move) |

### 2.6 `responsive` · `accessibility` · `motion`
- `responsive`: `hideOnMobile · hideOnDesktop` (bool).
- `accessibility`: `focusVisible` (default true) · `reducedMotion` (default true) — **always paired with the motion branch.**
- `motion`: `duration` ∈ `none · fast · base · slow`; `easing` ∈ `standard · enter · exit · mechanical`.
- `customCss`: ≤ 2000 chars, sanitized + root-scoped (no `@import`/`url()`/`expression()`/`<script>`/`position:fixed`) — a *nudge*, tokens do the heavy lifting.

### 2.7 `pack` (resolved, not authored)
`pack` ∈ `auto · luxe · bold` (optional). Not a look the model paints — the **resolved** two-pack grammar (§3.3.1). Set app-side from the aesthetic auto-select (`resolveStorefrontPack`, §9.2), persisted into `style_json.pack`, and read by the renderer to stamp `data-sa-pack` on the `.superapp-scope` wrapper. Merchant theme-editor `stylePack` overrides it live (§3.3.3, precedence layer 5).

---

## 3. The two packs (concrete token mapping)

### 3.1 Pack A — Minimal Luxe
> Near-monochrome, editorial, hairline detail, long fades. **Pick when** the store is calm/warm/luxury/near-monochrome, serif or thin display (beauty, fashion, wellness, home, jewelry).

| Grammar token | Resolves to |
|---|---|
| `spacing.density` / padding | `airy` / `loose` |
| `typography` | display serif, `XL–2XL`, `weight normal–medium`, `lineHeight relaxed`; labels mono-caps `.18–.22em` |
| `colors` | surface `#FBFAF7`, card `#FFFFFF`, ink `#1C1813`, body `#6F675C`, muted `#8B8378`, hairline `#E7E1D6`; accent `var(--sa-luxe,#B08D57)` **used sparingly** |
| `shape.radius` | `none–sm` (0–4px) |
| `shape.borderWidth` | `thin` (hairline) |
| `shape.elevation` | `border` / `emboss` (shadow reserved for overlays only) |
| `motion` | `duration slow` (~400ms), `easing enter`; hover `translateY(-2px)` |
| CTA | solid ink fill, cream label, **square**, mono uppercase |
| Decoration | serif numerals (01/02/03), mono-caps eyebrows, thin rules |

**Voice:** quiet, considered — "Discover the ritual", "Considered, always".

### 3.2 Pack B — Bold DTC
> Heavy grotesk, saturated accent, hard offset shadows, snappy overshoot. **Pick when** the store is loud/high-contrast/saturated, heavy headings (supplements, streetwear, food, electronics, novelty).

| Grammar token | Resolves to |
|---|---|
| `spacing.density` / padding | `comfortable`→`compact` / `medium` |
| `typography` | display grotesk `800–900` ALL-CAPS, `2XL`, `lineHeight tight`; oversized numerals |
| `colors` | surface `#FFFFFF`, dark ground `#0C0C0D`, panel `#141418`, ink `#0C0C0D`, muted `#666/#999`; accent `var(--sa-bold,#FF4D2E)` **used everywhere** |
| `shape.radius` | `sm–lg` (6–14px) |
| `shape.borderWidth` | `medium–thick` (2px structural) |
| `shape.elevation` | `glow` on dark / hard **offset shadow** `4–8px 4–8px 0` (ink or accent), no blur |
| `motion` | `duration fast` (~140ms), `easing enter` w/ overshoot `cubic-bezier(.34,1.56,.64,1)`; press `translate(2px,2px)` + shadow-shrink |
| CTA | accent fill on ink label, radius 8px, hard offset shadow |
| Decoration | badge chips, inline `★` proof, accent numerals |

**Voice:** direct, urgent — "Fuel the grind.", "Send it", "Once it's gone, it's gone."

### 3.3 Pack toggle, theme inheritance & override precedence

The two packs are **not two code paths** — they are two values of one token map. Markup is invariant and every renderer reads `--sa-*` custom properties, so switching packs = swapping the token map on the module wrapper (`[data-module-id]`). Nothing about the HTML changes.

#### 3.3.1 The toggle (`stylePack`)
A single setting selects the pack, exposed in the theme app-embed **and** each block's schema settings (`superapp-theme-modules.liquid` / `universal-slot.liquid` / …):

```
stylePack ∈  auto · luxe · bold        (default: auto)
```

- `auto` — the app resolves the pack from the merchant's extracted aesthetic signals (§9); bias to **Luxe** (can't-look-wrong) on low confidence.
- `luxe` / `bold` — hard-pin the pack, overriding auto-detection.

At render, the resolved pack writes its token map to the wrapper: `<div data-module-id data-sa-pack="luxe" style="--sa-radius:0; --sa-elevation:border; --sa-motion:400ms; --sa-ease:ease-out; …">`. Flipping `stylePack` in the theme editor re-emits that one attribute set — no republish of the module needed. **Design-time equivalent:** in `Template Gallery.dc.html` this is the same idea as the tweak panel (options 1a/1b + accent/tone tweaks); at runtime it is the `stylePack` setting.

#### 3.3.2 Color & font inheritance (default = the store's)
A pack ships **grammar, not brand.** By default the *color and font tokens are inherited from the merchant's theme/store*:

- **Fonts** — `font: inherit` throughout; the store's heading/body stack fills the display/body roles. The demo families (Cormorant / Archivo) are for the gallery only.
- **Colors** — the extracted `StorePalette` + `colors.seed` (merchant accent) drive the surface/text/accent + the OKLCH semantic ramp. The pack's demo hexes (`#FBFAF7`, `#0C0C0D`, …) are **fallbacks used only when extraction fails or a store color is absent.**

So a Luxe pack on a warm-beige store inherits that store's beige + serif; the pack only decides *radius 0, hairline borders, long fades, sparse accent.* Grammar from the pack, brand from the store.

#### 3.3.3 Style overwrite via settings (required)
Merchants can override any resolved token from the theme editor — this is a **first-class requirement, not an escape hatch.** Overrides layer on top of the pack + inheritance through the exact same `--sa-*` variables, so a merchant tweak and a pack default are indistinguishable to the renderer.

**Precedence — lowest to highest (each layer overrides the ones above it):**

| # | Layer | Source | Can override |
|---|---|---|---|
| 1 | **Apple-HIG floor** | design-QA gate | **nothing may override it** (targets, contrast, focus ring, scrim, motion bounds) |
| 2 | Pack grammar defaults | resolved `stylePack` token map | 3–6 |
| 3 | Theme/store inheritance | extracted `StorePalette` / `StoreTypography` / `colors.seed` | fills color+font roles over pack demo values |
| 4 | Per-module `StorefrontStyle` | the recipe (`style.*` tokens the generator emitted) | radius, spacing, colors, shadow/elevation, motion, align, width … |
| 5 | **Merchant theme-editor settings** | block/embed schema settings (incl. `stylePack`, accent, radius, density, alignment, color pickers) | any token in 2–4 |
| 6 | `customCss` (`≤2000c`, sanitized, root-scoped) | merchant free-form `--sa-*` nudge | the last 5% only — no `@import`/`url()`/`expression()`/`position:fixed`/`<script>` |

The **HIG floor at layer 1 is enforced after every override** — a merchant can restyle freely but cannot drop below 44px targets, remove the focus ring, break contrast, or exceed the motion bounds; the design-QA gate re-checks the final computed render.

#### 3.3.4 Scoping & identity contract (how overrides target reliably)
So every layer above can be addressed without collisions, the markup keeps a stable identity contract:
- The module renders inside `<div class="superapp-scope" data-sa-pack="…">` (carries the pack token map + optional `--sa-accent-override`).
- Each kind's root carries `data-module-id="<id>"` and a BEM root class (`superapp-banner`, `superapp-section`, …); child parts use BEM (`superapp-banner__heading`).
- Per-module compiled CSS is scoped to `[data-module-id="<id>"]`; pack tokens to `.superapp-scope[data-sa-pack]`; sanitized `customCss` is root-scoped to the same `[data-module-id]`.
- Precedence therefore falls out of the cascade: pack map (wrapper) < per-module vars (`[data-module-id]`) < merchant settings/`customCss`, with the HIG floor enforced last by QA.

---

## 4. Template catalog

Both packs render every template from the **same markup** (`snippets/superapp-module.liquid` + the native-section renderer) — only tokens + per-kind class modifiers differ.

### 4.1 Module kinds (`theme.section`, dispatched on `config.kind`)

| Kind | Activation | Key config | Luxe | Bold |
|---|---|---|---|---|
| `notification-bar` | inline/sticky | `message · linkText · linkUrl` | ink bar, mono accent link | accent bar, ALL-CAPS + countdown, ink button |
| `banner` | inline | `heading · subheading · ctaText/Url · imageUrl` | 2-col editorial split, serif headline, square CTA | dark/photo-overlay split, oversized caps, offset-shadow CTA |
| `popup` | overlay | `title · body · ctaText/Url` + `trigger · frequency · delaySeconds · autoCloseSeconds` | cream card, square, long pop-in | ink-bordered card, accent offset shadow, overshoot pop-in |
| `contactForm` | inline | field toggles + `submissionMode · spamProtection` | cream, hairline inputs, centered, mono labels | dark, 2px inputs, caps labels, hard-shadow submit |
| `effect` | overlay | `effectKind · startTrigger · intensity · speed` | subtle embers / petals / soft snow | confetti burst / fireworks / glitter |
| `floatingWidget` | floating | `variant · anchor · label · actionUrl/Target` | ink pill, accent status dot, mono label | accent pill, ink border + offset shadow, icon + caps |
| `product-bundle` | inline | `title · components[] · discountPercentage · ctaLabel` | hairline card, serif totals, strike-through | 2px card + offset shadow, accent save chip |
| `product-recommendations` | inline | `recommendation.strategy · productLimit · fallback` | 4-up, square media, serif names, mono price | 2px tiles, caps names, accent price |

### 4.2 Native-section archetypes (`kind` on the generic section renderer)
Grounded in `packages/core/src/templates/sections/*`. Each ships 8–10 style-pack variants in the library; here is the per-pack treatment of the archetype.

| Archetype | `kind` | Layouts used | Luxe | Bold |
|---|---|---|---|---|
| Hero | `hero` | stacked · grid · carousel | editorial split, serif, square CTA | photo-overlay/dark, oversized caps |
| Feature bento / columns | `feature` | grid · masonry · carousel | hairline bento, serif tiles, span-2 hero | dark bento, 2px tiles, accent hero |
| Pricing | `pricing` | grid | 3 tiers, ink featured, gold "most loved" | 3 tiers, ink featured + accent offset shadow |
| FAQ | `faq` | stacked | hairline accordion, serif Qs, +/- | 2px rows, ink open-row, accent marker |
| Testimonials | `testimonial` | grid · carousel | serif quote cards, gold stars | 2px cards + offset shadow, accent stars |
| Gallery / lookbook | `gallery` | masonry · grid | masonry image grid, mono caption | 2px-framed grid, caps hashtag |
| Logo marquee / trust | `trust` | carousel (marquee) | muted serif wordmarks, "As seen in" | dark ground, grotesk caps, "Featured in" |
| Newsletter | `newsletter` | stacked | ink panel, gold subscribe | accent panel, ink send |
| Stats + CTA band | `stats` | grid | serif numerals, hairline dividers | oversized accent numerals on dark |
| Collection editorial | `collection` | grid | copy + product pair, mono CTA | dark copy panel, accent CTA |
| Team / story / timeline | `contact` · `team` · `timeline` | grid · stacked | round avatars, serif names; contact-method rows; serif timeline markers | 2px-framed avatars, caps names; accent-filled markers |
| Product page section | `pdp` | grid | gallery + serif buy box, pill variants | 2px gallery + caps buy box, offset ATC |
| Launch / 404 | `launch` | stacked | serif "coming soon" + capture | oversized accent "DROP 05" + capture |
| CTA band | `cta` | stacked | serif title, square ink button row | caps title, accent offset-shadow buttons |
| Upsell / bought-together | `upsell` | grid | hairline product rows, mono price, quiet Add | 2px tiles, accent price + Add chip |
| Announcement / countdown / free-ship band | `band` | stacked | ink band, mono countdown, underline CTA | accent band, caps message + countdown, progress fill |
| Config-summary card | `technical` | stacked | labelled summary card for non-visual kinds (never a raw key/value dump) | same, 2px frame, accent type chip |
| **Sticky add-to-cart bar** | `sticky-atc` | fixed bottom bar (thumb zone) | ink bar, serif name, mono price, square ATC | white bar 2px top rule, caps name, accent ATC + offset shadow |

> **Renderer note (updated 2026-07-10):** `pdp` and `sticky-atc` now have dedicated `{% when %}` branches in `superapp-module.liquid` (aliases: `pdp · product-page · product-detail · buy-box` and `sticky-atc · sticky-add-to-cart · atc-bar`; `sticky-atc` was moved out of the `technical` alias list). `pdp` = media gallery + thumbs + buy box (eyebrow · title · ★ rating · price + compare-at · variant pills ≥ 44px · ATC · ✓ trust line). `sticky-atc` = viewport-bottom fixed bar (thumb + name + price + ATC), `env(safe-area-inset-bottom)` aware, ATC ≥ 44px. Token layer: `.superapp-pdp` / `.superapp-satc` in `assets/superapp-modules.css` (both packs + reduced-motion branch).

### 4.3 Generic-section fallthrough
Any non-preset `kind` renders through the generic branch: `title · subtitle · imageUrl · body · blocks[] · ctaText/Url`, under a `layout` archetype. The `advancedCustom` HTML/CSS/JS escape hatch is **not** executed (fixed-template allowlist) — only declarative content.

---

## 5. Building blocks & vocabulary

### 5.1 Layout archetypes (`config.layout.layout`)
| Value | Renders | Token |
|---|---|---|
| `stacked` (default) | single-column flow | no modifier |
| `grid` | `columns`-wide CSS grid | `--sa-cols` |
| `masonry` | CSS `column-count` masonry | `break-inside:avoid` |
| `carousel` | horizontal scroll-snap row | `scroll-snap-type:x mandatory` |

### 5.2 Block kinds (`config.blocks[]`)
Reorderable content list; each block `{ kind, text, imageUrl?, url?, fields }`. Kinds seen across the corpus: `cta` (label+link+`style`) · `media`/`slide` (image + headline/subhead/ctaLabel) · `stat` (value+label) · `feature` (eyebrow+heading+icon+span+tint) · `step` (number+detail+icon) · `faq-item` (question+answer) · `plan` (pricing tier) · `review-card` · `team-member` (photo+name+role) · `contact-method` (label+value/url) · `milestone`/`event` (timeline) · `logo`/`badge` (trust) · `product-card`/`product`/`addon` (upsell: thumb+name+price+ctaLabel). `span` ∈ `single · wide · tall`; `cta.style` ∈ `primary · secondary · outline · ghost · link`.

**Merchant layer-5 override set (live in all four blocks, verified 2026-07-10):** `style_pack · accent_override · override_radius · override_density · override_align · override_text · override_bg` — passed through to `superapp-module.liquid` and written onto the `.superapp-scope` wrapper as `--sa-*` overrides.

### 5.3 Placement (`placement.enabled_on/disabled_on.templates`)
Scopes where a module renders, matched to `template.name`. Placeable set: `404 · article · blog · cart · collection · list-collections · index · page · password · product · search` (+ classic `customer/*` + `metaobject/<type>`). No placement metadata ⇒ renders everywhere (back-compat).

### 5.4 Popup behavior
- `trigger` ∈ `ON_LOAD · ON_EXIT_INTENT · ON_SCROLL_25/50/75 · ON_CLICK · TIMED`
- `frequency` ∈ `EVERY_VISIT · ONCE_PER_SESSION · ONCE_PER_DAY · ONCE_PER_WEEK · ONCE_EVER`
- `showOnPages` ∈ `ALL · HOMEPAGE · COLLECTION · PRODUCT · CART · CUSTOM`
- Mobile = bottom-sheet/near-full card w/ large close; desktop = centered inset. Primary CTA in the thumb zone.

### 5.5 Display rules (`config.ruleEngine`, R2.1) — conditional visibility
Rows `(object, attribute, operator, value)` combined by group logic (AND/OR), settling to a `matchAction` ∈ `SHOW · HIDE`.
- **Objects:** `product · customer · cart · geo · temporal · behavioral`.
- **Attributes** (validated pair): e.g. `customer.loggedIn/ordersCount/tags/totalSpent/countryCode/acceptsMarketing`, `cart.subtotal/itemCount/containsProductId/discountCode`, `geo.countryCode`, `temporal.date/dayOfWeek/timeOfDay`, `behavioral.recentlyViewed/pagesViewedThisSession/scrollPercent/exitIntent/utmSource/referrerContains`.
- **Operators:** `equal_to · not_equal_to · greater_than · less_than · greater_than_or_equal · less_than_or_equal · contains · not_contains · starts_with · ends_with · is_set · is_not_set`.
- **UI rule:** a gated module renders **hidden first** (no flash), then the client sweep reveals/removes — the entrance micro-interaction (§7 F4) plays on reveal, never a layout jump.

### 5.6 Recommendation strategies (`config.recommendation`)
`manual · collection · related · complementary · most-expensive-in-cart · cheapest-in-cart` (static, no service) + `top-sellers · trending · buy-it-again · recently-viewed` (dynamic). `fallback` ∈ `manual · collection · related · hide`; `productLimit` 1–12. Pending/dynamic slots show the **skeleton-shimmer** loading state (§7 F6) — never an empty slot.

### 5.7 Pricing / discount vocab (pricing sections & bundles)
`pricing.model` ∈ `single · tiered · bogo · gift`; `discount.kind` ∈ `percentage · fixed-amount · fixed-price · cheapest-free · free-shipping · free-gift · none`; `threshold.basis` ∈ `quantity · cart-value`. Savings shown as **icon/badge + text** (never color alone).

### 5.8 Floating-widget variants & anchors
`variant` ∈ `whatsapp · chat · coupon · cart · scroll_top · custom` (icon per variant); `anchor` ∈ `bottom_right · bottom_left · top_right · top_left · bottom_center`. ≥ 44px target, `box-shadow` lift, `hideOnMobile/Desktop` aware.

### 5.9 Contact-form fields
Toggleable: `name · email · phone · company · orderNumber · subject · message` (+ `*Required`); `consentRequired` + `consentLabel`; `spamProtection` ∈ `HONEYPOT`; `submissionMode` ∈ Shopify contact | `APP_PROXY` (fetch submit, inline status). Inputs `font-size ≥ 16px`.

---

## 6. Effects — comprehensive catalog

`effect` modules are decorative full-viewport overlays (`pointer-events:none`, `aria-hidden`, `z-index` overlay). `config.effectKind` is an **open string** (the renderer branches on it); `startTrigger` ∈ `page_load · on_scroll · timed · on_click`; `intensity` ∈ `light · medium · heavy` (particle count); `speed` ∈ `slow · normal · fast`. **Every effect ships a `prefers-reduced-motion` branch that renders nothing** (particles hidden, no animation), and a light/dark contrast pass.

| Effect | Recommended trigger | Minimal Luxe treatment | Bold DTC treatment |
|---|---|---|---|
| **snowfall** | page_load, seasonal | Sparse, small, off-white flakes, slow drift, low opacity | Denser white flakes, medium speed |
| **embers / fireflies** ★ | page_load | **Gold/cream particles rising + sway + rotate over a warm radial stage, soft glow shimmer** (the Luxe signature) | Warm sparks rising, faster |
| **petals / falling-leaves** | seasonal | Muted rose/sage petals, slow, gentle rotation | Saturated autumn leaves, brisk |
| **confetti burst** ★ | on_click, conversion | Restrained gold/cream burst, few pieces, quick settle | **Multicolor pieces launching from a central flash along per-piece vectors + heavy rotation** (the Bold signature) |
| **fireworks** | timed, celebration | — (too loud; use embers) | Accent + secondary bursts on dark, staggered |
| **glitter / shimmer** | on_scroll | Fine low-opacity twinkle on hero only | Bright accent glitter sweep |
| **rain** | page_load | Thin, near-mono streaks, slow | Bolder streaks, faster |
| **bubbles** | page_load | Soft translucent rise | Bright accent bubbles |
| **stars / shooting-stars** | timed | Faint twinkle on dark hero | Accent shooting streaks |
| **balloons** | on_click | — | Rising accent balloons (sale/launch) |
| **spotlight / vignette** | on_scroll | Subtle radial dim to focus content | Hard accent spotlight |
| **ambient-gradient drift** | page_load | Slow warm off-white gradient shift | Saturated multi-stop drift |

**Rules for all effects:** GPU transform/opacity only (no layout thrash) · particle count scales with `intensity` and clamps on mobile · `speed` maps to the motion-duration token · never blocks scroll or taps · auto-stop after N loops for `on_click`/conversion effects. **Pack guidance:** Luxe → the four "quiet" effects (embers, petals, soft snow, shimmer); Bold → the "loud" effects (confetti, fireworks, glitter, balloons). Bias to quiet on low confidence.

---

## 7. Micro-interactions — comprehensive catalog

Two tiers: **mandatory** (every module implements the full set — `[AUTO]` gated at QA) and **optional/contextual** (add where it earns its place). All use icon+text for status, respect `prefers-reduced-motion` (fades, no springs/z-axis), and stay within 80–500ms. Every interactive element models the **full state set**: `idle · hover · pressed · focus-visible · selected · disabled · entering · exiting` — a control with only idle+hover reads "templated".

### 7.1 Mandatory set (`[AUTO]`)
| ID | Interaction | Trigger | Behavior | Timing | Reduced-motion | Luxe | Bold |
|---|---|---|---|---|---|---|---|
| **F1** | Press | pointer/tap down | scale-down `.98` **or** `translateY(1px)`+shadow-shrink; press-cancel on drag-off | 100–150ms ease-out | instant state, no transform | `translateY(-2px)`→settle, no scale | `translate(2px,2px)` + hard-shadow shrink (overshoot) |
| **F2** | Hover role-shift | pointer hover (never touch) | bg / border / underline shift; **no info hover-only** | 150ms ease-out | color only | underline grows from accent | fill inverts / border thickens |
| **F3** | Focus ring | keyboard focus | explicit 2px `focus-visible` ring token, **never removed** | instant | same | ink ring, 2px offset | accent ring, 2px |
| **F4** | Entrance | mount / rule-reveal / scroll-in | fade + `translateY(8–14px)` (or blur-in+scale-settle); staggered for lists (40–80ms) | 220–400ms `enter` | fade only | long slow fade-up | snappier fade-up w/ slight overshoot |
| **F5** | Success | action resolves | **icon (✓) + text**, check-draw or fade | 220ms | icon+text, no draw | check-fade + label | check-pop + accent flash |
| **F6** | Loading | async pending | skeleton-shimmer / spinner + disabled control | shimmer 1–1.5s loop | static muted block | soft mono shimmer | accent-tinted shimmer |
| **F7** | Empty | no data to show | honest empty state, icon + one line + optional action | fade in | same | serif line, hairline frame | caps line, 2px frame |
| **F8** | Error | action fails | **icon (⚠) + text**, inline, non-blocking; input shake ≤ 1 cycle | 150–220ms | icon+text, no shake | muted red line | red line + short shake |

### 7.2 Component-level micro-interactions
| Component | Interaction | Luxe | Bold |
|---|---|---|---|
| Button | press-scale / translateY+shadow-shrink; loading→success morph | lift + settle | offset-shadow collapse (overshoot) |
| Input / textfield | focus-ring + floating-label + inline validation | hairline→ink focus | 2px→accent focus |
| Quantity stepper | tactile inset-on-press / spring | subtle | springy |
| Toggle / switch | animated knob slide | slow | snappy |
| Accordion (FAQ) | height expand/collapse + marker rotate (`+`→`–`) | 300ms ease | 200ms, accent marker |
| Carousel | scroll-snap, drag-follow, dot/arrow state, peek-next | slow glide | snappy snap |
| Tabs | active-underline slide | ink underline | accent block |
| Tooltip / popover | fade + small offset | slow | fast |
| Toast | slide-in + auto-dismiss + `aria-live` | quiet | accent bar |
| Badge / save-chip | none / subtle pulse on change | static | pulse on update |

### 7.3 Reveal & headline motion (marketing sections)
- **Scroll-progress reveal:** directional reveal + fade, `amount≈0.5`, `once:true`, per-item stagger, mapped to normalized 0→1 progress (not one-shot). Luxe slow; Bold snappy.
- **Blur-in + scale-settle:** `blur(4px)→0`, `scale 1.03→1`, staggered — default card/hero entrance.
- **Kinetic headline (headlines only):** per-character rise / mask-reveal-up / shimmer sweep / gradient-on-scroll. **Reserve for hero + section headings; body is not a motion surface.** Luxe: mask-reveal; Bold: scramble/drip/gradient.
- **Image fade-in on media load;** **scroll-velocity-driven marquee** for logo/trust rows (beats fixed-speed loops).

### 7.4 Celebration (conversion beats only)
Confetti / emoji-burst / tada on **add-to-cart & order-complete only** — motion as reward, reserved. Playful/Bold default on; Luxe opt-in and restrained. Always reduced-motion safe.

### 7.5 Device & discipline
No hover-only info or action (`[AUTO]`) · press-cancel on drag-off · `focus-visible` only (no mouse focus ring) · most traffic is mobile — every interaction works touch-first · retune any 1s library defaults to 150–600ms.

---

## 8. Motion system

| `motion.duration` | ms band | Use |
|---|---|---|
| `none` | 0 | reduced-motion / utility |
| `fast` | 80–150 | micro (press, hover, toggle) — **Bold default** |
| `base` | 150–320 | short/medium (entrance, reveal, accordion) |
| `slow` | 320–500 | long fades — **Luxe default** |

| `motion.easing` | Curve | Use |
|---|---|---|
| `enter` | ease-out | entrances (non-blocking, cancelable) |
| `exit` | ease-in | dismissals |
| `standard` | ease-in-out | move/reposition |
| `mechanical` | near-linear | data/utility ticks |

Spring (physical props only — `x/y/scale/rotate`): stiffness ~100, damping ~10, bounce ~0.25; snappy/press → damping ~25, stiffness ~700. Stylistic props (`opacity/color`) → tween. Entrances are always non-blocking + cancelable + reduced-motion-branched.

---

## 9. Selection & implementation

### 9.1 Generation-pipeline binding (how "source of truth" is enforced)
This doc is wired into every stage that produces a module, so a generated module cannot drift from it:

| Stage | File | What it consumes from this doc |
|---|---|---|
| 1. Pack selection | `services/ai/style-packs.server.ts` | §3 packs + §9.2 auto-select heuristic → resolves `stylePack` (`auto→luxe/bold`) via `resolveStorefrontPack` |
| 2. Prompt grounding | generation prompt | §2 token grammar, §4 catalog, §5 vocab, §6 effects, §7 micro-interactions — the model may emit **only** these tokens/kinds/effects |
| 3. Recipe validation | `recipe.ts` / `storefront-style.ts` / `allowed-values.ts` | the enums in §2 & §5 are the schema; an off-vocabulary value is a parse error, not a silent no-op |
| 4. Token compilation | `services/ai/style-compiler.ts` | lowers `StorefrontStyle` + pack → the `--sa-*` map in §9.3 (incl. OKLCH ramp from `colors.seed`) |
| 5. Render | `assets/superapp-modules.css` + `snippets/*.liquid` | the token layer + invariant markup in this repo folder |
| 6. Design-QA gate | `services/ai/design-qa.server.ts` | §1.4 HIG floor + §7 mandatory F1–F8 + §6 reduced-motion + pack/palette fidelity — **self-audits before returning; regenerates on `[AUTO]` failure** |

**Rule:** any new template, effect, or interaction must be added *here first* (grammar + pack mapping + QA check), then to the prompt/compiler/CSS — never the reverse.

### 9.2 Auto-select the pack
From extracted aesthetic signals (bg luminance, accent saturation, hue family, palette spread, heading-font class), same heuristic as the "Bible" style packs. The six aesthetic packs collapse to the two render packs via `resolveStorefrontPack`: `bold ← {bold-dtc, playful-commerce}`, `luxe ← {apple-hig-clean, editorial-wellness, minimal-luxe, tech-utility}`. **Bias to a "can't-look-wrong" pack (Luxe / Apple-HIG Clean) on low confidence**; never silently pick a personality-heavy pack. Merchant overrides via `stylePack` (§3.3.1).

### 9.3 Runtime tokens
The pack + `StorefrontStyle` resolve to `--sa-*` custom properties (`--sa-radius`, `--sa-radius-lg`, `--sa-btn-radius`, `--sa-border-w`, `--sa-border-color`, `--sa-shadow`, `--sa-overlay-shadow`, `--sa-accent`, `--sa-ink`, `--sa-font-display`, `--sa-display-weight/-transform/-spacing`, `--sa-label-transform/-spacing`, `--sa-motion`, `--sa-ease`, `--sa-lift`, `--sa-press`, `--sa-pad`) set once on the `.superapp-scope[data-sa-pack]` wrapper; every renderer reads the same tokens. Full map: `assets/superapp-modules.css` (this folder).

### 9.4 Invariants
- **Markup is invariant** — `snippets/superapp-module.liquid`, `superapp-product-bundle.liquid`, `superapp-recommendations.liquid`, and the native-section renderer are untouched; only tokens + per-kind modifier classes differ between packs.
- **OKLCH ramp:** `colors.seed` derives the 12-step semantic ramp + `-content` pairings (`style-compiler.ts`), so accent-on-surface contrast is guaranteed per store.
- **Colors & fonts default to the store** (§3.3.2); pack hexes/families are fallbacks only.
- **Token ownership:** the pack wrapper owns the *structural grammar* (radius, border, shadow/elevation, motion curve, decoration, accent); the per-module compiler emits *brand color + explicitly-set overrides* scoped to `[data-module-id]`, so the merchant `stylePack` toggle re-skins live (§3.3.1) and per-module overrides still win over pack defaults (§3.3.3).

---

## 10. Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-10 | **Filled the audit gaps.** Built the dedicated `pdp` renderer branch (gallery + buy box) and the new `sticky-atc` archetype (fixed bottom add-to-cart bar) — alias table, self-header list, Liquid branches, and `.superapp-pdp` / `.superapp-satc` token CSS in both packs with reduced-motion branches; `sticky-atc` removed from the `technical` alias list. Added the four live archetypes (`cta` · `upsell` · `band` · `technical`) + `sticky-atc` to the Template Gallery §06 in both packs, and completed the indexes (`shooting-stars` in §07 effects, `carousel` in §08 interactions). Reference: `docs/design-system/AUDIT-2026-07-10.md`. | Sticky ATC + PDP buy box are the two highest-converting surfaces in ecommerce; they must be first-class in the system, not fallthroughs. Doc first, then renderer + gallery — per §9.1. |
| 2026-07-10 | **Full audit against the live repo.** Verified every §2 enum + §5 vocab matches `allowed-values.ts`/`storefront-style.ts` exactly; pipeline files exist and are tested; the `.superapp-scope[data-sa-pack]` wrapper is applied; runtime CSS carries the full §9.3 token map. Reconciled drift into this doc: added the live `cta`/`upsell`/`band`/`technical` archetypes, split `contact·team·timeline`, extended §5.2 block kinds, documented the layer-5 override set. | This doc is the source of truth — drift in either direction gets reconciled here first, then downstream. |
| 2026-07-10 | Made the Template Gallery guide **fully responsive** (documentation grids collapse multi-col → 2-col → 1-col across 1200/860/560px; pack panels stack; fluid padding + display type) and expanded it from a gallery into a full **visual design-system guide**: §04 Layout & responsiveness (breakpoints, gap-over-margin rules, alignment, grid/flex archetypes, responsive collapse) + §05 Component library of atoms (buttons/CTAs, inputs, radio & selection types, tabs, accordions, toggles, cards, badges, data display, overlays/notifications) in both packs, + 45-entry effects and 81-entry micro-interaction indexes. | A design system needs its atoms, layout laws, and full interaction/effect vocabulary documented and visible — not just assembled templates — so generation and QA can reference every primitive. |
| 2026-07-09 | Two-pack module design system (Minimal Luxe + Bold DTC) over one shared `StorefrontStyle` token grammar; accent is the single tweakable token; fonts/colors inherit from the store | Cover the full template library with two premium, can't-look-wrong directions while staying brand-adaptive and markup-invariant. Reference build: `Template Gallery.dc.html` (1a / 1b). |
| 2026-07-09 | Documented the **entire storefront recipe vocabulary** in depth — every `StorefrontStyle` axis + enum, all module kinds + section archetypes, blocks, layouts, placement, popup behavior, display-rule engine, recommendation/pricing/floating-widget/contact vocab | The design system must map onto the exact values the generator emits (`allowed-values.ts` / `storefront-style.ts`), not a paraphrase, so every generated module is on-system. |
| 2026-07-09 | Added the comprehensive **Effects** (§6) and **Micro-interactions** (§7) catalogs, per pack, with reduced-motion branches and the mandatory `[AUTO]` set (F1–F8) | Effects + micro-interactions were the thinnest part of the render path; enumerating them per pack makes "Apple-level polish, never a miss" enforceable at generation + QA. |
| 2026-07-09 | Rebuilt the `effect` module — embers (Luxe) + confetti-burst (Bold) as the two signature effects | Prior effect was a thin vertical dot-fall; the new signatures are richer, on-brand per pack, and reduced-motion safe. |
| 2026-07-09 | **Declared this doc + `superapp-modules.css` the single SOURCE OF TRUTH for generated-module UI & styling**, bound to every pipeline stage (§9.1): pack-select → prompt → schema → compiler → CSS → QA gate. New templates/effects/interactions land here first, then downstream. | Generated-module styling had no single authority — the prompt, compiler, and CSS could drift. One source of truth, enforced by the QA gate, is what makes "Apple-level, never a miss" real. |
| 2026-07-10 | Added `StorefrontStyle.pack` (`auto·luxe·bold`, resolved not authored) + the **scoping & identity contract** (§3.3.4) + explicit **token-ownership split** (§9.4): pack wrapper owns structural grammar, per-module compiler owns brand color + explicit overrides. | Persist the resolved pack so the renderer stamps `data-sa-pack` deterministically, and guarantee merchant override + stable class/ID scoping so the precedence chain (§3.3.3) actually holds in the cascade. |
