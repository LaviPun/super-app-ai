# WS-I Cleanup & Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove everything the launch program has already decided is dead — the retired V2 platform, orphaned pages, dead exports/files/deps/packages, and duplicated helpers — without breaking anything WS-C, WS-E, or WS-F still needs. Every deletion in this plan is re-verified against current code at execution time, not taken on the stale audit's word (WS-J rule: no numeric claims in prose; counts come from tool/test output).

**Architecture:** No new services. This plan only removes files/exports/deps and consolidates ~8 near-duplicate route-local helpers into shared utilities. The one piece of net-new code is the `relative-time.ts` util that Task 16 extracts.

**Tech Stack:** pnpm workspaces, Remix (apps/web), Vitest, TypeScript, ESLint. Verification tools: `npx knip` (ad hoc, not installed — see Task 1) for dead-export/dead-file discovery, `grep`/`tsc --noEmit`/`pnpm -r test`/`pnpm -r build` for everything else.

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` (WS-I section, Phase 5, Decision D2, Decision D7, Dependency edges) — the nine-domain audit of 2026-08-24 at `master@6af6df2`. This plan re-verified every claimed-dead item against `master@fa48bae` (2026-08-24) plus the open `sa-wt-ws-e` / `sa-wt-testfix` worktrees; see "Verified ground truth" below for what changed.

## Dependencies (plan header — read before executing)

- **Tasks 8–10 (V2 deletion) are gated on WS-C.** WS-C (Phase 3, not yet planned as of this writing — no `2026-08-24-ws-c-*.md` file exists) owns porting BullMQ/queue patterns out of `apps/workers` before D2 lets WS-I delete it (Dependency edges: "WS-E salvage-before-delete ordering with WS-I (D2)" — the launch-program.md dependency line names WS-E but the actual salvage owner per the WS-I charter and Phase 3 description is WS-C; both must be satisfied — WS-E doesn't touch the V2 apps per its own plan header ("nothing in this plan touches the V2 apps; no salvage needed here"), so the live gate is WS-C). **Task 8 defines the exact checkable gate condition** — do not start Tasks 8–10 until it passes.
- **Task 11 (`ModuleService.deleteModule` removal) is gated on WS-E Task 11** (`sa-wt-ws-e` branch `feat/ws-e-publish-integrity`, not yet merged) landing its `unpublishThenDelete` helper and repointing the three current call sites. Task 11 defines the exact gate check.
- **Task 2 (dead-export sweep) should run after Tasks 3–7** (the straightforward file/dep/package deletions) so the export-liveness graph it walks doesn't include files this plan is about to delete anyway — running it first would surface false "still referenced" results for code that's leaving regardless.
- Nothing else in this plan blocks or is blocked by WS-A, WS-B, WS-D, WS-F, WS-G, WS-H, or WS-QF. WS-B's green-gates requirement (CI on `master`) still applies to every commit below.

## Global constraints

- Shopify Admin API target: 2026-07 (unaffected by this plan — no Shopify API surface touched).
- Merchant UI: Polaris web components only (Task 18's page deletions and Task 19's dedupe touch merchant routes already on this system — no regression).
- No silent failures anywhere (D8): a deletion that turns out to still have a caller must be caught by the verification step (typecheck/build/test), never merged silently.
- **No numeric claims in prose (WS-J rule).** Every count below ("2 packages," "3 files," etc.) is what THIS investigation re-confirmed at `master@fa48bae` on 2026-08-24, not the original audit's number — several diverged (see Verified ground truth). Tasks that regenerate a list at execution time (Task 2) must not hardcode a count in their own commit message either.
- TDD spirit adapted to cleanup: every task is "verify dead → delete → re-verify (typecheck/build/test) → commit," never "delete → hope." No task deletes on the strength of the audit alone.
- Bite-sized tasks, frequent commits; CI (WS-B) must stay green at every merge.
- All file paths below are repo-relative to `/Users/lavipun/Work/ai-shopify-superapp`.

## Verified ground truth (2026-08-24, `master@fa48bae`)

Facts every task below relies on — re-verified against code, do not re-derive:

- **No dead-export/dead-file audit artifact exists in the repo.** `docs/audit/` contains `drift-ledger.md` (docs-vs-reality claims, unrelated), `doc-drift-diff.md`, `security-leak-ledger.{md,json}`, `test-baseline.json` — none is a dead-code inventory. The "~170 dead exports" / "3 dead server files" / "4 unused deps" / "3 dead packages" figures live only in the original audit's published artifact/session transcripts, which this plan cannot read. Every count-bearing task below re-derives its own list live (Task 1's `knip` run; per-task `grep`).
- **`apps/web` has a live runtime import from the V2 `apps/workers` package**: `apps/web/app/services/preview/preview-export.queue.server.ts:8` — `import { createImageStorageProcessor } from '@superapp/workers';`, called at line 42. `apps/web/package.json:55` lists `"@superapp/workers": "workspace:*"` as a real dependency, not a leftover. **This is the concrete blocker Task 8's gate exists for** — deleting `apps/workers` before this import is repointed breaks `apps/web`'s build.
- **Package consumer audit** (grep across the whole repo, excluding `apps/api`/`apps/workers`/`apps/frontend`/self-package, excluding `node_modules` and the stray `.claude/worktrees/focused-mccarthy-e3dc9a` snapshot dir):
  - `packages/core`, `packages/platform-contracts`, `packages/job-orchestration`, `packages/rate-limit` — real consumers in `apps/web`. **Keep.**
  - `packages/network-security` — real consumer: `apps/web/app/services/security/ssrf.server.ts`. **Keep** (the audit's "3 dead packages" is not this one, despite it also being a V2-app dependency).
  - `packages/data-layer`, `packages/intent-graph` — **zero consumers anywhere**, including the V2 apps. Safe to delete now, no gate (Task 4).
  - `packages/db`, `packages/observability`, `packages/security` — consumed **exclusively** by `apps/api`/`apps/workers` (V2). Not independently dead today; become dead the moment V2 is deleted. Deleted **as part of** Task 8, same gate, not counted as a separate "dead packages" bucket.
- **`apps/web/app/services/publish/publish-worker.adapter.server.ts`** has zero current importers (confirmed by repo-wide grep, the only hit outside the file itself is a `.impeccable/hook.cache.json` tool-cache entry) but its types (`PublishWorkerAdapters`, `PublishJobPayload`) come from `@superapp/core` and its shape (a `PublishService`/`ModuleService`-driven adapter meant to sit behind a job queue) is exactly what WS-C's "generation/hydrate/publish jobs on BullMQ worker" task will want. **This plan does not delete it** — Task 9 hands it to the same WS-C gate as the V2 deletion and only removes it if WS-C confirms it isn't reused.
- **`apps/web/app/services/ai/tolerant-json.server.ts`** and **`apps/web/app/services/preview/preview-artifact-store.server.ts`** — zero importers repo-wide, no plausible future consumer (tolerant-json's streaming-JSON use case is superseded by the current `api.ai.create-module.stream.tsx` implementation; `PreviewArtifactStore`/`LocalPreviewArtifactStore` predate `PreviewService`'s deterministic-preview architecture per project memory). Safe to delete now (Task 5).
- **`BillingService.cancelSubscription`** (`apps/web/app/services/billing/billing.service.ts:100`) — zero callers outside its own test (`apps/web/app/__tests__/billing-service.test.ts:63-64`). Confirmed dead post-WS-D migration to Shopify App Pricing. Included in Task 2's sweep (its test case is removed in the same commit).
- **`ModuleService.deleteModule`** (`apps/web/app/services/modules/module.service.ts:287`) currently HAS three live callers on `master`: `apps/web/app/routes/api.agent.modules.$moduleId.delete.tsx:28`, `apps/web/app/routes/api.modules.$moduleId.delete.tsx:35`, `apps/web/app/routes/modules.$moduleId.tsx:309`. It is **not dead yet** — it becomes dead only once WS-E Task 11 lands `unpublishThenDelete` and repoints those three call sites (confirmed: `unpublishThenDelete` has zero references anywhere on current `master`, i.e. it doesn't exist yet). Task 11 gates on that landing.
- **`RolloutPolicyService` / `getRecentPublishMetrics`** — live, multi-caller (`internal.release-dashboard.tsx`, `api.publish.tsx`, `api.agent.modules.$moduleId.publish.tsx`, `rollout-policy.service.ts`, `release-metrics.server.ts`, two test files). **Do not touch** — WS-E's own plan (E4) explicitly keeps these; only `ProgressivePublishService` (already deleted by WS-E) was theater.
- **D7 orphan pages, re-verified split between WS-I (delete) and WS-F (wire):**
  - DELETE (this plan, Task 18): `apps/web/app/routes/picker._index.tsx`, `apps/web/app/routes/advanced._index.tsx`, `apps/web/app/routes/api-usage._index.tsx`, `apps/web/app/routes/logs._index.tsx`, `apps/web/app/routes/api.module-captures.tsx`. Confirmed zero inbound links to `/picker`, `/advanced`, `/api-usage`, `/logs` from any `.tsx` in `apps/web/app` (nav registries and route components both checked), and zero callers of `api.module-captures.tsx`'s route (`proxy.capture.tsx` is the only live capture path) and of its data source's writer `recordAdminThrottle` (`apps/web/app/services/shopify/rate-limit.service.ts:42` — defined, never called).
  - **Do not confuse with `/internal/logs` and `/internal/advanced`** — separate internal-admin routes (`internal.logs.tsx`, `internal.logs.$logId.tsx`, `internal.advanced.tsx`), a different namespace, live and untouched. `e2e/internal/crawl-auth.spec.ts` lines 7 and 24 reference these internal routes, **not** the merchant pages this plan deletes — no edit needed there.
  - WIRE (`/jobs`, `/flows/templates`, `modules/:id/captures` restore) is **WS-F's**, not this plan's. No `2026-08-24-ws-f-*.md` plan file exists yet as of this writing; **cross-check when it lands** — if WS-F's plan already shipped the captures link back into `modules.$moduleId.tsx` by the time Task 18 runs, Task 18 must not re-delete anything WS-F just wired (it doesn't touch `modules.$moduleId.tsx` at all, so this is a non-issue in practice, noted for completeness).
  - Test files that hardcode the deleted routes, confirmed by content (not just filename): `apps/web/app/__tests__/merchant-auth-guards.test.ts` (imports `~/routes/advanced._index` and `~/routes/picker._index` directly, lines 16 & 25), `apps/web/e2e/merchant/auth-guards.spec.ts` (iterates `['/advanced', '/picker', '/modules']`, line 18). `e2e/internal/crawl-auth.spec.ts` does **not** need editing (see above — it references the internal namespace).
  - Docs asserting `api.module-captures.tsx` / `POST /api/module-captures` is live, to correct in the same commit: `docs/module-settings-modernization.md:152` ("Admin/API capture (authenticated): `POST /api/module-captures`"), `docs/module-system-v2.md:120,124-125` (lists it under "Built" and calls it "all live").
- **`fix/vitest-tsx-glob` branch is unmerged** (`git merge-base --is-ancestor fix/vitest-tsx-glob master` → not an ancestor; branch is checked out in worktree `sa-wt-testfix`). `apps/web/app/routes/api.connectors.test.tsx` and `apps/web/app/routes/api.agent.connectors.$connectorId.test.tsx` are real, live route modules for the "Test connection" feature (confirmed: sibling routes `api.connectors.$connectorId.update.tsx`, `connectors._index.tsx`, `connectors.$connectorId.tsx` all belong to the same feature). **This plan does not touch them** — no task here deletes or converts them; if `fix/vitest-tsx-glob` merges before this plan executes, there is nothing left to do, otherwise the route.tsx-folder conversion remains that branch's job, not WS-I's.
- **Confirmed unused dependencies in `apps/web/package.json`** (grep for `from '<pkg>'` across all of `apps/web`, not just `app/` — includes `e2e/`, `scripts/`): `@xyflow/react` (zero references anywhere; no flow-DAG UI in the codebase imports it) and `@shopify/polaris-icons` (zero references). Every other dependency in the 55-entry list was individually checked and has a real consumer (including ones that look suspicious at a glance: `@shopify/polaris` → `app/root.tsx:17` `AppProvider` wrapper only, but real; `@shopify/polaris-types` → referenced via `app/global.d.ts` triple-slash, not a bare import, easy to miss; `better-sqlite3`/`@types/better-sqlite3` → `scripts/migrate-sqlite-to-postgres.ts`; `eslint-formatter-unix` → `package.json`'s `lint` script `--format unix` flag, not a source import; `concurrently` → `dev:internal` script). **This plan found 2, not 4** — Task 6 re-runs the same check at execution time and removes whatever is confirmed then, without assuming a 4th and 5th exist.
- **Root-level `get_started.py` and `.venv-modal/` are Modal CLI tutorial scaffolding** (`get_started.py`: `modal.App("example-get-started")`, the canned `modal init` boilerplate) — **not** the real Modal deployment at `deploy/modal-qwen-router/` (which has its own `get_started.py`, `modal_app.py`, `setup_modal.sh`, referenced live by `docs/ai-providers.md`, the local-triage-LLM architecture, and multiple specs). Task 7 deletes only the root-level pair; `deploy/modal-qwen-router/` is explicitly out of scope and untouched.
- **V2 CI workflows confirmed**: `.github/workflows/v2-api-build.yml`, `.github/workflows/v2-matrix.yml`, `.github/workflows/v2-workers-build.yml`, `.github/workflows/v2-frontend-build.yml` — all four reference only V2 app paths, no shared steps worth salvaging.
- **Stale PRs #1–#7** (`gh pr list --state open`): #1–#6 are `cursor/critical-bug-inspection-*` bots claiming SSO/webhook/cron-trigger/secret-handling fixes (168–393 lines changed each); #7 (`cursor/dev-env-setup-bd88`) is a draft adding `AGENTS.md` + one test-runner portability fix, unrelated to webhooks/SSO. All seven predate this program's WS-QF/WS-D/WS-E work, which supersedes their claimed fixes (SSO allowlist is WS-QF's, webhook fan-out is WS-G's, billing/cron hardening is WS-D's/WS-G's). No code from any of the seven was found to be missing from the current `master` + open WS branches during this review.
- **`gitbook-integration`** (`docs/gitbook-integration/`) is its own standalone npm project (`package.json` name `ai-shopify-superapp-docs`), **not** part of `pnpm-workspace.yaml`'s globs (`apps/*`, `packages/*`, `extensions/*`, `vault`) and not invoked by any `.github/workflows/*.yml`. Safe to delete with no ripple into the workspace or CI.

## Decisions of record for this plan

| # | Decision |
|---|----------|
| I1 | **Every deletion re-verifies liveness at execution time**, never trusts the original audit's counts. A task whose live re-check finds a different number than the charter's estimate proceeds on the live number and notes the discrepancy in its commit message — it does not pad or trim the list to match the audit. |
| I2 | **V2 deletion (Tasks 8–10) is a single hard gate**: nothing in `apps/api`/`apps/workers`/`apps/frontend`/`packages/{db,observability,security}`/`vault/` is deleted until Task 8's checklist passes in full. Partial V2 deletion (e.g., deleting `apps/frontend` alone, which nothing in `apps/web` imports from) is explicitly rejected — D2 says "V2 platform is retired" as one decision, and splitting the teardown risks leaving a half-migrated, confusing tree. |
| I3 | **`publish-worker.adapter.server.ts` is not "dead code," it's "unclaimed code."** It stays until WS-C either claims it (moves/adapts it into its own job-worker task) or explicitly disclaims it (WS-C's plan says it built its own adapter from scratch) — Task 9 is the checkpoint, not an automatic delete. |
| I4 | **Owner-gated actions get exact commands, not attempted execution.** Stale-PR closes (Task 20) and worktree removal (Task 21) are written as copy-pasteable `gh`/`git` commands for the owner to run — this plan's executor does not run them (branch/PR mutations are outside the agent permission model). |
| I5 | **Dedupe tasks run last** (Tasks 16–19) because they edit live, currently-working route files — every other task in this plan only deletes files/exports/deps that nothing references, which is much lower-risk than rewriting call sites in files that stay. |

## Deletion inventory (all of it, one table, for orientation — tasks below are the batched execution units)

| Category | Target | Task | Gate |
|---|---|---|---|
| V2 apps | `apps/api/`, `apps/workers/`, `apps/frontend/` | 8 | WS-C salvage |
| V2-only packages | `packages/db/`, `packages/observability/`, `packages/security/` | 8 | WS-C salvage |
| V2 CI | 4 `.github/workflows/v2-*.yml` files | 8 | WS-C salvage |
| V2 scripts/config | `scripts/v2-test-matrix.mjs`, root `package.json` `test:v2*` scripts, `apps/web/package.json`'s `@superapp/workers` dep | 8 | WS-C salvage |
| Vault | `vault/` + `pnpm-workspace.yaml` entry | 10 | WS-C salvage (same commit family as Task 8, split out because vault is Gadget-specific, not BullMQ-relevant, but still V2) |
| Unclaimed job-worker code | `apps/web/app/services/publish/publish-worker.adapter.server.ts` | 9 | WS-C confirms not reused |
| Truly-dead packages | `packages/data-layer/`, `packages/intent-graph/` | 4 | none |
| Dead server files | `apps/web/app/services/ai/tolerant-json.server.ts`, `apps/web/app/services/preview/preview-artifact-store.server.ts` | 5 | none |
| Modal scratch files | root `get_started.py`, root `.venv-modal/` | 7 | none |
| gitbook tool | `docs/gitbook-integration/` | 3 | none |
| Unused deps | `@xyflow/react`, `@shopify/polaris-icons` (+ re-check for more) | 6 | none |
| Dead exports (bulk) | `knip`-confirmed list, batched by directory | 2 | none |
| Dead export (billing) | `BillingService.cancelSubscription` | 2 | none |
| Dead export (module) | `ModuleService.deleteModule` | 11 | WS-E Task 11 |
| Orphan scripts | re-derived in Task 12 | 12 | none |
| D7 delete-list pages | `picker._index.tsx`, `advanced._index.tsx`, `api-usage._index.tsx`, `logs._index.tsx`, `api.module-captures.tsx` + 2 test files + 2 docs | 18 | none |
| Dedupe: time formatting | 6× local `timeAgo`, 2× local `relativeTime` → `app/utils/relative-time.ts` | 16 | none |
| Dedupe: activity filter | 2× literal `NON_MERCHANT_ACTIONS` array | 17 | none |
| Dedupe: category tone/icon | 3× `catTone`, 2× `catIcon` | 19 | none |
| Stale PRs | #1–#7 | 20 | owner-run |
| Local worktrees | `sa-wt-*` after merge | 21 | owner-run |

---

### Task 1: Install `knip` ad hoc and capture a fresh dead-export/dead-file baseline

Not a deletion — a tooling step that makes Task 2 evidence-based instead of guesswork. `knip` isn't a devDependency anywhere in the repo (`pnpm-lock.yaml` has zero hits for it); this task runs it via `npx` without adding it as a permanent dependency (a permanent CI dead-code gate is a WS-B-shaped decision, out of scope here — see Out of scope).

**Files:**
- None modified. Output is consumed directly by Task 2, not persisted as a doc.

- [ ] **Step 1:** From repo root: `npx knip@latest --workspace apps/web --include exports,files 2>&1 | tee /tmp/knip-web.txt`. If `knip` can't resolve the workspace config out of the box (likely — no `knip.json` exists), fall back to a minimal ad hoc config: create `apps/web/knip.json` **temporarily** (not committed) with `{"entry": ["app/routes/**/*.tsx", "app/entry.*.tsx", "app/root.tsx"], "project": ["app/**/*.{ts,tsx}"]}` and re-run `npx knip@latest --workspace apps/web`.
- [ ] **Step 2:** Cross-check knip's "unused exports" list against a manual grep for each candidate (`grep -rn "exportedName" apps/web/app --include="*.ts" --include="*.tsx" | grep -v "__tests__"` — a hit count of 1, the definition itself, confirms dead; knip has false positives on re-exported barrel names and Remix's convention-based route exports `loader`/`action`/`default`, which are used by the router, not by explicit imports — exclude all Remix route convention exports from the candidate list regardless of what knip says).
- [ ] **Step 3:** Delete the temporary `apps/web/knip.json` if created (`rm apps/web/knip.json`) — it does not get committed; this task produces no diff of its own.
- [ ] **Step 4 (no commit):** Hand the cross-checked candidate list to Task 2. If Task 1 finds zero real candidates beyond what's already itemized in Tasks 4–19, say so in Task 2's commit message rather than forcing a count.

