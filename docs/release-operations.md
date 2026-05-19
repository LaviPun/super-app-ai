# Release Operations

This note consolidates the release safety docs that used to live as separate matrices/spec files. Use it with [`slos.md`](./slos.md), [`runbooks/`](./runbooks/index.md), and the Internal Admin release/job views.

## Platform V2 deployment (Phase 18)

Target topology while Remix remains the embedded app of record:

| Service | Platform | Config | Health |
| ------- | -------- | ------ | ------ |
| `apps/frontend` | Vercel | `apps/frontend/vercel.json` | Build gate + API probe from home page |
| `apps/api` | Railway | `apps/api/Dockerfile`, `apps/api/railway.toml` | `GET /health`, `GET /ready` |
| `apps/workers` | Railway | `apps/workers/Dockerfile`, `apps/workers/railway.toml` | `GET /health`, `GET /ready` on `WORKER_HEALTH_PORT` |
| Legacy `apps/web` | Existing Fly/host | `apps/web/Dockerfile.internal-router` | Unchanged until cutover |

Environment matrices and RunPod/R2/observability variables: [`deployment/env-matrix.md`](./deployment/env-matrix.md).

Local gates before promoting a release candidate:

```bash
pnpm deploy:validate          # manifest + on-disk deploy artifacts
pnpm --filter @superapp/api test
pnpm --filter @superapp/workers test
pnpm test:deployment
pnpm deploy:smoke-health      # requires API + workers listening locally
```

CI stubs: `.github/workflows/v2-frontend-build.yml`, `v2-api-build.yml`, `v2-workers-build.yml`.

Rollback: promote the previous Vercel deployment; redeploy the prior Railway image for API/workers after queue drain; disable `FRONTEND_NEXT_ENABLED` / `FASTIFY_API_ENABLED` to keep traffic on Remix-only paths.

### Platform V2 staged rollback (Phase 21)

Use when a canary release of Next.js, Fastify, or BullMQ workers misbehaves. Full checklist: [`docs/gitbook/02-architecture/v2-migration/phase-21-rollout-cutover.md`](./gitbook/02-architecture/v2-migration/phase-21-rollout-cutover.md).

1. **Traffic back to Remix:** unset or set to `false`: `FRONTEND_NEXT_ENABLED`, `SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED`, `FASTIFY_API_ENABLED`.
2. **Stop async side effects:** unset worker flags (`AI_GENERATION_ASYNC_ENABLED`, `WEBHOOK_ASYNC_ENABLED`, `FLOW_ASYNC_ENABLED`, `CONNECTOR_WORKER_ENABLED`, `PUBLISH_WORKER_ENABLED`) and set `JOB_EXECUTION_MODE=inline` (or `disabled` to hard-stop enqueue).
3. **Drain workers:** pause Railway worker service or scale to zero after in-flight jobs complete; do not delete queued rows from the job ledger.
4. **Replay:** after fix, re-enable flags in the staging order from the migration plan; replay failed jobs from Internal Admin jobs view.
5. **Publish safety:** keep progressive publish / rollout policy services on Remix (`rollout-policy.service.ts`) as the authority until V2 publish is fully cut over.

Shared flag parser: `packages/platform-contracts/src/rollout-cutover.ts` (`parsePlatformV2RolloutFlags` — all flags default **off**).

## Release Safety Controls

| Control                               | Purpose                                                                                              | Owner                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| Capability graph + surface allowlist  | Ensure each module type maps to an allowed release surface and required capabilities are plan-gated. | Eng Platform         |
| Release state machine + feature flags | Keep publish transitions explicit and block invalid or unsafe transitions.                           | Backend Service Team |
| Rollback budget + progressive publish | Decide canary/ramp/promote/rollback using sample size, error rate, and latency.                      | SRE / On-call        |
| Transition audit trail + dashboard    | Persist who changed release state, why, and with what idempotency key.                               | Backend Service Team |
| Telemetry cardinality budget          | Keep release metrics useful without high-cardinality explosions.                                     | Backend Service Team |

