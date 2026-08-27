# Release Dashboard Specification

## Purpose

Define the minimum release control dashboard for publish safety across Theme, Admin, Checkout, Functions, and customer-account surfaces.

## Primary Views

1. **Release Timeline**
   - `release_id`
   - `module_id`
   - `module_version_id`
   - `surface`
   - `state` (`generate -> preview -> publish -> stage -> verify -> promote/rollback`)
   - `actor`
   - `source`
   - `created_at`

2. **Progressive Rollout Health**
   - `stage` (`canary`, `ramp`, `promote`, `rollback`)
   - `sample_size`
   - `error_rate`
   - `p95_latency_ms`
   - `decision` (`PROCEED`, `HOLD`, `ABORT`)
   - `decision_reasons[]`

3. **Rollback Budget Panel**
   - `max_error_rate`
   - `max_p95_latency_ms`
   - `min_sample_size`
   - `remaining_error_budget`
   - `remaining_latency_budget`
   - `budget_status` (`healthy`, `degraded`, `exhausted`)

4. **Transition Audit Trail**
   - `actor`
   - `source`
   - `idempotency_key`
   - `from`
   - `to`
   - `result`
   - `error_class`
   - `metadata`

## Rollback Budget Defaults

- `min_sample_size`: `200`
- `max_error_rate`: `0.02`
- `max_p95_latency_ms`: `1200`
- Any stage exceeding error-rate or latency budgets triggers automatic rollback decision.

## Alerting

- Fire alert when:
  - release enters `rollback`
  - rollout decision is `ABORT`
  - feature-flag kill switch blocks a publish
  - telemetry cardinality budget starts emitting `__cardinality_budget_exceeded__`

## Follow-up Notes

- Dashboard route/component is implemented under `apps/web/app/routes/internal.release-dashboard.tsx`.
- TODO(p4c-followup): Backfill historical release transitions into a dedicated analytics table if long-term retention beyond audit logs is required.

## Data Contracts

- Dashboard consumes:
  - `RELEASE_TRANSITION` audit log records
  - publish job payload/result records
  - rollout policy evaluation output
  - feature flag decision output

