# Publish + Functions Contracts — Phase 26

Source of truth: `packages/platform-contracts/src/publish-functions.ts`

## Schemas

| Schema | Purpose |
|--------|---------|
| `FunctionDeploymentContractSchema` | Two-layer Functions deploy: `{ functionType, extensionHandle, wasmDeployed, configMetaobjectType }`. (a) `extensionHandle` + `wasmDeployed` = the wasm shipped via `shopify app deploy`; (b) `configMetaobjectType` = the metaobject the function reads at runtime. |
| `ModulePublishPreflightResultSchema` | `{ moduleType, status: 'deployable'|'gated'|'blocked', reasons[], requiresExtension?, willDeploy }`. Caller must not report "published" unless `willDeploy`. |
| `RepublishDiffSchema` | `{ moduleType, metaobjectType, metaobjectId?, action: 'create'|'update'|'noop'|'delete', changedFields[] }`. |

## Helpers

- `computeRepublishDiff({ moduleType, metaobjectType, existing, next })` — **pure** upsert diff. `existing=null,next=cfg ⇒ create`; identical ⇒ `noop` (no duplicate); changed ⇒ `update` by id; `next=null ⇒ delete`. SC-002 idempotency lives here.

## Naming note

`ModulePublishPreflightResultSchema` is intentionally distinct from the pre-existing worker-job `PublishPreflightResultSchema` in `worker-payloads.ts` (async preflight job result). This one is the per-module publishability classification.

## Consumers

- `apps/web/app/services/publish/publish-preflight.server.ts` — `classifyModulePublishability`, `AUDIT_ONLY_TYPES`, `FUNCTION_EXTENSION_HANDLES`.
- `apps/web/app/services/publish/publish.service.ts` — (integration) enforce + upsert.
