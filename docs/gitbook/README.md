# AI Shopify SuperApp — documentation

Welcome. This tree is optimized for **GitBook** (left nav from `SUMMARY.md`) and for **repo** readers (canonical deep docs live in `docs/*.md` and are linked from here—no second copy of long specifications).

---

## Start here

| I need to… | Open |
|------------|------|
| Understand the product in one pass | [Documentation map](00-welcome/documentation-map.md) |
| See exactly what is completed right now | [Progress till now](10-progress/progress-till-now.md) |
| Ship or operate the app | [Implementation status](../implementation-status.md) · [Phase plan](../phase-plan.md) |
| Integrate or extend (RecipeSpec, compiler, API) | [AI module spec](../ai-module-main-doc.md) · [Technical reference](../technical.md) |
| Support a merchant | [Merchant guide](../app.md) |
| Run internal admin / providers / plans | [Internal admin](../internal-admin.md) |
| On-call / incidents | [Runbooks](../runbooks/index.md) · [SLOs](../slos.md) |

> **Design system:** [`DESIGN.md`](../../DESIGN.md) (repo root) and [`uiux-guideline.md`](../uiux-guideline.md).

---

## How this book is organized

1. **Welcome** — map, reading order, and progress snapshot.
2. **Product & guides** — merchant and app-owner experiences (source files in `docs/`).
3. **Architecture** — high-level system and data; links to full technical doc.
4. **Backend & platform** — processes, services, modules, flows.
5. **Dashboards** — merchant UI vs internal admin behavior.
6. **API & agents** — route surfaces and patterns.
7. **Reference library** — specifications, catalog, data models, providers, deep platform list.
8. **Operations** — security, observability, runbooks, debug, dev setup, UI guidelines.
9. **Planning** — status and roadmap (canonical files, linked).

Short **synthesis** pages live under `gitbook/*/…`. **Authoritative detail** remains in the linked files so we never fork two versions of the same truth.

---

## GitBook sync (repo)

If you use **GitBook Git Sync**, point the space at this folder (`docs/gitbook`) *or* at `docs/` and set the summary file to `gitbook/SUMMARY.md` per GitBook’s import settings. Parent paths like `../technical.md` resolve to other files in the same repository.

---

## Design note

GitBook’s default theme is clean and typography-driven. This book uses **clear part titles, short pages, and tables** so the outline reads like a product manual, not a wall of audits.
