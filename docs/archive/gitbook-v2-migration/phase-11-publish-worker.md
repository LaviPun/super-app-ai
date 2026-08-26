# Platform V2 — Phase 11 Publish Worker

**Status:** Core publish boundary + queue stub shipped; live Shopify admin wiring remains in Remix until cutover  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 11

## Code map

| Layer | Path |
|-------|------|
| RecipeSpec-only publish core | `packages/core/src/publish-worker.ts` (`runPublishJob`) |
| Legacy Remix adapters | `apps/web/app/services/publish/publish-worker.adapter.server.ts` |
| Queue worker (stub adapter) | `apps/workers/src/publish-execution.ts` |
| Processor registration | `apps/workers/src/processors.ts` (gated by `PUBLISH_WORKER_ENABLED` + `JOB_EXECUTION_MODE=queue`) |
| Job contract | `packages/platform-contracts` → `PublishPayloadSchema` |

## Behavior

- **Default:** `PUBLISH` jobs validate queue payload contracts only (no Shopify apply).
- **When enabled:** Worker calls `runPublishJob` with an in-memory stub adapter (RecipeSpec-only operations, no merchant code execution).
- **Production path (future):** Wire `createLegacyPublishWorkerAdapters` or V2 Shopify client behind the same `runPublishJob` boundary after session store cutover.

## Verification

```bash
pnpm --filter @superapp/core test -- publish-worker
pnpm --filter @superapp/workers test -- publish-execution processors
```
