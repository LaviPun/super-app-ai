# WS-B Gates & CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every quality gate in the repo real and green — CI actually runs on `master`, the red tests are fixed at their root cause, lint is under its cap, pre-commit typecheck gates, the 100KB TAE Liquid budget and the nightly eval flywheel are enforced in CI, and a deploy-stub workflow proves `master` always builds a deployable `apps/web` Docker image.

**Architecture:** All changes are gate plumbing: two template value fixes in `@superapp/core`, timeout fixes in six wasm-function test suites, mechanical lint cleanups in `apps/web`, and a rewrite of `.github/workflows/ci.yml` (triggers, one new wasm-function job, one new Liquid-budget job, workspace-dist build steps that every job on a fresh clone needs) plus a new `deploy.yml` + minimal `apps/web/Dockerfile`. Work happens on branch `ws-b-gates-and-ci`; the final task opens a PR against `master`, which is itself the end-to-end proof that the fixed triggers fire.

**Tech Stack:** GitHub Actions, pnpm 9.15.9 workspaces, vitest 3, ESLint 9 flat config, husky/lint-staged, Shopify CLI 4.x + Rust (`wasm32-unknown-unknown`) for function extensions, Docker (node:20-bookworm-slim), Prisma, Remix/Vite.

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` — Phase 0, workstream **WS-B Gates & CI** [Infra-3, Docs-1..3, Deploy-9].

## Global Constraints

(Copied from the master plan; every task's requirements implicitly include these.)

- CI (once WS-B lands) must be green at every merge.
- TAE Liquid aggregate budget: **100,000 bytes enforced**; program target ≤ 95,000 (the ≤95K reclaim is WS-H's job — WS-B only wires the 100K enforcement into CI).
- TDD where a change is code; verification-run steps where it's config/workflow (run the underlying commands locally; workflow YAML validated via `npx js-yaml` parse + the final task's real PR run — no `act`).
- Do not modify the `v2-*.yml` workflows — WS-I deletes them (master-plan D2). Audit result (2026-08-24, see below): they are all inert on `master` pushes, so leaving them is safe.
- Every task ends with a commit using the exact message given.
- Lint cap stays `--max-warnings 100` (`apps/web/package.json:12`) — never raise it.
- Merchant UI / DESIGN.md rules are untouched — this workstream contains zero UI changes.

## Audit-finding verification (2026-08-24, `master@6af6df2`)

Every finding was re-verified against current code before planning. Two are **stale**, two **new** reds were found:

| # | Finding | Status |
|---|---------|--------|
| 1 | `ci.yml` triggers `branches: [main, develop]`, default branch is `master` | **Confirmed** (`.github/workflows/ci.yml:5,7`; `origin/HEAD` → `master`). Push/PR CI has literally never run. The `schedule` trigger DOES run (on the default branch) — and fails every night in ~37s. |
| 2a | `theme-check-gate.test.ts` red: vhero "Value is not divisible by 0.1" | **Confirmed.** `sections/superapp-nsec-vhero-01/02.liquid` compiled schema line 160: `"type": "number", "id": "overlay_opacity", "default": 0.45` (resp. `0.55`) — Shopify's setting schema requires number defaults be multiples of 0.1. Source: `packages/core/src/templates/sections/native-video-hero.ts:48,96`. Timeout: test allows `90_000` (line 173) but inner `checkCompiledLiquid` allows `120_000` (line 166); measured 24s solo, 45s under `pnpm -r` CPU contention — the reported 125s local timeout is real on slower/cold machines. |
| 2b | `packages/core catalog.test.ts` snapshot red | **STALE — passes** (13/13, verified 2026-08-24). Verification-only step in Task 1. |
| 2c | `control-packs.test.ts` expects `composeConfig`/`preset` pruned | **STALE — passes** (35/35 incl. the R2.4-prune test; the prune is already complete). Verification-only step in Task 1. |
| 3 | Lint 109 problems vs `--max-warnings 100` | **Confirmed** (109 = 67 `no-explicit-any` + 19 `no-console` + 12 `no-unused-vars` + 9 unused-disable-directives + 1 `exhaustive-deps` + 1 misc). Key discovery: the blanket `/* eslint-disable @typescript-eslint/no-explicit-any */` headers in 14 merchant routes are **redundant** — `apps/web/eslint.config.js:79-81` already turns the rule off for those exact files, so removing the headers changes the count by zero. The 67 `any` warnings live elsewhere. |
| 4 | lint-staged `pnpm -r --if-present typecheck \|\| true` | **Confirmed** (root `package.json:46`). `pnpm -r --if-present typecheck` verified green repo-wide today → removing `\|\| true` cannot brick commits. |
| 5 | `build-theme-liquid.mjs --check` not in CI | **Confirmed**; runs locally in seconds, exit 0, `99,613 B / 100,000 B`. Imports only `node:fs/path/url` — the CI job needs no `pnpm install`. |
| 6 | Nightly eval `tee` masks crash → no report → trend gate fails | **Confirmed + root-caused** from run 32616098110: `Error: Cannot find package '…/@superapp/core/dist/index.js' … ERR_MODULE_NOT_FOUND` — the nightly job never builds workspace packages. `tee` masks that (GH `run:` without `shell:` is `bash -e {0}`, **no pipefail**), then `REPORT=$(ls -t …)` fails with exit 2. `pnpm evals:report` itself verified working locally with no DB and no API keys (51 prompts, exit 0). `eval-trend-gate.ts` passes gracefully with <5 history rows, so the first fixed run will be green. |
| 7 | Deploy stub | **Confirmed missing** — no `apps/web/Dockerfile` (only `Dockerfile.internal-router` + v2 Dockerfiles slated for WS-I deletion). |
| NEW-1 | `extensions/superapp-*` wasm function suites red under `pnpm -r test` | Six suites (`cart-checkout-validation`, `cart-transform`, `delivery-customization`, `discount`, `fulfillment-constraints`, `payment-customization`) hard-code a **45s** `beforeAll` timeout around `buildFunction()` → `shopify app function build` → cargo. Passes solo in 14s warm; times out under pnpm's 4-way parallel cold builds. In CI it's worse: `shopify` CLI is a **global laptop install, not a repo dependency**, and the wasm target isn't installed — the current CI `test` job (`pnpm test`) would be red on these regardless. Fixed in Task 2 + Task 5. |
| NEW-2 | Every CI job that touches `apps/web` code is broken on a fresh clone | `apps/web` resolves `@superapp/*` via `main: dist/index.js` (no vite/vitest aliases) — but only the root `test` script builds (some) packages. The `evals`, `e2e-internal`, and `evals-nightly` jobs run `prisma generate` and nothing else → same `ERR_MODULE_NOT_FOUND` as the nightly. Fixed by adding a `pnpm --filter "web^..." run --if-present build` step (verified: builds all 8 `@superapp/*` deps topologically) to each affected job (Tasks 5, 6). |

## v2 workflow audit (informational — no changes)

- `v2-matrix.yml` — `on: push/pull_request: branches: [main, develop, …]` → never fires on `master`.
- `v2-api-build.yml`, `v2-frontend-build.yml`, `v2-workers-build.yml` — `pull_request` with v2 `paths:` filters + `workflow_dispatch` → inert unless a PR touches v2 code.
- `v2-cloudflare-deploy.yml` — `workflow_dispatch` only.

All inert; WS-I deletes them. **Leave untouched.**

## File Structure

- Modify: `packages/core/src/templates/sections/native-video-hero.ts` — the two bad opacity values (Task 1)
- Modify: `apps/web/app/__tests__/theme-check-gate.test.ts` — timeout headroom (Task 1)
- Modify: `extensions/superapp-{cart-checkout-validation,cart-transform,delivery-customization,discount,fulfillment-constraints,payment-customization}/tests/default.test.js` — hook timeout (Task 2)
- Modify: `package.json` (root) — `test` build-prefix fix, new `test:packages`/`test:functions` scripts (Task 2); lint-staged `|| true` removal (Task 4)
- Modify: `apps/web` lint surface — 9 files (auto-fixed directives), 5 script files (console.info), 14 route files (redundant headers) (Task 3)
- Modify: `.github/workflows/ci.yml` — triggers, job graph, new jobs, dep-build steps, nightly fix (Tasks 5, 6)
- Create: `apps/web/Dockerfile`; Modify: `.dockerignore`; Create: `.github/workflows/deploy.yml` (Task 7)

---

### Task 1: Theme-check gate green — fix NSEC-VHERO schema values + timeout headroom

**Files:**
- Modify: `packages/core/src/templates/sections/native-video-hero.ts:48,63,96,110`
- Modify: `apps/web/app/__tests__/theme-check-gate.test.ts:166,173`

**Interfaces:**
- Consumes: nothing (first task; run on new branch `ws-b-gates-and-ci`).
- Produces: a green `theme-check-gate.test.ts`, which Task 8's PR-run CI `test` job relies on.

- [ ] **Step 1: Create the working branch**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
git checkout -b ws-b-gates-and-ci
```

- [ ] **Step 2: Run the failing test to confirm the red (TDD baseline)**

Run: `cd apps/web && pnpm vitest run app/__tests__/theme-check-gate.test.ts`
Expected: FAIL — 1 failed | 7 passed. The failure output must contain exactly two `ValidSchema` errors, `"Value is not divisible by 0.1."`, files `sections/superapp-nsec-vhero-01.liquid` and `sections/superapp-nsec-vhero-02.liquid`, line 160. (If it instead times out at 90s, that is the same task — proceed.)

- [ ] **Step 3: Fix the template values (the schema, not the test)**

In `packages/core/src/templates/sections/native-video-hero.ts`, four edits — the `fields.overlayOpacity` values become multiples of 0.1, and the matching `style.colors.overlayBackdropOpacity` seeds move with them so preview and published Liquid keep parity:

Line 48 (template `NSEC-VHERO-01`, inside `config.fields`):
```ts
          overlayOpacity: 0.4,
```
(was `overlayOpacity: 0.45,`)

Line 63 (same template, inside `style.colors`):
```ts
        colors: { overlayBackdropOpacity: 0.4, seed: '#1c1917' },
```
(was `overlayBackdropOpacity: 0.45`)

Line 96 (template `NSEC-VHERO-02`, inside `config.fields`):
```ts
          overlayOpacity: 0.5,
```
(was `overlayOpacity: 0.55,`)

Line 110 (same template, inside `style.colors`):
```ts
        colors: { overlayBackdropOpacity: 0.5, seed: '#7c3aed' },
```
(was `overlayBackdropOpacity: 0.55`)

- [ ] **Step 4: Give the coverage test honest timeout headroom**

The suite ran 24s solo but 45s under full-suite CPU contention on a fast laptop; CI cold caches are slower, and the audit recorded a 125s local run. Keep inner-timeout < test-timeout so a genuinely slow run fails as a readable `degraded` assertion instead of an opaque vitest timeout.

In `apps/web/app/__tests__/theme-check-gate.test.ts`:

Line 166 — change the inner theme-check budget:
```ts
      const result = await checkCompiledLiquid(files, { timeoutMs: 180_000 });
```
(was `{ timeoutMs: 120_000 }`)

Line 173 — change the vitest per-test timeout (the bare number after the closing brace of the test callback):
```ts
    240_000,
```
(was `90_000,`)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && pnpm vitest run app/__tests__/theme-check-gate.test.ts`
Expected: PASS — `Test Files  1 passed`, 8 tests passed, zero `ValidSchema` errors.

- [ ] **Step 6: Verify the two STALE audit findings stay green (verification-only, no code change)**

Run: `cd packages/core && pnpm vitest run src/__tests__/catalog.test.ts src/__tests__/control-packs.test.ts`
Expected: PASS — `2 passed (2)`, 48 tests, including `composeConfig / preset / hasManifest exports are removed from @superapp/core`. If either fails, STOP: the audit findings 2b/2c were not stale after all — re-read the failure and fix before continuing (fix the snapshot/exports, not the tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
git add packages/core/src/templates/sections/native-video-hero.ts apps/web/app/__tests__/theme-check-gate.test.ts
git commit -m "fix(templates): NSEC-VHERO overlay opacity must be divisible by 0.1 — theme-check gate green

Shopify's section-setting JSON schema requires number defaults be multiples
of 0.1; 0.45/0.55 compiled into superapp-nsec-vhero-01/02.liquid failed
ValidSchema and blocked the pre-publish gate test. Also raises the
compile-coverage test budget (90s -> 240s outer, 120s -> 180s inner): the
full-library Theme Check pass runs 24s solo but 45s+ under full-suite CPU
contention, and 90s flaked on cold machines.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Wasm function suites — realistic build timeouts + `test:packages` / `test:functions` split

**Files:**
- Modify: `extensions/superapp-cart-checkout-validation/tests/default.test.js` (the `}, 45000);` closing `beforeAll`)
- Modify: `extensions/superapp-cart-transform/tests/default.test.js:21`
- Modify: `extensions/superapp-delivery-customization/tests/default.test.js` (same pattern)
- Modify: `extensions/superapp-discount/tests/default.test.js` (same pattern)
- Modify: `extensions/superapp-fulfillment-constraints/tests/default.test.js` (same pattern)
- Modify: `extensions/superapp-payment-customization/tests/default.test.js` (same pattern)
- Modify: `package.json` (root) `:14` and scripts block

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: root scripts **`test:packages`** (all non-extension workspace tests, with the complete dep-build prefix) and **`test:functions`** (extension tests only) — Task 5's CI jobs call these exact names. Also `test` keeps its current "everything" meaning for local use.

**Background for the implementer:** each of these six suites runs `buildFunction(functionDir)` in `beforeAll`, which shells out to `shopify app function build` (Shopify CLI → cargo → wasm). 45s is enough warm and solo (~14s) but not for 4 concurrent cold cargo builds under `pnpm -r`. The suites are genuine gates (they execute the compiled wasm against fixtures) — we keep them, fix the budget, and give CI a dedicated job with the real toolchain (Task 5).

- [ ] **Step 1: Reproduce the flake shape (verification baseline)**

Run: `cd extensions/superapp-cart-checkout-validation && pnpm test`
Expected: PASS in ~15-60s (warm caches). The bug only bites under parallel cold builds — you are verifying the suite itself is healthy before touching timeouts.

- [ ] **Step 2: Raise the hook timeout in all six suites**

In each of the six `tests/default.test.js` files listed above, the `beforeAll` ends:

```js
  beforeAll(async () => {
    functionDir = path.dirname(__dirname);
    await buildFunction(functionDir);
    functionInfo = await getFunctionInfo(functionDir);
    ({ schemaPath, functionRunnerPath, wasmPath, targeting } = functionInfo);
    schema = await loadSchema(schemaPath);
  }, 45000);
```

Change the final line in **each** file to:

```js
  }, 300000);
```

Verify all six changed and none remain:
```bash
grep -rn "45000" extensions/*/tests/default.test.js   # expect: no output
grep -rln "300000" extensions/*/tests/default.test.js | wc -l   # expect: 6
```

- [ ] **Step 3: Split the root test scripts and complete the dep-build prefix**

In root `package.json`, replace line 14:

```json
    "test": "pnpm --filter @superapp/platform-contracts build && pnpm --filter @superapp/security build && pnpm --filter @superapp/job-orchestration build && pnpm --filter @superapp/workers build && pnpm --filter web exec prisma generate && pnpm -r test",
```

with these three lines (the old prefix built only 4 of the 8 workspace packages `apps/web` imports from `dist/` — `@superapp/core`, `rate-limit`, `network-security`, `db` were missing and only passed locally because stale dists existed; `pnpm --filter "web^..." run --if-present build` builds all 8 topologically, verified 2026-08-24):

```json
    "test": "pnpm --filter \"web^...\" run --if-present build && pnpm --filter web exec prisma generate && pnpm -r test",
    "test:packages": "pnpm --filter \"web^...\" run --if-present build && pnpm --filter web exec prisma generate && pnpm -r --filter \"!./extensions/**\" test",
    "test:functions": "pnpm -r --filter \"./extensions/**\" test",
```

> **Caution:** filter-glob exclusion syntax not independently verified — sanity-check both scripts select the intended package sets before writing the CI job (Steps 4–5 exercise them, so this self-verifies in practice).

- [ ] **Step 4: Run the function suites through the new script**

Run: `pnpm test:functions`
Expected: PASS — all extension suites green (the six wasm suites plus the plain vitest ones like `checkout-ui`). With the 300s hook budget, parallel cold builds no longer die at 45s. Takes a few minutes cold.

- [ ] **Step 5: Run the package suites through the new script**

Run: `pnpm test:packages`
Expected: PASS — with Task 1's fix, `apps/web` reports `186 passed | 1 skipped` (or better) and no failed test files anywhere.

- [ ] **Step 6: Commit**

```bash
git add extensions/superapp-cart-checkout-validation/tests/default.test.js extensions/superapp-cart-transform/tests/default.test.js extensions/superapp-delivery-customization/tests/default.test.js extensions/superapp-discount/tests/default.test.js extensions/superapp-fulfillment-constraints/tests/default.test.js extensions/superapp-payment-customization/tests/default.test.js package.json
git commit -m "fix(tests): wasm function suites get a realistic build budget; split test:packages/test:functions

The six shopify-function integration suites hard-coded a 45s beforeAll
timeout around 'shopify app function build'; fine solo+warm (~14s), a
guaranteed timeout under pnpm -r's 4-way parallel cold cargo builds ->
raise to 300s. Root 'test' now builds ALL eight @superapp/* dists via
--filter \"web^...\" (the old enumerated prefix missed core/rate-limit/
network-security/db and only passed on stale local dists). New
test:packages / test:functions split lets CI give the wasm suites their
own job with the Rust+CLI toolchain.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Lint under the 100-warning cap (without raising it)

**Files:**
- Modify (auto-fix removes 9 unused disable directives): `apps/web/app/__tests__/evals.live.test.ts:118`, `apps/web/app/db.server.ts:6`, `apps/web/app/services/ai/shopify-docs-grounding.server.ts:100`, `apps/web/scripts/ai-routing-status.ts:75`, `apps/web/scripts/build-smoke-result.mjs:114`, `apps/web/scripts/internal-ai-router.ts:48`, `apps/web/scripts/retention.ts:44`, `apps/web/scripts/seed-ai-pricing.ts:137`, `apps/web/scripts/smoke-create-module-lifecycle.ts:82`
- Modify (console.log → console.info, 19 statements): `apps/web/scripts/_render-preview-samples.ts` (2), `apps/web/scripts/_verify-template-previews.ts` (7), `apps/web/scripts/build-shopify-docs-snapshot.ts` (8), `apps/web/scripts/visual-qa-previews.ts` (1), `apps/web/scripts/visual-qa-templates.ts` (1)
- Modify (delete one redundant header line each): 14 route files listed in Step 4

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm --filter web lint` exit 0 at ~81 problems — the CI `quality` job (Task 5) and every future PR relies on this.

**Arithmetic:** 109 current − 9 unused directives − 19 no-console = **81 ≤ 100**, with 19 problems of headroom. The 14 blanket-header removals change the count by exactly 0 (rule already `off` for those files via `apps/web/eslint.config.js:79-81`) — they are the debt-removal the audit asked for, not cap relief.

- [ ] **Step 1: Baseline**

Run: `cd apps/web && pnpm lint; echo "exit=$?"`
Expected: `109 problems`, `exit=1`.

- [ ] **Step 2: Auto-remove the 9 unused eslint-disable directives**

```bash
cd apps/web && pnpm exec eslint app scripts --fix
git -C ../.. diff --stat
```

Expected diff: exactly the 9 files listed above, each losing one `eslint-disable`/`eslint-disable-next-line` comment (for `no-console` in 8, `no-var` in `app/db.server.ts`). The repo has no auto-fixable rule violations otherwise (`prefer-const`/`no-var` are `error`-level and lint currently reports zero errors), so no other content may change. If anything else changed, inspect `git diff` and revert unrelated hunks before proceeding.

- [ ] **Step 3: Convert the 19 CLI console.log statements to console.info**

`no-console` config (`apps/web/eslint.config.js:37`) allows `warn`, `error`, `info`. These five files are CLI/dev scripts printing human output — `console.info` is stdout too, zero behavior change. Verified 2026-08-24: the per-file `console.log(` counts (2, 7, 8, 1, 1) exactly equal the flagged warnings and none sit under an eslint-disable, so a whole-file replace is exact:

```bash
cd apps/web
perl -pi -e 's/\bconsole\.log\(/console.info(/g' \
  scripts/_render-preview-samples.ts \
  scripts/_verify-template-previews.ts \
  scripts/build-shopify-docs-snapshot.ts \
  scripts/visual-qa-previews.ts \
  scripts/visual-qa-templates.ts
grep -c "console\.log(" scripts/_render-preview-samples.ts scripts/_verify-template-previews.ts scripts/build-shopify-docs-snapshot.ts scripts/visual-qa-previews.ts scripts/visual-qa-templates.ts
```

Expected grep: `0` for every file.

- [ ] **Step 4: Remove the 14 redundant blanket any-headers from merchant routes**

Each of these files carries the exact line `/* eslint-disable @typescript-eslint/no-explicit-any */` near the top (e.g. `billing.history.tsx:9`, `_index.tsx:10`, `settings._index.tsx:10`, `connectors.$connectorId.tsx:13`); the flat-config override at `apps/web/eslint.config.js:79-81` already disables the rule for every one of them, so the header is dead weight. Delete that one line from each:

```bash
cd apps/web
for f in app/routes/_index.tsx app/routes/modules._index.tsx 'app/routes/modules.$moduleId.tsx' app/routes/flows._index.tsx app/routes/connectors._index.tsx 'app/routes/connectors.$connectorId.tsx' app/routes/data._index.tsx 'app/routes/data.$storeKey.tsx' app/routes/billing._index.tsx app/routes/billing.history.tsx app/routes/settings._index.tsx app/routes/generate._index.tsx app/routes/templates._index.tsx app/routes/analytics._index.tsx; do
  perl -ni -e 'print unless m{^/\* eslint-disable \@typescript-eslint/no-explicit-any \*/$}' "$f"
