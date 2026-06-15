# Tasks: 024 — Module Settings Uplift

## Contract

- [x] Add `packages/platform-contracts/src/module-settings.ts` — `SettingsDiffSchema`, `FillMissingRequestSchema`, `RegenerateSettingsRequestSchema`, `AdminFormSchema`, `buildFillMissingDiff`.
  - `cd packages/platform-contracts && npx tsc --noEmit`
- [x] Add `src/__tests__/module-settings.test.ts`; export from `index.ts`; rebuild.
  - `cd packages/platform-contracts && npx vitest run src/__tests__/module-settings.test.ts && npm run build`

## App code

- [x] Add `apps/web/app/services/ai/fill-missing-settings.server.ts` (`missingControls`, `fillMissingSettings` with never-overwrite merge via the contract helper).
- [x] Confirm `apps/web/app/components/SchemaForm.tsx` renders from `{ jsonSchema, uiSchema, value }` (already present; derives widgets from JSON-schema; tier + conditional visibility).
  - `cd apps/web && npx tsc --noEmit`
- [x] Add `apps/web/app/__tests__/module-settings-uplift.test.ts` (SC-001 never-overwrite; proposer asked only for missing keys).
  - `cd apps/web && npx vitest run app/__tests__/module-settings-uplift.test.ts`

## Integration (route wiring)

- [x] Add `apps/web/app/routes/api.ai.fill-settings.tsx` — fill-missing action. Expected controls come from the hydrated `adminConfigSchemaJson` properties; the proposer reuses the validated `modifyRecipeSpec` path (same-type enforced); `buildFillMissingDiff` guarantees never-overwrite; persists via `createNewVersion`.
  - `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/module-settings-uplift.test.ts`
- [x] `modules.$moduleId.tsx`: wired the **Fill missing settings** action (fetcher + result banner + revalidate) into the hydration-done card; `SchemaForm`/`ConfigEditor` remains the renderer. Regenerate is already covered by **Regenerate full settings** (hydrate force) + **Rework recipe** (modify).
- [x] Visible `RepublishDiff` preview in the module detail Publish card — the loader computes `computeRepublishDiff(draft.config vs published.config)` and the UI shows `First publish` / `No changes (safe no-op)` / `Will update <fields>`. Republish reliability is enforced server-side in 026; rollback via `api.agent.modules.$moduleId.rollback.tsx`.
  - `cd apps/web && npx tsc --noEmit`

## Doc sync

- [ ] `docs/module-settings-modernization.md` — settings actions.
- [ ] Add Phase 24 row to `specs/000-platform-v2-master/spec.md`.
