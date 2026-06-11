# Platform V2 — Phase 8 Internal Assistant Migration

**Status:** Local/testable vertical slice complete; production cutover remains blocked by live assistant/runtime dependencies  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 8

## Legacy source paths inspected

- `apps/web/app/routes/internal.ai-assistant.tsx`
- `apps/web/app/routes/internal.ai-assistant.chat.stream.tsx`
- `apps/web/app/services/ai/internal-assistant.server.ts`
- `apps/web/app/services/ai/internal-ai-local-only.ts`
- `apps/web/app/services/ai/internal-assistant-store.server.ts`
- `apps/web/app/__tests__/internal-ai-assistant-stream.test.ts`
- `apps/web/app/__tests__/internal-assistant.service.test.ts`

The existing assistant is tightly coupled to Remix internal-admin auth, SSE streaming, assistant session persistence, tool audit writes, router runtime config, SSRF checks, and `INTERNAL_AI_LOCAL_ONLY`.

## Local V2 slice implemented

| Area | Implementation |
|------|----------------|
| Job contract | Added `INTERNAL_TOOL_RUN` with `InternalToolRunPayloadSchema` |
| Queue isolation | Added `internal-tool-run` queue, separate from `ai-generation` |
| Worker boundary | Added `InternalAssistantAdapter` and `createInternalAssistantProcessor` |
| Fastify API | Added `POST /v1/internal/assistant/jobs`, `GET /v1/internal/assistant/jobs/:jobId`, and SSE `/events` |
| V2 persistence boundary | Added `InternalAssistantRepository` and `InMemoryInternalAssistantRepository` in `@superapp/db` |
| Next UI shell | Added `/internal/ai-assistant` route shell aligned to legacy Remix assistant surface |
| Local-only policy | Worker rejects `modalRemote` jobs when `localOnly` is enabled |
| Tests | Added API enqueue/status tests, worker adapter policy tests, DB boundary tests, route parity tests, and Playwright shell coverage |

## Production cutover blockers

Phase 8 acceptance requires internal assistant tests to pass in the migrated path, local-only model policy to remain enforced, and merchant AI to avoid importing internal assistant modules. The worker boundary and contracts satisfy the isolation shape locally, but the full UI/API migration still requires:

- Wiring the Fastify SSE route to real worker event delivery in Redis/BullMQ.
- Replacing the in-memory assistant repository with the reviewed Phase 15 SQL/Prisma implementation.
- Migrating the full chat composer/session CRUD from Remix to Next.
- Verifying authenticated internal admin access and streamed model execution against local model/router infrastructure.

## Safety notes

- Merchant AI jobs remain isolated in `ai-generation`.
- Internal assistant jobs use `internal-tool-run`.
- Tool runs are adapter-scoped and contract-validated; no arbitrary code execution was added.
- No Remix behavior was changed.

## Verification

- `pnpm --filter @superapp/platform-contracts typecheck && pnpm --filter @superapp/platform-contracts test && pnpm --filter @superapp/platform-contracts build`
- `pnpm --filter @superapp/db typecheck && pnpm --filter @superapp/db test && pnpm --filter @superapp/db build`
- `pnpm --filter @superapp/api typecheck && pnpm --filter @superapp/api test && pnpm --filter @superapp/api build`
- `pnpm --filter @superapp/workers typecheck && pnpm --filter @superapp/workers test && pnpm --filter @superapp/workers build`
- `pnpm --filter @superapp/frontend typecheck && pnpm --filter @superapp/frontend test && pnpm --filter @superapp/frontend build`
- `pnpm --filter @superapp/frontend test:e2e`
- `pnpm --filter web test`
