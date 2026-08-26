# Docs Kill/Archive Pass Audit — 2026-08-27

Scope: the WS-J Task 1 kill/archive commit (`53739e9`, "docs(ws-j): kill/archive pass") verified against the live repo (`ai-shopify-superapp`) at `master@53739e9` (branch `docs/ws-j-rewrite`). This is the first real run of the `docs/audit/AUDIT-TEMPLATE.md` harness built in WS-J Task 2, exercised against WS-J Task 1's own deliverables rather than against one of the not-yet-rewritten 12 canonical docs (those audits belong to Tasks 3–12).

Source-of-truth checklist used: Task 1's own Step 4 (file/dir move list) and Step 5 (dangling-link greps), from `docs/superpowers/plans/2026-08-24-ws-j-docs-rewrite.md`.

## ✅ Verified correct (no action needed)

1. **All 15 Step-4 files + 3 directories moved to `docs/archive/`, history preserved.** `ls docs/archive/*.md | wc -l` → 14 archived flat files (the 15th, the gitbook ADR-001 redirect stub, landed as `docs/archive/gitbook-v2-migration/ADR-001-platform-v2-architecture-redirect-stub.md` since it's nested, not flat). `docs/archive/deployment/`, `docs/archive/integrations/`, `docs/archive/qa/`, `docs/archive/gitbook-v2-migration/` all exist. `git log --oneline --follow -- docs/archive/catalog.md` returns the file's full pre-move history (3 commits back to "Initial commit"), confirming `git mv` (not archive-then-recreate) was used throughout, per Decision J1.
2. **`docs/_glossary.md` is gone and has zero remaining references.** `git grep -n "_glossary" -- '*.md'` returns no hits repo-wide (not just in `docs/*.md`) — every inbound reference (`README.md` ×3, `SUMMARY.md`, `docs/README.md` ×2, `docs/implementation-status.md`, `docs/phase-plan.md` pre-archive) was fixed, not left dangling.
3. **The three stub READMEs are no longer one-line placeholders.** `docs/design-system/README.md` (7 lines), `docs/runbooks/README.md` (5 lines), `docs/audit/README.md` (31 lines, written in this same Task 2) all replace the literal `# <dirname>` stub with real pointer content.
4. **The Task 1 Step-5 dangling-link grep is clean outside `docs/archive/`.** Running the brief's exact command (`git grep -n "](\./deployment/\|](\./integrations/\|](\./qa/\|](\./catalog\.md\|...` -- `'docs/*.md'`) returns exactly 4 hits, and all 4 are internal cross-references **between files that moved into `docs/archive/` together** (`docs/archive/catalog.md` → `./module-system-v2.md`, `docs/archive/module-settings-modernization.md` → `./module-system-v2.md`, `docs/archive/superapp-surface-inventory.md` → `./module-system-v2.md`, `docs/archive/phase-plan.md` → `./integrations/platform-hosting.md`) — each target file was confirmed to exist at the resolved path (`ls docs/archive/module-system-v2.md docs/archive/integrations/platform-hosting.md` both succeed). None of the 4 are genuinely dangling.

## 🔧 Fixed in this pass

1. **None required.** All findings above were already true at commit `53739e9` — this audit is verification-only and found no additional drift beyond what Task 1's own commit already resolved.

## Follow-ups (open)

1. **The Task 1 brief's own Step 5 grep is a substring check, not a link resolver — it cannot distinguish a genuinely dangling link from an archive-internal cross-reference that still resolves.** The 4 hits noted above will keep showing up on every future run of that exact grep even though nothing is broken. Anyone re-running Task 1's verification commands should expect those 4 lines and not treat them as a regression; a real fix would require either excluding `docs/archive/` from the pathspec or switching to an actual link-resolution check, both out of scope for a docs-only pass.
2. **`docs/gitbook/02-architecture/platform-v2-migration-plan.md` was not archived**, despite the plan's "Verified ground truth" section grouping it with the V2-retired content (`docs/superpowers/plans/2026-08-24-ws-j-docs-rewrite.md` line 40 lists it alongside ADR-001/ADR-002/env-matrix/platform-hosting as retired-architecture docs). The literal Task 1 Step 4 command block never includes it, so it was left in place at its original path. Not a drift-ledger row (it's a plan-vs-plan gap, not a doc-vs-code gap) — flagging here so whichever later task touches `docs/gitbook/02-architecture/` decides deliberately rather than by omission.
3. **`docs/implementation-status.md` and `docs/release-operations.md` still contain plain-text (non-hyperlinked) mentions of `phase-plan.md`** in prose (e.g. "tracked in `phase-plan.md`") that were intentionally left as-is in Task 1 — they are not broken links (no `](...)` syntax), and both files are direct rewrite/archive targets of later tasks (Task 13's CHANGELOG mining for `implementation-status.md`; Task 8's rename for `release-operations.md`) that will handle them with full content context.

## Drift-ledger rows closed by this pass

| Row (from drift-ledger.md) | Resolution | Commit |
|---|---|---|
| — | No drift-ledger rows targeted this pass (scope was Task 1's own archive-move correctness, not a canonical-doc content audit). | — |
