# Platform V2 DB — Job Ledger

**Status:** Local package boundary and SQL migration draft added  
**Plan references:** Phase 1 `packages/db`, Phase 5 job orchestration, Phase 15 data layer productionization

## Package boundary

`packages/db` is the V2 database boundary. It currently includes:

- `JobLedgerRepository` interface.
- `InMemoryJobLedgerRepository` for local/test execution.
- `SqlJobLedgerRepository` and SQL row mapping for future Postgres drivers.
- `createQueuedJob()` helper that preserves Phase 5 idempotency and payload validation semantics.
- `migrations/0001_v2_job_ledger.sql`, a reviewed Postgres migration draft for job ledger and job event tables.

This avoids importing `apps/web` Prisma internals into `apps/api` while still giving Fastify a production-shaped persistence boundary.

## Job ledger fields

The V2 job ledger draft includes:

- `id`
- `shop_id`
- `type`
- `queue_name`
- `status`
- `attempts`
- `payload_json`
- `result_json`
- `error`
- `idempotency_key`
- `request_id`
- `correlation_id`
- `started_at`
- `finished_at`
- `created_at`
- `updated_at`

`v2_job_events` stores progress/event history linked to `v2_job_ledger`.

## Current blocker

The repo still has only the legacy `apps/web/prisma/schema.prisma`; no V2 Prisma client/package exists yet. The SQL migration draft should be applied only after Phase 15 confirms production Postgres stability and establishes the final V2 Prisma/driver wiring.

Until then, `apps/api` supports:

```bash
JOB_STORE_PROVIDER=memory
JOB_STORE_PROVIDER=repository
```

`repository` currently uses the shared in-memory job ledger repository in local/test mode. A real SQL driver should replace it when the V2 DB client is introduced.
