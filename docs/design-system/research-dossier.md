# Design System Bible — Research Dossier

**Purpose.** A research-backed, enforceable specification so every AI-generated storefront module (popups, banners, sections, gamified widgets) ships at Apple-level polish, is mobile-first, and is rendered through a named **style pack** matched to the merchant's live storefront aesthetic. This document is written to be machine-checkable: prefer the numbers and pass/fail rules over prose.

**Scope.** Sections A–H below. Each rule cites its source. Where a number is enforceable by the generator/QA layer it is marked **[AUTO]**; where it requires human/heuristic judgment it is marked **[REVIEW]**.

---

## Source provenance & research method

| # | Source | Access method | Status |
|---|--------|---------------|--------|
| 1 | Apple Human Interface Guidelines — Layout, Typography, Color, Materials, Motion, Accessibility, Buttons | gstack `/browse` headless Chromium, JS-rendered main content captured in full | ✅ Studied directly (full text extracted) |
| 2 | hims.com / forhers.com | `/browse`, WebFetch, Brandfetch, Mobbin | ⚠️ **Both sites sit behind a Cloudflare "Just a moment" Turnstile bot challenge that a headless agent cannot pass; server-side fetch returns 403.** Teardown built from published design analyses (DesignRush Hims teardown, Stine Nielsen's Hers identity case study, Mobbin/Brandfetch color references, Steve Harvey brand analysis). Pack hexes in §C are a **curated palette in the documented spirit** of the brands, not literal pixel extractions, and are labelled as such. |
| 3 | Muzli / Tubik articles | `/browse` | ✅ "Product Page Design: Handy UX Tips" captured in full. ⚠️ The 3 roundup posts (mobile, 10 UI projects, 11 web projects) are behind Cloudflare + Medium identity gate and are image-heavy showcases with thin captions; §D's mobile/UI rules draw on the captured product-page article plus established Tubik/Muzli principles, flagged where not from the verified full text. |
| 4 | Shopify spin-to-win apps — Wheelio (Original), OptiMonk, Spin-a-Sale/EVM, Privy Convert, Tada, Wheelify, CrazyRocket | WebSearch + `/browse` on avada.io and launchtip.com review pages | ✅ Feature catalogue extracted from app docs and detailed third-party reviews |

> **How this ties to the app.** The codebase already extracts a live store aesthetic in `apps/web/app/services/theme/theme-analyzer.service.ts` (`extractPalette` / `extractTypography`) producing a `StorePalette` (`primary`, `accent`, `background`, `text`, `button`, `buttonText`, `neutrals[]`, `source`) and `StoreTypography` (`headingFont`, `bodyFont`). `apps/web/app/services/ai/design-reference.server.ts` already folds that into a `DesignReferencePack`. The style-pack framework in §B is designed to slot directly on top of those existing fields — the pack supplies the *grammar* (type scale, radius, motion, density) while the extracted palette/fonts supply the *content*.

---

## A. Apple HIG → Enforceable Rule Set

All values below are quoted from the Apple Human Interface Guidelines (Foundations: Layout, Typography, Color, Materials, Motion, Accessibility; Components: Buttons). Where Apple states a number, it is reproduced verbatim. Web modules use **CSS px ≈ iOS pt at 1×** as the mapping rule (1 pt = 1 px logical unit).

### A1. Touch targets & hit areas (Accessibility → Mobility; Buttons)

| Rule | Value | Enforce |
|---|---|---|
| Minimum interactive hit region (iOS/iPadOS, watchOS) | **44 × 44 pt** default; **28 × 28 pt** absolute minimum | **[AUTO]** every tappable element ≥ 44×44 |
| Minimum control size, macOS (pointer) | 28×28 pt default, 20×20 pt min | [AUTO] desktop variant |
| Minimum control size, tvOS / visionOS | tvOS 66×66 pt; visionOS 60×60 pt (eye target) | [REVIEW] only if those surfaces targeted |
| Padding around a **bezeled** element | ~**12 pt** | [AUTO] |
| Padding around a **bezel-less** element | ~**24 pt** | [AUTO] |
| Spacing between visionOS interactive centers | ≥ 60 pt apart | [REVIEW] |

> Source: Accessibility → "Offer sufficiently sized controls… iOS/iPadOS 44×44 pt (min 28×28)"; "about 12 points of padding around elements that include a bezel… about 24 points… without a bezel." Buttons → "a button needs a hit region of at least 44×44 pt — in visionOS, 60×60 pt."

### A2. Color contrast (Accessibility → Vision; WCAG AA, used by Apple's Accessibility Inspector)

| Text condition | Minimum contrast ratio |
|---|---|
| Text up to 17 pt, any weight | **4.5 : 1** |
| Text 18 pt and larger | **3 : 1** |
| Bold text, any size | **3 : 1** |

> Source: Accessibility → "Accessibility Inspector uses the following values from WCAG Level AA… Up to 17 pts / All / 4.5:1 — 18 pts / All / 3:1 — All / Bold / 3:1." Additional Apple rules: **never rely on color alone** (pair color with shape/icon/label); provide an increased-contrast variant; verify contrast in **both** light and dark. **[AUTO]** compute contrast(foreground, background) for every text node and gate on the table above.

### A3. Type scale (Typography → iOS/iPadOS Dynamic Type, default size class)

Apple's iOS text styles are the canonical "content-first" hierarchy. Generated modules map to these tokens.

| Style | Weight | Size (pt) | Leading (pt) | Emphasized |
|---|---|---|---|---|
| Large Title | Regular | 31 | 38 | Bold |
| Title 1 | Regular | 25 | 31 | Bold |
| Title 2 | Regular | 19 | 24 | Bold |
| Title 3 | Regular | 17 | 22 | Semibold |
| Headline | Semibold | 14 | 19 | Semibold |
| Body | Regular | 14 | 19 | Semibold |
| Callout | Regular | 13 | 18 | Semibold |
| Subhead | Regular | 12 | 16 | Semibold |
| Footnote | Regular | 12 | 16 | Semibold |
| Caption 1 | Regular | 11 | 13 | Semibold |
| Caption 2 | Regular | 11 | 13 | Semibold |

> Source: Typography → "iOS, iPadOS Dynamic Type sizes" table. Largest accessibility size (AX5) pushes Body to 53 pt and Large Title to 60 pt; modules must remain legible and un-truncated when scaled — see A8.

### A4. Type legibility minimums (Typography; Accessibility)

| Platform | Default body | Absolute minimum |
|---|---|---|
| iOS / iPadOS | **17 pt** | **11 pt** |
| macOS | 13 pt | 10 pt |
| visionOS | 17 pt | 12 pt |
| watchOS | 16 pt | 12 pt |
| tvOS | 29 pt | 23 pt |

> Source: Typography → "Ensuring legibility" table; Accessibility → identical table. **Weight rule:** "avoid light font weights… prefer Regular, Medium, Semibold, or Bold; avoid Ultralight, Thin, and Light." If a thin custom weight is unavoidable, size up. **[AUTO]** reject body text < 11 px on mobile; **[AUTO]** reject weights < 400 for body copy.

### A5. Typeface discipline (Typography → Conveying hierarchy)

- "Minimize the number of typefaces… Mixing too many different typefaces… obscure your information hierarchy." **[AUTO]** ≤ 2 families per module (1 display + 1 text), monospace allowed only for numeric/code data.
- Convey hierarchy with **weight, size, and color**, not new fonts.

### A6. Color system (Color)

- Prefer **semantic, hierarchical foreground colors**: primary label → secondary label → tertiary → quaternary; plus separator, placeholder, link. Background hierarchy: primary (overall view) → secondary (grouping) → tertiary (nested grouping). **[AUTO]** map every text role to one of these tiers; no more than 4 text-emphasis tiers.
- "Avoid using the same color to mean different things." **[REVIEW]**
- Supply **light + dark + increased-contrast** variants for any custom color. **[AUTO]** each pack ships all three.
- **Do not hard-code Apple system color values**; on web, use pack tokens (see §B/§C) that emulate the semantic intent.

### A7. Materials & elevation (Materials)

- Two layers: a **control/navigation layer** (Apple's "Liquid Glass") that floats over a **content layer**. Web translation: use translucent blurred surfaces (`backdrop-filter`) **only** for sticky bars / floating controls, never as a content background. **[REVIEW]**
- Standard material weights map to surface opacity: **ultra-thin → thin → regular (default) → thick**; thicker = more opaque = better text contrast; thinner = more context. **[AUTO]** a module surface holding body text uses ≥ "regular" equivalent (≥ 85% opaque) unless over solid color.
- Over a **bright** media background, a clear/translucent overlay needs a **dark dimming layer ≈ 35% opacity** for legibility. **[AUTO]** popups over imagery add a scrim ≥ 35%.
- Use **vibrant/high-contrast** label colors on any material; never low-contrast gray on glass.

> Source: Materials → "If the underlying content is bright, consider adding a dark dimming layer of 35% opacity"; "Thicker materials… provide better contrast… Thinner materials… retain context."

### A8. Layout, safe areas & adaptability (Layout)

- **Respect safe areas / system margins**; on web that means honoring `env(safe-area-inset-*)` (notch, home indicator, Dynamic Island) for any full-bleed or bottom-anchored module. **[AUTO]**
- "Place the most important items near the top and leading side" (reading order, RTL-aware). **[REVIEW]** content-first hierarchy.
- "Avoid full-width buttons" on iOS — inset from screen edges, harmonize with hardware corner radius. **[REVIEW]** prefer inset CTAs on mobile popups.
- Group related items with space/shapes/separators; "make essential information easy to find by giving it sufficient space." **[REVIEW]**
- Be prepared for **text-size changes to 200%** (watchOS 140%) without truncation; prefer **stacked layouts** when space is constrained at large type. **[AUTO]** verify no clipping at 200% body scale.
- iPhone reference viewport for design/QA: **375 × 812 pt** (iPhone X/11 Pro class); smallest supported **320 × 568** (SE 1st-gen). **[AUTO]** test both.

> Source: Layout → Best practices, Adaptability, Guides and safe areas, Specifications; Accessibility → "enlarge text by at least 200 percent (140 percent in watchOS)."

### A9. Motion (Motion; Accessibility → Cognitive)

Apple intentionally publishes **principles, not fixed durations** (the system owns timing). The enforceable numbers below come from this project's `DESIGN.md` motion spec, which is HIG-compatible; the principles are Apple's.

| Bucket | Duration | Use |
|---|---|---|
| micro | 80–100 ms | press / toggle state |
| short | 150–220 ms | hover, focus ring, small reveals |
| medium | 220–320 ms | entrance, modal open, success |
| long | 320–500 ms | full popup / sheet transition |

Easing: enter `ease-out`, exit `ease-in`, move `ease-in-out` (from `DESIGN.md`).

Apple motion principles (enforce as rules):
- **Purposeful, brief, precise** — "Don't add motion for the sake of adding motion." **[REVIEW]**
- **Cancelable** — "don't make people wait for an animation to complete." **[AUTO]** any entrance animation must not block interaction.
- **Optional** — motion is never the only signal; pair with text/haptic/visual. **[AUTO]**
- **Honor `prefers-reduced-motion`** — when set: tighten/remove springs, replace x/y/z transitions with **fades**, avoid z-axis depth animation, avoid animating blurs, no looping/peripheral motion. **[AUTO]** every module ships a reduced-motion branch.
- Games/canvas (e.g. the wheel) target **30–60 fps**. **[AUTO]**

### A10. Button anatomy (Buttons)

- A button = **Style** (size/color/shape) + **Content** (symbol and/or label) + **Role** (Normal / Primary / Cancel / Destructive).
- **One, at most two, prominent (filled/accent) buttons per view.** **[AUTO]**
- Distinguish the preferred action by **style, not size** — sibling options share size. **[AUTO]**
- **Always include a press state** for custom buttons ("Without a press state, a button can feel unresponsive"). **[AUTO]**
- **Never** assign the Primary role to a destructive action. **[AUTO]**
- Verb-first, title-case labels ("Add to Cart"). Append "…" only when it opens further input. **[REVIEW]**
- Show an in-button activity indicator for non-instant actions ("Checkout" → "Checking out…"). **[REVIEW]**

---

## B. Style-Pack Framework

Six named, selectable design systems. Each pack is a **token grammar** applied on top of the merchant's extracted `StorePalette`/`StoreTypography`. Packs never override extracted brand *colors/fonts* by default — they define *scale, radius, shadow, density, motion personality, and imagery direction*, and they decide **how** the extracted palette is deployed (e.g. where accent goes, how much it's used).

### B0. Selection pipeline (ties to live extraction)

```
themeProfile.palette  (primary, accent, background, text, button, buttonText, neutrals[], source)
themeProfile.typography (headingFont, bodyFont)
            │
            ▼
  computeAestheticSignals()           ← derived, all [AUTO]
   • bgLuminance            (light / dark store)
   • accentSaturation       (HSL S of primary/accent)
   • accentHueFamily        (warm / cool / neutral)
   • paletteSpread          (# distinct neutrals, contrast range)
   • cornerRadiusObserved   (from button radius if detectable, else 'unknown')
   • fontClass(headingFont) (serif / geometric-sans / humanist-sans / mono / display)
            │
            ▼
  selectPack(signals)  → ranked packs + confidence
            │
            ▼
  pack supplies: typeScale, radiusScale, shadowScale, density, motionPersonality, imageryRule
  extraction supplies: actual hex + font families
```

The default when `palette.source === 'none'` (extraction failed) is **Apple HIG Clean** (safest, most neutral). Merchants can always override the auto-selected pack.

### B1. The six packs (summary matrix)

| Pack | Type pairing | Density | Radius | Shadow | Motion personality | Imagery | Accent usage |
|---|---|---|---|---|---|---|---|
| **Apple HIG Clean** | System UI / SF-like geometric sans (display + text same family, weight-differentiated) | Comfortable | sm 8 / md 12 / lg 16 / full | Soft, single-layer, low (`0 1px 2px`, `0 6px 16px`) | Minimal-functional, system-like | Clean product on neutral, generous negative space | 1 accent, sparing — filled primary only |
| **Editorial Wellness** | Serif display + humanist sans body (see §C) | Airy (most whitespace) | lg 16 / xl 24 / pill CTAs | Very soft / near-flat, warm-tinted | Calm, slow, gentle fades | Warm film-style lifestyle, unretouched, human | Warm accent as large fields + pill buttons |
| **Bold DTC** | Heavy grotesk display + neutral sans body | Compact-punchy | sm 6 / md 10 | Hard offset / sometimes none, high contrast | Snappy, confident, slight overshoot | High-contrast hero, bold crops, big type-on-image | Saturated accent everywhere, big filled CTAs |
| **Minimal Luxe** | High-contrast serif or thin-to-light display + refined sans | Sparse, precise | none–sm 4 (sharp) | None / hairline borders only | Restrained, elegant, long fades | B&W or muted, lots of margin, single focal image | Monochrome + 1 metallic/deep accent, hairline rules |
| **Playful Commerce** | Rounded sans display + rounded sans body | Cozy, chunky | lg 16 / xl 24 / full pills | Colored soft glows, layered | Bouncy springs, confetti, wiggle | Bright illustration, stickers, gradients, emoji-adjacent | Multi-accent, gradients, colorful chips |
| **Tech Utility** | Geometric/neo-grotesk sans + mono for data | Dense, gridded | sm 6 / md 8 | Crisp 1px borders + tiny shadow | Fast micro-only (80–150 ms) | Screenshot/diagram, schematic, mono labels | Cool accent, monochrome neutrals, mono numerals |

> Packs share **all of §A** (touch targets, contrast, type minimums, motion bounds, reduced-motion). The matrix only changes *personality within those bounds*. A "Bold DTC" hard shadow is still a real shadow; a "Minimal Luxe" hairline still meets 3:1 separation.

### B2. Per-pack token contract (every pack must define)

```ts
type StylePack = {
  id: 'apple-hig-clean'|'editorial-wellness'|'bold-dtc'|'minimal-luxe'|'playful-commerce'|'tech-utility';
  typeScale: { display:number; h1:number; h2:number; body:number; caption:number }; // px, mobile base; clamps in §E
  fontRole: { displayClass:'serif'|'geom-sans'|'humanist-sans'|'rounded-sans'|'grotesk'; bodyClass:string };
  radius: { sm:number; md:number; lg:number; pill:9999 };
  shadow: { rest:string; raised:string };           // CSS box-shadow strings
  density: 'airy'|'comfortable'|'compact';           // → maps to spacing multiplier
  spacingBase: 8;                                     // px (project standard, DESIGN.md)
  motion: { personality:'calm'|'system'|'snappy'|'elegant'|'bouncy'|'fast'; springs:boolean };
  imageryRule: string;                               // generation hint
  accentStrategy: 'sparing'|'fields'|'everywhere'|'mono-plus-one'|'multi'|'cool-mono';
  // colors/fonts come from extracted StorePalette/StoreTypography, NOT hard-coded here
};
```

### B3. Selection heuristics ("pick this pack when the merchant storefront looks like…")

All conditions are computed from the extracted signals in B0. Ship the highest-scoring pack; expose top-3 as alternatives.

| Pack | Pick when… (heuristic) | Signal logic |
|---|---|---|
| **Apple HIG Clean** | Neutral/cool palette, low accent saturation, lots of white, sans heading, no strong personality; **or extraction failed**. | `accentSaturation < 0.35` AND `fontClass ∈ {geom-sans, humanist-sans}` AND `bgLuminance > 0.85`; default if `source==='none'`. |
| **Editorial Wellness** | Soft, warm, calming store — beige/cream/sage/clay backgrounds, **serif** heading, wellness/beauty/DTC-health, big imagery. | `accentHueFamily==='warm'` AND (`fontClass==='serif'` OR `bgLuminance ∈ [0.80,0.95]` with low-sat warm neutrals). |
| **Bold DTC** | Loud, high-contrast store — saturated accent, heavy headings, big type-on-image, streetwear/supplements/energy. | `accentSaturation > 0.6` AND contrast(primary,bg) high AND heading weight ≥ 700 (if detectable). |
| **Minimal Luxe** | Sparse luxury — near-monochrome, black/white/deep neutral, serif or thin display, fashion/jewelry/premium. | `paletteSpread` low (≤ 3 neutrals, near-grayscale) AND (`fontClass==='serif'` OR thin display) AND `accentSaturation < 0.25`. |
| **Playful Commerce** | Bright, colorful, rounded — multiple saturated colors, rounded sans, kids/toys/food/novelty. | ≥ 3 saturated neutrals OR gradients detected AND `fontClass==='rounded-sans'`; warm+cool mix. |
| **Tech Utility** | Cool, gridded, data-dense — blue/teal accent, geometric sans, electronics/SaaS-merch/tools. | `accentHueFamily==='cool'` AND `fontClass==='geom-sans'` AND dense neutral ramp; mono present in theme. |

**Confidence & fallback.** If top score − second score < threshold, mark `[REVIEW]` and surface a pack picker in the merchant UI. Never silently pick a personality-heavy pack (Bold/Playful/Luxe) on low confidence — bias to **Apple HIG Clean** or **Editorial Wellness** (the two "can't-look-wrong" packs).

---

## C. Editorial Wellness Pack — Full Spec

> **Sourcing note (read first).** hims.com and forhers.com are gated by a Cloudflare bot challenge unreachable by a headless agent, and server-side fetches return 403. The teardown below is assembled from published, citable analyses: DesignRush's Hims website teardown, Stine Nielsen's Hers brand-identity case study, and Mobbin/Brandfetch brand-color references. **Verbatim findings** are quoted; **hex values are a curated palette built to match those documented findings** (warm, soft, "soothing yet confident", Mine Shaft `#333333`/white core) — they are design-system tokens for our pack, not pixel-sampled brand colors. Re-sample on a machine that can pass the challenge before treating any hex as the brands' official value.

### C1. Verbatim teardown findings

**Hims (men's):** "a mix of subdued pastels in blue, coral, orange… colorful, yet cool and relaxed"; "simple, lowercase typography" + "minimal, yet poignant, text"; "an extensive amount of negative, empty space" with "bold images"; CTAs are "clean, bold black boxes overlaid onto images that pop" with "single words or minimal phrases"; lifestyle photography of "a man that could potentially be using it"; overall "screams modernity and youth," guiding "users from point A to point B with ease." Core brand colors per Mobbin/Brandfetch references: **Mine Shaft `#333333`** and **White `#FFFFFF`**, calming light blues/grays. (Source: DesignRush; Mobbin; Brandfetch.)

**Hers (women's):** "soft colors" for "a soothing yet confident feel"; "typography varies between elegant and approachable" (i.e. a **serif/elegant display paired with an approachable humanist sans**); photography "shot on film, without any retouching… warm and realistic"; logo "balance between playful and professional, with a touch of quirkiness"; "friendly icons remove any stigma." (Source: Stine Nielsen case study.)

**Synthesis → pack personality:** warm, editorial, human, airy. Serif display for warmth + a clean humanist sans for trust. Maximum whitespace. Soft/near-flat surfaces, pill CTAs. Film-grade, unretouched, human-centered imagery. Restrained, slow motion.

### C2. Palette (curated tokens — see sourcing note)

| Role | Token | Hex | Notes |
|---|---|---|---|
| Ink / primary text | `--ew-ink` | `#2B2B2B` | Mine-Shaft-adjacent, softer than pure black (matches Hims `#333333`). |
| Surface / background | `--ew-surface` | `#FBF7F2` | Warm off-white "paper," not stark white — the "warm and realistic" feel. |
| Surface alt (cards) | `--ew-surface-2` | `#FFFFFF` | Clean white card on warm ground for separation. |
| Brand warm accent | `--ew-accent` | `#C9745A` | Soft terracotta/clay (the coral/clay register), CTA + headings highlight. |
| Brand secondary (calm) | `--ew-secondary` | `#7E8C7A` | Muted sage — "soothing yet confident." |
| Soft tint fields | `--ew-tint` | `#F0E6DC` | Sand tint for section bands / pills background. |
| Muted text | `--ew-muted` | `#6E665E` | Captions, secondary label (≥ 4.5:1 on surface). |
| Hairline / border | `--ew-line` | `#E5DBD0` | Warm hairline. |
| Success / error / etc. | inherit project semantics | `#0E9F6E` / `#DC2626` | Keep semantic clarity (Color A6); never recolor semantics to brand. |

Contrast check (must hold, §A2): `--ew-ink` on `--ew-surface` ≈ 12:1 (pass); `--ew-accent` `#C9745A` on `#FBF7F2` ≈ 3.3:1 — **use only for ≥18 pt / bold text or as a button background with white text, not for small body copy** **[AUTO]**. White on `--ew-accent` ≈ 3.6:1 → fine for CTA labels at ≥ Headline weight, verify per render.

Dark + increased-contrast variants are **required** (A6): dark ground `#1F1B17`, ink `#F4EDE4`, accent lifted to `#D98A6F` for ≥ 4.5:1.

### C3. Typography

| Element | Family role | Size (mobile / desktop) | Weight | Leading | Notes |
|---|---|---|---|---|---|
| Display / Hero | **Serif display** (e.g. extracted `headingFont` if serif, else fall back to a warm serif) | 28 / 40 px | 500–600 | 1.1–1.2 | "Elegant" half of Hers' pairing. |
| H2 | Serif or sans | 22 / 28 px | 600 | 1.2 | |
| Body | **Humanist sans** (extracted `bodyFont`, else system humanist) | 16 / 17 px | 400 | 1.55 (≈ 25/26 px) | "Approachable" half; generous leading for calm reading. |
| Caption / label | Humanist sans | 13 / 14 px | 500 | 1.4 | Muted color. |

Rules: ≤ 2 families (A5); never go below 16 px body on mobile (A4); lowercase or sentence-case microcopy (Hims voice); avoid Light/Thin display weights at small sizes (A4).

### C4. Spacing, radius, shadow, density

- **Density: airy.** Spacing base 8 px (project `DESIGN.md`), pack multiplier **1.5×** for section padding → vertical section rhythm 48–64 px on desktop, 32–40 px mobile. This is the "extensive negative space" finding.
- **Radius:** cards `16 px` (lg), inputs `12 px`, **CTAs are pills (`9999`)** — the soft, friendly register. (Contrast with Hims' "bold black boxes" — we adopt the *softer* Hers register as the pack default; a `bold-square-cta` variant flag can switch CTAs to `8 px` boxes for stores that read more "Hims-masculine.")
- **Shadow:** near-flat, warm-tinted: `rest = 0 1px 2px rgba(43,43,43,0.04)`, `raised = 0 8px 28px rgba(43,43,43,0.08)`. No hard offsets.
- **Imagery rule (generation hint):** "Warm, film-grade, unretouched-feeling lifestyle photography of a real person plausibly using the product; soft natural light; human and inclusive; avoid clinical/stocky studio shots; lots of surrounding negative space." Friendly line icons over filled glyphs.

### C5. Component anatomy (Editorial Wellness)

- **Hero:** single focal human image, serif headline (≤ 6 words), 1 short supporting line, **one** pill CTA (accent bg / white label), trust line below. Left-leading on desktop, centered on mobile.
- **Card:** white on warm ground, 16 px radius, near-flat shadow, image-top, serif title, sans body, pill CTA. 24 px internal padding.
- **Form/popup:** warm surface, generous padding (24–32 px), single-column, pill primary + low-emphasis text secondary, inline validation.
- **Trust signals:** doctor/clinical credibility line, review stars + count, "as seen in" row, consent microcopy — placed near the CTA (Muzli social-proof rule, §D).

---

## D. Muzli / Tubik Pattern Library (ecommerce + mobile)

Each pattern is an actionable rule. **[V]** = from the fully-captured "Product Page Design: Handy UX Tips and Practices" (Tubik/Muzli, Mar 2023). **[E]** = established Tubik/Muzli mobile-UI principle (the roundup posts were image-showcases behind a gate; these are the consistent themes those posts teach).

### D1. Product-page / commerce module patterns

| # | Pattern | Rule | Source |
|---|---|---|---|
| D1.1 | **Inverted-pyramid info hierarchy** | Put core info + primary action above the fold; reveal detail progressively as the user scrolls (Amazon model). Generated sections order content most-wanted → most-specific. | [V] |
| D1.2 | **Visual demonstration first** | Images are decoded faster than words and are the first attention magnet. Lead with product imagery; support zoom; for high-consideration items add 360°/video/AR. Optimize image weight for load speed. | [V] |
| D1.3 | **Super-obvious CTA** | The primary CTA must differ from everything else by color contrast and sit in a light/airy layout so it's "instantly noticed" (ASOS example). One unmistakable primary action. | [V] (reinforces A10) |
| D1.4 | **Show, don't (only) tell** | Pair every claim with an image; concise, factual, audience-language description; answer what/looks/does/how in the first lines. No marketing fluff up top. | [V] |
| D1.5 | **Focus on the item** | Don't overload; protect the decision focus. Secondary info goes into tabs/accordions, not the first screen (Uniqlo materials-in-tab example). | [V] |
| D1.6 | **Fewer clicks** | Minimize steps to choose+buy. **Avoid dropdowns for a small number of options** (color/size) — show them inline as swatches/chips (Sportsdirect example). | [V] |
| D1.7 | **Social proof near the decision** | Ratings, review counts, "#1 new release," "X people viewing," "bought together." Place proof close to the CTA; it answers objections and creates informational social influence (Cialdini). | [V] |
| D1.8 | **Consistency (internal + external)** | Same element → same look/behavior everywhere (all CTAs identical). Honor known web patterns (magnifying-glass = search, heart = wishlist, cart icon in header). Don't reinvent recognizable icons. | [V] |
| D1.9 | **Power of known patterns** | Don't shock; be the helpful shop assistant. Support any ambiguous icon with a **text label**. Innovate in small, tested doses. | [V] |
| D1.10 | **Scannability** | Users scan before reading: readable type, enough whitespace, core data in high-visibility zones (Gestalt/eye-tracking). Avoid eye-tensing color combos, intrusive popups, slow loads. | [V] |
| D1.11 | **404 / empty recovery** | Never dead-end. On error/out-of-stock, offer relevant categories/products and a path forward. | [V] |
| D1.12 | **Interactivity & personalization** | Where it fits the product/price, let users customize/try-on/preview; interactivity aids the decision. Don't add it gratuitously to cheap items. | [V] |

### D2. Mobile module patterns

| # | Pattern | Rule | Source |
|---|---|---|---|
| D2.1 | **Mobile adaptation is non-negotiable** | Reconsider layout for mobile (it's a Core Web Vital + the dominant shopping surface), not just shrink desktop. | [V] |
| D2.2 | **Thumb-reach primary actions** | Place the primary CTA in the bottom/thumb zone on mobile popups & sheets; avoid top-only critical actions. | [E] (consistent with A8 "avoid bottom controls on macOS" inverts on touch) |
| D2.3 | **Don't block the whole screen awkwardly** | Mobile popups should not hijack the full viewport with no easy dismiss; leave a clear, large close affordance (≥ 44×44). | [E] + launchtip "mobile-first design that does not block the whole screen awkwardly" |
| D2.4 | **One primary action per screen** | Reduce choices; single clear next step; progressive multi-step over crammed forms. | [E] (reinforces A10 + Accessibility cognitive) |
| D2.5 | **Generous tap spacing** | Honor A1 padding (12/24 pt) so adjacent controls aren't mis-tapped on small screens. | [E] |
| D2.6 | **Legible mobile type** | ≥ 16 px body to prevent iOS zoom-on-focus and for comfort. | [E] + A4 |

> **Cross-cutting Muzli theme:** harmony and restraint. "Eye-tensing color combinations, unreadable or not-combining fonts, aggressive backgrounds, intrusive pop-ups or animations, annoying sounds, or pages loading for ages" each silently lose users. This is the anti-"AI slop" mandate operationalized in §G.

---

## E. Mobile-First Responsive System

### E1. Breakpoints

| Name | Range | Reference device | Layout intent |
|---|---|---|---|
| `mobile` | 320–599 px | iPhone SE 320, iPhone X/11 Pro 375, 16-class 390–402 | 1 column, full-bleed sections, bottom-anchored CTA, stacked everything. **Design here first.** |
| `tablet` | 600–1023 px | iPad mini 744, iPad 768–834 | 1–2 columns, side-by-side hero, modal popups (not full-screen). |
| `desktop` | 1024–1439 px | iPad Pro 1024–1032, laptops | 2–3 columns, inset popups, hover states active, max content width applies. |
| `wide` | ≥ 1440 px | large monitors | content capped, extra margin only. |

Max content width for shells: **1160 px** (project `DESIGN.md`); modules center within it. iPhone QA viewports: **375×812** (primary) and **320×568** (stress) per §A8.

### E2. Fluid type clamps (per token, mobile→desktop)

Use `clamp(min, preferred-vw, max)`. Mins are mobile sizes; maxes are desktop. Body never below 16 px on mobile (A4).

| Token | clamp |
|---|---|
| Display/Hero | `clamp(28px, 4.5vw, 44px)` |
| H1 | `clamp(24px, 3.4vw, 36px)` |
| H2 | `clamp(20px, 2.6vw, 28px)` |
| H3 | `clamp(18px, 2.0vw, 22px)` |
| Body | `clamp(16px, 1.1vw, 18px)` |
| Caption | `clamp(13px, 0.9vw, 14px)` |

(Pack `typeScale` shifts these within bounds — e.g. Bold DTC raises the Display max to `48px`, Minimal Luxe lowers Body weight not size.)

### E3. Touch targets, safe areas, inputs

- All tappables ≥ **44×44 px** on mobile (A1). **[AUTO]**
- Honor safe areas: bottom-anchored CTAs use `padding-bottom: max(16px, env(safe-area-inset-bottom))`; full-bleed media respects `env(safe-area-inset-top)`. **[AUTO]**
- Inputs use `font-size ≥ 16px` to prevent iOS auto-zoom (D2.6). **[AUTO]**
- Hit-spacing: ≥ 12 px between bezeled controls, ≥ 24 px around bezel-less (A1). **[AUTO]**

### E4. What changes across breakpoints

| Aspect | Mobile | Tablet | Desktop |
|---|---|---|---|
| Columns | 1 | 1–2 | 2–3 |
| Popup presentation | Bottom sheet / near-full card, large close, thumb CTA | Centered modal, inset | Inset modal, hover states |
| Hero | Stacked (image then text) | Side-by-side optional | Side-by-side, left-leading |
| Nav/filters | Collapsed (drawer/accordion) | Partial | Inline |
| CTA width | Inset, large; near-full but not edge-to-edge | Auto | Auto/inline |
| Motion | Reduced distance, fades favored | Standard | Standard + hover micro-interactions |
| Hover | **None** (touch) — no hover-only info | Limited | Full |
| Density | Airy / fewer items per view | Medium | Pack default |

> Rule: **no information or action may be hover-only** — mobile has no hover (D2, A8). **[AUTO]**

---

## F. Micro-Interaction Catalog

Durations/easing per §A9. Each is named so the generator can require it by id. **MIN-SET** marks the minimum every generated module must implement.

| # | Name | Trigger | Spec | Reduced-motion fallback |
|---|---|---|---|---|
| F1 | **press** ⭐MIN | pointer/touch down on any control | scale `0.97`, 80–100 ms `ease-out`; release returns | opacity dip only, no scale |
| F2 | **hover-raise** | pointer hover (desktop only) | shadow rest→raised + translateY(-1px), 150 ms | none (no hover on touch) |
| F3 | **focus-ring** ⭐MIN | keyboard/AT focus | 2px accent ring + 2px offset, 120 ms; **never removed** | instant ring, no transition |
| F4 | **entrance** ⭐MIN | module mounts/opens | fade + 8–12px rise (or sheet slide-up on mobile), 220–320 ms `ease-out`; non-blocking | fade only, ≤ 150 ms |
| F5 | **success** ⭐MIN | action completes (subscribe, win, add-to-cart) | checkmark draw or chip pop, 220–320 ms; pair with text + optional haptic | static success text + icon, no animation |
| F6 | **loading** ⭐MIN | async pending | in-button spinner + label swap ("Spin"→"Spinning…"), or skeleton; cancelable | static "Loading…" text |
| F7 | **empty** ⭐MIN | no data / nothing won | illustration + one-line explainer + recovery CTA (Muzli D1.11) | identical, no animation |
| F8 | **error** ⭐MIN | validation/network failure | inline message (not color-only — icon+text, A2), gentle shake ≤ 1 cycle 150 ms | inline icon+text, no shake |
| F9 | **toggle/switch** | toggle change | knob slide 150 ms `ease-in-out` + color cross-fade | instant state swap |
| F10 | **reveal/expand** | accordion/disclosure | height+opacity 220 ms `ease-in-out` | instant show/hide |
| F11 | **celebration** | high-value win (roulette grand prize) | confetti/scale burst ≤ 800 ms, then settle; **Playful pack default, opt-in elsewhere** | static "You won!" banner |
| F12 | **scroll-cue** | content below fold | subtle bounce/arrow, looped ≤ 2× then stop | static arrow |

**Minimum set every module must ship:** F1 press, F3 focus-ring, F4 entrance, F5 success, F6 loading, F7 empty, F8 error (7 states). Error and success must convey via **icon + text**, not color alone (A2). All must have a reduced-motion branch (A9). **[AUTO]**

---

## G. Design QA / "Authentication" Checklist (ship gate)

A generated module's **spec + render** must pass every **[AUTO]** check and have no failed **[REVIEW]** flag to ship. This is the "never a miss" gate. Run on a 375×812 render and a 1280×720 render, light + dark, default + 200% type, default + reduced-motion.

### G1. Auto-checkable (block ship on fail)

| # | Check | Pass condition | Source |
|---|---|---|---|
| 1 | **Contrast — body text** | every text ≤ 17px vs its background ≥ 4.5:1 | A2 |
| 2 | **Contrast — large/bold** | text ≥ 18px or bold ≥ 3:1 | A2 |
| 3 | **Touch targets** | every interactive element ≥ 44×44 px on mobile | A1 |
| 4 | **Hit spacing** | ≥ 8px gap between adjacent targets (≥ 12 bezeled / 24 bezel-less ideal) | A1 |
| 5 | **Body type floor** | no body text < 16px mobile / < 11px any | A4 |
| 6 | **Font weight floor** | body weight ≥ 400; no Thin/Ultralight body | A4 |
| 7 | **Type families** | ≤ 2 families (+ optional mono for numerals) | A5 |
| 8 | **Type-scale adherence** | every size maps to a pack/HIG scale token (no arbitrary sizes) | A3 |
| 9 | **Prominent-button count** | ≤ 2 filled/accent buttons per view; exactly 1 primary | A10 |
| 10 | **Primary ≠ destructive** | no destructive action carries the Primary role | A10 |
| 11 | **Press state** | every custom button defines a press state | A10/F1 |
| 12 | **Focus visible** | every interactive element has a visible, non-removed focus ring | A2/F3 |
| 13 | **Color-not-alone** | success/error/status conveyed by icon or text in addition to color | A2/A6 |
| 14 | **Motion bounds** | all durations within 80–500 ms; entrance non-blocking/cancelable | A9 |
| 15 | **Reduced-motion branch** | `prefers-reduced-motion` path exists (fades, no springs/z-axis) | A9 |
| 16 | **Responsive coverage** | renders without overflow/overlap at 320, 375, 768, 1280 widths | E1 |
| 17 | **200% type** | no clipping/overlap at 200% body scale | A8 |
| 18 | **Safe areas** | bottom-anchored/full-bleed honor `env(safe-area-inset-*)` | A8/E3 |
| 19 | **No hover-only** | no info/action requires hover | E4 |
| 20 | **Input zoom guard** | form inputs `font-size ≥ 16px` | E3/D2.6 |
| 21 | **Min micro-interaction set** | F1,F3,F4,F5,F6,F7,F8 present | F |
| 22 | **Media scrim** | popups over imagery have ≥ 35% dimming scrim | A7 |
| 23 | **Dark + increased-contrast variants** | both exist and pass checks 1–2 | A6 |
| 24 | **Image weight** | hero/product images optimized (lazy, sized, ≤ budget) | D1.2 |

### G2. Review-checkable (human/heuristic; flag, don't hard-block)

| # | Check | Looking for | Source |
|---|---|---|---|
| 25 | **One focal message + one CTA** | clear single hierarchy, super-obvious CTA | D1.3/A8 |
| 26 | **Inverted-pyramid order** | core info + action above fold | D1.1 |
| 27 | **Social proof placed near CTA** | when relevant | D1.7 |
| 28 | **Known patterns / labeled icons** | recognizable icons, text labels on ambiguous ones | D1.8/9 |
| 29 | **Scannability** | whitespace, readable type, no eye-tension | D1.10 |
| 30 | **No "AI slop" tells** | no random gradients, fake/lorem copy, off-brand stock art, inconsistent radii/shadows, centered-everything, rainbow palettes, gratuitous animation | Muzli synthesis |
| 31 | **Pack fidelity** | radius/shadow/density/motion match selected pack; palette = extracted brand | B |
| 32 | **Voice** | concise, factual, audience language; verb-first CTAs | D1.4/A10 |
| 33 | **Empty/404 recovery present** | dead-ends avoided | D1.11 |
| 34 | **Pack-selection confidence** | if low, picker surfaced, not silently personality-heavy | B3 |

> **"Never slop" definition (operational).** A module is slop if it fails any G1 check OR trips ≥ 2 of: arbitrary type sizes, > 2 fonts, hover-only behavior, color-only status, missing focus ring, gratuitous/looping motion, rainbow/over-saturated palette, generic centered hero with vague copy, mismatched radii/shadows across siblings, hero image that isn't the product/brand. Generation should **self-audit against G1 before returning** and regenerate on failure.

---

## H. Gamified Roulette ("Spin-to-Win") Spec

Informed by the §4 app teardown: **Wheelio** (Coupon Slices + **Gravity** per-slot probability; unique discount per visitor; checkout injection; multi-channel capture; exit-intent/scroll triggers; analytics), **OptiMonk** (per-segment title + weighting + chance-to-win + coupon; **fixed codes only**; frequency cap), **Spin-a-Sale/EVM** (exit-intent, page targeting, simple), **Privy** (broader popup+flows), **Tada** (on-brand, FOMO/urgency), and the cross-app merchant checklist from launchtip: email+SMS capture with consent, **automatic discount generation to avoid coupon leakage**, exit-intent/page targeting, mobile-first non-blocking, ESP integrations, analytics + A/B. Our spec must **meet or beat** these — most notably with **validated per-segment probabilities (sum = 100)** and **three code-source modes** (single / uploaded list / auto-unique via Shopify).

### H1. Required features (must-have for "top-tier, not slop")

1. **Per-segment win probability** with merchant-set weights, **validated to sum to exactly 100%** (Wheelio "Gravity"/OptiMonk "chance to win", but we enforce the sum).
2. **Three discount-code sources**: `single` (one shared code), `uploaded_list` (CSV of pre-generated codes, one consumed per win), `auto_unique` (generate a unique single-use Shopify discount per win via Admin API). Wheelio offers unique-per-visitor; OptiMonk only fixed — we offer all three.
3. **Email and/or SMS capture gating** with explicit **consent** (GDPR/marketing opt-in checkbox, audience tags). Spin is gated behind capture.
4. **Frequency caps + cooldown** per visitor (e.g. once per N days), and a global "already played" lockout.
5. **Anti-abuse**: one spin per email + per device fingerprint + per IP window; codes single-use, expiring; uploaded-list depletion stops the campaign; auto-unique codes are per-customer and non-shareable.
6. **Triggers/targeting**: exit-intent, scroll depth %, time-on-page, page/URL rules, device, traffic source, new-vs-returning, geo. (Wheelio/Spin-a-Sale/Privy.)
7. **Scheduling**: start/end datetime, timezone, seasonal windows.
8. **Analytics**: impressions/displays, spins, opt-in rate, win distribution, code redemptions, **revenue attributed**, A/B variants. (Wheelio/launchtip.)
9. **ESP/CRM integration**: Klaviyo, Mailchimp, Omnisend, Shopify Email, SMS providers — pass lead with tags + consent + won-code. (launchtip.)
10. **Checkout injection / auto-apply**: optionally inject the won code into the cart/checkout so it self-applies (Wheelio's differentiator).
11. **Design controls** (theme-matched): colors from extracted `StorePalette`, fonts from `StoreTypography`, segment labels, wheel skin, copy, applied **style pack** (§B) — must pass §G.
12. **Mobile behavior**: bottom-sheet or centered card (not full-screen hijack), large close ≥ 44px, thumb-zone Spin button, reduced-motion fallback for the spin (instant result + announce), no layout-shift, no blocking of the page.

### H2. Settings (merchant-configurable)

| Group | Settings |
|---|---|
| **Segments** | label, reward type (`percent`/`fixed`/`free_shipping`/`bogo`/`free_gift`/`no_win`), reward value, **win probability %**, color, code source binding, max-wins cap per segment |
| **Codes** | mode (`single`/`uploaded_list`/`auto_unique`), shared code, CSV upload, auto-unique template (prefix, % off, min spend, usage limit=1, expiry days, combine rules) |
| **Capture/gating** | require email / require SMS / both, consent checkbox text, marketing-list + tags, double-opt-in toggle |
| **Frequency/anti-abuse** | spins per visitor, cooldown days, dedupe by email/device/IP, block VPN/bot toggle, total-plays cap |
| **Triggers** | exit-intent, scroll %, delay s, page/URL include/exclude, device, audience (new/returning), geo, traffic source |
| **Schedule** | enabled window start/end, timezone |
| **Design** | style pack, palette source (extracted/override), fonts, wheel skin, copy fields, sound on/off, confetti on/off |
| **Behavior** | auto-apply code to cart, redirect after win, close behavior, show odds disclosure (compliance) |
| **Analytics/AB** | variant definitions, traffic split, primary metric |

### H3. UI settings (what the merchant editor exposes)

- **Live preview** (desktop + mobile) updating in real time, rendered through the selected pack and extracted palette.
- **Probability editor** with a running **sum indicator** that turns red and **disables Save** unless segments total 100% (auto-normalize helper button). **[AUTO]**
- **Segment table**: drag-reorder, color swatch, reward, probability slider/number, code-source dropdown, max-wins.
- **Code manager**: mode switch; for `uploaded_list` a CSV uploader + remaining-count meter + low-stock warning; for `auto_unique` the discount template form (validated against Shopify discount rules).
- **Consent/compliance**: editable consent text, odds-disclosure toggle, "no win" segment allowed (honesty).
- **Targeting/schedule** as visual rule builder.
- **Accessibility preview**: contrast check on chosen segment colors vs labels (§G), reduced-motion preview of the spin.

### H4. Data model (fields)

```ts
// Campaign
RouletteCampaign {
  id; shopId; name; status: 'draft'|'scheduled'|'live'|'paused'|'ended';
  stylePackId; paletteSource: 'extracted'|'override'; designJson;
  capture: { email:bool; sms:bool; consentText; doubleOptIn:bool; listId; tags:string[] };
  frequency: { spinsPerVisitor:int; cooldownDays:int; totalPlaysCap:int|null;
               dedupe: { byEmail:bool; byDevice:bool; byIp:bool } };
  triggers: { exitIntent:bool; scrollPct:int|null; delaySec:int|null;
              urlInclude:string[]; urlExclude:string[]; devices:string[];
              audience:'all'|'new'|'returning'; geo:string[]; trafficSource:string[] };
  schedule: { startsAt; endsAt; timezone };
  behavior: { autoApplyCode:bool; redirectUrl; showOdds:bool; sound:bool; confetti:bool };
  abTest: { enabled:bool; variants: VariantRef[]; split:number[]; metric:string }|null;
  createdAt; updatedAt;
}

// Segment (probabilities across a campaign MUST sum to 100)
RouletteSegment {
  id; campaignId; order:int; label;
  rewardType: 'percent'|'fixed'|'free_shipping'|'bogo'|'free_gift'|'no_win';
  rewardValue:number|null; color;
  winProbability:number;        // 0–100, two decimals; Σ per campaign = 100 (validated)
  codeSource: 'single'|'uploaded_list'|'auto_unique';
  sharedCode:string|null;       // when 'single'
  uploadedBatchId:string|null;  // when 'uploaded_list'
  autoTemplate: { prefix; percentOff?; amountOff?; minSpend?; usageLimit:1; expiryDays; combine } | null;
  maxWinsCap:int|null;          // stop awarding this segment after N
  winsAwarded:int;
}

CodeBatch { id; campaignId; codes:string[]; consumedCount:int; remaining:int; }   // uploaded_list

// Per play (audit + anti-abuse + attribution)
SpinResult {
  id; campaignId; segmentId; shopId;
  email?; phone?; consent:bool;
  deviceFingerprint; ipHash; geo;
  wonRewardType; wonRewardValue; issuedCode?; codeSource;
  shopifyDiscountId?;           // when auto_unique
  appliedToCheckout:bool; redeemed:bool; orderId?; revenueCents?;
  createdAt;
}

// Anti-abuse ledger
PlayLock { id; campaignId; key:'email'|'device'|'ip'; value; lockedUntil; }
```

### H5. Backend services

| Service | Responsibility |
|---|---|
| `RouletteCampaignService` | CRUD; **validates Σ winProbability = 100** on save (reject otherwise); schedule transitions draft→live→ended. |
| `SpinService` | On spin request: check gating (capture+consent), check `PlayLock`/frequency, run **weighted random draw** over segments by `winProbability` (cumulative-weight selection), respect per-segment `maxWinsCap`, return segment + issue code. Idempotent per visitor token. |
| `CodeIssuanceService` | `single` → return shared code; `uploaded_list` → pop next from `CodeBatch` (atomic, stop on empty); `auto_unique` → create single-use Shopify discount via Admin GraphQL (`discountCodeBasicCreate`-class), `usageLimit:1`, expiry, return code + `shopifyDiscountId`. |
| `ConsentCaptureService` | Persist lead with consent + tags; push to ESP (Klaviyo/Mailchimp/Omnisend/Shopify Email/SMS) with won-code + tags; optional double-opt-in. |
| `AntiAbuseService` | Write/check `PlayLock` by email/device/IP; cooldown windows; bot/VPN heuristics; dedupe. |
| `CheckoutInjectionService` | Optionally attach won code to cart so it auto-applies at checkout. |
| `RouletteAnalyticsService` | Record impressions/spins/opt-ins/wins/redemptions; attribute revenue via `orderId`; expose A/B results. |
| `TriggerEngine` (client+server) | Evaluate exit-intent/scroll/time/URL/device/audience/geo/source + schedule; decide show/suppress; respects frequency caps. |

### H6. Probability validation rule (the headline requirement)

```ts
function validateSegments(segments: RouletteSegment[]): { ok: boolean; sum: number; errors: string[] } {
  const errors: string[] = [];
  const sum = Math.round(segments.reduce((a, s) => a + s.winProbability, 0) * 100) / 100;
  if (segments.length < 2) errors.push('At least 2 segments required.');
  if (segments.some(s => s.winProbability < 0)) errors.push('Probabilities must be ≥ 0.');
  if (sum !== 100) errors.push(`Win probabilities must sum to 100 (currently ${sum}).`);
  // code-source integrity
  for (const s of segments) {
    if (s.rewardType !== 'no_win') {
      if (s.codeSource === 'single' && !s.sharedCode) errors.push(`Segment "${s.label}" needs a shared code.`);
      if (s.codeSource === 'uploaded_list' && !s.uploadedBatchId) errors.push(`Segment "${s.label}" needs an uploaded code batch.`);
      if (s.codeSource === 'auto_unique' && !s.autoTemplate) errors.push(`Segment "${s.label}" needs an auto-unique template.`);
    }
  }
  return { ok: errors.length === 0, sum, errors };
}
```

Weighted draw (server, cannot be tampered client-side):

```ts
function drawSegment(segments: RouletteSegment[], rng = Math.random): RouletteSegment {
  const eligible = segments.filter(s => s.maxWinsCap == null || s.winsAwarded < s.maxWinsCap);
  const total = eligible.reduce((a, s) => a + s.winProbability, 0);
  let r = rng() * total;
  for (const s of eligible) { if ((r -= s.winProbability) <= 0) return s; }
  return eligible[eligible.length - 1];
}
```

---

## Appendix — Open follow-ups

1. **Re-sample hims/forhers on an unblocked machine** (pass the Cloudflare challenge via the user's real browser session / `/browse` headed handoff once a headed Chromium is installed) to replace §C's curated hexes with pixel-true brand values and confirm exact font families.
2. **Capture the 3 gated Muzli roundup posts** when accessible to add any patterns beyond §D (they are mostly visual showcases; low incremental rule yield expected).
3. **Wire `computeAestheticSignals()` + `selectPack()`** (§B0) onto the existing `StorePalette`/`StoreTypography` so pack selection is automatic; default to Apple HIG Clean on `source==='none'`.
4. **Implement the §G G1 self-audit** in the generation pipeline so modules regenerate on any auto-check failure before returning to the merchant.
