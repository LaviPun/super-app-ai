# Feature Specification: Platform V2 Phase 22 — Requirements-First, Search-Augmented Generation

**Feature Directory**: `022-requirement-search-generation`

**Created**: 2026-06-14

**Last updated**: 2026-06-14

**Status**: **In progress** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`docs/module-system-v2.md`](../../docs/module-system-v2.md). See also [`docs/ai-providers.md`](../../docs/ai-providers.md) (call budget) and [`docs/catalog.md`](../../docs/catalog.md) (search-augment).

## Goal

Make generation higher-confidence by extracting a structured **RequirementSpec** before generating, grounding the prompt in the closest existing templates (search-augmented / RAG), enforcing an explicit per-create **call budget**, and emitting a **coverage report** that auto-triggers fill-missing when controls are absent. Workstream WS1; builds on the 023 envelope. Depends on the v2 control-pack manifests for deterministic control derivation.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **In progress** |
| Contract | `packages/platform-contracts/src/requirement-spec.ts` (`RequirementSpecSchema`, `GenerationCoverageReportSchema`, `computeCoverageReport`) + test |
| App code | `requirement-spec.server.ts` (deterministic-first extraction), `solution-search.server.ts` (RAG grounding) |
| Tests | `apps/web/app/__tests__/requirement-search-generation.test.ts` |
| Flag | Lands on the `?engine=v2` create path; v1 unchanged |

## Acceptance

- RequirementSpec is extracted deterministic-first (IntentPacket + classify + manifest), escalating to **one** LLM call only when confidence < `CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES`.
- Search-augment injects the best 2–3 existing templates as grounding and returns them as "start from" options.
- The create call budget is asserted: ≤ 1 classify-LLM (conditional) + ≤ 1 router (optional) + N generation + per-option repair. No new always-on hop.
- Every response carries a `GenerationCoverageReport`; < 100% coverage auto-invokes WS3 fill-missing.

## Success criteria

- **SC-001**: RequirementSpec validates for every `RECIPE_SPEC_TYPES` type.
- **SC-002**: Search-augment raises first-try schema validity on the eval set (measure vs baseline via `AiUsage`).
- **SC-003**: Coverage report present on every response; < 100% triggers auto-fill.
- **SC-004**: Call budget asserted by a test that counts LLM invocations per create.

### Expanded criteria

- **SC-001a**: Extraction is pure/deterministic for high-confidence classifications (no escalation call); `source` reflects `deterministic` vs `llm_escalated`.
- **SC-002a**: `solution-search` ranks deterministically (type match + token/tag overlap + capability-surface intersection); top-k bounded by `topK` (default 3); no extra LLM hop.
- **SC-003a**: `computeCoverageReport` derives `missing[]` from the manifest's required controls; `missing[]` is the fill-missing input handed to WS3.
