/**
 * Per-type enum catalog + resolver (R2.5 — the enabler).
 *
 * A control-pack field can have an option-set that is **supplied by the module
 * type** (e.g. a `layout` field whose archetypes differ for `theme.section` vs a
 * future reviews/bundle type). This module is the flat-pin replacement for the
 * pruned composer's `ModuleManifest.enums` catalog + `resolveEnumOptions`:
 * option-sets are looked up off the recipe **type** directly, with a per-pack
 * `fallback` for types that supply none.
 *
 *   CATALOG[type]?.[packNamespace]?.[enumKey]  ->  EnumOption[]
 *
 * The tight per-type enum is enforced at generation time
 * (`recipe-json-schema.server.ts`) and surfaced to the AI prose fallback via
 * `describeTypeEnums`. The recipe union keeps a loose `z.string()` so cross-type
 * recipes coexist and old recipes keep validating.
 */
import type { ModuleType } from '../allowed-values.js';
import type { EnumOption, TypeEnumField } from './types.js';
import { getPack } from './registry.js';
import { getManifest } from './module-manifests.js';

/**
 * Per-type option catalog. Outer key = ModuleType, then pack namespace, then the
 * pack's `enumKey`. Absent entries fall back to the pack's `TypeEnumField.fallback`.
 *
 * `theme.section` is the only migrated type today. Future reviews/bundle/upsell
 * types add their own divergent option-sets here with zero new plumbing.
 */
const TYPE_ENUM_CATALOG: Partial<
  Record<ModuleType, Record<string, Record<string, EnumOption[]>>>
> = {
  'theme.section': {
    layout: {
      layout: [
        { value: 'stacked', label: 'Stacked', hint: 'Vertical flow — the default.' },
        { value: 'grid', label: 'Grid', hint: 'Even columns (use with `columns`).' },
        { value: 'masonry', label: 'Masonry', hint: 'Staggered, Pinterest-style grid.' },
        { value: 'carousel', label: 'Carousel', hint: 'Horizontal scroll-snap row.' },
      ],
    },
  },
};

/**
 * Resolve a pack's per-type enum field to its concrete option-set for a type.
 * Catalog entry wins; otherwise the pack's `fallback`. Never returns empty
 * (throws if a catalog entry is present but empty — a config error).
 */
export function resolveTypeEnumOptions(
  type: ModuleType,
  packNamespace: string,
  field: TypeEnumField,
): EnumOption[] {
  const supplied = TYPE_ENUM_CATALOG[type]?.[packNamespace]?.[field.enumKey];
  if (supplied && supplied.length === 0) {
    throw new Error(
      `typeEnum "${packNamespace}.${field.enumKey}" resolved to zero options for type "${type}"`,
    );
  }
  const opts = supplied && supplied.length > 0 ? supplied : field.fallback;
  if (opts.length === 0) {
    throw new Error(
      `typeEnum "${packNamespace}.${field.enumKey}" has an empty fallback`,
    );
  }
  return opts;
}

/** A resolved per-type enum: the config path + its legal option values. */
export interface ResolvedTypeEnum {
  /** Pack namespace (the flat config key), e.g. 'layout'. */
  packNamespace: string;
  /** Field name within the pack, e.g. 'layout'. */
  field: string;
  /** Resolved options for this type. */
  options: EnumOption[];
  /** Default value (a member of `options`). */
  default: string;
}

/**
 * Walk a type's manifest pack-set and return every per-type enum resolved for
 * that type. Drives both the generation JSON Schema (hard constraint) and the
 * prose fallback. Types without a manifest, or whose packs declare no
 * `typeEnums`, return `[]` (no per-type enums → schema/prose unchanged).
 */
export function resolveTypeEnumsForType(type: ModuleType): ResolvedTypeEnum[] {
  const manifest = getManifest(type);
  if (!manifest) return [];
  const packIds = [...manifest.packs, ...(manifest.advancedPacks ?? [])];
  const resolved: ResolvedTypeEnum[] = [];
  for (const id of packIds) {
    const pack = getPack(id);
    if (!pack?.typeEnums) continue;
    for (const [fieldName, spec] of Object.entries(pack.typeEnums)) {
      const options = resolveTypeEnumOptions(type, pack.namespace, spec);
      // `resolveTypeEnumOptions` guarantees a non-empty array (throws otherwise).
      const first = options[0]!;
      resolved.push({
        packNamespace: pack.namespace,
        field: fieldName,
        options,
        default: spec.default ?? first.value,
      });
    }
  }
  return resolved;
}

/**
 * One terse prose line per per-type enum, for the low-confidence / non-structured
 * prompt fallback. Empty array when the type has no per-type enums.
 *
 *   config.layout.layout — one of: stacked | grid | masonry | carousel (this module type only).
 */
export function describeTypeEnums(type: ModuleType): string[] {
  return resolveTypeEnumsForType(type).map((r) => {
    const values = r.options.map((o) => o.value).join(' | ');
    return `config.${r.packNamespace}.${r.field} — one of: ${values} (this module type only). Default: ${r.default}.`;
  });
}
