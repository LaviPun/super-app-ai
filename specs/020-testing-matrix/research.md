# Research: Phase 20 — Testing Matrix

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)

## Decision: Per-package V2 test jobs + a `test:v2*` aggregate, gated in CI

**Rationale:** Each V2 app/package runs its own build+test workflow (`v2-api-build.yml`, `v2-workers-build.yml`, `v2-frontend-build.yml`, `v2-matrix.yml`) so failures are localized and PRs only run affected suites by path filter. `pnpm test:v2*` scripts give a single local entry point.

**Alternatives considered:**

- One monolithic CI job — rejected (slow, poor failure isolation).
- No path filters — rejected (every PR runs everything).

## Decision: Single source of truth for test counts

**Rationale:** Documented counts drifted (163 vs 253 vs 347; M1). The canonical count is whatever `audit/test-baseline.json` records after a full run; prose docs link to it rather than hard-coding numbers.

## Status (honest)

Package suites green in CI; cross-service integration matrix and Remix prod-build-in-CI remain open.

## Open items

- [ ] Cross-service integration matrix.
- [ ] Regenerate `test-baseline.json` and reconcile prose counts.
