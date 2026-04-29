# Documentation map

Single source of truth by topic. Prefer these files; avoid duplicating content in new markdown.

## Product & status

| Document | Role |
|----------|------|
| [`implementation-status.md`](../../implementation-status.md) | What shipped, stabilization, audits-as-narrative, recent changes |
| [`phase-plan.md`](../../phase-plan.md) | Roadmap, backlog, phased delivery |
| [`README.md`](../../../README.md) (repo root) | Product overview, monorepo layout, agent API summary |

## Experiences

| Audience | Document |
|----------|----------|
| Merchants | [`app.md`](../../app.md) |
| App owner / internal team | [`internal-admin.md`](../../internal-admin.md) |

## Engineering depth

| Topic | Document |
|-------|----------|
| Architecture, extensions, §15 slots, security | [`technical.md`](../../technical.md) |
| RecipeSpec, capabilities, allowed values | [`ai-module-main-doc.md`](../../ai-module-main-doc.md) |
| Template catalog & AI retry mapping | [`catalog.md`](../../catalog.md) |
| Data stores (schema, APIs, UI) | [`data-models.md`](../../data-models.md) |
| LLM providers & routing | [`ai-providers.md`](../../ai-providers.md) |
| Shopify CLI / dev environments | [`shopify-dev-setup.md`](../../shopify-dev-setup.md) |
| Embedded app quirks, limits | [`debug.md`](../../debug.md) |

## Operations

| Topic | Document |
|-------|----------|
| SLOs & measurement | [`slos.md`](../../slos.md) |
| Incidents | [`runbooks/index.md`](../../runbooks/index.md) (hub) |
| UI conventions | [`uiux-guideline.md`](../../uiux-guideline.md) + root [`DESIGN.md`](../../DESIGN.md) |

## Extra reference

| Document | Role |
|----------|------|
| [`superai-doc.md`](../../superai-doc.md) | Long-form Shopify/platform constraint inventory (optional deep read) |
| [`plan-changes-codechange-verification.md`](../../plan-changes-codechange-verification.md) | Example propagation checklist for doc/code changes |
| [`archive/`](../../archive/) | Archived artifacts and notes |

## GitBook-only synthesis

Pages under `docs/gitbook/**` (except this map and `README`) summarize or structure navigation; they defer detail to the table above.
