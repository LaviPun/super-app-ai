# Platform V2 — Phase 19 Async UX

**Status:** Local/testable vertical slice complete; production cutover remains gated on auth, real worker event delivery, and Remix traffic migration  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 19

## Goal

Merchants and operators see queued work progress instead of frozen buttons. Phase 19 wires the Next.js V2 frontend to the Fastify `WorkerEvent` SSE contract with polling fallback.

## Legacy source paths inspected

- `apps/web/app/routes/internal.jobs.tsx` — live job tables, replay, in-progress grouping
- `apps/web/app/routes/internal.ai-assistant.chat.stream.tsx` — Remix SSE producer patterns (`:ready`, event frames)
- `apps/web/app/routes/internal.api-logs.tsx` — browser `EventSource` live tail reference

## Local V2 slice implemented

| Area | Implementation |
|------|----------------|
| Fastify SSE | Shared `streamJobEvents` helper; `GET /v1/jobs/:jobId/events` plus existing internal assistant `/events` route |
| Job links | `POST /v1/jobs` and `GET /v1/jobs/:jobId` return `links.status` + `links.events` and event backlog |
| SSE parser | `apps/frontend/src/lib/sse-parse.ts` for fetch-stream SSE consumption |
| Job events client | `subscribeJobEvents` — SSE first, polling fallback, `mergeWorkerEvents`, `fetchJobStatus` |
| Async UX states | `resolveAsyncUxSnapshot` maps generation, publish, flow, connector, and internal tool phases |
| UI | `AsyncJobProgressPanel`, `AsyncJobProgressDemo`, `AsyncJobUxShowcase` on `/jobs`, `/internal/data`, `/internal/ai-assistant` |
| Tests | Vitest for parser/states/client; Playwright `async-ux.spec.ts` with simulated timelines (no live API required) |

## Visible states (contract → UI)

| Domain | Phases surfaced |
|--------|-----------------|
| Generation | queued, running, validating, ready, failed, cancelled |
| Publish | queued, applying, verifying, published, failed |
| Flow | queued, running, retrying, succeeded, failed |
| Connector test | queued, connecting, succeeded, blocked, timed out, auth failed |
| Internal tool run | queued, running, ready, failed, cancelled |

Retry/cancel buttons follow `canRetry` / `canCancel` on the resolved snapshot (safe UX only — handlers are demo/local until cutover).

## Production cutover blockers

- Embed Shopify / internal admin auth on Fastify SSE routes (today unauthenticated in local slice).
- Redis-backed worker event fan-out (in-memory stream is process-local).
- Wire merchant module/publish/connector actions to enqueue + subscribe instead of simulated demos.
- Remix route traffic cutover (`FRONTEND_NEXT_ENABLED`, internal admin gates).

## Verification

- `pnpm --filter @superapp/platform-contracts typecheck && pnpm --filter @superapp/platform-contracts build`
- `pnpm --filter @superapp/api typecheck && pnpm --filter @superapp/api test && pnpm --filter @superapp/api build`
- `pnpm --filter @superapp/frontend typecheck && pnpm --filter @superapp/frontend test && pnpm --filter @superapp/frontend build`
- `pnpm --filter @superapp/frontend test:e2e`
