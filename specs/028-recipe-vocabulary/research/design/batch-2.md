# Design Vocabulary — Batch 2

Libraries covered: **Material UI (MUI)**, **Mantine UI**, **Ant Design**, **Reshaped**, **AlignUI**

This batch skews toward mature, systematic **component libraries** (not effects/animation libs). Their value for a storefront-module generator is less about flashy motion and more about *token discipline* — the exact spacing rhythms, radius scales, elevation ramps, and motion curves that make a UI read as "engineered, not vibed." Below, each library is profiled, then synthesized into transferable primitives with concrete numeric values.

---

## 1. Material UI (MUI)

- **Type:** Component library (Google Material Design 3 lineage), the reference implementation of a full design system.
- **Styling approach:** CSS-in-JS (Emotion) with a deeply themable token object; the `sx` prop exposes theme tokens inline (`color: 'text.secondary'`, `bgcolor: 'success.50'`, responsive arrays `width: { xs: '100%', sm: 100 }`).
- **Aesthetic signature:** Restrained, systematic, mid-density. Small radius (default 4px), *ink-on-paper* elevation model — the entire look rests on a **24-step shadow ramp** where cards, menus, and dialogs each sit at a defined z-height. Contained buttons carry subtle shadow; outlined variants are shadow-free. Reads corporate-clean rather than playful.
- **Standout components:** Elevation-aware Card/Paper, Ripple-effect Buttons, TextField with animated floating label + underline, Snackbar, Speed Dial, Autocomplete.
- **Motion / interaction:** The gold standard for **motion tokens**. Durations: `shortest 150ms · shorter 200ms · short 250ms · standard 300ms · complex 375ms · enteringScreen 225ms · leavingScreen 195ms`. Easings: `easeInOut cubic-bezier(0.4, 0, 0.2, 1)` (default), `easeOut cubic-bezier(0, 0, 0.2, 1)` (enter), `easeIn cubic-bezier(0.4, 0, 1, 1)` (exit), `sharp cubic-bezier(0.4, 0, 0.6, 1)`. Signature move: material ripple + asymmetric enter/exit (things enter faster than they leave, or vice versa, so motion feels physical).
- **What to steal:** The **asymmetric-duration + easeOut-on-enter** convention, and the **numbered elevation ramp** — pick a shadow level per surface role (card=1–2, hover=4, dropdown=8, modal=16/24) instead of eyeballing box-shadows. Also the floating-label TextField pattern for storefront email capture / search.

**Concrete tokens**
- Spacing base: `8px` unit (theme.spacing(1)=8; scale is multiples: 8/16/24/32/40…).
- Radius: `shape.borderRadius = 4px` default.
- Type: `htmlFontSize 16 · base fontSize 14 · weights 300/400/500/700`. Scale (px / lineHeight / letterSpacing): h1 96/1.167/-1.5 · h2 60/1.2/-0.5 · h3 48/1.167/0 · h4 34/1.235/0.25 · h5 24/1.334/0 · h6 20/1.6/0.15 · body1 16/1.5 · body2 14/1.43 · button 14/1.75/0.4 (uppercase) · caption 12/1.66/0.4.
- Elevation: array of **25 levels** (0–24), each a layered multi-shadow.

---

## 2. Mantine UI

- **Type:** Component library **+ premade blocks** (ui.mantine.dev). 82 application-UI components, 30 page-section templates (hero headers, auth, error pages, feature grids), 11 blog blocks (article cards, TOC, comments).
- **Styling approach:** Theme object emitting CSS variables (`--mantine-*`); light/dark by default; `defaultRadius` sets the global corner rounding in one knob.
- **Aesthetic signature:** Friendly, medium-density, developer-modern. Softer than MUI, less corporate than Ant. **Layered multi-shadow** system (each elevation stacks 2–3 shadows for a natural falloff), and a notably **generous max radius** (xl = 3rem/48px → fully pill-able) that gives its marketing blocks a soft, approachable feel.
- **Standout components:** The **page-section blocks** are the real asset — hero headers with image bleed, feature cards, pricing tables, stats rows, FAQ accordions. These map almost 1:1 to storefront module archetypes.
- **Motion / interaction:** Understated; relies on hover elevation lift + color-scheme transitions rather than choreographed motion. Ships a small transition set (fade/pop/slide) driven by the theme.
- **What to steal:** The **block catalog structure** (hero / feature / pricing / stats / FAQ / CTA) as a taxonomy of storefront modules, and the **`defaultRadius` single-knob** idea — expose one radius personality control per generated store. The layered-shadow recipe below is directly liftable.

