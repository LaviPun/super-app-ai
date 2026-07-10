# Composition Rules — §04 Layout & Responsiveness (extracted from Template Gallery.dc.html)

> Machine-readable checklist distilled from the design guide's **§04 Layout & responsiveness**
> ("mobile-first · gap over margins · one grammar, every viewport") and the §05 atom
> inventory. This is the implementation contract for the composition layer: the Liquid
> renderer, the preview renderers, template normalization, and the generation guardrails
> all build against THESE rules. Source of truth: `Template Gallery.dc.html` §04/§05
> (see `module-design-system.md` reference-build note).

## 1. Breakpoints (mobile-first · QA floor 320/375)

| Tier | Range | Grid behavior |
|---|---|---|
| mobile | ≤ 767px | 1 col · popups = bottom-sheet |
| tablet | 768–1023px | 2 col |
| desktop | ≥ 1024px | full grid · popups = centered inset |

Width measures: `narrow` ~560px · `container` ~1200px · `wide` ~1600px · `full` 100vw.

## 2. Spacing law — GAP OVER MARGINS

- Space sibling groups with `gap` on the flex/grid **parent** — **never per-child margins**.
- Reserve `margin` for the module's **outer rhythm** only.
- Scale: `none` · `tight` 8–12 · `medium` 16–24 · `loose` 32–64 (px).

## 3. Alignment laws

- `left` — **default for reading**: body copy, forms, lists.
- `center` — heroes, section intros, short CTAs ONLY.
- `right` — prices, numerals, RTL mirror.
- **Center only short measures (≤ 46ch). Long body stays left — never center a paragraph.**

## 4. Layout archetypes (`config.layout.layout`)

| Value | Renders |
|---|---|
| `stacked` (default) | single-column flow |
| `grid` (`--sa-cols`) | columns-wide CSS grid |
| `masonry` | column-count, break-inside |
| `carousel` | scroll-snap-x, **peek-next** |
| `bento` (span tiles) | mixed-size grid, hero span |

## 5. Responsive behavior rules

- Grid columns collapse **3 → 2 → 1** across the breakpoints; carousels keep peek-next on mobile.
- Popups: bottom-sheet on mobile, centered inset on desktop; primary CTA in the thumb zone.
- `hideOnMobile` / `hideOnDesktop` — per-module visibility.
- Honor `env(safe-area-inset-*)` · no clipping at 200% type · targets stay ≥ 44px.

## 6. Derived composition invariants (enforced by lint + generation guardrails)

1. **Columns ↔ content**: a grid's column count must divide evenly into its block count
   at desktop, or the renderer must handle the orphan row deliberately (center the
   remainder or span it) — never a dangling single item in a 3-up grid.
2. **Measure**: body/paragraph content is capped at a readable measure (~46–60ch);
   centered text ≤ 46ch.
3. **One CTA row** per section; CTAs cluster with `gap`, wrap cleanly at 320px.
4. **Images in grids** carry an aspect hint (`aspect-ratio` + `object-fit: cover`) so
   rows stay level regardless of source dimensions.
5. **Alignment coherence**: one alignment intent per section (eyebrow/title/body/CTA
   agree); pack defaults apply when unset (Luxe editorial-left with centered statement
   variants; Bold center-punch hero, left content).
6. **Empty/missing content** falls back to the anti-slop branches
   (`superapp-section--minimal` / `--textonly` / `__empty`) — never a broken skeleton.

## 7. §05 Atom inventory (component library — both packs)

Buttons/CTAs (primary · secondary · outline · ghost · link, + states) · inputs ·
radio & selection types (standard · segmented · cards · swatch · size · pill) ·
tabs (underline · pill · enclosed · vertical · count) · accordions (hairline +/− ·
chevron · filled · bordered group) · toggles/switches (on/off · sizes · labeled ·
segmented · checkbox) · cards · badges · data display · overlays/notifications
(tooltips · success bubbles · social-proof notification popups · upsell/cross-sell
popups).
