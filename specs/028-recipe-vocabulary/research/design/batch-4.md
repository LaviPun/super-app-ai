# Design Vocabulary — Batch 4

Libraries covered: **Tailwind Flex**, **Kibo UI**, **Tailark**, **Magic UI**, **Aceternity UI**

Extracted to inform the visual design system of an AI that generates premium (YC-startup-tier)
Shopify storefront modules. Focus is on what makes each library read as *intentional and premium*,
plus transferable tokens and archetypes.

---

## 1. Tailwind Flex — https://tailwindflex.com/

- **Type:** Component library + community template showcase (broad, crowd-sourced).
- **Styling approach:** Pure HTML + Tailwind utilities. No React, no headless primitives — copy-paste
  markup. Lowest common denominator, maximally portable (which is exactly the Liquid/storefront constraint).
- **Aesthetic signature:** Medium-to-high density SaaS/fintech look. Conservative radius (`rounded-lg`
  → `rounded-xl`), contained/layered shadows (depth without drama), muted neutral base (white/gray)
  with a single brand accent. Dark-mode toggle common. Motion is interface-driven micro-interaction,
  not spectacle.
- **Standout components/effects:** Glassmorphic navbars with neon-gradient edges; mega-menus and
  expanding search fields; full-screen mobile nav overlays; newsletter-in-footer; social-auth button
  rows; photography-led hero with overlay text.
- **Motion/interaction:** Expand/collapse (mobile-first), hover/focus feedback on buttons+links,
  standard `ease-in-out` at moderate durations. Nothing bespoke.
- **What to steal:** This is the *baseline vocabulary* a storefront module must nail before anything
  fancy — glass navbar, mega-menu, expanding search, photo hero with overlay, footer newsletter.
  Because it's raw HTML+Tailwind it maps almost 1:1 onto Liquid section markup. Treat it as the
  "table-stakes commerce chrome" layer.

## 2. Kibo UI — https://www.kibo-ui.com/

- **Type:** Composite ecosystem layered on shadcn/ui — **41 components + 28 blocks + 1,100+ patterns**.
- **Styling approach:** Tailwind + React + TypeScript + Radix primitives + Lucide icons. "Composable,
  accessible, extensible." Inherits shadcn's token contract.
- **Aesthetic signature:** Utility-app polish, not marketing flash. Medium-high density with generous
  interaction padding. **Depth comes from borders + color shifts, not shadows** (minimal shadow
  treatment). Consistent shadcn radius baseline (~0.5rem inputs/buttons, ~12px card containers).
  Neutral-forward with accent reserved for interactive/focus state.
- **Standout components:** Gantt (multi-view: Gantt/Calendar/List/Kanban/Table), Figma-style Color
  Picker, Code Block (syntax + line numbers + copy), Dropzone, collaborative Canvas, Avatar Stack,
  Cursor, Contribution Graph, Credit Card, Ticker, Stories, Reel, QR Code, Rating, Tree, Dialog Stack.
- **Motion/interaction:** Marquee (auto-scroll), Carousel/Reel, Dialog Stack (layered modal mgmt),
  Spinner/Status. Transitions are fast + functional (~200–300ms). Motion always serves clarity, never
  ornament.
- **What to steal:** The *data-rich commerce widgets* — Rating stars, Avatar Stack (social proof),
  Ticker (price/stat animation), Stories/Reel (mobile-native product browsing), QR Code, Credit Card
  mock (checkout trust). And the discipline: **border+color for depth on utility surfaces, shadows
  saved for elevated/floating things.** Great model for product cards and quick-add drawers.

## 3. Tailark — https://tailark.com/

- **Type:** Marketing **blocks & page templates** on a shadcn/ui foundation (section-level, not atomic).
- **Styling approach:** Tailwind + shadcn/ui. Utility-first, composition-oriented.
- **Aesthetic signature:** Generous whitespace, spatial isolation between sections, clear hierarchy.
  Moderate radius (8–12px) applied *consistently*. Soft layered elevation shadows (delicate, not
  heavy). Ships **named palette variants — Quartz, Dusk, Mist, Veil** — for light/dark theming.
  Community praise centers on gradients, sharp text rendering, and "3D buttons." Reads production-ready,
  not avant-garde.
- **Standout blocks:** Hero (16 variants), Bento layouts (14), Expandable Features (22), Secondary Hero
  (20), Testimonials / "Wall of Love," Features Carousel, 3D buttons.
- **Motion/interaction:** Smooth state transitions, carousel, expand/collapse progressive disclosure.
  CSS-based, restrained.
