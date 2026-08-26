# ADR-002: Cloudflare V2 Platform Hosting (Scoped Policy)

**Status:** Accepted  
**Date:** 2026-06-12  
**Supersedes (in part):** [ADR-001](./ADR-001-platform-v2-architecture.md) — Railway-centric hosting table for V2 API/workers  
**Related:** [Master spec](../../../../specs/000-platform-v2-master/spec.md), [Cloudflare runbook](./cloudflare-deployment-runbook.md), [Env matrix](../../../deployment/env-matrix.md), [Spec Kit status report](../../../spec-kit-status-report.md)

## Context

ADR-001 (2026-05-19) targets Fastify + BullMQ on Railway for the V2 API and workers. Since then, Cloudflare Workers, Pages, R2, and Queues parity shipped for the platform job path. The repo still contains Railway/Docker configs for an alternate Fastify backend and for the internal AI router — not for removal without operator approval.

## Decision

Adopt a **scoped hosting policy**:

| Surface | Primary (recommended) | Alternate / legacy |
|---------|----------------------|-------------------|
| V2 API + queue consumers | **Cloudflare Workers** (`PLATFORM_BACKEND=cloudflare`) | Fastify + BullMQ on Railway/Docker when `PLATFORM_BACKEND=fastify` |
| V2 frontend shell | **Cloudflare Pages** (Next.js) | Vercel optional during migration |
| Platform object storage + async queues | **Cloudflare R2 + Queues** | BullMQ/Redis when Fastify backend is active |
| Internal AI router (Modal/Ollama/Anthropic) | **Railway/Docker/Modal** — separate from V2 platform | Not governed by V2 CF-only policy |
| Legacy merchant app | Remix (`apps/web`) until Phase 21 cutover | — |

**Explicit non-goals for new V2 work:**

- No Kubernetes for platform V2
- No new Fly.io deploy targets for V2 API/workers

**Railway/Docker artifacts that remain in-repo:**

- `deploy/railway-internal-router/` — internal AI router (not V2 API)
- Dockerfiles / Railway-oriented env presets for Fastify alternate backend (`PLATFORM_BACKEND=fastify`)
- Env matrix Fastify/Railway sections — valid when operators choose the alternate backend

## Consequences

- Success criteria SC-M5 (master) and SC-004 (Phase 18) must **not** claim “no Railway artifacts”; they must state V2 platform targets Cloudflare with scoped exceptions above.
- Phase 21 cutover uses `PLATFORM_BACKEND` and rollout flags in `@superapp/platform-contracts` (`rollout-cutover.ts`).
- ADR-001 remains historical context; new deploy decisions follow this ADR and the Cloudflare runbook.

## Verification

- Master spec links ADR-002 and documents dual queue architecture (BullMQ vs platform queues).
- Phase 18 tasks no longer mark “grep confirms no railway” as complete until policy-aligned checks land.