done
grep -rln "eslint-disable @typescript-eslint/no-explicit-any" app/routes/ || echo "all headers gone"
```

Expected: `all headers gone`. (If a header line differs by whitespace in some file, delete it manually with an editor — the invariant is: zero blanket no-explicit-any headers left under `app/routes/`.)

- [ ] **Step 5: Verify lint is green and typecheck unbroken**

```bash
cd apps/web && pnpm lint; echo "exit=$?"
pnpm typecheck
```

Expected: `81 problems` (±2 is acceptable; must be ≤ 100), `exit=0`; typecheck clean (the header removals touch comment lines only).

- [ ] **Step 6: Spot-run one converted script to prove no behavioral change**

Run: `cd apps/web && pnpm exec tsx --tsconfig tsconfig.scripts.json scripts/_verify-template-previews.ts | head -5`
Expected: the normal template-summary output on stdout (now via `console.info`), exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
git add apps/web
git commit -m "chore(lint): back under the 100-warning cap without raising it

109 -> ~81 problems: eslint --fix drops the 9 unused disable directives,
the 19 no-console hits in CLI scripts move to console.info (allowed by
config, same stdout), and the 14 blanket no-explicit-any headers in the
merchant routes are deleted - they were fully redundant with the
eslint.config.js per-file override that already turns the rule off there.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Pre-commit typecheck actually gates (remove `|| true`)

**Files:**
- Modify: `package.json` (root) `:46`

**Interfaces:**
- Consumes: repo-wide green typecheck (pre-verified; re-checked here).
- Produces: a pre-commit hook that fails on type errors — every later task's commits run through it, which is itself continuous verification.

- [ ] **Step 1: Verify the gate would pass today (config-change precondition)**

Run: `pnpm -r --if-present typecheck; echo "exit=$?"`
Expected: `exit=0` (verified green 2026-08-24 — all packages including `apps/api`, `apps/web`). If red, STOP and fix the type error first; this task must not land a gate that instantly blocks everyone.

- [ ] **Step 2: Remove the escape hatch**

In root `package.json`, the lint-staged block currently reads (line 46):

```json
    "**/*.{ts,tsx,js}": [
      "bash -c 'pnpm -r --if-present typecheck || true'"
    ],
