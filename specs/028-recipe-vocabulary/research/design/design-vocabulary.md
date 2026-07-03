# Design Vocabulary — Consolidated

**One unified visual design vocabulary for AI-generated Shopify storefront modules, tuned for YC-startup-tier visual quality.**

This is the direct input to **phase #2 (visual/styling architecture)**. It consolidates the eight per-batch extractions (`batch-1.md`…`batch-8.md`, ~38 component/effects libraries) into: (1) concrete **design tokens**, (2) **component archetypes**, (3) a **motion & interaction vocabulary** (premium patterns + slop to avoid), (4) **6 named style packs**, and (5) how it all maps onto our existing generated-module system — merchant choices, a single scoped Custom-CSS escape hatch, and full builder-level control underneath.

**Sources synthesized:** shadcn/ui · Radix (Colors/Themes) · Base UI · React Aria · Untitled UI · MUI · Mantine · Ant Design · Reshaped · AlignUI · HeroUI · daisyUI · HyperUI · PrimeReact · Tailwind Plus · Tailwind Flex · Kibo UI · Tailark · Magic UI · Aceternity · Cult UI · Inspira · Eldora · Spectrum · Syntax · Zen · Lunar · CuiCui · Fly On UI · React Bits · UIverse · Motion (motion.dev) · animata · Animate.css · Hover.dev · Cursify · UI Layouts · UI Layouts Pro.

**The one-line thesis:** *Premium is systematic constraint, not more effects.* Step-semantic color with guaranteed contrast, a 4/8px spacing grid, a size-aware type scale, one radius/scaling personality knob, role-mapped soft/layered elevation, keyboard-only focus rings with full interaction-state coverage, and a strict motion cost-ladder (default to cheap CSS micro-motion; gate WebGL behind a perf budget). A generator that emits **against token scales and state models** — instead of picking colors, sizes, and shadows freehand — reads as intentional by construction.

---

## 1. Design Tokens

Tokens are the contract the generator emits against. They compile to CSS custom properties (our existing `--sa-*` convention; see §5). Values below are recommended defaults; every pack in §4 remaps a subset.

### 1.1 Color system

**Architecture — 3-tier (PrimeReact / Ant seed model):** `primitive → semantic → component`.
- **Primitive:** a context-free ramp, *seed-derived* from one merchant brand color (Ant `Seed→Map→Alias`, Reshaped single-value theme gen). Never ship fixed swatches — derive the whole ramp from the store's extracted accent so the module inherits the brand.
- **Semantic:** roles mapped once (below). This is what the generator references — never a raw hex, never "a lighter blue."
- **Component:** rare per-component overrides only.

**Generate ramps in OKLCH** (shadcn default, Inspira on Tailwind v4). Perceptually uniform lightness → tints/shades and gradient stops stay even instead of muddying in the mid-tones the way HSL does.

**The 12-step semantic scale (Radix — the crown jewel).** Each step has a fixed job; adopt wholesale so contrast is structural and holds across light/dark:

| Steps | Job |
|---|---|
| 1–2 | App / subtle backgrounds |
| 3–5 | Component bg — 3 normal · 4 hover · 5 pressed/selected |
| 6–8 | Borders — 6 subtle · 7 default · 8 strong/hover |
| 9–10 | Solid fills — 9 base ("brand" solid) · 10 hover |
| 11 | Low-contrast / secondary text |
| 12 | High-contrast / primary text |

**Semantic role set (Fly On UI 12-role model — the portable contract).** Every role has a paired **`-content` foreground** token so text is always legible on its surface (this single rule fixes the most common AI contrast failure):
`primary · secondary · accent · neutral · base-100 / base-200 / base-300 · info · success · warning · error`, each `+ -content`.

