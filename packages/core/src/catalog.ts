import generated from './catalog.generated.json';
import type { Capability } from './capabilities.js';
import type { ModuleCategory } from './recipe.js';

export type ModuleCatalogEntry = {
  catalogId: string;
  category: ModuleCategory;
  requires: Capability[];
  description: string;

  // optional metadata fields used for filtering
  templateKind?: string;
  surface?: string;
  intent?: string;
  trigger?: string;
  resource?: string;
  pattern?: string;
  condition?: string;
  action?: string;
  direction?: string;
  complexity?: string;
  defaults?: Record<string, unknown>;
};

export const MODULE_CATALOG: ModuleCatalogEntry[] = generated as ModuleCatalogEntry[];

export function findCatalogEntry(catalogId: string): ModuleCatalogEntry | undefined {
  return MODULE_CATALOG.find(e => e.catalogId === catalogId);
}

export function filterCatalog(query: Partial<Pick<ModuleCatalogEntry,
  'category'|'templateKind'|'surface'|'intent'|'trigger'|'resource'|'pattern'|'condition'|'action'|'direction'|'complexity'
>>): ModuleCatalogEntry[] {
  return MODULE_CATALOG.filter(e => {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if ((e as any)[k] !== v) return false;
    }
    return true;
  });
}
