# Cron Not Ticking

**Severity: SEV-2 → SEV-3** — nothing is down for merchants right now, but
everything time-driven silently stops: scheduled flows/messaging/httpSync,
parked workflow resumes, httpSync dead-letter replay, App Pricing plan
reconciliation, stuck-RUNNING job reconciliation, post-uninstall cleanup,
daily retention, and the ops-health snapshot/alerts the internal admin banner
is built on. The longer it lasts, the more merchant-visible it gets.

## How the tick is driven (read this first)

Since 2026-09 the **`worker` Railway service runs the scheduler in-process**
(`apps/web/scripts/worker.ts` → `services/jobs/cron-scheduler.server.ts`):
first tick ~30 s after boot, then every `CRON_TICK_INTERVAL_MINUTES` (default
5). One ticker at a time is guaranteed by a Redis lock
(`superapp:cron:tick-lock`, TTL = interval). `/api/cron` is the manual /
external trigger and shares that lock. `.github/workflows/cron.yml` still calls
`/api/cron` but GitHub schedules are best-effort (observed every 2–5 hours) —
it is a fallback, not the schedule. Full picture: `docs/operations.md` §Cron.

## Detect

- `/healthz/deep` → `cronHeartbeat` signal `warn` (≥ 15 min) or `fail`
  (≥ 60 min). `fail` also fires `OPS_HEALTH_DEGRADED` through `OpsAlertService`
  and shows the critical banner in the internal admin.
- `/internal/activity` filtered to actor `CRON`: expect a `CRON_TICK` row every
  interval. `CRON_TICK_FAILED` rows (outcome `failed` / `timeout` /
  `lock-unavailable`) mean the scheduler is alive but the tick is not
  completing.
- Post-deploy smoke (`post-deploy-smoke.yml`) fails on a 503 from
  `/healthz/deep` and files an `ops-smoke-failure` issue (that was #51).

```bash
curl -s -H "X-Cron-Secret: $CRON_SECRET" https://<prod-url>/healthz/deep | jq '.signals[] | select(.name=="cronHeartbeat")'
```

## Triage

```bash
railway logs --service worker --lines 200 --json | grep -E 'cron-scheduler|cron-tick'
```

| What you see | Meaning |
|---|---|
| no `[cron-scheduler] started` line after boot | scheduler never armed — check `CRON_SCHEDULER_ENABLED` on the worker (`railway variables --service worker --json \| jq keys`) and that the worker deploy is the current build |
| `disabled (CRON_SCHEDULER_ENABLED=false)` | kill switch is on; either an external scheduler is supposed to be driving `/api/cron` (verify it actually is) or flip it back |
| `tick skipped — lock held by another ticker` every slot | a stale lock: another replica / `/api/cron` caller mid-tick, or a crashed ticker whose TTL hasn't expired (max one interval); persistent → check Redis for the key |
| `cron lock unavailable — tick skipped` | Redis is down or unreachable from the worker → `redis-down.md`; ticks resume by themselves once Redis is back |
| `tick timed out — abandoning wait` | one sweep is hanging past `interval − 30 s`; the `ErrorLog` row carries the `cron_…` correlation id — find which sweep via the `[cron-tick] … failed` warnings that share it |
| `tick failed` | `runCronTick` itself threw (should be rare — every sweep has its own catch); `ErrorLog` has the stack |
| ticks complete but `cronHeartbeat` stays stale | the ops-health sweep (the heartbeat writer, last in the tick) is failing: look for `[cron-tick] ops-health sweep failed — heartbeat NOT written` and the `AppSettings` upsert error behind it |

## Contain

Run a tick by hand — this is also the fastest way to confirm the sweeps
themselves are healthy while you investigate the scheduler:

```bash
curl -sS --fail-with-body -H "X-Cron-Secret: $CRON_SECRET" https://<prod-url>/api/cron | jq .
```

`{ "skipped": "locked" }` means the worker (or another caller) is mid-tick —
the scheduler is working; wait one interval and re-check the heartbeat.
Anything else returns the per-sweep results and writes the heartbeat.

If the worker is wedged: Railway → worker → Restart. The first tick lands
~30 s after boot; the heartbeat should go `ok` within a minute.

## Fix

1. Scheduler disabled by mistake → set `CRON_SCHEDULER_ENABLED=true` (or
   remove it) on the worker and redeploy.
2. Redis outage → `redis-down.md`; no action on the scheduler side.
3. A single sweep hanging/failing every tick → fix that sweep (the tick is
   designed so one failing sweep never blocks the others, but a *hanging* one
   burns the whole budget). Its correlation id links `ErrorLog`, `ApiLog`, and
   `FlowStepLog` rows.
4. Need a temporary external schedule (e.g. worker service paused) →
   `workflow_dispatch` `cron.yml`, or any scheduler calling `/api/cron` with
   the header; the lock keeps them from overlapping when the worker returns.

## Verify

```bash
curl -s -H "X-Cron-Secret: $CRON_SECRET" https://<prod-url>/healthz/deep | jq '.signals[] | select(.name=="cronHeartbeat")'
# → { "status": "ok", "value": <minutes since last tick, < 15> }
```

and `/internal/activity` (actor `CRON`) shows a fresh `CRON_TICK` row each
interval.

## Post-mortem

Was the tick silently *not running* (scheduler) or *failing* (a sweep)? The
first should never be silent again — the heartbeat signal exists precisely to
turn "nothing happened" into a page. If a sweep hung, add a bound inside it;
the scheduler's timeout is the backstop, not the fix.
