import generated from './catalog.generated.json';
import type { Capability } from './capabilities.js';
import type { ModuleCategory, ModuleType } from './allowed-values.js';
import type { CatalogFamily } from './catalog.generator.js';

export type { CatalogFamily } from './catalog.generator.js';
export {
  CATALOG_FAMILIES,
  MODULE_TYPE_TO_TEMPLATE_KIND,
  DEFAULT_MAX_ENTRIES,
  generateCatalog,
  summarizeCatalog,
} from './catalog.generator.js';

/**
 * Catalog entry shape (doc 9.1). Loaded from `catalog.generated.json`.
 *
 * Required: `catalogId`, `family`, `category`, `requires`, `description`, `tags`.
 * Optional discriminators (`moduleType`, `templateKind`, `surface`, `intent`, `trigger`)
 * are populated based on the entry family. See {@link CATALOG_FAMILIES}.
 *
 * `defaults` is a free-form bag for downstream consumers (form pre-fills, AI hints).
 */
export type ModuleCatalogEntry = {
  catalogId: string;
  family: CatalogFamily;
  category: ModuleCategory;
  requires: Capability[];
  description: string;
  tags: string[];
  moduleType?: ModuleType;
  templateKind?: string;
  surface?: string;
  intent?: string;
  trigger?: string;
  /** Reserved discriminators for future expansion (config-driven taxonomy). */
  resource?: string;
  pattern?: string;
  condition?: string;
  action?: string;
  direction?: string;
  complexity?: string;
  defaults?: Record<string, unknown>;
};

export const MODULE_CATALOG: ModuleCatalogEntry[] = generated as ModuleCatalogEntry[];

/** Keys that {@link filterCatalog} accepts as exact-match filters. */
export const FILTERABLE_KEYS = [
  'family',
  'category',
  'moduleType',
  'templateKind',
  'surface',
  'intent',
  'trigger',
  'resource',
  'pattern',
  'condition',
  'action',
  'direction',
  'complexity',
] as const;
export type FilterableKey = (typeof FILTERABLE_KEYS)[number];

export type CatalogQuery = Partial<Pick<ModuleCatalogEntry, FilterableKey>> & {
  /** Optional tag filter — entry must include every tag listed. Case-sensitive exact match. */
  tags?: readonly string[];
};

export function findCatalogEntry(catalogId: string): ModuleCatalogEntry | undefined {
  return MODULE_CATALOG.find((e) => e.catalogId === catalogId);
}

/**
 * Returns catalog entries matching every defined field of `query`.
 * Tag filter (if provided) requires the entry to contain *all* listed tags.
 */
export function filterCatalog(query: CatalogQuery): ModuleCatalogEntry[] {
  const tagFilter = query.tags;
  return MODULE_CATALOG.filter((entry) => {
    for (const key of FILTERABLE_KEYS) {
      const expected = query[key];
      if (expected === undefined) continue;
      if (entry[key] !== expected) return false;
    }
    if (tagFilter && tagFilter.length > 0) {
      for (const t of tagFilter) {
        if (!entry.tags.includes(t)) return false;
      }
    }
    return true;
  });
}

/**
 * Returns the canonical type entry for a moduleType, or undefined if missing.
 * Equivalent to `findCatalogEntry('type.<moduleType>')`.
 */
export function findTypeEntry(moduleType: ModuleType): ModuleCatalogEntry | undefined {
  return findCatalogEntry(`type.${moduleType}`);
}
