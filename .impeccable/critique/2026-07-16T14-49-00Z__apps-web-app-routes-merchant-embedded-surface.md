---
target: merchant embedded surface (Polaris WC)
total_score: 26
p0_count: 1
p1_count: 2
timestamp: 2026-07-16T14-49-00Z
slug: apps-web-app-routes-merchant-embedded-surface
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent)

# Design Health Score — 26/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Delete toast fires before the server responds (modules._index.tsx:189-194) |
| 2 | Match System / Real World | 2 | "Page Opened /templates" as merchant activity; shop domain title-cased as a first name |
| 3 | User Control and Freedom | 3 | Confirm-with-warning on delete, ticket reopen; zero undo anywhere |
| 4 | Consistency and Standards | 2 | Two module-type taxonomies — same module shows different type on dashboard vs /modules |
| 5 | Error Prevention | 2 | Pro→Starter downgrade executes silently (10,000→200 AI quota cliff) |
| 6 | Recognition Rather Than Recall | 3 | KPI "Escalated 1" vs badge "With the team" — user must map vocabularies |
| 7 | Flexibility and Efficiency | 3 | ⌘K, CSV export, filters; no bulk actions |
| 8 | Aesthetic and Minimalist Design | 3 | KPI tile row stamped on every page; on /modules it restates the visible list |
| 9 | Error Recovery | 2 | Renderer crash shows Chrome sad-face, no app error boundary/retry |
| 10 | Help and Documentation | 3 | Real Help page + field details; no contextual help from deep pages |
| **Total** | | **26/40** | **Acceptable — solid base, trust gaps** |

## Anti-Patterns Verdict
LLM assessment: passes at a glance (genuinely admin-native after the Polaris WC migration), fails within a minute of real use on 4 tells: domain-as-name greeting, raw telemetry in Recent activity, inconsistent module taxonomy, KPI-row-as-stamp.
Deterministic scan: 1 finding across 15 files — overused-font (Inter) in merchant.css:10, agreed FALSE POSITIVE (Shopify admin's own stack; platform conformance). Zero slop-pattern hits otherwise.
Browser overlays: skipped — auth-gated cross-origin admin iframe; injection impossible.

## Priority Issues
1. [P0] Renderer crash risk + no error boundary — templates gallery mounts up to 518 live srcDoc iframes, never unmounted, unbounded module-level previewCache (templates._index.tsx:140-215); /analytics & /flows showed sad-tab during review (some crashes may be dev-tunnel/HMR artifacts, but the unbounded iframe gallery is real). Fix: virtualize/unmount off-screen previews, cap cache, add app-level ErrorBoundary with retry. → /impeccable optimize + /impeccable harden
2. [P1] Placebo/optimistic actions — "Duplicate" only toasts, no operation (modules._index.tsx:348); delete toasts success pre-response, failures swallowed. Fix: implement or remove duplicate; drive toasts from fetcher.data (flows._index.tsx:258-263 is the in-repo correct pattern). → /impeccable harden
3. [P1] One module, two identities — designType() regex (dashboard/_index.tsx:104, analytics._index.tsx:14) vs real category (modules). Fix: single shared category util. → /impeccable clarify
4. [P2] Telemetry in merchant activity — filter PAGE_OPENED/REQUEST_* from dashboard feed or translate + dedupe (loader _index.tsx:54-59). → /impeccable clarify
5. [P2] Frictionless downgrade — confirm with quota-diff before changePlan on lower tier (billing._index.tsx:110,185). → /impeccable harden

## Persona Red Flags
Alex (power user): Insights dead-on-arrival during review; "Insights" button in s-section primary-action slot not visible live (verify slot support, _index.tsx:163); Duplicate placebo; template filter chips are buttons, not a filter idiom.
Sam (accessibility): StatTile deltas are ▴/▾ + green/red only, no aria-label (polaris.tsx:240-243) — WCAG 1.4.1; custom Tabs lack arrow-key roving focus + aria-controls (polaris.tsx:150-167); analytics sparklines aria-hidden with no text equivalent.

## Minor Observations
- Greeting should use shop name/owner (settings loader already fetches it, settings._index.tsx:31-44)
- "Made with ❤️ by Lavi" footer off-register inside Shopify admin
- "Billing history" tertiary renders as inert-looking text under "Change plan"
- Draft badge wraps on long module names in dashboard "Your modules" (pin badge with 1fr auto)
- Zero-state progress bars indistinguishable from empty; CSV lacks UTF-8 BOM

## Questions to Consider
1. If the register is "dense, no dead space," why does first-run lead with four zeros and an empty chart? Density should come from an activation path, not empty KPI chrome.
2. Is the 4-tile KPI row a system or a stamp — what would each page show if tiles had to earn their pixels?
3. Support sells a human team AND offers "Escalate to a human" — which story is the product telling?

## Strengths
- The migration is craftsmanlike: light-DOM CSS discipline, subnav centered on the s-page column, restrained chart palette.
- Support ticket detail is the model surface — honest state machine, humane copy, server-driven feedback.
- Real-data honesty: no fake sparklines, teaching empty states, fake settings tabs deleted.
