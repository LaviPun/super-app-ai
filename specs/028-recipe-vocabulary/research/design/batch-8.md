# Design Batch 8 — Cursify · UI Layouts · UI Layouts Pro (HeroUI Pro reference)

Transferable design vocabulary extracted from three related libraries (Cursify and UI Layouts Pro share the same maintainer/registry as UI Layouts). Focus: what makes each read as *intentional and premium*, distilled into primitives an AI can reuse when generating Shopify storefront modules.

Sources:
- Cursify — https://cursify.vercel.app/ (also cursify.ui-layouts.com)
- UI Layouts — https://www.ui-layouts.com/ (+ /components)
- UI Layouts Pro / HeroUI Pro blocks — https://pro.ui-layouts.com/blocks

---

## 1. Cursify

**Type:** Cursor-effects / micro-interaction animation library (single-primitive focus).
**Styling approach:** React + TypeScript + Tailwind CSS + Framer Motion, with several effects rendered on the **Canvas API** for particle systems. Copy-paste component model (shadcn-style registry), not a runtime dependency.

**Aesthetic signature.** A whole library built on *one* interaction — the cursor — as a design primitive. The signature is **physics-driven playfulness held in check by restraint**: effects feel alive (spring easing, velocity, trailing) but the visual language stays minimal (mono/emoji accents, clean headers, dark canvas). It proves that a single well-tuned micro-interaction can carry a brand's "premium" feel without any layout work.

**Standout effects.**
- **Smooth Following Cursor / Springy Cursor** — a secondary cursor element lags the real pointer via spring physics; overshoots and settles.
- **Canvas Cursor / Neural Glow** — canvas-rendered particle trails and glow that respond to movement speed.
- **Fairydust / Sparkle / Snowflake / Bubble / Rainbow / Character** — emit particle bursts from the pointer path; particles fade + drift with gravity/lifetime.
- **Spotlight Cursor** — a radial mask/gradient follows the pointer, dimming everything else (great for focus).
- **Follow Cursor / Magnetic** — elements pull toward the pointer within a radius.

**Motion / interaction patterns (the reusable part).**
- Spring following is the core recipe: Framer Motion `useSpring` on x/y MotionValues, typical config **damping ≈ 25, stiffness ≈ 700** — snappy but with a hint of overshoot.
- **Velocity tracking** drives secondary properties: faster movement → longer trail, more particles, slight **rotation** of the follower toward travel direction.
- Particle lifecycle: spawn on move → scale/opacity decay over a short lifetime → drift (gravity or upward float).
- Speed-reactive intensity: idle = calm, fast = energetic. The effect self-modulates instead of running at a constant amplitude.

**What to steal for storefront modules.** A single spring-follower or spotlight-mask hover primitive can make an otherwise-static product card, hero, or CTA feel bespoke. Use *sparingly and speed-reactive* — one signature cursor/hover behavior per module, tuned to overshoot-and-settle, reads as premium; a page full of particle effects reads as noise. The spotlight-mask is the highest-value borrow for storefronts: it directs attention to a featured product without a hard modal.

---

## 2. UI Layouts

**Type:** Component + section-block + effects library (broad). Free tier of the same ecosystem as UI Layouts Pro.
**Styling approach:** React / Next.js + Tailwind CSS + Framer Motion (branded "Motion"), distributed via **shadcn registry** (copy-paste, headless-leaning, fully restyleable). Some effects use **Three.js / React-Three-Fiber** (Globe, R3F Blob) and native **Canvas / WebGL** (mesh gradients).

**Aesthetic signature.** Clean, modern, "slick" — neutral foundations with generous whitespace and *one* motion or 3D moment per section carrying the wow. Users describe it as balancing "speed and polish." Radius and shadows are **subtle, not aggressive**; the premium feel comes from motion quality and 3D/effect set-pieces rather than heavy chrome. Dark/light parity is first-class.

