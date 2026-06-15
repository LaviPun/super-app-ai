# Tasks: 025 — Full Working Live Preview

## Contract

- [x] Extend `packages/platform-contracts/src/preview.ts` — `PreviewKindSchema` (every `RECIPE_SPEC_TYPES`), `PreviewLineItemSchema`, `PreviewSimulationInputSchema`, `PreviewSimulationResultSchema`, `defaultSimulationInput`.
  - `cd packages/platform-contracts && npx tsc --noEmit && npm run build`

## App code

- [x] Add `apps/web/app/services/preview/function-simulation.server.ts` (`simulateFunction`, `isFunctionPreviewKind`).
- [x] Replace the `default` branch in `PreviewService.render` with `interactiveSurfacePreview`; add checkout / post-purchase / admin / account / POS / pixel / workflow / function-simulation renderers.
- [x] Remove the static `structuredWorkflowPreview` + `getSurfaceFixture` (no dead code).
  - `cd apps/web && npx tsc --noEmit`
- [x] Add `apps/web/app/__tests__/live-preview-all-surfaces.test.ts` (SC-001 every type interactive; SC-003 simulation outcomes; `PREVIEW_KINDS ⊇ RECIPE_SPEC_TYPES`).
- [x] Update `preview-service.test.ts` to the interactive behavior.
  - `cd apps/web && npx vitest run app/__tests__/live-preview-all-surfaces.test.ts app/__tests__/preview-service.test.ts`

## Integration / follow-up

- [x] Wire `PreviewContext.simulation` from the preview UI: `api.preview.tsx` accepts an optional `simulation` field (validated by `PreviewSimulationInputSchema`); `modules.$moduleId.tsx` renders a Polaris simulation panel (currency / country / Plus toggle) for Function modules that re-renders the deterministic Function simulation. _(Driving renderers from the compiled payload object where it diverges from `spec.config` is still pending.)_
  - `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/live-preview-all-surfaces.test.ts`
- [ ] Exercise full theme/proxy interactive state toggles (open/closed, before/after submit, countdown) — partially present via existing kind renderers.

## Doc sync

- [ ] `docs/superapp-surface-inventory.md` — preview status matrix (all types: interactive).
- [ ] `docs/debug.md` — root-cause section for the "previewed buttons, published nothing" preview gap.
- [ ] Add Phase 25 row to `specs/000-platform-v2-master/spec.md`.
