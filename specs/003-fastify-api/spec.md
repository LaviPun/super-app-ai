# Feature Specification: Platform V2 Phase 3 — Fastify API Skeleton

**Feature Directory**: `003-fastify-api`

**Created**: 2026-06-12

**Status**: **Shipped (skeleton)** on `master` (2026-06-12)

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

## Goal

Fastify API gateway skeleton with health checks and job enqueue endpoints using platform contracts and job orchestration.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Package | `apps/api` (`@superapp/api`) |
| Endpoints | `GET /health`, `GET /ready`, `POST /v1/jobs/enqueue`, `GET /v1/jobs/mode` |
| Tests | 2 tests passing |

## Deliverables

- [x] Fastify app bootstrap with env validation
- [x] Health and readiness endpoints
- [x] Job enqueue route using `JobOrchestrator` + worker inline handlers
- [x] Unit tests via `app.inject`

## Deferred (later phases)

- Shopify OAuth and session validation
- Webhook HMAC verification
- SSE progress streaming
- Full internal admin API surface

## Success criteria

- **SC-001**: Fastify starts locally via `pnpm --filter @superapp/api dev`. ✅
- **SC-002**: Health/readiness checks work. ✅
- **SC-003**: No production Remix behavior changes required for skeleton. ✅