```

Change to:

```json
    "**/*.{ts,tsx,js}": [
      "bash -c 'pnpm -r --if-present typecheck'"
    ],
```

- [ ] **Step 3: Negative test — prove the hook now blocks a type error**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
echo "export const wsbGateProbe: number = 'not a number';" > apps/web/app/wsb-gate-probe.ts
git add apps/web/app/wsb-gate-probe.ts package.json
git commit -m "probe: must fail"; echo "commit exit=$?"
```

Expected: lint-staged runs, `tsc` reports `TS2322` in `wsb-gate-probe.ts`, the commit is **rejected** (`commit exit=1`), and lint-staged restores the stage. Then clean up:

```bash
git restore --staged apps/web/app/wsb-gate-probe.ts 2>/dev/null; rm -f apps/web/app/wsb-gate-probe.ts
```

- [ ] **Step 4: Positive test + commit (the real commit exercises the fixed hook)**

```bash
git add package.json
git commit -m "chore(hooks): pre-commit typecheck actually gates - remove '|| true'

The lint-staged typecheck line swallowed its exit code, so type errors
sailed through every commit. Repo-wide 'pnpm -r --if-present typecheck'
is green as of this commit, and a negative probe confirmed the hook now
rejects a TS2322.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: the hook runs the full typecheck (takes a couple of minutes) and the commit lands.

---

### Task 5: `ci.yml` — master triggers, `test:packages`, wasm-function job, Liquid-budget job, fresh-clone dist builds

**Files:**
- Modify: `.github/workflows/ci.yml` (triggers `:3-7`; `test` job `:102-103`; `e2e-internal` job after `:122`; `evals` job after `:207`; `build` job `needs` `:222`; append two new jobs)

**Interfaces:**
- Consumes: `test:packages` / `test:functions` root scripts (Task 2), green lint (Task 3).
- Produces: the CI job graph Task 8 watches: `quality`, `test`, `test-functions`, `e2e-internal`, `evals`, `liquid-budget`, `build`.

- [ ] **Step 1: Fix the triggers**

`.github/workflows/ci.yml` lines 3-7, change:

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

to:

```yaml
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
```

(Leave `schedule` and `workflow_dispatch` as-is. Do NOT touch the `v2-*.yml` files — see the audit note in the header.)

- [ ] **Step 2: Point the `test` job at the package suite**

Lines 102-103, change:

```yaml
      - name: Test (all packages)
        run: pnpm test
