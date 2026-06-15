# Implementation Plan: 025 — Full Working Live Preview

**Spec**: [`spec.md`](./spec.md) · **Master index**: [`../000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

## Approach

Root cause: only `theme.section` and `proxy.widget` rendered rich HTML; everything else fell to `structuredWorkflowPreview` (a static diagram). WS4 replaces that default branch with real per-surface renderers and a deterministic Function simulator.

1. **Renderer registry.** `PreviewService.render` keeps the `theme.section` / `proxy.widget` rich renderers and routes all remaining types through `interactiveSurfacePreview`, which dispatches by type to a faithful surface mock (checkout / post-purchase / admin / customer account / POS / pixel / workflow). Function types route to the simulator. The static diagram (`structuredWorkflowPreview` + `getSurfaceFixture`) is **removed** — no dead code.

2. **Function simulation.** `function-simulation.server.ts` evaluates the compiled rule config against a `PreviewSimulationInput` fixture and returns concrete `PreviewSimulationResult` outcomes ("Cart $120, VIP → 15% off"; "method 'Economy' hidden"), including the non-Plus cart-transform fallback. Pure + deterministic ⇒ snapshot-testable.

3. **Compiled-payload drive.** The renderers read from `spec.config` (the deterministic compile input) and the simulator from the compiled rule config, so preview == what deploys. The `PreviewContext.simulation` fixture lets callers vary cart/customer context.

4. **Safety unchanged.** Custom HTML still passes through `sanitizePreviewHtml`; the iframe stays sandboxed + CSP-bound (013 precedent).

## Files

**New**
- `apps/web/app/services/preview/function-simulation.server.ts`
- `apps/web/app/__tests__/live-preview-all-surfaces.test.ts`

**Modified**
- `packages/platform-contracts/src/preview.ts` (+ `PreviewKindSchema`, simulation schemas, `defaultSimulationInput`)
- `apps/web/app/services/preview/preview.service.ts` (interactive renderers; removed the static diagram + fixture)
- `apps/web/app/__tests__/preview-service.test.ts` (updated to the interactive behavior)

## Verification

- `cd packages/platform-contracts && npx vitest run src/__tests__/preview-contracts.test.ts`
- `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/live-preview-all-surfaces.test.ts app/__tests__/preview-service.test.ts`

## Notes

- The brief's "26 types" is treated as approximate; coverage is asserted against the live `RECIPE_SPEC_TYPES` so the count can change without breaking the test.
