# Research: Phase 13 — Preview Sandbox

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Server-rendered envelope + strict CSP, HTML safety gate

**Rationale:** Preview content is delivered as a typed envelope (`PreviewEnvelopeSchema` in `preview.ts`) and served under `PREVIEW_SANDBOX_CSP`. `assertPreviewContentIsRecipeSafe()` rejects scripts/inline handlers so preview HTML can never execute arbitrary code (constitution I + V). Storage keys via `buildPreviewStorageKey()` / `buildAssetStorageKey()`.

**Alternatives considered:**

- AI-generated preview HTML — rejected; `PreviewService` renders deterministically (no AI in preview path; see project memory).
- Loose CSP for convenience — rejected (XSS / sandbox escape).

## Decision: Fastify + Worker parity for `/v1/preview/*`

**Rationale:** Same handlers serve both backends; envelope vs content split lets the frontend cache structure separately from HTML.

## Open items

- [ ] Expand `plan.md` from summary to filled.
- [ ] Merchant-facing preview UX (depends on Phase 4 shell).
