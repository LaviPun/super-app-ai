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
    // Advanced tier unlocks audience targeting, scheduling/day-parting, and the custom-code escape hatch.
    advancedPacks: ['audience', 'schedule', 'advanced-custom'],
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
