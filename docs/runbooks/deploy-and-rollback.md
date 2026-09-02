# Deploy + Rollback

Operator procedure for shipping, verifying, and reverting a production deploy.
Command-first. Topology and deploy-flow background: `docs/operations.md` §1–2.

**STATUS (2026-09-02, post-ship sync):** deploys are Railway-native GitHub
auto-deploys from `master`, and **"Wait for CI" is now ENABLED** — the owner
ran Owner Step 1 below on 2026-09-02; `railway status --json` reports
`checkSuites` enabled on both `web` and `worker` in `production`. The
`PROD_BASE_URL` repo variable is also set, so the post-deploy smoke workflow
is live. (History: the 2026-09-02 DevOps audit had found `checkSuites: null`
on both services — a red master could deploy — after `docs/operations.md` §2
claimed the gate was already on. Owner Step 1 is kept below as the reference
procedure.)

---

## Owner Step 1 — enable "Wait for CI" (one-time, 2 minutes) — DONE 2026-09-02

Railway's config-as-code files (`apps/web/railway.*.toml`) only carry
`[build]`/`[deploy]` keys — `checkSuites` lives in the environment config, so
it is set via CLI or dashboard, not the repo:

```bash
railway environment edit --project superapp --environment production \
  --service-config web source.checkSuites true \
  --service-config worker source.checkSuites true \
  -m "Gate auto-deploys on CI check suites"

# verify (expect "checkSuites": true on web + worker):
railway status --json | grep -A2 checkSuites
```

Dashboard equivalent: Project **superapp** → environment **production** → each
of `web` and `worker` → Settings → Source → toggle **Wait for CI** on.

After this, a `master` push only deploys once every GitHub check suite on that
commit passes (the full `ci.yml` pipeline: lint/typecheck, tests, wasm
functions, liquid budget, theme-check, e2e, evals, build).

## Normal deploy flow

1. Merge PR to `master` (CI already ran on the PR).
2. CI runs again on the master push; Railway waits for it (after Owner Step 1),
   then builds `apps/web/Dockerfile` and rolls `web` + `worker`.
3. Boot runs `prisma migrate deploy` (see `apps/web/docker-start.sh`), then the
   Railway healthcheck gates cutover on `/healthz` (120s timeout).
4. `.github/workflows/post-deploy-smoke.yml` fires after CI completes: it polls
   `/healthz` until the new commit sha is serving (healthz echoes
   `RAILWAY_GIT_COMMIT_SHA` as `release`), then checks `/healthz`,
   `/healthz/deep` (queue/DLQ/cron/spend signals) and `/internal/login`.
   Failure files a GitHub issue labeled `ops-smoke-failure`.
   - Requires the `PROD_BASE_URL` repository **variable** (set 2026-09-02;
     self-skips when absent): repo → Settings → Secrets and variables →
     Actions → Variables → `PROD_BASE_URL` = the production web URL.

## Deploy failed (build or healthcheck)

```
1. Railway dashboard → superapp → production → web (or worker) → Deployments
   → open the failed deployment → Build/Deploy logs.
2. Build failure: the previous deployment keeps serving — no user impact.
   Fix forward on master.
3. Healthcheck failure: Railway does NOT cut over while /healthz is 503 —
   previous deployment keeps serving. Read deploy logs for the boot error
   (usually env validation: env.server.ts fails fast and prints the missing
   var by name — never its value).
4. If a bad build DID cut over, roll back (below).
```

## Deploy skipped by the CI gate

When CI fails on a master push, Railway (Wait-for-CI) marks that deployment
**SKIPPED** — and does NOT retry it when the CI run is later re-run green. The
post-deploy smoke workflow then fires on the green re-run and fails with
"new release never served", filing an `ops-smoke-failure` issue (this
happened: issue #49 for `413d376`). Remedy: push a new commit to master
(normal case — the next merge carries it), or trigger a manual redeploy in
the Railway dashboard (`web` + `worker`).

## Rollback

Rollback = **redeploy the previous good build**. No git revert needed to
restore service (do the revert afterwards, calmly).

```bash
# CLI: list deployments, redeploy the last SUCCESS before the bad one
railway deployment list --service web --json | head -50   # find the id
railway redeploy --service web  # redeploys latest; for an OLDER build use the dashboard:
```

Dashboard (works for any prior build): service → Deployments → previous
successful deployment → ⋮ → **Redeploy**. Do `web` first, then `worker`
(same image).

**Migrations under rollback:** migrations are additive-only (standing
invariant — columns/tables are added, never dropped or renamed in the same
release). The previous app version therefore runs correctly against the newer
schema; a rollback never requires a schema downgrade. Never run
`prisma migrate resolve --rolled-back` against production without a backup
restore plan (`restore-from-backup.md`).

**After any rollback:** re-run the smoke workflow manually (Actions →
post-deploy-smoke → Run workflow) and confirm `/healthz/deep` is green.

## Monitoring the deploy

- `/healthz` — liveness (db, redis, `release` sha).
- `/healthz/deep` — ops signals with thresholds (send `X-Cron-Secret`, or open
  it while logged into the internal admin). Signals + thresholds live in
  `apps/web/app/services/observability/ops-health.server.ts` (queue backlog
  25/100, stuck RUNNING 1/10, DLQ-24h 10/50, error spike 15min 25/100, cron
  staleness 15/60 min, AI daily spend 80%/100% of cap).
- Internal admin shows a warning/critical banner on any warn/fail signal
  (written by the cron sweep every 5 minutes — driven by the worker service's
  in-process scheduler; see `cron-not-ticking.md` if it goes stale) even with
  no alert keys set.