- **Surface-nesting palette** for cards-within-cards without muddy borders: `content-1…content-4` (HeroUI) or `base-100/200/300` (daisyUI).
- **Alpha tokens** for tints/overlays/scrims instead of arbitrary rgba: `-alpha-10 / -16 / -24` (AlignUI). Ship **alpha variants of the neutral + accent ramps** for text/overlays on hero imagery (Radix alpha scales — essential for text-over-photo on storefronts).
- **Commerce status triad** (MUI convention): each status role gets a `.50` tint surface + `.500` solid + `.700` text → drives in-stock / low-stock / out-of-stock / on-sale treatments.
- **Restraint rule (Tailwind Plus / Hover.dev):** one confident accent, everything else neutral. 1 accent, not 5.
- **Warm, desaturated neutrals** as default gray (Untitled UI) so any store accent pairs cleanly; add an **ultra-light `-25` tint step** below `50` for faint section backgrounds and hover fills — a cheap, high-impact layering signal.
- **Dark mode is a peer, generated automatically** from the same token names (Mantine, Reshaped, daisyUI) — only values remap; component CSS never changes. Ship **per-theme surface recipes**, not just inverted colors (Cult — see §1.5).
- **Contrast is a guarantee, not a hope** — target APCA/WCAG per step pairing (Radix); step 11/12 text always passes on steps 1–2, step 9 solid always readable with white.

**Recommended concrete neutral ramp (OKLCH-generated, light):** bg `#FFFFFF` → `-25` `#FCFCFD` → `weak-50` `#F6F8FB` → `soft-200` `#E2E8F0` → `sub-300` `#DCE3EC` border → `#94A3B8` muted → `#64748B` secondary text → `#111827` primary text. Accent seed-derived per store.

### 1.2 Typography scale

Two anchor scales — offer as presets, both obey the universal rules.

**Editorial / marketing (MUI — big display, light weight; reads luxury/fashion):**
h1 96/1.167/−1.5 · h2 60/1.2/−0.5 · h3 48/1.167/0 · h4 34/1.235/0.25 · h5 24/1.334 · h6 20/1.6/0.15 · body1 16/1.5 · body2 14/1.43 · caption 12/1.66. (`px / line-height / letter-spacing`.) h1–h2 weight 300.

**Modern-SaaS / premium-DTC (AlignUI / Radix — tighter, medium weight; reads crisp):**
H1 56 · H2 48 · H3 40 · H4 32 · H5 24 · H6 20, all weight 500, negative tracking; body 16/14 weight 400; eyebrows/labels 11–16 weight 500 with **positive** tracking + uppercase.

**Universal rules (batch consensus):**
- Base body **14–16px**; line-height **~1.5 body / ~1.2 headings**; pair every size with a fixed line-height token — never leave leading to chance.
- **Letter-spacing tightens as size grows** (Radix): ~+0.0025em at 12px → −0.025em at 60px. Positive tracking on small caps/eyebrows. This alone separates typeset from amateur.
- Weights: **300 / 400 / 500 / 700**. 400 body · 500 labels/emphasis · 600–700 headings.
- **Headlines are a motion surface**, body is not (animata, React Bits): reserve kinetic/gradient/shiny/per-character-reveal treatments for hero + section headings only.

### 1.3 Spacing rhythm

- **4px base grid**, **8px primary increment** — universal across every library.
- **9-step scale:** `2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` (Radix 9-step; +4 in the small range, +8/+16 for layout gaps). Card interiors `p-6` (24px), inter-element `gap-4` (16px), section rhythm `16–64px` between marketing blocks (Fly On UI / animata).
- Named intent steps (Mantine): `xs 8 · sm 12 · md 16 · lg 24 · xl 32` for section-padding / stack-gap presets.
- **Premium = more whitespace than feels necessary** (Tailwind Plus, UI Layouts). Density is a dial: airy for marketing/merchandising, compact for data/utility.

### 1.4 Corner radius

- **One base `--radius` knob** (shadcn/Mantine `defaultRadius`) drives a derived ladder: `sm = base−4 · md = base−2 · lg = base · xl = base+4`. Plus a global **`scaling` %** (Radix) to shift a whole module tight↔soft in one move.
- **Two-track hierarchy** — surfaces and controls carry *different* radii (HeroUI `field-radius = 1.5× surface`; daisyUI `rounded-box` vs `rounded-btn`). Inputs/CTAs rounder than the card that holds them.
- **Role mapping** (Reshaped): `radius-small` badge/chip · `radius-medium` button/input · `radius-large` card/modal. Large (~32px) reserved for glass / feature panels (UI Layouts).
- **Don't over-round** (Cult): the most tactile-premium work goes *tighter* (`rounded-sm`) and earns richness from material + layered shadow. Consistency of radius across a surface is itself the premium tell.
- **Recommended base:** `--radius: 10px` (sm 6 · md 8 · lg 12 · xl 16 · pill 9999). Enterprise/dense preset: base 6.

