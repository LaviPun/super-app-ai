import { describe, it, expect } from 'vitest';
import { MODULE_CATALOG, findCatalogEntry } from '../catalog.js';

describe('catalog', () => {
  it('ships a large Day-1 catalog (capped by generator limit)', () => {
    expect(MODULE_CATALOG.length).toBeGreaterThanOrEqual(500);
    expect(MODULE_CATALOG.length).toBeLessThanOrEqual(5000);
  });

  it('includes one entry per RecipeSpec type with moduleType', () => {
    const typeEntries = MODULE_CATALOG.filter(e => e.catalogId.startsWith('type.'));
    expect(typeEntries.length).toBeGreaterThanOrEqual(20);
    for (const e of typeEntries) {
      expect(e.moduleType).toBeDefined();
      expect(e.catalogId).toBe(`type.${e.moduleType}`);
    }
  });

  it('can find entries by id', () => {
    const any = MODULE_CATALOG[0]!;
    expect(findCatalogEntry(any.catalogId)?.catalogId).toBe(any.catalogId);
  });
});
