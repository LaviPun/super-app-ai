# Postgres Migration Runbook (SQLite-Compatible)

> **EXECUTED 2026-08-24 (WS-A).** Production runs Postgres on Railway; local dev
> runs Postgres via `docker-compose.dev.yml` (`postgresql://superapp:superapp@localhost:5433/superapp?schema=public`).
> SQLite is retired (dev.db kept as rollback artifact until WS-S burn-in — see
> "Laptop is no longer load-bearing" below). Deviation from the plan below:
> sqlite migrations were archived (`prisma/migrations-archive-sqlite-20260824/`)
> and a single Postgres baseline (`20260823214710_baseline_postgres`) was
> regenerated, rather than an additive migration on sqlite history. Data copy
> script: `apps/web/scripts/migrate-sqlite-to-postgres.ts` (`pnpm run
> db:copy-sqlite`).
>
> **Cutover verification (Task 8, 2026-08-24):** all 49 Prisma models verified
> matching source vs target across two runs (source `dev.db` from the main
> checkout, copied read-only, SHA-256-verified unchanged before/after: run 1
> populated the target, run 2 proved idempotence — `createMany({
> skipDuplicates: true })` no-op'd on every already-present row, verify output
> byte-identical between runs). 20 non-empty models matched exactly (notably
> ActivityLog 1425, ErrorLog 125, ApiLog 75, AiUsage 45, Shop 1, Module 2); the
> remaining 29 were `0`/`0` in both. Zero mismatches, no retries needed. Full
> per-table counts and logs: `.superpowers/sdd/2026-08-24-ws-a-hosting/task-8-report.md`
> (logs under the Task 8 worktree's gitignored `.scratch/task-8/`, not
> committed). **Correction to that report's wording:** the "re-counted
> independently via `sqlite3 prisma/dev.db`" step ran against the hash-verified
> **read-only copy** of dev.db (`.scratch/task-8/dev.db`, `chmod 444`), not the
> original checkout file — the original was never opened by anything but the
> migration script's own `better-sqlite3 readonly` handle, and its SHA-256 was
> unchanged before/after the whole run.
>
> **Backup stopgap (Task 12):** since Railway's daily-backup dashboard toggle
> is still not enabled (below), `.github/workflows/db-backup.yml` runs a
> nightly `pg_dump` and uploads it as a 30-day GitHub Actions artifact — the
> free Hobby-plan answer. It needs the owner to set a `DATABASE_BACKUP_URL`
> repo secret (a Postgres connection string reachable from GitHub's runners,
> e.g. the TCP-proxy URL `viaduct.proxy.rlwy.net:33079` noted below, ideally
> scoped to a read-only role); until set, the workflow no-ops with a loud
> `::warning::` instead of failing.
>
> **Topology:** Railway project `superapp` — services `web`, `worker`,
> Postgres (daily backups, 7-day retention **— owner must still enable this via
> the dashboard; not yet done as of this record**), Redis; domain
> `https://web-production-3fe27.up.railway.app`. Postgres additionally has a
> **public TCP proxy** (`viaduct.proxy.rlwy.net:33079`, created during Task 8
> because Task 7's provisioning had not enabled one) — this is how the
> migration script reached the database from a laptop; production `web`/`worker`
> use the internal `postgres.railway.internal` `DATABASE_URL` and never touch
> the public proxy. **Owner follow-up, not performed by this WS (explicitly
> out of scope — DB password rotation is separately scheduled):** rotate the
> Postgres password — Task 8 hit a credential-exposure incident where the
> internal `DATABASE_URL` (host + user + full password) was printed in plaintext
> to a session transcript by a redaction bug in an early exploratory command
> (details in the Task 8 report). The `*.railway.internal` host isn't reachable
> outside Railway's private network, but the password itself should still be
> rotated since it's shared across `DATABASE_URL`/`PGPASSWORD`/`POSTGRES_PASSWORD`.
>
> **Config-as-code note:** Railway's `railway.web.toml` / `railway.worker.toml`
> / `railway.internal-router.toml` (build/deploy/restart-policy config as code,
> Task 6/7) are NOT currently the live source of truth for the `web`/`worker`
> services' settings — those services were provisioned via the Railway CLI
> directly (`railway environment edit` JSON patches replicating the toml files'
> build/deploy settings field-for-field, per Task 7), and the toml files were
> added descriptively alongside. Task 7 found no CLI field to point a service at
> a config-as-code file path — that's a dashboard-only setting (Settings →
> Config-as-code, one per service) an owner still needs to set for the toml
> files to become the actual source of truth going forward. Until then, treat
> the toml files as the intended/documented config; live deploy behavior is
> governed by whatever is set directly on each service (functionally identical
> to the toml files today, per Task 7's field-by-field verification, but not
> wired through the toml files themselves).
>
> Postgres-vs-sqlite test deltas found during cutover: none — the full
> `pnpm --filter web test` suite (2169 tests / 200 files) passes identically
> against the Postgres-backed local dev instance as it did pre-cutover.

