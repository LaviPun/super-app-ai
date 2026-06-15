/**
 * Control Pack registry. Packs register here by id; manifests and the composer
 * resolve packs through `getPack`. Keeping a single registry means a control's
 * definition lives in exactly one place.
 */
import type { ControlPack } from './types.js';
import { contentPack } from './packs/content.pack.js';
import { stylePack } from './packs/style.pack.js';
import { triggerPack } from './packs/trigger.pack.js';
import { pageTargetingPack } from './packs/page-targeting.pack.js';
import { frequencyCapPack } from './packs/frequency-cap.pack.js';
import { countdownPack } from './packs/countdown.pack.js';
import { behaviorPack } from './packs/behavior.pack.js';
import { audiencePack } from './packs/audience.pack.js';
import { schedulePack } from './packs/schedule.pack.js';
import { advancedCustomPack } from './packs/advanced-custom.pack.js';

const ALL_PACKS: ControlPack[] = [
  contentPack,
  stylePack,
  triggerPack,
  pageTargetingPack,
  frequencyCapPack,
  countdownPack,
  behaviorPack,
  audiencePack,
  schedulePack,
  advancedCustomPack,
];

const REGISTRY = new Map<string, ControlPack>(ALL_PACKS.map((p) => [p.id, p]));

/** Returns the pack for an id, or undefined if not registered. */
export function getPack(id: string): ControlPack | undefined {
  return REGISTRY.get(id);
}

/** Returns the pack for an id, throwing if unknown (use when the id comes from a manifest). */
export function requirePack(id: string): ControlPack {
  const pack = REGISTRY.get(id);
  if (!pack) throw new Error(`Unknown control pack: "${id}"`);
  return pack;
}

/** All registered pack ids. */
export function listPackIds(): string[] {
  return [...REGISTRY.keys()];
}

/** All registered packs. */
export function listPacks(): ControlPack[] {
  return [...REGISTRY.values()];
}
