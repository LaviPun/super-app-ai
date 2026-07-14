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
import { RECOMMENDATION_STRATEGIES, STATIC_RECOMMENDATION_STRATEGIES } from '../allowed-values.js';
import type { EnumOption, TypeEnumField } from './types.js';
import { getPack } from './registry.js';
import { getManifest } from './module-manifests.js';

/** Map an ordered value list to bare {@link EnumOption}s (label defaults to value). */
const asOptions = (values: readonly string[]): EnumOption[] => values.map((value) => ({ value }));

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
    // Intent-documenting entry: a storefront app-proxy widget CAN rank server-side,
    // so it resolves the FULL strategy set — nothing is restricted (this equals the
    // pack `fallback`; declared explicitly so the surface is self-documenting and the
    // catalog↔schema parity guard exercises it).
    recommendation: {
      strategy: asOptions(RECOMMENDATION_STRATEGIES),
    },
  },
  // Buyer-facing surfaces (plan 3a). checkout/post-purchase extensions have NO
  // App-Proxy access (extensions/checkout-ui/src/hooks/useCheckoutConfig.ts: "Checkout
  // has NO App Proxy access"), so the four DYNAMIC strategies (top-sellers / trending /
  // buy-it-again / recently-viewed) can never resolve there — they always degrade to
  // `fallback`. Restrict generation to the STATIC six (manual / collection / related /
  // complementary / most-expensive-in-cart / cheapest-in-cart) so it never emits a
  // strategy that silently no-ops on these surfaces. Mirrors the pricing-mechanism drop.
  'checkout.upsell': {
    recommendation: { strategy: asOptions(STATIC_RECOMMENDATION_STRATEGIES) },
  },
  'checkout.block': {
    recommendation: { strategy: asOptions(STATIC_RECOMMENDATION_STRATEGIES) },
  },
  'postPurchase.offer': {
    recommendation: { strategy: asOptions(STATIC_RECOMMENDATION_STRATEGIES) },
  },
  // Pricing MECHANISM is type-scoped (plan 1c). Each Function type may claim ONLY
  // the one real runtime it actually lowers into (compiler/pricing/lower.ts). The
  // declarative-only mechanisms (`discount-code` / `draft-order`) are intentionally
  // ABSENT from every set, so generation cannot emit a mechanism no runtime honours.
  'functions.discountRules': {
    pricing: {
      mechanism: [
        {
          value: 'shopify-function-discount',
          label: 'Shopify Function (discount)',
          hint: 'Lowers into the discountRules Function.',
        },
      ],
    },
  },
  'functions.cartTransform': {
    pricing: {
      mechanism: [
        {
          value: 'shopify-function-cart-transform',
          label: 'Shopify Function (cart transform)',
          hint: 'Lowers into the cartTransform Function.',
        },
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

/** A single per-type enum violation found by {@link validateTypeEnums}. */
export interface TypeEnumViolation {
  /** Dotted config path of the offending field, e.g. `config.pricing.mechanism`. */
  path: string;
  /** The value present on the spec that is outside the type's option-set. */
  value: string;
  /** The legal values for this field on this module type. */
  allowed: string[];
}

/**
 * Drift-closure validator (plan 1b). Checks a recipe spec's per-type enum fields
 * against the catalog, returning one {@link TypeEnumViolation} per offending value.
 *
 * This closes the gap where the shared `RecipeSpecSchema` keeps a LOOSE validator
 * for these fields (`z.string()` for `layout`, the full `z.enum` for `mechanism`)
 * so cross-type/legacy specs coexist — meaning a persisted or validated spec could
 * otherwise hold a value the generation JSON Schema forbids. It walks
 * `resolveTypeEnumsForType(spec.type)` and, for each resolved enum, checks
 * `spec.config.<packNamespace>.<field>` against the option-set. It mirrors the
 * generation-time overlay (`recipe-json-schema.server.ts:overlayTypeEnums`), which
 * tightens the SAME `config.<ns>.<field>` nodes, so a spec that satisfies one
 * satisfies the other (pinned by the apps/web parity guard).
 *
 * Semantics:
 *  - ABSENT fields/packs PASS — every pinned pack is `.optional()`, so a spec that
 *    omits `config.pricing`, or includes it but leaves `mechanism` unset, is fine.
 *  - Only a PRESENT string value outside the option-set is a violation. Non-string
 *    values are left to Zod (this is enum-only, not a type checker).
 *  - `mode` controls behaviour on a MISCONFIGURED catalog (an entry that resolves to
 *    zero options). `'warn'` swallows it and returns `[]` (never break existing data
 *    on the persist path); `'strict'` (default) rethrows so tests/generation surface
 *    the config bug. It does NOT change which VALUE violations are reported.
 */
export function validateTypeEnums(
  spec: { type: ModuleType; config?: unknown },
  mode: 'warn' | 'strict' = 'strict',
): TypeEnumViolation[] {
  let resolved: ResolvedTypeEnum[];
  try {
    resolved = resolveTypeEnumsForType(spec.type);
  } catch (err) {
    if (mode === 'warn') return [];
    throw err;
  }
  if (resolved.length === 0) return [];

  const config = spec.config;
  if (!config || typeof config !== 'object') return [];

  const violations: TypeEnumViolation[] = [];
  for (const r of resolved) {
    const packValue = (config as Record<string, unknown>)[r.packNamespace];
    // Absent/optional pack → nothing to validate.
    if (!packValue || typeof packValue !== 'object') continue;
    const fieldValue = (packValue as Record<string, unknown>)[r.field];
    // Absent field → the `.optional()`/default backstop applies; pass.
    if (fieldValue === undefined || fieldValue === null) continue;
    // Only closed string enums are catalog-checked; leave other types to Zod.
    if (typeof fieldValue !== 'string') continue;
    const allowed = r.options.map((o) => o.value);
    if (!allowed.includes(fieldValue)) {
      violations.push({ path: `config.${r.packNamespace}.${r.field}`, value: fieldValue, allowed });
    }
  }
  return violations;
}
