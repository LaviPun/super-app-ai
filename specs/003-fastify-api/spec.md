# Feature Specification: Platform V2 Phase 3 — Fastify API Skeleton

**Feature Directory**: `003-fastify-api`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Shipped** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

## Goal

Fastify API gateway with health checks, job enqueue/status, preview, connectors, webhooks/flows, and internal assistant routes — validated with platform contracts and job orchestration. Cloudflare Worker parity via shared handlers in `apps/api/src/handlers/`.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Package | `apps/api` (`@superapp/api`) |
| Route modules | `routes/index.ts`, `jobs.ts`, `preview.ts`, `connectors.ts`, `webhook-flow.ts`, `internal-assistant.ts`, `job-events-route.ts` |
| Tests | **41** tests across 11 files in `apps/api/src/__tests__/` |
| CF parity | `apps/api/src/index.ts` Worker entry mounts same route registrars |

## Route table (Fastify + Worker parity)

| Method | Path | Module | Purpose |
|--------|------|--------|---------|
| GET | `/health` | `index.ts` | Liveness |
| GET | `/ready` | `index.ts` | Readiness |
| GET | `/v1/jobs/:jobId` | `index.ts` | Job status (BullMQ store + platform KV fallback) |
| POST | `/v1/jobs` | `index.ts` | Legacy BullMQ enqueue |
| GET | `/v1/jobs/:jobId/events` | `job-events-route.ts` | SSE job events |
| POST | `/v1/jobs/enqueue` | `jobs.ts` | Platform-queue enqueue |
| GET | `/v1/jobs/mode` | `jobs.ts` | Job execution mode / rollout introspection |
| GET | `/v1/preview/:shopId/:moduleId/envelope` | `preview.ts` | Preview envelope |
| GET | `/v1/preview/:shopId/:moduleId/content` | `preview.ts` | Preview HTML content |
| POST | `/v1/connectors/test` | `connectors.ts` | Connector test enqueue |
| POST | `/v1/connectors/call` | `connectors.ts` | Connector call enqueue |
| POST | `/v1/webhooks/shopify` | `webhook-flow.ts` | Shopify webhook ingress |
| POST | `/v1/flows/run` | `webhook-flow.ts` | Manual flow run |
| POST | `/v1/internal/assistant/jobs` | `internal-assistant.ts` | Internal tool run enqueue |
| GET | `/v1/internal/assistant/jobs/:jobId` | `internal-assistant.ts` | Assistant job status |
| GET | `/v1/internal/assistant/jobs/:jobId/events` | `internal-assistant.ts` | Assistant job SSE |
| GET | `/v1/internal/assistant/readiness` | `internal-assistant.ts` | Router readiness probe |
| POST | `/v1/internal/assistant/chat` | `internal-assistant.ts` | Chat proxy (partial — Remix remains source of truth for streaming UX) |

## Deliverables

- [x] Fastify app bootstrap with env validation
- [x] Health and readiness endpoints
- [x] Job enqueue + status routes (BullMQ + platform paths)
- [x] Preview, connector, webhook/flow, internal assistant routes
- [x] Unit tests via `app.inject` and Worker handler tests

## Deferred (later phases)

- Shopify OAuth and session validation on all merchant routes
- Full SSE progress streaming to Next merchant UI (Phase 19)
- Complete internal assistant migration from Remix (Phase 8)

## Success criteria

- **SC-001**: Fastify starts locally via `pnpm --filter @superapp/api dev`. ✅
- **SC-002**: Health/readiness checks work. ✅
- **SC-003**: Route surface matches table above with contract validation at boundaries. ✅
- **SC-004**: Cloudflare Worker serves same `/v1` handlers when `PLATFORM_BACKEND=cloudflare`. ✅
