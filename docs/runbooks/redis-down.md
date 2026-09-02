# Redis Down / Unreachable

**Severity: SEV-2** — the app keeps serving reads/writes (Postgres is the
system of record) but rate limiting and queue-mode job processing degrade.

## Blast radius (what actually breaks)

| Consumer | Behavior when Redis is down |
|---|---|
| `/healthz` | 503 (`redis: "fail"`) when `REDIS_URL` is set → Railway healthcheck fails new deploys; external monitors page. |
| Rate limiting (`services/security/rate-limit.server.ts`) | Degrades — check its own fallback; watch for 429 anomalies. |
| Job queue (`JOB_EXECUTION_MODE=queue` only) | BullMQ enqueue/consume fails; Job rows stay QUEUED. **Default mode is `inline`** (jobs run in-process) — in inline mode a Redis outage does NOT stop job execution. |
| Preview export queue | Same queue seam; falls back per `PREVIEW_EXPORT_QUEUE_ENABLED` wiring. |

## Triage

```bash
railway logs --service Redis --lines 100 --json
railway metrics --service Redis --since 1h --json     # memory ceiling? eviction?
curl -s https://<prod-url>/healthz                     # redis: fail vs ok
```

Redis here persists via `--save 60 1` on a Railway volume — a restart loses at
most ~60s of queue state; Job rows in Postgres are the recovery source.

## Fix

1. Railway dashboard → Redis → Deployments → Restart (or `railway restart --service Redis`).
2. If memory ceiling: check `QUEUE_*` prefixes for unbounded growth
   (`removeOnFail: false` on the ops queue keeps failed BullMQ entries —
   replay + clean via /internal/jobs).
3. After recovery, the stuck-job sweep (`/api/cron`, every tick) reconciles
   any Job rows orphaned RUNNING; queued-but-lost BullMQ entries surface as
   stuck QUEUED rows in `/healthz/deep` (`queueBacklog`) — replay from
   `/internal/jobs`.

## Verify

```bash
curl -s https://<prod-url>/healthz                    # redis: ok
curl -s -H "X-Cron-Secret: $CRON_SECRET" https://<prod-url>/healthz/deep  # queueBacklog: ok
```
