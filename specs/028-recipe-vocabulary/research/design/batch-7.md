# Design Vocabulary — Batch 7

**Libraries covered:** UIverse · Motion (motion.dev) · animata.design · Animate.style (Animate.css) · Hover.dev

Extracted to inform an AI that generates YC-tier Shopify storefront modules. Focus is on transferable visual + motion primitives, not framework trivia.

---

## 1. UIverse — https://uiverse.io/

- **Type:** Community component library / effects catalog (4,400+ elements). Buttons, cards, loaders/spinners, toggles/switches, inputs, checkboxes, tooltips, patterns, UI kits.
- **Styling approach:** Dual output — **pure vanilla CSS** *and* **Tailwind** for every element. No JS dependency; effects are CSS-only (keyframes, transitions, pseudo-elements). Copy-paste, framework-agnostic.
- **Aesthetic signature:** Not one style — a *taxonomy* of styles you can dial in. The recurring named aesthetics are **neumorphism (soft UI), glassmorphism, gradient, neon, retro/pixel, dark mode, 3D**. Density is high and playful; contrast varies by style (low for neumorphism, high for neon). Radius trends generous (8–16px, pill for buttons). Depth is achieved through *layered shadow* rather than a single elevation.
- **Standout effects:**
  - **Neumorphic soft UI** — element background matches parent; two box-shadows (dark down-right + light up-left, blur ≈ 2× offset) produce raised/pressed states. Inset variant on `:active` for tactile press. Best on greyed pastels (`#e0e5ec`, `#dde1e7`), never pure white.
  - **Glassmorphic cards** — frosted `backdrop-filter: blur()`, semi-transparent fill, hairline `1px` translucent border, soft gradient glow.
  - **Gradient-fill-on-hover buttons** — border-only gradient at rest, fill sweeps in on hover; often paired with animated gradient borders (rotating conic gradient behind a masked inner surface).
  - **Rotating glow buttons** — conic-gradient pseudo-element spins behind the button (`@keyframes rotate`), producing an animated halo edge.
  - **Neon / glow** — layered `text-shadow` / `box-shadow` stacks in a single hue for sign-like bloom; flicker keyframes for retro.
  - **Ripple / pulse loaders and spinners** — pure-CSS radial expansion.
- **Motion/interaction:** All CSS. Hover = color/gradient sweep, glow ramp, or scale; `:active` = inset/press. Transition timing typically 0.2–0.4s ease. Continuous effects (rotate, pulse, flicker) via `@keyframes` on infinite loops.
- **What to steal:** The **style-pack mental model** — the same button/card rendered as neumorphic OR glass OR neon OR gradient. For storefront modules: (1) the two-shadow soft-UI recipe for tactile add-to-cart / qty steppers; (2) frosted-glass overlay cards for hero CTAs on imagery; (3) gradient-border-fill-on-hover as a premium primary-button archetype; (4) conic-gradient rotating halo for "featured/limited" badges. Everything ships as zero-JS CSS — ideal for Liquid sections.

## 2. Motion (motion.dev, formerly Framer Motion) — https://motion.dev/

- **Type:** Production animation engine (React / JS / Vue). Not components — the *motion runtime* other libraries build on.
- **Styling approach:** Declarative, physics-first API. Hardware-accelerated, tiny footprint. Independent transforms (`x`, `y`, `rotate`, `scale` animate on one element without wrapper divs).
- **Aesthetic signature:** Motion has no visual skin of its own — its signature is **feel**: springs that react to input, gestures that feel native (`hover`, `press`, `drag`), and layout transitions that look effortless. The house style is "physical, not mechanical."
- **Standout primitives:**
  - **Spring physics** — real spring math; defaults **stiffness 100, damping 10, mass 1** (docs also expose `bounce` ≈ 0.25 as the friendlier knob). Physical props (`x/y/scale/rotate`) default to **spring**; stylistic props (`opacity/color/backgroundColor`) default to **tween**.
  - **Tween default** — duration **0.3s** (0.8s when multiple keyframes); easing presets `easeIn/easeOut/easeInOut` or custom cubic-bezier arrays like `[.17,.67,.83,.67]`.
  - **`layout` prop** — animate between any two layouts automatically (FLIP under the hood).
  - **`AnimatePresence`** — exit animations for elements leaving the DOM.
  - **`variants` + `stagger` + timelines** — orchestrate parent→child sequences; stagger children by a fixed delay.
  - **Scroll-linked** (`ScrollTimeline`, hardware-accelerated) — parallax and scroll-scrub.
  - **`useMotionValue`** — a live value that drives animation *and* derived state (e.g. drag position → rotation).
  - **`Ticker`** — infinite marquee with true speed control.
- **Motion/interaction patterns:** Gesture-driven (spring-back on drag release), scroll-scrubbed reveals, staggered list entrances, shared-layout morphs.
- **What to steal:** The **default timing/easing values as a spec** (0.3s tween, spring stiffness 100 / damping 10 / bounce 0.25) — use them as the module system's motion tokens so generated animations feel like Motion even in plain CSS/Liquid. Steal the *archetypes*: staggered product-grid reveal on scroll-in, spring-back on interactive elements, `layout`-style morph for expand/collapse (variant swatch → detail), infinite ticker for announcement bars / logo walls, scroll-parallax hero.

