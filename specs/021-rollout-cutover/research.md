# Research: Phase 21 — Rollout And Cutover

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: `PLATFORM_BACKEND` selects V2 API/worker hosting preset

**Rationale:** Single operator-facing switch (`cloudflare` | `fastify`) presets `FASTIFY_API_ENABLED` and default `JOB_EXECUTION_MODE` while allowing explicit overrides. Implemented in [`rollout-cutover.ts`](../../packages/platform-contracts/src/rollout-cutover.ts).

| Value | API surface | Job execution default |
|-------|-------------|----------------------|
| `cloudflare` | CF Worker serves `/v1`; Fastify `/v1` gated | `queue` (CF Queues) |
| `fastify` | Fastify serves `/v1` with BullMQ | `queue` (Redis/BullMQ) |
| *(unset)* | Legacy Remix inline; Fastify gated | `inline` |

**Alternatives considered:**

- Per-route env vars only — rejected (operator error-prone)
- Hard cutover without Fastify alternate — rejected (rollback needs `PLATFORM_BACKEND=fastify`)

## Decision: Full rollout flag set in `PlatformV2RolloutFlagsSchema`

**Rationale:** Feature-level gates decouple worker enablement from backend choice. Env keys exported as `PLATFORM_V2_ROLLOUT_ENV_KEYS`.

| Env key | Purpose |
|---------|---------|
| `PLATFORM_BACKEND` | Backend preset (`cloudflare` \| `fastify`) |
| `FRONTEND_NEXT_ENABLED` | Next.js shell vs Remix |
| `FASTIFY_API_ENABLED` | Fastify `/v1` gate (preset from backend) |
| `SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED` | Merchant embedded traffic to Next |
| `JOB_EXECUTION_MODE` | `inline` \| `queue` \| `disabled` |
| `AI_GENERATION_ASYNC_ENABLED` | Async AI generation worker |
| `AI_GENERATION_STREAM_VIA_QUEUE_ENABLED` | Stream AI via queue |
| `FLOW_ASYNC_ENABLED` | Async flow worker |
| `WEBHOOK_ASYNC_ENABLED` | Async webhook processing |
| `CONNECTOR_WORKER_ENABLED` | Connector worker |
| `PUBLISH_WORKER_ENABLED` | Publish worker |
| `PREVIEW_SANDBOX_ENABLED` | Preview sandbox API |
| `INTENT_GRAPH_ENABLED` | Intent graph features |

**Also:** `PLATFORM_V2_ENABLED` in `@superapp/job-orchestration` — orchestrator skip when false (not in rollout schema).

## Decision: Cutover decisions still pending

**Rationale:** Code ships flags and contracts; traffic cutover, Remix retirement, and ops runbooks are not complete.

**Pending:**

- [ ] Operator chooses primary backend (`cloudflare` recommended per [ADR-002](../../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md))
- [ ] Merchant traffic cutover plan + rollback
- [ ] Remix route retirement checklist
- [ ] Dual queue consolidation after cutover

## Decision: Hosting policy scoped exceptions

**Rationale:** V2 platform targets Cloudflare; Railway/Docker remains for Fastify alternate backend and internal AI router only — see ADR-002. Do not assert “zero Railway artifacts” in success criteria.
