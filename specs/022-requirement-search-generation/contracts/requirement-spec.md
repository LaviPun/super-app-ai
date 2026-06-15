# Requirement & Coverage Contracts — Phase 22

Source of truth: `packages/platform-contracts/src/requirement-spec.ts`

## Schemas

| Schema | Purpose |
|--------|---------|
| `RequirementSpecSchema` | Structured pre-generation intent: `{ goal, surface, moduleType, mustHaveControls[], dataNeeds[], audience, triggers[], successCriteria[], tier, source }`. Persisted on the `AI_GENERATE` job payload. |
| `RequirementDataNeedSchema` | `{ name, type, direction: 'read'|'capture', required }` — one data field the module reads or captures. |
| `GenerationCoverageReportSchema` | `{ moduleType, controls[], satisfied, total, ratio, complete, missing[] }`. Present on every generation response; `complete === false` triggers WS3 fill-missing. |

## Constants

- `REQUIREMENT_TIERS` = `['basic', 'advanced']`.
- `source` ∈ `'deterministic' | 'llm_escalated'` — records whether extraction needed the conditional LLM hop.

## Helpers

- `computeCoverageReport({ moduleType, mustHaveControls, presentControls })` — pure; derives `satisfied/total/ratio/complete/missing`. `total === 0` ⇒ `ratio === 1` (complete).

## App-layer binding

`moduleType` / `surface` are validated as non-empty strings here (the package is `@superapp/core`-free). The app layer (`requirement-spec.server.ts`) binds them to `RECIPE_SPEC_TYPES` / `SHOPIFY_SURFACES` / `MODULE_TYPE_TO_SURFACE` and derives `mustHaveControls` from the v2 control-pack manifest (`getManifest`).

## Consumers

- `apps/web/app/services/ai/requirement-spec.server.ts` — `buildDeterministicRequirementSpec`, `extractRequirementSpec`, `mustHaveControlsForType`.
- `apps/web/app/services/ai/solution-search.server.ts` — `searchSolutions` (ranks `MODULE_TEMPLATES`).
