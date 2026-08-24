import { describe, expect, it } from 'vitest';
import { INTEGRATION_TILES } from '~/components/admin/integration-tiles';

describe('Integrations Hub tile registry', () => {
  it('every tile has a unique id and a simple-icons slug', () => {
    const ids = INTEGRATION_TILES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of INTEGRATION_TILES) {
      expect(t.simpleIconSlug.length).toBeGreaterThan(0);
    }
  });

  it('categories are exactly AI_PROVIDER and OPS_SERVICE', () => {
    for (const t of INTEGRATION_TILES) {
      expect(['AI_PROVIDER', 'OPS_SERVICE']).toContain(t.category);
    }
  });
});
