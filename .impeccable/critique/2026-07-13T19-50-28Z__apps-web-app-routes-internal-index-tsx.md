---
target: internal admin dashboard (internal._index.tsx)
total_score: 28
p0_count: 1
p1_count: 2
timestamp: 2026-07-13T19-50-28Z
slug: apps-web-app-routes-internal-index-tsx
---
Method: dual-agent (A: design-review · B: detector+evidence)

# Critique — Internal Admin Dashboard (`apps/web/app/routes/internal._index.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Refresh spinner + toast + live footer health, but no "as of" timestamp and no auto-refresh — snapshot silently goes stale mid-incident |
| 2 | Match System / Real World | 3 | Excellent ops lexicon (DLQ, MRR, ARPU); docked hard for inverted delta semantics — rising Errors/Cost render as green "up" |
| 3 | User Control and Freedom | 2 | List rows navigate via `<div onClick>`/`ctx.go` with no real `href` — no middle-click, open-in-new-tab, or deep link |
| 4 | Consistency and Standards | 3 | Strong token discipline; but card CTAs are real `<a>` while list-row nav is `<div onClick>` — two mechanisms for the same intent |
| 5 | Error Prevention | 3 | Guarded EmptyStates + null-safe formatting, but the loader's 22-query `Promise.all` is unguarded (shell guards each query, this doesn't) |
| 6 | Recognition Rather Than Recall | 3 | Metrics labeled with sub-context; Sparkline shows no values, forcing magnitude estimation |
| 7 | Flexibility and Efficiency | 3 | ⌘K, collapsible nav, 14d/30d toggle; capped by non-linkable, keyboard-unreachable rows |
| 8 | Aesthetic and Minimalist Design | 4 | Tabular rhythm, restrained color, tone-mapped semantics, no ornament — density with clarity. Best dimension |
| 9 | Error Recovery | 2 | No route ErrorBoundary; unguarded loader means a partial data failure = full-page 500 |
| 10 | Help and Documentation | 2 | "Ask the assistant" CTA helps; no inline metric definitions/tooltips, and card titles are non-semantic `<div>` |
| **Total** | | **28/40** | **Good — solid honest instrument, upper-middle band** |

## Anti-Patterns Verdict

**Not AI slop.** This reads as a purpose-built instrument, not a generated template. Domain-specific vocabulary drives composition (DLQ depth, webhook success %, symptom→trace drill-down), the layout has real compositional variety (4-col StatTiles → two horizontal KPI strips → asymmetric 1fr/340px splits — explicitly not the banned identical-card-grid), and the palette is a deliberate anti-blue deep slate (`#1F3A5F`), matching the PRODUCT.md anti-reference against generic bright-blue SaaS.

**Deterministic scan:** detector clean on the route file (exit 0, zero findings). On the backing CSS it flagged 2 warnings, both **off-target false positives**: `bounce-easing` at `pages.css:114` (a 3-dot chat typing indicator on the assistant page, not elastic easing, not the dashboard) and `layout-transition` at `shell.css:45` (`.admin-nav { transition: width }` — accepted sidebar-collapse pattern in the shell chrome). Grep corroboration surfaced the real (minor) items: one hard-coded hex `#1F3A5F` at `internal._index.tsx:558` (Avatar color), raw hex literals in `pages.css:41`, and the `.kpi-band-label` uppercase-tracked eyebrow at `pages.css:131`.

**Both assessments agree** the page is clean of every major ban; the single slop-adjacent tic is the two uppercase band labels ("Revenue & growth" / "Reliability & cost"), defensible as functional instrument labels but the closest the page comes to the eyebrow pattern.

**Visual overlays:** none available. Browser injection was skipped — the authenticated app requires a database + internal SSO and has no reachable localhost render in this environment. All evidence is static (detector + source review).

## Overall Impression

Competent dashboard-kit made genuinely specific by its content and its correct density bet. It nails the hardest thing PRODUCT.md asks for — density with clarity — and implements the "symptom → trace → fix" thesis in the actual markup. What holds it back is a cluster of correctness/robustness gaps that bite exactly at incident time: an inverted delta color that dresses rising errors as good news, an unguarded loader that 500s the whole diagnostic page on one bad query, and rows that keyboard/screen-reader operators can't reach. The single biggest opportunity: make the page answer its own headline question ("is the fleet healthy?") in one honest glance before the operator scans 13 tiles.

## What's Working

1. **Honest icon+text status everywhere — real WCAG color-alone compliance.** `StatusBadge` always pairs a colored dot with a text label; Donut and Plan-mix legends list every segment as swatch + label + numeric value, so no chart is read by color alone. Done consistently, not selectively.
2. **Drill-down architecture matches the product thesis.** Every metric links to its detail surface, and the error path is trace-aware (`correlationId` → trace, else log id, line 618). "One pane of glass" is implemented, not just claimed.
3. **Disciplined density with tabular rhythm.** `tabular-nums` on every value, a single tile scale, tone-mapped semantic backgrounds, guarded empty states on all six cards — dense without tipping into the "cramped gray Bootstrap" anti-reference.

## Priority Issues

**[P0] Delta color/direction semantics are inverted for "bad-when-rising" metrics.** `deltaProps` (lines 266–269) maps any positive delta to green `up`, applied blind to Errors (24h) and API cost (24h) tiles (lines 400–409). Rising errors render green-up; falling render red-down. Violates Nielsen #2 and the "honest about state" promise — on a fleet console, an error spike is dressed as good news at the exact moment an operator needs alarm. *Fix:* give each metric a `polarity` (`good-up`/`good-down`); choose tone by whether the movement is good, keep the arrow pointing in the true direction (rising errors = red up-arrow). *Command:* `/impeccable clarify`, backed by `/impeccable harden`.

