# Platform V2 — Phase 13 Preview Sandbox

**Status:** Partial — Remix merchant preview shell exists; full V2 preview envelope not cut over  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 13

## Current baseline (Remix)

- Merchant template preview uses sandbox iframe helpers in `apps/web` (see QA notes in `docs/qa/fix-log.md`).
- Publish and preview remain separate code paths; publish still flows through Remix `PublishService` for production traffic.

## Target V2 shape

| Component | Owner |
|-----------|--------|
| Preview envelope (RecipeSpec + compiled config + policy metadata) | Fastify API |
| Preview shell UI (CSP, iframe sandbox) | Next.js `apps/frontend` |
| Flag | `PREVIEW_SANDBOX_ENABLED` in [rollout-cutover.ts](../../../../packages/platform-contracts/src/rollout-cutover.ts) |

## Acceptance (from plan)

- Preview works without publish.
- No arbitrary Liquid or merchant code execution in preview.
- Publish stays auditable and idempotent.

## Next implementation steps

1. Add Fastify read-only preview data route behind `PREVIEW_SANDBOX_ENABLED`.
2. Next preview page consumes API envelope (no inline DB blobs).
3. E2E: generate → preview → publish with flag gating.
