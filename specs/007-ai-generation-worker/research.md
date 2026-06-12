# Research: Phase 7 — AI Generation Worker

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: AI generation runs on the `ai-generation` queue with typed payloads

**Rationale:** `AiGenerationPayloadSchema` / `AiGenerationResultSchema` in `worker-payloads.ts` define the contract; the worker handler validates input, calls the model router, and must emit **RecipeSpec JSON only** (constitution I). Async path is gated by `AI_GENERATION_ASYNC_ENABLED` (+ `AI_GENERATION_STREAM_VIA_QUEUE_ENABLED` for streaming).

**Alternatives considered:**

- Inline generation in the API request — rejected (Cloudflare tunnel ~90s hard timeout; long generations must be async — see `docs/debug.md`).
- Free-form HTML output — rejected (violates RecipeSpec-only boundary).

## Status (honest)

Scaffold handler shipped; end-to-end generation, model routing, and in-worker RecipeSpec validation remain open (tracked in migration plan). `tasks.md` T004 is intentionally unchecked.

## Open items

- [ ] Wire model router + provider fallback into the worker.
- [ ] Validate generated RecipeSpec against `@superapp/core` before result emit.
