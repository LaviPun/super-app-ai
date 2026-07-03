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

/** Conditional-visibility predicate for a field (drives the admin form + tier gating). */
export interface FieldShowWhen {
  /** Sibling field id within the same pack. */
  field: string;
  /** Field is shown only when the sibling equals this value. */
  equals: string | number | boolean;
}

/** Per-field rendering hint for the generic SchemaForm renderer. */
export interface FieldUiHint {
  /** Override the inferred widget, e.g. 'textarea' | 'color' | 'select' | 'datetime' | 'toggle'. */
  widget?: string;
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
