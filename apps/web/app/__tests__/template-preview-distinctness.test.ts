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

  /**
   * VISUAL distinctness — the stronger guard. Byte-distinctness (above) can be
   * satisfied by a one-line title change while the rest of the preview is a
   * generic scaffold that throws away the template's real `config.description`.
   * That was the actual reported bug ("all templates show the same preview").
   *
   * This asserts the template's real description text is actually rendered into
   * the preview HTML, so any future renderer that regresses to a generic scaffold
   * (dropping the description) fails here.
   *
   * Scope: only the surface renderers that are contracted to echo
   * `config.description`. Kinds whose renderers legitimately surface OTHER
   * distinguishing config instead (pixel events, workflow steps, function
   * simulation outcomes, segment/link/print/messaging/agentic specifics) are
   * excluded — asserting description there would be wrong, not stronger. In the
   * current library the in-scope, description-bearing templates are admin.action,
   * admin.block, and admin.discountUi.
   */
  it('renders each template’s real config.description into its preview (no generic scaffold)', () => {
    // Mirror preview.service.ts `esc()` exactly so we compare against what the
    // renderer emits (it entity-encodes & < > " ' and every char > 127).
    const escHtml = (input: string) => {
      let out = '';
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const code = input.charCodeAt(i);
        if (ch === '&') out += '&amp;';
        else if (ch === '<') out += '&lt;';
        else if (ch === '>') out += '&gt;';
        else if (ch === '"') out += '&quot;';
        else if (ch === "'") out += '&#039;';
        else if (code > 127) out += `&#${code};`;
        else out += ch;
      }
      return out;
    };

    // Renderers contracted to echo config.description into the preview body.
    const SHOWS_DESCRIPTION = new Set<string>([
      'admin.action',
      'admin.block',
      'platform.extensionBlueprint',
      'admin.discountUi',
      'checkout.block',
      'checkout.upsell',
      'postPurchase.offer',
    ]);
    // customerAccount.blocks only shows config.description in its no-blocks
    // fallback branch; when it has blocks the block copy is shown instead.
    const showsDescription = (spec: { type: string; config?: unknown }): boolean => {
      if (SHOWS_DESCRIPTION.has(spec.type)) return true;
      if (spec.type === 'customerAccount.blocks') {
        const blocks = (spec.config as { blocks?: unknown })?.blocks;
        return !(Array.isArray(blocks) && blocks.length > 0);
      }
      return false;
    };

    let covered = 0;
    const missing: { id: string; type: string; chunk: string }[] = [];
    for (const t of MODULE_TEMPLATES) {
      const spec = findTemplate(t.id)!.spec;
      const desc = (spec.config as { description?: unknown })?.description;
      if (typeof desc !== 'string' || desc.trim().length === 0) continue;
      if (!showsDescription(spec)) continue;
      covered++;
      const chunk = desc.trim().slice(0, 20);
      const html = render(spec);
      if (!html.includes(escHtml(chunk))) {
        missing.push({ id: t.id, type: spec.type, chunk });
      }
    }

    // Guard against the assertion silently becoming a no-op (e.g. if the library
    // stops carrying descriptions or the scope set drifts empty).
    expect(covered, 'expected a meaningful number of description-bearing templates in scope').toBeGreaterThan(50);
    expect(
      missing,
      `These templates dropped their config.description from the preview (generic-scaffold regression): ${JSON.stringify(missing.slice(0, 10))}`,
    ).toEqual([]);
  });
});
