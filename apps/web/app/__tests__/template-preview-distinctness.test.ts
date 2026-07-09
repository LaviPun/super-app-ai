import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, findTemplate } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

/**
 * Regression coverage for the "every template preview looks identical" bug.
 *
 * The merchant Templates gallery (`templates._index.tsx`) used to render a
 * static, category-keyed colored box + icon — so all N templates in a category
 * shared one thumbnail. The fix routes each template's `spec` through
 * `PreviewService` (via `/api/templates/:id/preview`), which must produce
 * distinct output per template. These tests lock the *data layer* of that fix:
 * if PreviewService ever regresses to emitting identical output for different
 * templates in a category, this fails.
 */
describe('template preview distinctness (gallery thumbnail bug)', () => {
  const service = new PreviewService();
  const render = (spec: Parameters<PreviewService['render']>[0]) => {
    const r = service.render(spec);
    return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
  };
  const hash = (s: string) => createHash('sha1').update(s).digest('hex');

  it('has a non-trivial template library to guard', () => {
    // Guards against the library going empty and the suite silently passing.
    expect(MODULE_TEMPLATES.length).toBeGreaterThan(100);
  });

  it('renders every template through PreviewService without throwing', () => {
    const failures: { id: string; error: string }[] = [];
    for (const t of MODULE_TEMPLATES) {
      const tpl = findTemplate(t.id);
      expect(tpl, `findTemplate('${t.id}') must resolve the gallery id`).toBeTruthy();
      try {
        render(tpl!.spec);
      } catch (e) {
        failures.push({ id: t.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    expect(failures, `PreviewService threw for: ${JSON.stringify(failures.slice(0, 5))}`).toEqual([]);
  });

  it('produces distinct preview output for different templates within the same category', () => {
    const byCategory = new Map<string, typeof MODULE_TEMPLATES>();
    for (const t of MODULE_TEMPLATES) {
      const arr = byCategory.get(t.category) ?? [];
      arr.push(t);
      byCategory.set(t.category, arr);
    }

    const collisions: { category: string; a: string; b: string }[] = [];
    for (const [category, templates] of byCategory) {
      if (templates.length < 2) continue;
      const seen = new Map<string, string>(); // hash -> first template id
      for (const t of templates) {
        const h = hash(render(findTemplate(t.id)!.spec));
        const prior = seen.get(h);
        if (prior) collisions.push({ category, a: prior, b: t.id });
        else seen.set(h, t.id);
      }
    }

    expect(
      collisions,
      `Templates in the same category rendered identical previews (the original bug): ${JSON.stringify(collisions.slice(0, 10))}`,
    ).toEqual([]);
  });
});
