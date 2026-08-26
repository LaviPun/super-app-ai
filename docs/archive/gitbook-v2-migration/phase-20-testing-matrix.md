# Platform V2 — Phase 20 Testing Matrix

**Status:** Local/testable gate implemented; known baseline failures documented  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 20

## Goal

Provide a single verification gate for Platform V2 packages (`apps/api`, `apps/workers`, `apps/frontend`, `packages/*`) without waiting for full Remix cutover. The matrix covers syntax checks, contract/unit tests, integration slices, Playwright, legacy evals, Prisma validate, and per-package builds.

## Local commands

| Command | Purpose |
|---------|---------|
| `pnpm test:v2` | Full matrix with `--continue` (runs all steps, reports failures) |
| `pnpm test:v2:fast` | Skips evals, Playwright, and Remix `web` build |
| `pnpm test:v2:ci` | CI parity (skips Remix `web` build only) |
| `pnpm test:v2:typecheck` | V2 package typecheck only |
| `pnpm test:v2:unit` | Vitest across V2 packages |
| `pnpm test:v2:build` | `tsc` / Next build for V2 packages |

Structured JSON report: `test-results/v2-matrix.json` (written after each `test:v2*` run).

## Matrix dimensions

| Dimension | Scope | Implementation |
|-----------|-------|----------------|
| **Typecheck** | `@superapp/platform-contracts`, `db`, `network-security`, `core`, `rate-limit`, `api`, `workers`, `frontend` | `pnpm test:v2:typecheck` |
| **Lint** | Remix `web` (shared baseline) + V2 `--if-present lint` | Root matrix step / `v2-quality` job |
| **Unit** | Vitest in each V2 package | `pnpm test:v2:unit` |
| **Integration** | API queue/orchestration/connectors; workers runtime/processors/webhook/connector; Remix connector + preview route parity | Dedicated vitest file lists in matrix script |
| **Playwright** | `apps/frontend` internal AI assistant | `pnpm --filter @superapp/frontend test:e2e` |
| **Evals** | Legacy `apps/web` golden-fixture harness (stub LLM) | `pnpm --filter web evals [--strict]` |
| **Prisma validate** | Legacy `apps/web/prisma` until V2 DB client lands (Phase 15) | `pnpm exec prisma validate` in `apps/web` |
| **Build** | Each V2 package + optional Remix `web` baseline | `pnpm test:v2:build`; Remix build flagged as known baseline failure |

## CI workflow

[`.github/workflows/v2-matrix.yml`](../../../../.github/workflows/v2-matrix.yml) runs on V2 path changes:

1. **v2-quality** — typecheck, lint, prisma validate  
2. **v2-unit** — V2 Vitest suites (after `prisma generate` for parity tests)  
3. **v2-integration** — API, workers, and Remix parity slices  
4. **v2-evals** — stub evals with `continue-on-error: true` (known gap)  
5. **v2-playwright** — Next frontend E2E  
6. **v2-build** — V2 package builds  

The legacy [`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml) remains the Remix production gate until cutover (Phase 21).

## Phase 20 test inventory (plan mapping)

| Plan requirement | Current coverage |
|------------------|------------------|
| Contract unit tests | `packages/platform-contracts`, `packages/db` Vitest |
| Queue adapter tests | `apps/api` `bullmq-job-queue.test.ts` |
| Job orchestration tests | `apps/api` `job-orchestrator.test.ts`, `job-store.test.ts` |
| Worker integration tests | `apps/workers` runtime/processors/webhook/connector suites |
| AI evals | Legacy `apps/web` harness (matrix step; baseline failure) |
| Webhook duplicate / flow replay | Partial — `webhook-flow.test.ts`, Remix idempotency tests in `web` |
| Connector SSRF tests | `packages/network-security`, Remix `ssrf-guard.test.ts` (not in V2 matrix yet) |
| Publish idempotency | `packages/core` publish-worker tests; Remix publish tests |
| Preview sandbox | Remix `preview-service.test.ts`, `e2e/internal/preview-sandbox.spec.ts` (not in default V2 matrix) |
| Next/Fastify API contract | API route tests + `platform-contracts` job schemas |
| E2E merchant generation/publish | Deferred to Phase 21 cutover |
| Internal admin trace/queue visibility | Frontend Playwright internal AI assistant spec |

Failure-mode tests (Redis down, worker crash, LLM timeout, etc.) are documented in the migration plan but not yet automated as dedicated matrix steps — track under Phase 21 rollout / failure injection.

## Known baseline failures (2026-05-19)

Documented from local `pnpm test:v2 --continue` on branch `platform-v2-phase-20-testing-matrix`:

| Step | Status | Notes |
|------|--------|-------|
| **Remix `web` build** | Fail | Client/server boundary and typecheck debt in `apps/web` (see implementation-status 2026-05-15 verification pass) |
| **AI evals (stub/strict)** | Fail | Forbidden-surface gate ~50% vs 90–99% threshold — pre-existing harness gap, not introduced by V2 matrix |
| **V2 packages** | Pass* | Typecheck, unit, integration slices, and V2 builds expected green when dependencies installed |

\* Re-run locally after lockfile or package changes; see `test-results/v2-matrix.json` for the authoritative snapshot.

## Merge risks

- **Lockfile / workspace:** Adding V2 packages to root scripts touches `pnpm-lock.yaml`; merge with any parallel V2 phase branch that adds packages or deps.
- **Shared `packages/core`:** Phase 14+ intent/recipe exports may conflict with matrix-only changes if both touch `package.json` scripts.
- **CI duplication:** `ci.yml` and `v2-matrix.yml` both run evals and prisma validate — intentional overlap until Remix retires.
- **Playwright ports:** Frontend E2E uses port 3000; Remix internal E2E in `ci.yml` uses 4000 — no collision when jobs run separately.

## Verification

Latest gate results: [`docs/implementation-status.md`](../../../implementation-status.md) (Phase 20 section).