**Concrete tokens**
- Radius: `xs 0.25rem(4) · sm 0.5rem(8) · md 1rem(16) · lg 2rem(32) · xl 3rem(48)`.
- Spacing: `xs 0.5rem(8) · sm 0.75rem(12) · md 1rem(16) · lg 1.5rem(24) · xl 2rem(32)`.
- Shadow (layered): `xs 0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.1)` … up to `xl 0 1px 3px rgba(0,0,0,.05), 0 36px 28px -7px rgba(0,0,0,.05), 0 17px 17px -7px rgba(0,0,0,.04)`. Every level keeps a tight 1–3px contact shadow + a wide soft ambient shadow.
- Type: `xs–xl` fluid scale; light + dark schemes are peers, not afterthoughts.

---

## 3. Ant Design

- **Type:** Enterprise component library (largest surface area — DatePicker, Tour, Splitter, Masonry, FloatButton, Table with everything).
- **Styling approach:** CSS-in-JS with a **three-layer token system** — *Seed → Map → Alias*. Seed tokens are the intent origin (e.g. `colorPrimary`, `borderRadius`, `fontSize`); Map tokens derive scales from seeds algorithmically; Alias tokens are per-use overrides. This algorithmic derivation is the distinctive idea: change one seed, the whole system recomputes.
- **Aesthetic signature:** Dense, information-rich, high-trust. Small radius (`6px` default), crisp 1px borders, restrained shadows, brand blue `#1677FF`. Optimized for data-dense enterprise screens — every control height and gap is tuned for scanning tables and forms, not for whitespace luxury.
- **Standout components:** **Tour** (spotlight onboarding overlay), DatePicker/RangePicker, Table (sort/filter/expand/virtual), Splitter, FloatButton, Steps.
- **Motion / interaction:** Philosophy = **Natural · Performant · Concise** (animations justified by physics, kept minimal for enterprise speed). Alias motion tokens: `motionDurationFast ~0.1s · motionDurationMid 0.2s · motionDurationSlow 0.3s`; easing `motionEaseInOut cubic-bezier(0.645, 0.045, 0.355, 1)` (a sharper, more "mechanical" curve than MUI's softer 0.4/0/0.2/1).
- **What to steal:** The **seed-token algorithm** — generate a full palette/scale from a single merchant brand color rather than shipping fixed swatches (this is exactly how a store-aesthetic generator should work). Also the **Tour spotlight** pattern for first-visit storefront guidance, and the enterprise motion durations (0.1/0.2/0.3s) as a "snappy" preset.

**Concrete tokens**
- Radius: `borderRadius 6px` (seed); Map derives XS/SM/LG variants.
- Type: base `fontSize 14`, `lineHeight 22`, algorithmic size map derived from the base.
- Color: primary `#1677FF`; semantic set success/warning/error/info each with 10-step derived palettes.
- Motion: fast `0.1s` / mid `0.2s` / slow `0.3s`; ease `cubic-bezier(0.645,0.045,0.355,1)`.

---

## 4. Reshaped

- **Type:** Premium component library / design system (paid), agent- and Figma-native.
- **Styling approach:** **Semantic design tokens** as the primary API, with TailwindCSS integration for token access. Theme is generated from a single color value; automatic dark mode with no manual config; `theme.json` syncs to Figma variable modes. First-class "AI workflow" positioning (Storybook MCP, Figma design agent).
- **Aesthetic signature:** Minimal, modern, restrained — compact but breathable. The token vocabulary is unusually *role-named* rather than value-named, which is the transferable lesson: shadows are `outline / raised / overlay` (by function), radii are `small / medium / large` (by component class), each with an `-intense` variant for colored backgrounds. Nothing is named by pixel; everything by purpose.
- **Standout components:** Calendar/date pickers, auth inputs with inline validation, avatar/profile clusters, dropdown menus, pricing/bidding displays.
- **Motion / interaction:** Smooth, purpose-driven, responsive-syntax-aware (viewport-conditional behavior). Motion treated as a token layer, not ad-hoc.
- **What to steal:** The **function-named token taxonomy** — this is the single best idea in the batch for a generator. Instead of asking the AI to emit `box-shadow: 0 4px 12px...`, give it three named surface roles (`shadow-outline` for resting cards, `shadow-raised` for hover/active, `shadow-overlay` for menus/modals) each with a `-intense` colored-bg variant. Same for radius (small=badge/chip, medium=button/input, large=card/modal). Also: **generate the whole theme from one merchant color + auto dark mode**.

**Concrete tokens (role-named, values implementation-defined)**
- Radius roles: `radius-small` (Badge/chip), `radius-medium` (Button/input), `radius-large` (Card/Modal).
- Shadow roles: `shadow-outline` (resting + border), `shadow-raised` (slight lift), `shadow-overlay` (floating), each `+ -intense` for colored surfaces.
- Color/type/spacing: single-seed generated, framework-agnostic, dark mode automatic.

---

## 5. AlignUI

- **Type:** Copy-paste component library + blocks (React + Tailwind), production-ready and heavily tokenized.
- **Styling approach:** **TailwindCSS with a rich semantic CSS-variable layer**; polymorphic (`asChild`), variant-driven (mode/variant props). This is the most Tailwind-native and the most explicitly token-scaled of the batch — its class names *are* the design system.
- **Aesthetic signature:** Crisp, high-contrast, modern-SaaS. Strong text hierarchy via a **weight-encoded token ladder** (`text-strong-950 / text-sub-600 / text-soft-400 / text-disabled-300 / text-white-0`) where the numeric suffix encodes the shade — a self-documenting contrast system. Medium density, clear surfaces, customizable radius (Small/Medium/Large personalities).
- **Standout components:** Button (filled / stroke / lighter / ghost modes), form suite (Input/Label/Checkbox/Radio/Toggle), auth cards, command menu, file upload, modals/dropdowns.
- **Motion / interaction:** Subtle, Tailwind-utility-driven state transitions; modifier "modes" swap the entire visual treatment of a component.
- **What to steal:** The **numeric-suffix semantic color ladder** — `-strong-950 / -sub-600 / -soft-400 / -disabled-300` for text, `-strong-950 / -surface-800 / -sub-300 / -soft-200 / -weak-50 / -white-0` for backgrounds, `-strong-950 / -sub-300 / -soft-200 / -white-0` for strokes. This gives an AI an unambiguous, ranked palette so it never picks an arbitrary gray. Also the **button-mode matrix** (filled/stroke/lighter/ghost) and the **alpha token convention** (`-alpha-24/-16/-10`) for tints/overlays.

**Concrete tokens**
- Text: `text-strong-950 · text-sub-600 · text-soft-400 · text-disabled-300 · text-white-0`.
- Background: `bg-strong-950 · bg-surface-800 · bg-sub-300 · bg-soft-200 · bg-weak-50 · bg-weak-25 · bg-white-0`.
- Stroke: `stroke-strong-950 · stroke-sub-300 · stroke-soft-200 · stroke-white-0`.
- Palette: static ramps `{color}-0 … {color}-950` + alpha `{color}-alpha-24/-16/-10`; semantic families primary/information/warning/error/success/away/feature/verified/highlighted each with base/dark/darker + alpha.
- Type (all weight 500 titles, 400 paragraphs, negative letter-spacing): Titles H1 56 · H2 48 · H3 40 · H4 32 · H5 24 · H6 20. Labels 24/18/16/14/12. Paragraphs 24/18/16/14/12. Subheadings 16/14/12/11 (positive 2–6% tracking, often uppercase).

---

## SYNTHESIS — Transferable Primitives

### A. Color systems
Three converging patterns worth adopting together:

1. **Seed-derived palettes (Ant, Reshaped):** generate the entire scale from one merchant brand color algorithmically. This is the correct model for a store-aesthetic generator — never ship fixed swatches; derive.
2. **Numeric-suffix semantic ladder (AlignUI):** rank every role by an explicit shade number so the AI picks deterministically:
   - Text: `strong-950` (headings) → `sub-600` (body) → `soft-400` (captions) → `disabled-300`.
   - Surface: `white-0` → `weak-50` → `soft-200` → `sub-300` → `surface-800` → `strong-950`.
   - Stroke: `soft-200` (dividers) → `sub-300` (inputs) → `strong-950` (emphasis).
3. **Alpha tokens for tints/overlays:** `-alpha-10 / -16 / -24` (AlignUI) for hover washes, selected states, scrims — instead of arbitrary rgba.
4. **Semantic status set:** success / warning / error / info, each a 10-step derived ramp (Ant). Give surfaces a `.50` tint + `.500` solid + `.700` text triad (MUI convention).
5. **Dark mode as a peer,** generated automatically from the same tokens (Mantine, Reshaped) — not bolted on.

### B. Typography scale
Two clean anchor scales to offer as presets:

- **Editorial/marketing (big display, light weight — MUI):** h1 96 / h2 60 / h3 48 / h4 34 / h5 24 / h6 20, body 16/14; h1–h2 weight 300 with negative tracking (−1.5 / −0.5). Reads luxury/fashion.
- **Modern-SaaS (tighter, medium weight — AlignUI):** H1 56 / H2 48 / H3 40 / H4 32 / H5 24 / H6 20, all weight 500 with negative letter-spacing; paragraphs 16/14 weight 400; subheadings 11–16 weight 500 with **positive** tracking + uppercase for eyebrows/labels. Reads crisp/premium-DTC.
- Universal rules: base body **14–16px**; line-height ~**1.5 body / ~1.2 headings**; **negative tracking on large headings, positive tracking on small caps/eyebrows**; weights **300/400/500/700**.

### C. Spacing rhythm
- **8px base unit** is the batch consensus (MUI spacing(1)=8; Mantine md=16; AlignUI gap-4=16). Scale in multiples: **4 · 8 · 12 · 16 · 24 · 32 · 48 · 64**.
- Mantine's named steps map cleanly to intent: `xs 8 · sm 12 · md 16 · lg 24 · xl 32`. Use as section-padding and stack-gap presets.

### D. Corner radius
Offer a **radius personality knob** (Mantine `defaultRadius`, AlignUI Small/Med/Large) rather than fixed values, but anchor to role (Reshaped):
- **Tight/enterprise:** badge 4 · button/input 6 · card 8 (Ant/MUI feel).
- **Soft/friendly:** badge 8 · button/input 16 · card 24, up to pill (Mantine feel).
- Role mapping: `radius-small` = badge/chip · `radius-medium` = button/input · `radius-large` = card/modal.

### E. Shadow / elevation
Two liftable models:

1. **Numbered ramp (MUI):** assign an elevation level per surface role — card resting 1–2, hover 4, dropdown 8, popover/modal 16, top modal 24. Deterministic, never eyeballed.
2. **Function-named + layered (Reshaped × Mantine):** three role tokens — `shadow-outline` (resting card = 1px border + faint shadow), `shadow-raised` (hover/active lift), `shadow-overlay` (menu/modal float) — each with an `-intense` variant for colored backgrounds. Build each as a **layered multi-shadow**: a tight 1–3px contact shadow + a wide soft ambient shadow (Mantine recipe), e.g. `0 1px 3px rgba(0,0,0,.05), 0 20px 25px -5px rgba(0,0,0,.05), 0 10px 10px -5px rgba(0,0,0,.04)`. Layering is what separates premium from flat.

### F. Motion timing + easing
- **Duration presets:**
  - *Snappy/enterprise (Ant):* fast 0.1s · mid 0.2s · slow 0.3s.
  - *Material/smooth (MUI):* shortest 150 · short 250 · standard 300 · complex 375ms; enter 225 / exit 195ms.
- **Easing library:**
  - Default/soft: `cubic-bezier(0.4, 0, 0.2, 1)` (MUI easeInOut).
  - Enter (decelerate): `cubic-bezier(0, 0, 0.2, 1)`.
  - Exit (accelerate): `cubic-bezier(0.4, 0, 1, 1)`.
  - Mechanical/precise: `cubic-bezier(0.645, 0.045, 0.355, 1)` (Ant).
- **Principles:** motion must be *justified, performant, concise* (Ant); **asymmetric enter/exit durations** and **easeOut-on-enter** (MUI) make transitions feel physical. Hover = elevation lift + fast (150–200ms) ease.

### G. Reusable component / motion archetypes
Directly applicable to storefront modules:

- **Block taxonomy (Mantine):** hero header (image bleed) · feature grid · pricing table · stats row · FAQ accordion · CTA banner · testimonial/article card — the canonical set of generatable store sections.
- **Elevation-aware surface (MUI Paper/Card):** every module surface declares a role → gets a ramp shadow + radius automatically.
- **Floating-label input (MUI TextField):** for email capture / search / newsletter.
- **Spotlight Tour (Ant):** first-visit storefront onboarding / feature highlight overlay.
- **Button-mode matrix (AlignUI):** filled (primary CTA) · stroke (secondary) · lighter (tertiary tint) · ghost (nav/inline) — one component, four intents, driven by mode prop.
- **Command menu / dropdown / modal (AlignUI, Reshaped):** overlay-role surfaces using `shadow-overlay`.
- **Single-knob theming:** one merchant brand color → seed-derived palette (Ant/Reshaped) + one `defaultRadius` personality (Mantine) → a fully coherent, self-consistent store theme with automatic dark mode.
