import { MODULE_CATALOG, filterCatalog, MODULE_TYPE_TO_TEMPLATE_KIND } from '@superapp/core';
import type { ModuleCategory, ModuleType, CatalogQuery } from '@superapp/core';

/**
 * Returns a token-safe subset of catalog entries matching the given criteria.
 * Used as on-demand context when the AI needs more inspiration during retries.
 * Max ~20 entries to keep token cost low (~300 tokens).
 */
export function getCatalogDetails(opts: {
  category?: ModuleCategory;
  templateKind?: string;
  intent?: string;
  surface?: string;
  limit?: number;
}): string {
  const limit = Math.max(1, Math.min(10, opts.limit ?? 8));
  const query: CatalogQuery = {};
  if (opts.category) query.category = opts.category;
  if (opts.templateKind) query.templateKind = opts.templateKind;
  if (opts.intent) query.intent = opts.intent;
  if (opts.surface) query.surface = opts.surface;

  let entries = Object.keys(query).length > 0 ? filterCatalog(query) : MODULE_CATALOG;

  entries = entries.slice(0, limit);

  if (entries.length === 0) {
    return 'No matching catalog entries found.';
  }

  const lines = entries.map((e) => {
    const shortDescription =
      e.description.length > 110 ? `${e.description.slice(0, 107)}...` : e.description;
    return `${e.catalogId}: ${shortDescription} (kind=${e.templateKind ?? '-'}, surface=${e.surface ?? '-'}, intent=${e.intent ?? '-'})`;
  });

  return `Relevant catalog entries for inspiration (${entries.length}):\n${lines.join('\n')}`;
}

export function getCatalogDetailsForType(
  moduleType: string,
  intent?: string,
  surface?: string,
): string {
  const templateKind = MODULE_TYPE_TO_TEMPLATE_KIND[moduleType as ModuleType];
  return getCatalogDetails({
    templateKind,
    intent,
    surface,
    limit: 8,
  });
}