- **What to steal:** The **block taxonomy is a storefront section map** — hero, bento feature grid,
  wall-of-love testimonials, features carousel, secondary/narrative hero. The **named-palette-variant
  pattern (Quartz/Dusk/Mist/Veil)** is directly reusable as store "style packs": one section, N
  cohesive color moods. Bento grid + 3D tactile button are premium signals worth codifying.

## 4. Magic UI — https://magicui.design/

- **Type:** Animation/effects component library (**150+ animated components**), shadcn-complementary.
- **Styling approach:** React + TS + Tailwind + **Motion (Framer Motion)**. Copy-paste primitives;
  heavy use of CSS custom properties (`[--duration:20s]`) for tuning.
- **Aesthetic signature:** Moderate density, whitespace around each effect, restrained neutral base so
  the *motion* is the color. Subtle radius (4–8px), soft layered shadows. High-contrast text. The look
  is "clean canvas + one hero animation."
- **Standout effects (the money list):**
  - *Text:* Text Animate, Typing, Number Ticker, Animated Shiny Text, Animated Gradient Text, Text
    Reveal, Hyper Text, Word Rotate, Sparkles Text, Morphing Text, Aurora Text, Line Shadow Text.
  - *Borders/cards:* **Border Beam**, Shine Border, Magic Card, Glare Hover.
  - *Effects:* Animated Beam (connects two nodes), Meteors, Confetti, Particles, Ripple, Orbiting
    Circles, Icon Cloud, Lens, Animated Circular Progress.
  - *Buttons:* Rainbow Button, **Shimmer Button**, Ripple Button.
  - *Backgrounds:* Flickering Grid, Animated Grid Pattern, Retro Grid, Dot Pattern, Grid Pattern,
    Light Rays, Noise Texture.
- **Motion/interaction — concrete tokens:**
  - **Marquee:** infinite scroll, default 4× repeat, `[--duration:20s]`, direction/reverse/pause-on-hover.
  - **Border Beam:** default `duration: 6s`, `size: 50px`, gradient **`colorFrom #ffaa40` (warm orange)
    → `colorTo #9c40ff` (purple)**, `borderWidth: 1`, `delay: 0`, `reverse` + `initialOffset` props;
    lives in a `relative overflow-hidden` container.
  - **Animated List:** staggered sequential reveal with per-item delay (notification-feed pattern).
- **What to steal:** **Number Ticker** (price/inventory/"1,240 sold" counts), **Border Beam / Shine
  Border** (halo a featured product or the active plan), **Shimmer Button** (premium CTA), **Animated
  List** (live "just purchased" social proof), **Sparkles/Confetti** (add-to-cart / order-success
  moment), subtle **Dot/Grid/Noise backgrounds** for texture without imagery. The orange→purple beam
  gradient is a ready-made "premium accent" recipe.

## 5. Aceternity UI — https://ui.aceternity.com/

- **Type:** Animation/effects + blocks + full templates (**200+**), shadcn-compatible.
- **Styling approach:** Tailwind + **Framer Motion**, React/Next. Gradient- and shader-forward.
- **Aesthetic signature:** Spacious, high-contrast, **large statement headings**. Rounded corners
  everywhere (medium→large radius, no sharp edges). Soft depth-layered shadows. **Gradient-heavy** —
  mesh/shader backgrounds are the identity. Dark mode is where it shines. The signature move is a
  dramatic dark canvas + one large light/gradient/parallax gesture.
- **Standout effects:**
  - *Backgrounds:* **Aurora Background**, Wavy Background, gradient/shader animations, Lamp Effect,
    Light Rays.
  - *Cards:* **3D Card Effect**, Glare Card (Linear-style hover glare), Card Spotlight (radial gradient
    reveal), Wobble Card, Focus Cards, Direction-Aware Hover, Canvas Card, Expandable Card, **Infinite
    Moving Cards**.
  - *Scroll:* **Hero Parallax**, Macbook Scroll, **Tracing Beam**, Text Reveal, Parallax blocks.
  - *Pointer/attention:* **Spotlight** (and Spotlight New — dual left/right), **Glowing Effect**,
    Moving Border, 3D Pin, **Globe (3D)**.
- **Motion/interaction — concrete tokens:**
  - **Aurora Background:** `animation: aurora 60s linear infinite`; keyframes drift `background-position`
    from `50% 50%` → `350% 50%` on two stacked gradient layers; optional `showRadialGradient`. Slow,
    ambient, never distracting.
  - **Glare Card / Spotlight:** hover- and pointer-position-driven radial gradient reveal (tracks
    cursor).
  - **3D Card:** perspective tilt on hover with layered z-translate on children.