```

to:

```yaml
      - name: Test (all non-extension packages)
        run: pnpm test:packages
```

(`test:packages` carries its own complete dep-build prefix, so this job needs no extra build step; its existing `prisma generate` step is now redundant but harmless — leave it.)

- [ ] **Step 3: Add the workspace-dist build step to `e2e-internal` and `evals`**

Both jobs run `apps/web` code that imports `@superapp/*` from `dist/` (no aliases — verified) and today build nothing → guaranteed `ERR_MODULE_NOT_FOUND` on a fresh runner. In the `e2e-internal` job, insert **after** the `Install dependencies` step (line 122) and **before** `Setup Prisma schema`:

```yaml
      - name: Build workspace packages (web imports @superapp/* from dist)
        run: pnpm --filter "web^..." run --if-present build
```

Insert the identical step in the `evals` job after its `Install dependencies` step (line 203) and before `Generate Prisma client`.

- [ ] **Step 4: Add the `test-functions` job**

Append after the `test` job (keep the file's `# ───` section-comment style):

```yaml
  # ─── Job 2b: Function extensions (wasm integration) ──────────────────────
  #
  # The six shopify-function suites compile Rust -> wasm via `shopify app
  # function build` and execute the artifact against fixtures. They need a
  # toolchain the plain test job doesn't have: Rust + wasm32-unknown-unknown
  # + the Shopify CLI (pinned to the version the suites were verified with).
  test-functions:
    name: Function Extensions (wasm)
    runs-on: ubuntu-latest
    needs: quality

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: |
            extensions/superapp-cart-checkout-validation
            extensions/superapp-cart-transform
            extensions/superapp-delivery-customization
            extensions/superapp-discount
            extensions/superapp-fulfillment-constraints
            extensions/superapp-payment-customization

      - name: Install Shopify CLI
        run: npm install -g @shopify/cli@4.7.0

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test (function extensions)
        run: pnpm test:functions
        env:
          SHOPIFY_CLI_NO_ANALYTICS: '1'
```

- [ ] **Step 5: Add the `liquid-budget` job**

Append after `test-functions`:

```yaml
  # ─── Job 2c: TAE Liquid aggregate budget (100KB hard limit) ───────────────
  #
  # theme-app-extension Liquid has a 100,000-byte AGGREGATE limit enforced by
  # Shopify at deploy time (see MEMORY: phase-035). scripts/build-theme-liquid.mjs
  # --check rebuilds the minified copies and exits 1 when over budget. Pure
  # node:fs — needs no pnpm install.
  liquid-budget:
    name: TAE Liquid Budget (100KB)
    runs-on: ubuntu-latest
    if: github.event_name != 'schedule'

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Check aggregate Liquid budget
        run: node scripts/build-theme-liquid.mjs --check
```

- [ ] **Step 6: Wire the new jobs into the `build` gate**

Line 222, change:

```yaml
    needs: [test, e2e-internal, evals]
```

to:

```yaml
    needs: [test, test-functions, e2e-internal, evals, liquid-budget]
```

- [ ] **Step 7: Validate the YAML + the referenced scripts locally**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "ci.yml YAML OK"
node scripts/build-theme-liquid.mjs --check
grep -n "branches:" .github/workflows/ci.yml
```

Expected: `ci.yml YAML OK`; budget check prints `Total Liquid: 99613 B / 100000 B budget` (byte count may drift slightly) and exits 0; both `branches:` lines show `[master]` only. (Real end-to-end proof is Task 8's PR run — for `pull_request` events GitHub uses the PR branch's workflow definition, so the fixed triggers fire before merge.)

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run on master; add wasm-function + Liquid-budget jobs; build dists everywhere

Triggers said [main, develop] but the default branch is master - push/PR
CI has never run. Also: the test job now runs test:packages while a new
test-functions job carries the Rust+wasm32-unknown-unknown+Shopify-CLI
toolchain the six function suites actually need; a liquid-budget job
enforces the 100KB TAE aggregate via build-theme-liquid.mjs --check; and
e2e-internal/evals gain the 'web^...' dist build step without which any
fresh clone dies on ERR_MODULE_NOT_FOUND (@superapp/core/dist). v2-*.yml
workflows untouched (inert on master; WS-I deletes them).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Nightly eval flywheel — build deps, fail loudly, guard the report path

**Files:**
- Modify: `.github/workflows/ci.yml` — `evals-nightly` job (steps between `Generate Prisma client` and `Trend gate`, currently lines 277-303 pre-Task-5; locate by step names after Task 5's edits)

**Interfaces:**
- Consumes: Task 5's edited `ci.yml`.
- Produces: a nightly job whose report step either emits `eval-report-*.json` + `REPORT_PATH` or fails with a visible error; Task 8 dispatches it.

**Root cause being fixed (from run 32616098110):** `pnpm evals:report` dies with `ERR_MODULE_NOT_FOUND: @superapp/core/dist/index.js` because the job never builds workspace packages; the failure is masked by `| tee` (no pipefail in GH's default `bash -e {0}`), and the step then dies opaquely at `REPORT=$(ls -t …)` with exit 2. Verified locally: with dists built, `pnpm evals:report --out <dir>` needs no DB and no API keys and exits 0 printing one `EVAL_REPORT_JSONL {...}` line.

- [ ] **Step 1: Add the dist build step**

In the `evals-nightly` job, insert after `Install dependencies` and before `Generate Prisma client`:

```yaml
      - name: Build workspace packages (evals import @superapp/* from dist)
        run: pnpm --filter "web^..." run --if-present build
```

- [ ] **Step 2: Rewrite the report step to fail loudly**

Replace the current `Run nightly eval report` step:

```yaml
      - name: Run nightly eval report
        working-directory: apps/web
        # The live tier self-guards: it only runs when EVAL_LIVE=1 AND a provider
        # key is present. When the secret is empty the report is deterministic-only.
        env:
          EVAL_LIVE: ${{ secrets.ANTHROPIC_API_KEY != '' && '1' || '0' }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          mkdir -p scripts/eval-out
          pnpm evals:report --out scripts/eval-out | tee scripts/eval-out/run.log
          # The current report is the newest eval-report-*.json.
          REPORT=$(ls -t scripts/eval-out/eval-report-*.json | head -n1)
          echo "REPORT_PATH=$REPORT" >> "$GITHUB_ENV"
```

with:

```yaml
      - name: Run nightly eval report
        working-directory: apps/web
        # The live tier self-guards: it only runs when EVAL_LIVE=1 AND a provider
        # key is present. When the secret is empty the report is deterministic-only.
        env:
          EVAL_LIVE: ${{ secrets.ANTHROPIC_API_KEY != '' && '1' || '0' }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          set -euo pipefail
          mkdir -p scripts/eval-out
          # pipefail: without it, `| tee` swallowed the runner's exit code and
          # every nightly failed later at an empty report path (2026-08 audit).
          pnpm evals:report --out scripts/eval-out 2>&1 | tee scripts/eval-out/run.log
          REPORT=$(ls -t scripts/eval-out/eval-report-*.json 2>/dev/null | head -n1 || true)
          if [ -z "$REPORT" ]; then
            echo "::error::pnpm evals:report exited 0 but wrote no scripts/eval-out/eval-report-*.json"
            exit 1
          fi
          echo "REPORT_PATH=$REPORT" >> "$GITHUB_ENV"
```

(Leave the `Trend gate`, `Append current run to history`, and `Upload eval report artifact` steps unchanged — the trend gate passes-with-notice below 5 history rows, so the first fixed run is green and starts accruing real history.)

- [ ] **Step 3: Verify the exact step commands locally (verification-run for config)**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
pnpm --filter "web^..." run --if-present build
cd apps/web
bash -c '
  set -euo pipefail
  mkdir -p scripts/eval-out
  pnpm evals:report --out scripts/eval-out 2>&1 | tee scripts/eval-out/run.log
  REPORT=$(ls -t scripts/eval-out/eval-report-*.json 2>/dev/null | head -n1 || true)
  [ -n "$REPORT" ] && echo "REPORT=$REPORT"
  pnpm evals:trend-gate --report "$REPORT" --history scripts/eval-out/history.jsonl
'
```

Expected: report over 51 prompts, a `[eval-report] artifact: …eval-report-….json` line, `REPORT=…` printed, and the trend gate passing (with a no-history notice if `history.jsonl` is absent). Then negative-check the pipefail actually bites:

```bash
bash -c 'set -euo pipefail; pnpm evals:doesnotexist 2>&1 | tee /dev/null'; echo "exit=$?"
```

Expected: `exit=1` (non-zero — proving the pipe no longer masks failures). Clean up any generated local report files: `git status apps/web/scripts/eval-out` should show nothing tracked (the dir is output-only; do not commit generated JSON).

- [ ] **Step 4: Validate YAML + commit**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "ci.yml YAML OK"
git add .github/workflows/ci.yml
git commit -m "ci: nightly eval flywheel builds its deps and fails loudly

Root cause of every nightly failure since the job landed: evals:report
imports @superapp/core/dist which the job never built (ERR_MODULE_NOT_FOUND),
and '| tee' without pipefail swallowed the crash so the run died opaquely at
an empty report glob. Adds the 'web^...' dist build step, set -euo pipefail,
and an explicit ::error guard when no eval-report-*.json is produced.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Deploy workflow stub — `apps/web` Dockerfile + image build on master push

**Files:**
- Create: `apps/web/Dockerfile`
- Modify: `.dockerignore` (root)
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `pnpm --filter "web^..." run --if-present build` pattern (Task 2's rationale).
- Produces: `apps/web/Dockerfile` (WS-A hardens it for Railway — master-plan D1) and the `deploy.yml` **WS-A hook point** where registry push + Railway deploy will land.

- [ ] **Step 1: Extend `.dockerignore`**

Root `.dockerignore` currently ends with `apps/web/node_modules`. Append (cargo `target/` dirs alone are multi-GB of build context; the rest are laptop-local dirs):

```
**/target
.claude
.gstack-tools
.venv-modal
.impeccable
```

- [ ] **Step 2: Create `apps/web/Dockerfile`**

```dockerfile
# apps/web production image — WS-B deployability-gate version.
#
# Purpose today: prove every master push builds a runnable image
# (.github/workflows/deploy.yml). WS-A (launch-program D1, Railway) hardens
# this: multi-stage prod-only prune, worker-service entrypoint, healthcheck,
# and real runtime env injection. Keep the build root at the REPO ROOT —
# apps/web imports @superapp/* workspace packages from their dist/.
FROM node:20-bookworm-slim

