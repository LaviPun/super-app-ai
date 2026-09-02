# Restore From Backup

How production Postgres data is backed up, how to verify a backup, and the
exact commands to restore. Severity when needed for real: **SEV-1**.

**STATUS (2026-09-02):** the nightly backup (`.github/workflows/db-backup.yml`)
had been **failing silently since the Postgres 18 cutover** — the runner's
default `postgresql-client` is v16 and `pg_dump` aborts on
`server version mismatch` (server 18.6 vs pg_dump 16.15; verified in the
2026-09-01 run log). Fixed 2026-09-02: the workflow now installs
`postgresql-client-18` from PGDG, enforces a minimum dump size, and files a
GitHub issue (`ops-backup-failure`) on any failure. **Until the next green
nightly run there is no restorable pg_dump artifact — check the Actions tab.**

## Backup inventory

| Layer | What | Retention | Verified? |
|---|---|---|---|
| GitHub Actions nightly `pg_dump` | `db-backup.yml`, 04:00 UTC → artifact `superapp-postgres-<stamp>.sql.gz` | 30 days | Weekly by `db-restore-verify.yml` (Sundays 05:00 UTC) |
| Railway native daily backup | Dashboard-only toggle, 7-day retention | 7 days | **Owner action: confirm it is enabled** — Railway dashboard → Postgres service → Backups. Not verifiable from this repo. |

Owner prerequisites for the nightly dump: repo secret `DATABASE_BACKUP_URL`
(the Railway Postgres TCP-proxy connection string; prefer a read-only role).
Without it the workflow no-ops with a warning.

## Verify a backup (without an incident)

- Automatic: `db-restore-verify.yml` restores the newest artifact into a
  scratch Postgres 18 weekly and sanity-counts tables/rows; failures file an
  `ops-restore-verify-failure` issue.
- Manual, local (needs docker + authed `gh`):

```bash
node scripts/verify-backup-restore.mjs               # newest artifact
node scripts/verify-backup-restore.mjs --file dump.sql.gz
```

## Restore procedure (real incident)

> Restores OVERWRITE data. Announce maintenance first
> (`AppSettings.maintenanceMode` via /internal/settings) and stop the cron
> workflow (Actions → cron → ⋯ → Disable workflow) so sweeps don't write
> mid-restore.

```bash
# 1. Fetch the newest backup artifact (or pick a specific one in the UI)
gh api "repos/LaviPun/super-app-ai/actions/artifacts?per_page=50" \
  --jq '[.artifacts[] | select(.name|startswith("superapp-postgres-")) | select(.expired==false)] | sort_by(.created_at) | last'
gh api "repos/LaviPun/super-app-ai/actions/artifacts/<ID>/zip" > backup.zip && unzip backup.zip

# 2. REHEARSE into a scratch container first — always
node scripts/verify-backup-restore.mjs --file superapp-postgres-<stamp>.sql.gz

# 3. Point psql at production via the Railway TCP proxy (never paste the URL
#    into chat/logs — it embeds credentials)
export PROD_URL="<Railway Postgres connection string>"   # value-blind: from Railway dashboard → Postgres → Connect

# 4. Restore into a FRESH database, then switch — never in-place over the live one
psql "$PROD_URL" -c 'CREATE DATABASE superapp_restore_target'
gunzip -c superapp-postgres-<stamp>.sql.gz \
  | psql -v ON_ERROR_STOP=1 "$(echo "$PROD_URL" | sed 's#/[^/]*$#/superapp_restore_target#')"

# 5. Sanity-check the restored DB (counts per table, newest rows)
psql "..._restore_target" -c 'SELECT count(*) FROM "Shop"; SELECT count(*) FROM "Session"; SELECT max("createdAt") FROM "Job";'

# 6. Cut over: update DATABASE_URL on the Railway web + worker services to the
#    restored database (dashboard → service → Variables), redeploy both.
# 7. Re-enable cron workflow, clear maintenanceMode, run post-deploy-smoke.
```

Data written between the backup timestamp and the incident is lost (nightly
cadence ⇒ up to 24h). Say so explicitly in the incident notes.

## Why restore-verify is not a Railway ops-worker cron

The worker has no GitHub credentials (backups are Actions artifacts), no
Docker (no scratch Postgres), and pointing a restore test anywhere near the
production DB is exactly what a restore test must never do. GitHub Actions has
all three for free — see `db-restore-verify.yml`.
