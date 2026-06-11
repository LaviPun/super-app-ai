# Implementation Plan: Platform V2 — Master Index

**Branch**: `master` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

## Summary

Maintain a single source of truth for Platform V2 migration spec coverage. Phase 12 is the only V2 phase fully merged to `master` as of 2026-06-12 (PR #8). Remaining phases are stubbed for Spec Kit workflows; implementation proceeds in dependency order from the canonical migration plan.

## Recommended merge sequence

1. Phases 3–6 (API, frontend, job orchestration, worker skeleton) — foundation
2. Phases 7–11 (AI, assistant, webhook/flow, connector, publish workers)
3. Phase 12 — **done on master** (stack with queue merge when 5+9–11 land)
4. Phases 13–21 (preview, intent graph, data, observability, security, deploy, UX, tests, cutover)

## Technical context

**Monorepo (target)**: `apps/frontend`, `apps/api`, `apps/workers`, `apps/web` (legacy), `packages/platform-contracts`, `packages/core`

**On `master` today**: `apps/web`, `apps/workers`, `packages/platform-contracts` (partial), `packages/core`

**Active Spec Kit feature for new work**: set `SPECIFY_FEATURE=000-platform-v2-master` for cross-phase tracking, or `SPECIFY_FEATURE=0NN-<phase>` for a specific phase.

## Constitution check

All V2 phases must preserve RecipeSpec-only deployment, Zod at boundaries, and no secrets/PII in logs — see [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).
