import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';
import { KIND_ARCHETYPE } from '~/services/recipes/kind-archetype';

/**
 * V-B renderer batch (B9 before/after · B10 hotspots · B11 tabs · B12 mega-FAQ) —
 * preview⇄storefront parity. Markup-only assertions on the PreviewService output
 * plus token checks on the storefront Liquid family, following vocab-vb-preview.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
const SRC_SNIPPETS = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets');
const readModuleFamily = (dir: string): string =>
  readdirSync(dir)
    .filter((f) => /^superapp-module.*\.liquid$/.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');

const service = new PreviewService();
const render = (spec: RecipeSpec): string => {
  const r = service.render(spec);
  return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
};
const section = (kind: string, config: Record<string, unknown>): RecipeSpec =>
  ({
    type: 'theme.section',
    name: kind,
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: { kind, activation: 'section', title: '', subtitle: '', fields: {}, blocks: [], ...config },
    placement: { enabled_on: { templates: ['page'] } },
    style: { pack: 'luxe' },
  }) as unknown as RecipeSpec;

describe('kind→archetype mapping (renderer batch)', () => {
  it('before-after and hotspots map to gallery; tabs maps to faq', () => {
    expect(KIND_ARCHETYPE['before-after']).toBe('gallery');
    expect(KIND_ARCHETYPE['hotspots']).toBe('gallery');
    expect(KIND_ARCHETYPE['tabs']).toBe('faq');
  });
});

describe('B9 — before/after slider preview', () => {
  const spec = section('before-after', {
    title: 'See the difference',
    startPercent: 40,
    blocks: [
      { kind: 'image', text: 'Week 0', imageUrl: 'https://cdn.example.com/a.jpg', fields: { alt: 'before' } },
      { kind: 'image', text: 'Week 8', imageUrl: 'https://cdn.example.com/b.jpg', fields: { alt: 'after' } },
    ],
  });

  it('renders two comparison panes + a handle at startPercent, not a plain gallery grid', () => {
    const out = render(spec);
    expect(out).toContain('superapp-beforeafter');
    // markup-only count (the class also lives in the inlined pack stylesheet)
    expect((out.match(/<figure class="superapp-beforeafter__pane">/g) ?? []).length).toBe(2);
    expect(out).toContain('superapp-beforeafter__handle');
    expect(out).toContain('--sa-ba-pos:40%');
    expect(out).toContain('Week 0');
    expect(out).toContain('Week 8');
    expect(out).not.toContain('<div class="superapp-gallery__grid">');
  });
});

describe('B10 — shoppable hotspots preview', () => {
  const spec = section('hotspots', {
    title: 'Shop the room',
    imageUrl: 'https://cdn.example.com/room.jpg',
    blocks: [
      { kind: 'hotspot', text: 'Sofa', url: 'https://example.com/p/sofa', fields: { x: 30, y: 60, price: '$1,290' } },
      { kind: 'hotspot', text: 'Lamp', url: 'https://example.com/p/lamp', fields: { x: 70, y: 25, price: '$240' } },
    ],
  });

  it('renders a base image + numbered markers + a fallback link list', () => {
    const out = render(spec);
    expect(out).toContain('superapp-hotspots');
    expect((out.match(/<button class="superapp-hotspots__marker"/g) ?? []).length).toBe(2);
    expect(out).toContain('superapp-hotspots__list');
    expect(out).toContain('Sofa');
    expect(out).toContain('$1,290');
    // markers carry positional inline style
    expect(out).toMatch(/left:30%/);
  });
});

describe('B11 — tabs preview', () => {
  const spec = section('tabs', {
    title: 'The details',
    blocks: [
      { kind: 'tab', text: 'Description', fields: { body: 'A weightless moisturizer.' } },
      { kind: 'tab', text: 'Ingredients', fields: { body: 'Water, glycerin, squalane.' } },
      { kind: 'tab', text: 'Shipping', fields: { body: 'Free over $40.' } },
    ],
  });

  it('renders a tablist with the first tab selected + its panel open, not a plain accordion', () => {
    const out = render(spec);
    expect(out).toContain('superapp-tabgroup');
    expect(out).toContain('role="tablist"');
    expect((out.match(/<button class="superapp-tabs__tab"/g) ?? []).length).toBe(3);
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain('Description');
    expect(out).toContain('A weightless moisturizer.');
    expect(out).not.toContain('<details class="superapp-faq__item');
  });
});

describe('B12 — mega-FAQ search preview', () => {
  const spec = section('faq', {
    title: 'Help center',
    searchable: true,
    blocks: [
      { kind: 'faq-item', text: 'Where is my order?', fields: { category: 'Orders', answer: 'Track it.' } },
      { kind: 'faq-item', text: 'How do I return?', fields: { category: 'Returns', answer: 'Print the label.' } },
      { kind: 'faq-item', text: 'Is shipping free?', fields: { category: 'Shipping', answer: 'Over $50.' } },
      { kind: 'faq-item', text: 'How do I reset my password?', fields: { category: 'Account', answer: 'Use the link.' } },
    ],
  });

  it('renders the accordion PLUS a search input and category chips', () => {
    const out = render(spec);
    expect(out).toContain('superapp-faq__item'); // still the SSR accordion
    expect(out).toContain('superapp-faqsearch__input');
    expect(out).toContain('superapp-faqsearch__chips');
    // one chip per unique category + the "All" chip
    expect(out).toContain('>All<');
    expect(out).toContain('>Orders<');
    expect(out).toContain('>Returns<');
  });

  it('a non-searchable FAQ renders no search layer (byte-additive gate)', () => {
    const plain = section('faq', {
      title: 'FAQ',
      blocks: [
        { kind: 'faq-item', text: 'Q1', fields: { answer: 'A1' } },
        { kind: 'faq-item', text: 'Q2', fields: { answer: 'A2' } },
      ],
    });
    // markup-only token (the class also lives in the inlined pack stylesheet)
    expect(render(plain)).not.toContain('<input class="superapp-faqsearch__input"');
  });
});

describe('storefront Liquid family branch tokens present', () => {
  const liquid = readModuleFamily(SRC_SNIPPETS);

  it('B9 before-after dispatches its own gallery sub-branch with a drag handle hook', () => {
    expect(liquid).toContain("sa_kind_h == 'before-after'");
    expect(liquid).toContain('superapp-beforeafter');
    expect(liquid).toContain('data-start=');
  });

  it('B10 hotspots emits a JSON geometry config + a fallback link list', () => {
    expect(liquid).toContain("sa_kind_h == 'hotspots'");
    expect(liquid).toContain('data-sa-hotspots-config');
    expect(liquid).toContain('mod_cfg.blocks | json');
    expect(liquid).toContain('superapp-hotspots__list');
  });

  it('B11 tabs renders in-DOM panels (SEO fallback) under the faq archetype branch', () => {
    expect(liquid).toContain("sa_kind_h == 'tabs'");
    expect(liquid).toContain('superapp-tabgroup');
    expect(liquid).toContain("section_block.kind == 'tab'");
  });

  it('B12 mega-FAQ gates the search stub + category attr on config.searchable', () => {
    expect(liquid).toContain('mod_cfg.searchable');
    expect(liquid).toContain('superapp-faqsearch');
    expect(liquid).toContain('data-sa-faqcat');
  });

  it('the archetype dispatch lists the three new kinds (parity with KIND_ARCHETYPE)', () => {
    expect(liquid).toContain("'before-after'");
    expect(liquid).toContain("'hotspots'");
    // tabs added to the faq when-list
    expect(liquid).toMatch(/when 'faq', 'accordion', 'tabs'/);
  });
});
