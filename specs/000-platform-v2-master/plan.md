# Implementation Plan: Platform V2 — Master Index

**Branch**: `master` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

## Summary

Maintain a single source of truth for Platform V2 migration spec coverage. As of 2026-06-12, core async paths are implemented on `master`: job orchestration (5), Fastify/Worker API (3), worker skeleton (6), storage/image worker (12), preview sandbox (13), deployment (18), and rollout contracts (21). Remaining phases are partial (feature work pending) but every phase now carries a full Spec Kit artifact set (spec/plan/tasks/research); see [spec-kit-status-report.md](../../docs/spec-kit-status-report.md).

**Hosting:** ADR-002 scoped policy — Cloudflare primary; Fastify/Railway alternate via `PLATFORM_BACKEND=fastify`.

## Recommended merge sequence

1. Phases 3–6 — **shipped on master** (API, job orchestration, worker skeleton; frontend partial)
2. Phases 7–11 — partial scaffolds; expand before marking Shipped
3. Phase 12 — **shipped**
4. Phase 13 — **shipped**
5. Phases 14–17 — partial packages; research/plan stubs remain
6. Phase 18 — partial (CF deploy + runbook; CI + operator provisioning pending)
7. Phases 19–20 — partial (async UX components + test matrix gaps)
8. Phase 21 — partial (flags shipped; traffic cutover pending)

## Technical context

**Monorepo (target)**: `apps/frontend`, `apps/api`, `apps/workers`, `apps/web` (legacy Remix), `packages/platform-contracts`, `packages/job-orchestration`, `packages/core`, `packages/network-security`, `extensions/*`

**On `master` today**: `apps/web`, `apps/api`, `apps/workers`, `apps/frontend` (partial), `packages/platform-contracts`, `packages/job-orchestration`, `packages/core`, `packages/network-security`, worker/API CF wrangler configs

**Active Spec Kit feature for new work**: set `SPECIFY_FEATURE=000-platform-v2-master` for cross-phase tracking, or `SPECIFY_FEATURE=0NN-<phase>` for a specific phase.

## Constitution check

All V2 phases must preserve RecipeSpec-only deployment, Zod at boundaries, and no secrets/PII in logs — see [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).
