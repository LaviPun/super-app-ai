# Design System - AI Shopify SuperApp

## Product Context
- **What this is:** A Shopify embedded super app that lets non-developers generate safe modules, automations, and integrations through validated RecipeSpec output.
- **Who it's for:** Shopify merchants, operations teams, and internal app operators who need power features without developer-only complexity.
- **Space/industry:** Shopify app tooling, workflow automation, and storefront customization.
- **Project type:** Web app + internal admin + storefront extension surfaces + docs/marketing support.
- **Component system policy:** Polaris-first across app/admin surfaces; only use Radix-style primitives if Polaris lacks a required behavior.

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian with warm polish.
- **Decoration level:** Minimal.
- **Mood:** Fast to understand, low-friction to operate, and trustworthy under heavy workflow usage.
- **Reference sites:** Not used in this pass (design knowledge-only mode).
- **Memorable thing:** Ease of access and very easy to use.

## Typography
- **Display/Hero:** General Sans - clean and structured, with enough personality to avoid generic SaaS tone.
- **Body:** Instrument Sans - legible and calm for dense settings/forms/tables.
- **UI/Labels:** Instrument Sans (same as body).
- **Data/Tables:** IBM Plex Mono - reliable tabular rhythm for IDs, logs, and technical values.
- **Code:** IBM Plex Mono.
- **Loading:** Self-host where possible; fallback to Google Fonts for previews/prototyping.
- **Scale:** 12, 14, 16, 18, 20, 24, 30, 36, 44 px.

## Color
- **Approach:** Balanced.
- **Primary:** `#1F3A5F` - trust/structure, nav headers, key hierarchy anchors.
- **Secondary:** `#2F80ED` - focus, links, and informative states.
- **Accent:** `#0E9F6E` - positive action and confirmations.
- **Neutrals:** `#F6F8FB` (bg), `#FFFFFF` (surface), `#DCE3EC` (borders), `#6B7280` (muted), `#111827` (body text).
- **Semantic:** success `#0E9F6E`, warning `#D97706`, error `#DC2626`, info `#2F80ED`.
- **Dark mode:** Preserve hierarchy, lower saturation slightly, keep contrast above AA targets for all text and controls.

## Spacing
- **Base unit:** 8px.
- **Density:** Comfortable.
- **Scale:** 2xs(2), xs(4), sm(8), md(16), lg(24), xl(32), 2xl(48), 3xl(64).

## Layout
- **Approach:** Grid-disciplined.
- **Grid:** 12 columns (desktop), 8 (tablet), 4 (mobile).
- **Max content width:** 1160px for dashboard/content shells.
- **Border radius:** sm 6px, md 8px, lg 12px, full 9999px.

## Polaris Implementation Rules
- **Primary UI system:** Use Polaris web components and Polaris patterns for app-shell, form, status, and table primitives so the app feels native inside Shopify Admin.
- **Component preference order:** Polaris component -> Polaris web component -> custom wrapper only when no Polaris primitive fits.
- **App shell baseline:** One left navigation + one top header for merchant and internal admin surfaces, with `Page`-style content sections.
- **SuperApp redesign exception:** The Internal Admin and Merchant Dashboard surfaces now render through the **vendored SuperApp design system** (see below) rather than raw `@shopify/polaris`. That system re-creates the Polaris visual language token-for-token, so the rules above still describe the *look*; only the *implementation primitive* differs. `@shopify/polaris` remains a dependency and is still used by surfaces outside the redesign.

## Implemented Design System (SuperApp redesign)
The Internal Admin and Merchant Dashboard were rebuilt as a 1:1 replica of the Claude Design handoff (`admin-ui-redesign-and-system`). The handoff is vendored rather than re-derived, so the shipped UI matches this design spec exactly.

- **Vendored CSS** — `apps/web/app/styles/superapp/{polaris,shell,pages,generate}.css`, linked in `app/root.tsx`. This is a self-contained, Polaris-aligned token system (NOT `@shopify/polaris`):
  - `--sa-*` brand tokens: `--sa-primary #1F3A5F`, `--sa-secondary #2F80ED`, `--sa-accent #0E9F6E` — identical to the Color section above.
  - `--p-*` surface/border/text/semantic tokens recreate Polaris neutrals (`--p-bg #F6F8FB`, `--p-surface #FFFFFF`, `--p-border #DCE3EC`, `--p-text #14213A`, …).
  - Fonts load via CDN `@import` — General Sans (Fontshare), Instrument Sans + IBM Plex Mono (Google) — matching the Typography section. Self-hosting remains a later optimization.
