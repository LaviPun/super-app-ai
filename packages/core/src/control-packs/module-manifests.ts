/**
 * Module manifests (Module System v2). A manifest lists the control packs that
 * compose a module type, split into Basic and Advanced tiers. This replaces the
 * hand-written per-type config schema with a thin, declarative composition.
 *
 * `theme.section` is the generic, unrestricted storefront type and carries the
 * full pack surface; collapsed kinds (banner, popup, notification-bar, …) compose
 * from the same manifest. Remaining types are migrated incrementally.
 */
import type { ModuleType } from '../allowed-values.js';
import type { ModuleManifest } from './types.js';

const MANIFESTS: Partial<Record<ModuleType, ModuleManifest>> = {
  'theme.section': {
    type: 'theme.section',
    // `layout-archetype` (R2.5) carries the per-type `layout` enum; its option-set
    // is supplied by the module type via the catalog in `type-enums.ts`.
    packs: ['content', 'style', 'layout-archetype', 'trigger', 'page-targeting', 'frequency-cap', 'countdown', 'behavior'],
    // Advanced tier unlocks audience targeting, scheduling/day-parting, the merchant
    // condition primitive (R2.1 `rule-engine`), the product-recommendation source
    // (R2.3 `recommendation`), and the custom-code escape hatch.
    advancedPacks: ['audience', 'schedule', 'rule-engine', 'recommendation', 'advanced-custom'],
  },

  // Function types that carry the R2.2 `pricing` control pack (plan 1c). They
  // compose NO basic control packs — their core config (`rules[]` / `bundles[]`)
  // is hand-written zod on the recipe branch, not pack-derived — so
  // `mustHaveControlsForType(type, 'basic')` stays `[]`, byte-identical to before
  // these manifests existed. `pricing` rides at the ADVANCED tier purely so
  // `resolveTypeEnumsForType` surfaces its per-type `mechanism` enum: the catalog
  // in `type-enums.ts` restricts `mechanism` to the ONE real runtime each type
  // lowers into (drops the declarative-only mechanisms from generation). Nothing
  // else keys off these manifests — the sole reader, `requirement-spec.server.ts`,
  // only derives `mustHaveControls`, which is unchanged at the default (basic) tier.
  'functions.discountRules': {
    type: 'functions.discountRules',
    packs: [],
    advancedPacks: ['pricing'],
  },
  'functions.cartTransform': {
    type: 'functions.cartTransform',
    packs: [],
    advancedPacks: ['pricing'],
  },
};

/**
 * Returns the manifest for a module type, or undefined if not yet migrated.
 *
 * The composer/v2-form layer that this once fed was pruned in phase #3 R2.4;
 * the sole remaining consumer is `requirement-spec.server.ts`, which reads a
 * type's pack set to derive the deterministic `mustHaveControls` list.
 */
export function getManifest(type: ModuleType): ModuleManifest | undefined {
  return MANIFESTS[type];
}
