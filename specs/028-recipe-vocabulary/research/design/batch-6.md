# Design Vocabulary — Batch 6

Libraries covered: **Zen UI**, **Lunar UI**, **CuiCui**, **Fly On UI**, **React Bits**

This batch is heavy on the *motion/effects* end of the spectrum. Two of the five (React Bits, Lunar UI) are effectively animation-effect catalogs rather than component kits; CuiCui straddles both; Fly On UI and Zen UI are the "workhorse" component/blocks kits. The transferable value here is a vocabulary of **premium motion primitives** (scroll-reveal, magnetic hover, spotlight, gradient/animated borders, WebGL backgrounds) plus a **semantic-token discipline** that keeps that motion from reading as noise.

---

## 1. Zen UI — https://zenui.net/

- **Type:** Component library + templates + color palettes (workhorse kit). React / Next.js focused.
- **Styling approach:** Tailwind CSS, **copy-paste, zero-dependency, zero-config**. "Just copy the code and paste it into your project." No npm install, no runtime. Components are pure Tailwind class strings, so every visual decision is inspectable and overridable inline.
- **Aesthetic signature:** Clean, neutral, plug-and-play. Deliberately *unopinionated* — the components ship a sober baseline and expect the consumer to layer shadow/animation classes ("feel free to add any Tailwind class to further style components, for example, adding shadow effects or animations"). Aesthetic lives in the templates + curated **color-palette presets** more than in any bespoke motion.
- **Standout offering:** Bundled **color palette library** and website templates alongside primitives — it treats palette selection as a first-class design decision, not an afterthought.
- **Motion/interaction:** Minimal by default; motion is opt-in via Tailwind `transition`/`animate-*` utilities. Interaction polish is the consumer's job.
- **What to steal:** The **zero-dependency copy-paste model** and the idea of shipping **named color-palette presets** as a selectable design axis. For a storefront-module generator, a small set of curated, named palettes (that a merchant can swap without touching component code) is exactly the right abstraction. Also: keep the *baseline* sober and treat shadow/motion as additive layers, so a module can be dialed from "flat/minimal" to "rich" without restructuring markup.

## 2. Lunar UI — https://lunarui.dev/

- **Type:** Curated **interactive/scroll-motion** component set — "top-notch Tailwind CSS components designed to catch attention." React + Vue. Tight, high-impact selection rather than exhaustive coverage.
- **Styling approach:** Tailwind CSS + Framer Motion, copy-paste (deliberately **not** npm-packaged so styling stays decoupled from implementation — "decide how the components are built and styled").
- **Aesthetic signature:** Contemporary **Linear-grade SaaS** polish — refined layering, subtle shadow depth (depth via soft shadow, not heavy contrast), generous whitespace, typography-forward. The distinctiveness is entirely in **motion**, not chrome.
- **Standout components / effects:**
  - **Spotlight Card** — cursor-tracked radial highlight that follows the pointer across a card surface.
  - **Star Grid** — animated feature-grid background.
  - **Magnetic Text** — text that attracts/deforms toward the cursor.
  - **Text Reveal / Scroll Reveal / Motion Text** — progressive, scroll-progress-driven typography reveals (word/line staggered).
  - **Sticky Scroll** — pinned section whose content advances with scroll position.
  - **Color Swapper** — animated color/theme transition.
- **Motion/interaction:** Two engines — (1) **pointer-reactive** (spotlight, magnetic) and (2) **scroll-progress-driven** (reveal, sticky, motion text). Content "reacts as users interact or scroll." Feel is fluid and continuous, mapped to a *progress value* rather than fired as discrete one-shots.
- **What to steal:** **Scroll-progress-mapped reveals** and **cursor-spotlight cards** are the two highest-ROI premium moves for a storefront. A product-feature section that reveals line-by-line as it enters the viewport, or a collection card with a pointer-following spotlight, instantly reads as high-end. Bind these to a normalized 0→1 progress so they degrade gracefully and never "pop."

## 3. CuiCui — https://cuicui.day/

- **Type:** All-in-one React component library — Application UI + Common UI + Marketing UI + Hooks + Snippets. Straddles workhorse-kit and effects-catalog.
- **Styling approach:** React + TypeScript + **Tailwind CSS + Framer Motion**, 100% open-source, copy-paste, "code you fully own." Explicit philosophy: **"minimize JavaScript, maximize CSS"** — many signature effects (e.g. rotate-on-hover cards) are pure CSS with no JS.
- **Aesthetic signature:** Craft-forward micro-interaction focus. Notably **dark-mode-first** on its showcase pieces — "designed to look better in dark mode with nice inner shadows and borders." Depth comes from **inner shadows + hairline borders + gradient fills** rather than big drop shadows. Moderate-to-high density (built for dashboards/admin as well as marketing).
- **Standout components / effects:**
  - **Hover cards** — CSS-only rotate/tilt-on-hover, inner-shadow + border treatments.
  - **"Beautiful" showcase** — gradient-driven, glow, animated/gradient borders.
  - **Color Picker** collection, **Signature** capture, **Tree** views, animated **Settings/Sliders/Steppers**, **keyboard-key (⌘)** display components.
