# runbooks

Incident runbooks for the most common failure modes, each following the same Detect → Triage → Contain → Fix → Post-mortem structure. Start at [`index.md`](./index.md) for the full list and the severity ladder.

`docs/operations.md` owns topology, the SLO pointer, and the "which runbook do I reach for" index — it references these runbooks rather than duplicating their step-by-step procedures. (`docs/operations.md` lands via WS-J Task 8, renamed from `docs/release-operations.md`; if it does not exist yet at the path you're reading this from, that task hasn't landed on this branch.)
