# Platform V2 — Phase 5 Job Orchestration

**Status:** Local/testable work complete; production DB/Redis cutover blocked on external dependencies  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 5

## Implemented foundation

| Area | Implementation |
|------|----------------|
| Shared contracts | `QueueNameSchema`, `JobTypeQueueName`, `JobRecordSchema`, `WorkerEventSchema`, expanded enqueue response |
| Job store | `JobStore` interface, `InMemoryJobStore`, `@superapp/db` job ledger boundary, and `RepositoryJobStore` for repository-backed persistence with idempotency-key dedupe |
| Queue transport | `JobQueue` interface, `InMemoryJobQueue`, BullMQ-backed `BullMqJobQueue`, and transport status lookup |
| API route | `POST /v1/jobs` validates envelope and typed payload, stores queued record, enqueues transport job, emits `JOB_QUEUED`, and returns `202` |
| Job lookup | `GET /v1/jobs/:jobId` returns the V2 job ledger record and transport status |
| Worker bootstrap | Worker registrations derive from shared job type to queue mapping |
| Processor registration | `apps/workers` registers contract-validating processors for every job type, with execution migration deferred to the planned worker phases |

## Runtime configuration

The API defaults to local-safe in-memory transport:

```bash
QUEUE_PROVIDER=memory
JOB_EXECUTION_MODE=queue
```

Production BullMQ configuration:

```bash
QUEUE_PROVIDER=bullmq
QUEUE_REDIS_URL=redis://127.0.0.1:6379
QUEUE_PREFIX=superapp-v2
QUEUE_DEFAULT_ATTEMPTS=3
QUEUE_DEFAULT_BACKOFF_MS=1000
```

`JOB_EXECUTION_MODE=disabled` returns `503 JOB_EXECUTION_DISABLED`. Inline execution remains intentionally absent from request handlers.

## Persistence boundary

The repository-backed store is intentionally injected behind `JobLedgerRepository`. This gives Phase 5 a production-shaped persistence boundary without importing `apps/web` database internals into V2.

`packages/db` now owns the V2 job ledger repository interface, in-memory test repository, SQL row mapper, and the draft Postgres migration in `packages/db/migrations/0001_v2_job_ledger.sql`. See [V2 DB job ledger](./db/job-ledger.md).

Current blocker: this repo does not yet have a V2 Prisma client or a safe production Postgres connection for local verification. The only active Prisma schema lives under `apps/web/prisma/schema.prisma`; importing that directly from `apps/api` would couple the new Fastify app back to the Remix monolith. Phase 15 should establish the final V2 Prisma/SQL driver and apply the reviewed migration. The existing legacy `Job` model also lacks `queueName`, `idempotencyKey`, and `updatedAt`, so it is not sufficient for production V2 idempotency as-is.

## Redis verification

This environment does not have Redis tooling available (`redis-cli` is not installed), so live BullMQ integration was not run here. The BullMQ adapter is unit-tested with a mocked BullMQ queue. Use this command for live verification in an environment with Redis:

```bash
QUEUE_PROVIDER=bullmq QUEUE_REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @superapp/api test
```

## Legacy structural parity note

`apps/frontend` now mirrors the existing Remix navigation groups instead of showing generic demo UI:

- Merchant embedded: Home, AI modules, Jobs, Advanced features, Data models, Billing, Settings.
- Internal admin: Dashboard, Monitoring, Data, Configuration.

Each V2 route shell identifies the source Remix route(s) and the intended Fastify/API contract boundary. The route shells are not a behavior cutover; `apps/web` remains the production source of truth.

## Verification

Latest gate results are tracked in `docs/implementation-status.md`.
