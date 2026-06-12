# Research: Phase 8 — Internal Assistant Migration

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Self-hosted internal router default; Anthropic/Gemini opt-in

**Rationale:** The internal copilot defaults to the self-hosted Modal/Ollama router and treats Anthropic/Gemini as opt-in backends with a 30s timeout floor and Modal proxy chat passthrough. Keeps internal tooling cheap/private by default while allowing hosted models per-config.

**Alternatives considered:**

- Hosted-only — rejected (cost + data-egress for internal admin).
- Remix-only assistant indefinitely — rejected (Phase 8 goal is to move tool-run + readiness/chat onto the platform API).

## Decision: API stubs first, Remix remains source of truth for streaming UX

**Rationale:** `apps/api` exposes `InternalToolRunPayloadSchema` job enqueue + readiness/chat/SSE routes (Fastify + Worker parity via shared handlers); the rich Remix streaming UX stays canonical until the Next admin surface lands. `tasks.md` T004 intentionally unchecked.

## Open items

- [ ] Full proxy of assistant chat/tool-runs to workers.
- [ ] Document the backend matrix (self-hosted / Anthropic / Gemini) once WIP lands.
