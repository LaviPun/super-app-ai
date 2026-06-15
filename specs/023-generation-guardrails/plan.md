# Implementation Plan: 023 — Generation Guardrails

**Spec**: [`spec.md`](./spec.md) · **Master index**: [`../000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

## Approach

Guardrails are layered defence around the existing constrained-generation core (`RecipeSpec` discriminated union → deterministic compile). Nothing in the trust model changes; we add three boundaries:

1. **Untrusted-input envelope.** A single contract (`PromptEnvelopeSchema`) plus a server helper (`wrapUserRequestForPrompt`) that every prompt compiler calls in place of a raw `User request: …` interpolation. Centralising the wrap means no compiler can leak unwrapped merchant text. The accompanying `PROMPT_ENVELOPE_SYSTEM_RULE` tells the model the wrapped text is data describing a desired module.

2. **Injection scan.** `injection-scan.server.ts` runs a small set of regex pattern families (`InjectionPatternId`) over merchant text, returns an `InjectionScanResult` (flag + matches + sanitized text), and strips override attempts. It **flags, never hard-blocks** — schema validation is the real safety net.

3. **Schema-bound invariant.** `recipe-discriminator-guard.server.ts` rejects unknown/contradictory `type` discriminators before `RecipeSpecSchema.parse`, so `generateValidatedRecipe` short-circuits its repair loop rather than coercing a mistyped body.

The escape-hatch (`assertGeneratedPreviewHtmlIsSafe`, `sanitizeCustomCss`) and SSRF (`assertSafeTargetUrl` + connector allowlist) boundaries already exist; this phase adds/affirms regression tests rather than new mechanism.

## Data flow

```
merchant text
  → scanForInjection (flag + strip)            [injection-scan.server.ts]
  → buildPromptEnvelope → renderPromptEnvelope  [contract: PromptEnvelopeSchema]
  → compiled prompt (system rule + <user_request> block)
  → LLM → rawJson
  → assertKnownDiscriminator (reject unknown)   [recipe-discriminator-guard.server.ts]
  → RecipeSpecSchema.parse (+ repair on Zod error, re-validate)
  → persisted spec (always validated)
```

## Files

**New**
- `packages/platform-contracts/src/generation-guardrails.ts` (+ `__tests__/generation-guardrails.test.ts`)
- `apps/web/app/services/ai/injection-scan.server.ts`
- `apps/web/app/services/ai/recipe-discriminator-guard.server.ts`
- `apps/web/app/__tests__/generation-guardrails.test.ts`

**Modified**
- `packages/platform-contracts/src/index.ts` (export)
- `apps/web/app/services/ai/llm.server.ts` (envelope wiring in 3 compilers; discriminator guard + `expectedType` in `generateValidatedRecipe`)

## Verification

- `cd packages/platform-contracts && npx tsc --noEmit && npx vitest run`
- `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__/generation-guardrails.test.ts app/__tests__/ssrf-guard.test.ts`
- `pnpm --filter web evals` ≥ 0.9 schema validity (envelope must not regress generation quality).

## Risks

- Over-aggressive regexes could strip legitimate merchant phrasing (e.g. "set the type of discount to fixed"). Mitigated by keeping patterns narrow and flag-not-block; the sanitized text is only the *prompt* copy — `rawText` is retained for audit.
- Envelope changes the prompt body; eval run gates against a schema-validity regression before promotion.
