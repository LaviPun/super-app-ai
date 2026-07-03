# Design Vocabulary — Batch 1

Libraries covered: **shadcn/ui**, **Radix UI (Colors + Themes)**, **Base UI**, **React Aria Components**, **Untitled UI React**

Purpose: extract transferable design primitives — tokens, archetypes, motion patterns — to raise AI-generated Shopify storefront modules to YC-startup-tier visual quality. This batch is the "systematic foundation" batch: these five libraries are where **rigor** lives (token scales, elevation ladders, state modeling), as opposed to spectacle. They teach how premium UI is *structured* so it reads as intentional rather than decorated.

---

## 1. shadcn/ui — https://ui.shadcn.com/

- **Type:** component library (copy-in, you own the code) + blocks/charts.
- **Styling approach:** Tailwind CSS + semantic CSS variables (`cssVariables: true`). Default color format is **oklch** (perceptually uniform — better lightness consistency than HSL when generating palettes).
- **Aesthetic signature:** Restrained, neutral-grounded, low-chrome. Sophistication through *restraint* — subtle 1px borders instead of heavy shadows, shallow elevation, generous whitespace, clear hierarchy. Reads "modern SaaS default" — the safe, correct baseline.

### Token system (the important part)
Semantic **background/foreground pairs** — every surface token has a matching text token:
- `background`/`foreground` (app shell), `card`/`card-foreground` (elevated surface), `popover`/`popover-foreground` (floating), `primary`/`primary-foreground`, `secondary`, `muted`/`muted-foreground` (de-emphasized text/surfaces), `accent`/`accent-foreground` (interactive/hover), `destructive`.
- Structural: `border`, `input`, `ring` (focus). Plus `sidebar-*` and `chart-1..5` palettes.
- Light mode under `:root`, dark under `.dark` — same token names, remapped values.

**Radius scale from ONE base var** (`--radius`, default `0.625rem` = 10px):
- `sm` = base − 4px · `md` = base − 2px · `lg` = base · `xl` = base + 4px (documented as ratios: sm 60%, md 80%, lg 100%, xl 140%, 2xl 180%…). One knob rescales the whole UI's roundness coherently.

Seven neutral base options (Neutral, Stone, Zinc, Mauve, Olive, Mist, Taupe) — the neutral choice sets the entire personality.

### Motion
Understated. Smooth streaming/scroll management in chat surfaces; transitions are fast and functional, not showy.

### What to steal
- **The background/foreground pairing rule.** Never emit a surface color without its paired text color — guarantees contrast on every module.
- **Single `--radius` knob** driving a derived sm/md/lg/xl ladder. A storefront module gets one "roundness" personality dial.
- **oklch for generated palettes** — tint shifts stay perceptually even, avoiding the muddy mid-tones HSL produces.
- **Restraint as a default.** When unsure, thin border + shallow shadow + whitespace beats heavy effects.

---

## 2. Radix UI — Colors + Themes — https://www.radix-ui.com/

- **Type:** two things: **Radix Primitives** (headless behavior) + **Radix Colors** (color system) + **Radix Themes** (styled, token-driven component system, zero-config via `<Theme>` wrapper).
- **Styling approach:** Radix Colors = CSS variable scales; Radix Themes = pre-styled with `accentColor`/`grayColor`/`radius`/`scaling`/`panelBackground` props. Import `@radix-ui/themes/styles.css`, wrap in `<Theme>`.
- **Aesthetic signature:** Calm, enterprise-grade, harmonious. The 12-step color discipline is the single most transferable idea in this whole batch.

### Radix Colors — the 12-step scale (memorize the step semantics)
Every scale has **12 steps, each with a designated job**:
| Steps | Purpose |
|---|---|
| 1–2 | App/subtle backgrounds |
| 3–5 | Component backgrounds — 3 normal, 4 hover, 5 pressed/selected |
| 6–8 | Borders — 6 subtle, 7 default, 8 hover/strong border |
| 9–10 | Solid fills — 9 base (the "brand" solid), 10 hover |
| 11 | Low-contrast/secondary text |
| 12 | High-contrast primary text |

