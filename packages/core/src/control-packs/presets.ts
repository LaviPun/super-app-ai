/**
 * Presets (Module System v2 consolidation). A preset = a starting RecipeSpec for
 * a module type. v2 derives presets from the existing MODULE_TEMPLATES catalog
 * rather than maintaining a second hand-written list — and exposes a CURATED
 * subset per type so the gallery shrinks from 145 entries to a handful per type.
 *
 * This is intentionally non-destructive: the underlying templates remain the
 * source of truth. Physical pruning of the catalog is a separate, product-signed
 * step; this layer changes how many are surfaced, not what exists.
 */
import type { ModuleType } from '../allowed-values.js';
import { MODULE_TEMPLATES, type TemplateEntry } from '../templates.js';
import { listManifestTypes } from './module-manifests.js';

export interface ModulePreset {
  id: string;
  name: string;
  description: string;
  type: ModuleType;
  tags?: string[];
  spec: TemplateEntry['spec'];
}

function toPreset(t: TemplateEntry): ModulePreset {
  return { id: t.id, name: t.name, description: t.description, type: t.type as ModuleType, tags: t.tags, spec: t.spec };
}

/** Curated presets for a module type (capped). Used by the v2 "start from a preset" gallery. */
export function getPresetsForType(type: ModuleType, limit = 5): ModulePreset[] {
  return MODULE_TEMPLATES.filter((t) => t.type === type).slice(0, limit).map(toPreset);
}

/** Curated presets across every module type that has a v2 manifest. */
export function listV2Presets(limitPerType = 5): ModulePreset[] {
  return listManifestTypes().flatMap((type) => getPresetsForType(type, limitPerType));
}