This runbook prepares `apps/web` for Postgres while keeping local SQLite behavior unchanged.

## Goals

- Keep local development on SQLite by default.
- Allow Postgres readiness via environment switch.
- Avoid destructive migrations during rollout.

## Environment Strategy

`DATABASE_URL` remains environment-driven, while Prisma 5.x requires a literal
provider in `schema.prisma`.

- **Local default (post-cutover, current state): `provider = "postgresql"`** +
  `DATABASE_URL` pointing at the `docker-compose.dev.yml` Postgres instance.
  SQLite is retired; the section below is kept for historical/rollback
  reference only (see the EXECUTED note above).
- ~~Postgres cutover: flip provider to `"postgresql"` in a dedicated migration
  PR and set `DATABASE_URL` to Postgres in the target environment~~ — done,
  2026-08-24.

### Local development (default, current)

```bash
DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public"
```

Start the local Postgres with `docker compose -f docker-compose.dev.yml up -d`.

### Local development (historical — pre-cutover SQLite default)

```bash
DATABASE_URL="file:./dev.db"
```

### Postgres environments

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public"
```

## Non-Destructive Migration Plan

1. **Baseline validation (SQLite)**
   - Run `pnpm --filter web exec prisma validate`.
   - Run `pnpm --filter web exec prisma generate`.
2. **Prepare Postgres migration branch**
   - In `apps/web/prisma/schema.prisma`, change datasource provider from
     `"sqlite"` to `"postgresql"`.
   - Set Postgres `DATABASE_URL` in your shell/session.
3. **Create additive-only migration**
   - Use `pnpm --filter web exec prisma migrate dev --create-only --name <descriptive_name>`.
   - Confirm migration SQL is additive (new tables/columns/indexes only).
4. **Review SQL before apply**
   - Reject any `DROP`, destructive `ALTER`, or irreversible data rewrite.
5. **Apply in staging first**
   - Run `pnpm --filter web exec prisma migrate deploy`.
   - Run smoke tests and targeted data-path checks.
6. **Production rollout**
   - Apply the same reviewed migration with `prisma migrate deploy`.
   - Monitor errors/latency and DB health during rollout window.

## Risks and Mitigations

- **Type/behavior differences (SQLite vs Postgres):**
  - Verify date/time, string comparison, and JSON serialization paths in staging.
- **Query/index drift under production load:**
  - Add explicit indexes for hot filters before scale-up.
- **Provider mismatch between code and environment:**
  - Ensure the provider flip and Postgres `DATABASE_URL` are deployed together.
- **Connection/config mistakes:**
  - Validate connection string and credentials in a canary environment first.
- **Data integrity during backfills:**
  - Use idempotent scripts and chunked backfills; avoid in-place destructive rewrites.

## Rollback Plan

Use a two-layer rollback approach:

1. **Application rollback (fast path)**
   - Revert app deploy to previous release.
   - Keep DB schema additive so old code remains compatible.
2. **Database rollback (only if required)**
   - Restore from pre-migration backup/snapshot.
   - Re-apply only known-safe additive migrations after incident review.

Do **not** roll back by dropping recently added columns/tables in production unless a full restore is approved.

## Validation Checklist

- `prisma validate` passes in the default SQLite state and in the Postgres-cutover branch.
- `prisma generate` succeeds.
- Existing local workflow still uses SQLite defaults.
- Staging migration completes with no destructive SQL.

## Railway Topology (Task 7, WS-A — provisioned 2026-08-24)

Full topology detail lands in Task 12; this is the pointer record.

- **Project**: `superapp` (workspace: Lavi Pun's Projects, project ID `99b98c6c-4c47-4b24-bf73-0e5a7fabdb21`, environment `production`)
- **Services**: `web` (GitHub-connected, `LaviPun/super-app-ai` @ `master`, Dockerfile `apps/web/Dockerfile`), `worker` (same repo/branch, startCommand `pnpm --filter web worker:start`), `Postgres` (managed), `Redis` (managed)
- **Web domain**: `https://web-production-3fe27.up.railway.app` (Railway-provided subdomain; custom domain deferred post-launch per plan)
- **Postgres backups**: Daily / 7-day retention — **owner must enable via dashboard** (Postgres service → Data → Backups tab); not CLI-scriptable. Not yet enabled as of this record.
- **Connection pooling**: `DATABASE_URL` on `web` and `worker` carries `?connection_limit=5&pool_timeout=10` (≤10 total connections against Postgres's default `max_connections=100`).
- **Deploy status at provisioning time**: both `web` and `worker` deploy master's current WS-B "gate" image (no `/healthz` route, SQLite-provider Prisma schema, no `worker:start` script yet) — expected crash-loop/404 until the WS-A branch (production Dockerfile + Postgres schema + healthz route + worker entrypoint) merges to master. See Task 7 report for full logs.
