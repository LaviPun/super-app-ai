import { z } from 'zod';

/**
 * Module settings uplift contracts (WS3 / specs/024-module-settings-uplift).
 *
 * Three merchant actions share these shapes:
 *  - fill-missing  — AI produces only absent fields; never overwrites merchant-set.
 *  - regenerate    — full config re-gen preserving pinned fields.
 *  - schema-form   — render module/data-record forms from a (jsonSchema, uiSchema) pair.
 *
 * Source of truth: this file. Documented by
 * `specs/024-module-settings-uplift/contracts/module-settings.md`.
 */

/** One field-level change produced by fill-missing / regenerate. */
export const SettingsFieldChangeSchema = z.object({
  /** Dot-path key into the config (e.g. 'trigger.delaySeconds'). */
  path: z.string().min(1),
  /** Why the value changed — for the visible diff. */
  reason: z.enum(['filled_missing', 'regenerated', 'unchanged_pinned']),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type SettingsFieldChange = z.infer<typeof SettingsFieldChangeSchema>;

export const SettingsDiffSchema = z.object({
  moduleType: z.string().min(1),
  changes: z.array(SettingsFieldChangeSchema).default([]),
  /** Keys that were merchant-set and therefore left untouched. */
  preservedKeys: z.array(z.string().min(1)).default([]),
  /** Keys newly added by the action. */
  addedKeys: z.array(z.string().min(1)).default([]),
});
export type SettingsDiff = z.infer<typeof SettingsDiffSchema>;

export const FillMissingRequestSchema = z.object({
  moduleId: z.string().min(1),
  moduleType: z.string().min(1),
  /** The current config as stored (merchant-set values live here). */
  currentConfig: z.record(z.unknown()).default({}),
  /** Control keys the module is expected to expose (from RequirementSpec / manifest). */
  expectedControls: z.array(z.string().min(1)).default([]),
  /** Keys the merchant has explicitly set — never overwritten. */
  merchantSetKeys: z.array(z.string().min(1)).default([]),
});
export type FillMissingRequest = z.infer<typeof FillMissingRequestSchema>;

/** Full-config regenerate request; `pinnedKeys` are preserved verbatim. */
export const RegenerateSettingsRequestSchema = z.object({
  moduleId: z.string().min(1),
  moduleType: z.string().min(1),
  currentConfig: z.record(z.unknown()).default({}),
  pinnedKeys: z.array(z.string().min(1)).default([]),
});
export type RegenerateSettingsRequest = z.infer<typeof RegenerateSettingsRequestSchema>;

/** A widget hint for one field in the admin form. */
export const UiFieldHintSchema = z.object({
  path: z.string().min(1),
  widget: z
    .enum(['text', 'textarea', 'number', 'toggle', 'select', 'color', 'group', 'code'])
    .optional(),
  label: z.string().optional(),
  help: z.string().optional(),
  group: z.string().optional(),
  order: z.number().int().optional(),
  /** Tier gating — escape-hatch widgets only show at 'advanced'. */
  tier: z.enum(['basic', 'advanced']).optional(),
  /** Conditional visibility: show when `path` equals one of these values. */
  visibleWhen: z
    .object({ path: z.string().min(1), equals: z.array(z.unknown()) })
    .optional(),
});
export type UiFieldHint = z.infer<typeof UiFieldHintSchema>;

/**
 * The (jsonSchema, uiSchema) pairing the SchemaForm renderer consumes. `jsonSchema`
 * is the validation/source-of-truth (the hydrate `adminConfigSchemaJson`);
 * `uiSchema` is derived hints. Defaults seed the form.
 */
export const AdminFormSchema = z.object({
  jsonSchema: z.record(z.unknown()),
  uiSchema: z.array(UiFieldHintSchema).default([]),
  defaults: z.record(z.unknown()).default({}),
});
export type AdminForm = z.infer<typeof AdminFormSchema>;

/**
 * Build a SettingsDiff by merging only missing fields, never overwriting
 * merchant-set keys. Pure — the safety invariant (SC-001) lives here so it is
 * unit-testable independent of the LLM.
 */
export function buildFillMissingDiff(input: {
  moduleType: string;
  currentConfig: Record<string, unknown>;
  merchantSetKeys: string[];
  proposed: Record<string, unknown>;
}): { config: Record<string, unknown>; diff: SettingsDiff } {
  const merchantSet = new Set(input.merchantSetKeys);
  const config: Record<string, unknown> = { ...input.currentConfig };
  const changes: SettingsFieldChange[] = [];
  const addedKeys: string[] = [];
  const preservedKeys: string[] = [];

  for (const [path, value] of Object.entries(input.proposed)) {
    const alreadySet = Object.prototype.hasOwnProperty.call(input.currentConfig, path) &&
      input.currentConfig[path] !== undefined &&
      input.currentConfig[path] !== null &&
      input.currentConfig[path] !== '';
    if (merchantSet.has(path) || alreadySet) {
      preservedKeys.push(path);
      continue;
    }
    config[path] = value;
    addedKeys.push(path);
    changes.push({ path, reason: 'filled_missing', before: input.currentConfig[path], after: value });
  }

  return {
    config,
    diff: SettingsDiffSchema.parse({
      moduleType: input.moduleType,
      changes,
      preservedKeys,
      addedKeys,
    }),
  };
}
