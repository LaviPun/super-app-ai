# Module Settings Contracts — Phase 24

Source of truth: `packages/platform-contracts/src/module-settings.ts`

## Schemas

| Schema | Purpose |
|--------|---------|
| `SettingsDiffSchema` | `{ moduleType, changes[], preservedKeys[], addedKeys[] }`. Visible diff produced by fill-missing / regenerate. |
| `SettingsFieldChangeSchema` | One change: `{ path, reason: 'filled_missing'|'regenerated'|'unchanged_pinned', before?, after? }`. |
| `FillMissingRequestSchema` | `{ moduleId, moduleType, currentConfig, expectedControls[], merchantSetKeys[] }`. |
| `RegenerateSettingsRequestSchema` | `{ moduleId, moduleType, currentConfig, pinnedKeys[] }` — full re-gen preserving pinned keys. |
| `AdminFormSchema` | `{ jsonSchema, uiSchema[], defaults }` — the (jsonSchema, uiSchema) transport pairing the SchemaForm consumes. |
| `UiFieldHintSchema` | One UI hint: `{ path, widget?, label?, help?, group?, order?, tier?, visibleWhen? }`. |

## Helpers

- `buildFillMissingDiff({ moduleType, currentConfig, merchantSetKeys, proposed })` — **pure**; the never-overwrite invariant (SC-001). Skips any key that is merchant-set or already holds a non-empty value; returns the merged `config` + `SettingsDiff`.

## Renderer binding

`AdminFormSchema.uiSchema` is the transport shape (array of `UiFieldHint`). The live renderer `apps/web/app/components/SchemaForm.tsx` consumes the hydrate `adminConfig` (`{ jsonSchema, uiSchema (record), defaults }`) and derives widgets from JSON-schema when no hint is given. Both describe the same fields; the array form is the serialisable contract, the record form is the component prop.

## Consumers

- `apps/web/app/services/ai/fill-missing-settings.server.ts` — `missingControls`, `fillMissingSettings`.
- `apps/web/app/components/SchemaForm.tsx` — renders module settings + data-record forms.
