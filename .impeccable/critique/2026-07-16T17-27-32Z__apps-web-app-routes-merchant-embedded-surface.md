---
target: merchant embedded surface (Polaris WC) re-score
total_score: 33
p0_count: 0
p1_count: 0
timestamp: 2026-07-16T17-27-32Z
slug: apps-web-app-routes-merchant-embedded-surface
---
Method: dual-agent (A: opus design-review sub-agent · B: opus detector sub-agent) — RE-SCORE after fix round

# Design Health Score — 33/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of status | 3 | No skeletons on heavy cold loads; raw IDs in activity |
| 2 | Match real world | 3 | cuid paths rendered verbatim in activity |
| 3 | User control & freedom | 4 | — |
| 4 | Consistency | 3 | /activity unfiltered vs dashboard; boundary coverage uneven |
| 5 | Error prevention | 3 | 10 routes lacked crash boundary |
| 6 | Recognition over recall | 4 | — |
| 7 | Flexibility & efficiency | 4 | — |
| 8 | Aesthetic & minimalist | 3 | Activity noise; homogeneous wholesale template cluster |
| 9 | Error recovery | 3 | Boundary on 16/27 routes only |
| 10 | Help & docs | 3 | — |

## Anti-Patterns Verdict
NOT SLOP — "a Linear/Stripe-fluent user would trust this." Detector: 1 finding (Inter, platform-conformance false positive), 0 elsewhere incl. new files.

## Remaining issues
- P2 ErrorBoundary gap: templates.$templateId, connectors.$connectorId, data.$storeKey, flows.build.$flowId, flows.templates, modules.$moduleId_.captures, advanced, jobs, logs, picker
- P2 /activity telemetry noise: ActivityLogService.list()/route loader lacks NON_MERCHANT_ACTIONS filter
- P3 raw resource cuids in activity feeds
- P3 templates "All" ordering leads with homogeneous wholesale cluster

## Strengths
Billing best-in-class (quota-diff downgrade confirm); copy/taxonomy discipline (Maya persona, one taxonomy); accessibility depth (roving tabs, aria deltas, sr-only chart summaries).
