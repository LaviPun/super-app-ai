# Platform V2 — Phase 10 Connector Worker

**Status:** Local/testable connector execution boundary complete  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 10

## Scope delivered

| Area | Implementation |
|------|----------------|
| Shared SSRF/allowlist policy | `packages/network-security` (`assertSafeTargetUrl`, `assertConnectorTargetUrl`, header/body redaction helpers) |
| Job contracts | `CONNECTOR_TEST` and `CONNECTOR_CALL` payloads extended in `@superapp/platform-contracts` |
| Worker execution | `apps/workers/src/connector-execution.ts` with injectable adapter + HTTP client (no inline fetch in API routes) |
| Processor registry | `CONNECTOR_TEST` / `CONNECTOR_CALL` wired to real processors in `apps/workers/src/processors.ts` |
| API initiation | `POST /v1/connectors/test` and `POST /v1/connectors/call` enqueue jobs; status via `GET /v1/jobs/:jobId` |
| API SSRF guard | `apps/api/src/plugins/security.ts` rejects absolute URLs in connector enqueue payloads |

## Migration boundaries

**Still in Remix (`apps/web`) for now**

- Connector CRUD, endpoint CRUD, secret setup UI
- Legacy inline `ConnectorService.test()` execution on `/api/connectors/test` and agent test routes

**Moved to worker/API path**

- Async connector test/call execution via `connector-execution` queue
- SSRF + allowlist enforcement before any outbound HTTP in workers
- Redacted response metadata in worker events/job results

## Shared edits outside Phase 10-only files

| File | Why |
|------|-----|
| `packages/platform-contracts/src/jobs.ts` | Shared job payload contracts used by API + workers |
| `apps/workers/src/processors.ts` | Registry must route connector job types to new processors |
| `apps/api/src/index.ts` | Registers connector enqueue routes |
| `apps/api/src/plugins/security.ts` | API-side SSRF guard for absolute path overrides |

Phase 8 (`internal-assistant`) and Phase 9 (`webhook-flow`) modules were not modified.

## Verification

```bash
pnpm install
pnpm --filter @superapp/network-security test
pnpm --filter @superapp/platform-contracts test
pnpm --filter @superapp/workers test
pnpm --filter @superapp/api test
pnpm --filter @superapp/workers typecheck
pnpm --filter @superapp/api typecheck
```

## Follow-ups (not in this phase)

- Wire Remix connector test routes to enqueue `CONNECTOR_TEST` instead of inline `fetch`
- Persist connector config lookup in worker adapter via Prisma instead of stub adapter
- BullMQ/Redis integration test with live connector sandbox
