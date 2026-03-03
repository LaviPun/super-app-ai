import { describe, it, expect } from 'vitest';
import { MODULE_CATALOG, findCatalogEntry } from '../catalog.js';

describe('catalog', () => {
  it('ships a large Day-1 catalog', () => {
    expect(MODULE_CATALOG.length).toBeGreaterThan(5000);
  });

  it('can find entries by id', () => {
    const any = MODULE_CATALOG[0]!;
    expect(findCatalogEntry(any.catalogId)?.catalogId).toBe(any.catalogId);
  });
});
