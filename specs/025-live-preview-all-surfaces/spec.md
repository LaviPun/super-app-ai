# Feature Specification: Platform V2 Phase 25 — Full Working Live Preview for Every Surface

**Feature Directory**: `025-live-preview-all-surfaces`

**Created**: 2026-06-14

**Last updated**: 2026-06-14

**Status**: **In progress** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`docs/module-system-v2.md`](../../docs/module-system-v2.md). Closest precedent: [`specs/013-preview-sandbox/spec.md`](../013-preview-sandbox/spec.md). See also [`docs/superapp-surface-inventory.md`](../../docs/superapp-surface-inventory.md) (preview status matrix).

## Goal

Make **every** RecipeSpec type fully previewable as a real, interactive render — not the static diagram. Drive previews from the compiled payload (preview == what deploys), give each surface a faithful renderer, and simulate Functions deterministically against fixtures. Workstream WS4; paired with WS5/026 as the highest-leverage fix for the "previewed buttons, published nothing" bug class.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **In progress** |
| Contract | `packages/platform-contracts/src/preview.ts` extended: `PreviewKindSchema` (every `RECIPE_SPEC_TYPES`), `PreviewSimulationInputSchema`, `PreviewSimulationResultSchema` + test |
| App code | `function-simulation.server.ts`; per-surface renderers in `preview.service.ts` (checkout, post-purchase, admin, account, POS, pixel, workflow, function-sim); static diagram removed |
| Tests | `apps/web/app/__tests__/live-preview-all-surfaces.test.ts`, updated `preview-service.test.ts` |
| Flag | Live-preview path; CSP-bound + sandboxed as in 013 |

## Acceptance

- Previews are driven from the compiled payload, not the raw spec.
- Per-surface real renderers exist (theme/proxy already rich; checkout/post-purchase/account/admin/POS faithful mocks; Functions deterministic simulation).
- Every `RECIPE_SPEC_TYPES` entry yields an interactive preview — none falls to the generic diagram.
- All previews remain CSP-bound + sandboxed.

## Success criteria

- **SC-001**: All types return an interactive preview, not the placeholder (test).
- **SC-002**: Preview is generated from the compiled payload.
- **SC-003**: Function simulation outputs match the compiled rule for fixtures (snapshot test).
- **SC-004**: No executable vectors escape the sandbox.

### Expanded criteria

- **SC-001a**: `PREVIEW_KINDS ⊇ RECIPE_SPEC_TYPES` is test-asserted so the renderer registry cannot drift; the removed static-diagram markers must never reappear.
- **SC-003a**: `simulateFunction` evaluates discount / delivery / payment / validation / cart-transform / fulfilment / routing configs against `PreviewSimulationInput`, including the non-Plus cart-transform fallback.
- **SC-004a**: Custom HTML/JS passes through `sanitizePreviewHtml` (scripts/iframes/on*=/javascript: stripped); the iframe stays sandboxed.

> Note: the brief cites "26 types"; the live discriminated union (`RECIPE_SPEC_TYPES`) currently has 20. Coverage is asserted dynamically against `RECIPE_SPEC_TYPES.length`, so the test stays correct as types are added/collapsed.
