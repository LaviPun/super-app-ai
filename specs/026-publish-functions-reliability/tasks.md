# Tasks: 026 — Publish + Functions Reliability

## Contract

- [x] Add `packages/platform-contracts/src/publish-functions.ts` — `FunctionDeploymentContractSchema`, `ModulePublishPreflightResultSchema`, `RepublishDiffSchema`, `computeRepublishDiff`.
  - `cd packages/platform-contracts && npx tsc --noEmit`
- [x] Add `src/__tests__/publish-functions.test.ts`; export from `index.ts`; rebuild.
  - `cd packages/platform-contracts && npx vitest run src/__tests__/publish-functions.test.ts && npm run build`

## App code

- [x] Add `classifyModulePublishability` + `AUDIT_ONLY_TYPES` + `FUNCTION_EXTENSION_HANDLES` to `publish-preflight.server.ts` (distinct from the existing scopes preflight).
  - `cd apps/web && npx tsc --noEmit`
- [x] Add `apps/web/app/__tests__/publish-functions-reliability.test.ts` (SC-001 no silent no-op; SC-002 idempotent republish; blocked-extension fail-loud).
  - `cd apps/web && npx vitest run app/__tests__/publish-functions-reliability.test.ts`

## Integration (publish service wiring)

- [x] `publish.service.ts`: gates via `classifyModulePublishability` before any deploy work — throws `ModuleNotPublishableError` (carrying the preflight) on `gated`/`blocked` so no caller reports "published" when nothing deploys; `api.publish.tsx` surfaces it as `422` with reasons. Deployed Function extensions are declared via `SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS`. Function-config writes use `computeRepublishDiff` (with a real `getFunctionConfigByKey` read) to skip no-op republishes; metaobjects stay handle-keyed (no duplicates).
  - `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/publish-functions-reliability.test.ts`
- [ ] Wire real publish for any AUDIT-only type that gains wiring (move it out of `AUDIT_ONLY_TYPES` and add a compiler branch).

## Doc sync

- [ ] `docs/shopify-dev-setup.md` — Functions two-layer deploy.
- [ ] `docs/superapp-surface-inventory.md` — publish status matrix.
- [ ] `docs/debug.md` — root cause for the silent-AUDIT publish gap.
- [ ] Authoritative end-to-end flow (generate→preview→publish→verify→republish→rollback) + dev-store smoke checklist for theme.section, a function, a checkout block.
- [ ] Add Phase 26 row to `specs/000-platform-v2-master/spec.md`.