**[P1] The primary ops page has an unguarded loader (one query failure → full 500).** Lines 59–123 run ~22 Prisma queries in a single `Promise.all` with no per-query `.catch`, unlike `internal.tsx:45–52` which guards each count so a missing table degrades to 0 rather than 500ing the shell. One slow/failing table takes down the entire incident-response surface. *Fix:* mirror the shell's `.catch()` pattern and add a route `ErrorBoundary` that renders a degraded shell. *Command:* `/impeccable harden`.

**[P1] List rows aren't real links and aren't keyboard-operable.** `.ritem` rows (Store health line 557, Latest errors line 618) and DataTable `<tr>` navigate via `onClick` on a non-focusable element with no `href`/`role`/`tabIndex`. Breaks the WCAG 2.2 AA "fully keyboard-operable with visible focus" commitment — a keyboard/screen-reader operator cannot reach any store-health or error row — and costs power users middle-click/open-in-new-tab for parallel triage. *Fix:* render row nav as real `<a href={superappRoute(...)}>` (destinations already exist), or add `role="link"` + `tabIndex={0}` + Enter/Space + `:focus-visible`. *Command:* `/impeccable harden`, supported by `/impeccable polish`.

**[P2] No `prefers-reduced-motion` branch on the admin surface.** It exists only in `generate.css` (merchant-generation surface). Admin hover transforms, the refresh spinner, `toastIn`/`modalIn`, and the nav width transition have no reduced-motion fallback — violating both PRODUCT.md ("honor prefers-reduced-motion for all transitions") and DESIGN.md line 97. *Fix:* add a global `@media (prefers-reduced-motion: reduce)` block neutralizing transforms/animations to opacity-only. *Command:* `/impeccable animate` (reduced-motion pass) or `/impeccable harden`.

**[P2] No data-freshness signal / no auto-refresh.** The dashboard renders a loader snapshot with only a manual Refresh; nothing shows *when* data was captured. During a recovery an operator can't distinguish live-zero from stale-zero — eroding the "trust the numbers" contract. *Fix:* add "Updated {rel(loadedAt)}" next to Refresh (stamp `now` server-side) and consider a 30–60s `revalidator` interval. *Command:* `/impeccable clarify`.

**[P3] Card titles carry no heading semantics.** `CardHead` renders titles as `<div className="t-h3">`; the page has one real `<h1>` and zero semantic subheadings across six cards, so screen-reader users get no landmarks. *Fix:* render `CardHead` title as `<h2>`/`<h3>` (keep the class for styling). *Command:* `/impeccable typeset` / `/impeccable harden`.

## Persona Red Flags

**Alex (power user):** cannot open a store-health or error row in a new tab (`.ritem` is `<div onClick>`, no `href`) — parallel triage of several failing stores is impossible; the AI Sparkline gives no values or hover tooltip; no keyboard shortcut for Refresh or the 14d/30d toggle.

**Sam (accessibility-dependent):** all list-row navigation is keyboard-unreachable (worst a11y failure on the page); the `.seg` 14d/30d buttons put `aria-selected` on bare `<button>`s with no `role="tab"`/`tablist` (invalid, may not announce); no reduced-motion branch; no heading structure below `<h1>`; `.seg`/`.btn-sm` controls are 28px tall, under the 44px target-size guidance.

**On-call operator, mid-incident (project persona):** the delta inversion (P0) is most dangerous here — a doubling of errors shows a green up-arrow; no freshness timestamp means they can't tell if "DLQ: 0" is live or stale; if the incident *is* a database problem, the unguarded loader 500s the very tool they'd diagnose it with; and the synthesized "Attention needed" verdict lives only in the sidebar footer, not the dashboard body where their eyes land first.

## Minor Observations

- `errors30d` is silently capped at 13 (`Math.min(..., 13)`, line 224) before feeding the health score — an undocumented magic number that flattens the worst offenders (200 errors scores identically to 13).
- Redundancy: `trialStores` appears in both the "Active stores" sub and the "Active trials" KPI; AI cost shows as both a 24h tile and a 30d KPI (defensible different windows).
- The 5-cell Reliability KPI strip exceeds the ≤4-per-group chunking rule and wraps unpredictably (~1100px) where the `:nth-child(-n+6)` border logic assumes a specific wrap.
- Donut center reuses `t-h1` on a `<div>` with inline `fontSize` overrides — class name implies a heading it isn't.
- Primary CTA is "Ask the assistant" (magic-toned) — debatable emphasis on a health dashboard versus an operational action.

## Questions to Consider

1. Should the page open with a single bold honest status sentence, so an operator resolves "is the fleet healthy?" *before* scanning 13 tiles?
2. If a delta arrow can point up while the news is bad, is the color-coded chevron earning its pixels — or would "▲ 42% worse" (direction + judgment in words) be more honest on an instrument that promises to be "honest about state"?
3. For users who "trust the numbers to be real," is a manual-refresh snapshot with no capture time defensible mid-incident?
4. Are the two uppercase band labels pulling real weight, or would spatial grouping + card titles carry it without the eyebrow styling?
5. What is the *one* signature element that would make this unmistakably THE fleet console rather than "a good admin dashboard" — a live status headline, value-bearing sparklines, an incident-mode toggle?
