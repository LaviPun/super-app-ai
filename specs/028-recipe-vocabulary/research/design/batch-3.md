# Design Vocabulary — Batch 3

Libraries covered: **HeroUI**, **daisyUI**, **HyperUI**, **PrimeReact**, **Tailwind Plus**

Extracted to inform an AI that generates premium (YC-startup-tier) Shopify storefront modules. Focus is on transferable *visual* vocabulary — what makes each library look intentional — not framework wiring.

---

## 1. HeroUI (heroui.com)

- **Type:** React component library (built on React Aria + Tailwind CSS v4). Successor to NextUI.
- **Styling approach:** Tailwind + design-token CSS variables; behavior/accessibility from React Aria (headless underneath, styled on top). "Beautiful by default, customizable by design."
- **Aesthetic signature:** Soft, modern, *diffuse* elevation. Its defining trait is a **glow-style shadow system** — shadows are near-black at very low opacity spread over a large blur radius with zero offset, so cards look like they float on a soft halo rather than casting a hard drop shadow. Generous corner rounding, medium density, restrained but saturated accent colors. Reads "friendly product UI," not enterprise.
- **Design tokens observed:**
  - **Radius** (v2): `radius-small: 8px`, `radius-medium: 12px`, `radius-large: 14px`. (v3): base `--radius: 0.5rem`, with `--field-radius: calc(radius * 1.5)` so inputs/controls are rounder than surfaces — a deliberate hierarchy.
  - **Shadow scale** (the signature): `small: 0 0 5px 0 rgb(0 0 0 / .02)`, `medium: 0 0 15px 0 rgb(0 0 0 / .03)`, `large: 0 0 30px 0 rgb(0 0 0 / .04)`. Note: **0 offset, huge blur, ~2–4% opacity** — this is the "premium float" look. v3 adds semantic `--surface-shadow: 0 2px 4px rgba(0,0,0,.04)` and `--overlay-shadow: 0 4px 16px rgba(24,24,27,.08)` for a subtle offset on floating overlays.
  - **Color roles:** semantic set — `default, primary, secondary, success, warning, danger`, plus `background, foreground, focus`, and layered surfaces `content1–content4` (progressively lighter/darker panels for nesting). Each has a paired `-foreground` for guaranteed contrast.
  - **Motion:** CSS transitions + keyframes keyed to data-attributes: `[data-pressed]` scales the element down (tactile press), `[data-entering]/[data-exiting]` fade+scale popovers/modals. Global `disableAnimation` escape hatch.
- **Standout components:** dropdowns/popovers with spring-y scale-in, the `content1–4` surface-nesting model, switches/checkboxes with satisfying press-scale.
- **What to steal:** (1) The **glow shadow** (0-offset, wide-blur, 2–4% opacity) for hero cards and product tiles — instantly reads premium and never muddy. (2) **Inputs rounder than their container** (field-radius = 1.5× surface radius). (3) **Press-scale on tap** for every interactive element. (4) The `content1–4` nesting palette for cards-within-cards.

---

## 2. daisyUI (daisyui.com)

