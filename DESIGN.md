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

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-29 | Initial design system created via `/design-consultation` | Optimize for "ease of access and very easy to use" across merchant app, internal admin, storefront extension surfaces, and docs touchpoints. |
