# Postgres Migration Runbook (SQLite-Compatible)

This runbook prepares `apps/web` for Postgres while keeping local SQLite behavior unchanged.

## Goals

- Keep local development on SQLite by default.
- Allow Postgres readiness via environment switch.
- Avoid destructive migrations during rollout.

## Environment Strategy

`DATABASE_URL` remains environment-driven, while Prisma 5.x requires a literal
provider in `schema.prisma`.

- Local default: `provider = "sqlite"` + `DATABASE_URL="file:./dev.db"`
- Postgres cutover: flip provider to `"postgresql"` in a dedicated migration PR
  and set `DATABASE_URL` to Postgres in the target environment

### Local development (default)

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
