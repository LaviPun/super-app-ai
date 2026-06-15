# Preview Simulation Contracts — Phase 25

Source of truth: `packages/platform-contracts/src/preview.ts` (extended)

## Schemas

| Schema | Purpose |
|--------|---------|
| `PreviewKindSchema` / `PREVIEW_KINDS` | Enum covering every `RECIPE_SPEC_TYPES` entry. The app asserts `RECIPE_SPEC_TYPES ⊆ PREVIEW_KINDS` so the renderer registry cannot drift. |
| `PreviewLineItemSchema` | `{ sku, title, price, quantity, tags[] }` — one cart line in a fixture. |
| `PreviewSimulationInputSchema` | `{ currency, countryCode, customerTags[], lineItems[], methods[], isPlus }` — deterministic fixture fed through a compiled Function rule config. |
| `PreviewSimulationResultSchema` | `{ kind, outcomes[], fallbackNote? }`. |
| `PreviewSimulationOutcomeSchema` | `{ label, detail, effect }`. `effect` ∈ `applied / hidden / renamed / reordered / blocked / bundled / constrained / routed / none`. |

## Helpers

- `defaultSimulationInput()` — VIP customer, $152 cart, Standard/Economy/Express methods, Plus store.

## Existing preview safety (unchanged, 013)

- `PREVIEW_SANDBOX_CSP`, `PREVIEW_IFRAME_SANDBOX`, `defaultPreviewPolicy()`, `assertPreviewContentIsRecipeSafe()`.

## Consumers

- `apps/web/app/services/preview/function-simulation.server.ts` — `simulateFunction`.
- `apps/web/app/services/preview/preview.service.ts` — per-surface interactive renderers + `functionSimulationPreview`.
