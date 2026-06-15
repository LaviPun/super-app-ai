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
    packs: ['content', 'style', 'trigger', 'page-targeting', 'frequency-cap', 'countdown', 'behavior'],
    // Advanced tier unlocks audience targeting, scheduling/day-parting, and the custom-code escape hatch.
    advancedPacks: ['audience', 'schedule', 'advanced-custom'],
  },
};

/** Returns the manifest for a module type, or undefined if not yet migrated to v2. */
export function getManifest(type: ModuleType): ModuleManifest | undefined {
  return MANIFESTS[type];
}

/** Module types that currently have a v2 manifest. */
export function listManifestTypes(): ModuleType[] {
  return Object.keys(MANIFESTS) as ModuleType[];
}

/** Whether a module type can be generated/edited via the v2 control-pack engine. */
export function hasManifest(type: ModuleType): boolean {
  return Boolean(MANIFESTS[type]);
}
