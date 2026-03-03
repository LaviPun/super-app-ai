import { MODULE_CATALOG, filterCatalog } from '@superapp/core';
import type { ModuleCategory } from '@superapp/core';

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
  const limit = opts.limit ?? 20;
  const query: Record<string, string | undefined> = {};
  if (opts.category) query.category = opts.category;
  if (opts.templateKind) query.templateKind = opts.templateKind;
  if (opts.intent) query.intent = opts.intent;
  if (opts.surface) query.surface = opts.surface;

  let entries = Object.keys(query).length > 0
    ? filterCatalog(query as any)
    : MODULE_CATALOG;

  entries = entries.slice(0, limit);

  if (entries.length === 0) {
    return 'No matching catalog entries found.';
  }

  const lines = entries.map(e =>
    `${e.catalogId}: ${e.description} (kind=${e.templateKind ?? '-'}, surface=${e.surface ?? '-'}, intent=${e.intent ?? '-'})`,
  );

  return `Relevant catalog entries for inspiration (${entries.length}):\n${lines.join('\n')}`;
}

/** Maps module type to its templateKind in the catalog for filtering. */
const TYPE_TO_TEMPLATE_KIND: Record<string, string> = {
  'theme.banner': 'banner',
  'theme.popup': 'popup',
  'theme.notificationBar': 'notification_bar',
  'proxy.widget': 'quick_view',
  'checkout.upsell': 'sticky_cta',
};

export function getCatalogDetailsForType(
  moduleType: string,
  intent?: string,
  surface?: string,
): string {
  const templateKind = TYPE_TO_TEMPLATE_KIND[moduleType];
  return getCatalogDetails({
    templateKind,
    intent,
    surface,
    limit: 15,
  });
}