- **Shared foundation** — `apps/web/app/components/superapp/`: `icons.tsx`, `ui.tsx` (Btn, Badge, StatusBadge, Card, DataTable, Modal, Field, Input, Select, Toggle, Tabs, Banner, EmptyState, Toast, PageHead, FilterBar, StatTile, …), `page-helpers.tsx` (charts + `fmtCents/fmtNum/fmtMs/titleCase`), `placeholder-data.ts` (the deterministic placeholder layer used where real backend data isn't yet wired), `CommandPalette.tsx` (⌘K), `MerchantSubnav.tsx`.
- **Internal Admin shell** — `apps/web/app/routes/internal.tsx` renders `AdminChrome`: a collapsible left rail with sections **Overview · Operations · Platform · AI & Models · Catalog**, a top bar with global ⌘K search + notifications + avatar, a command-palette overlay, and a health footer. Auth (`requireInternalAdmin` / `internalSessionStorage`) and the loader are unchanged. Admin page primitives live in `app/components/admin/page-kit.tsx`; mutations route through `useAdminOps()` → `/internal/ops`.
- **Merchant shell** — top-level nav is **Shopify App Bridge** (`<s-app-nav>` in `root.tsx`): Dashboard · Build · Insights · Settings · Billing — rendered *outside* the embedded app in Shopify admin's left rail. Inside the app, `app/components/merchant/MerchantShell.tsx` wraps each page with the design's content frame, the ⌘K palette, a toast region, and `MerchantSubnav` (in-app sub-tabs: **Build** → Modules/Flows/Connectors/Data/Templates; **Insights** → Analytics/Activity). The design's own left rail is intentionally NOT rendered (it is replaced by App Bridge nav).
- **Fidelity rule:** these surfaces are an exact replica of the handoff. In QA mode, flag any divergence in flow, classnames, connectors, or layout from the vendored design.

## Data Visualization Rules (Polaris-aligned)
- **One chart, one question:** Each chart answers a single question (for example, "What are module publishes over time?").
- **Use real data shapes:** Test sparse, spiky, and high-volume data before shipping chart defaults.
- **Chart type guidance:** Column charts for <=30 time points, line charts for >30, horizontal bars for <=6 category comparisons, table fallback when category count grows.
- **Labeling:** Keep axis labels outside chart area, use short labels, and standard date abbreviations.
- **Color discipline:** Single series uses one key color; historical comparison uses current-color vs muted past-color; avoid rainbow bars unless datasets are semantically distinct.
- **Accessibility:** Every chart must have a nearby data table or textual summary; color must not be the only way to interpret results.

## Motion
- **Approach:** Minimal-functional.
- **Easing:** enter(ease-out), exit(ease-in), move(ease-in-out).
- **Duration:** micro(80-100ms), short(150-220ms), medium(220-320ms), long(320-500ms).

## Safe vs Risk Decisions
- **Safe choices:** Consistent grid shells, high-contrast neutrals, predictable table/form behaviors, restrained motion.
- **Intentional risks:** Distinct deep primary (`#1F3A5F`) instead of common bright SaaS blue; non-default font stack (General Sans + Instrument Sans) for a recognizable but pragmatic voice.

---

# Generated-Module Design System (the "Bible")

> Scope: this governs **AI-generated storefront modules** (popups, banners, sections, gamified widgets) — a different surface from the admin/merchant shells above. Goal: every generated module ships at Apple-level polish, is **mobile-first**, and is rendered through a **style pack** matched to the merchant's live storefront. **Full, citation-backed spec lives in [docs/design-system/research-dossier.md](docs/design-system/research-dossier.md)** (sections A–H, 20 tables). This section is the enforceable summary; the dossier is the source of truth for any number not repeated here.
>
> **Two compulsory foundations** (per product direction): (1) **Apple Human Interface Guidelines** is the non-negotiable floor for every module; (2) a **selectable style pack** layered on top, chosen to match the merchant's website. Reference quality bar: **hims.com / forhers.com** ("Editorial Wellness" pack). Rule: **mobile-first, desktop-second**, both flawless; **micro-interactions mandatory** on every generated module.

## Apple HIG — non-negotiable floor (every module, every pack)
`[AUTO]` = machine-checkable in the design-QA gate. Web mapping: 1 pt ≈ 1 px.

- **Touch targets** `[AUTO]`: every tappable element ≥ **44×44 px** (28×28 absolute min); ≥ 12 px gap between bezeled controls, ≥ 24 px around bezel-less.
- **Contrast** `[AUTO]`: body text (≤ 17 px) ≥ **4.5:1**; large (≥ 18 px) or bold ≥ **3:1**. Never color-alone — status conveyed by icon + text too.
- **Type floor** `[AUTO]`: body ≥ **16 px** mobile (11 px absolute); body weight ≥ **400** (no Thin/Light/Ultralight); ≤ **2 font families** (+ mono for numerals only). Hierarchy via weight/size/color, not new fonts.
- **Buttons** `[AUTO]`: ≤ **2 prominent (filled/accent)** buttons per view, exactly **1 primary**; preferred action differs by **style not size**; every custom button has a **press state**; **never** give a destructive action the Primary role; verb-first title-case labels.
- **Materials** `[AUTO]`: popups over imagery add a dimming **scrim ≥ 35%**; content surfaces holding body text stay ≥ ~85% opaque; translucent blur only for floating/sticky controls.
- **Motion** `[AUTO]`: durations within **80–500 ms** (micro 80–100, short 150–220, medium 220–320, long 320–500); easing enter `ease-out` / exit `ease-in` / move `ease-in-out`; entrance is **non-blocking + cancelable**; every module ships a **`prefers-reduced-motion`** branch (fades, no springs/z-axis).
- **Layout** `[AUTO]`: honor `env(safe-area-inset-*)`; no clipping at **200%** text scale; QA at **375×812** (primary) and **320×568** (stress). Content-first, leading-aligned, important items top/leading.

## Style packs — selectable, matched to the merchant store
Each pack is a **token grammar** (scale, radius, shadow, density, motion personality, imagery) applied **on top of** the merchant's extracted `StorePalette`/`StoreTypography` (from `theme-analyzer.service.ts`). Packs supply *grammar*; extraction supplies *brand colors/fonts*. They never override extracted brand colors by default; they all still satisfy the Apple HIG floor above.

| Pack | Type pairing | Density | Radius | Shadow | Motion | Accent | Pick when… |
|---|---|---|---|---|---|---|---|
| **Apple HIG Clean** | Geometric/system sans, weight-differentiated | Comfortable | sm8/md12/lg16 | Soft single-layer | System, minimal | Sparing, 1 accent | Neutral/cool, low-sat, white-heavy, sans heading — **or extraction failed (default)** |
| **Editorial Wellness** | Serif display + humanist sans (hims/forhers) | Airy | lg16/xl24/pill CTAs | Near-flat, warm-tinted | Calm, slow fades | Warm fields + pills | Soft/warm/calming store, serif heading, wellness/beauty/health |
| **Bold DTC** | Heavy grotesk + neutral sans | Compact-punchy | sm6/md10 | Hard offset / none | Snappy, slight overshoot | Saturated everywhere | Loud, high-contrast, saturated accent, heavy headings |
| **Minimal Luxe** | High-contrast serif/thin display + refined sans | Sparse | none–sm4 | Hairline only | Restrained, long fades | Mono + 1 deep accent | Near-monochrome luxury, serif/thin display, fashion/jewelry |
| **Playful Commerce** | Rounded sans display + rounded sans body | Cozy | lg16/xl24/full | Colored soft glows | Bouncy, confetti | Multi-accent, gradients | Bright, colorful, rounded, kids/toys/food/novelty |
| **Tech Utility** | Geometric sans + mono for data | Dense | sm6/md8 | 1px borders + tiny shadow | Fast micro-only | Cool accent, mono numerals | Cool/gridded/data-dense, blue-teal, electronics/SaaS |

**Selection** is automatic from derived aesthetic signals (bg luminance, accent saturation, hue family, palette spread, heading font class). Default to **Apple HIG Clean** when extraction fails or confidence is low; never silently pick a personality-heavy pack (Bold/Playful/Luxe) on low confidence — bias to the two "can't-look-wrong" packs (Apple HIG Clean / Editorial Wellness). Merchants can always override. Full heuristics: dossier §B3. Implemented in `apps/web/app/services/ai/style-packs.server.ts`.

> **Editorial Wellness sourcing caveat:** hims.com/forhers.com sit behind a Cloudflare bot challenge unreachable by a headless agent. That pack's palette is a **curated set in the brands' documented spirit** (warm off-white surface, soft terracotta/clay accent, muted sage), not pixel-sampled. Re-sample on an unblocked browser before treating any hex as official. (Dossier §C, Appendix.)

## Mobile-first responsive system
Design at **mobile first**, enhance up. Breakpoints: `mobile` 320–599 / `tablet` 600–1023 / `desktop` 1024–1439 / `wide` ≥ 1440. Fluid type via `clamp()` (Body `clamp(16px, 1.1vw, 18px)`, Display `clamp(28px, 4.5vw, 44px)`; full table dossier §E2). Inputs `font-size ≥ 16px` (prevent iOS zoom). Popups: **bottom-sheet/near-full card with a large close on mobile**, centered inset modal on desktop; primary CTA in the **thumb zone** on mobile. **No information or action may be hover-only** `[AUTO]`.

## Micro-interactions (mandatory on every module)
Minimum set every generated module must implement `[AUTO]`: **press** (F1), **focus-ring** (F3, never removed), **entrance** (F4), **success** (F5), **loading** (F6), **empty** (F7), **error** (F8). Success/error must use **icon + text**, not color alone; all must have a reduced-motion fallback. Optional: hover-raise, toggle, reveal, celebration/confetti (Playful default, opt-in elsewhere), scroll-cue. Full catalog with durations: dossier §F.

## Design-QA gate — "never a miss"
Every generated module's spec + render must pass all `[AUTO]` checks and carry no failed `[REVIEW]` flag before it ships. Run on 375×812 + 1280×720, light + dark, default + 200% type, default + reduced-motion. The spec-level subset (contrast, scrim, accessibility flags, motion bounds, palette/pack fidelity) is enforced in `apps/web/app/services/ai/design-qa.server.ts` and runs inside the generation pipeline; full-render checks (touch targets, overflow, 200% type) are dossier §G1 (1–24). **Operational "slop" definition:** a module is slop if it fails any G1 check or trips ≥ 2 of {arbitrary type sizes, > 2 fonts, hover-only behavior, color-only status, missing focus ring, gratuitous motion, rainbow/over-saturated palette, generic centered hero with vague copy, mismatched radii/shadows, off-brand hero image}. Generation **self-audits before returning** and regenerates on `[AUTO]` failure.

## Interactive widgets (e.g. gamified roulette) — platform gap
Generated `theme.section` recipes are **declarative data**; the storefront renderer ([superapp-theme-modules.liquid](extensions/theme-app-extension/blocks/superapp-theme-modules.liquid)) and in-app preview ([preview.service.ts](apps/web/app/services/preview/preview.service.ts)) are a **fixed template allowlist** (banner, notificationBar, popup=title/body/CTA, contactForm, effect, floatingWidget). They cannot render an interactive spinning wheel, per-segment odds, or a discount-code pool today — the popup branch ignores `config.blocks` and any win-rate field. A true spin-to-win is a **platform build, not a prompt change**: a first-class interactive-widget runtime + discount-code service + per-segment-probability schema. Full feature/data-model/backend spec (validated probabilities summing to 100; code sources single | uploaded list | auto-unique via Shopify) is in **dossier §H** — tracked as the interactive-runtime follow-up.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-29 | Initial design system created via `/design-consultation` | Optimize for "ease of access and very easy to use" across merchant app, internal admin, storefront extension surfaces, and docs touchpoints. |
| 2026-06-16 | Internal Admin + Merchant Dashboard rebuilt 1:1 from the Claude Design handoff; design system vendored as `styles/superapp/*.css` + `components/superapp/*` rather than raw Polaris | Lock visual parity with the approved handoff. Tokens map onto the existing color/typography spec, so brand fidelity is preserved while shipping pixel-exact shells (AdminChrome, MerchantShell + App Bridge nav + MerchantSubnav, ⌘K palette). |
| 2026-06-16 | Added the **Generated-Module Design System ("Bible")**: Apple HIG floor + 6 selectable style packs + mobile-first + mandatory micro-interactions + design-QA gate. Research dossier at `docs/design-system/research-dossier.md`; pack selection in `style-packs.server.ts`; QA gate in `design-qa.server.ts`; both wired into the generation prompt + validation path. | Generated modules had no enforced design system at generation or render time (colors from a fallback palette, loose style tokens, no QA) → "AI slop". The bible makes generation Apple-level and store-matched, and auto-audits every module so it's "never a miss". Apple HIG + hims/forhers set as the compulsory quality bar per product direction. |