# Prisma engines need openssl; git-less image → husky must not run.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV HUSKY=0
RUN npm install -g pnpm@9.15.9

WORKDIR /repo
COPY . .

RUN pnpm install --frozen-lockfile

# Build-time placeholders: remix vite:build loads server modules that read
# these. Real values are injected at RUNTIME by the platform (WS-A). Keep in
# sync with the CI build job's placeholder env (.github/workflows/ci.yml).
ENV NODE_ENV=production \
    SHOPIFY_API_KEY=docker-build-placeholder \
    SHOPIFY_API_SECRET=docker-build-placeholder \
    SHOPIFY_APP_URL=https://placeholder.example.com \
    SCOPES=read_products \
    DATABASE_URL=file:./dev.db \
    ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    INTERNAL_ADMIN_PASSWORD=docker-build-placeholder \
    INTERNAL_ADMIN_SESSION_SECRET=docker-build-placeholder

# Workspace dists first (topological), then the app itself
# (web's build script = `prisma generate && remix vite:build`).
RUN pnpm --filter "web^..." run --if-present build
RUN pnpm --filter web build

ENV PORT=3000
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
```

- [ ] **Step 3: Build the image locally (docker 28.4.0 is installed)**

Run: `cd /Users/lavipun/Work/ai-shopify-superapp && docker build -f apps/web/Dockerfile -t superapp-web:wsb-local .`
Expected: successful build (several minutes on first run). If `pnpm --filter web build` fails on a missing env var, add that var to the placeholder `ENV` block (mirroring `ci.yml`'s build job) and rebuild — the invariant is: the image builds with placeholders only, no secrets in the Dockerfile.

- [ ] **Step 4: Smoke the image starts**

```bash
docker run --rm -d --name wsb-smoke -p 3999:3000 superapp-web:wsb-local
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3999/internal/login
docker rm -f wsb-smoke
```

Expected: an HTTP status (200 or a redirect 3xx — anything but connection-refused proves the server booted with placeholder env). If the app exits on boot due to a strictly-validated runtime var, note it in the WS-A hook comment of `deploy.yml` (Step 5) instead of chasing runtime perfection — the *gate* is the build; runtime hardening is WS-A. Remove this smoke expectation only in that documented case.

- [ ] **Step 5: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy Web

# WS-B stub: prove every master push produces a buildable apps/web image.
# The actual deploy lands in WS-A (launch-program D1: Railway).

on:
  push:
    branches: [master]
  workflow_dispatch: {}

concurrency:
  group: deploy-web
  cancel-in-progress: false

jobs:
  docker-build:
    name: Build apps/web image
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -f apps/web/Dockerfile -t superapp-web:${{ github.sha }} .

      # ─── WS-A HOOK POINT (do not remove) ────────────────────────────────
      # Railway wiring (launch-program D1) lands exactly here, in this job,
      # after the image build proves green:
      #   1. Log in + push superapp-web:${{ github.sha }} to the registry.
      #   2. Trigger the Railway service deploy (RAILWAY_TOKEN secret).
      #   3. Post-deploy health probe against the stable application_url.
      # Until WS-A, this workflow's only contract is: master always builds
      # a deployable image, or the push goes red.
      # ────────────────────────────────────────────────────────────────────
```

