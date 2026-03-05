import generated from './catalog.generated.json';
import type { Capability } from './capabilities.js';
import type { ModuleCategory, ModuleType } from './allowed-values.js';

/** Catalog entry (doc 9.1). Loaded from catalog.generated.json. */
export type ModuleCatalogEntry = {
  catalogId: string;
  category: ModuleCategory;
  requires: Capability[];
  description: string;
  /** RecipeSpec type for filtering by module type. */
  moduleType?: ModuleType;
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
  'category'|'moduleType'|'templateKind'|'surface'|'intent'|'trigger'|'resource'|'pattern'|'condition'|'action'|'direction'|'complexity'
>>): ModuleCatalogEntry[] {
  return MODULE_CATALOG.filter(e => {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if ((e as any)[k] !== v) return false;
    }
    return true;
  });
}
