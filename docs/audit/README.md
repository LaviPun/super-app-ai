# audit

This directory holds the project's dated, re-runnable doc-vs-reality audits, plus the ledgers they read from and write to.

## What lives here

- **`AUDIT-TEMPLATE.md`** — the reusable shape for a dated audit pass. Copy it, don't edit it in place.
- **`AUDIT-<doc-slug>-<YYYY-MM-DD>.md`** — one file per pass (see Naming below). `docs/design-system/AUDIT-2026-07-10.md` predates this convention and lives next to the doc it audits rather than in this directory; it is the exemplar this template generalizes, not an exception to move.
- **`drift-ledger.md`** — the standing table of claim-vs-reality gaps found by any audit pass. Rows are closed, never deleted (see Closing a row, below).
- **`doc-drift-diff.md`**, **`test-baseline.json`**, **`security-leak-ledger.{md,json}`** — supporting audit artifacts, updated by whatever process produces them (test runs, security scans); not part of the dated-audit convention itself.

## When to run one

The natural trigger is **after any WS plan lands that touches a doc's subject matter** — WS-J's own dependency rule ("each WS updates its own doc as it lands") means most drift gets caught right then, by whoever lands the change. Beyond that there is **no fixed cadence** — this is a manual methodology, not a cron job or CI gate. That matches the actual history of the pattern it generalizes: `docs/design-system/AUDIT-2026-07-10.md` is one dated pass, not a periodic series.

## Naming

`docs/audit/AUDIT-<doc-slug>-<YYYY-MM-DD>.md`, one file per pass. **Do not overwrite a prior dated audit** — each pass is a new file, so the directory accumulates a history, the same way `docs/design-system/AUDIT-2026-07-10.md` was kept as-is rather than edited in place after its own "closed same day" follow-ups.

`<doc-slug>` is the canonical doc's filename stem (e.g. `architecture`, `generation`, `ai-providers`, `flows`, `operations`, `internal-admin`, `data-models`, `testing`, `publishing`).

## Process

1. **Re-read the doc's own source-of-truth checklist.** Each of the 12 canonical docs' rewrite tasks (Tasks 3–12 in `docs/superpowers/plans/2026-08-24-ws-j-docs-rewrite.md`) defines one — a list of files/services to check against, not content frozen into the plan. Copy the relevant checklist into the new audit's scope line.
2. **Grep/read the cited files.** Verify each claim against the live repo at the current commit, not against memory or a prior audit.
3. **File every gap** under `## ✅ Verified correct`, `## 🔧 Fixed in this pass`, or `## Follow-ups (open)` in the new dated file, per `AUDIT-TEMPLATE.md`.
4. **Any "doc claims X, code does Y" mismatch also gets a `drift-ledger.md` row** — either a new row, or it closes an existing one (see below). Record which rows the pass closed in the audit file's own "Drift-ledger rows closed by this pass" table.

## Closing a `drift-ledger.md` row

Replace the row's `Decision`/claim cells the same way the existing resolved billing row does: strikethrough the original claim, mark it **RESOLVED**, add a one-line explanation, and cite the commit SHA that made it true. **Never delete a row** — the ledger is itself a dated history of what used to be wrong and when it got fixed, not just a live worklist.
