# Platform V2 — Phase 6 Worker Runtime

**Status:** Local/testable runtime foundation complete  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 6

## Runtime foundation

| Area | Implementation |
|------|----------------|
| Env validation | `apps/workers/src/env.ts` validates queue provider, Redis URL, prefix, concurrency, and shutdown timeout |
| Queue registration | `createWorkerBootstrapState()` derives registrations from shared job contracts |
| Processor registry | `createProcessorRegistry()` registers a contract-validating processor for every planned job type |
| Runtime | `createWorkerRuntime()` creates BullMQ workers via injectable factory, supports graceful `stop()`, and logs startup/shutdown |
| Process entrypoint | `src/main.ts` loads env, starts runtime, and handles `SIGINT`/`SIGTERM` |
| Observability hooks | `WorkerLogger` abstraction with console implementation; processors log job id, queue, type, correlation id, and migration phase |

## Execution migration boundaries

Processors validate contracts and emit progress events, but intentionally do not execute migrated business logic yet:

| Job type(s) | Execution phase |
|-------------|-----------------|
| `AI_GENERATE`, `AI_HYDRATE`, `AI_MODIFY` | Phase 7 |
| `WEBHOOK_RECEIVED`, `FLOW_RUN` | Phase 9 |
| `CONNECTOR_TEST`, `CONNECTOR_CALL` | Phase 10 |
| `PUBLISH` | Phase 11 |
| `THEME_ANALYZE` | Phase 12 |
| `RETENTION_RUN` | Phase 16 |

This keeps Phase 6 deployable without reintroducing long-running execution into API request handlers.

## Railway/runtime env

Minimum worker runtime configuration:

```bash
NODE_ENV=production
QUEUE_PROVIDER=bullmq
QUEUE_REDIS_URL=redis://...
QUEUE_PREFIX=superapp-v2
WORKER_CONCURRENCY=2
WORKER_SHUTDOWN_TIMEOUT_MS=10000
```

`QUEUE_PROVIDER=memory` is allowed only for local/tests through injected worker factories; production should use BullMQ with Redis.

## Verification

Latest gate results are tracked in `docs/implementation-status.md`.
