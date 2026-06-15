# Implementation Plan: 024 — Module Settings Uplift

**Spec**: [`spec.md`](./spec.md) · **Master index**: [`../000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

## Approach

The renderer half of WS3 already exists: `SchemaForm.tsx` consumes `{ schema (jsonSchema), uiSchema, value }` and is wired through `ConfigEditor`. This phase adds the AI **actions** around it and the transport contracts.

1. **Fill-missing** (`fill-missing-settings.server.ts`). Diff current config vs expected controls (from RequirementSpec / manifest), ask the AI for *only* the missing keys, and merge via the pure `buildFillMissingDiff` (contract) which never overwrites merchant-set or already-set values. Output is a `SettingsDiff`. Wired by `api.ai.fill-settings.tsx`.

2. **Regenerate** (same server module, `RegenerateSettingsRequestSchema`). Full re-gen for the same type, preserving `pinnedKeys` verbatim.

3. **Schema-driven form**. `SchemaForm` already derives widgets from JSON-schema (`enum→Select`, `boolean→Checkbox`, `number→numeric`, `format:uri→url`, `array→csv`, `string→text/textarea`) and honours tier + conditional visibility. This phase points the v2 settings tab at the hydrate `adminConfigSchemaJson` and keeps `ConfigEditor` as the v1 fallback behind the flag.

4. **Republish**. First-class recompile + idempotent publish with a visible `RepublishDiff` (the diff/idempotency contract lands in WS5 / `publish-functions.ts`); rollback reuses the existing rollback route.

## Files

**New**
- `packages/platform-contracts/src/module-settings.ts` (+ test)
- `apps/web/app/services/ai/fill-missing-settings.server.ts`
- `apps/web/app/__tests__/module-settings-uplift.test.ts`

**Existing (reused)**
- `apps/web/app/components/SchemaForm.tsx` — generic renderer (already present).
- `apps/web/app/routes/api.agent.modules.$moduleId.rollback.tsx` — rollback.

**Integration (route wiring — see tasks)**
- `apps/web/app/routes/api.ai.fill-settings.tsx` (new) — fill-missing action.
- `apps/web/app/routes/modules.$moduleId.tsx` — wire the four actions; point v2 settings at `adminConfigSchemaJson`.

## Verification

- `cd packages/platform-contracts && npx vitest run src/__tests__/module-settings.test.ts`
- `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/module-settings-uplift.test.ts`
