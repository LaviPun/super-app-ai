# Implementation Plan: 022 — Requirements-First, Search-Augmented Generation

**Spec**: [`spec.md`](./spec.md) · **Master index**: [`../000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

## Approach

Generation today is classify → cheap-classify → router → N parallel RecipeSpec generations with per-call repair. WS1 inserts two deterministic-first stages before generation and one gate after:

1. **RequirementSpec extraction** (`requirement-spec.server.ts`). Derives `{ goal, surface, moduleType, mustHaveControls[], dataNeeds[], audience, triggers[], successCriteria[], tier }` from the existing classify result + IntentPacket + the v2 control-pack manifest (`getManifest`). `mustHaveControls` come from the manifest packs (basic) / packs + advancedPacks (advanced). Escalates to a single injected LLM call only when `confidenceScore < CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES`.

2. **Search-augment** (`solution-search.server.ts`). Ranks `MODULE_TEMPLATES` by type match + token/tag overlap + capability-surface intersection with the requirement, returns top-k grounding text (injected into `compileCreateSingleRecipePrompt` via the existing `catalogDetails`/grounding slot) and `startFrom[]` options for the client.

3. **Coverage gate** (`computeCoverageReport`, contract). After generation, compute which `mustHaveControls` the spec exposes; `missing[]` < 100% hands off to WS3 fill-missing.

The LLM escalation in (1) is injected (`escalate?`) so the call budget is explicit and unit tests stay deterministic — the create route supplies the real one-shot extractor.

## Data flow

```
userRequest + classification + IntentPacket
  → extractRequirementSpec  (≤1 conditional LLM call)   [requirement-spec.server.ts]
  → searchSolutions         (0 LLM calls, deterministic) [solution-search.server.ts]
  → grounding injected into create prompt
  → N generations + per-option repair (WS2 envelope + discriminator guard)
  → computeCoverageReport   (per option)                 [contract]
  → missing? → WS3 fill-missing
```

## Files

**New**
- `packages/platform-contracts/src/requirement-spec.ts` (+ test)
- `apps/web/app/services/ai/requirement-spec.server.ts`
- `apps/web/app/services/ai/solution-search.server.ts`
- `apps/web/app/__tests__/requirement-search-generation.test.ts`

**Modified (integration — see tasks)**
- `packages/platform-contracts/src/index.ts` (export)
- `apps/web/app/routes/api.ai.create-module.tsx` (call extraction + search; persist RequirementSpec on the AI_GENERATE payload; attach coverage report to the response; emit `startFrom`)

## Call budget

Asserted by counting LLM invocations per create: ≤ 1 classify-LLM (conditional) + ≤ 1 router (optional) + N generation + per-option repair. Extraction adds **0** always-on hops (deterministic), at most 1 conditional escalation. Search adds **0**. Per-stage tokens logged via the existing `AiUsage`.

## Verification

- `cd packages/platform-contracts && npx tsc --noEmit && npx vitest run src/__tests__/requirement-spec.test.ts`
- `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/requirement-search-generation.test.ts`
- `pnpm --filter web evals` — first-try schema validity vs baseline (SC-002).
