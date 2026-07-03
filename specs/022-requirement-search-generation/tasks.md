# Tasks: 022 — Requirements-First, Search-Augmented Generation

## Contract

- [x] Add `packages/platform-contracts/src/requirement-spec.ts` — `RequirementSpecSchema`, `GenerationCoverageReportSchema`, `computeCoverageReport`.
  - `cd packages/platform-contracts && npx tsc --noEmit`
- [x] Add `src/__tests__/requirement-spec.test.ts`; export from `index.ts`; rebuild.
  - `cd packages/platform-contracts && npx vitest run src/__tests__/requirement-spec.test.ts && npm run build`

## App code

- [x] Add `apps/web/app/services/ai/requirement-spec.server.ts` (deterministic-first + injected one-shot escalation, `mustHaveControlsForType`).
- [x] Add `apps/web/app/services/ai/solution-search.server.ts` (`searchSolutions`, top-k grounding + `startFrom`).
  - `cd apps/web && npx tsc --noEmit`
- [x] Add `apps/web/app/__tests__/requirement-search-generation.test.ts` (SC-001 all types validate; deterministic vs escalated; search ranking; coverage gate).
  - `cd apps/web && npx vitest run app/__tests__/requirement-search-generation.test.ts`

## Integration (route wiring)

- [x] `api.ai.create-module.tsx`: call `extractRequirementSpec` (deterministic; escalator slot available), `searchSolutions`; inject `grounding` into the create prompt via `generateValidatedRecipeOptions({ groundingBlock })` (threaded through both compilers + all three option generators); persist `RequirementSpec` + `startFromIds` on the `AI_GENERATE` job payload; attach `GenerationCoverageReport` (best option's config) + `startFrom` to the response.
  - `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/ai-generate-options.test.ts`
- [ ] Add a call-budget assertion test counting LLM invocations per create (SC-004). _(deterministic extraction adds 0 LLM calls; grounding is RAG-only — budget unchanged.)_
- [~] ~~On coverage < 100%, auto-invoke WS3 fill-missing~~ — **reverted 2026-07-03 (spec 027).** The create-time coverage compared manifest pack **ids** against the bespoke generated config (which never uses control-pack composition), so it could never be "complete" and the v2 auto-fill fired a wasted `modifyRecipeSpec` call on every create that could not match. Removed the coverage report + auto-fill; kept RequirementSpec + grounding. Completeness ("fill missing") is a **post-hydrate** action only (024). `mustHaveControlsForType` now returns namespaces. See `docs/debug.md §21`.
  - `cd apps/web && npx vitest run app/__tests__/requirement-search-generation.test.ts`

## Doc sync

- [ ] `docs/ai-providers.md` — call-budget table; `docs/catalog.md` — search-augment.
- [ ] Add Phase 22 row to `specs/000-platform-v2-master/spec.md`.
