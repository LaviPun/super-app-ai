import { describe, it, expect } from 'vitest';
import { MODULE_TEMPLATES, findTemplate, TEMPLATE_CATEGORIES } from '../templates.js';
import { RecipeSpecSchema } from '../recipe.js';
import { RECIPE_SPEC_TYPES } from '../allowed-values.js';

describe('MODULE_TEMPLATES integrity', () => {
  it('has at least 126 templates', () => {
    expect(MODULE_TEMPLATES.length).toBeGreaterThanOrEqual(126);
  });

  it('every template has matching type and spec.type', () => {
    for (const t of MODULE_TEMPLATES) {
      expect(t.type).toBe(t.spec.type);
    }
  });

  it('every template has matching category and spec.category', () => {
    for (const t of MODULE_TEMPLATES) {
      expect(t.category).toBe(t.spec.category);
    }
  });

  it('all template IDs are unique', () => {
    const ids = MODULE_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template spec validates against RecipeSpecSchema', () => {
    for (const t of MODULE_TEMPLATES) {
      const result = RecipeSpecSchema.safeParse(t.spec);
      expect(result.success, `Template ${t.id} (${t.type}) failed validation: ${JSON.stringify(result.success ? null : result.error.flatten())}`).toBe(true);
    }
  });

  it('covers all RecipeSpec type variants', () => {
    const coveredTypes = new Set(MODULE_TEMPLATES.map(t => t.type));
    for (const t of RECIPE_SPEC_TYPES) {
      expect(coveredTypes.has(t), `Missing template for type: ${t}`).toBe(true);
    }
  });

  it('every template category is in TEMPLATE_CATEGORIES', () => {
    for (const t of MODULE_TEMPLATES) {
      expect((TEMPLATE_CATEGORIES as readonly string[]).includes(t.category)).toBe(true);
    }
  });

  it('findTemplate returns the correct template by ID', () => {
    const uao = findTemplate('UAO-001');
    expect(uao).toBeDefined();
    expect(uao!.spec.type).toBe('theme.banner');

    const chk = findTemplate('CHK-037');
    expect(chk).toBeDefined();
    expect(chk!.spec.type).toBe('checkout.block');

    const ana = findTemplate('ANA-109');
    expect(ana).toBeDefined();
    expect(ana!.spec.type).toBe('analytics.pixel');
  });

  it('findTemplate returns undefined for unknown id', () => {
    expect(findTemplate('nonexistent')).toBeUndefined();
  });

  it('covers all 14 recipe library categories', () => {
    const ids = MODULE_TEMPLATES.map(t => t.id);
    const prefixes = ['UAO', 'DAP', 'BCT', 'CUX', 'CHK', 'TYO', 'ACC', 'SHP', 'PAY', 'TRU', 'SUP', 'LOY', 'ANA', 'OPS'];
    for (const prefix of prefixes) {
      const count = ids.filter(id => id.startsWith(prefix)).length;
      expect(count, `Category ${prefix} should have at least 9 templates`).toBeGreaterThanOrEqual(9);
    }
  });
});
