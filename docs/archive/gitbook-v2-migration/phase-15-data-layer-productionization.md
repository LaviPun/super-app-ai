# Platform V2 — Phase 15 Data Layer Productionization

**Status:** Local/testable work complete; production Postgres driver deferred until reviewed migration is applied  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 15

## Implemented foundation

| Area | Implementation |
|------|----------------|
| Repository factory | `createJobLedgerRepository()` in `@superapp/db` with `memory`, `sqlite`, and guarded `postgres` modes |
| SQLite persistence | `better-sqlite3` driver + `migrations/0001_v2_job_ledger.sqlite.sql` for local/test without live Postgres |
| Postgres migration | Existing `migrations/0001_v2_job_ledger.sql` validated by migration contract tests |
| API wiring | `JOB_STORE_PROVIDER=repository` resolves `RepositoryJobStore` through `resolveJobLedgerRepository()` — no `apps/web` Prisma imports |
| Bounded contexts | `repository-boundaries.ts` documents upcoming Module/AI/Connector/Flow/Observability/Internal AI repositories |
| Tests | CRUD + idempotency (in-memory + SQLite), migration contract parity, API repository integration |

## Runtime configuration

Local-safe defaults (unchanged for most tests):

```bash
JOB_STORE_PROVIDER=memory
```

Repository-backed persistence without legacy Remix Prisma:

```bash
JOB_STORE_PROVIDER=repository
JOB_LEDGER_DRIVER=sqlite
JOB_LEDGER_SQLITE_PATH=:memory:
```

File-backed SQLite for manual inspection:

```bash
JOB_STORE_PROVIDER=repository
JOB_LEDGER_DRIVER=sqlite
JOB_LEDGER_SQLITE_PATH=./tmp/v2-job-ledger.sqlite
```

Postgres (after staging review + `pg` driver):

```bash
JOB_STORE_PROVIDER=repository
JOB_LEDGER_DRIVER=postgres
V2_DATABASE_URL=postgresql://...
```

Apply the reviewed Postgres migration before enabling `postgres` mode:

```bash
psql "$V2_DATABASE_URL" -f packages/db/migrations/0001_v2_job_ledger.sql
```

## Prisma strategy (intentionally deferred)

- Legacy merchant data remains on `apps/web/prisma/schema.prisma` until the Postgres cutover runbook completes.
- V2 Fastify and workers must depend on `@superapp/db` repository interfaces and SQL drivers — **not** on Remix Prisma modules.
- A future V2 Prisma package can generate clients from bounded-context schemas after production Postgres is stable; Phase 15 establishes the SQL + repository boundary first.

## Verification

```bash
pnpm --filter @superapp/db test
pnpm --filter @superapp/db typecheck
pnpm --filter @superapp/api test
pnpm --filter @superapp/api typecheck
```

## Blockers / merge risks

- **Postgres driver:** `JOB_LEDGER_DRIVER=postgres` validates env but throws until a `pg`-backed `SqlJobLedgerDriver` ships.
- **Worktree baseline:** Phase 15 worktree may include copied V2 scaffolding from the main workspace if those packages are not yet committed on `vr/v2`.
- **Native module:** `better-sqlite3` requires a successful native build in CI/dev environments.
- **Parallel phases:** Other phase branches touching `apps/api` env or `@superapp/db` exports may conflict.
