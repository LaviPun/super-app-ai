# design-system

The living source of truth for the storefront module design system is [`module-design-system.md`](./module-design-system.md) — the `--sa-*` token map, the Minimal Luxe / Bold DTC pack pair, and the runtime `data-sa-pack` contract. `composition-rules.md` and `research-dossier.md` are supporting references it draws from.

This directory is audited, not rewritten wholesale, using the dated re-runnable pattern proven in [`AUDIT-2026-07-10.md`](./AUDIT-2026-07-10.md) — that file is the exemplar Task 2 of the WS-J docs rewrite (`docs/audit/AUDIT-TEMPLATE.md`) generalizes into a reusable template for every canonical doc. Do not edit `AUDIT-2026-07-10.md` in place; a new pass gets its own dated file (`docs/audit/AUDIT-<doc-slug>-<YYYY-MM-DD>.md`).

Note: `docs/uiux-guideline.md` has been archived (`docs/archive/uiux-guideline.md`) — `DESIGN.md` at the repo root remains the source of truth for app-frontend UI/UX (admin/merchant shells); this directory covers AI-generated storefront modules only. See [[design-scope-app-vs-generated]] for the distinction.
