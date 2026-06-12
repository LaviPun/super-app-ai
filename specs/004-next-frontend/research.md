# Research: Phase 4 — Next.js Frontend Skeleton

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Next.js App Router on Cloudflare Pages (primary), Vercel optional

**Rationale:** Embedded Shopify UX needs streaming + Polaris + App Bridge. App Router gives RSC + streaming; Cloudflare Pages is the ADR-002 primary target with Vercel retained as the migration-time alternate. Frontend calls the API via `NEXT_PUBLIC_API_BASE_URL` — no long-running backend logic in the frontend (ADR-001).

**Alternatives considered:**

- Remix parity port — rejected (no benefit; Remix already legacy-canonical).
- Pages Router — rejected (App Router required for RSC streaming UX).

## Decision: Merchant cutover gated by `SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED`

**Rationale:** Internal route prefixes ship first (`FRONTEND_NEXT_ENABLED`); embedded merchant traffic flips only when the Polaris shell reaches parity (Phase 21).

## Open items

- [ ] Polaris embedded shell + App Bridge session wiring.
- [ ] CWV budget gate (constitution VI) once shell exists.
