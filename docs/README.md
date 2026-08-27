# Documentation Index

This folder contains the maintained, non-GitBook documentation for the Shopify SuperApp. GitBook publishing content lives under `docs/gitbook/` and is intentionally not part of this index.

For merged-change history grouped by launch-program workstream, see [`../CHANGELOG.md`](../CHANGELOG.md) (repo root, not under `docs/`).

## Canonical Docs

| Doc                                                                | Use it for                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [`shopify-dev-setup.md`](./shopify-dev-setup.md)                   | Local Shopify CLI, Partner account, dev store, scopes, and extension deployment setup.                         |
| [`architecture.md`](./architecture.md)                             | Process topology, RecipeSpec at a glance, capability gating, security model, data model summary, and extension architecture. |
| [`generation.md`](./generation.md)                                  | Full RecipeSpec, canonical value sets, catalog/templates, blueprints, and capability gating reference.         |
| [`data-models.md`](./data-models.md)                               | Data store schema, service layer, UI, and Agent API behavior.                                                  |
| [`internal-admin.md`](./internal-admin.md)                         | Internal operator dashboard, AI assistant, model setup, logs, jobs, and trace views.                           |
| [`ai-providers.md`](./ai-providers.md)                             | Merchant-generation providers, internal Qwen router, release gate, and safe target URL behavior.               |
| [`notifications.md`](./notifications.md)                           | Transactional email mailer contract, DB-first/env-fallback provider config, and secret handling.               |
| [`publishing.md`](./publishing.md)                                  | The publish/unpublish/rollback contract — what actually happens to a merchant's store, cited from code.        |
| [`flows.md`](./flows.md)                                            | The `flow.automation` module type, the `WorkflowEngineService`, and where design and implementation diverge.   |
| [`operations.md`](./operations.md)                                 | Topology, deploy flow, observability, SLO pointer, and the runbook index.                                      |
| [`slos.md`](./slos.md)                                             | Reliability targets, measurement queries, and alert policies.                                                  |
| [`runbooks/`](./runbooks/index.md)                                 | Incident runbooks for publish failures, provider outages, webhook storms, and connector failures.              |
| [`testing.md`](./testing.md)                                       | Test categories, local run commands, CI gates, the eval harness, and how to add a test for a new module type.  |
| [`debug.md`](./debug.md)                                           | Recurring bugs and known fixes.                                                                                |

## Planning And Status

| Doc                                                      | Use it for                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| [`implementation-status.md`](./implementation-status.md) | Shipped work, stabilization notes, and recent implementation history. |

Roadmap/phase-plan content was archived in Task 1 — see [`archive/phase-plan.md`](./archive/phase-plan.md) for the historical version; it is no longer maintained.

## Product And Design

| Doc                                                                      | Use it for                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`app.md`](./app.md)                                                     | Concise merchant-facing product guide.                                       |

UI/UX guidance was archived in Task 1 — see [`archive/uiux-guideline.md`](./archive/uiux-guideline.md) for the historical version. `DESIGN.md` (repo root) remains the live design-system source of truth.

## Audit Artifacts

Audit ledgers live in [`audit/`](./audit/) and archive notes live in [`archive/`](./archive/). They are supporting evidence, not the day-to-day source of truth.

### Archived in the Task 14 index reconciliation

Four "Phase 4 release safety" planning docs described a progressive-publish/canary/capability-graph system that was never built as designed — `docs/publishing.md` states plainly "there is no 'progressive publish' or 'canary' mechanism," and no `RELEASE_TRANSITION` (or equivalent) model exists in `apps/web/prisma/schema.prisma`. Archived rather than indexed as live reference:

- [`archive/failure-class-matrix.md`](./archive/failure-class-matrix.md) — failure classes (`POLICY_DENIED`, `FEATURE_FLAG_BLOCKED`, ...) for a policy/gate system with no corresponding code (`grep` for both names across `apps/web/app` returns nothing).
- [`archive/idempotency-matrix.md`](./archive/idempotency-matrix.md) — 4 of its 5 rows describe the same non-existent progressive-release system; the one still-true row (webhook-event dedup via `WebhookEvent`) is already documented in `docs/publishing.md` and root `README.md`.
- [`archive/raci.md`](./archive/raci.md) — ownership matrix for "release safety controls introduced in Phase 4," the same system.
- [`archive/release-dashboard-spec.md`](./archive/release-dashboard-spec.md) — a dashboard spec for `canary`/`ramp`/`promote`/`rollback` stages that don't exist in the current publish/unpublish/rollback model (see `docs/publishing.md`).

One more, archived for a different reason — it's a dated, one-off change record, exactly the failure mode this file's own Maintenance Rules (below) warn against:

- [`archive/plan-changes-codechange-verification.md`](./archive/plan-changes-codechange-verification.md) — a single historical verification note (dated 2026-03-05, covering one doc-plan change and one `DataStoreService` bug fix), not an evergreen reference.

## Maintenance Rules

- Keep the root docs set small. Prefer updating a canonical doc over adding a new standalone file.
- Do not duplicate RecipeSpec or Shopify surface enums outside [`generation.md`](./generation.md).
- Historical verification notes should be summarized in [`implementation-status.md`](./implementation-status.md) or moved to [`archive/`](./archive/), not left as new top-level docs.
