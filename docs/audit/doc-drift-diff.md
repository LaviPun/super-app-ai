# Doc Drift Diff (Phase 1)

Compared files:

- `docs/implementation-status.md`
- `docs/phase-plan.md`
- `README.md`

| Topic                | `implementation-status.md`                                                                    | `phase-plan.md`                                                                     | `README.md`                                                                        | Winner decision                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Test count           | Mentions 253 baseline and also older 163 references.                                          | Mentions 163 total tests.                                                           | No single total count published.                                                   | **Use `docs/audit/test-baseline.json` (347 total tests) as SSOT; then backfill all docs.** |
| Agent endpoint count | Claims 28 agent routes/endpoints.                                                             | No explicit count captured.                                                         | Agent API table enumerates 30 endpoints.                                           | **README wins for endpoint count (30).**                                                   |
| Phase 2 scope        | States Phase 2 complete with broad wording around theme compatibility and related capability. | Defines Phase 2 as Theme Compatibility Engine v1 (theme profiling + safe mounting). | Describes compiler + extension architecture, but no explicit phase scope contract. | **`docs/phase-plan.md` wins for phase-scope wording (narrower and clearer).**              |

## Baseline Metrics Summary

- Total test count (current run): **347** (`docs/audit/test-baseline.json`)
- Lint warning count (current run): **96**
- Eval pass-rate status (current run): **PASS** — schema **10/10 (100%)**, compiler **10/10 (100%)**, non-destructive **10/10 (100%)**