- [ ] **Step 6: Validate + commit**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
npx --yes js-yaml .github/workflows/deploy.yml > /dev/null && echo "deploy.yml YAML OK"
git add apps/web/Dockerfile .dockerignore .github/workflows/deploy.yml
git commit -m "feat(deploy): apps/web Dockerfile + master-push image-build workflow (WS-A hook point)

Minimal single-stage image built from the repo root (workspace dists +
prisma generate + remix build, placeholder env at build time only) and a
deploy.yml stub that docker-builds it on every master push. The Railway
push/deploy steps land at the marked WS-A hook point (launch-program D1);
until then the gate is: master always builds a deployable image.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end verification — PR run, nightly dispatch, merge green

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything above.
- Produces: WS-B exit criteria — CI green on a real PR targeting `master`, nightly flywheel green on dispatch, deploy stub green on the master push after merge.

- [ ] **Step 1: Full local sweep before pushing**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
pnpm --filter web lint && echo LINT-OK
pnpm test:packages && echo PACKAGES-OK
pnpm test:functions && echo FUNCTIONS-OK
node scripts/build-theme-liquid.mjs --check && echo BUDGET-OK
```

Expected: all four OK lines.

- [ ] **Step 2: Push and open the PR (this is the trigger-fix proof)**

```bash
git push -u origin ws-b-gates-and-ci
gh pr create --base master --title "WS-B: real, green quality gates + CI on master" --body "$(cat <<'EOF'
Phase-0 workstream WS-B of docs/superpowers/plans/2026-08-24-launch-program.md.

