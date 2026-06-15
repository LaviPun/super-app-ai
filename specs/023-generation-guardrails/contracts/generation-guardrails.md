# Generation Guardrails Contracts — Phase 23

Source of truth: `packages/platform-contracts/src/generation-guardrails.ts`

## Schemas

| Schema | Purpose |
|--------|---------|
| `PromptEnvelopeSchema` | Delimited untrusted-input envelope: `{ tag, rawText, text, scan }`. `rawText` is verbatim merchant input (audit); `text` is the sanitized copy surfaced to the model. |
| `InjectionScanResultSchema` | `{ flagged, matches[], sanitizedText, originalLength, sanitizedLength }`. Result of scanning merchant text; flags + strips override attempts. |
| `InjectionMatchSchema` | One flagged pattern: `{ id, severity, label, matched }`. `matched` is truncated ≤ 120 chars (no PII/secret echo). |

## Constants

| Export | Value / meaning |
|--------|-----------------|
| `PROMPT_ENVELOPE_TAG` | `'user_request'` — the delimiter tag wrapping merchant text. |
| `PROMPT_ENVELOPE_SYSTEM_RULE` | System rule declaring the wrapped text is *data describing a desired module*, never instructions. |
| `INJECTION_PATTERN_IDS` | `ignore_previous`, `reveal_system_prompt`, `override_output_format`, `force_raw_html`, `set_type_override`, `role_or_delimiter_spoof`. |
| `INJECTION_SEVERITIES` | `low`, `medium`, `high`. |

## Helpers

- `renderPromptEnvelope(envelope)` — renders the `<user_request>…</user_request>` block; strips forged closing delimiters from the inner text so merchant input cannot close the block early.

## Consumers

- `apps/web/app/services/ai/injection-scan.server.ts` — `scanForInjection`, `buildPromptEnvelope`, `wrapUserRequestForPrompt`.
- `apps/web/app/services/ai/llm.server.ts` — prompt compilers embed `wrapUserRequestForPrompt(...)`.

## Invariants

- Generation never persists an unvalidated spec: `assertKnownDiscriminator` + `RecipeSpecSchema.parse` gate every path (`recipe-discriminator-guard.server.ts`).
- The scan **flags, never hard-blocks**; schema validation is the authoritative safety net.
