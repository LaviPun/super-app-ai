# Documentation Index

This folder contains the maintained, non-GitBook documentation for the Shopify SuperApp. GitBook publishing content lives under `docs/gitbook/` and is intentionally not part of this index.

## Canonical Docs

| Doc                                                                | Use it for                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [`shopify-dev-setup.md`](./shopify-dev-setup.md)                   | Local Shopify CLI, Partner account, dev store, scopes, and extension deployment setup.                         |
| [`architecture.md`](./architecture.md)                             | Process topology, RecipeSpec at a glance, capability gating, security model, data model summary, and extension architecture. |
| [`generation.md`](./generation.md)                                  | Full RecipeSpec, canonical value sets, catalog/templates, blueprints, and capability gating reference.         |
| [`data-models.md`](./data-models.md)                               | Data store schema, service layer, UI, and Agent API behavior.                                                  |
| [`internal-admin.md`](./internal-admin.md)                         | Internal operator dashboard, AI assistant, model setup, logs, jobs, and trace views.                           |
| [`ai-providers.md`](./ai-providers.md)                             | Merchant-generation providers, internal Qwen router, release gate, and safe target URL behavior.               |
| [`operations.md`](./operations.md)                                 | Topology, deploy flow, observability, SLO pointer, and the runbook index.                                      |
| [`slos.md`](./slos.md)                                             | Reliability targets, measurement queries, and alert policies.                                                  |
| [`runbooks/`](./runbooks/index.md)                                 | Incident runbooks for publish failures, provider outages, webhook storms, and connector failures.              |
| [`debug.md`](./debug.md)                                           | Recurring bugs and known fixes.                                                                                |

## Planning And Status

| Doc                                                      | Use it for                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| [`implementation-status.md`](./implementation-status.md) | Shipped work, stabilization notes, and recent implementation history. |
| [`phase-plan.md`](./archive/phase-plan.md)                       | Roadmap, phase acceptance criteria, and future backlog.               |

## Product And Design

| Doc                                                                      | Use it for                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`app.md`](./app.md)                                                     | Concise merchant-facing product guide.                                       |
| [`uiux-guideline.md`](./archive/uiux-guideline.md)                               | UI/UX guidance. `DESIGN.md` remains the design-system source of truth.       |

## Audit Artifacts

Audit ledgers live in [`audit/`](./audit/) and archive notes live in [`archive/`](./archive/). They are supporting evidence, not the day-to-day source of truth.

## Maintenance Rules

- Keep the root docs set small. Prefer updating a canonical doc over adding a new standalone file.
- Do not duplicate RecipeSpec or Shopify surface enums outside [`generation.md`](./generation.md).
- Historical verification notes should be summarized in [`implementation-status.md`](./implementation-status.md) or moved to [`archive/`](./archive/), not left as new top-level docs.
