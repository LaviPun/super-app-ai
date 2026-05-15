# Failure Class Matrix

## Purpose

Map release failure classes to detection signals, user impact, auto-rescue behavior, and runbook ownership.

## Failure Classes

- **`POLICY_DENIED`**
  - Detection: publish policy result `allowed=false`
  - User impact: publish blocked before deploy
  - Auto-rescue: none (explicit user or config fix required)
  - Runbook: `docs/runbooks/publish-failure.md`

- **`FEATURE_FLAG_BLOCKED`**
  - Detection: feature topology decision `enabled=false`
  - User impact: publish blocked at gate
  - Auto-rescue: disable kill switch override after incident review
  - Runbook: `docs/runbooks/provider-outage.md`

- **`ROLLOUT_ABORT_ERROR_BUDGET`**
  - Detection: rollout decision `ABORT` from error/latency thresholds
  - User impact: partial rollout then rollback
  - Auto-rescue: rollback to previous published version
  - Runbook: `docs/runbooks/publish-failure.md`

- **`TRANSITION_INVALID`**
  - Detection: state machine transition assertion failure
  - User impact: release halted in current state
  - Auto-rescue: none, manual remediation
  - Runbook: `docs/runbooks/publish-failure.md`

- **`TELEMETRY_CARDINALITY_BUDGET_EXCEEDED`**
  - Detection: telemetry value replaced with `__cardinality_budget_exceeded__`
  - User impact: analytics detail loss, no customer-facing outage
  - Auto-rescue: tighten event detail keys and relaunch
  - Runbook: `docs/runbooks/provider-outage.md`

## Safeguard Exit Criteria Checklists

### Capability Graph + Allowlist

- [ ] Every module type maps to exactly one release surface.
- [ ] Target mismatch (`THEME` vs `PLATFORM`) is rejected.
- [ ] Required capabilities are present and plan-gated.

### Release State Machine + Progressive Publish

- [ ] Transition path follows canonical order.
- [ ] Canary starts before ramp/promote.
- [ ] Abort path always lands in rollback state.

### Rollback Budget

- [ ] Min sample size met before promote.
- [ ] Error-rate and latency thresholds enforce abort.
- [ ] Auto-rollback is executed when a prior version exists.

### Telemetry Budget

- [ ] Only allowlisted keys are emitted.
- [ ] Long values are clamped.
- [ ] High-cardinality keys hit budget guard when saturated.

