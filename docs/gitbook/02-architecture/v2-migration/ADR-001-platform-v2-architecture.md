# ADR-001: Platform V2 Architecture

**Status:** Accepted  
**Date:** 2026-05-19  
**Deciders:** Engineering (Platform V2 migration)  
**Related:** [Platform V2 migration plan](../platform-v2-migration-plan.md)

## Context

The current production system is a Remix monolith (`apps/web`) that owns merchant UI, internal admin, APIs, webhooks, cron, AI generation, publishing, connectors, flows, and observability. The `Job` table records work but does not queue it — most job-creating routes execute work synchronously in the HTTP request.

Baseline inventory (Phase 0) documented:

- 117 Remix routes, 115 service modules, 39 Prisma models
- 12 inline job execution call sites
- Production build failure on an internal probe route (pre-existing)
- Evals forbidden-surface gate below threshold on stub provider

We need a production-grade, AI-native commerce platform that scales async work, preserves RecipeSpec-only deployment safety, and allows gradual cutover without breaking the legacy app.

## Decision

Adopt a **separated platform architecture**:

| Layer | Technology | Hosting (target) |
|-------|------------|------------------|
| Embedded merchant + internal UI | **Next.js** (App Router, Polaris, App Bridge) | Cloudflare Pages (preview shell); Remix until cutover |
| API gateway | **Fastify** (local) / **Workers** (prod) | Cloudflare Workers |
| Async workers | **BullMQ** (local) / **Queues** (prod) | Cloudflare Workers + Queues |
| Queue / cache / locks | **Redis** (transition) | Upstash or external Redis until Queues fully wired |
| Source of truth | **PostgreSQL** (Prisma) | Managed Postgres |
| AI inference | RunPod + provider APIs | External |
| Assets | Cloudflare R2 | Cloudflare R2 (`ASSETS` binding) |
| Observability | Sentry, OpenTelemetry, PostHog | SaaS |

**Monorepo layout** (phased):

- `apps/frontend` — Next.js (no long-running backend logic)
- `apps/api` — Fastify gateway (webhooks, OAuth validation, job enqueue, SSE)
- `apps/workers` — BullMQ consumers
- `packages/core` — RecipeSpec, catalog, compiler (existing)
- `packages/platform-contracts` — Zod job/API/event schemas
- `apps/web` — Legacy Remix until cutover

## Consequences

### Positive

- Request handlers stay fast; AI, publish, flows, and webhooks move to durable queues.
- Clear security boundary: HMAC, SSRF, and session validation on Fastify.
- Next.js optimized for embedded Shopify UX and streaming UI.
- Shared Zod contracts prevent drift between Remix (transition), API, workers, and frontend.
- Incremental migration: `JOB_EXECUTION_MODE=inline|queue` during transition.

### Negative

- Operational complexity: three deployables + Redis + Postgres.
- Duplicate UI/API surface during migration (Remix + Next).
- Team must maintain contract package and queue semantics.
- Local dev requires Redis (and optionally separate processes for api/workers/frontend).

### Neutral

- NestJS deferred; Fastify chosen for speed and thin plugins.
- ClickHouse / vector store deferred post-MVP.

## Alternatives considered

### A. Continue Remix monolith

**Rejected.** Does not fix sync job execution, webhook timeouts, or scaling AI/publish workloads without reinventing a queue inside Remix.

### B. Full-stack Next.js (API routes + workers in Next)

**Rejected.** Plan explicitly excludes Next from webhooks, workers, durable sessions, and long-running AI. Violates Shopify embedded best practices for backend ownership.

### C. NestJS backend

**Rejected for V2 MVP.** Heavier framework; Fastify sufficient for gateway + plugins. Revisit if team size demands enterprise DI conventions.

### D. Replace Prisma with alternate ORM

**Rejected for migration.** Prisma remains; bounded contexts documented; Postgres cutover is a later controlled phase.

## Compliance with platform safety rules

- AI emits **RecipeSpec JSON only** — enforced in `packages/core` and workers.
- Preview sandbox and SSRF rules carry forward to `packages/security`.
- GDPR webhooks remain auditable with Postgres as compliance store.

## References

- [Baseline report](./baseline-report.md)
- [Route inventory](./route-inventory.md)
- [Sync job call sites](./sync-job-call-sites.md)
- [Risk ledger](./risk-ledger-sync-work.md)
- [Target monorepo layout](./target-monorepo-layout.md)