### 1.5 Shadow / elevation

**Function-named role tokens** (Reshaped), not an arbitrary blur menu, each with an `-intense` variant for colored backgrounds:
`shadow-outline` (resting card = 1px border + faint shadow) · `shadow-raised` (hover/active lift) · `shadow-overlay` (menu/modal float).

Map to a **numbered ramp per surface role** (MUI): card resting 1–2 · hover 4 · dropdown 8 · popover/modal 16 · top modal 24. Deterministic, never eyeballed.

**Build each as a layered multi-shadow** — a tight 1–3px contact shadow + a wide soft ambient shadow (Mantine). Layering is what separates premium from flat:
```
--shadow-raised: 0 1px 3px rgba(0,0,0,.05), 0 20px 25px -5px rgba(0,0,0,.05), 0 10px 10px -5px rgba(0,0,0,.04);
```

**Four coherent elevation idioms — pick per surface / per pack, don't mix randomly:**
1. **Soft depth (Tailwind Plus / Untitled):** soft offset `shadow-sm → 2xl`, `0 1px 2px rgba(0,0,0,.05)` → `0 4px 16px rgba(24,24,27,.08)`. The safe premium default for menus/modals/toasts.
2. **Premium float / glow (HeroUI):** **zero offset, wide blur, 2–4% opacity** — `0 0 5px/15px/30px 0 rgb(0 0 0 / .02–.04)`. Best for hero/product cards; never muddy.
3. **Border-carried (Kibo / Eldora / shadcn):** depth from a 1px border + color shift, minimal shadow. The clean/trustworthy utility register.
4. **Emboss / inset (Cult — the tell that reads highest-craft):** tiny drop shadow + inset highlight — `shadow-[0px_1px_1px_0px_rgba(0,0,0,0.05)]` + inset white (light) / `rgba(255,255,255,0.03)` inset (dark). Surfaces feel embossed, not floated.

**Dark-surface recipe** (CuiCui / Cult): inner-shadow + hairline 1px border + subtle gradient fill — depth by blur, not darkness. **Neobrutalist opt-in** (HyperUI): solid offset shadow, 0 blur, hard border — for bold/streetwear brands only.

### 1.6 Motion timing + easing

**Duration presets:**
- *Snappy / enterprise (Ant):* fast **0.1s** · mid **0.2s** · slow **0.3s**.
- *Material / smooth (MUI):* shortest 150 · short 250 · standard 300 · complex 375ms; **enter 225 / exit 195ms**.
- **Consensus default: 200ms** (daisyUI, PrimeReact) for micro-interactions; **0.3s tween** for reveals (Motion). Retune Animate.css's slow 1s defaults toward this — snappier reads premium.

**Easing library:**
- Default/soft: `cubic-bezier(0.4, 0, 0.2, 1)` (MUI easeInOut).
- Enter (decelerate): `cubic-bezier(0, 0, 0.2, 1)`.
- Exit (accelerate): `cubic-bezier(0.4, 0, 1, 1)`.
- Mechanical/precise: `cubic-bezier(0.645, 0.045, 0.355, 1)` (Ant).
- Settled/physical: `circIn` (Cult, for reveal settle).

**Spring feel (Motion — "physical, not mechanical"):** stiffness **100**, damping **10**, mass **1**, **bounce ~0.25**. For snappy overshoot-and-settle on interactive/press/drag/follower elements, Cursify uses damping **25** / stiffness **700**. **Split rule:** physical props (`x/y/scale/rotate`) → spring; stylistic props (`opacity/color`) → tween.

