# Research: Phase 11 — Publish Worker

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Preflight-then-publish, behind flags

**Rationale:** Publish splits into a preflight check (`PublishPreflightPayloadSchema` / `PublishPreflightResultSchema` in `worker-payloads.ts`; core logic in `packages/core/publish-worker.ts`) and the actual theme deploy, gated by `PUBLISH_WORKER_ENABLED` / `shouldRunPublishWorker()`. Preflight catches RecipeSpec/theme issues before any mutation.

**Alternatives considered:**

- Single publish step — rejected (no safe dry-run; risky theme writes).
- Inline publish in request — rejected (long-running; tunnel timeout).

## Decision: RecipeSpec-only deploy boundary preserved

**Rationale:** Publish consumes compiled RecipeSpec; no arbitrary merchant code reaches theme deploy (constitution I).

## Status (honest)

Scaffold handler + preflight schemas shipped; production theme-deploy wiring remains; Remix-heavy publish path still canonical.

## Open items

- [ ] Wire production publish execution behind flags.