- CI triggers main/develop -> master (this PR run is the proof they fire)
- theme-check gate green: NSEC-VHERO overlay opacity 0.45/0.55 -> 0.4/0.5 (ValidSchema multiple-of-0.1) + honest timeouts
- audit findings 2b/2c (catalog snapshot, control-packs prune) verified stale - already green on master
- wasm function suites: 45s -> 300s build budget; new test:packages/test:functions split + dedicated CI job with Rust+Shopify-CLI toolchain
- lint 109 -> ~81 problems, cap untouched at 100
- pre-commit typecheck gates (removed '|| true', negative-probe verified)
- 100KB TAE Liquid budget wired into CI (liquid-budget job)
- nightly eval flywheel: builds @superapp dists, pipefail + report guard (was ERR_MODULE_NOT_FOUND masked by tee, failed every night)
- deploy stub: apps/web Dockerfile + image build on master push, WS-A hook point marked

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch the PR checks**

Run: `gh pr checks --watch`
Expected: `quality`, `test`, `test-functions`, `e2e-internal`, `evals`, `liquid-budget`, `build` all green. Known first-run risks and their fixes (fix on the branch, push, re-watch — do NOT merge red):
  - `test-functions` fails inside `shopify app function build` (CLI auth/telemetry prompt): add `CI: '1'` to that step's `env` block; the repo's `shopify.app.toml` carries `client_id`, and function builds are local-only, so no Partners auth is expected.
  - `Swatinem/rust-cache` workspace warnings: harmless on first run (cold cache).
  - Any job failing `ERR_MODULE_NOT_FOUND @superapp/...`: that job is missing the `pnpm --filter "web^..." run --if-present build` step — add it exactly as in Task 5 Step 3.

