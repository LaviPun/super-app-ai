# Feature Specification: Platform V2 Phase 24 — Module Settings Uplift

**Feature Directory**: `024-module-settings-uplift`

**Created**: 2026-06-14

**Last updated**: 2026-06-14

**Status**: **In progress** on `master`

**Master index**: [`specs/000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md)

**Canonical plan**: [`docs/module-system-v2.md`](../../docs/module-system-v2.md). See also [`docs/module-settings-modernization.md`](../../docs/module-settings-modernization.md).

## Goal

Replace the four-place, hardcoded settings model with four schema-driven merchant actions on `modules.$moduleId.tsx`: **fill-missing**, **regenerate** (pinned-preserving), a single **schema-driven form** consuming the hydrate `adminConfigSchemaJson` (closing the generate-but-never-render gap), and first-class **republish** with a visible diff + rollback. Workstream WS3.

## Delivery status on `master`

| Field | Value |
|-------|-------|
| Implementation | **In progress** |
| Contract | `packages/platform-contracts/src/module-settings.ts` (`SettingsDiffSchema`, `FillMissingRequestSchema`, `AdminFormSchema`, `buildFillMissingDiff`) + test |
| App code | `fill-missing-settings.server.ts`; `SchemaForm.tsx` (already renders `{ jsonSchema, uiSchema, value }`, consumed by `ConfigEditor`) |
| Tests | `apps/web/app/__tests__/module-settings-uplift.test.ts` |
| Flag | `SchemaForm` path behind the v2 flag; `ConfigEditor` remains the v1 fallback |

## Acceptance

- Fill-missing produces **only** absent fields and never overwrites merchant-set values; output validates `SettingsDiffSchema`.
- Regenerate re-gens the full config for the same type, preserving `pinnedKeys`.
- One schema-driven form (`SchemaForm`) renders module settings and data-record forms from the hydrate `adminConfigSchemaJson`; missing controls derive UI from the JSON-schema field.
- Republish recompiles + re-runs publish idempotently with a visible `RepublishDiff` and rollback.

## Success criteria

- **SC-001**: Fill-missing never mutates merchant-set fields (test).
- **SC-002**: SchemaForm renders every popup/contactForm control from `adminConfigSchemaJson`; edit→save round-trips.
- **SC-003**: Advanced/escape-hatch tier reveals custom HTML/CSS/JS; preview stays safe.
- **SC-004**: Republish is idempotent (no duplicate metaobjects).

### Expanded criteria

- **SC-001a**: The never-overwrite invariant lives in the pure `buildFillMissingDiff` helper; merchant-set keys and already-set non-empty values are preserved before any merge.
- **SC-001b**: The proposer is asked only for genuinely-missing keys; proposals for non-missing keys are dropped.
- **SC-004a**: Republish idempotency is the WS5 upsert contract (`RepublishDiffSchema`); rollback reuses `api.agent.modules.$moduleId.rollback.tsx`.