- **35 scales**: 6 neutrals (Gray, Mauve, Slate, Sage, Olive, Sand — each subtly tuned to pair with a hue family) + warm + cool + Gold/Bronze metallics.
- **Alpha variants** of every scale for layering onto colored/photographic backgrounds (critical over storefront hero imagery).
- **Automatic dark mode** — same step numbers, class-toggled; step *semantics* hold across modes so component CSS never changes.
- **Contrast guaranteed** via APCA — step 11/12 text always passes on steps 1–2 bg; step 9 solid always readable with white.
- **P3 wide-gamut** variants for vivid reds/yellows on capable displays.

### Radix Themes tokens
- **Radius:** `none | small | medium | large | full` + a global `scaling` % that rescales spacing+type together.
- **Spacing:** 9-step, 4px base — `space-1..9` = 4, 8, 12, 16, 24, 32, 40, 48, 64px. (+4px early, then +8/+16 for layout gaps.)
- **Typography:** 9-step type scale with paired line-height AND letter-spacing that **tightens as size grows** (positive tracking at 12px → −0.025em at 60px):
  1:12/16 · 2:14/20 · 3:16/24 · 4:18/26 · 5:20/28 · 6:24/30 · 7:28/36 · 8:35/40 · 9:60/60. Weights 300/400/500/700.
- **Shadows:** 6-step elevation ladder mapped to *component role*, not arbitrary depth: 1 inset · 2–3 cards/classic panels · 4–5 popover/hover-card · 6 dialog/modal.
- **Panel background:** `solid` vs `translucent` (frosted) — one prop toggles glassmorphism.

### What to steal
- **The 12-step semantic scale is the crown jewel.** Adopt it wholesale: a generated module never picks "a lighter blue" — it references step 3 for a chip bg, step 6 for its border, step 9 for the CTA fill, step 11/12 for text. Instant harmony + guaranteed contrast, light and dark.
- **Alpha scales for image overlays** — the correct tool for text-over-hero-photo on storefronts.
- **Role-mapped shadow ladder** (card / popover / dialog), not a random blur menu.
- **Letter-spacing that tightens with size** — the difference between amateur and typeset headlines.
- **One `scaling` knob** to make a module denser or more spacious wholesale.

---

## 3. Base UI — https://base-ui.com/

- **Type:** unstyled/headless component library (from the Radix + Floating UI + Material UI teams — the successor lineage).
- **Styling approach:** fully agnostic — Tailwind, CSS Modules, CSS-in-JS, plain CSS. Ships zero visual opinion; ships behavior, composability, accessibility.
- **Aesthetic signature:** none by design — the *value* is a rock-solid interaction substrate ("meticulously designed for composability, consistency, and craft"). WCAG 2.2, ARIA APG patterns.
- **Standout components:** the hard ones done right — Combobox, Autocomplete, nested Dialogs, hover-triggered Menus, number-input **scrubbing**. These are exactly the interactions that make cheap UIs feel broken.

### Motion / interaction
Transition/animation surfaced via component state so entrance/exit can be CSS-driven (mount/unmount coordination for popovers, dialogs, menus — no flicker, correct focus timing).

### What to steal
- **Decouple behavior from skin.** Generated modules should render onto a headless behavior layer, then apply the token skin — so an "add-to-cart drawer" is always accessible and correct regardless of visual theme.
- **Sweat the complex interactions** (combobox filtering, nested overlays, input scrubbing) — polishing these is what separates premium from templated.

---

## 4. React Aria Components — https://react-aria.adobe.com/ (Adobe)

- **Type:** headless, accessibility-first component library (behavior + a11y, no styles).
- **Styling approach:** **data-attribute state hooks** + render props + a slots/composition system. This is the transferable idea.
- **Aesthetic signature:** none shipped — but it defines the *interaction-state vocabulary* premium UIs style against.

