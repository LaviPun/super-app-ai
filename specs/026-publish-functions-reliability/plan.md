# Implementation Plan: 026 — Publish + Functions Reliability

**Spec**: [`spec.md`](./spec.md) · **Master index**: [`../000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

## Approach

Today `compileRecipe` emits real ops for 11 types and `{ kind: 'AUDIT' }` for 9 — and publish does not deploy `.wasm`. The risk: a merchant previews a function/checkout module and "publishes" while nothing deploys. WS5 makes that impossible.

1. **Two-layer Functions contract** (`FunctionDeploymentContractSchema`). Layer (a): a wasm extension in `extensions/` shipped via `shopify app deploy` (build/CI). Layer (b): the app upserts per-module config to a metaobject the function reads at runtime. Documented in `docs/shopify-dev-setup.md`.

2. **Preflight classification** (`classifyModulePublishability`). Mirrors the compiler dispatch:
   - AUDIT-only types → `gated` ("not publishable yet", publishes nothing, says so).
   - Function types with wiring but no deployed extension → `blocked` (fail loudly, name the extension).
   - Everything with real wiring → `deployable`.
   `willDeploy === false` always carries a reason. Callers must not report "published" unless `willDeploy`.

3. **Idempotent republish** (`computeRepublishDiff`). Upsert by `metaobjectId`: `create` on first publish, `update` in place on change, `noop` when identical (no duplicate), `delete` on unpublish. Rollback reuses `api.agent.modules.$moduleId.rollback.tsx`.

## Files

**New**
- `packages/platform-contracts/src/publish-functions.ts` (+ test)
- `apps/web/app/__tests__/publish-functions-reliability.test.ts`

**Modified**
- `packages/platform-contracts/src/index.ts` (export)
- `apps/web/app/services/publish/publish-preflight.server.ts` (added `classifyModulePublishability`, `AUDIT_ONLY_TYPES`, `FUNCTION_EXTENSION_HANDLES`)

**Integration (see tasks)**
- `apps/web/app/services/publish/publish.service.ts` — call `classifyModulePublishability`; block `blocked`, surface `gated` honestly, upsert via `computeRepublishDiff`.

## Verification

- `cd packages/platform-contracts && npx vitest run src/__tests__/publish-functions.test.ts`
- `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/publish-functions-reliability.test.ts`