- **What to steal:** **Aurora / gradient-mesh hero background** (instant premium storefront banner),
  **Spotlight/Glare on product cards** (Linear-grade hover), **3D tilt card** for hero product,
  **Infinite Moving Cards** for logo/testimonial strips, **Tracing Beam** for a scroll-narrated PDP,
  **Hero Parallax** for lookbook/collection. Key discipline: one big ambient gesture per view (60s
  aurora, one parallax), never many competing animations.

---

## Synthesis — Transferable Primitives

### Design Tokens (observed)

**Color systems**
- Neutral-forward base (white/near-black + gray scale); a *single* brand accent drives interactive state.
- Two premium accent recipes seen in the wild:
  - Warm→cool beam gradient **`#ffaa40 → #9c40ff`** (orange→purple) for halos/beams/CTAs.
  - Aurora/mesh gradient (multi-stop, low-saturation, slowly drifting) for ambient hero backgrounds.
- **Named palette variants** (Tailark: Quartz / Dusk / Mist / Veil) = ship one section in N cohesive
  moods → maps to per-store "style packs."
- Dark mode is a first-class token set across all five, and gradient/glow effects are designed dark-first.

**Typography scale**
- Semantic shadcn-style hierarchy (heading / body / label). Clean sans throughout.
- Marketing libs (Aceternity, Tailark) lean into **large statement headings**; utility libs (Kibo) keep
  a tighter, denser scale. Rule: bigger + fewer type sizes for hero/marketing, tighter scale for
  data/utility surfaces.
- Sharp text rendering is treated as a quality signal (antialiasing, crisp weights).

**Spacing rhythm**
- 4px base, 8px primary increment; 16px section rhythm for marketing blocks.
- Marketing = generous whitespace + spatial isolation between sections; utility = denser but with
  deliberate interaction padding.

**Corner radius**
- Inputs/buttons ~4–8px (`rounded-lg`), cards ~12px (`rounded-xl`), marketing/animated cards
  medium→large. Consistency of radius across a surface is itself the premium tell.

**Shadow / elevation** — two distinct philosophies to apply by surface type:
- *Utility surfaces* (Kibo): **borders + color shifts for depth, minimal shadow.**
- *Marketing/floating surfaces* (Tailark/Magic/Aceternity): **soft, layered, delicate** elevation
  shadows + glow. Reserve real shadow (and glow) for elevated/floating/featured elements.

**Motion timing + easing**
- *Micro-interactions* (hover, state, transitions): **150–300ms, ease-in-out.**
- *Ambient/background loops:* very slow, **linear, infinite** — Aurora `60s linear`, Marquee `~20s`,
  Border Beam `6s`. Long+linear reads as "alive," not "busy."
- Tune via CSS custom props (`[--duration]`) so one component covers many tempos.
- Physics/spring available (Framer Motion) for tactile card tilt and beam transitions.
- **Discipline rule:** one big ambient gesture per view; everything else is sub-300ms micro-interaction.

### Reusable Component / Motion Archetypes

1. **Commerce chrome (table stakes):** glass navbar, mega-menu, expanding search, photo hero w/ overlay,
   footer newsletter. (Tailwind Flex)
2. **Product/social-proof widgets:** Rating stars, Avatar Stack, Number Ticker ("1,240 sold"),
   Animated List ("just purchased"), Stories/Reel mobile browsing, Credit-Card/QR trust marks. (Kibo + Magic UI)
3. **Section/block map:** hero (many variants), bento feature grid, wall-of-love testimonials, features
   carousel, secondary/narrative hero, expandable feature list. (Tailark)
4. **Premium accents:** Border Beam / Shine Border halo on featured product or active plan; Shimmer/3D
   tactile button for primary CTA; Sparkles/Confetti at add-to-cart & order-success. (Magic UI / Tailark)
5. **Ambient hero backgrounds:** Aurora / gradient-mesh, Dot/Grid/Noise texture, Light Rays — one per
   view, slow linear loop. (Aceternity / Magic UI)
6. **Pointer-reactive cards:** Spotlight / Glare (cursor-tracked radial reveal), 3D tilt on hover, for
   the hero product or a featured collection card. (Aceternity)
7. **Scroll-narrated PDP/lookbook:** Tracing Beam, Hero Parallax, Text Reveal, Infinite Moving Cards
   (logo/testimonial strip). (Aceternity)
8. **Style-pack theming:** one section rendered across named palette moods (Quartz/Dusk/Mist/Veil) —
   the mechanism for matching a store's live aesthetic. (Tailark)
