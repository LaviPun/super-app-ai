import { describe, it, expect } from 'vitest';
import {
  MODULE_CATALOG,
  findCatalogEntry,
  findTypeEntry,
  filterCatalog,
  CATALOG_FAMILIES,
  MODULE_TYPE_TO_TEMPLATE_KIND,
  DEFAULT_MAX_ENTRIES,
  generateCatalog,
  summarizeCatalog,
} from '../catalog.js';
import {
  RECIPE_SPEC_TYPES,
  CATALOG_SURFACES,
  CATALOG_COMPONENTS,
  CATALOG_INTENTS,
  CATALOG_TRIGGERS,
} from '../allowed-values.js';

describe('catalog snapshot', () => {
  it('matches manifest cardinality formula (type + storefront base + storefront trigger)', () => {
    const triggerComponentsCount = 4; // popup, modal, drawer, toast (TRIGGER_COMPONENTS in catalog.generator.ts)
    const expectedTotal =
      RECIPE_SPEC_TYPES.length +
      CATALOG_SURFACES.length * CATALOG_COMPONENTS.length * CATALOG_INTENTS.length +
      CATALOG_SURFACES.length * CATALOG_INTENTS.length * CATALOG_TRIGGERS.length * triggerComponentsCount;
    expect(MODULE_CATALOG.length).toBe(expectedTotal);
  });

  it('ships a sizeable Day-1 catalog within the deterministic cap', () => {
    expect(MODULE_CATALOG.length).toBeGreaterThanOrEqual(1000);
    expect(MODULE_CATALOG.length).toBeLessThanOrEqual(DEFAULT_MAX_ENTRIES);
  });

  it('has unique catalogIds across all entries', () => {
    const ids = new Set<string>();
    for (const e of MODULE_CATALOG) ids.add(e.catalogId);
    expect(ids.size).toBe(MODULE_CATALOG.length);
  });

  it('every entry has the modernized required fields', () => {
    for (const e of MODULE_CATALOG) {
      expect(e.catalogId).toMatch(/^[a-zA-Z0-9_.\-]+$/);
      expect(CATALOG_FAMILIES).toContain(e.family);
      expect(typeof e.category).toBe('string');
      expect(Array.isArray(e.requires)).toBe(true);
      expect(typeof e.description).toBe('string');
      expect(Array.isArray(e.tags)).toBe(true);
      expect(e.tags.length).toBeGreaterThan(0);
    }
  });

  it('covers every RECIPE_SPEC_TYPES with a type.* entry and canonical templateKind', () => {
    for (const moduleType of RECIPE_SPEC_TYPES) {
      const entry = findTypeEntry(moduleType);
      expect(entry, `missing type entry for ${moduleType}`).toBeDefined();
      expect(entry?.catalogId).toBe(`type.${moduleType}`);
      expect(entry?.family).toBe('type');
      expect(entry?.moduleType).toBe(moduleType);
      expect(entry?.templateKind).toBe(MODULE_TYPE_TO_TEMPLATE_KIND[moduleType]);
    }
  });
});

describe('catalog query API', () => {
  it('findCatalogEntry returns by exact id', () => {
    const first = MODULE_CATALOG[0]!;
    expect(findCatalogEntry(first.catalogId)?.catalogId).toBe(first.catalogId);
    expect(findCatalogEntry('does.not.exist')).toBeUndefined();
  });

  it('filterCatalog narrows by category + templateKind', () => {
    const popups = filterCatalog({ category: 'STOREFRONT_UI', templateKind: 'popup' });
    expect(popups.length).toBeGreaterThan(0);
    for (const e of popups) {
      expect(e.category).toBe('STOREFRONT_UI');
      expect(e.templateKind).toBe('popup');
    }
  });

  it('filterCatalog narrows by surface + intent + trigger', () => {
    const exit = filterCatalog({ surface: 'product', intent: 'urgency', trigger: 'exit_intent' });
    expect(exit.length).toBeGreaterThan(0);
    for (const e of exit) {
      expect(e.surface).toBe('product');
      expect(e.intent).toBe('urgency');
      expect(e.trigger).toBe('exit_intent');
    }
  });

  it('filterCatalog supports tag filters (every tag must be present)', () => {
    const themePopupTags = filterCatalog({ tags: ['type', 'theme', 'popup'] });
    expect(themePopupTags.length).toBe(1);
    expect(themePopupTags[0]?.catalogId).toBe('type.theme.popup');

    const noisy = filterCatalog({ tags: ['type', 'theme', 'this-tag-does-not-exist'] });
    expect(noisy.length).toBe(0);
  });
});

describe('catalog generator', () => {
  it('is deterministic — two runs produce identical output', () => {
    const a = generateCatalog();
    const b = generateCatalog();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]?.catalogId).toBe(b[i]?.catalogId);
    }
  });

  it('throws by default when maxEntries would truncate the manifest', () => {
    expect(() => generateCatalog({ maxEntries: 10 })).toThrowError(/exceeds maxEntries/);
  });

  it('truncates deterministically when strictNoTruncate is disabled', () => {
    const truncated = generateCatalog({ maxEntries: 50, strictNoTruncate: false });
    expect(truncated.length).toBe(50);
  });

  it('summarizeCatalog reports family and templateKind distribution', () => {
    const summary = summarizeCatalog(MODULE_CATALOG);
    expect(summary.total).toBe(MODULE_CATALOG.length);
    expect(summary.byFamily.type).toBe(RECIPE_SPEC_TYPES.length);
    expect(summary.byFamily.storefront).toBeGreaterThan(0);
    expect(Object.keys(summary.byCategory).length).toBeGreaterThan(0);
    expect(Object.keys(summary.byTemplateKind).length).toBeGreaterThan(0);
  });
});
