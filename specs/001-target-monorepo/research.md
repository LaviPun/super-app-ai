# Research: Phase 1 — Target Monorepo Shape

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: pnpm workspace split — `apps/*` + `packages/*`

**Rationale:** Separate deployables (`apps/web` legacy Remix, `apps/api`, `apps/workers`, `apps/frontend`) from shared libraries (`packages/platform-contracts`, `packages/core`, `packages/job-orchestration`, `packages/network-security`, …). Lets each app build/deploy independently while sharing Zod contracts, preventing drift during the Remix → Next/Fastify-or-Workers cutover.

**Alternatives considered:**

- Single Next.js app owning API + workers — rejected (violates ADR-001 backend ownership; Shopify embedded best practices).
- Nx/Turborepo task graph — deferred; plain pnpm `--filter` is sufficient at current scale.

## Decision: Legacy Remix (`apps/web`) stays merchant-canonical until Phase 21

**Rationale:** Zero-downtime migration requires the existing app to keep serving merchants while new surfaces ship behind flags. Retirement is gated on `SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED` (Phase 21).

## Open items

- [ ] Document canonical `pnpm --filter` recipes per app in this dir.
- [ ] Remove `apps/web` after Phase 21 cutover completes.
