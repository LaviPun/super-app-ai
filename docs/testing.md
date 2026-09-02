# Testing — Complete Reference

> Last updated: 2026-08-27

This is the canonical doc for test strategy and commands. It supersedes the scattered treatment across root [`README.md`](../README.md)'s old "Testing" section, `docs/qa/*` (archived), and reading `.github/workflows/*.yml` cold. Every command below is copied verbatim from a `package.json` script or a workflow step — if a command here stops matching its script, that's a doc bug, file it.

---

## 1. Test categories

| Category | Where | Runner |
|----------|-------|--------|
| Unit | `apps/web/app/**/*.test.ts`, next to the code they exercise | Vitest 3 (`apps/web/vitest.config.ts`) |
| Integration / cross-service | `apps/web/app/__tests__/**/*.{ts,tsx}` (classify → spec → preview → publish, Agent API end-to-end, theme-check publish gate) | Same Vitest config |
| Core package | `packages/core/src/__tests__/**` | Vitest (package-local config) |
| Function extensions (wasm) | `extensions/superapp-*` (Rust) | `shopify app function build` + the extension's own test harness — needs a Rust + `wasm32-unknown-unknown` toolchain, not just Node |
| Theme Check (publish-time Liquid gate) | `apps/web/app/services/publish/theme-check.server.ts` (`@shopify/theme-check-node`), exercised by `apps/web/app/__tests__/theme-check-gate.test.ts` and `theme-check-publish-gate.test.ts` | Runs as part of the regular unit-test suite, not a separate CLI step |
| TAE Liquid aggregate budget | `scripts/build-theme-liquid.mjs` | Standalone Node script, no test runner — see [§3](#3-ci-gates) |
| AI eval harness | `apps/web/scripts/run-evals.ts`, golden prompts in `apps/web/app/services/ai/evals.server.ts` | Custom runner — see [§4](#4-eval-harness) |
| E2E (Playwright) | `apps/web/e2e/internal/**/*.spec.ts` (internal admin only — `testDir: './e2e/internal'` in `apps/web/playwright.config.ts`) | Playwright |

There is no merchant-facing (storefront/embedded-app) Playwright suite today — the E2E project is scoped to the internal admin surface only (auth flow, AI providers, model setup, a11y, crawl-auth, smoke).

---

## 2. Running tests locally

Every command below exists verbatim in `package.json` (repo root) or `apps/web/package.json`.

```bash
# Everything: builds workspace packages, generates the Prisma client, then runs every
# package's `test` script (root package.json "test")
pnpm test

# Non-extension packages only (skips the Rust/wasm function suites)
pnpm test:packages

# Just the Rust/wasm function-extension suites
pnpm test:functions

# Just the web app's Vitest suite
pnpm --filter web test

# Just the core package
pnpm --filter @superapp/core test

# A single Vitest file, or a name filter
pnpm --filter web exec vitest run app/__tests__/redact.test.ts
pnpm --filter web exec vitest -t "safeMeta deep-redacts objects and arrays"

# Typecheck / lint (web)
pnpm --filter web typecheck
pnpm --filter web lint

# Playwright (internal admin E2E) — install the browser once, then run
pnpm --filter web test:e2e:install
pnpm --filter web test:e2e

# Deployment-config validation suite (separate Vitest config)
pnpm test:deployment
```

`apps/web/vitest.config.ts` sets `environment: 'node'`, aliases `~` to `app/`, seeds `INTERNAL_ADMIN_SESSION_SECRET` so cookie-session code can be exercised, and includes only `app/**/*.test.ts` and `app/**/__tests__/**/*.{ts,tsx}` — pre-existing broken `*.test.tsx` files directly under `app/routes/` are deliberately left out of scope (see the config's own comment).

There is also a parallel `test:v2:*` script family (`test:v2`, `test:v2:unit`, `test:v2:typecheck`, `test:v2:build`) that runs `scripts/v2-test-matrix.mjs` against the Platform V2 packages (`apps/api`, `apps/workers`, `apps/frontend`, `packages/db`, `packages/network-security`, `packages/platform-contracts`). These are real, runnable scripts, but they gate a separate CI workflow (`.github/workflows/v2-matrix.yml`, scoped to `main`/`develop`/`platform-v2-*`/`vr/v2` branches) — not the `master`-gating `ci.yml` this doc otherwise describes. Verify against the actual workflow trigger branches before assuming a "Platform V2" test result applies to `master`.

---

## 3. CI gates

**File:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — triggers on push/PR to `master`, plus a nightly `schedule` (03:00 UTC) and manual `workflow_dispatch`.

Jobs, in dependency order:

| Job | Gates | Depends on |
|-----|-------|------------|
| `quality` | Lint (web), typecheck (web, core, rate-limit, platform-contracts, job-orchestration, workers, api), `prisma validate` | — |
| `test` | `pnpm test:packages` against a real Postgres 16 + Redis 7 service container | `quality` |
| `test-functions` | `pnpm test:functions` — Rust/wasm function-extension suites, via `shopify app function build` (Shopify CLI 4.7.0, Node 22 for this job only). A pre-warm step (PR #48) runs one `shopify app function info` (3 attempts) before the parallel suites, forcing the CLI's lazy function-runner binary download exactly once — the parallel suites previously raced it cross-process and flaked with `spawn .../function-runner ENOENT` (see `docs/debug.md` §27) | `quality` |
| `liquid-budget` | `node scripts/build-theme-liquid.mjs --check` — see below | — |
| `evals` | `pnpm evals --strict` (stub client, no API key) — see [§4](#4-eval-harness) | `quality` |
| `e2e-internal` | Boots the Remix dev server against a real Postgres, runs the internal-AI smoke script then `pnpm test:e2e` (Playwright) | `test` |
| `build` | `pnpm build` (production build) | `test`, `test-functions`, `e2e-internal`, `evals`, `liquid-budget` |
| `evals-nightly` | Full golden-prompt eval report + trend gate; only runs on the `schedule`/`workflow_dispatch` triggers, never on push/PR | — |

**TAE Liquid budget gate.** Shopify enforces a hard 100,000-byte (100 KB) limit on Liquid *aggregated across all files* in a theme app extension. `scripts/build-theme-liquid.mjs` minifies the readable source under `apps/web/theme-extension-src/liquid/{blocks,snippets}` into `extensions/theme-app-extension`, in an output-preserving way (strips `{% comment %}`/`{% doc %}` blocks, leading indentation, and blank lines — never touches mid-line whitespace or joins lines). `--check` fails the job if the rebuilt output exceeds budget; run it locally the same way before committing a Liquid change: `node scripts/build-theme-liquid.mjs --check`. Re-run without `--check` to regenerate the built copy, and commit both the source and the built `.liquid`.

---

## 4. Eval harness

**File:** `apps/web/scripts/run-evals.ts`, backed by `apps/web/app/services/ai/evals.server.ts`.

Three modes, selected by `EVAL_PROVIDER_ID` (validity fixes: PR #42):

```bash
# Deterministic (CI default): StubLlmClient, no network, no API key
pnpm --filter web evals

# Strict thresholds (what ci.yml's `evals` job actually runs)
pnpm --filter web evals --strict
# equivalently:
pnpm --filter web evals:strict

# Live run pinned to a DB provider — id OR name; FAILS FAST if the row
# doesn't exist in the eval DB (no silent fall-through to the env client)
EVAL_PROVIDER_ID=<AiProvider id or name> pnpm --filter web evals

# Live run against the env-key client, selected explicitly
EVAL_PROVIDER_ID=env pnpm --filter web evals

# or, for the live-eval Vitest suite specifically:
RUN_LIVE_EVALS=1 pnpm --filter web exec vitest run app/__tests__/evals.live.test.ts
```

**Eval-run isolation (PR #42).** An eval run must score exactly the model it names, so live modes resolve the client with `{ disableFallback: true, ignoreEnvSkills: true }`: no cross-provider fallback leg can silently serve (previously the env path wrapped Claude in `FallbackLlmClient(OpenAI)`, so a "claude-*" run could score `gpt-*` output), and `ANTHROPIC_SKILLS` env never leaks Skills/code-execution/beta headers into eval request shapes. The runner logs both isolations, prints an honest provider line per mode (e.g. `env (ANTHROPIC_DEFAULT_MODEL=<model>)` — it used to log "stub" misleadingly), and a deduped **Distinct errors** section prints the first 400 chars of each distinct error once (the compact per-prompt line previously truncated at 80 chars, hiding actionable errors). Production `getLlmClient()` defaults are unchanged — asserted by `apps/web/app/__tests__/eval-harness-validity.test.ts`.

**Thresholds.** `run-evals.ts` computes a default pass threshold of `0.9` (or `0.99` in `--strict` mode) for schema-valid rate, compiler-success rate, allowed-values-compliance rate, and forbidden-surface-rejection rate; non-destructive rate is always `1.0` (hard requirement, not overridable by the default/strict split). Every threshold can be overridden individually via env: `EVAL_THRESHOLD_SCHEMA`, `EVAL_THRESHOLD_COMPILER`, `EVAL_THRESHOLD_ND`, `EVAL_THRESHOLD_ALLOWED_VALUES`, `EVAL_THRESHOLD_FORBIDDEN_SURFACE`. `ci.yml`'s `evals` job runs `pnpm evals --strict` with `EVAL_THRESHOLD_SCHEMA`/`EVAL_THRESHOLD_COMPILER` explicitly set to `0.99` and `EVAL_THRESHOLD_ND` to `1.0`.

**What it measures per prompt** (`EvalResult` in `evals.server.ts`): schema validity, compiler success, non-destructive-op compliance, allowed-values compliance, forbidden-surface rejection, whether the output matched the prompt's `expectedType`, a competitor-parity quality score, a richness-QA fail count, and a deterministic option-ranking score. A nightly-only `judgeScore` (LLM-as-judge, 0–10) is added when a `judgeClient` is passed — the deterministic CI path never passes one.

**Nightly quality flywheel.** `evals-nightly` (schedule/manual only) runs `pnpm evals:report` for the full golden-prompt suite, optionally adds a live tournament pass when a provider API key secret is present (self-guarded — it never runs without one), and then `pnpm evals:trend-gate` fails the job if `avgQualityScore` dropped more than 10% against the trailing median in `scripts/eval-out/history.jsonl` (restored/saved via `actions/cache`).

**Provider side vs. runner side.** This section owns *how to run and interpret* the harness. For which providers are configured, the fallback chain, and provider-specific pitfalls, see [`docs/ai-providers.md`](./ai-providers.md) §4.

---

## 5. Adding a test for a new module type or surface

1. **Schema + canonical values** — if the new module type introduces a new `RecipeSpec` discriminant or enum value, add it in `packages/core/src/recipe.ts` and cover it in `packages/core/src/__tests__/` (see `recipe-dsl.test.ts`, `catalog.test.ts` for the pattern). [`docs/generation.md`](./generation.md) is the canonical source for the RecipeSpec contract itself.
2. **Compiler/publish path** — add or extend a test under `apps/web/app/__tests__/` that exercises `compileRecipe()` (`apps/web/app/services/recipes/compiler/`) for the new type, including a non-destructive-ops check (`checkNonDestructive`) if the type can touch existing merchant data.
3. **Eval golden fixture** — add an entry to the `GOLDEN_PROMPTS` array in `apps/web/app/services/ai/evals.server.ts` (`{ id, prompt, expectedType, description }`); this is what both the CI `evals` job and the nightly flywheel iterate over. No separate registration step — the array is the fixture set.
4. **Theme Check / Liquid** — if the type renders through the theme app extension, run `node scripts/build-theme-liquid.mjs --check` locally after editing anything under `apps/web/theme-extension-src/liquid/`, and let the existing `theme-check-gate.test.ts` / `theme-check-publish-gate.test.ts` suites exercise the compiled output — add a case there if the new type needs its own Theme Check assertion.
5. **E2E** — only add a Playwright spec under `apps/web/e2e/internal/` if the new surface has an internal-admin UI. Storefront/merchant-embedded UI has no Playwright coverage today (see [§1](#1-test-categories)) — cover it with unit/integration tests instead.

---

## 6. See also

- [`docs/ai-providers.md`](./ai-providers.md) §4 — provider configuration, fallback chain, release-gate context for live evals.
- [`docs/generation.md`](./generation.md) — the RecipeSpec contract the compiler/eval tests validate against.
- [`docs/debug.md`](./debug.md) — root-caused bugs found via these suites; check it before assuming an old constraint (e.g. a retired timeout) is still live.
- [`docs/audit/README.md`](./audit/README.md) — the dated-audit convention this doc's own future audits should follow.