**Standout components & effects.**
- **Image Reveal** — progressive uncover of an image on scroll/hover (clip-path or scale-mask wipe).
- **Clip-Path Image** — SVG clip masks for geometric image shapes and shaped reveals.
- **Scroll Text Marquee** — horizontal text marquee whose **speed and direction are driven by scroll velocity** (uni- and bi-directional).
- **Liquid Glass** — frosted glassmorphism panel (see tokens below); expandable + draggable with elastic bounce-back.
- **Image Mousetrail** — a trail of images spawns along the cursor path (Cursify's idea scaled up to imagery).
- **Magnified Doc** — hover zoom/loupe on document/image regions.
- **Globe** (R3F) and **R3F Blob** — 3D rotatable sphere and organic elastic blob deformation.
- **Mesh Gradients** — smooth multi-stop animated color fields (WebGL/canvas).
- **Stacking Card** — cards overlap and reorder on scroll for layered depth.
- **Sticky Scroll** — content pins while a paired layer scrolls beneath.
- **Sparkles / Animated Beam** — twinkling particles; glowing connector lines with trailing light between elements.

**Motion / interaction patterns.**
- **Scroll-linked, not just scroll-triggered.** The marquee reads scroll *velocity/direction* (`useScroll` → `useVelocity`), which feels far more alive than a fixed-speed loop.
- **Reveal-on-viewport** as a standard primitive: directional (up/down/left/right) + fade, viewport `amount: 0.5`, `once: true`, per-item `delay` for stagger — a clean, restrained entrance vocabulary.
- **Elastic drag** on the glass panel (spring bounce-back) signals interactivity without a control chrome.
- 3D and mesh moments are used as *one* focal element, not wallpaper.

**What to steal for storefront modules.** (1) Scroll-*velocity*-driven marquees for brand/logo/announcement strips — cheap, distinctive, ties motion to user intent. (2) Directional reveal-on-scroll with staggered `delay` as the default entrance for any product grid or feature row. (3) Image Reveal / clip-path wipe for hero and lookbook imagery — turns a flat photo into a moment. (4) The Liquid Glass panel as a premium overlay/badge treatment (sale badges, sticky add-to-cart, filter drawer).

---

## 3. UI Layouts Pro / HeroUI Pro blocks

**Type:** Premium ready-to-use **section blocks** (marketing-page building blocks).
**Styling approach:** shadcn/ui + Tailwind CSS + Motion. Full-section compositions (not atoms), dark/light mode via Tailwind theming, standardized 0.25rem spacing scale.

**Block library (breadth = the point).** Hero (26), Footer (63), Pricing (24), Testimonials (22), About (21), FAQs (18), Team (14), Experience (13), Features (11), Newsletter (7), Carousel/Slider (5). The sheer count of variants per category — 63 footers, 26 heroes — signals the real premium lever: **the same design tokens re-composed into many layout archetypes** so a page never looks templated.

**Aesthetic signature.** YC-startup-tier marketing polish: confident whitespace, one accent color over a neutral base, subtle radius/shadow, and *section-level motion choreography* (entrance stagger, marquee, reveal) rather than per-element flourish. Depth valued (63 footer variants) implies these are meant to feel bespoke per brand.

**Layout archetypes to catalog.**
- **Split hero** (copy left / visual right) and **centered hero** with a single focal CTA.
- **Bento grid** feature sections (mixed-size tiles).
- **Pricing tables** with a highlighted/recommended tier (scale + accent border + badge).
- **Testimonial** walls, marquees, and single-quote spotlights.
- **Logo marquee** trust strips.
- **Stacking-card** and **sticky-scroll** feature narratives.
- **Rich multi-column footers** as a first-class designed surface.

**What to steal for storefront modules.** Treat storefront modules as *composable section archetypes*, not one-offs: hero (split/centered), feature-bento, pricing/plan compare, testimonial (wall/marquee/spotlight), trust-logo marquee, FAQ accordion, newsletter capture, rich footer. Give each 3–5 layout variants driven by the *same* token set so generated stores feel bespoke. The "recommended tier" pricing pattern (elevate + accent border + badge + subtle scale) is a directly reusable emphasis recipe for any "featured" storefront item.

---

## 4. Synthesized transferable primitives

### 4.1 Design tokens observed

**Color system**
- Neutral foundation (near-black / near-white surfaces) + **one accent** carried across a section. Dark/light parity is table stakes, not a bonus.
- Effect color comes from **gradients and glow**, not saturated fills: mesh gradients, radial spotlight masks, animated beams, particle glow.
- Emphasis via **accent border + subtle background lift**, not heavy color blocks.

**Typography**
- Clean sans, minimal weights, large confident headers over generous whitespace. Ornament comes from *motion and imagery*, not decorative type. Emoji/mono accents used sparingly for personality.

**Spacing rhythm**
- Tailwind **0.25rem base scale** (multiples of 4px). Premium feel = *more* whitespace than feels necessary; sections breathe.

**Corner radius**
- Subtle by default on UI atoms; **large radius (≈32px) reserved for glass / feature panels**. Pick one radius per surface tier and hold it.

**Shadow / elevation**
- Layered, restrained. Glass panels stack **inner shadow + outer glow** (tiers none → 2xl) to read as depth without hard drop shadows. Avoid aggressive single drop shadows.

**Glassmorphism recipe (Liquid Glass)**
- `backdrop-blur` in tiers (sm/md/lg/xl) + partial transparency + large radius (~32px) + inner-shadow depth + outer-glow (none→2xl) + subtle border. Optional elastic drag (spring bounce-back) for interactivity.

**Motion timing + easing**
- **Spring is the default feel**, not linear/ease: Framer Motion `useSpring`, ~**damping 25 / stiffness 700** for snappy overshoot-and-settle; softer springs for panels.
- Entrance: directional reveal + fade, viewport trigger `amount ≈ 0.5`, `once: true`, staggered per-item `delay`.
- **Scroll-*linked* motion** (velocity/direction driven) beats fixed-duration loops — tie marquees and parallax to `useScroll`/`useVelocity`.
- Effects are **speed/velocity-reactive** (calm idle → energetic on fast input): trail length, particle count, and follower rotation all scale with velocity.

### 4.2 Reusable component / motion archetypes

| Archetype | Source | Storefront use |
|---|---|---|
| Spring-follower cursor / magnetic hover | Cursify | Signature hover on CTA, featured card |
| Spotlight radial mask | Cursify | Focus a featured product, dim surroundings |
| Particle burst (speed-reactive) | Cursify | Delight moment on add-to-cart / hero |
| Scroll-velocity marquee | UI Layouts | Logo trust strip, announcement bar |
| Directional reveal-on-scroll (staggered) | UI Layouts | Default entrance for product grids / feature rows |
| Image Reveal / clip-path wipe | UI Layouts | Hero & lookbook imagery moments |
| Liquid glass panel | UI Layouts | Sale badge, sticky add-to-cart, filter drawer |
| Mesh gradient / animated beam | UI Layouts | Ambient hero background, section connectors |
| Stacking-card / sticky-scroll narrative | UI Layouts | Story-driven product/feature sequence |
| 3D globe / blob focal element | UI Layouts (R3F) | One wow element per landing section |
| Split & centered hero | Pro blocks | Storefront hero variants |
| Feature bento grid | Pro blocks | Collection / benefits layout |
| Pricing "recommended tier" emphasis | Pro blocks | Featured product / plan highlight (border + lift + badge + slight scale) |
| Testimonial wall / marquee / spotlight | Pro blocks | Social proof section variants |
| Rich multi-column footer | Pro blocks | Designed footer as a first-class surface |

**Meta-lesson for the generator.** Premium ≠ more chrome. It comes from: (a) one accent over neutral + abundant whitespace; (b) *one* motion or 3D set-piece per section, spring-based and speed-reactive; (c) many layout variants from a single token set so nothing looks templated; (d) restrained radius/shadow with glass reserved for feature surfaces. Generate storefront modules as composable section archetypes with these constraints baked in.
