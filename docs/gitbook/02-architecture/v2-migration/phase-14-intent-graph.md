# Platform V2 — Phase 14 Intent Graph And Recipe DSL

**Status:** Schema/compiler foundations in `@superapp/core`; production pipeline not enabled  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 14

## Code map

| Area | Path |
|------|------|
| Intent packet schema | `packages/core/src/intent-packet.ts` |
| Intent graph | `packages/core/src/intent-graph.ts` |
| Recipe DSL | `packages/core/src/recipe-dsl.ts` |
| RecipeSpec output | `packages/core/src/recipe.ts` |
| Rollout gate | `INTENT_GRAPH_ENABLED` in `packages/platform-contracts/src/rollout-cutover.ts` |

## Pipeline (target)

Natural language → classification → intent graph → Recipe DSL → RecipeSpec → validation/repair → preview → publish (after approval).

## Safety rules

- AI output remains **RecipeSpec JSON only** (no merchant code deployment).
- Enable `INTENT_GRAPH_ENABLED` only after eval gate passes (see `pnpm evals` / `evals:strict` in legacy web app).

## Verification

```bash
pnpm --filter @superapp/core test -- intent-graph recipe-dsl
```
