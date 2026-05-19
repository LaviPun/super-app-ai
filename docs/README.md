# Documentation Index

This folder contains the maintained, non-GitBook documentation for the Shopify SuperApp. GitBook publishing content lives under `docs/gitbook/` and is intentionally not part of this index.

## Canonical Docs

| Doc                                                                | Use it for                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [`shopify-dev-setup.md`](./shopify-dev-setup.md)                   | Local Shopify CLI, Partner account, dev store, scopes, and extension deployment setup.                         |
| [`technical.md`](./technical.md)                                   | Compact architecture reference: RecipeSpec flow, services, extensions, security, jobs, and release boundaries. |
| [`ai-module-main-doc.md`](./ai-module-main-doc.md)                 | Full RecipeSpec, allowed values, generator rules, capability gating, and module-builder reference.             |
| [`superapp-surface-inventory.md`](./superapp-surface-inventory.md) | Practical Shopify surface/capability inventory and current implementation boundaries.                          |
| [`catalog.md`](./catalog.md)                                       | Generated catalog and curated template model.                                                                  |
| [`data-models.md`](./data-models.md)                               | Data store schema, service layer, UI, and Agent API behavior.                                                  |
| [`internal-admin.md`](./internal-admin.md)                         | Internal operator dashboard, AI assistant, model setup, logs, jobs, and trace views.                           |
| [`ai-providers.md`](./ai-providers.md)                             | Merchant-generation providers, internal Qwen router, release gate, and safe target URL behavior.               |
| [`release-operations.md`](./release-operations.md)                 | Release safety controls, idempotency scopes, failure classes, and ownership.                                   |
| [`slos.md`](./slos.md)                                             | Reliability targets, measurement queries, and alert policies.                                                  |
| [`runbooks/`](./runbooks/index.md)                                 | Incident runbooks for publish failures, provider outages, webhook storms, and connector failures.              |
| [`debug.md`](./debug.md)                                           | Recurring bugs and known fixes.                                                                                |

## Planning And Status

| Doc                                                      | Use it for                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| [`implementation-status.md`](./implementation-status.md) | Shipped work, stabilization notes, and recent implementation history. |
| [`phase-plan.md`](./phase-plan.md)                       | Roadmap, phase acceptance criteria, and future backlog.               |
| [`_glossary.md`](./_glossary.md)                         | Shared numeric facts referenced by README/status/phase docs.          |

## Product And Design

| Doc                                                                      | Use it for                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`app.md`](./app.md)                                                     | Concise merchant-facing product guide.                                       |
| [`module-settings-modernization.md`](./module-settings-modernization.md) | Required advanced settings by module type and template installability gates. |
| [`uiux-guideline.md`](./uiux-guideline.md)                               | UI/UX guidance. `DESIGN.md` remains the design-system source of truth.       |

## Audit Artifacts

Audit ledgers live in [`audit/`](./audit/) and archive notes live in [`archive/`](./archive/). They are supporting evidence, not the day-to-day source of truth.

## Maintenance Rules

- Keep the root docs set small. Prefer updating a canonical doc over adding a new standalone file.
- Do not duplicate numeric facts; update [`_glossary.md`](./_glossary.md) first.
- Do not duplicate RecipeSpec or Shopify surface enums outside [`ai-module-main-doc.md`](./ai-module-main-doc.md) and [`superapp-surface-inventory.md`](./superapp-surface-inventory.md).
- Historical verification notes should be summarized in [`implementation-status.md`](./implementation-status.md) or moved to [`archive/`](./archive/), not left as new top-level docs.
