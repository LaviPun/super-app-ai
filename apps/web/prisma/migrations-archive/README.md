# Archived migrations (2026-07-02 re-baseline)

These 20 migration folders are **not usable** and are kept only for reference.

## Why the history was broken

- The dev database was created from a `20260303100000_init` migration that was
  never committed — no folder for it exists in git history.
- Every migration here assumes tables created by that missing init (the chain
  fails on a shadow database at `20260303120001_add_category_overrides`:
  `no such table: AppSettings`).
- The database subsequently evolved via `prisma db push` (schema drift), so the
  `_prisma_migrations` table listed only the missing init while all 20 local
  migrations were "pending" against a database that already had their changes.
- Net effect: `prisma migrate dev` / `migrate deploy` could never work on a
  fresh clone or a new environment.

## What replaced it

`prisma/migrations/20260702000000_baseline` — a single squashed baseline
generated from `schema.prisma` (which was first reconciled to match the real
dev.db DDL, recovering the `FlowDeadLetter`, `ShopApiRateLimit` tables and the
`WorkflowRun` durable-wait columns that had been pushed but never committed).

## For existing environments

An environment whose database already has the current schema should run:

```bash
npx prisma migrate resolve --applied 20260702000000_baseline
```

after clearing stale rows from `_prisma_migrations`. Fresh environments just
run `npx prisma migrate deploy`.
