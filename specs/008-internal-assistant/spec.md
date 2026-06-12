# Feature Specification: Platform V2 Phase 8 — Internal Assistant Migration

**Feature Directory**: `008-internal-assistant`

**Created**: 2026-06-12

**Last updated**: 2026-06-12

**Status**: **Partial** — Fastify/Worker API routes shipped; Remix remains source of truth

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) — Phase 8

## Goal

Internal UI to Next admin; streaming API to Fastify/Worker; isolated from merchant AI; local-only policy where required.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **Partial** |
| Fastify/Worker routes | [`apps/api/src/routes/internal-assistant.ts`](../../apps/api/src/routes/internal-assistant.ts) — see route table below |
| Remix (source of truth) | `apps/web/app/routes/internal.ai-assistant.*`, `apps/web/app/services/ai/internal-assistant.server.ts`, chat stream route with Anthropic/Ollama/Modal backends |
| WIP | Anthropic backend on cloud target (`modalRemote`) — account credits required; local Ollama failover |

### Fastify / Worker route table

| Method | Path | Status |
|--------|------|--------|
| POST | `/v1/internal/assistant/jobs` | Shipped — enqueue `INTERNAL_TOOL_RUN` |
| GET | `/v1/internal/assistant/jobs/:jobId` | Shipped — job status |
| GET | `/v1/internal/assistant/jobs/:jobId/events` | Shipped — SSE |
| GET | `/v1/internal/assistant/readiness` | Shipped — router readiness via shared handler |
| POST | `/v1/internal/assistant/chat` | Partial stub — full streaming UX remains in Remix |

### Remix routes (not yet retired)

- `internal.ai-assistant.chat.stream.tsx` — streaming chat (Anthropic backend partial/WIP)
- `internal.model-setup.tsx` — backend probe + target selection
- Internal assistant services under `apps/web/app/services/ai/`

## Pending

- Next admin UI replacing Remix internal assistant pages
- Streaming chat parity on Fastify/Worker (or BFF from Next to Remix during cutover)
- Retire Remix routes after Phase 21 flags enable Next cutover

## Acceptance (from migration plan)

See Phase 8 in [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md) for full acceptance criteria.

## Success criteria

- **SC-001**: API proxy routes exist with contract validation. ⚠️ Partial
- **SC-002**: Unit/integration tests for new logic; no secrets/PII in logs. ✅
- **SC-003**: RecipeSpec-only deployment boundary preserved where applicable. ✅

## Deferred / out of scope (this iteration)

- Full migration of streaming chat from Remix
- Next internal admin shell (depends on Phase 4 + 21)
