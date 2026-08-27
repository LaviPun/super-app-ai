# WS-J — Documentation Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current sprawling, drifted `docs/` tree (44 top-level entries, several 100KB+ files, numeric claims that have already drifted three ways in the same repo — see `docs/audit/doc-drift-diff.md`) with the ~12-doc canonical structure from the launch program (README, architecture, generation, ai-providers, publishing, flows, operations, internal-admin, data-models, testing, debug ledger, CHANGELOG), a kill/archive pass that retires everything superseded, a dated re-runnable audit harness (generalizing the pattern already proven at `docs/design-system/AUDIT-2026-07-10.md`), and a closing MEMORY.md sync — with zero numeric claims in prose and zero claims that something is verified/deployed/wired when it isn't.

**Architecture:** Four phases in order: (1) **kill/archive** everything the ~12-doc structure supersedes, so later tasks aren't editing docs that are about to be deleted; (2) **build the audit harness** (a template + methodology, not a one-off), which every subsequent doc task's verification step leans on; (3) **rewrite each of the 12 canonical docs**, one task per doc, each with an outline + a source-of-truth checklist (files/services to read at *execution* time, not content frozen into this plan) + a grep-based staleness check; (4) **root README + docs/README index**, last, because it's the front door referencing everything else, and a **MEMORY.md sync**, last of all, because it should point at the finished doc set, not the mid-rewrite one.

Because WS-J runs **last** in the program (dependency edge: "WS-J last-but-continuous — each WS updates its own doc as it lands"), this plan is deliberately not a content spec. Every doc task gives structure (section list, source-of-truth checklist, verification grep) rather than prose paragraphs, because the actual facts (what's live on Railway, which WS plans merged, what WS-E's `docs/publishing.md` says) will have moved on by execution time. Where this plan does state a fact (the "Verified ground truth" section below), it is dated and cites a commit — the executor re-verifies it, never copies it blind.

**Tech Stack:** Markdown only. No application code changes. Verification is `grep`/`git log`/`git mv`/link-checking — no test suite to run, but any doc task that touches `README.md` code fences (setup commands) should paste-verify them against `package.json` scripts rather than trusting memory.

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` (WS-J bullet, Phase 5, line 59) + Decision-log context in the nine-agent audit ([[full-audit-2026-08]] memory: "Doc rewrite APPROVED (~12-doc structure, no counts in prose)").

## Dependencies (plan header — read before executing)

- **Runs last.** Every other WS plan (A, B, C, D, E, F, G+INT, H, I, QF, S) should be merged, or as far along as they're going to get, before this plan executes — otherwise the per-doc tasks below are auditing a moving target. If a dependency doc doesn't exist yet at execution time (e.g. WS-E's `docs/publishing.md` Task 16, or a WS-F/H doc note), the corresponding WS-J task creates it from the same source-of-truth checklist instead of assuming prior content.
- **`docs/publishing.md` ownership handoff:** WS-E Task 16 (`docs/superpowers/plans/2026-08-24-ws-e-publish-integrity.md`) writes the first version of this file as part of landing the activation/unpublish/rollback work, explicitly "folded here... per program rule 'each WS updates its own doc as it lands.'" WS-J Task 6 does NOT rewrite it from scratch — it audits WS-E's version against this plan's house style (no counts, dated-audit-harness compliant, cross-linked from the index) and fixes structure, not re-derives content.
- No code dependency. WS-J touches `docs/`, root `README.md`, root `CHANGELOG.md` (new), and one file outside the repo (`~/.claude/projects/-Users-lavipun-Work-ai-shopify-superapp/memory/MEMORY.md`) in the final task.

## Global Constraints

- **No numeric claims in prose** (program-wide WS-J rule, `launch-program.md` line 31). Any count — test totals, template totals, endpoint totals, percentages, line counts, "N routes," "N tables" — must become a link to the command that computes it live (e.g. `pnpm --filter web test` / `pnpm --filter web test -- --reporter=verbose | tail -1`, `git -C . ls-files 'apps/web/app/routes/api.agent.*' | wc -l`), never a hardcoded digit. This is *why* `docs/_glossary.md` gets deleted in Task 1: it is a hand-maintained numeric SSOT whose entire purpose is the pattern this rule bans, and its own listed facts have already drifted (`docs/audit/doc-drift-diff.md`: test count claimed 163, then 253, then reconciled to 347 across three docs — three different wrong answers before anyone linked to a command instead).
- **Honesty discipline** (program house rule; the runbooks model it with `STATUS` blocks — see `docs/runbooks/app-pricing-setup.md` and `docs/runbooks/scope-reconsent.md` for the pattern to imitate: a `## Status` section near the top stating what's verified-live vs. owner-action-pending vs. not-yet-attempted). A doc must never claim something is verified/deployed/wired when it isn't. Every rewrite task below carries a grep-based staleness check targeting exactly the false claims already known to exist (per `docs/audit/drift-ledger.md` and the memory reality-check notes) — the check must pass, or the doc must carry an explicit "removed" / "not yet wired" / "unverified" annotation, never silence.
- **Archive, don't delete**, for any file with unique content: `git mv` into `docs/archive/<original relative path>` (preserving git history/blame). The only outright deletions are `docs/_glossary.md` (see above, its purpose is banned) and the three placeholder stub files that get overwritten in place rather than removed (`docs/audit/README.md`, `docs/design-system/README.md`, `docs/runbooks/README.md` — each currently a single line of filler).
- **Operations doc references runbooks, never duplicates them.** `docs/operations.md` owns topology + SLO pointer + "which runbook do I reach for" index; step-by-step incident procedure stays exclusively in `docs/runbooks/*.md`.
- **Dated, re-runnable audits, not one-off prose claims.** Every rewritten doc's ground truth is checked via the harness built in Task 2 (generalizing `docs/design-system/AUDIT-2026-07-10.md`'s proven shape: scope statement → "✅ Verified correct" → "🔧 Fixed in this pass" → "Follow-ups" → dated filename), and the harness is designed to run again after WS-J ships, not just once during this rewrite.
- All file paths are repo-relative to `/Users/lavipun/Work/ai-shopify-superapp` unless stated otherwise.
- Every task's "Verify" step names a concrete `grep`/`git` command and its expected result. Where a single grep can't cover a claim (prose judgment calls), the task says so explicitly and gives the closest mechanical proxy — never "read it and use judgment" as the *only* check.
- No CI impact: this is a docs-only workstream. WS-B's build/test gates are untouched. Still run `git grep -n '](\./.*\.md)' docs/<changed-file>.md` style relative-link sanity checks per task so the kill/archive pass doesn't leave dead links.

## Verified ground truth (2026-08-24, `master@fa48bae`)

Facts this plan relies on — re-verify at execution time, do not re-derive blind:

