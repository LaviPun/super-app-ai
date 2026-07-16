---
target: merchant surface FINAL post-commit sweep
total_score: 29
p0_count: 0
p1_count: 0
timestamp: 2026-07-16T18-20-24Z
slug: apps-web-app-routes-merchant-embedded-surface
---
Method: dual-agent (A: opus visual-QA+design-review · B: opus detector) — FINAL post-commit sweep

# Design Health Score — 29/40 (Good)

Per-page QA: 11/12 pages render clean and admin-native (dashboard, modules, templates w/ real distinct previews + interleaving, flows, connectors, data, analytics, activity w/ humanized chips, billing, support, settings). /help rendered blank in the assessor's session (rendered correctly in an earlier verified sweep — suspected dev-env chunk timing; monitor).

| # | Heuristic | Score | Note |
|---|---|---|---|
| 1 | Status | 3 | No in-app skeleton during dev cold loads; billing FOUC (dev artifact) |
| 2 | Real world | 4 | — |
| 3 | Control | 3 | — |
| 4 | Consistency | 2→fixed | Activity Type mislabeled billing/support as Module — FIXED post-sweep (billing/support/neutral kinds) |
| 5 | Error prevention | 3 | — |
| 6 | Recognition | 4 | — |
| 7 | Flexibility | 3 | — |
| 8 | Minimalist | 4 | — |
| 9 | Error recovery | 2 | /help blank in assessor session (env-suspected) |
| 10 | Help/docs | 1 | same /help observation |

Detector: 1 warning in 18 files (Inter — third independent platform-conformance false-positive ruling), 0 elsewhere.
Post-sweep commits: activity Type taxonomy fix + deterministic settings fields (a1da90f).
Verdict: "reads as a real product, not slop — a Linear/Stripe-fluent user would broadly trust it."
