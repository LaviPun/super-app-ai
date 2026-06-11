# Feature Specification: Platform V2 — Master Index

**Feature Directory**: `000-platform-v2-master`

**Created**: 2026-06-12

**Status**: Living document — tracks full V2 migration spec coverage and honest delivery state on `master`

**Canonical plan**: [`docs/gitbook/02-architecture/platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**ADR**: [`docs/gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md`](../../docs/gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md)

## Purpose

Single index for the **Platform V2** migration (Next.js + Fastify + BullMQ workers + Redis + Postgres + R2). This is separate from legacy SuperApp phases 0–8 in [`docs/phase-plan.md`](../../docs/phase-plan.md), which shipped inside the Remix monolith.

## Honest completion statement

| Scope | Can we say "nothing left"? |
|-------|----------------------------|
| **Legacy SuperApp phases 0–8** | Mostly yes — core product shipped; Phase 2 compile/publish adapter wiring and CEO safety controls remain open (see legacy backlog in `phase-plan.md`). |
| **Platform V2 Phase 12** | **Yes for in-scope deliverables** — contracts, worker handler, adapters, tests, docs merged (PR #8). **Explicitly deferred**: live BullMQ consumer wiring, R2 production deploy, signed URL proxy (owned by Phases 5/9–11/18). |
| **Platform V2 Phases 0–11, 13–21** | **No** — not merged to `master`; stub specs exist under `specs/00N-*`; implementation may exist in sibling worktrees only. |

## Phase coverage matrix

| V2 Phase | Name | Spec dir | `master` status | Blockers / notes |
|----------|------|----------|-----------------|------------------|
| 0 | Baseline & inventory | *(master only)* | Partial | ADR + migration plan in repo; full route inventory in main `ai-shopify-superapp` worktree |
| 1 | Target monorepo shape | `001-target-monorepo` | Partial | `apps/workers`, `packages/platform-contracts` exist; `apps/api`, `apps/frontend` not on `master` |
| 2 | Shared contracts | `002-shared-contracts` | Partial | Image/storage jobs only; full job type union pending Phase 5 merge |
| 3 | Fastify API skeleton | `003-fastify-api` | Not started | Sibling worktree `ai-shopify-superapp-phase9-webhook-flow` |
| 4 | Next.js frontend skeleton | `004-next-frontend` | Not started | Same sibling worktrees |
| 5 | Job orchestration & BullMQ | `005-job-orchestration` | Not started | Blocks Phase 12 live enqueue |
| 6 | Worker app skeleton | `006-worker-skeleton` | Partial | `apps/workers` bootstrap exists (Phase 12 extended it) |
| 7 | AI generation worker | `007-ai-generation-worker` | Not started | Remix still sync for merchant AI |
| 8 | Internal assistant migration | `008-internal-assistant` | Not started | Internal AI remains in Remix |
| 9 | Webhook & flow workers | `009-webhook-flow` | Not started | WIP in phase9 worktree |
| 10 | Connector worker | `010-connector-worker` | Not started | WIP in phase10 worktree |
| 11 | Publish worker | `011-publish-worker` | Not started | WIP in phase11 worktree |
| 12 | Storage & image worker | `012-storage-image-worker` | **Shipped** | Deferred: BullMQ publish, R2 prod binding, signed URLs |
| 13 | Preview sandbox | `013-preview-sandbox` | Not started | WIP in phase13 worktree |
| 14 | Intent graph & Recipe DSL | `014-intent-graph` | Not started | WIP in phase14 worktree |
| 15 | Data layer productionization | `015-data-layer` | Not started | Postgres cutover + repositories |
| 16 | Observability & analytics | `016-observability` | Not started | Cross-service OTel/PostHog |
| 17 | Security & compliance | `017-security-compliance` | Not started | App Store readiness gate |
| 18 | Deployment infrastructure | `018-deployment` | Not started | Vercel/Railway/R2/Redis matrices |
| 19 | Async UX | `019-async-ux` | Not started | Queued-state UI for merchants |
| 20 | Testing matrix | `020-testing-matrix` | Not started | Cross-service failure tests |
| 21 | Rollout & cutover | `021-rollout-cutover` | Not started | Feature flags + Remix retirement |

## Phase 12 deferred items (explicit — not silently skipped)

Tracked in [`012-storage-image-worker/spec.md`](../012-storage-image-worker/spec.md) and gitbook merge notes:

- [ ] BullMQ consumer registration for `asset-storage` queue (Phase 5 + 9–11 merge)
- [ ] `schedulePreviewExport()` actual queue publish (stub validates only today)
- [ ] Production R2 bucket + worker binding deploy (Phase 18)
- [ ] Signed URL / API proxy for asset delivery (later Fastify phase)
- [ ] `THEME_ANALYZE` storage offload (optional follow-up)

## Legacy SuperApp backlog (non-V2, still open)

From [`docs/phase-plan.md`](../../docs/phase-plan.md) — not Platform V2 numbered phases:

- Phase 2: profile-driven compile/publish adapter wiring
- Storefront UI Style System Phase B/C (theme editor blocks, advanced layout)
- CEO + Eng review safety controls (capability graph, progressive publish, release state machine, etc.)
- Merchant Outcome Analytics Layer (explicitly deferred)

## Success criteria (master)

- **SC-M1**: Every V2 phase 1–21 has a `specs/0NN-*` directory with `spec.md`, `plan.md`, `tasks.md`.
- **SC-M2**: Shipped phases have tasks marked `[x]` or explicit deferred section with owner phase.
- **SC-M3**: `platform-v2-migration-plan.md` linked from gitbook SUMMARY and spec-driven-development doc.
- **SC-M4**: `master` CI passes `pnpm test` and package typechecks for shipped packages.

## Related specs

- Legacy product phases: [`docs/phase-plan.md`](../../docs/phase-plan.md), [`docs/implementation-status.md`](../../docs/implementation-status.md)
- Spec Kit workflow: [`docs/gitbook/02-architecture/spec-driven-development.md`](../../docs/gitbook/02-architecture/spec-driven-development.md)
