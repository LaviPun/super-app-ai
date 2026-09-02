# Postgres Down / Unreachable

**Severity: SEV-1** — the app cannot serve merchants without its system of
record. Detect → Triage → Contain → Fix → Post-mortem.

## Detect

- `/healthz` returns 503 with `checks.db: "fail"` (UptimeRobot/healthchecks.io
  page if configured; `post-deploy-smoke` issue if it hit a deploy window).
- Railway restarts `web`/`worker` in a loop (`restartPolicyType = ON_FAILURE`).
- Flood of `PrismaClientInitializationError` / `ECONNREFUSED` in deploy logs.

## Triage (5 minutes)

```bash
railway status --json | head -30                      # is the Postgres service running?
railway logs --service Postgres --lines 100 --json    # OOM? disk full? restart loop?
railway metrics --service Postgres --since 1h --json  # memory/disk pressure
curl -s https://<prod-url>/healthz                    # confirm from outside
```

Most likely causes, in order: Railway Postgres restarting (check its
Deployments tab), volume disk full, connection-pool exhaustion (app-side
`too many connections`), Railway platform incident (status.railway.com).

## Contain

- The app fails loudly on its own: routes 500 with correlation ids, jobs stay
  QUEUED (nothing silently drops). No action needed to "pause" traffic.
- If only connections are exhausted: `railway restart --service web` (bounces
  the pool) — check for a connection leak afterwards in `ErrorLog`.

## Fix

- Postgres service crashed → Railway dashboard → Postgres → Deployments →
  Restart. Watch `pg_isready` in its logs.
- Disk full → dashboard → Postgres → volume → grow it; then
  `VACUUM` the biggest tables (`ApiLog`, `ActivityLog`, `WebhookEvent` are the
  growth tables; retention sweeps exist but verify they ran —
  `/internal/activity`).
- Unrecoverable data → `restore-from-backup.md` (SEV-1 path).

## Verify recovery

```bash
curl -s https://<prod-url>/healthz          # ok: true, db: ok
curl -s -H "X-Cron-Secret: $CRON_SECRET" https://<prod-url>/healthz/deep
```

Then check `/internal/jobs` for the backlog the outage queued: replay DLQ
entries per `webhook-storm.md` §replay if needed.

## Post-mortem

ErrorLog + ApiLog around the window; note data-loss span (if restored) and
whether the healthz page actually paged a human — if it didn't, fix the
monitor before closing the incident.