**Principles:**
- **Asymmetric enter/exit** and **easeOut-on-enter** make transitions feel physical (MUI). Enter slightly slower than exit (or vice-versa), never symmetric.
- **Motion must be justified · performant · concise** (Ant). Motion confirms state; it doesn't perform.
- **Stagger** list/grid entrances by a fixed per-child delay (~40–80ms).
- **Ambient loops are slow + linear + infinite:** Aurora `60s linear`, Marquee `~20s`, Border Beam `6s`. Long+linear reads "alive," not "busy." Tune via CSS custom props (`[--duration]`).
- **`focus-visible` rings only** (keyboard mode) — never sticky focus/hover on touch (React Aria). Provide a global `disableAnimation` / `prefers-reduced-motion` escape hatch (always).

**Recommended motion tokens:**
```
--motion-fast: 150ms; --motion-base: 200ms; --motion-slow: 300ms; --motion-ambient: 60s;
--ease-standard: cubic-bezier(.4,0,.2,1);
--ease-enter: cubic-bezier(0,0,.2,1);
--ease-exit: cubic-bezier(.4,0,1,1);
--spring: 100 stiffness / 10 damping / 0.25 bounce;
```

---

## 2. Component Archetypes

The reusable building blocks. Each renders on a **headless, accessible behavior layer** (Base UI / React Aria discipline) and then applies the token skin — so accessibility and correctness survive any theme (§1). Every interactive element models the **full state set**: idle · hover · pressed · focus-visible · selected · disabled · entering · exiting (React Aria data-attributes). A CTA that defines all of these reads "designed"; one with only idle+hover reads templated.

### Atoms
- **Button** — mode matrix (AlignUI): `filled` (primary CTA) · `stroke` (secondary) · `lighter` (tertiary tint) · `ghost` (nav/inline) · `destructive`. Full state coverage; press-scale or translateY+shadow-shrink on tap.
- **Input / TextField** — floating-label variant (MUI) for email/search/newsletter; inline validation; explicit **focus-ring token** (PrimeReact — accessibility as a primitive).
- **Badge / Chip** — status-driven (in-stock / sale / new / bestseller), `radius-small`; optional rotating-conic-halo for "featured/limited."
- **Avatar** — dense variant set; **Avatar Stack** for social proof.
- **Quantity stepper** — tactile (neumorphic inset-on-press or spring), a canonical commerce small-part.

### Surfaces
- **Card (role-mapped)** — declares an elevation role → gets ramp shadow + radius automatically. Surface-nesting (`content-1…4`) for cards-within-cards.
- **Product card** — image-first, hover image-zoom, tight caption (name + price on one baseline), premium-float shadow. The DNA to steal (HyperUI + HeroUI).
- **Collection / category card**, **collection filter bar**, **announcement / banner bar** — canonical storefront parts (HyperUI).
- **Material surface (premium tier)** — fluted/distorted glass, brushed metal, neumorphic, texture/paper, dithered/duotone imagery (Cult); frosted **Liquid Glass** panel (`backdrop-blur` tiers + partial transparency + ~32px radius + inner-shadow + outer-glow + hairline border) for sale badges / sticky add-to-cart / filter drawer.

### Overlays (coordinated enter/exit + focus management)
- **Dialog / Drawer**, **Popover**, **HoverCard**, **Menu**, **Combobox / Autocomplete**, **Command menu (⌘K)** — `shadow-overlay`, fade + subtle scale on enter (never slide), focus containment + restoration on close, scroll-lock.
- **Morph / expandable surface** — Dynamic-Island / Family-Drawer pattern: a compact control expands in place. Ideal for **mini-cart / quick-view / add-to-cart confirmation** (Cult).

### Section blocks (the storefront module catalog)
The canonical generatable set (Tailwind Plus / Mantine / Tailark / UI Layouts Pro taxonomies), each with **3–5 layout variants driven by the same token set** so stores never look templated:
- **Hero** — split (copy/visual) · centered · photo-hero-with-overlay · ambient-gradient-background.
- **Feature bento grid** — mixed-size tiles, coordinated group-hover.
- **Pricing / plan compare** — with a **"recommended tier"** emphasis (accent border + lift + badge + slight scale) → directly reusable for any "featured" storefront item.
- **Testimonials** — wall / marquee / single-quote spotlight ("wall of love").
- **Logo / trust marquee** — scroll-velocity-driven.
- **FAQ accordion**, **stats row** (animated counters), **CTA band**, **newsletter capture**, **rich multi-column footer** (a first-class designed surface).
- **Stacking-card / sticky-scroll narrative** — story-driven PDP / lookbook sequence.