- **`docs/` inventory** (44 top-level entries excluding `gitbook`/`gitbook-integration`): the largest are `docs/implementation-status.md` (176KB / ~1,900 lines, still being appended to as of `master@fa48bae`), `docs/ai-module-main-doc.md` (248KB / 3,617 lines), `docs/superai-doc.md` (114KB, last touched 2026-03-05 — the stalest file in the tree), `docs/phase-plan.md` (69KB), `docs/spec-kit-status-report.md` (70KB). `docs/gitbook-integration/node_modules/` is untracked (`git ls-files` returns 0 files under it) — not a doc-kill candidate, out of scope.
- **`docs/audit/`** holds four real artifacts to build on, not replace: `drift-ledger.md` (11 open rows, format: Claim | Reality | Decision | PR), `doc-drift-diff.md` (the three-way test-count drift + endpoint-count reconciliation), `test-baseline.json`, `security-leak-ledger.{md,json}`. `docs/audit/README.md` is currently the literal one-line stub `# audit`.
- **The dated-audit pattern already in the repo** is `docs/design-system/AUDIT-2026-07-10.md`: a scope line, then `## ✅ Verified correct (no action needed)`, `## 🔧 Fixed in this pass`, `## ✅ Follow-ups — closed <date> (same day)` sections, each item citing exact files/line-level facts. It is a manual, dated, filename-stamped pass — not a script. No automation currently reruns it; Task 2 formalizes the shape into a template usable for any of the 12 docs, not just design-system.
- **`docs/_glossary.md`** exists today specifically to pin the numbers that keep drifting (test count, endpoint count, Phase-2 scope label) across `README.md` / `implementation-status.md` / `phase-plan.md`. It is the numeric-SSOT anti-pattern the WS-J rule bans — kill it, not migrate it.
- **Retired-architecture docs currently presented as current:** `docs/release-operations.md`, `docs/integrations/platform-hosting.md`, `docs/deployment/env-matrix.md`, and `docs/gitbook/02-architecture/v2-migration/*` (ADR-001, ADR-002, `platform-v2-migration-plan.md`, `cloudflare-deployment-runbook.md`, `phase-21-rollout-cutover.md`) describe a Cloudflare-primary / Vercel-frontend / Fastify-API / BullMQ-workers "Platform V2" split across `apps/frontend`, `apps/api`, `apps/workers`. Per the 2026-08-24 audit decision **D2 ("V2 apps (api/workers/frontend) + vault RETIRED — salvage BullMQ patterns first")**, this is dead direction, not current architecture. The live topology is Railway: `apps/web` (Remix, web+worker processes) + Postgres + Redis (see [[launch-wave-two-2026-08]] memory: "APP IS LIVE ON RAILWAY... 49/49 tables verified"). These docs are archive candidates, not rewrite targets — Task 1.
- **Root `README.md`** (81KB / 1,163 lines, last touched 2026-06-13 at commit `6472f6d`) is the project's front door and itself contains stale claims: "Platform V2 Phase 12/13," "local SQLite" setup steps (superseded by WS-A's Postgres cutover), and a numeric-heavy "Table of contents"/test-count section. This is the "README" item in the launch program's 12-doc list — `docs/README.md` (5KB) is a secondary index page for `docs/` specifically and stays small.
- **`docs/testing.md` and `CHANGELOG.md` do not exist yet** anywhere in the repo (`.gstack-tools/gstack/CHANGELOG.md` is the vendored tool's own changelog, unrelated). Both are net-new in this plan.
- **`docs/publishing.md` does not exist yet** at plan-writing time — WS-E Task 16 creates it. `docs/flow-automation.md`, `docs/technical.md`, `docs/release-operations.md` exist and are the direct predecessors of `docs/flows.md`, `docs/architecture.md`, `docs/operations.md` respectively (Task file list below specifies `git mv` sources).
- **Known false/overstated claims already catalogued**, that the rewritten docs must not reproduce (each becomes a grep target in its doc's task):
  - Billing: `createSubscription` / `appSubscriptionCreate` / `BILLING_TEST_MODE` were removed (commit `132a82a`, confirmed resolved in `docs/audit/drift-ledger.md`); current billing is Shopify App Pricing (WS-D, merged `008deb3`).
  - Publish integrity: `ProgressivePublishService`/"progressive publish"/canary rollout is theater and removed per WS-E Decision E4 (real state as of this plan's writing: WS-E is through Task 13 on an unmerged branch — Tasks 14–17 pending; re-check WS-E's actual merge state at execution time before asserting anything is "done").
  - Flow engine: per [[flow-automation-engine]] memory, "FLOW_ENGINE_V2 / durable-wait / reliability layer" strings exist only in docs, never implemented; partially superseded by [[full-audit-2026-08]]'s correction that `flow-runner`/`resumeDueWorkflowRuns` wiring is now real — the flows.md rewrite must reflect the *current* state at execution time, not either stale extreme.
  - Persistence: `docs/audit/drift-ledger.md` still says "Prisma datasource is still SQLite" — WS-A's Postgres cutover (per [[launch-wave-two-2026-08]]) makes this row resolved; data-models.md must say Postgres, and the drift-ledger row must be marked resolved in the same pass.
  - Config editors: [[full-audit-2026-08]] confirms `ConfigEditor`/`StyleBuilder` "no longer exist at all" (stronger than the older "imported-not-mounted" memory note) — generation.md must not describe them as present-but-unwired.
  - `composeBlueprint` still does not exist (confirmed current as of the 2026-08 audit) — generation.md must not imply it does.

## Decisions of record for this plan

| # | Decision |
|---|----------|
| J1 | **Archive by default** (`git mv` to `docs/archive/<path>`), never `rm`, except `docs/_glossary.md` (deleted — its purpose is banned) and the three placeholder READMEs (overwritten in place). |
| J2 | **Direct renames use `git mv` to the new canonical name**, not archive-then-recreate, so history carries over: `docs/technical.md` → `docs/architecture.md`; `docs/flow-automation.md` → `docs/flows.md`; `docs/release-operations.md` → `docs/operations.md`; `docs/ai-module-main-doc.md` → `docs/generation.md`. Docs that fold INTO one of these (e.g. `catalog.md` into `generation.md`) get their unique content merged first, then are archived separately — they are not the `git mv` base. |
| J3 | **`CHANGELOG.md` lives at repo root**, sibling to root `README.md`, in [Keep a Changelog](https://keepachangelog.com)-lite format (`## [Unreleased]` / dated release headers), seeded from `git log` on WS-lettered merge commits — not hand-recalled history. |
| J4 | **The "README" deliverable is root `README.md`**, not `docs/README.md`. `docs/README.md` stays a lightweight index (table of the 12 canonical docs + `runbooks/` + `audit/` + `archive/`), refreshed as a small sub-step of the README task, not rewritten from scratch. |
| J5 | **`docs/debug.md` is audited and pruned, not rewritten.** It's an append-only bug ledger (already the right shape per the README's own description: "Recurring bugs and known fixes"). The task marks superseded entries `SUPERSEDED (<reason>, <WS>)` inline rather than deleting them — deleting bug history defeats the ledger's purpose — and fixes only structural drift (e.g. Cloudflare-tunnel-timeout entries, now that WS-A retired the tunnel). |
| J6 | **`docs/publishing.md` is audited against house style, not re-derived**, per the Dependencies section above — WS-E owns its technical content. |
| J7 | **The dated-audit harness is a template + convention, not a script.** No automated drift-checker exists in this repo (confirmed — Task 2's own investigation step verifies this at execution time too); building one is out of scope for a docs workstream. The harness is: `docs/audit/AUDIT-TEMPLATE.md` (the reusable shape) + a documented convention in `docs/audit/README.md` for naming (`docs/audit/AUDIT-<doc-slug>-<YYYY-MM-DD>.md`) and for updating `docs/audit/drift-ledger.md` rows to `RESOLVED` with a commit SHA when a pass closes them — mirroring how `drift-ledger.md` already records the one resolved billing row. |
| J8 | **`docs/qa/*` and `docs/internal-admin-qa-scorecard-2026-05-01.md` are archived wholesale**, not folded into any of the 12 docs — they are point-in-time audit snapshots (some describing the retired V2 stack), not living documentation, and `docs/archive/README.md` already exists as the landing spot for exactly this kind of artifact. |
| J9 | **MEMORY.md sync is the last task, and it prunes as much as it adds** — once real docs exist for architecture/generation/flows/operations/publishing, the corresponding "See Also" bullets in MEMORY.md that currently carry inline summaries should point at the docs instead of re-explaining; stale bullets whose facts are now stale-checked into the docs (e.g. counts, "STILL:" caveats now resolved) get trimmed, not left to rot in two places. |

## File Structure (moves / creates / deletes)

```
# Phase 1 — kill/archive (Task 1)
docs/_glossary.md                                          [DELETE — numeric SSOT, banned pattern]
docs/audit/README.md                                       [M — overwrite stub with harness pointer]
docs/design-system/README.md                                [M — overwrite stub]
docs/runbooks/README.md                                     [M — overwrite stub, already links index.md]
docs/release-operations.md          → docs/archive/release-operations.md   [after unique content merged into docs/operations.md, J2 renames the live doc instead — see below]
docs/superai-doc.md                 → docs/archive/superai-doc.md
docs/spec-kit-status-report.md      → docs/archive/spec-kit-status-report.md
docs/phase-plan.md                  → docs/archive/phase-plan.md
docs/implementation-status.md       → docs/archive/implementation-status.md  [history mined into CHANGELOG.md first]
docs/catalog.md                     → docs/archive/catalog.md               [content merged into generation.md]
docs/audit-module-combinations.md   → docs/archive/audit-module-combinations.md
docs/blueprints.md                  → docs/archive/blueprints.md            [content merged into generation.md]
docs/bundle-runtime.md              → docs/archive/bundle-runtime.md        [content merged into generation.md/publishing.md]
docs/module-system-v2.md            → docs/archive/module-system-v2.md      [content merged into generation.md]
docs/module-settings-modernization.md → docs/archive/module-settings-modernization.md
docs/superapp-surface-inventory.md  → docs/archive/superapp-surface-inventory.md [content merged into architecture.md/generation.md]
docs/uiux-guideline.md              → docs/archive/uiux-guideline.md        [DESIGN.md is SoT per CLAUDE.md]
docs/deployment/                    → docs/archive/deployment/              [V2 env matrix]
docs/integrations/                  → docs/archive/integrations/            [V2 hosting guide]
docs/qa/                            → docs/archive/qa/                     [J8]
docs/internal-admin-qa-scorecard-2026-05-01.md → docs/archive/internal-admin-qa-scorecard-2026-05-01.md
docs/gitbook/02-architecture/v2-migration/*     → docs/archive/gitbook-v2-migration/*  [ADRs + runbook + phase-21, V2-only]

# Phase 2 — audit harness (Task 2)
docs/audit/AUDIT-TEMPLATE.md        [C]
docs/audit/README.md                [M — methodology + naming convention]

# Phase 3 — the 12 canonical docs (Tasks 3–13, one per doc — see Decisions J2/J4)
docs/technical.md          → docs/architecture.md   [M, git mv + rewrite]     Task 3
docs/ai-module-main-doc.md → docs/generation.md     [M, git mv + rewrite]     Task 4
docs/ai-providers.md                                [M, audit + refresh]     Task 5
docs/publishing.md                                  [M or C, audit only]     Task 6
docs/flow-automation.md    → docs/flows.md          [M, git mv + rewrite]    Task 7
docs/release-operations.md → docs/operations.md     [M, git mv + rewrite]    Task 8
docs/internal-admin.md                              [M, audit + refresh]    Task 9
docs/data-models.md                                 [M, audit + refresh]    Task 10
docs/testing.md                                     [C]                    Task 11
docs/debug.md                                       [M, audit + prune]     Task 12
CHANGELOG.md (repo root)                            [C]                    Task 13

# Phase 4 — front door + memory (Tasks 14–15)
README.md (repo root)                               [M]                    Task 14
docs/README.md                                       [M]                    Task 14
~/.claude/.../memory/MEMORY.md                       [M, outside repo]     Task 15
```

---

### Task 1: Kill/archive pass

Retire everything the ~12-doc structure supersedes before any rewrite task touches its replacement, so no one edits a doc that's about to move.

**Files:** see the "Phase 1" block in File Structure above (18 targets: 1 delete, 3 stub-overwrites, 14 archive-moves including 2 directories).

- [ ] **Step 1: Confirm nothing links to the retired V2 docs from a doc that will survive.** Before moving anything:
  ```bash
  git grep -ln "platform-hosting\|deployment/env-matrix\|v2-migration\|Platform V2\|apps/frontend\|apps/api\b\|apps/workers\b\|BullMQ\|Cloudflare" -- 'docs/*.md' ':!docs/gitbook' ':!docs/gitbook-integration'
  ```
  Record every hit — each surviving doc's rewrite task (3, 8, 9, 14) must remove or historicize these references, not just leave dangling links after the move.

- [ ] **Step 2: Delete the glossary.**
  ```bash
  git rm docs/_glossary.md
  ```
  Then fix its two inbound references (`docs/README.md` "Planning And Status" table row, and any `[_glossary.md]` links found by `git grep -n "_glossary" -- 'docs/*.md' README.md`) — remove the row/links rather than leaving a 404.

- [ ] **Step 3: Overwrite the three stub READMEs** (content lands fully in Task 2 for `docs/audit/README.md`; for the other two, a one-paragraph "what lives here + how it's maintained" replacing the one-liner is enough here):
  - `docs/design-system/README.md` — point to `docs/design-system/module-design-system.md` as the living doc and `docs/design-system/AUDIT-2026-07-10.md` as the audit-pattern exemplar Task 2 generalizes.
  - `docs/runbooks/README.md` — point to `docs/runbooks/index.md` (already does — verify it still resolves) and to `docs/operations.md` (Task 8) once it exists.

- [ ] **Step 4: Archive the directories and files** listed in File Structure's Phase 1 block, `git mv` one at a time (not a bulk script — each move should get its own reviewable diff line):
  ```bash
  git mv docs/superai-doc.md docs/archive/superai-doc.md
  git mv docs/spec-kit-status-report.md docs/archive/spec-kit-status-report.md
  git mv docs/phase-plan.md docs/archive/phase-plan.md
  git mv docs/catalog.md docs/archive/catalog.md
  git mv docs/audit-module-combinations.md docs/archive/audit-module-combinations.md
  git mv docs/blueprints.md docs/archive/blueprints.md
  git mv docs/bundle-runtime.md docs/archive/bundle-runtime.md
  git mv docs/module-system-v2.md docs/archive/module-system-v2.md
  git mv docs/module-settings-modernization.md docs/archive/module-settings-modernization.md
  git mv docs/superapp-surface-inventory.md docs/archive/superapp-surface-inventory.md
  git mv docs/uiux-guideline.md docs/archive/uiux-guideline.md
  git mv docs/internal-admin-qa-scorecard-2026-05-01.md docs/archive/internal-admin-qa-scorecard-2026-05-01.md
  git mv docs/deployment docs/archive/deployment
  git mv docs/integrations docs/archive/integrations
  git mv docs/qa docs/archive/qa
  mkdir -p docs/archive/gitbook-v2-migration && git mv docs/gitbook/02-architecture/v2-migration/* docs/archive/gitbook-v2-migration/ && git mv docs/gitbook/02-architecture/ADR-001-platform-v2-architecture.md docs/archive/gitbook-v2-migration/ 2>/dev/null || true
  ```
  **Do NOT move `docs/implementation-status.md` or `docs/release-operations.md` in this step** — `implementation-status.md`'s history feeds Task 13 (CHANGELOG) before it's archived, and `release-operations.md` is a `git mv` *rename target* for Task 8, not an archive candidate (per Decision J2, archiving it separately would break the history-preserving rename). Flag both for their respective later tasks instead.

- [ ] **Step 5: Verify no dangling links remain into `docs/archive/` paths that used to be at their old location**, and no doc still cites the deleted glossary:
  ```bash
  git grep -n "_glossary" -- '*.md' && echo "FAIL: glossary still referenced" || echo "OK: no glossary refs"
  git grep -n "](\./deployment/\|](\./integrations/\|](\./qa/\|](\./catalog\.md\|](\./blueprints\.md\|](\./bundle-runtime\.md\|](\./module-system-v2\.md\|](\./module-settings-modernization\.md\|](\./superapp-surface-inventory\.md\|](\./uiux-guideline\.md" -- 'docs/*.md' && echo "FAIL: dangling relative links to archived paths" || echo "OK: no dangling links"
  ```
  Both must print `OK`. Any surviving doc that legitimately needs to reference archived material links to `docs/archive/<name>.md` explicitly (with an "(archived — superseded by X)" note), not the old bare path.

- [ ] **Step 6: Commit.**
  ```bash
  git commit -m "docs(ws-j): kill/archive pass — retire V2/stale docs ahead of the 12-doc rewrite"
  ```

---

### Task 2: Dated re-runnable audit harness

Generalize `docs/design-system/AUDIT-2026-07-10.md`'s proven shape into a template + naming convention every later doc task (and future maintenance passes) uses to check ground truth against the live repo, and to close out rows in `docs/audit/drift-ledger.md`.

**Files:**
- Create: `docs/audit/AUDIT-TEMPLATE.md`
- Modify: `docs/audit/README.md` (currently the literal stub `# audit`)
- Modify: `docs/audit/drift-ledger.md` (add the "how a row gets closed" convention note at the top — the table format itself stays)

- [ ] **Step 1: Write the template**, `docs/audit/AUDIT-TEMPLATE.md`, mirroring the design-system exemplar's section shape exactly (verified structure: scope line → `## ✅ Verified correct (no action needed)` → `## 🔧 Fixed in this pass` → `## Follow-ups`):

  ```markdown
  # <Doc name> Audit — <YYYY-MM-DD>

  Scope: `docs/<file>.md` verified against the live repo (`ai-shopify-superapp`) at `master@<short-sha>`.

  ## ✅ Verified correct (no action needed)

  1. **<Claim>.** <File:line evidence.>

  ## 🔧 Fixed in this pass

  1. **<What was stale>.** <What changed, cite the doc section + the code/commit that made it stale.>

  ## Follow-ups (open)

  1. <Anything found but not fixed in this pass — becomes a `docs/audit/drift-ledger.md` row if it's a claim-vs-reality gap, or a TODO note in the doc itself if it's just incomplete coverage.>

  ## Drift-ledger rows closed by this pass

  | Row (from drift-ledger.md) | Resolution | Commit |
  |---|---|---|
  ```

- [ ] **Step 2: Write the methodology into `docs/audit/README.md`** (replacing the one-line stub):
  - **When to run one:** after any WS plan lands that touches a doc's subject matter (the natural trigger — WS-J's own dependency note "each WS updates its own doc as it lands" already implies most drift gets caught then); otherwise on a periodic pass (no fixed cadence enforced — this is a manual methodology, not a cron job, matching design-system's actual history of one dated pass, not a series).
  - **Naming:** `docs/audit/AUDIT-<doc-slug>-<YYYY-MM-DD>.md`, one file per pass (do not overwrite prior dated audits — they're a history, same as `docs/design-system/AUDIT-2026-07-10.md` was kept rather than edited in place after its own "closed same day" follow-ups).
  - **Process:** (1) re-read the doc's own "source-of-truth checklist" (each of Tasks 3–12 below defines one for its doc — copy it into the audit's scope line); (2) grep/read the cited files; (3) file every gap under Verified/Fixed/Follow-ups; (4) any gap that's a "doc claims X, code does Y" mismatch also gets a new row in `docs/audit/drift-ledger.md` (or closes an existing row — see below).
  - **Closing a `drift-ledger.md` row:** replace the row's `Decision`/`PR` cells the same way the existing resolved billing row does (strikethrough claim + **RESOLVED** + explanation + commit SHA) — do not delete rows, the ledger is itself a dated history.

- [ ] **Step 3: Add the closure convention as a one-line header note to `docs/audit/drift-ledger.md`** above the existing table: `> Rows close via a dated audit pass (see docs/audit/README.md) — strikethrough + **RESOLVED** + commit SHA, never deleted.`

- [ ] **Step 4: Verify.**
  ```bash
  test -f docs/audit/AUDIT-TEMPLATE.md && echo OK
  grep -q "AUDIT-<doc-slug>" docs/audit/README.md && echo OK
  grep -q "never deleted" docs/audit/drift-ledger.md && echo OK
  ```

- [ ] **Step 5: Commit.**
  ```bash
  git commit -m "docs(ws-j): dated re-runnable audit harness (generalizes design-system AUDIT pattern)"
  ```

---

### Task 3: `docs/architecture.md` (from `docs/technical.md`)

**Files:** `git mv docs/technical.md docs/architecture.md`, then rewrite.

**Outline:**
1. What the app is (one paragraph, no numbers) + link to root `README.md` for the full pitch.
2. High-level architecture — process topology as it actually runs (Railway: `apps/web` web + worker processes, Postgres, Redis; NOT the Platform V2 split — that's archived, Task 1).
3. RecipeSpec at a glance (one paragraph + link to `docs/generation.md` for the full contract — do not duplicate the type list, that's generation.md's job per the existing "Maintenance Rules" in `docs/README.md`: "Do not duplicate RecipeSpec... enums outside `ai-module-main-doc.md`").
4. Capability gating & plan tiers (link to `docs/data-models.md` for schema, this doc keeps the concept-level explanation).
5. Security model (auth flow post-WS-D: token exchange, per-shop CSP via `entry.server.tsx` — verify this file exists and describes what it actually does, not the pre-WS-D placeholder state).
6. Data model summary (one paragraph, link to `docs/data-models.md`).
7. Extension architecture (theme app extension, checkout/customer-account/admin/POS UI extensions, Shopify Functions) — link to `docs/generation.md` §"Canonical value sets" for the enums, keep only the "how these fit together" narrative here.
8. Where things live (project structure — verify against current `apps/`/`packages/`/`extensions/` layout, not the stale one).

**Source-of-truth checklist (re-verify at execution time):**
- `apps/web/app/entry.server.tsx` — does it exist, what headers does it set (WS-D Task 1).
- `apps/web/app/shopify.server.ts` — auth flow (token exchange flag state).
- `apps/web/prisma/schema.prisma` — datasource line (`postgresql` not `sqlite` — confirm WS-A landed).
- `apps/`, `packages/`, `extensions/` top-level `ls` — confirm the "Project structure" section matches reality (root README.md's stale "Project structure" section, Task 14, must match this).
- `railway.toml` / Railway service list (or `docs/runbooks/postgres-migration.md`) for the topology diagram.

**Verify (grep, run against the finished doc):**
```bash
grep -niE "apps/frontend|apps/api\b|apps/workers\b|cloudflare pages|vercel|fastify|bullmq" docs/architecture.md
# expected: empty (no V2 topology described as current)
grep -n "sqlite\|SQLite" docs/architecture.md
# expected: empty, or only inside an explicitly historical/"pre-Postgres" sentence
grep -nE '[0-9]+ (tests|templates|endpoints|routes|modules|tables|lines)' docs/architecture.md
# expected: empty (no-counts-in-prose rule)
```

---

### Task 4: `docs/generation.md` (from `docs/ai-module-main-doc.md`, absorbing `catalog.md`/`blueprints.md`/`bundle-runtime.md`/`module-system-v2.md`/`module-settings-modernization.md`/`superapp-surface-inventory.md`)

The largest single consolidation in this plan — `docs/ai-module-main-doc.md` is 3,617 lines / 248KB and is the RecipeSpec/allowed-values/generator source of truth `docs/README.md`'s own maintenance rules already point at; it becomes the `git mv` base and gets trimmed/restructured, with the smaller docs' unique content folded in before they're archived (Task 1 already archived them — this task pulls what's needed from `docs/archive/{catalog,blueprints,bundle-runtime,module-system-v2,module-settings-modernization,superapp-surface-inventory}.md` before finalizing, since `git mv` preserves content at the new path).

**Files:** `git mv docs/ai-module-main-doc.md docs/generation.md`, then restructure using content salvaged from the archived files above.

**Outline:**
1. Role of the AI module generator + hard rules (keep — this is accurate, load-bearing prose, not a numbers section).
2. Output contract: RecipeSpec (definition, module categories, type variants) — the canonical enum source, per existing maintenance rule.
3. Canonical value sets (theme extensions, checkout/post-purchase/customer-account/admin/POS UI extensions, Shopify Functions, web pixel, Flow) — keep as the single enum SoT; this is where `superapp-surface-inventory.md`'s practical boundaries fold in as a "current implementation status" column/callout per surface (not a duplicate enum list).
4. Module System v2 concepts (control packs, generic `theme.section`, unrestricted storefront sections — fold `module-system-v2.md`'s unique explanation in, since `docs/README.md`'s own "See Also" already points `docs/module-system-v2.md` at this territory).
5. Catalog & templates (fold `catalog.md` — describe the generated-catalog *mechanism* and link to the code path that enumerates templates live, e.g. `packages/core/src/templates/` + whatever script lists them, instead of a template count).
6. Blueprints / multi-module generation (fold `blueprints.md` — flag-gated per `BLUEPRINTS_ENABLED`, state its actual default honestly).
7. Bundles & cart-transform generation (fold `bundle-runtime.md`'s generation-facing half; the publish/activation half belongs in `docs/publishing.md`, Task 6 — do not duplicate, cross-link instead).
8. Module settings & installability gates (fold `module-settings-modernization.md`).
9. Capabilities and plan gating (keep, cross-link `docs/data-models.md` for the `AppSubscription`/`Shop` schema and `docs/architecture.md` for the concept-level summary — this doc owns the enum, not the concept explanation, to avoid the exact 3-way duplication the old `docs/README.md` rule was already trying to prevent).
10. Known gaps (honesty section): `ConfigEditor`/`StyleBuilder` do not exist; `composeBlueprint` does not exist — state plainly, do not describe as "planned" without an owner/ticket.

**Source-of-truth checklist:**
- `packages/core/src/allowed-values.ts`, `packages/core/src/storefront-style.ts` — enum ground truth (design-system's own audit already proved these match §2/§5 of `module-design-system.md`; generation.md's enums are a *different* surface — Shopify-facing types, not style tokens — verify against these files directly, not against the design-system doc).
- `packages/core/src/extension-eligibility.ts` (`ACTIVATION_WIRED_FUNCTION_TYPES` if WS-E has landed by execution time, or `FUNCTION_ACTIVATION_UNWIRED` if not) — cross-check the "Known gaps"/deployability language against whatever gate actually exists then.
- `apps/web/app/env.server.ts` — `BLUEPRINTS_ENABLED` default.
- `apps/web/app/services/blueprints/blueprint.service.ts` — does `composeBlueprint` exist (confirm the 2026-08 audit finding still holds).
- `grep -rn "ConfigEditor\|StyleBuilder" apps/web/app` — confirm still absent (or note if a later WS reintroduced them).
- `packages/core/src/templates/{modules,blocks,sections}/` — confirm the template-library layout description matches (path names only, no counts).

**Verify:**
```bash
grep -nE '[0-9]+ (templates|types|surfaces|categories)' docs/generation.md
# expected: empty
grep -n "composeBlueprint" docs/generation.md
# expected: either absent, or explicitly stated as NOT existing (grep the surrounding line for "does not exist" / "not implemented")
grep -n "ConfigEditor\|StyleBuilder" docs/generation.md
# expected: absent, or explicitly stated as removed/nonexistent
```

---

### Task 5: `docs/ai-providers.md` (audit + refresh, not full rewrite)

Already close to house style (`docs/README.md` describes it as "Merchant-generation providers, internal Qwen router, release gate, and safe target URL behavior" and it was last touched 2026-08-12) — this task is an audit pass via the Task 2 harness, not a ground-up rewrite.

**Outline (verify existing sections still match, don't reinvent):**
1. Primary/fallback provider chain (Claude primary, OpenAI automatic fallback on ANY error).
2. Token limits (`max_tokens` defaults, hydration `maxTokens` override).
3. Internal Qwen router / local triage model, cloud-vs-local toggle (per [[local-triage-llm]] memory — verify this doc reflects the 2026-07-15 build, since that memory says "uncommitted" as of its writing — confirm it landed by execution time).
4. Release gate / eval harness pointer (link `docs/testing.md`, Task 11, for the eval commands rather than re-listing them).

**Source-of-truth checklist:**
- `apps/web/app/services/ai/llm.server.ts` (`FallbackLlmClient`).
- `apps/web/app/services/ai/clients/anthropic-messages.client.server.ts`, `openai-responses.client.server.ts` — token defaults.
- `apps/web/app/services/ai/hydrate-prompt.server.ts` — hydration `maxTokens` hint.
- Whatever local-triage router file the [[local-triage-llm]] memory names — confirm it's committed (that memory flagged it "uncommitted" at write time) and describe it only if it's real.

**Verify:**
```bash
docs/audit/AUDIT-ai-providers-<date>.md exists (Task 2 harness run against this doc)
grep -nE '[0-9]+ (tokens|requests|calls)/' docs/ai-providers.md
# expected: empty unless quoting a literal named constant like "max_tokens: 8192" (a code constant, not a drifting count) — judgment call, note in the audit if any survive and why they're constants not counts
```

---

### Task 6: `docs/publishing.md` (audit against house style — WS-E owns content)

**Files:** `docs/publishing.md` (created by WS-E Task 16 if merged by execution time; created fresh here from the same source-of-truth checklist if not).

- [ ] **Step 1:** Check whether `docs/publishing.md` exists. If WS-E merged, run the Task 2 audit harness against it — check for: no-counts-in-prose compliance, honesty on partial-failure/rollback state, cross-links to `docs/generation.md` (compiler output) and `docs/operations.md`/`docs/runbooks/publish-failure.md` (incident response) instead of duplicating either.
- [ ] **Step 2:** If WS-E has NOT merged by execution time, write a minimal honest version covering exactly what WS-J can verify independently: what `PublishService` currently writes per surface, whether activation objects exist yet, whether unpublish/rollback are real — sourced from `apps/web/app/services/publish/*.server.ts` directly, explicitly marked as a placeholder pending WS-E with a dated note (not silently presented as final).
- [ ] **Step 3:** Either way, ensure the doc's outline covers: what publish writes per surface; function activation objects (if wired); unpublish/delete semantics; rollback semantics; partial-failure handling; embed-activation onboarding; the deployability gate (`ACTIVATION_WIRED_FUNCTION_TYPES` or equivalent) — this list mirrors WS-E Task 16's own outline, given here so the audit has something concrete to check against even if WS-J executes before reading WS-E's actual output.

**Source-of-truth checklist:**
- `apps/web/app/services/publish/publish.service.ts`, `activation.service.ts`, `unpublish.service.ts`, `rollback.service.ts` (existence + behavior — some may not exist if WS-E hasn't merged).
- `packages/core/src/extension-eligibility.ts` — current gate symbol name.

**Verify:**
```bash
grep -niE "progressive.?publish|canary" docs/publishing.md
# expected: empty, or explicitly described as REMOVED (WS-E Decision E4), never as a live feature
grep -nE '[0-9]+ (publishes|surfaces|activations)' docs/publishing.md
# expected: empty
```

---

### Task 7: `docs/flows.md` (from `docs/flow-automation.md`)

**Files:** `git mv docs/flow-automation.md docs/flows.md`, then rewrite with the honesty correction from the memory reality-check.

**Outline:**
1. What the automation engine does today (steps, triggers, visual builder) — keep what's accurate from the old doc's structure (`## Step kinds`, `## Triggers`, `## Visual flow builder` sections in the old `docs/technical.md` §8 were reasonable; `flow-automation.md` itself covers this ground already — verify against code, don't just re-house the prose).
2. Graph-based Workflow Engine — state its **actual** current wiring honestly: per [[full-audit-2026-08]]'s correction, `flow-runner` calling `WorkflowEngineService.startRun` and `api.cron.tsx` calling `resumeDueWorkflowRuns` are real as of 2026-08; but "FLOW_ENGINE_V2" / "durable-wait" / "reliability layer" language must not appear unless genuinely implemented by execution time — re-verify, don't copy either the old inflated claim or the old memory's blanket "never implemented" correction verbatim, since both are point-in-time.
3. Flow Catalog (`packages/core/src/flow-catalog.ts`).
4. Shopify Flow extensions (app-as-connector).
5. Known gaps / honesty section, explicitly dated.

**Source-of-truth checklist:**
- `grep -rn "FLOW_ENGINE_V2\|durable-wait\|reliability layer" apps/web packages/core` — confirm whether these are still doc-only strings or have real implementations by execution time.
- `apps/web/app/services/**/flow-runner*`, `WorkflowEngineService`, `resumeDueWorkflowRuns` — confirm call sites are real, not stubbed.
- `packages/core/src/flow-catalog.ts`.

**Verify:**
```bash
grep -n "FLOW_ENGINE_V2\|durable-wait" docs/flows.md
# expected: absent, OR present with an adjacent sentence citing the actual implementing file (never bare aspirational language)
grep -nE '[0-9]+ (triggers|step kinds|flows)' docs/flows.md
# expected: empty
```

---

### Task 8: `docs/operations.md` (from `docs/release-operations.md`)

**Files:** `git mv docs/release-operations.md docs/operations.md`, then rewrite — this is the task that finally retires the Platform V2 content that's been sitting in the "live" release doc.

**Outline:**
1. Current topology (Railway: `apps/web` web + worker, Postgres, Redis, cron) — link `docs/runbooks/postgres-migration.md` for the migration history rather than re-describing it.
2. Deploy flow (CI on master, build gates — link WS-B's landed state, verify `.github/workflows/*` matches what's described).
3. Observability (Sentry, healthchecks.io, UptimeRobot — per [[launch-wave-two-2026-08]] these are live; verify DSNs/monitors are still configured by execution time, don't just copy the memory note).
4. SLOs — one paragraph + link `docs/slos.md` (keep that file separate, it's already well-scoped).
5. **"Which runbook do I reach for" index** — a table linking every `docs/runbooks/*.md` file to its trigger scenario (this is the "reference runbooks, don't duplicate them" requirement made concrete: a table of pointers, zero step-by-step procedure copied in).
6. Rollback / incident escalation — one paragraph pointing at the runbooks, not a duplicate procedure.
7. Environment variables — link `.env.example` files directly rather than hand-copying a matrix that will drift (this is exactly what killed `docs/deployment/env-matrix.md`, archived in Task 1 — don't recreate the same failure mode here).

**Source-of-truth checklist:**
- `railway.toml` / Railway project service list.
- `.github/workflows/*.yml` — deploy + CI gates.
- `docs/runbooks/*.md` — current file list (`app-pricing-setup.md`, `connector-failure.md`, `index.md`, `postgres-migration.md`, `provider-outage.md`, `publish-failure.md`, `scope-reconsent.md`, `webhook-storm.md` as of this plan's writing — re-`ls` at execution time, WS-A/D/E may have added more).
- `apps/web/.env.example`, `apps/web/app/env.server.ts` (validated flags).

**Verify:**
```bash
grep -niE "apps/frontend|apps/api\b|apps/workers\b|cloudflare (pages|workers|queues)|vercel|fastify|PLATFORM_BACKEND" docs/operations.md
# expected: empty (V2 topology gone)
grep -c "^### \[" docs/operations.md  # (or however the runbook table is formatted)
# each docs/runbooks/*.md filename should appear exactly once as a link target:
for f in docs/runbooks/*.md; do b=$(basename "$f"); grep -q "$b" docs/operations.md || echo "MISSING LINK: $b"; done
# expected: no MISSING LINK lines
# check for duplicated runbook procedure (a cheap proxy: operations.md should be short relative to any single runbook, not runbook-sized)
wc -l docs/operations.md docs/runbooks/*.md
```

---

### Task 9: `docs/internal-admin.md` (audit + refresh)

Relatively fresh (touched 2026-08-12, and the [[internal-admin-overhaul-2026-07]] memory describes a full audit+overhaul that merged 2026-07-14) — audit pass, not ground-up rewrite.

**Outline (verify against current code, keep existing structure if accurate):**
1. Operator dashboard surfaces (Logs 4-in-1 nav, Activity SSE tail, jobs/replay via `/internal/ops`).
2. AI provider config (`ai-providers` route as the only `AiProvider` writer).
3. Internal AI assistant (app-aware: `searchAppDocs`, `getAppOverview`).
4. Support CRM / ticket system (per [[local-triage-llm]] memory — verify committed by execution time).
5. Theme (light-only, per the 2026-07-14 revert — verify still true).
6. SSO / auth (allowlist — verify WS-QF's fix is reflected, not the pre-fix "any IdP identity" gap).

**Source-of-truth checklist:**
- `apps/web/app/routes/internal.*` — route inventory.
- `apps/web/app/services/support/*` (or wherever local-triage landed).
- `apps/web/app/routes/internal.ai-providers.tsx` (or current path).
- SSO allowlist implementation file (WS-QF landed this — find via `git log --grep="SSO allowlist"`).

**Verify:**
```bash
grep -niE "any idp|no allowlist" docs/internal-admin.md
# expected: empty (must not describe the pre-WS-QF security gap as current behavior)
grep -nE '[0-9]+ routes' docs/internal-admin.md
# expected: empty
```

---

### Task 10: `docs/data-models.md` (audit + refresh)

**Outline (verify against `prisma/schema.prisma`, keep existing structure if accurate):**
1. Datasource (Postgres — confirm WS-A cutover, this is the doc that must NOT still say SQLite; closes the corresponding `drift-ledger.md` row).
2. Core models (Shop, Module/Version, AppSubscription, FunctionActivation if WS-E landed it, Job, ApiLog, AiUsage — verify field-level claims against the actual schema, not memory).
3. Service layer conventions.
4. UI/Agent API behavior (cross-link generation.md's Agent API section rather than duplicating the endpoint list).

**Source-of-truth checklist:**
- `apps/web/prisma/schema.prisma` — full model list, datasource provider line.
- `docs/audit/drift-ledger.md` row 9 ("Persistence layer is production-grade... Prisma datasource is still SQLite") — close this row as part of this task (Task 2's harness convention).

**Verify:**
```bash
grep -n "sqlite\|SQLite" docs/data-models.md
# expected: empty, or explicitly historical ("was SQLite until the WS-A Postgres cutover")
grep -n "provider" apps/web/prisma/schema.prisma | head -1
# cross-check this matches what docs/data-models.md claims
grep -nE '[0-9]+ (models|tables|fields)' docs/data-models.md
# expected: empty
```

---

### Task 11: `docs/testing.md` (new)

Does not exist today — the launch program's 12-doc list includes "testing" as its own item, and no current doc owns test strategy/commands as a single source (it's scattered across root `README.md`'s "Testing" section, `docs/qa/*` (archived Task 1), and CI workflow files).

**Outline:**
1. Test categories (unit/Vitest, eval harness, Playwright/E2E if present, theme-check) — describe the categories, link to the commands rather than counting tests in each.
2. Running tests locally — copy-verified commands from `package.json`/`apps/web/package.json` scripts (not retyped from memory).
3. CI gates (WS-B: CI triggers on `master`, build-gate list, `build-theme-liquid.mjs --check` Liquid budget gate, eval nightly workflow) — link the actual workflow file(s), don't re-describe every step.
4. Eval harness (deterministic vs. live-provider evals, release gate threshold) — link `docs/ai-providers.md` §4 for the provider side, own the "how to run/interpret" side here.
5. How to add a test for a new module type / surface (practical howto, since this is the doc a contributor would search for that).

**Source-of-truth checklist:**
- `package.json`, `apps/web/package.json` — actual script names (`test`, `test:eval`, etc. — verify names exactly, this doc is useless if the commands are wrong).
- `.github/workflows/*.yml` — CI gate list (WS-B's landed state).
- `scripts/build-theme-liquid.mjs` (or wherever the Liquid-budget check lives) — the 100KB aggregate gate mentioned in MEMORY.

**Verify:**
```bash
# Every command shown in docs/testing.md as a fenced code block must actually exist as a script:
grep -oE '`pnpm [a-zA-Z:_-]+`' docs/testing.md | tr -d '`' | while read -r cmd; do
  script=$(echo "$cmd" | sed 's/pnpm //')
  grep -q "\"$script\"" package.json apps/web/package.json 2>/dev/null || echo "MISSING SCRIPT: $script"
done
# expected: no MISSING SCRIPT lines
grep -nE '[0-9]+ (tests|suites|percent|%)' docs/testing.md
# expected: empty
```

---

### Task 12: `docs/debug.md` (audit + prune, not rewrite)

Per Decision J5 — this stays an append-only bug ledger. The task marks superseded entries, it doesn't delete history.

- [ ] **Step 1:** Read the existing entry list (`grep -n "^## " docs/debug.md`) and identify entries whose root cause no longer applies because the underlying system was retired/replaced: Cloudflare-tunnel-timeout entries (WS-A retired the tunnel — Railway has a stable `application_url`), SQLite-specific entries (WS-A Postgres cutover), any Platform V2-specific entries.
- [ ] **Step 2:** For each, prepend `**SUPERSEDED (<WS-letter>, <one-line reason>):**` to the entry heading or its first line — do not delete the entry, do not delete the root-cause explanation (future debugging on a *new* tunnel-like constraint might want the pattern).
- [ ] **Step 3:** Confirm no numeric claims crept into the ledger's entries (bug counts, "N occurrences") — this file is a narrative ledger, numbers here are usually fine if they're a specific bug's reproduction data (e.g. "timeout at 92s"), not aggregate counts — use judgment per Global Constraints' "closest mechanical proxy" note, but flag anything that looks like an aggregate.
- [ ] **Step 4:** Add a one-line pointer at the top of the file to `docs/audit/README.md`'s harness convention, framing `debug.md` as the ledger that OTHER docs' audits should check for a superseded root cause before re-describing old constraints as current (this is the cross-link that prevents e.g. `docs/architecture.md` (Task 3) from re-describing the retired 90s-tunnel limit as a live constraint).

**Verify:**
```bash
grep -c "SUPERSEDED" docs/debug.md
# expected: > 0 if any tunnel/SQLite/V2 entries existed (confirm via the Step 1 grep first)
grep -n "^## " docs/debug.md | wc -l   # sanity: entry count unchanged from before this task (pruning ≠ deleting)
```

---

### Task 13: `CHANGELOG.md` (new, repo root)

**Outline (Keep a Changelog-lite):**
```markdown
# Changelog

## [Unreleased]

## [<date>] — <WS-letter/name summary>
### Added / Changed / Fixed / Removed
- ...
```

- [ ] **Step 1:** Seed the initial release history from `git log`, not hand-recall — pull merge commits for WS-lettered work:
  ```bash
  git log --oneline --grep="^feat(ws-\|^fix(ws-\|^polish(ws-\|WS-[A-Z]" --all | head -50
  ```
  Group by workstream (WS-B, WS-QF, WS-A, WS-D, WS-E, ... in landing order per [[launch-wave-two-2026-08]] and [[full-audit-2026-08]]), one dated entry per merged workstream, each bullet citing the actual commit message content, not a re-summary from memory of what the memory file says the commit did.
- [ ] **Step 2:** Add the convention note at the bottom: "This file is updated by each WS as it lands (see `docs/superpowers/plans/2026-08-24-launch-program.md` dependency notes), not retroactively regenerated — WS-J only seeds the backlog as of its own execution date."
- [ ] **Step 3:** Cross-link from root `README.md` (Task 14) and `docs/README.md`.

**Verify:**
```bash
head -1 CHANGELOG.md | grep -q "^# Changelog" && echo OK
grep -nE '\b[0-9]{2,}\b (tests|templates|endpoints)' CHANGELOG.md
# expected: empty — even a changelog shouldn't assert aggregate counts, only "what changed"
# spot-check that every WS mentioned has a real commit backing it:
for ws in B QF A D E; do git log --oneline --all --grep="ws-$ws\b" -i | head -1 || echo "NO COMMIT FOUND: WS-$ws"; done
```

---

### Task 14: Root `README.md` + `docs/README.md` index

**Files:** `README.md` (repo root, rewrite), `docs/README.md` (refresh table only).

**Root README outline** (verify each section against current reality — this doc is the most-read and most stale one in the repo, last touched `6472f6d` / 2026-06-13, well before Railway/Postgres/App Pricing):
1. Overview (problem space, who it's for, "recipes not raw code," what "superapp" means) — mostly evergreen prose, spot-check for accuracy, keep.
2. Architecture — trim to a short summary + link `docs/architecture.md` (Task 3) as the source of truth; delete the inline "Platform V2 Phase 12/13" subsections entirely (retired).
3. Project structure — regenerate from an actual `ls`/`tree` of `apps/`, `packages/`, `extensions/` at execution time, not copied from the stale version.
4. Tech stack — verify against `package.json` dependencies, not memory.
5. Prerequisites / Getting started — verify every command against current `package.json` scripts; the "local SQLite" step must become the Postgres-via-Railway (or local Postgres) step per WS-A.
6. Environment variables — trim to "see `apps/web/.env.example`" + a short annotated list of the handful that need explanation, not a full copied matrix (avoid recreating the `env-matrix.md` drift failure mode, per Task 8's note).
7. Development — root/`apps/web` scripts, verified against `package.json`; drop the "Platform V2 workers, API, and contracts" subsection (retired, archived Task 1).
8. Testing — trim to a short pointer + link `docs/testing.md` (Task 11) as the source of truth, do not duplicate.
9. Key concepts — trim to short summaries + links to `docs/generation.md`/`docs/architecture.md`, remove any duplicated enum/type list.
10. Link to `CHANGELOG.md` (Task 13) near the top for "what's new."

**`docs/README.md` outline:** refresh the "Canonical Docs" and "Planning And Status" tables to list exactly the Phase-3 file set (architecture, generation, ai-providers, publishing, flows, operations, internal-admin, data-models, testing, debug ledger) plus `runbooks/`, `audit/`, `archive/`; remove the `_glossary.md` row (Task 1 deleted it) and the rows for every doc archived in Task 1; add `CHANGELOG.md` as a root-level pointer.

**Source-of-truth checklist:**
- `package.json`, `apps/web/package.json`, `packages/*/package.json` — every command/dependency claim.
- `apps/`, `packages/`, `extensions/` directory listing.
- `apps/web/.env.example`.
- The final state of `docs/` after Tasks 1–13 (this task must literally `ls docs/` and reconcile the index table against it, not against this plan's File Structure block, which is a plan-time snapshot).

**Verify:**
```bash
grep -niE "platform v2|apps/frontend|apps/api\b|apps/workers\b|sqlite" README.md
# expected: empty
grep -oE '`pnpm [a-zA-Z:_-]+`' README.md | tr -d '`' | while read -r cmd; do
  script=$(echo "$cmd" | sed 's/pnpm //')
  grep -q "\"$script\"" package.json apps/web/package.json 2>/dev/null || echo "MISSING SCRIPT: $script"
done
# expected: no MISSING SCRIPT lines
grep -nE '[0-9]+ (tests|templates|endpoints|routes)' README.md
# expected: empty
# every file docs/README.md's tables link to must exist:
grep -oE '\(\./[a-zA-Z0-9_./-]+\.md\)' docs/README.md | tr -d '()' | sed 's/^\.\///' | while read -r p; do
  test -f "docs/$p" || echo "BROKEN LINK: docs/$p"
done
# expected: no BROKEN LINK lines
```

---

### Task 15: MEMORY.md sync (last task)

**Files:** `/Users/lavipun/.claude/projects/-Users-lavipun-Work-ai-shopify-superapp/memory/MEMORY.md` (outside the repo — a Claude Code project-memory file, not tracked in git).

Runs only after Tasks 1–14 are actually merged (not just planned) — this task reads the *finished* doc set, not this plan's predictions of it.

- [ ] **Step 1:** Update the "Key Files" section's doc-adjacent bullets to point at the new canonical paths where they changed (e.g. any bullet currently citing `docs/ai-module-main-doc.md` now cites `docs/generation.md`; `docs/technical.md` → `docs/architecture.md`; `docs/flow-automation.md` → `docs/flows.md`; `docs/release-operations.md` → `docs/operations.md`).
- [ ] **Step 2:** For each "See Also" bullet whose content is now redundant with a rewritten doc (per Decision J9) — architecture, generation, flows, operations, publishing topics especially — trim the inline summary down to a one-line pointer ("see `docs/<file>.md`") instead of re-explaining, UNLESS the memory bullet carries information the doc intentionally omits (e.g. a "STILL:"/"NOTE:" caveat about something not yet verified live — keep those, they're exactly the honesty-discipline content the docs also need, so cross-check the doc actually states the same caveat before trimming the memory).
- [ ] **Step 3:** Add one new "See Also" bullet: `[Docs rewrite (WS-J)](docs-rewrite-ws-j.md)` — a short memory note (create this file alongside the others) recording: the 12-doc structure landed, the kill/archive list, the audit-harness location, and "future doc drift gets caught by re-running `docs/audit/README.md`'s methodology, not by another full rewrite."
- [ ] **Step 4:** Do NOT touch the "## Architecture," "## Token limits," "## Cloudflare tunnel timeout rules" sections' factual content in this task — those are code-behavior facts outside WS-J's scope; only touch doc-file-path references and redundant-with-new-docs prose. (The Cloudflare-tunnel-timeout section itself is now stale per Task 3/Task 12's findings — flag it for whoever next touches MEMORY.md's Architecture section, but don't silently edit unrelated-scope content as a side effect of a docs task.)

**Verify (manual — no grep proxy for "is this a good summary," but mechanical checks still apply):**
```bash
grep -n "ai-module-main-doc.md\|technical\.md\|flow-automation\.md\|release-operations\.md" "/Users/lavipun/.claude/projects/-Users-lavipun-Work-ai-shopify-superapp/memory/MEMORY.md"
# expected: empty (all renamed-path references updated)
grep -n "docs-rewrite-ws-j" "/Users/lavipun/.claude/projects/-Users-lavipun-Work-ai-shopify-superapp/memory/MEMORY.md"
# expected: one hit (the new See Also bullet)
```

---

## Execution order & shippability

Task 1 (kill/archive) must run first — every later task's `git mv` source and every later "no dangling link" check depends on it. Task 2 (audit harness) should run second, before Task 3, because every doc task from 3 onward is asked to "run the Task 2 harness against this doc," which is meaningless if Task 2 hasn't shipped. From Task 3 onward, doc tasks are **independent of each other** (each is its own `git mv` + rewrite of a disjoint file) and can land in any order, or in parallel across subagents, EXCEPT: Task 4 (generation.md) should land before Task 3 finishes cross-linking to it, and vice versa is also fine (a doc can be written with a forward-reference link to a not-yet-written doc — it just can't be *verified* dangling-link-free until both exist, so the final dangling-link sweep in Task 14 is the true gate, not any individual task's own verify step). Task 6 (publishing.md) has a soft dependency on WS-E's actual merge state, re-checked at execution time, not on any other WS-J task. Tasks 11 and 13 (testing.md, CHANGELOG.md) are pure creates with no doc dependency — safe to run anytime after Task 1. Task 14 (README/index) should run after all of Tasks 3–13, since it's the reconciliation pass that catches anything the individual tasks missed (broken links, leftover archived-doc references). Task 15 (MEMORY sync) is strictly last — it reads the finished state, not a plan.

Each task ships independently green (a docs-only PR per task is reasonable — no shared code state to break), except Task 14 functionally acts as an integration checkpoint even though it's not gating in the CI sense.

## Out of scope

- Any *code* change. WS-J is docs-only; if a doc task's investigation surfaces an actual bug or gap (e.g. a runbook that's wrong, a script name that doesn't exist), it's noted in the doc/audit and reported upward — not fixed inline by this workstream.
- Per-WS incremental doc updates as each workstream lands — those are each WS plan's own responsibility (dependency-edge note: "each WS updates its own doc as it lands"). WS-J is the consolidation/rewrite, not a substitute for that discipline.
- Building an automated drift-detection script/CI check. The harness (Task 2) is a manual, dated, re-runnable methodology, matching the one precedent that exists in this repo (`docs/design-system/AUDIT-2026-07-10.md`) — automating it is a reasonable future idea but not specified anywhere in the charter and would itself be a code change.
- `docs/gitbook/` (minus the archived `v2-migration/` subtree) and `docs/gitbook-integration/` — explicitly out of the canonical index per `docs/README.md`'s existing statement ("GitBook publishing content... is intentionally not part of this index") and out of the launch-program charter's 12-doc list.
- `DESIGN.md` — owned by the design system, referenced not rewritten (per CLAUDE.md: "Always read DESIGN.md before making any visual or UI decisions... Do not deviate without explicit user approval").
- App Store submission checklist content — WS-S's job.
- Deciding whether `docs/implementation-status.md`'s full history is worth a one-time historical-archive read before Task 13 mines it — Task 13's Step 1 explicitly uses `git log`, not that file, as its primary source; the file is still archived (not deleted) in Task 1 so it remains available if a future pass wants deeper mining.

## Self-Review (performed while writing)

1. **Charter coverage:** the ~12-doc structure (README ✓ Task 14, architecture ✓ T3, generation ✓ T4, ai-providers ✓ T5, publishing ✓ T6, flows ✓ T7, operations ✓ T8, internal-admin ✓ T9, data-models ✓ T10, testing ✓ T11, debug ledger ✓ T12, CHANGELOG ✓ T13) — all 12 present, one task each. Kill/archive list ✓ Task 1 (18 named targets + 2 directories, decision table J1–J9). No-counts-in-prose ✓ stated as a Global Constraint and given a concrete grep in every single task's Verify step, not just asserted once. Dated re-runnable doc audits ✓ Task 2, explicitly modeled on and citing `docs/design-system/AUDIT-2026-07-10.md` by name and structure. MEMORY sync ✓ Task 15, last.
2. **"No frozen content" discipline:** every doc task gives outline + source-of-truth checklist + verification grep, not prose paragraphs to copy-paste — checked against the charter's explicit instruction ("Where you DO embed content in tasks, keep it structural... not prose that will drift"). The one place this plan does state facts as fact (the "Verified ground truth" section) is explicitly dated/sha'd and each fact is paired with a "re-verify at execution time" instruction inline in the doc tasks that depend on it.
3. **Investigation grounding:** every kill/archive target was confirmed to exist and was checked for its actual current content (not assumed) — the Platform V2 retirement finding in particular was cross-verified against three independent sources (`docs/release-operations.md`'s own text, `docs/integrations/platform-hosting.md`'s own text, and the [[full-audit-2026-08]] memory's D2 decision) before being treated as settled, since it's the single largest kill/archive claim in this plan.
4. **Honesty-rule teeth:** rather than a single generic "be honest" constraint, each doc task's Verify step targets the *specific* known-stale claim for that doc's subject matter (billing for architecture/generation, progressive-publish for publishing, FLOW_ENGINE_V2 for flows, SQLite for data-models/architecture, ConfigEditor/StyleBuilder/composeBlueprint for generation) — sourced from `docs/audit/drift-ledger.md` and the memory reality-check notes, not invented generically.
5. **Placeholder scan:** no task ends in "use judgment" as its only check — every task has at least one concrete `grep`/`git`/shell verification; the two places judgment is explicitly invoked (Task 12 Step 3's numeric-claim nuance in a narrative ledger, Task 15 Step 2's caveat-preservation call) are flagged as judgment calls in the text itself rather than hidden inside an unqualified instruction.
6. **File-path accuracy:** every repo file path cited in the "Verified ground truth" and per-task checklists was read or `ls`'d directly during this plan's investigation (not recalled from the MEMORY.md context alone) — the one exception is forward-looking paths that don't exist yet at plan-writing time (`docs/publishing.md`, `docs/testing.md`, root `CHANGELOG.md`), which are explicitly marked as not-yet-existing rather than cited as if already verified.
