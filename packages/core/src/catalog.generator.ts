import fs from 'node:fs';
import path from 'node:path';
import {
  CATALOG_SURFACES,
  CATALOG_INTENTS,
  CATALOG_COMPONENTS,
  CATALOG_TRIGGERS,
  RECIPE_SPEC_TYPES,
  MODULE_TYPE_TO_CATEGORY,
  MODULE_TYPE_DEFAULT_REQUIRES,
  MODULE_TYPE_TO_SURFACE,
} from './allowed-values.js';
import type { ModuleType } from './allowed-values.js';

export type CatalogEntry = {
  catalogId: string;
  category: string;
  requires: string[];
  description: string;
  moduleType?: ModuleType;
  templateKind?: string;
  surface?: string;
  intent?: string;
  trigger?: string;
  defaults?: Record<string, unknown>;
};

function makeId(...parts: string[]) {
  return parts.join('.');
}

/**
 * Generates catalog from Allowed Values Manifest (doc 9.2, Section 14).
 * 1) Storefront: surfaces × components × intents; trigger variants for popup/modal/drawer/toast.
 * 2) By type: one entry per RecipeSpec type (admin/function/integration/flow/checkout/etc.) for filterCatalog.
 */
export function generateCatalog(limit = 5000): CatalogEntry[] {
  const out: CatalogEntry[] = [];

  const typeTemplateKind: Record<string, string> = {
    'theme.effect': 'effect',
    'proxy.widget': 'widget',
  };
  for (const moduleType of RECIPE_SPEC_TYPES) {
    const category = MODULE_TYPE_TO_CATEGORY[moduleType];
    const requires = [...MODULE_TYPE_DEFAULT_REQUIRES[moduleType]];
    const surface = MODULE_TYPE_TO_SURFACE[moduleType];
    const templateKind = typeTemplateKind[moduleType];
    out.push({
      catalogId: makeId('type', moduleType),
      category,
      requires,
      description: `${moduleType} — ${category} on ${surface}`,
      moduleType,
      ...(templateKind && { templateKind }),
      defaults: { type: moduleType, surface },
    });
  }

  for (const s of CATALOG_SURFACES)
    for (const c of CATALOG_COMPONENTS)
      for (const i of CATALOG_INTENTS) {
        out.push({
          catalogId: makeId('storefront', c, i, s),
          category: 'STOREFRONT_UI',
          requires: ['THEME_ASSETS'],
          description: `${c} for ${i} on ${s}`,
          templateKind: c,
          surface: s,
          intent: i,
          defaults: { placement: s, intent: i },
        });
      }

  for (const s of CATALOG_SURFACES)
    for (const i of CATALOG_INTENTS)
      for (const t of CATALOG_TRIGGERS) {
        for (const c of ['popup', 'modal', 'drawer', 'toast'] as const) {
          if (!CATALOG_COMPONENTS.includes(c)) continue;
          out.push({
            catalogId: makeId('storefront', c, i, s, 'trigger', t),
            category: 'STOREFRONT_UI',
            requires: ['THEME_ASSETS'],
            description: `${c} (${t}) for ${i} on ${s}`,
            templateKind: c,
            surface: s,
            intent: i,
            trigger: t,
            defaults: { placement: s, intent: i, trigger: t },
          });
        }
      }

  return out.slice(0, limit);
}

if (process.argv[1]?.includes('catalog.generator')) {
  const generated = generateCatalog(5000);
  const fp = path.resolve(process.cwd(), 'src/catalog.generated.json');
  fs.writeFileSync(fp, JSON.stringify(generated, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Wrote ${generated.length} entries to ${fp}`);
}