### Commerce chrome (table stakes)
Glass navbar, mega-menu, expanding search, footer newsletter, cart / mini-cart, checkout form, product overview, category filter, order history, spotlight **Tour** (first-visit onboarding).

### Data-rich / social-proof widgets
Rating stars · Avatar Stack · **Number Ticker** ("12,000+ sold") · **Animated List** ("just purchased" feed) · Stories/Reel mobile browsing · QR / credit-card trust marks · Contribution graph · Ticker.

---

## 3. Motion & Interaction Vocabulary

Two coexisting registers, governed by a **cost ladder** — default to cheap CSS; reserve expensive gestures for one hero moment. This is the discipline that keeps a conversion-sensitive storefront fast.

### The cost ladder (cheap → expensive; default to cheap)
1. **Micro-feedback (always-on, CSS-only):** hover role-shift, focus-visible ring, press-scale-down / translateY+shadow-shrink, animated toggle/slider/stepper. `~150–200ms`, ease-out.
2. **CSS/GSAP hover flourishes:** tilt/rotate-on-hover cards, shiny/gradient text sweep, click-spark, magnetic CTA, gradient-border→fill on hover. Cheap, high perceived value.
3. **Cursor-reactive surface:** radial pointer-tracked **spotlight** / glare / direction-aware tilt on cards & heroes. Speed-reactive (calm idle → energetic on fast input).
4. **Scroll-progress reveal:** directional reveal + fade, viewport `amount ≈ 0.5`, `once: true`, per-item stagger; mapped to a **normalized 0→1 scroll progress** (not a one-shot "pop"); **scroll-velocity-driven** marquees (`useScroll`→`useVelocity`) beat fixed-speed loops.
5. **WebGL / canvas backgrounds:** Aurora / Silk / Iridescence / mesh-gradient / dot-grid / particles as a hero backdrop. **Perf-gated, opt-in, mobile-fallback to a static gradient.**

### The premium patterns (steal these)
- **One accent, one hero-motion moment per view** — never many competing animations.
- **Spring feel on interaction** (overshoot-and-settle), **snappy 0.3s tweens** elsewhere.
- **Blur-in + scale-settle reveal** (Cult): content enters `blur(4px)→0`, `scale:1.6→1`, `circIn`, staggered — the default card/hero entrance.
- **Kinetic headline** — per-character rise / mask-reveal-up / shimmer sweep / gradient text on scroll-in (headlines only).
- **Tactile depth from layered/inset shadow**, not big drop shadows.
- **Celebratory micro-interaction at conversion beats only:** confetti / emoji burst / tada on add-to-cart & order-complete; image fade-in on media load. Motion as reward, reserved for the beats that matter.
- **Signature-moment CTA** — text-scramble ("Encrypt"), wet-paint drip, or gradient-border-fill; one per module.
- **Ambient accents (low-cost):** Border Beam / Shine Border halo on a featured product, Animated Shiny Text on a "new" badge, Number Ticker on stat counters.
- **Device-aware:** no hover on touch, press-cancel (drag-off), `focus-visible` only. Most commerce traffic is mobile.