- **Motion/interaction:** Micro-interaction dense — every control (slider, stepper, setting toggle) has motion feedback. Hover effects favor CSS transforms; heavier sequences use Framer Motion.
- **What to steal:** The **"maximize CSS, minimize JS"** discipline (cheap, dependency-free hover/tilt/shine on cards — critical for storefront perf), the **dark-mode inner-shadow + hairline-border depth recipe**, and **gradient/animated borders** as a premium accent. Also the idea that *every interactive control earns a small motion response* — a generated module feels alive when steppers/toggles/sliders animate rather than snap.

## 4. Fly On UI — https://flyonui.com/

- **Type:** The most complete kit in the batch — **80+ components + 500+ blocks** (marketing, dashboard, e-commerce) + templates + a **Figma design system** + JS plugins. Framework-agnostic (HTML, React, Vue, Angular, Svelte, Next, Nuxt).
- **Styling approach:** **Tailwind CSS v4** with a **semantic-class layer** over raw utilities (its differentiator). Collapses ~20 utility classes into ~5 semantic ones (`label-text`, `card`, etc.) — daisyUI-style ergonomics. Ships **accessibility-first JS plugins** for interactive behavior (modal, password toggle, etc.).
- **Aesthetic signature:** Modern, clean, professional, **flat-with-subtle-depth**. Moderate density, spacious layouts, clear hierarchy. Medium radius (~6–8px), **soft layered shadows** (`shadow-md`/`shadow-lg`), medium-to-high contrast. The polish is systematic and theme-driven rather than effect-driven.
- **Design tokens (most explicit in the batch — worth adopting wholesale):**
  - **Semantic color system (12 roles):** `primary`, `secondary`, `accent`, `neutral`, `base-100 / base-200 / base-300`, `*-content` (foreground-on-role), `info`, `success`, `warning`, `error`.
  - **10+ theme variants:** Light, Dark, Gourmet, Corporate, Luxury, Soft — plus app-flavored (Shadcn, Spotify, VS Code). Same markup, swappable theme = a proven **retheming architecture**.
  - **Motion:** `transition-all duration-200`, focus-ring outlines, hover role-shifts (`hover:bg-*-600`).
  - **Spacing/typography:** consistent `p-6` / `gap-4` rhythm; `sm | base | lg` size ladder.
- **Standout components:** e-commerce blocks (directly relevant), card system, validated form inputs, tabs/accordions, avatar groups, badge/status indicators, list groups, pagination.
- **What to steal:** The **12-role semantic color system + theme-variant architecture** is the single most portable asset in this batch — adopt it as the storefront-module token contract so one module renders correctly across many merchant palettes/dark mode by swapping a theme, never editing markup. Also the **`*-content` foreground-pairing convention** (guarantees legible text on any role color — solves AI-generated contrast failures) and the **500+ blocks incl. e-commerce** as an archetype checklist.

## 5. React Bits — https://www.reactbits.dev/

- **Type:** The largest **animated-effects catalog** — 110–130+ effects across **Text Animations / Animations / Components / Backgrounds**. Pure effects library, not a layout kit.
- **Styling approach:** Ships **4 flavors per component** — `JS-CSS`, `JS-TW`, `TS-CSS`, `TS-TW` — so it drops into any stack. Copy-paste or install via **shadcn / jsrepo CLI** (no monolithic package, tree-shakeable, minimal deps). Effects are powered by **GSAP (+ ScrollTrigger)**, **react-spring**, and **Three.js/WebGL**.
- **Aesthetic signature:** Bold, maximalist, motion-as-hero. Designed to make sites "memorable" — the visual identity IS the animation. WebGL backgrounds + kinetic typography carry the page.
- **Standout effects (a reusable menu):**
  - **Text:** Split Text, Blur Text, Shiny Text (sweep/gloss), Gradient Text, plus scroll/velocity text.
  - **Backgrounds (WebGL/canvas):** Aurora, Silk, Iridescence, Threads, Orb, Ballpit, Hyperspeed, Dot Grid, Particles, Waves, Grid.
  - **Interaction:** Click Spark, Magnet (magnetic hover), Pixel Transition, Image Trail, animated borders, scroll-triggered wrappers.
