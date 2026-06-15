# Feature Specification: Platform V2 Phase 23 — Generation Guardrails / Prompt-Injection Harness

**Feature Directory**: `023-generation-guardrails`

**Created**: 2026-06-14

**Last updated**: 2026-06-14

**Status**: **In progress** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`docs/module-system-v2.md`](../../docs/module-system-v2.md) — source of truth for the v2 module-generation uplift. See also [`docs/ai-providers.md`](../../docs/ai-providers.md) (call budget, guardrails).

## Goal

Harden constrained generation against prompt injection and untrusted-input abuse **without weakening the RecipeSpec trust boundary**. Merchant free text is always treated as data, never instructions; every emitted spec is schema-validated; the escape-hatch and outbound-URL boundaries are test-proven. This is workstream WS2 of the module-generation uplift and the first phase in the build order (`023 → 022 → 024 → 025 → 026`).

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **In progress** |
| Contract | `packages/platform-contracts/src/generation-guardrails.ts` (`PromptEnvelopeSchema`, `InjectionScanResultSchema`) + `__tests__/generation-guardrails.test.ts` |
| App code | `injection-scan.server.ts`, `recipe-discriminator-guard.server.ts`, envelope wiring in `llm.server.ts` prompt compilers |
| Tests | `apps/web/app/__tests__/generation-guardrails.test.ts`, existing `ssrf-guard.test.ts` / `assert-safe-target-url.test.ts` / `style-compiler.test.ts` |
| Flag | Lands on the shared generation path used by `?engine=v2`; v1 path unchanged |

## Acceptance

- Merchant text in **every** prompt compiler (`compileCreateModulePrompt`, `compileCreateSingleRecipePrompt`, `compileModifyModulePrompt`, hydrate, repair) is wrapped in a delimited `<user_request>` envelope validated by `PromptEnvelopeSchema`, accompanied by a system rule declaring the wrapped text is data, not instructions.
- A non-blocking injection scanner flags and strips known override patterns and is covered by a regression corpus.
- Every generation path goes through `RecipeSpecSchema` + repair + re-validate; a wrong/unknown discriminator is **rejected, not repaired**.
- Escape-hatch executable vectors and arbitrary outbound URLs are blocked in both preview and compiled artifacts, proven by tests.

## Success criteria

- **SC-001**: Injection corpus cannot change the emitted type or output format.
- **SC-002**: Zero unvalidated-spec persistence paths (test-proven).
- **SC-003**: Escape-hatch executable vectors blocked in both preview and compiled artifacts.
- **SC-004**: Arbitrary outbound URLs rejected.

### Expanded criteria

- **SC-001a**: The `<user_request>` delimiter cannot be force-closed by merchant text — forged closing tags inside the body are stripped before rendering (`renderPromptEnvelope`).
- **SC-001b**: The system rule names the delimiter tag and is present in every compiled prompt that carries merchant text.
- **SC-002a**: `assertKnownDiscriminator` runs before `RecipeSpecSchema.parse` in `generateValidatedRecipe`; a `RecipeDiscriminatorError` short-circuits the repair/retry loop (no further LLM calls, no persistence).
- **SC-004a**: Outbound endpoints route through `assertSafeTargetUrl` (SSRF allow/deny + cloud-metadata + private-range blocks) and the connector allowlist; a rejection test asserts arbitrary hosts fail.