Security/Governance is accountable for policy and allowlist governance. Product/Ops and Support are consulted or informed for staged rollout windows and customer impact handling.

## Release Dashboard Contract

The dashboard route is implemented at `apps/web/app/routes/internal.release-dashboard.tsx`.

Minimum views:

- **Release timeline:** `release_id`, `module_id`, `module_version_id`, `surface`, state (`generate -> preview -> publish -> stage -> verify -> promote/rollback`), actor, source, created time.
- **Progressive rollout health:** stage (`canary`, `ramp`, `promote`, `rollback`), sample size, error rate, p95 latency, decision (`PROCEED`, `HOLD`, `ABORT`), decision reasons.
- **Rollback budget:** max error rate, max p95 latency, minimum sample size, remaining error/latency budgets, budget status.
- **Transition audit trail:** actor, source, idempotency key, from/to states, result, error class, metadata.

Default rollback thresholds:

- `min_sample_size`: `200`
- `max_error_rate`: `0.02`
- `max_p95_latency_ms`: `1200`

Alert when a release enters rollback, a rollout decision is `ABORT`, a feature-flag kill switch blocks publish, or telemetry emits `__cardinality_budget_exceeded__`.

## Failure Classes

| Failure class                           | Detection                                                       | User impact                     | Auto-rescue                            | Runbook                                               |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `POLICY_DENIED`                         | Publish policy result `allowed=false`                           | Publish blocked before deploy   | None                                   | [`publish-failure.md`](./runbooks/publish-failure.md) |
| `FEATURE_FLAG_BLOCKED`                  | Feature topology decision `enabled=false`                       | Publish blocked at gate         | Disable override after incident review | [`publish-failure.md`](./runbooks/publish-failure.md) |
| `ROLLOUT_ABORT_ERROR_BUDGET`            | Rollout decision `ABORT` from error/latency thresholds          | Partial rollout then rollback   | Roll back to previous version          | [`publish-failure.md`](./runbooks/publish-failure.md) |
| `TRANSITION_INVALID`                    | State-machine transition assertion failure                      | Release halted in current state | None; manual remediation               | [`publish-failure.md`](./runbooks/publish-failure.md) |
| `TELEMETRY_CARDINALITY_BUDGET_EXCEEDED` | Telemetry value replaced with `__cardinality_budget_exceeded__` | Analytics detail loss only      | Tighten emitted detail keys            | [`provider-outage.md`](./runbooks/provider-outage.md) |

## Idempotency Scopes

| Scope                   | Idempotency key                              | Storage boundary                                           | Duplicate behavior                                              |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Webhook event           | `x-shopify-webhook-id`                       | `WebhookEvent` table                                       | Skip duplicate event processing.                                |
| Release publish attempt | `publish:<shop>:<module>:<version>:<target>` | `RELEASE_TRANSITION` audit entries + module active version | Mark as idempotent when already active.                         |
| Release stage step      | `<release_id>:<stage>`                       | Job payload + stage decision                               | Keep latest stage result; do not rerun succeeded stage.         |
| Connector HTTP call     | `<workflow_run_id>:<step_id>:<attempt>`      | Connector execution logs                                   | Retry with backoff; maintain same semantic action.              |
| Rollback trigger        | `<release_id>:rollback`                      | Activity log + module version pointer                      | Multiple rollback requests converge to the same target version. |

Connector retries are idempotent at orchestration level; external endpoints must still be validated for idempotent semantics.

## Safeguard Exit Criteria

- Every module type maps to exactly one release surface.
- Target mismatch (`THEME` vs `PLATFORM`) is rejected.
- Required capabilities are present and plan-gated.
- Transition path follows canonical order.
- Canary starts before ramp/promote.
- Abort path lands in rollback state.
- Minimum sample size is met before promote.
- Error-rate and latency thresholds enforce abort.
- Auto-rollback executes when a prior version exists.
- Telemetry only emits allowlisted keys, clamps long values, and guards high-cardinality values.
