# Research: Phase 15 — Data Layer Productionization

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Repository abstraction over storage; in-memory now, Postgres target

**Rationale:** `@superapp/data-layer` exposes repository interfaces with an in-memory implementation so callers code against the contract, not Prisma directly. Postgres is the production target; the repository seam makes the cutover a swap rather than a rewrite.

**Alternatives considered:**

- Call Prisma everywhere — rejected (couples services to ORM + datasource).
- Skip Postgres, stay on SQLite — rejected (SQLite is dev default only; not durable/concurrent for prod).

## Status (honest)

In-memory repository + schemas shipped; SQLite remains the default Prisma datasource (`packages/db`); Postgres productionization + Prisma alignment remain open (drift item M6).

## Open items

- [ ] Promote Postgres datasource; document migration path.
- [ ] Align `packages/db` Prisma models with repository schemas.