### The state model to steal (data-attribute CSS hooks)
Components expose their state as attributes you style directly:
`data-hovered`, `data-pressed`, `data-focused`, `data-focus-visible`, `data-selected`, `data-disabled`, `data-dragging`, `data-entering`, `data-exiting`.
- **Focus rings only in keyboard mode** (`data-focus-visible`) — no sticky rings on click/touch. A signature of polished UI.
- **No persistent hover on touch**; press has **drag-off-to-cancel**; long-press selection; scroll-lock in overlays; focus containment + restoration on close.
- Entrance/exit animation via `data-entering`/`data-exiting` → pairs cleanly with Tailwind `entering:animate-in entering:fade-in` / `exiting:animate-out exiting:fade-out`.
- Deep i18n substrate: 30+ locales, 13 calendar systems, RTL.

### What to steal
- **Model every interactive element across the full state set** (idle/hover/press/focus-visible/selected/disabled) — a generated CTA must define all five, not just idle+hover. That completeness is what reads as "designed."
- **`focus-visible`, not `focus`** for rings — keyboard users see it, mouse users don't.
- **Consistent entering/exiting animation states** for every overlay so nothing pops or flickers.
- **Device-aware interaction** (no touch hover, press-cancel) — matters on mobile storefronts where most commerce traffic lives.

---

## 5. Untitled UI React — https://www.untitledui.com/react

