# Tasks: 023 — Generation Guardrails

Each task lists its verification command. Run from repo root unless noted.

## Contract

- [x] Add `packages/platform-contracts/src/generation-guardrails.ts` — `PromptEnvelopeSchema`, `InjectionScanResultSchema`, `PROMPT_ENVELOPE_TAG`, `PROMPT_ENVELOPE_SYSTEM_RULE`, `renderPromptEnvelope`.
  - `cd packages/platform-contracts && npx tsc --noEmit`
- [x] Add `packages/platform-contracts/src/__tests__/generation-guardrails.test.ts`.
  - `cd packages/platform-contracts && npx vitest run src/__tests__/generation-guardrails.test.ts`
- [x] Export from `packages/platform-contracts/src/index.ts`; rebuild dist.
  - `cd packages/platform-contracts && npm run build`

## App code — envelope

- [x] Add `apps/web/app/services/ai/injection-scan.server.ts` (`scanForInjection`, `buildPromptEnvelope`, `wrapUserRequestForPrompt`).
- [x] Wire `wrapUserRequestForPrompt` into `compileCreateModulePrompt`, `compileCreateSingleRecipePrompt`, `compileModifyModulePrompt` in `llm.server.ts`.
  - `cd apps/web && npx tsc --noEmit`

## App code — schema-bound invariant

- [x] Add `apps/web/app/services/ai/recipe-discriminator-guard.server.ts` (`assertKnownDiscriminator`, `RecipeDiscriminatorError`).
- [x] Wire guard + `expectedType` option into `generateValidatedRecipe`; reject (don't repair) on discriminator error.
  - `cd apps/web && npx tsc --noEmit`

## Tests

- [x] Add `apps/web/app/__tests__/generation-guardrails.test.ts` — injection corpus (SC-001), envelope forge-close (SC-001a), discriminator reject (SC-002a).
  - `cd apps/web && npx vitest run app/__tests__/generation-guardrails.test.ts`
- [x] Affirm escape-hatch + SSRF coverage (SC-003/SC-004) via existing `style-compiler.test.ts`, `ssrf-guard.test.ts`, `assert-safe-target-url.test.ts`.
  - `cd apps/web && npx vitest run app/__tests__/ssrf-guard.test.ts app/__tests__/assert-safe-target-url.test.ts app/__tests__/style-compiler.test.ts`

## Doc sync

- [ ] `docs/ai-providers.md` — guardrails + call-budget note (consolidated pass with 022/024/025/026).
- [ ] `docs/debug.md` — root-cause section for the injection/trust-boundary hardening.
- [ ] Add Phase 23 row to `specs/000-platform-v2-master/spec.md`.