## 3. animata.design — https://animata.design/

- **Type:** Open-source (MIT) copy-paste **animation + effects** collection — "a motion-design playground you copy from." React + Tailwind.
- **Styling approach:** **Tailwind CSS + Framer Motion** (with CSS keyframes where cheaper). Descriptively-named, self-contained snippets.
- **Aesthetic signature:** Kinetic and expressive — the value is *motion*, not chrome. Clean modern surfaces (Tailwind neutral palette, generous radius, restrained shadow) that exist to showcase text/icon/layout animation. Bento-grid layouts are a signature structural device.
- **Standout components/effects:**
  - **Text animations (huge library):** Animated Gradient Text, Blur Out Up, Bold Copy, Circular Text, Counter, Glitch Text, Jitter, Shimmer Sweep, Mask Reveal Up, Per-Character Rise, Per-Word Crossfade, Scroll Reveal, Split Text, Spring Scale In, Text Flip, Typing Text, Wave Reveal, Text Explode (iMessage), Jumping Text (Instagram).
  - **Bento grids:** multi-tile layouts (variants "Eight", "Three", "Gradient") with cards like Score Card, Subscribe Card, Swap Card, **Tilted Card**, Reminder Scheduler, Content Scan.
  - **Icon hover-interactions**, tickers, counters.
- **Motion/interaction patterns:** `group`/`group-hover` Tailwind choreography — hovering a tile transitions + scales its children together. Per-character / per-word text reveals. Scroll-triggered reveals. Spring scale-in entrances.
- **What to steal:** (1) The **bento-grid module archetype** — mixed-size product/feature tiles with coordinated group-hover — is a premium storefront layout pattern. (2) The **text-reveal taxonomy** as a menu of headline treatments (per-character rise, mask reveal up, shimmer sweep, gradient text) — perfect for hero + section headings. (3) **Tilted Card** and hover-lift for product cards. (4) Animated **Counter** for stats/social-proof ("12,000+ sold").

## 4. Animate.style (Animate.css) — https://animate.style/

- **Type:** Cross-browser **CSS-only animation library** — the canonical taxonomy of ready-made keyframe animations.
- **Styling approach:** Class-based, zero JS. Pattern: `class="animate__animated animate__<name>"`. Timing controlled by CSS variables (`--animate-duration`, `--animate-delay`).
- **Aesthetic signature:** No visual skin — it's a **catalog of motion verbs**. Its lasting value is a clean, named, well-tuned vocabulary of entrances/exits/attention-seekers everyone recognizes.
- **Animation categories + named members:**
  - **Attention seekers:** bounce, flash, pulse, rubberBand, shakeX/shakeY, headShake, swing, tada, wobble, jello, heartBeat.
  - **Entrances:** back-, bounce-, fade-, flip-, rotate-, zoom-, slide-In variants (directional: Up/Down/Left/Right).
  - **Exits:** matching backOut/bounceOut/fadeOut/zoomOut… variants.
  - **Specials:** hinge, jackInTheBox, rollIn/rollOut.
  - **Lightspeed:** InRight/InLeft/OutRight/OutLeft (skewed swoosh).
- **Timing defaults:** duration **1s**; speed utilities `slow` 2s / `slower` 3s / `fast` 800ms / `faster` 500ms; delay utilities 2–5s. Triggered by adding classes; composable with `animationend` for chaining.
- **What to steal:** The **motion-verb taxonomy** as a controlled enum for generated modules (entrance / exit / attention-seeker) so an AI can request "fadeInUp on scroll" or "pulse the badge" from a known, safe set. Steal: **fadeInUp / slideInUp** for section reveal, **pulse / heartBeat** for CTA emphasis, **tada / rubberBand** for add-to-cart confirmation, **flash** for urgency. Note the defaults are *slow* (1s) — retune toward Motion's 0.3s for a premium, snappier feel.

## 5. Hover.dev — https://www.hover.dev/

- **Type:** Premium React **blocks + effects** library — full marketing sections plus "addicting, interactive" micro-components.
- **Styling approach:** **React + Tailwind + Framer Motion** (with vanilla-JS / CSS keyframes where lighter). Copy-paste.
- **Aesthetic signature:** Polished, premium, dark-mode-forward. Bold vibrant accents (indigo-600 as the reference accent) on restrained neutral/dark grounds; modest radius (`rounded`), subtle contemporary shadows. Signature is **memorable micro-interaction** — motion tuned to be delightful ("addicting" is their word).
- **Standout components/effects:**
  - **Named button effects:** **Wet Paint Button** (drippy gradient underlay), **Encrypt Button** (scrambling/decrypting text on hover).
  - **Sections (blocks):** Heroes, Features, Pricing, Testimonials, Stats, FAQs, Sign-in, **3D sections**, **Kanban boards** (drag-and-drop).
  - **Interactive elements:** Carousels, marquees, Navbars/mega-menus, Dropdowns, Toggles, Countdowns, Notifications, Modals, Tabs, Accordions, Loaders, Progress bars.