- [ ] **Step 4: Dispatch the nightly flywheel from the branch and watch it**

```bash
gh workflow run ci.yml --ref ws-b-gates-and-ci
gh run list --workflow=ci.yml --limit 1
gh run watch <run-id-from-previous-command>
```

Expected: the `evals-nightly` job (triggered by `workflow_dispatch`) goes green: dist build → 51-prompt report → `REPORT_PATH` set → trend gate passes with the no-history notice → artifact uploaded. (The dispatch also re-runs the PR pipeline jobs; all green.)

- [ ] **Step 5: Merge and verify the master-push pipelines**

```bash
gh pr merge --squash --delete-branch
gh run list --limit 4
```

Expected: two fresh runs on `master` — `CI` (push) and `Deploy Web` — both completing green (`gh run watch` each). This closes the loop: push CI fires on master for the first time in the repo's history, and the deploy stub proves the image builds from a clean checkout.

- [ ] **Step 6: Update the master roadmap**

In `docs/superpowers/plans/2026-08-24-launch-program.md`, Phase 0 line for WS-B: mark complete (append `— ✅ landed <merge-commit-sha>` to the `**WS-B Gates & CI**` bullet). Commit directly on master:

```bash
git checkout master && git pull
git add docs/superpowers/plans/2026-08-24-launch-program.md
git commit -m "docs(plans): mark WS-B Gates & CI landed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

## Self-Review

**1. Spec coverage** (scope items 1-7 from the master plan / audit):
1. Triggers → Task 5 Step 1; v2 workflows audited + documented, untouched. ✓
2. Red tests: (a) vhero schema + timeout → Task 1 (fix in template values, not the test); (b)/(c) verified stale, guarded by Task 1 Step 6. ✓ New reds found during verification (wasm suites, fresh-clone dists) → Tasks 2, 5, 6. ✓
3. Lint under cap without raising it → Task 3 (109→~81; blanket headers removed as debt, correctly identified as count-neutral). ✓
4. Pre-commit `|| true` → Task 4 with negative probe. ✓
5. Liquid budget in CI → Task 5 Step 5. ✓
6. Nightly eval → Task 6 (root-caused to missing dist build + pipefail, both fixed, locally rehearsed incl. a pipefail negative test). ✓
7. Deploy stub → Task 7 (real docker build gate, marked WS-A hook point — a hook comment, not a placeholder task). ✓

**2. Placeholder scan:** every step carries exact code/commands/expected output; the two conditional branches (Task 7 Step 3/4 env-var fallback, Task 8 Step 3 first-run risks) specify the exact remediation, not "handle errors". No TBDs. ✓

**3. Type/name consistency:** `test:packages`/`test:functions` defined in Task 2 Step 3 and consumed verbatim in Task 5 Steps 2/4 and Task 8 Step 1. `pnpm --filter "web^..." run --if-present build` is written identically in Tasks 2, 5, 6, 7. Job names in Task 5 (`test-functions`, `liquid-budget`) match Task 5 Step 6's `needs:` list and Task 8 Step 3's expected checks. Timeout values consistent (300000 in six files; 240_000/180_000 pair in the theme-check test). ✓

## Cross-review reconciliation (2026-08-24)

Edits applied from the cross-plan review:

- **D8** — Task 2 Step 3 gained a caution note: the `pnpm -r --filter "!./extensions/**" test` / `"./extensions/**"` filter-glob exclusion syntax was not independently verified; sanity-check both scripts select the intended package sets before writing the CI job (Steps 4–5 exercise them, so this self-verifies in practice).