- **Type:** Component *plugin* for Tailwind (semantic class layer: `btn`, `card`, `badge`, `toggle`).
- **Styling approach:** Pure CSS, zero JS. Everything is CSS-variable driven, which is what powers instant theme swapping.
- **Aesthetic signature:** **Semantic + theme-portable.** The whole system is 8 named color roles that any of ~35+ built-in themes remap. Same markup renders as clean-corporate (light), neon (synthwave/cyberpunk), muted-pastel (cupcake), or desaturated-cool (nord) purely by swapping the `data-theme` variable set. Medium density, moderate radius, subtle elevation. The lesson is *tokens over hardcoded color*.
- **Design tokens observed:**
  - **Color roles:** `primary, secondary, accent, neutral, info, success, warning, error` — each with a matching `-content` (text-on-color) token. Plus layout bases `base-100 / base-200 / base-300` (surface, raised surface, border/deeper) and `base-content`.
  - **Named theme presets:** light, dark, cupcake, bumblebee, synthwave, dracula, nord, cyberpunk, retro, valentine, etc. — each is just a different mapping of the same ~13 variables.
  - **Radius/spacing:** configurable via CSS vars (`--rounded-box` for cards, `--rounded-btn` for buttons — buttons and boxes have independent radii, echoing HeroUI's field-vs-surface split).
  - **Motion:** ~200ms transitions; button press = shadow reduction + slight `translateY` (physical "push down").
- **Standout components:** the theme engine itself; toggle/swap animations; `card`, `stat`, `badge`, `alert` semantic blocks.
- **What to steal:** (1) **Everything through ~13 CSS variables + a `-content` pair per color** — this is the cleanest way to let one generated module inherit a store's palette and re-skin instantly. (2) **Independent radii for boxes vs buttons.** (3) Button press = **shadow shrink + translateY down**, the cheapest convincing tactility. (4) Ship *named aesthetic presets* (a "synthwave" pack, a "nord" pack) rather than only a light/dark toggle.

---

## 3. HyperUI (hyperui.dev)

- **Type:** Copy-paste **block/snippet** library (raw HTML + Tailwind classes). MIT, no dependency.
- **Styling approach:** Vanilla Tailwind utility classes in HTML — no component runtime, no JS required. Tailwind v4.
- **Aesthetic signature:** Two coexisting looks. (a) A **clean, restrained editorial default** — generous whitespace, thin borders (`border-gray-100/200`), small-to-moderate radius, near-flat elevation, strong typographic hierarchy; content-first, very little chrome. (b) An optional **neobrutalist** register — hard black borders, solid offset shadows (no blur), high contrast, playful. Ships dark-mode variants and RTL/LTR support on most blocks.
- **Design tokens observed:** standard Tailwind scale (4px spacing base, `rounded-md/lg/xl`, `shadow-sm→xl`, gray-scale neutrals). No custom token layer — the value is in the *compositions*, not new primitives.
- **Standout blocks (directly storefront-relevant):** product cards (6 variants), collection cards, collection filters, featured sections, product collections, quantity inputs (stepper), carts, announcement bars, banners. This is the most e-commerce-native library in the batch.
- **Motion/interaction:** hover lifts on cards, image zoom-on-hover in product tiles, focus rings on inputs; kept intentionally light.
- **What to steal:** (1) The **product-card and collection-card compositions** are near-ready storefront archetypes — steal the layout DNA: image-first, tight caption block, price + name on one baseline, hover image-zoom. (2) The **thin-border + whitespace + flat elevation** editorial default is a great "safe premium" baseline for merchandising grids. (3) Keep **neobrutalism as an opt-in style pack** (hard border + solid offset shadow, no blur) for bold/streetwear brands. (4) Quantity **stepper** and **announcement bar** as canonical small components.

---

## 4. PrimeReact (primereact.org → primereact.dev)

- **Type:** Large enterprise React component suite (~90 components: data tables, calendars, trees, editors).
- **Styling approach:** **Styled OR unstyled** mode. The interesting part is the styled architecture: a **3-tier design-token system** (primitive → semantic → component). Base = CSS-variable rules; preset = token values feeding those variables. Unstyled mode hands full control to Tailwind.
- **Aesthetic signature:** Depends on preset, but all are **precise, dense, and enterprise-legible** — smaller radii, tighter spacing, clear focus rings, data-first. Presets: **Aura** (PrimeTek's own modern look), **Material** (Google MD2), **Lara** (Bootstrap-flavored), **Nora** (enterprise). One component tree, four distinct design languages via token swap — the same lesson as daisyUI but with a formal 3-tier hierarchy.
- **Design tokens observed:**
  - **3 tiers:** *primitive* (context-free palette, `blue-50`…`blue-900`), *semantic* (`focus ring`, `primary`, `surface`, `transition duration`), *component* (per-component overrides).
  - **Semantic examples:** `transitionDuration: 0.2s` (global default), form field `borderRadius: 0.5rem`, `paddingX: 0.75rem`, `fontSize: 14px`, `shadow: 0 1px 2px rgba(0,0,0,.05)`.
  - **Focus ring** is a first-class token (width, style, color, offset) — accessibility as a design primitive, not an afterthought.
  - **Motion:** opt-in **ripple** on buttons/interactives; 0.2s transitions everywhere.
- **Standout components:** DataTable (sorting/filtering/row-expansion), Calendar/DatePicker, TreeSelect, AutoComplete — dense data UX done cleanly.
- **What to steal:** (1) The **3-tier token model (primitive → semantic → component)** is the right architecture for a generator: pick a palette (primitive), map roles once (semantic), override rare edge cases (component). (2) **Focus ring as an explicit token** — bake accessible focus into the design system, don't leave it to the browser default. (3) `0.2s` as the **default transition duration** — a well-calibrated, universally-safe interaction speed. (4) The **preset concept** (Aura/Material/Lara/Nora) = shippable "aesthetic personalities" over identical structure.

---

## 5. Tailwind Plus (tailwindcss.com/plus)

- **Type:** Premium **block + template** library (500+ blocks in React/Vue/HTML) + full templates + Catalyst UI kit. From the Tailwind team, so it's the reference implementation of "Tailwind done tastefully."
- **Styling approach:** Tailwind CSS v4 utilities; interactive bits via Headless UI. Code-first, no design files.
- **Aesthetic signature:** The **canonical modern-SaaS look** and the highest-taste baseline in the batch. Defining traits: **generous whitespace / breathing room**, restrained neutral-forward palette with a single confident accent, **layered but soft shadows** (not dramatic), moderate radius (`rounded-lg`→`rounded-xl`), crisp type hierarchy, immaculate alignment and rhythm. Every block includes a paired dark-mode variant. Premium comes from *restraint + spacing discipline*, not ornament.
- **Design tokens observed:** standard Tailwind (4px spacing base, `rounded-lg/xl`, `shadow-sm→2xl`, mobile-first breakpoints `sm/md/lg/xl/2xl`, 12-col grid). No custom tokens — the craft is in **spacing rhythm, hierarchy, and alignment**.
- **Standout blocks (storefront-relevant):** Hero sections (12), CTA (11), Pricing (12), Testimonials (8), FAQs (7), Logo clouds, Footers (7); e-commerce: **product overviews, shopping carts, checkout forms, product lists, category filters, reviews, order history**. Directly maps to storefront module needs.
- **Motion/interaction:** Headless UI transition primitives — smooth enter/leave fades + scale on menus/modals/disclosures; full hover/focus/active/disabled state coverage; touch-friendly. Understated, never flashy.
- **What to steal:** (1) **Whitespace and spacing rhythm are the product** — the single biggest premium signal. Give generated modules generous, consistent vertical rhythm. (2) **One accent color, everything else neutral** — disciplined restraint reads as expensive. (3) **Always ship a paired dark variant** per module. (4) The **marketing + e-commerce block taxonomy** (hero / CTA / pricing / testimonials / FAQ / product-overview / cart / reviews) is a ready-made **module catalog** for a storefront generator. (5) Menus/modals: **fade + subtle scale** on enter, not slide.

---

## SYNTHESIS — Transferable Primitives

### Design tokens (batch consensus)

- **Corner radius (two-track hierarchy):** surfaces vs controls should have *different* radii. Common defaults: surfaces/cards `8–14px` (`rounded-lg`→`rounded-xl`), buttons/inputs rounder (HeroUI field = 1.5× surface; daisyUI splits `rounded-box`/`rounded-btn`). Enterprise/dense → smaller (PrimeReact `~6px`). Pick a base `--radius` and derive control radius from it.
- **Shadow / elevation — two idioms to offer:**
  - *Premium float* (HeroUI): `0 0 {5|15|30}px 0 rgb(0 0 0 / .02–.04)` — **zero offset, wide blur, 2–4% opacity**. Best for hero/product cards; never looks muddy.
  - *Standard depth* (Tailwind Plus / PrimeReact): soft offset shadows `shadow-sm→2xl`, e.g. `0 1px 2px rgba(0,0,0,.05)` rising to `0 4px 16px rgba(24,24,27,.08)` for overlays. Best for menus/modals/toasts.
  - *Neobrutalist* (HyperUI opt-in): **solid offset shadow, 0 blur, hard border** for bold brands.
- **Color system — semantic roles + `-content` pairs:** converge on `primary, secondary, accent, neutral, success, warning, danger/error, info` + layered surfaces (`base-100/200/300` or `content1–4`), each with a paired foreground token guaranteeing contrast. **Restraint rule (Tailwind Plus):** one confident accent, everything else neutral.
- **Token layering (PrimeReact model):** **primitive → semantic → component**. Palette is context-free; roles are mapped once; components override only edge cases. This is the recommended architecture for a store-palette-inheriting generator.
- **Spacing rhythm:** 4px base unit (Tailwind standard) across all five. **Premium = generous, consistent whitespace** (Tailwind Plus's core lesson). Density is a dial: airy for marketing/merchandising, tight for data/enterprise.
- **Typography:** modern sans, strong hierarchy (display → heading → body → caption), body ~14–16px, high contrast for legibility. Hierarchy discipline > font novelty.
- **Motion timing:** **~0.2s (200ms)** is the batch-consensus default transition (daisyUI 200ms, PrimeReact `0.2s`). Fades + subtle scale for enter/exit (HeroUI, Tailwind Plus/Headless UI). **Press-scale-down on tap** (HeroUI `[data-pressed]`) and **translateY + shadow-shrink** for button press (daisyUI) are the two cheapest convincing tactile cues. Ripple (PrimeReact) is opt-in. Provide a global `disableAnimation` escape hatch.

### Reusable component / motion archetypes

- **Product card:** image-first, hover image-zoom, tight caption (name + price on a baseline), premium-float shadow, card radius. (HyperUI DNA + HeroUI shadow.)
- **Collection/category card, collection filter bar, quantity stepper, announcement/banner bar** — canonical storefront small parts (HyperUI).
- **Surface nesting:** `content1–4` / `base-100–300` for cards-within-cards without muddy borders (HeroUI, daisyUI).
- **Overlay pattern:** popovers/modals/menus enter with **fade + subtle scale**, offset shadow, keyed to enter/exit data-attributes (HeroUI, Headless UI).
- **Interactive feedback:** press-scale (HeroUI) or translateY+shadow-shrink (daisyUI); explicit **focus-ring token** for accessibility (PrimeReact).
- **Aesthetic presets ("style packs"):** ship named personalities — clean/SaaS, synthwave/neon, nord/muted, neobrutalist — as token remaps over identical structure (daisyUI themes + PrimeReact presets). One module, many skins via ~13 CSS variables.
- **Module catalog** (from Tailwind Plus taxonomy): hero, CTA, pricing, testimonials/reviews, FAQ, logo cloud, footer, product overview, cart, checkout, product list, category filter, order history — a ready-made list of storefront module types to generate.
- **Always ship a paired dark variant** per generated module (Tailwind Plus, HyperUI).

### Notes / fetch caveats
- HyperUI (403 on direct fetch) and PrimeReact (403) were characterized via WebSearch + docs excerpts; token values cross-checked against official docs snippets. HeroUI root was thin; tokens sourced from v2/v3 theming docs via search. daisyUI and Tailwind Plus fetched directly.