- **Motion/interaction patterns:** Hover-triggered text scrambles, drip/reveal underlays, spring-based nav/menu transitions, drag interactions (kanban), auto-scrolling marquees, animated counters.
- **What to steal:** (1) **Signature-moment buttons** — text-scramble and gradient-drip effects as premium primary CTAs elevate a store instantly. (2) Full **section blocks** (pricing, testimonials, stats, feature grids) as module archetypes with motion baked in. (3) The **dark + one-vibrant-accent** palette discipline reads instantly premium. (4) Marquee logo/announcement bars and animated stat counters for social proof.

---

## Synthesized Transferable Primitives

### Design Tokens (observed across the batch)

**Color systems**
- **Style-pack model (UIverse):** neumorphic (greyed pastel base `#e0e5ec`, low contrast), glassmorphic (translucent + backdrop-blur + hairline border), gradient, neon (single-hue layered glow), dark. Treat as swappable palettes, not one look.
- **Premium default (Hover.dev):** dark or neutral ground + **one saturated accent** (indigo-600 class). Discipline = restraint: 1 accent, not 5.
- **Gradients:** border-only at rest → fill on hover; rotating conic-gradient for animated halos/borders.

**Typography scale**
- Headlines are the **motion surface** (animata): per-character rise, mask-reveal-up, shimmer sweep, animated gradient text. Body stays static.
- High-contrast, minimal, technical (Motion, Hover.dev) — let animation carry expressiveness, keep type clean.

**Spacing / layout rhythm**
- **Bento grid** (animata) as the premium structural archetype: mixed-size tiles, coordinated group-hover. Higher information density than uniform grids, still intentional.
- Generous whitespace + one hero motion moment (Motion/Hover ethos).

**Corner radius**
- Buttons: pill or `rounded` (8px). Cards: 8–16px. Neumorphic surfaces lean larger/softer.

**Shadow / elevation**
- **Layered dual-shadow (neumorphism):** dark down-right + light up-left, blur ≈ 2× offset; inset on press. Tactile.
- **Glass:** soft outer glow + 1px translucent border instead of hard drop shadow.
- **Premium blocks:** subtle single contemporary shadow; depth mostly from motion/parallax, not heavy shadow.

**Motion timing + easing (the load-bearing tokens)**
- **Snappy premium default:** tween **0.3s** (Motion). Retune Animate.css's slow 1s defaults toward this.
- **Spring feel:** stiffness **100**, damping **10**, mass **1**, bounce **~0.25** (Motion) — the "physical not mechanical" signature. Use for interactive/press/drag.
- **Physical props → spring; stylistic props (opacity/color) → tween** (Motion's split rule).
- **Stagger:** fixed per-child delay for list/grid entrances.
- **Continuous loops:** rotate (conic halo), pulse, shimmer, marquee — infinite, linear.
- **Speed ladder** (Animate.css): fast 500–800ms · normal ~1s · slow 2–3s — keep hero reveals brisk (300–600ms), reserve slow for ambient background loops.

### Reusable Component / Motion Archetypes

1. **Premium primary CTA** — pill button, gradient-border→fill on hover, or signature move (text-scramble / wet-paint drip). Spring press-in. *(UIverse + Hover.dev)*
2. **Tactile control** — qty stepper / toggle / add-to-cart in neumorphic soft-UI with inset-on-press. *(UIverse)*
3. **Frosted-glass overlay card** — backdrop-blur CTA/badge card over hero imagery. *(UIverse)*
4. **Bento feature/product grid** — mixed-size tiles, group-hover lift + child scale. *(animata)*
5. **Kinetic headline** — per-character rise / mask-reveal-up / shimmer / gradient text on scroll-in. *(animata)*
6. **Scroll-reveal section** — fadeInUp/slideInUp with per-child stagger, 300–600ms. *(Animate.css + Motion)*
7. **Tilted / hover-lift product card** — spring tilt + shadow bloom on hover. *(animata)*
8. **Animated stat counter** — count-up on scroll-into-view for social proof. *(animata + Hover.dev)*
9. **Infinite ticker / marquee** — announcement bar, logo wall, "just sold" feed; true speed control. *(Motion + Hover.dev)*
10. **Attention pulse** — pulse/heartBeat on badges, tada/rubberBand on cart confirmation. *(Animate.css)*
11. **Rotating conic halo** — animated gradient edge for featured/limited badges. *(UIverse)*
12. **Full marketing blocks** — pricing / testimonials / stats / FAQ with motion baked in. *(Hover.dev)*

**Governing principle:** premium = restraint + physics. One accent color, one hero motion moment, snappy 0.3s tweens, spring feel on interaction (stiffness 100 / damping 10), clean type with kinetic headlines, tactile depth from layered shadow — not decoration everywhere.