---

### Task 2: Dead-export sweep (batched by directory) — bulk exports + `BillingService.cancelSubscription`

Runs Task 1's cross-checked list. Batched per the plan-writing instruction: one task per deletion category, not one per file. Split into sub-steps by directory so a mid-sweep typecheck failure narrows to one area instead of the whole list.

**Files:** Whatever Task 1 confirms, grouped by top-level directory under `apps/web/app/` (e.g. `services/`, `routes/`, `components/`, `utils/`) — cannot be listed exactly until Task 1 runs; this task's Step 1 is where the concrete list gets written down (in the PR/commit body, not a new doc file). Definitely included regardless of knip's output (independently confirmed above):
- Modify: `apps/web/app/services/billing/billing.service.ts` (remove `cancelSubscription`)
- Modify: `apps/web/app/__tests__/billing-service.test.ts` (remove the `cancelSubscription` test case, lines 63-64 and its `describe`/`it` wrapper)

- [ ] **Step 1: Record the confirmed-dead list.** From Task 1's cross-checked output plus the billing case above, write the final per-file list of exports to remove directly into this task's tracking (checkbox sub-items or the commit body) — do not create a new markdown report file for it.
- [ ] **Step 2: Delete, directory by directory.** For each directory batch: remove the dead export (delete the function/const/type entirely if it has no other use inside the file; if the file becomes empty, delete the file and remove its import from wherever it was still imported for side effects only — should be none, since "dead export" means zero importers by definition). Remove `cancelSubscription` from `billing.service.ts` and its test from `billing-service.test.ts` in this same batch.
- [ ] **Step 3: Verify after each directory batch** — `cd apps/web && npx tsc --noEmit`. Expected: no new errors (a real error here means the export wasn't actually dead — stop, investigate, do not force through).
- [ ] **Step 4: Full verification after all batches** — `pnpm --filter web exec vitest run` and `pnpm --filter web run build`. Expected: PASS / green build, test count decreases only by the removed `cancelSubscription` case (no unrelated test should reference a removed export — if one does, that export wasn't dead; restore it and re-run Task 1's cross-check on it).
- [ ] **Step 5: Re-run knip** (same command as Task 1 Step 1) to confirm the batch reduced the list; it's fine if it isn't zero afterward (some flagged items are legitimate false positives — Remix conventions, `@superapp/core` barrel re-exports consumed by extensions/tests knip doesn't scan). Do not chase every remaining flag; this task closes when the confirmed-dead list from Step 1 is gone, not when knip reports zero.
- [ ] **Step 6: Commit** — `git add -A apps/web/app && git commit -m "chore(ws-i): remove dead exports (knip-confirmed) incl. BillingService.cancelSubscription"`

---

### Task 3: Delete `docs/gitbook-integration/`

Standalone tool, not a pnpm workspace member, not invoked by CI (verified above). Independent of `docs/gitbook/` (the actual doc content directory, which stays — WS-J owns any changes there).

**Files:**
- Delete: `docs/gitbook-integration/` (entire directory, including its own `node_modules/` — confirm it's gitignored so `git rm` doesn't choke on it; if `node_modules` was accidentally committed, `git rm -r --cached docs/gitbook-integration/node_modules` first)

- [ ] **Step 1: Verify no consumer** — `grep -rn "gitbook-integration" --include="*.yml" --include="*.json" --include="*.mjs" . 2>/dev/null | grep -v node_modules | grep -v "^./docs/gitbook-integration/"`. Expected: no hits (already confirmed above; re-run at execution time per I1).
- [ ] **Step 2: Delete** — `git rm -r docs/gitbook-integration`
- [ ] **Step 3: Verify** — `pnpm install` (confirms the workspace resolves cleanly without it — it wasn't a workspace member, but this catches any lockfile entry) and `pnpm --filter web run build`. Expected: unaffected.
- [ ] **Step 4: Commit** — `git commit -m "chore(ws-i): remove docs/gitbook-integration (standalone, zero consumers)"`

---

### Task 4: Delete `packages/data-layer/` and `packages/intent-graph/`

Zero consumers anywhere in the repo, including the V2 apps — safe today, no gate.

**Files:**
- Delete: `packages/data-layer/` (entire directory)
- Delete: `packages/intent-graph/` (entire directory)

- [ ] **Step 1: Verify zero consumers** — for each package name, `grep -rl "@superapp/data-layer" . --include="*.ts" --include="*.tsx" --include="*.json" 2>/dev/null | grep -v node_modules | grep -v "^./packages/data-layer/"` and the same for `@superapp/intent-graph`. Expected: no hits outside each package's own `package.json`.
- [ ] **Step 2: Delete** — `git rm -r packages/data-layer packages/intent-graph`
- [ ] **Step 3: Verify** — `pnpm install` (lockfile drops the two workspace entries cleanly), `pnpm -r typecheck`, `pnpm --filter web run build`. Expected: green, no references broken.
- [ ] **Step 4: Commit** — `git commit -m "chore(ws-i): delete packages/data-layer, packages/intent-graph (zero consumers)"`

---

### Task 5: Delete the two unclaimed-and-dead server files

`tolerant-json.server.ts` and `preview-artifact-store.server.ts` — zero importers, no plausible future consumer (unlike Task 9's `publish-worker.adapter.server.ts`).

**Files:**
- Delete: `apps/web/app/services/ai/tolerant-json.server.ts`
- Delete: `apps/web/app/services/preview/preview-artifact-store.server.ts`
- Check/Delete: any co-located test file for either (`apps/web/app/__tests__/tolerant-json*.test.ts`, `apps/web/app/__tests__/preview-artifact-store*.test.ts` if present)

- [ ] **Step 1: Verify zero importers** — `grep -rln "tolerant-json" apps/web --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "tolerant-json.server.ts$"` and the equivalent for `preview-artifact-store`. Expected: no hits (a test file counts as a hit — check for and remove one in the same commit if found; none was found in this review, but re-verify at execution time).
- [ ] **Step 2: Delete** — `git rm apps/web/app/services/ai/tolerant-json.server.ts apps/web/app/services/preview/preview-artifact-store.server.ts` (plus any test files Step 1 found)
- [ ] **Step 3: Verify** — `cd apps/web && npx tsc --noEmit && npx vitest run && npm run build --if-present` (or `pnpm --filter web run build`). Expected: green.
- [ ] **Step 4: Commit** — `git commit -m "chore(ws-i): delete dead server files (tolerant-json, preview-artifact-store) — zero importers"`

---

### Task 6: Remove confirmed-unused dependencies from `apps/web/package.json`

Re-derives the list at execution time (I1) rather than trusting the audit's "4." This review found 2; the task still checks for more so it isn't silently capped at that number.

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml` (regenerated by `pnpm install`)

- [ ] **Step 1: Re-run the full-dependency-list check.** For every entry in `apps/web/package.json`'s `dependencies` + `devDependencies`, `grep -rl "from ['\"]<pkg>" apps/web --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | wc -l` (covers `app/`, `e2e/`, `scripts/`). For packages that are legitimately referenced without a bare import (CLI flags, tsconfig `types` array, triple-slash directives, `package.json` `scripts`), also check those locations before concluding "unused" — Task 1's ground-truth section lists the known false positives (`eslint-formatter-unix`, `concurrently`, `@shopify/polaris-types`, `better-sqlite3`) to skip re-litigating.
- [ ] **Step 2: Confirmed unused as of this review** — `@xyflow/react`, `@shopify/polaris-icons`. Remove both from `apps/web/package.json`.
- [ ] **Step 3: If Step 1 finds additional zero-hit packages** beyond these two, apply the same false-positive check (CLI flags / tsconfig / triple-slash / scripts) before removing — do not remove a dependency solely because a bare-import grep missed it.
- [ ] **Step 4: Regenerate lockfile and verify** — `pnpm install` then `cd apps/web && npx tsc --noEmit && npx vitest run` and `pnpm --filter web run build`. Expected: green (removing an unused dep should never change typecheck/test/build output).
- [ ] **Step 5: Commit** — `git commit -m "chore(ws-i): remove unused deps (@xyflow/react, @shopify/polaris-icons) from apps/web"`

---

### Task 7: Delete root-level Modal scratch files

Root `get_started.py` (canned `modal init` boilerplate) and `.venv-modal/` (a Python virtualenv, should already be gitignored but verify). **Do not touch `deploy/modal-qwen-router/`** — that's the real, live Modal deployment.

**Files:**
- Delete: `get_started.py` (repo root)
- Delete: `.venv-modal/` (repo root)

- [ ] **Step 1: Confirm these are the scratch copies, not the real deployment** — `head -5 get_started.py` should show `modal.App("example-get-started")` (the tutorial stub), not anything referencing `deploy/modal-qwen-router`'s app name. `git status .venv-modal` / `cat .gitignore | grep venv` to confirm it's untracked (a `.gitignore` entry means `git rm` isn't even needed, just `rm -rf`).
- [ ] **Step 2: Delete** — `git rm get_started.py` (if tracked; check with `git ls-files get_started.py` first) and `rm -rf .venv-modal` (untracked, no `git rm` needed — confirm with `git status` that nothing appears after removal).
- [ ] **Step 3: Verify nothing referenced them** — `grep -rln "get_started.py\|venv-modal" --include="*.md" --include="*.yml" --include="*.json" . 2>/dev/null | grep -v node_modules | grep -v "deploy/modal-qwen-router"`. Expected: no hits (the many `modal` hits found during investigation were all either `deploy/modal-qwen-router/` itself or unrelated `.claude/skills/impeccable` design-vocabulary docs using "modal" as a UI term — re-confirm the specific filenames, not just the word "modal", don't get misled by that noise).
- [ ] **Step 4: Commit** — `git commit -m "chore(ws-i): remove root-level Modal tutorial scratch files (get_started.py, .venv-modal) — not the real deploy/modal-qwen-router"`

---

### Task 8: V2 platform deletion — salvage-gate check, then delete `apps/api`, `apps/workers`, `apps/frontend` + their exclusive packages + V2 CI/scripts

**The big gated one.** Do not start Step 2 until Step 1's checklist is entirely satisfied.

**Files:**
- Delete: `apps/api/`, `apps/workers/`, `apps/frontend/` (entire directories)
- Delete: `packages/db/`, `packages/observability/`, `packages/security/` (entire directories — exclusive V2 consumers, confirmed above)
- Delete: `.github/workflows/v2-api-build.yml`, `.github/workflows/v2-matrix.yml`, `.github/workflows/v2-workers-build.yml`, `.github/workflows/v2-frontend-build.yml`
- Delete: `scripts/v2-test-matrix.mjs`
- Modify: root `package.json` — remove `test:v2`, `test:v2:fast`, `test:v2:ci`, `test:v2:typecheck`, `test:v2:unit`, `test:v2:build` scripts; rewrite `test` and `test:packages` to drop the `--filter "@superapp/api^..." --filter "@superapp/frontend^..."` clauses (become `pnpm --filter "web^..." run --if-present build && pnpm --filter web exec prisma generate && pnpm -r test` and the `test:packages` equivalent with `--filter "!./extensions/**"` retained)
- Modify: `apps/web/package.json` — remove the `"@superapp/workers": "workspace:*"` dependency line (**only after** Step 1's gate confirms the import is repointed)

**Gate check (Step 1 — the checkable condition, not a vibe):**

- [ ] **Step 1a:** `grep -rn "@superapp/workers\|@superapp/db\|@superapp/observability\|@superapp/security" apps/web/app apps/web/package.json` returns **no hits**, OR every hit that remains is inside a file WS-C's plan explicitly says it ported (cross-check against the WS-C plan file `docs/superpowers/plans/2026-08-24-ws-c-*.md` once it exists — if it doesn't exist yet, this gate cannot pass; stop here and re-run this task later).
- [ ] **Step 1b:** Specifically, `apps/web/app/services/preview/preview-export.queue.server.ts`'s `createImageStorageProcessor` import (the concrete blocker identified above) resolves to a non-`@superapp/workers` source — either inlined into `apps/web`, moved into a surviving package (`packages/job-orchestration` is the natural home, given it's already a live `apps/web` dependency), or the queue.server.ts file itself was rewritten/removed by WS-C.
- [ ] **Step 1c:** WS-C's plan/branch is merged to `master` (check `git log master --oneline | grep -i "ws-c"` or the launch-program.md phase-status checkmark for WS-C), so the port isn't sitting in an unmerged worktree that this deletion would orphan.
- [ ] **Step 1d:** `pnpm --filter web run build` succeeds on `master` at the commit just before this task's deletion — i.e., confirm apps/web is buildable and green **before** touching V2, to isolate any post-deletion breakage to this task's own changes.

**Execution (only after 1a–1d all pass):**

- [ ] **Step 2: Delete the app directories** — `git rm -r apps/api apps/workers apps/frontend`
- [ ] **Step 3: Delete the exclusive packages** — `git rm -r packages/db packages/observability packages/security`
- [ ] **Step 4: Delete V2 CI workflows** — `git rm .github/workflows/v2-api-build.yml .github/workflows/v2-matrix.yml .github/workflows/v2-workers-build.yml .github/workflows/v2-frontend-build.yml`
- [ ] **Step 5: Delete the V2 test-matrix script** — `git rm scripts/v2-test-matrix.mjs`
- [ ] **Step 6: Edit root `package.json`** — remove the six `test:v2*` script entries; rewrite `test`/`test:packages` per the Files list above.
- [ ] **Step 7: Edit `apps/web/package.json`** — remove `"@superapp/workers": "workspace:*"`.
- [ ] **Step 8: Regenerate lockfile** — `pnpm install`. Expected: clean resolve, no dangling workspace references.
- [ ] **Step 9: Full verification** — `pnpm -r typecheck`, `pnpm --filter web run build`, `pnpm test` (the rewritten root script). Expected: all green — this is the highest-blast-radius deletion in the plan, do not skip any of the three.
- [ ] **Step 10: Commit** — `git commit -m "chore(ws-i): retire V2 platform (D2) — delete apps/api, apps/workers, apps/frontend, packages/db+observability+security, v2-* CI/scripts, after WS-C salvage confirmed"`. Commit message must name which WS-C commit/PR satisfied the gate (Step 1c).

---

### Task 9: `publish-worker.adapter.server.ts` — WS-C claim-or-delete checkpoint

Not an automatic delete (I3). This task is a decision point, executed once WS-C's plan exists.

**Files:**
- Either: no change (WS-C claims the file, ports/adapts it as part of its own work — this task closes with a note, no commit)
- Or: Delete `apps/web/app/services/publish/publish-worker.adapter.server.ts` (WS-C explicitly built its own adapter and doesn't need this one)

- [ ] **Step 1:** Read the WS-C plan (once it exists at `docs/superpowers/plans/2026-08-24-ws-c-*.md`). Check whether it references `publish-worker.adapter.server.ts`, `PublishWorkerAdapters`, or `PublishJobPayload` by name, or describes building an equivalent from scratch.
- [ ] **Step 2a (claimed):** If WS-C's plan reuses/adapts the file, do nothing here — leave it for WS-C's own tasks to modify. Close this task with a note in the tracking doc, no commit.
- [ ] **Step 2b (disclaimed):** If WS-C's plan builds its own adapter and doesn't reference this file, re-verify it's still zero-importers (`grep -rln "publish-worker.adapter" apps/web --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "publish-worker.adapter.server.ts$"` → no hits), then `git rm apps/web/app/services/publish/publish-worker.adapter.server.ts`, verify with `npx tsc --noEmit && npx vitest run`, commit: `git commit -m "chore(ws-i): delete unclaimed publish-worker.adapter.server.ts — WS-C built its own adapter"`.
- [ ] **Step 3 (either branch):** If, at the time this task runs, WS-C still doesn't have a plan file, do not guess — leave the file in place and re-check on the next pass. This task can remain open longer than the rest of the plan without blocking anything else here.

---

### Task 10: Delete `vault/`

Zero references from `apps/web` (confirmed above), part of D2's V2 retirement but split from Task 8 because it's Gadget-specific tooling, not a BullMQ/queue salvage concern — its gate is simpler (nothing to port).

**Files:**
- Delete: `vault/` (entire directory)
- Modify: `pnpm-workspace.yaml` — remove the `- vault` line

- [ ] **Step 1: Verify zero consumers** — `grep -rln "vault/" apps/web packages --include="*.ts" --include="*.tsx" --include="*.json" 2>/dev/null | grep -v node_modules`. Expected: no hits (re-confirms the ground-truth finding).
- [ ] **Step 2: Delete** — `git rm -r vault` and edit `pnpm-workspace.yaml` to drop the `vault` entry.
- [ ] **Step 3: Verify** — `pnpm install`, `pnpm -r typecheck`, `pnpm --filter web run build`. Expected: green.
- [ ] **Step 4: Commit** — `git commit -m "chore(ws-i): delete vault/ (D2 — V2 Gadget app, zero apps/web consumers)"`

Note: this task has no hard ordering dependency on Task 8 (vault is standalone), but keep it adjacent in the execution order since both are "V2 teardown, D2" — a reviewer scanning the log should see them together.

---

### Task 11: Remove `ModuleService.deleteModule` — gated on WS-E Task 11

**Files:**
- Modify: `apps/web/app/services/modules/module.service.ts` (remove `deleteModule`, currently at line 287)
- Check: `apps/web/app/routes/api.agent.modules.$moduleId.delete.tsx`, `apps/web/app/routes/api.modules.$moduleId.delete.tsx`, `apps/web/app/routes/modules.$moduleId.tsx` — confirm each now calls `unpublishThenDelete` instead, per WS-E Task 11
- Modify: any `module.service.test.ts` case that still exercises `deleteModule` directly

- [ ] **Step 1: Gate check** — `git log master --oneline | grep -i "ws-e"` (or check the `feat/ws-e-publish-integrity` branch merged) AND `grep -rln "unpublishThenDelete" apps/web/app --include="*.ts" --include="*.tsx" | grep -v node_modules` returns hits in all three route files listed above. If either check fails, stop — this task isn't ready yet.
- [ ] **Step 2: Re-verify `deleteModule` is now actually dead** — `grep -rn "\.deleteModule(" apps/web/app --include="*.ts" --include="*.tsx" | grep -v ".test."`. Expected: zero hits (confirming WS-E's repoint landed cleanly and no new caller appeared, per the charter's explicit "check that no new caller appeared by then").
- [ ] **Step 3: Delete** — remove the `deleteModule` method from `module.service.ts`; remove/update any test that called it directly (tests that call the route actions, which now call `unpublishThenDelete`, are WS-E's concern and should already be updated by WS-E Task 11 — this step only touches leftover direct-method tests, if any).
- [ ] **Step 4: Verify** — `cd apps/web && npx tsc --noEmit && npx vitest run` and `pnpm --filter web run build`. Expected: green.
- [ ] **Step 5: Commit** — `git commit -m "chore(ws-i): remove ModuleService.deleteModule — dead after WS-E Task 11's unpublishThenDelete migration"`

---

### Task 12: Orphan scripts sweep

**Files:** Re-derived at execution time (I1) — `scripts/` currently contains `build-theme-liquid.mjs` (live, wired into WS-B's CI gate per project memory — keep), `check-shopify-config.mjs` (live, wired into `lint-staged` — keep), `cloudflare-setup.sh` (candidate — the program is moving to Railway per D1; the tunnel/cloudflare setup script may now be orphaned), `v2-test-matrix.mjs` (deleted in Task 8, don't double-handle here), plus whatever else exists under `scripts/deployment/` (referenced live by root `deploy:validate`/`test:deployment` scripts — keep) at execution time.

- [ ] **Step 1: List current `scripts/` contents** — `find scripts -type f | sort` (re-run at execution time; do not reuse this plan's snapshot, which was taken 2026-08-24).
- [ ] **Step 2: For each file not already accounted for by Task 8 or the keep-list above**, check for a caller: `grep -rln "<script-basename>" --include="*.json" --include="*.yml" --include="*.md" . 2>/dev/null | grep -v node_modules`. A hit in a `package.json` `scripts` block or a `.github/workflows/*.yml` step means it's live — keep. Zero hits anywhere (including docs referencing it as a runbook step) means orphaned.
- [ ] **Step 3: Specifically resolve `cloudflare-setup.sh`** — check whether WS-A's Railway migration (separate plan, `2026-08-24-ws-a-hosting.md` / `2026-08-24-ws-a-tail`) has landed and retired the Cloudflare tunnel entirely. If WS-A's tunnel-retirement is done and nothing references this script, delete it here. If WS-A hasn't landed yet, leave it — the tunnel may still be the active dev path.
- [ ] **Step 4: Delete confirmed orphans** — `git rm <files>`.
- [ ] **Step 5: Verify** — `pnpm install && pnpm -r typecheck && pnpm --filter web run build`. Expected: green (removing an unreferenced script should never change anything else).
- [ ] **Step 6: Commit** — `git commit -m "chore(ws-i): remove orphan scripts (re-verified zero callers)"`. If Step 2 finds no orphans beyond what Task 8 already removed, skip Steps 4–6 and note "no orphan scripts beyond V2's" instead of forcing a deletion.

---

### Task 13: Fix the two docs that call `api.module-captures.tsx` "live" (staged ahead of Task 18's deletion)

Split out from Task 18 so the doc correction lands as its own reviewable diff, and so Task 18's route deletion isn't blocked on doc-wording bikeshedding.

**Files:**
- Modify: `docs/module-settings-modernization.md:152` — remove or correct the "Admin/API capture (authenticated): `POST /api/module-captures`" line; the honest statement is that `proxy.capture.tsx` (unauthenticated app-proxy capture) is the only live capture path.
- Modify: `docs/module-system-v2.md:118-125` — remove `api.module-captures.tsx` from the "Built" list and from the "all live" sentence; keep the rest of that paragraph's true claims (`DataStore`/`DataStoreRecord`, `data-store.service.ts`, `data.$storeKey.tsx`, `module-capture.service.ts`, `proxy.capture.tsx`, CSV export, print-to-PDF, `DataCapture` ingestion, `modules.$moduleId_.captures.tsx` — all still live per this review).

- [ ] **Step 1:** Edit both files per the above. No numeric claims added (WS-J rule) — describe what's live/dead by name, not by count.
- [ ] **Step 2:** `grep -n "api.module-captures\|api/module-captures" docs/module-settings-modernization.md docs/module-system-v2.md` — expected: zero remaining "live" claims (a mention in a "removed 2026-08" changelog-style note is fine, a claim of current liveness is not).
- [ ] **Step 3: Commit** — `git commit -m "docs(ws-i): correct api.module-captures.tsx liveness claims ahead of its deletion (Task 18)"`

---

### Task 14: (reserved — folded into Task 2)

Removed during self-review: originally planned as a separate "dead exports outside `apps/web`" sweep, but the package consumer audit in Task 4/8 already covers every non-`apps/web` package, and `apps/web` is Task 2's scope. No separate task needed — renumbering kept stable rather than compacting, so cross-references in this plan don't drift; skip this number.

---

### Task 15: (reserved — folded into Task 6)

Same reasoning: a separate "verify no more unused deps" pass would just re-run Task 6 Step 1. Skip this number.

---

### Task 16: Dedupe time-formatting helpers into `app/utils/relative-time.ts`

Six local `timeAgo` implementations (`modules._index.tsx`, `connectors.$connectorId.tsx`, `connectors._index.tsx`, `support._index.tsx`, `flows._index.tsx`, `support.$ticketId.tsx`) plus two local `relativeTime` implementations (`_index.tsx`, `activity._index.tsx`) — none identical (different signatures: `Date | string` vs `string | null` vs `string`; different granularity — some bucket by minutes then hours then days, `flows._index.tsx` buckets by seconds; different "no value" fallback — `'never'` vs `'—'` vs no handling). Consolidating loses no behavior if the new util supports the union of what's needed: accepts `Date | string | null | undefined`, returns a consistent format, with an optional custom "no value" string.

**Files:**
- Create: `apps/web/app/utils/relative-time.ts`
- Create: `apps/web/app/__tests__/relative-time.test.ts`
- Modify: `apps/web/app/routes/modules._index.tsx`, `apps/web/app/routes/connectors.$connectorId.tsx`, `apps/web/app/routes/connectors._index.tsx`, `apps/web/app/routes/support._index.tsx`, `apps/web/app/routes/flows._index.tsx`, `apps/web/app/routes/support.$ticketId.tsx`, `apps/web/app/routes/_index.tsx`, `apps/web/app/routes/activity._index.tsx` — delete each local function, import the shared one, and **check every call site for a fallback-string dependency** (`flows._index.tsx` expects `'—'` for null input, others expect `'never'` or don't handle null at all) — pass the existing per-call-site fallback as the util's second argument so behavior doesn't silently change at any of the 8 sites.

- [ ] **Step 1: Write `relative-time.ts`** —

```ts
/**
 * Shared "time ago" formatter (WS-I dedupe — was 8 near-duplicate local
 * implementations across route files, see docs/superpowers/plans/
 * 2026-08-24-ws-i-cleanup.md Task 16). Buckets by minute → hour → day, matches
 * the most common of the prior implementations; callers needing a different
 * "no value" string pass `fallback`.
 */
export function relativeTime(value: Date | string | null | undefined, fallback = 'never'): string {
  if (value == null) return fallback;
  const t = typeof value === 'string' ? new Date(value).getTime() : value.getTime();
  if (Number.isNaN(t)) return fallback;
  const diffMs = Date.now() - t;
  const m = Math.round(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
```

- [ ] **Step 2: Write the test** (`relative-time.test.ts`) — cover: null/undefined → fallback (default `'never'` and a custom fallback like `flows._index.tsx`'s `'—'`); `NaN` date string → fallback; `< 1m` → `'just now'`; minute/hour/day bucket boundaries; both `Date` object and ISO string input accepted.
- [ ] **Step 3: Run** — `cd apps/web && npx vitest run app/__tests__/relative-time.test.ts`. Expected: PASS.
- [ ] **Step 4: Migrate each of the 8 call sites** — delete the local function, add `import { relativeTime } from '~/utils/relative-time';`, update call sites to `relativeTime(value)` or `relativeTime(value, '<site's existing fallback>')`. `flows._index.tsx` and `support.$ticketId.tsx` currently name the local function `timeAgo` at their call sites too — rename those call sites to `relativeTime(...)` so the import name matches usage (a pure rename, not a behavior change).
- [ ] **Step 5: Verify** — `cd apps/web && npx tsc --noEmit && npx vitest run` (full suite — these are route files with existing tests, check none broke on the rename) and manually diff each migrated site's rendered output expectation against its old local function's bucket boundaries (they match Step 1's implementation, which was modeled on the most common of the six `timeAgo` variants — `modules._index.tsx`'s and `support._index.tsx`'s bodies are identical to Step 1's; the other four differ only in signature/fallback, already handled by Step 4's fallback argument).
- [ ] **Step 6: Commit** — `git commit -m "refactor(ws-i): dedupe 8 local timeAgo/relativeTime implementations into app/utils/relative-time.ts"`

---

### Task 17: Dedupe `NON_MERCHANT_ACTIONS` into a shared constant

Byte-for-byte identical array duplicated in `apps/web/app/routes/_index.tsx:24-27` and `apps/web/app/routes/activity._index.tsx:39-42`.

**Files:**
- Create or extend: `apps/web/app/utils/activity-log.ts` (check whether a suitable shared utils file already exists near `ActivityLogService` before creating a new one — `apps/web/app/services/activity/activity.service.ts` is a service file, not a constants file; a new small `app/utils/activity-log.ts` is appropriate unless an existing `app/utils/*` file already groups activity-related constants)
- Modify: `apps/web/app/routes/_index.tsx`, `apps/web/app/routes/activity._index.tsx`

- [ ] **Step 1:** Confirm both arrays are still byte-identical at execution time (`diff <(sed -n '24,27p' apps/web/app/routes/_index.tsx) <(sed -n '39,42p' apps/web/app/routes/activity._index.tsx)` adjusting line numbers if either file has drifted since this review — expected: no diff, or a trivial formatting-only diff).
- [ ] **Step 2:** Add `export const NON_MERCHANT_ACTIONS = [...]` to `app/utils/activity-log.ts` with the same comment ("Operational/telemetry events that read as noise... to a merchant") preserved from the originals.
- [ ] **Step 3:** In both route files, delete the local const, import the shared one (`import { NON_MERCHANT_ACTIONS } from '~/utils/activity-log';`), leave the two call sites (`notIn: NON_MERCHANT_ACTIONS` in `_index.tsx`, `excludeActions: NON_MERCHANT_ACTIONS` in `activity._index.tsx`) unchanged — same value, same identifier, just imported instead of local.
- [ ] **Step 4: Verify** — `cd apps/web && npx tsc --noEmit && npx vitest run app/__tests__` (targeted at any test covering `_index.tsx`/`activity._index.tsx` loaders, plus the full suite for safety). Expected: unchanged behavior.
- [ ] **Step 5: Commit** — `git commit -m "refactor(ws-i): dedupe NON_MERCHANT_ACTIONS into app/utils/activity-log.ts"`

---

### Task 18: D7 delete-list — remove `/picker`, `/advanced`, `/api-usage`, `/logs`, `api.module-captures.tsx`

Runs after Task 13's doc fix. This is the actual page/route deletion; Task 13 already handled the doc-liveness claims for `api.module-captures.tsx`.

**Files:**
- Delete: `apps/web/app/routes/picker._index.tsx`, `apps/web/app/routes/advanced._index.tsx`, `apps/web/app/routes/api-usage._index.tsx`, `apps/web/app/routes/logs._index.tsx`, `apps/web/app/routes/api.module-captures.tsx`
- Delete: `apps/web/app/services/shopify/rate-limit.service.ts`'s `recordAdminThrottle` export (dead writer, per D7 — check the whole file doesn't become empty; if `rate-limit.service.ts` has other exports, only remove this one function)
- Modify: `apps/web/app/__tests__/merchant-auth-guards.test.ts` — remove the `advanced index requires...` and `picker index requires...` test cases (lines 14-27 per this review, re-verify at execution time)
- Modify: `apps/web/e2e/merchant/auth-guards.spec.ts` — change the iterated path list from `['/advanced', '/picker', '/modules']` to `['/modules']` (or delete the whole test if `/modules` alone doesn't justify the surrounding "gated like other merchant routes" framing — judgment call, keeping a single-route auth-guard check is still useful, prefer keeping it trimmed over deleting the test)
- Do NOT modify: `apps/web/e2e/internal/crawl-auth.spec.ts` (its `/internal/logs` and `/internal/advanced` entries are a different, live namespace — confirmed above)

- [ ] **Step 1: Re-verify zero inbound links at execution time** — `grep -rln "\"/picker\"\|'/picker'\|to=\"/picker" apps/web/app --include="*.tsx" | grep -v node_modules | grep -v "routes/picker"` and the equivalent for `/advanced`, `/api-usage`, `/logs`, and `grep -rln "api/module-captures\|api\\.module-captures" apps/web/app --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v "routes/api.module-captures.tsx"`. Expected: no hits for any of the five.
- [ ] **Step 2: Verify `recordAdminThrottle` still has zero callers** — `grep -rn "recordAdminThrottle" apps/web/app --include="*.ts" --include="*.tsx" | grep -v "rate-limit.service.ts"`. Expected: no hits.
- [ ] **Step 3: Delete the five route files** — `git rm apps/web/app/routes/picker._index.tsx apps/web/app/routes/advanced._index.tsx apps/web/app/routes/api-usage._index.tsx apps/web/app/routes/logs._index.tsx apps/web/app/routes/api.module-captures.tsx`
- [ ] **Step 4: Remove `recordAdminThrottle`** from `rate-limit.service.ts` (function only, not the file).
- [ ] **Step 5: Update the two auth-guard test files** per the Files list above.
- [ ] **Step 6: Verify** — `cd apps/web && npx tsc --noEmit && npx vitest run` (full suite — confirms `merchant-auth-guards.test.ts` passes with the trimmed case list and nothing else imports the deleted routes) and `pnpm --filter web run build`. Then, if a merchant dev server is reachable, run the Playwright spec: `npx playwright test e2e/merchant/auth-guards.spec.ts` — expected PASS with the trimmed path list (this step is best-effort in a sandboxed environment without a live Shopify session; the unit-level verification in Step 6's first half is the hard gate).
- [ ] **Step 7: Commit** — `git commit -m "chore(ws-i): delete D7 orphan pages (picker, advanced, api-usage, logs, api.module-captures) + recordAdminThrottle"`

---

### Task 19: Dedupe `catTone`/`catIcon` category-badge helpers

Identical one-line `catTone` bodies in `modules._index.tsx:89-91`, `modules.$moduleId.tsx:336-338`, `templates._index.tsx:29-31` (all `return CAT_BADGE_TONE[getCategoryTone(category)] ?? 'neutral';`); identical `catIcon` + `CAT_ICON` map in `modules._index.tsx:92-95` and `templates._index.tsx:32-35` (`modules.$moduleId.tsx` doesn't need `catIcon` — only migrate the two that have it).

**Files:**
- Modify: `apps/web/app/utils/type-label.ts` (already home to `getCategoryTone`/`getCategoryIcon`, which both helpers wrap — the natural place to add the wrapper functions themselves)
- Modify: `apps/web/app/routes/modules._index.tsx`, `apps/web/app/routes/modules.$moduleId.tsx`, `apps/web/app/routes/templates._index.tsx` — delete local `catTone`/`catIcon` + `CAT_ICON`, import from `type-label.ts`
- Check: `CAT_BADGE_TONE` — confirm where it's currently defined (likely also locally duplicated per-file alongside `catTone`; if so, it moves to `type-label.ts` too, in the same commit, so `catTone` doesn't end up split across two files)

- [ ] **Step 1:** Read `type-label.ts` in full to find `getCategoryTone`/`getCategoryIcon`'s current signatures and confirm `CAT_BADGE_TONE`'s current definition site(s) (`grep -n "CAT_BADGE_TONE" apps/web/app/routes/*.tsx apps/web/app/utils/type-label.ts`).
- [ ] **Step 2:** Add to `type-label.ts`: `export function catTone(category: string): WcTone { return CAT_BADGE_TONE[getCategoryTone(category)] ?? 'neutral'; }` (moving `CAT_BADGE_TONE` in if it was route-local) and `export function catIcon(category: string): string { return CAT_ICON[getCategoryIcon(category)] ?? 'layer'; }` (moving the `CAT_ICON` map in too). Import `WcTone` from `~/components/merchant/polaris` if `type-label.ts` doesn't already.
- [ ] **Step 3:** In each of the three route files, delete the local `catTone` (and `catIcon`/`CAT_ICON` where present), import `{ catTone, catIcon }` (or just `catTone` for `modules.$moduleId.tsx`) from `~/utils/type-label`.
- [ ] **Step 4: Verify** — `cd apps/web && npx tsc --noEmit && npx vitest run` and `pnpm --filter web run build`. Expected: green, badge rendering unchanged (pure extraction, no logic change).
- [ ] **Step 5: Commit** — `git commit -m "refactor(ws-i): dedupe catTone/catIcon into app/utils/type-label.ts"`

---

### Task 20: Stale PR triage — owner-run commands

**This plan's executor does not run these** — branch/PR mutations are outside the agent permission model (I4). Written here as exact copy-paste for the owner.

- [ ] **Step 1 (owner):** For each of PR #1–#6 (`cursor/critical-bug-inspection-*`), confirm nothing is salvageable beyond what this review already found (SSO/webhook/cron/secret-handling fixes superseded by WS-QF/WS-D/WS-G) by skimming the diff once more: `gh pr diff 1`, `gh pr diff 2`, ... `gh pr diff 6`. If a genuine gap surfaces that current `master` + open WS branches don't cover, do not close that PR — flag it back into the relevant WS plan instead.
- [ ] **Step 2 (owner):** Close the confirmed-superseded ones:
```bash
gh pr close 1 --comment "Superseded by WS-QF (SSO allowlist hardening) — see docs/superpowers/plans/2026-08-24-ws-qf-quick-fixes.md"
gh pr close 2 --comment "Superseded by WS-INT / internal-admin AI-provider secret handling work"
gh pr close 3 --comment "Cron trigger — superseded by WS-G ops automation (dead-man's switch, webhook fan-out hardening)"
gh pr close 4 --comment "Superseded by WS-G webhook fan-out hardening (claim+enqueue+ACK)"
gh pr close 5 --comment "Superseded by WS-G webhook fan-out hardening (claim+enqueue+ACK)"
gh pr close 6 --comment "Superseded by WS-G webhook fan-out hardening + WS-D settings partial-update fixes"
```
- [ ] **Step 3 (owner):** PR #7 (`cursor/dev-env-setup-bd88`) is different in kind — an `AGENTS.md` doc addition + a real test-portability fix (`internal-ai-router.test.ts`, resolving `apps/web` via `import.meta.url` instead of relying on `pnpm` being on the Vitest worker PATH). Decide: (a) cherry-pick the test-portability fix directly into `master` (small, real, unrelated to the `AGENTS.md` content) and close the PR, or (b) merge it as-is if `AGENTS.md` is still wanted, or (c) close outright if WS-J's doc rewrite supersedes the need for a Cursor-specific `AGENTS.md`. This plan does not decide (a)/(b)/(c) for the owner — flag as an open question below.
- [ ] **Step 4 (owner):** After closing, verify: `gh pr list --state open` shows none of #1–#7 (or #7 per whichever of (a)/(b)/(c) was chosen).

---

### Task 21: Local worktree cleanup — owner-run commands

Owner-gated per I4. Only remove a worktree once its branch has actually merged to `master` — check first, don't assume.

- [ ] **Step 1 (owner):** For each `sa-wt-*` worktree, check merge status: `git branch --merged master | grep -E "ws-a-tail|ws-b-gates|ws-d-conformance|ws-e-publish-integrity|ws-g-ops-integrations|ws-h-templates|ws-qf-quick-fixes"` and separately `git merge-base --is-ancestor fix/vitest-tsx-glob master && echo merged || echo not-merged`. Only worktrees whose branch shows as merged are candidates for removal.
- [ ] **Step 2 (owner):** For each merged one, remove the worktree and (optionally) the now-fully-merged local branch:
```bash
git worktree remove /Users/lavipun/Work/sa-wt-<name>
git branch -d feat/<branch-name>   # -d (not -D) refuses if not actually merged — safety check
```
- [ ] **Step 3 (owner):** Leave unmerged worktrees (`sa-wt-ws-a`, `sa-wt-ws-e`, `sa-wt-ws-g`, `sa-wt-ws-h`, `sa-wt-testfix` as of this review — re-check at execution time, some may have merged by then) in place; re-run this task later as branches land. Also leave `/Users/lavipun/Work/ai-shopify-superapp-vocab` (`feat/036-vb-remainder`, unrelated to this program) and `.claude/worktrees/focused-mccarthy-e3dc9a` (a Claude-managed worktree, not a `sa-wt-*` program worktree) alone — out of scope for this task.
- [ ] **Step 4 (owner):** `git worktree list` afterward to confirm only active, unmerged program worktrees remain.

---

## Self-Review (performed while writing)

1. **Spec coverage** against the WS-I charter: V2 apps + workflows + vault + gitbook-integration + stale worktree + `.venv-modal` + `get_started.py` deletion (Tasks 3, 7, 8, 10, 21) ✓; ~170 dead exports (Tasks 1-2, re-derived not trusted) ✓; 3 dead server files (Tasks 5, 9 — 2 deleted, 1 correctly NOT deleted with a stated reason) ✓; orphan scripts (Task 12) ✓; 4 unused deps (Task 6, re-derived — found 2, said so) ✓; 3 dead packages (Tasks 4, 8 — 2 immediate + 3 V2-gated, reconciled against what the investigation actually found, discrepancy stated) ✓; dedupe helpers incl. timeAgo→relative-time, NON_MERCHANT_ACTIONS, tone maps (Tasks 16, 17, 19 — tone maps turned out to be `catTone`/`catIcon`, the concrete duplication found) ✓; orphan pages per D7 (Task 18, delete-list only, wire-list correctly deferred to WS-F) ✓; stale PR triage (Task 20, owner-gated) ✓; worktree deletion (Task 21, owner-gated) ✓.
2. **Placeholder scan:** no task says "TBD" or defers a decision without a concrete next step. Task 9 (publish-worker.adapter) and Task 21 (worktree merges) are the only tasks that can legitimately stay open across multiple passes — both have an explicit re-check mechanism, not an open-ended "later."
3. **Gate honesty:** Tasks 8, 9, 11 each name the exact grep/branch-check that constitutes "gate passed," per the charter's explicit instruction not to gate on vibes. Task 8's gate additionally requires a WS-C plan file to exist at all — if WS-C hasn't been planned yet when this task is attempted, the gate mechanically fails closed rather than being skippable.
4. **Numeric-claim discipline (WS-J rule):** every count in this plan ("2 packages," "2 unused deps," "6 timeAgo + 2 relativeTime") is this review's own re-derivation, stated as such, with the original audit's differing figures noted rather than silently reconciled. Task 2's dead-export count is explicitly left unresolved until Task 1 runs live.
5. **Cross-plan consistency:** Task 8's gate condition matches WS-E's own plan header, which states "nothing in this plan touches the V2 apps; no salvage needed here" — confirming WS-E is not an alternate gate-owner, only WS-C is, correcting the launch-program.md dependency line's ambiguous wording ("WS-E salvage-before-delete ordering with WS-I (D2)") for this plan's purposes. Task 11's gate matches WS-E's own Task 11 contract (`unpublishThenDelete`, three call sites) verbatim from the WS-E plan file.

## Execution order & shippability

Each task is independently committable and shippable — this plan does not require a single big-bang merge. Recommended order (verification/gates first, deletions next, dedupe last, per the charter's instruction):

1. **Immediately runnable, no gates, any order:** Tasks 1 → 2, 3, 4, 5, 6, 7, 12, 13 (Task 13 before Task 18). Each is shippable alone; CI stays green after every one.
2. **Gated, run when their condition passes (can interleave with the above once ready):** Task 8 (needs WS-C), Task 9 (needs WS-C plan to exist, may resolve independently of Task 8's full gate), Task 10 (standalone V2 item, no salvage needed — can actually run any time, listed near Task 8 for narrative grouping only), Task 11 (needs WS-E Task 11 merged).
3. **D7 page deletion:** Task 18, after Task 13.
4. **Dedupe/refactor, last because they touch live code:** Tasks 16, 17, 19 — independent of each other, independent of everything above, can run in parallel with the gated tasks since they don't touch V2, `ModuleService`, or the D7 pages.
5. **Owner-run, whenever the owner has a moment, no code dependency:** Tasks 20, 21.

A minimal "ship what's ready today" slice is Tasks 1–7 + 12–13 + 16–19 (everything with no gate) — that alone removes the gitbook tool, two dead packages, two dead server files, two unused deps, the Modal scratch files, orphan scripts, and all three dedupe cleanups, without waiting on WS-C or WS-E. Tasks 8–11 and 18 land as their gates clear; Tasks 20–21 are owner-paced.

## Out of scope

- **A permanent CI dead-code gate** (making `knip` or similar a standing check, the way WS-B wired `build-theme-liquid.mjs --check`). Task 1 uses `knip` ad hoc, once, uninstalled afterward. Turning this into a recurring gate is a WS-B-shaped decision (it owns CI) — flagged for a future workstream, not built here.
- **Railway Config-as-code deprecation migration** (before 2026-12-01) and **scheduled `pg_dump` backup job** (Hobby plan has no managed backups) — per the launch-program.md Phase 5 preamble, these "may land in WS-G instead if sequencing suits." This plan does not claim either; if WS-G doesn't pick them up, they need a home before 2026-12-01, but assigning that home is not this plan's call.
- **`fix/vitest-tsx-glob`'s route.tsx-folder conversion** of `api.connectors.test.tsx` / `api.agent.connectors.$connectorId.test.tsx`. Confirmed live, not dead; conversion (if still wanted) stays that branch's own scope.
- **WS-F's D7 wire-list** (`/jobs`, `/flows/templates`, captures link restoration in `modules.$moduleId.tsx`). Not this plan's — see Decisions of record I5 and the Verified ground truth D7 split.
- **`/internal/logs`, `/internal/advanced`** and the rest of the internal-admin route set. Confirmed live, different namespace from the merchant pages this plan deletes; not touched.
- **A decision on PR #7's `AGENTS.md` content** — Task 20 Step 3 surfaces the choice, doesn't make it.

## Open questions (max 5, genuinely blocking or owner-decision-only)

1. **WS-C has no plan file yet.** Tasks 8 and 9's gates cannot pass until `docs/superpowers/plans/2026-08-24-ws-c-*.md` exists and lands its BullMQ-porting work (specifically, repointing `apps/web/app/services/preview/preview-export.queue.server.ts`'s `createImageStorageProcessor` import off `@superapp/workers`). This is the single largest scheduling dependency in this plan and isn't resolvable by WS-I itself.
2. **The audit's "3 dead packages" doesn't cleanly map to this review's findings.** This review found `packages/data-layer` + `packages/intent-graph` as the only packages with zero consumers *anywhere* (including V2), while `packages/db`/`observability`/`security` have real consumers today (the V2 apps) and only become dead once Task 8 executes. Is the intended "3" (a) data-layer + intent-graph + one of {db, observability, security} counted early, or (b) simply a stale/approximate figure from the original audit? Doesn't block execution (Task 4 and Task 8 between them delete all five correctly either way), but worth a sanity check with whoever ran the original audit if the number matters for reporting.
3. **The audit's "4 unused deps" — this review found 2** (`@xyflow/react`, `@shopify/polaris-icons`) after checking all 55 entries in `apps/web/package.json` individually, including several that looked suspicious at first grep and turned out legitimate. Task 6 re-checks at execution time rather than assuming 2 more exist; if none turn up, the plan proceeds with 2, not 4 — flagging in case the original audit was counting deps in a package this review didn't scope (e.g., a since-changed `apps/api`/`apps/workers` package.json, moot post-Task-8 anyway).
4. **PR #7 disposition (Task 20 Step 3)** is explicitly an owner call between cherry-pick / merge-as-is / close-outright — not something this plan or its executor should decide unilaterally.
