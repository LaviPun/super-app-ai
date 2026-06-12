# Research: Phase 14 — Intent Graph & Recipe DSL

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: In-memory intent graph first, schema-defined nodes/edges

**Rationale:** `@superapp/intent-graph` ships an in-memory store backed by `core/intent-graph.ts` + `intent-packet.ts` schemas, so intent capture and Recipe DSL parsing (`recipe-dsl.ts`) can be exercised and tested before committing to a durable store. Keeps the graph contract stable while the backing store evolves.

**Alternatives considered:**

- Postgres/graph DB up front — deferred (premature; schema still moving).
- Embed intent directly in RecipeSpec — rejected (intent is upstream of compilation).

## Status (honest)

In-memory package + schemas shipped; production graph store and full Recipe DSL integration remain open.

## Open items

- [ ] Choose durable store; map in-memory contract to it.
- [ ] Wire Recipe DSL → intent graph → generation pipeline.