- **Creator tools:** **Background Studio** (tune a WebGL bg live), **Shape Magic** (inner-rounded corners between shapes), **Texture Lab** (20+ image/video effects). Signals a "configure-then-export" authoring model.
- **Motion/interaction:** Two tiers — cheap **DOM/CSS + GSAP/spring** effects (text sweeps, magnet, click spark, staggered reveals) and heavy **WebGL backgrounds** (aurora/silk/particles). Scroll-triggered reveals via GSAP ScrollTrigger; hover via magnetic transforms.
- **What to steal:** A **curated menu of named text/background effects** the generator can invoke by name — Shiny Text on headlines, Gradient Text on price/CTA, Aurora/Silk/Dot-Grid as a hero backdrop, Click Spark / Magnet on CTAs. Crucial guardrail: **gate WebGL backgrounds behind a perf budget** (storefronts are mobile/conversion-sensitive) and default to the cheap CSS/GSAP tier. The **4-flavor export model** (JS/TS × CSS/TW) is also a good template for emitting a module in whatever the target theme expects.

---

## Synthesis — Transferable Primitives

### Design tokens observed

- **Color system — adopt Fly On UI's 12-role semantic model as the contract:**
  `primary / secondary / accent / neutral / base-100 / base-200 / base-300 / info / success / warning / error`, each paired with a **`*-content` foreground** token. This solves AI-generated contrast failures (always pair text color to its surface role) and enables **theme-variant swapping** (light / dark / luxury / soft) without markup changes. Zen UI's **named palette presets** slot in as the merchant-selectable layer on top.
- **Corner radius:** convergent **medium radius ~6–8px** for cards/inputs (Fly On UI), with **pill/full** for badges and CTAs. Effect-heavy cards (CuiCui, Lunar) keep the same base radius and add depth via shadow/border, not sharper corners.
- **Shadow / elevation:** two depth recipes coexist —
  1. **Light mode:** soft layered drop shadows (`shadow-md` → `shadow-lg`), depth by blur not darkness (Fly On UI, Lunar).
  2. **Dark mode:** **inner-shadow + hairline (1px) border + subtle gradient fill** (CuiCui) — the premium dark-surface recipe. Support both and pick by theme.
- **Spacing rhythm:** consistent **4px base**, card interiors on `p-6` (24px), inter-element `gap-4` (16px); `sm | base | lg` size ladder (Fly On UI).
- **Typography:** typography-forward, generous whitespace (Lunar). Reserve **kinetic/gradient/shiny text** (React Bits) for hero headlines, price, and CTA — not body.
- **Motion timing & easing:**
  - **Micro-interactions (hover/focus/toggle):** `~150–200ms`, `transition-all`, ease-out (Fly On UI `duration-200`; CuiCui/Zen).
  - **Scroll-progress reveals:** map animation to a normalized **0→1 scroll progress** (Lunar, GSAP ScrollTrigger) — continuous, never a one-shot "pop"; staggered by word/line/item.
  - **Pointer-reactive (spotlight/magnetic):** spring/eased follow, not linear — `react-spring`/Framer springs.

### Component & motion archetypes (reusable menu)

**Motion archetypes (ordered cheap → expensive; default to cheap for storefront perf):**
1. **Micro-feedback** — hover role-shift, focus ring, animated toggle/slider/stepper (CuiCui, Fly On UI). CSS-only. Always on.
2. **CSS/GSAP hover flourishes** — tilt/rotate-on-hover cards, shiny/gradient text sweep, click spark, magnetic CTA (CuiCui, React Bits). Cheap, high perceived value.
3. **Cursor-spotlight surface** — radial pointer-tracked highlight on cards/heroes (Lunar Spotlight Card).
4. **Scroll-progress reveal** — staggered word/line/item entrance and pinned "sticky scroll" sections tied to scroll progress (Lunar, React Bits + ScrollTrigger).
5. **WebGL/canvas backgrounds** — Aurora / Silk / Iridescence / Threads / Dot-Grid / Particles hero backdrops (React Bits). **Perf-gated, opt-in, mobile-fallback to static gradient.**

**Component archetypes:**
- **Themeable card** (base radius, dual light/dark depth recipe, optional spotlight/tilt).
- **Feature-grid / bento** with per-item scroll-reveal stagger.
- **E-commerce blocks** (product card, collection grid, pricing, CTA band) — Fly On UI's block catalog as the coverage checklist.
- **Kinetic headline / gradient price / animated CTA** as the "hero accent" trio.
- **Gradient / animated border** as a reusable premium accent wrapper.

### Cross-batch through-lines
1. **Copy-paste, zero/minimal-dependency, own-the-code** is the universal delivery model (all five) — favors emitting inline, inspectable, tree-shakeable code over runtime packages.
2. **Semantic tokens + theme-variant swapping** (Fly On UI) is what separates a *system* from a pile of components — the highest-priority thing to adopt for multi-merchant retheming.
3. **Motion is the premium signal**, but it comes in a **cost ladder** — the intentional-looking libraries default to cheap CSS/spring micro-motion and reserve WebGL for a gated hero moment. Match that budget discipline for conversion-sensitive storefronts.
