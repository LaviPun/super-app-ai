/**
 * Control Pack system (Module System v2).
 *
 * A ControlPack is a reusable, self-describing bundle of related settings.
 * Its Zod `schema` is the single hand-written source of truth; everything
 * downstream (per-type config schema, LLM structured-output JSON Schema,
 * prompt guidance, preview inputs) is derived from it.
 *
 * Composition is by FLAT PIN: a pack's `schema` is pinned as an `.optional()`
 * nested key onto a recipe branch's `config`, keyed by the pack's `namespace`
 * (e.g. `config.audience`, `config.schedule`, `config.advancedCustom`). The old
 * grouped-composer / v2-form path was pruned in phase #3 R2.4; `namespace` is now
 * the flat config key, not a grouped-object key.
 *
 * This file defines only the contracts. Concrete packs live in ./packs/*, the
 * registry in ./registry.ts, and the type→pack-set manifests in
 * ./module-manifests.ts.
 */
import type { z } from 'zod';
import type { ModuleType } from '../allowed-values.js';

/** Tier gating. Advanced packs/fields only surface when the merchant opts up. */
export type ControlTier = 'basic' | 'advanced';

/**
 * One selectable option for a per-type enum (R2.5). `value` is what's persisted
 * and validated; `label`/`hint` are surfaced to the admin form and (via prose)
 * to the AI. The enum is closed — the model picks a `value`, never invents one.
 */
export interface EnumOption {
  /** Persisted, validated value (e.g. 'grid'). */
  value: string;
  /** Human label for the admin form; defaults to `value`. */
  label?: string;
  /** Optional help/marketing note surfaced to the AI (prose path) + form. */
  hint?: string;
}

/**
 * A field whose enum option-set is supplied by the module type (R2.5 enabler).
 *
 * The pack declares the *slot* (`enumKey`) and a safe, non-empty `fallback`; a
 * per-type option catalog (see `type-enums.ts`) supplies the actual options for
 * a given `ModuleType`. This replaces the pruned composer's manifest-`enums`
 * catalog: option-sets are resolved off the recipe **type** at generation time,
 * not composed through the deleted `composeConfig`.
 *
 * At the recipe-union level the field is a loose `z.string()` (cross-type
 * recipes coexist); the tight per-type enum is enforced in the generation JSON
 * Schema (`recipe-json-schema.server.ts`).
 */
export interface TypeEnumField {
  /** Discriminator so derivation code knows this field is type-scoped. */
  kind: 'typeEnum';
  /** Key into the per-type option catalog. Often === the field name. */
  enumKey: string;
  /**
   * Options used when the catalog supplies none for a type (back-compat + types
   * without an entry). MUST be non-empty. The first entry is the default unless
   * `default` is set.
   */
  fallback: EnumOption[];
  /** Persisted default; must be a `value` present in the resolved option-set. */
  default?: string;
}

/** Conditional-visibility predicate for a field (drives the admin form + tier gating). */
export interface FieldShowWhen {
  /** Sibling field id within the same pack. */
  field: string;
  /** Field is shown only when the sibling equals this value. */
  equals: string | number | boolean;
}

/**
 * Known SchemaForm widget overrides. `'rule-builder'` (R2.1) renders the ordered
 * condition-row editor for a `RuleEnginePack.groups` value. `FieldUiHint.widget`
 * stays a free `string` for forward-compat, but new widgets should be listed here.
 */
export type FieldWidget =
  | 'textarea'
  | 'color'
  | 'select'
  | 'datetime'
  | 'toggle'
  | 'number'
  | 'rule-builder';

/** Per-field rendering hint for the generic SchemaForm renderer. */
export interface FieldUiHint {
  /** Override the inferred widget. See `FieldWidget` for the documented set (e.g. 'rule-builder'). */
  widget?: FieldWidget | (string & {});
  /** Help text shown under the field. */
  help?: string;
  /** Placeholder for text-like widgets. */
  placeholder?: string;
  /** Hide from the form entirely (still validated/persisted). */
  hidden?: boolean;
  /** Only show this field when the predicate holds. */
  showWhen?: FieldShowWhen;
  /** Minimum tier required to see this field. Defaults to the pack's tier. */
  tier?: ControlTier;
}

/** Form-level hints for a pack: section label, field order, and per-field hints. */
export interface UiHints {
  /** Section heading shown above the pack's fields. Defaults to the pack label. */
  groupLabel?: string;
  /** Explicit field order; unlisted fields follow in schema order. */
  order?: string[];
  /** Field-name -> hint. */
  fields?: Record<string, FieldUiHint>;
}

/**
 * A reusable bundle of settings. `schema` should be object-like (a ZodObject,
 * or a ZodObject wrapped in `.default()`/`.optional()`) so it can be pinned as a
 * flat nested key under a recipe branch's `config` and converted to JSON Schema.
 * The constraint is the broad ZodTypeAny.
 */
export interface ControlPack<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Stable id used in manifests, e.g. 'trigger'. */
  id: string;
  /** Flat key under recipe `config` where this pack's value is pinned, e.g. 'audience'. */
  namespace: string;
  /** Human-readable label (also the default form section heading). */
  label: string;
  /** Default tier for the whole pack. Individual fields may override via uiSchema. */
  tier: ControlTier;
  /** Single source of truth for this pack's settings. */
  schema: S;
  /**
   * Declares which of this pack's fields are per-type enums (R2.5), keyed by
   * field name. The `schema` keeps a loose validator for these fields (so the
   * shared recipe union accepts any type's value); the tight per-type option-set
   * is resolved from the catalog in `type-enums.ts` at generation time. Purely
   * additive metadata — packs without per-type enums omit it.
   */
  typeEnums?: Record<string, TypeEnumField>;
  /** Optional rendering/visibility hints for SchemaForm. */
  uiSchema?: UiHints;
  /** Restrict the pack to specific module types. Defaults to "applies to any type that lists it". */
  appliesTo?: (type: ModuleType) => boolean;
}

/** Declares which packs make up a module type, split by tier. */
export interface ModuleManifest {
  type: ModuleType;
  /** Pack ids included at the Basic tier (and above). */
  packs: string[];
  /** Additional pack ids unlocked at the Advanced tier (e.g. 'data-binding', 'advanced-custom'). */
  advancedPacks?: string[];
}