### The slop patterns (avoid)
- **Effect soup** — many animations competing; particle effects on every element (reads as noise, not premium — Cursify's own warning).
- **One big soft drop shadow** as the only depth cue (the cheap tell). Layer it or use a border/inset instead.
- **Slow generic entrances** — Animate.css 1s defaults; retune to 150–600ms.
- **Symmetric enter/exit** and **linear easing** on UI transitions (mechanical, not physical).
- **Sticky focus rings on mouse/touch**; **persistent hover on touch**.
- **Flat two-color linear gradients** — prefer low-saturation multi-stop (metal/aurora/dither).
- **Unbudgeted WebGL on mobile** — kills conversion; always perf-gate + static fallback.
- **Rainbow of accents** — one saturated accent over neutral, not five.
- **Novelty fonts carrying hierarchy** — hierarchy comes from weight/size/tracking, not new typefaces.
- **Motion that ignores `prefers-reduced-motion`.**

---

## 4. Style Packs

Six named, distinct aesthetic personalities. A **pack is a token grammar** (type pairing, radius, shadow idiom, density, motion personality, accent strategy, imagery rule) applied **on top of** the merchant's extracted brand colors/fonts — packs supply grammar, the live store supplies content. Same module markup, swappable pack = a different mood, no restructuring. These align 1:1 with the six packs already in `style-packs.server.ts` (§5) so this document is directly wireable.

| # | Pack | Personality | Radius | Shadow idiom | Density | Motion | Reference libraries that exemplify it |
|---|---|---|---|---|---|---|---|
| 1 | **Apple HIG Clean** | System-like, neutral, content-first, generous negative space; hierarchy by weight not new fonts | sm 8 · md 12 · lg 16 · pill | Soft depth (1.5.1); one geometric sans | Comfortable | Restrained, functional 150–200ms; no ornament | shadcn/ui · Radix Themes · Base UI · Tailwind Plus · Untitled UI |
| 2 | **Editorial Wellness** | Calm, premium-minimal, editorial; big light-weight display, abundant whitespace, imagery-led | md 8 · lg 16 · large-panel 24–32 | Border-carried + soft; muted | Airy | Slow scroll reveals, per-word headline reveal, ambient | MUI (editorial type) · Tailark (Quartz/Mist) · UI Layouts · Eldora |
| 3 | **Bold DTC** | High-energy, saturated, statement headings, one vibrant accent on neutral/dark ground | md 8 · lg 12 · pill CTAs | Premium float / glow (1.5.2) + gradient accents | Comfortable | Signature-CTA (scramble/drip), border-beam, confetti on cart | Hover.dev · Aceternity · Magic UI · Spectrum · UIverse (gradient/neon) |
| 4 | **Minimal Luxe** | Restrained luxury; tight radius, embossed material, duotone/dithered imagery, near-mono palette | sm 4 · md 6 (tight) | Emboss/inset + material (1.5.4); fluted glass, brushed metal | Airy | Blur-in + scale-settle, `circIn`; one spotlight moment | Cult UI · Reshaped · Radix (metallics) · UI Layouts (Liquid Glass) |
| 5 | **Playful Commerce** | Friendly, rounded, tactile, celebratory; soft pastel + bright accent | md 16 · lg 24 · pill | Neumorphic soft-UI (dual shadow) / layered soft | Comfortable | Press-scale, emoji confetti, spring bounce, self-advancing carousels | HeroUI · daisyUI (themes) · Syntax · animata · Mantine |
| 6 | **Tech Utility** | Crisp, dense, high-trust, data-forward; hairline borders, mono accents, dark-first | sm 4 · md 6 | Border-carried + dark inner-shadow (1.5.3/CuiCui) | Compact | Snappy 100–200ms (Ant), inner-shadow depth, ticker/counters | Ant Design · AlignUI · Kibo · Fly On UI · Linear-grade (Lunar) |

**Pack mechanics (batch-proven):**
- Each pack ships **light + dark with per-theme surface recipes** (Cult discipline), not just inverted colors.
- Named palette-variant sub-moods within a pack (Tailark **Quartz / Dusk / Mist / Veil**) let one section render N cohesive moods.
- A pack must still satisfy the **accessibility + contrast floor** (§1.1) — the grammar changes; the guarantees don't.

---

## 5. Mapping onto the Generated-Module Design System

This maps the vocabulary onto the **existing** codebase so phase #2 extends what's real rather than rebuilding it. Three layers of control, narrowest merchant surface at the top:

```
┌─ Curated merchant choices ───────────────────────────────┐
│  Style pack picker + palette/mood sub-variant             │  ← §4, one dropdown
├─ Scoped Custom CSS escape hatch ─────────────────────────┤
│  single sanitized, root-scoped field; storefront only     │  ← §5.2
├─ Full builder-level control (StyleBuilder) ──────────────┤
│  StorefrontStyle → --sa-* vars, every token editable      │  ← §5.3
└─ Token substrate (packs × extracted brand × semantic) ───┘  ← §1
```

### 5.1 Curated merchant choices (the top surface)
- **Style pack** is already the abstraction: `STYLE_PACKS` in `apps/web/app/services/ai/style-packs.server.ts` defines the same six packs in §4 as a **token grammar layered over the live `StorePalette`/`StoreTypography`** extracted from the merchant's theme (`theme-analyzer.service`). `selectPack()` auto-picks from `AestheticSignals` and surfaces a picker when confidence is low.
- **Phase-#2 extension:** enrich each `StylePack` with the tokens formalized here — the OKLCH seed-derived 12-step ramp + `-content` pairing + `-25`/alpha steps (§1.1), the two-track radius + `scaling` knob (§1.4), the four elevation idioms (§1.5), and the motion tokens (§1.6). Add the Tailark sub-mood variant as a second merchant dropdown. Keep `design-reference.server.ts` (`deriveDesignReferencePack`) as the brand-extraction feed into the pack.
- Merchant sees: **pick a pack → pick a mood → done.** No raw values. This is the "curated choice" layer.

### 5.2 Single scoped Custom CSS escape hatch (storefront surfaces only)
- Already exists: `StorefrontStyle.customCss` → `sanitizeCustomCss()` + `compileCustomCss()` in `apps/web/app/services/recipes/compiler/style-compiler.ts`. It **strips `@import`** (and dangerous at-rules), **scopes every rule to the module root selector**, and emits under a `/* custom css */` comment — so a merchant can nudge one module's look without touching structure or leaking styles globally.
- **Sandbox boundary is structural, not a warning:** `customCss` is only offered on storefront-styleable types — `STOREFRONT_UI_WITH_STYLE = ['theme.section', 'proxy.widget']` (see `StyleBuilder.tsx`). **Checkout / POS / customer-account extensions never receive a Custom-CSS field** because they aren't in that allowlist and Shopify sandboxes them (enforced in `pre-publish-validator.server.ts`, which gates checkout targets, Plus-only prefixes, and bundle size). This is the correct place to keep the boundary — one scoped escape hatch, storefront only, never raw codegen (per spec non-goals).
- **Phase-#2 hardening to specify:** extend the sanitizer denylist (e.g. `position:fixed`, `expression()`, `url()` to off-origin, `behavior:`), keep the root-scope wrapper, and document that the hatch is a *nudge* over the token system — the tokens do the heavy lifting; CSS is the last 5%.

### 5.3 Full builder-level control underneath
- `StyleBuilder.tsx` already exposes the whole `StorefrontStyle` schema — layout / spacing / typography / colors / shape (radius, border, shadow) / responsive / accessibility (`focusVisible`, `reducedMotion`) — and the compiler maps every field to a `--sa-*` custom property (`PADDING_MAP`, `RADIUS_MAP`, `SHADOW_MAP`, etc.).
- **Phase-#2 extension:** widen these enums to match the tokens here — the 9-step spacing scale (§1.3), the two-track radius ladder + role mapping (§1.4), the four named shadow idioms incl. layered/inset (§1.5), and the motion tokens + easing/spring set (§1.6). The `--sa-*` var convention is exactly the compile target §1 assumes, so this is additive, not a rewrite.
- **Generator contract:** the AI emits **against the semantic token names**, never raw hex/px — it references `primary`, `content-2`, `shadow-raised`, `radius-md`, `--motion-base`, and the full interaction-state set. Determinism + contrast guarantees come for free (the anti-slop architecture the spec already commits to).

### 5.4 Net for phase #2
Everything here slots onto real seams: `style-packs.server.ts` (grammar), `theme-analyzer` (brand content), `style-compiler.ts` (`--sa-*` emit + scoped Custom CSS), `StyleBuilder.tsx` (builder control), `pre-publish-validator.server.ts` (checkout/POS sandbox). Phase #2's job is to **formalize the token scales in §1, wire the six packs in §4 to them, and widen the builder enums** — not to invent new infrastructure. The three-layer control model (curated → scoped CSS → full builder) already exists; this vocabulary gives it YC-tier values to carry.