- **Type:** large component + blocks/sections/page-examples library (5k+ components, 250+ page examples), built on React Aria for behavior.
- **Styling approach:** Tailwind CSS v4 utility classes + CSS variables for theming (native dark mode); you own the code.
- **Aesthetic signature:** the polished, warm-neutral "premium SaaS/marketing" look. Pixel-perfect, generous whitespace, soft realistic shadows, decreased-saturation neutral grays (deliberately less blue than Tailwind's default slate), clean consistent iconography, obsessive variant coverage (e.g. 280 avatar variants).

### Token system
- **Numbered color scale: 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900** (note the extra ultra-light **25** step below 50 — used for the faintest tinted backgrounds; a hallmark of the look).
- **Families:** `gray` (neutral foundation — text/fields/bg/dividers), `primary`/brand (all interactive elements), semantic `error`/`warning`/`success`, plus secondary hues (indigo, blue, pink, orange). Each 25→900.
- **Shadow scale (7 steps):** xs, sm, md, lg, xl, 2xl, 3xl — soft, realistic, multi-layer shadows for z-axis depth. Heavier reliance on shadow elevation than shadcn/Radix; the softness is what feels expensive.
- Spacing/radius/width/typography/effects all tokenized as variables (Tailwind v4).

### What to steal
- **The `25` ultra-light tint step.** Faint `primary-25`/`gray-25` section backgrounds and hover fills are a cheap, high-impact way to make a storefront module feel layered and premium instead of flat.
- **Warm, desaturated neutrals** over pure/blue grays — friendlier and more "brand-agnostic," pairs with any store's accent.
- **Soft multi-layer shadows** (not a single hard drop shadow) for the "expensive" card feel.
- **Semantic error/warning/success scales** for commerce states (out-of-stock, low-stock, in-stock, sale).
- **Blocks/sections mindset** — ship composed section archetypes (hero, feature grid, pricing, testimonial, CTA), not just atoms.

---

## SYNTHESIS — Transferable Primitives

### A. Color system (adopt Radix's semantics + Untitled's warmth)
- **Use a step-semantic scale, not ad-hoc colors.** Radix's 12-step model is the gold standard: fixed jobs — 1–2 page bg · 3/4/5 component bg/hover/active · 6/7/8 borders · 9/10 solid fill/hover · 11/12 secondary/primary text. Untitled's 25→900 is the same idea with a different index; the **25** ultra-light tint is worth grafting on.
- **Always pair surface + text tokens** (shadcn) so contrast is structural, never accidental.
- **Generate in oklch** (shadcn) for perceptually even tints/shades.
- **Ship alpha variants** (Radix) for text/overlays on hero imagery — essential for storefronts.
- **Warm, desaturated neutrals** (Untitled) as the default gray so any store accent pairs cleanly.
- **Contrast is a guarantee, not a hope** — target APCA/WCAG per step pairing (Radix).
- Same token names across light/dark; only values remap.

### B. Typography scale
- ~9-step scale, generous line-heights, **letter-spacing that tightens as size grows** (Radix): ~+0.0025em at 12px → ~−0.025em at 60px. This alone upgrades headline feel.
- Weights: 400 body / 500 medium (labels, emphasis) / 600–700 headings. Radix uses 300/400/500/700.
- Pair every font-size with a fixed line-height token (never leave leading to chance).

### C. Spacing rhythm
- **4px base, 9-step scale**: 4, 8, 12, 16, 24, 32, 40, 48, 64 (Radix). +4px in the small range, +8/+16 for layout gaps. Everything snaps to this grid.

### D. Corner radius
- **One base `--radius` knob** (shadcn), default ~10px, driving a derived sm/md/lg/xl ladder. Plus a global `scaling` %/roundness personality dial (Radix) to shift a whole module tight↔soft in one move.

### E. Shadow / elevation (role-mapped, soft)
- **Map elevation to component role, not arbitrary blur** (Radix): inset · card · popover · dialog. 6–7 rungs (Radix 6 / Untitled 7).
- **Soft, multi-layer shadows** (Untitled) for the premium feel; thin 1px borders as the low-chrome alternative (shadcn) when a flatter look is wanted. Two coherent elevation strategies to pick between per module.

### F. Motion timing + easing
- Entrances **fade + small translate/scale**, fast (~150–250ms), ease-out; exits quicker (~100–150ms). Coordinate mount/unmount so overlays never flicker (Base UI / React Aria `data-entering`/`data-exiting`).
- **`focus-visible` rings** (keyboard only), never sticky focus/hover on touch (React Aria).
- Transitions are functional and restrained (shadcn) — motion confirms state, it doesn't perform.

### G. Interaction-state completeness
- Model every interactive element across the **full state set**: idle · hover · pressed · focus-visible · selected · disabled · entering · exiting (React Aria data-attributes). A generated CTA/card/chip that defines all of these reads as "designed"; one with only idle+hover reads as templated.
- **Decouple behavior from skin** (Base UI): render on a headless, accessible behavior layer, then apply the token skin — accessibility + correctness survive any theme.

### H. Component / motion archetypes to reuse
- **Atoms with full state coverage:** Button (primary/secondary/outline/ghost/destructive), Input, Badge/Chip, Card (role-mapped shadow), Avatar (dense variant set).
- **Overlays with coordinated enter/exit + focus management:** Dialog/Drawer, Popover, HoverCard, Menu, Combobox/Autocomplete, Command menu (⌘K).
- **Section blocks (Untitled mindset):** hero, feature grid, pricing, testimonial, CTA band, product/collection grid — composed, tokenized, ready to theme per store.
- **Commerce-semantic states:** success/warning/error scales driving in-stock / low-stock / out-of-stock / on-sale treatments.

### The one-paragraph thesis
Premium UI in this batch is not "more effects" — it is **systematic constraint**: a step-semantic color scale with guaranteed contrast (Radix), surface+text token pairing (shadcn), a 4px spacing grid and 9-step type scale with size-aware tracking (Radix), a single radius/scaling personality knob (shadcn/Radix), role-mapped soft elevation (Untitled/Radix), keyboard-only focus rings with full interaction-state coverage (React Aria), all layered over a headless accessible behavior substrate (Base UI). An AI that emits modules *against these token scales and state models* — rather than picking colors, sizes, and shadows freehand — will read as intentional and premium by construction.
