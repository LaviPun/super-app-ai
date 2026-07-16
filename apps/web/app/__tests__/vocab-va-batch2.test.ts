import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';
import { KIND_ARCHETYPE } from '~/services/recipes/kind-archetype';

/**
 * V-A batch 2 — A5 video hero, A6 UGC grid, A7 device pack, A8 size-chart modal.
 * Preview⇄storefront parity assertions (markup-only, following the batch-1 pattern)
 * plus storefront-Liquid / built-asset branch-token guards.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
// The renderer is a snippet FAMILY (dispatcher + kind-family sub-snippets); the
// A5/A6/A8 branch tokens live in the content-section sub-snippet. Scan the whole family.
const SRC_SNIPPETS = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets');
const CSS_SRC = join(REPO_ROOT, 'apps/web/theme-extension-src/superapp-modules.src.css');
const JS_SRC = join(REPO_ROOT, 'apps/web/theme-extension-src/superapp-modules.src.js');
const liquid = readdirSync(SRC_SNIPPETS)
  .filter((f) => /^superapp-module.*\.liquid$/.test(f))
  .sort()
  .map((f) => readFileSync(join(SRC_SNIPPETS, f), 'utf8'))
  .join('\n');
const css = readFileSync(CSS_SRC, 'utf8');
const js = readFileSync(JS_SRC, 'utf8');

const service = new PreviewService();
const render = (spec: RecipeSpec): string => {
  const r = service.render(spec);
  return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
};
const section = (
  kind: string,
  extra: {
    fields?: Record<string, unknown>;
    blocks?: Array<{ kind: string; text?: string; imageUrl?: string; url?: string; fields?: Record<string, unknown> }>;
    title?: string;
    subtitle?: string;
    device?: Record<string, unknown>;
    responsive?: Record<string, unknown>;
    layout?: string;
  },
): RecipeSpec =>
  ({
    type: 'theme.section',
    name: kind,
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind,
      activation: 'section',
      title: extra.title ?? 'Section',
      subtitle: extra.subtitle ?? '',
      layout: extra.layout ? { layout: extra.layout } : undefined,
      fields: extra.fields ?? {},
      blocks: extra.blocks ?? [],
      ...(extra.device ? { device: extra.device } : {}),
    },
    placement: { enabled_on: { templates: ['product'] } },
    ...(extra.responsive ? { style: { pack: 'luxe', responsive: extra.responsive } } : {}),
  }) as unknown as RecipeSpec;

// ── A5 — video hero ──────────────────────────────────────────────────────────
describe('A5 — video hero preview', () => {
  it('renders a poster + play glyph + scrim over an overlay hero (mp4)', () => {
    const out = render(
      section('hero', {
        title: 'Made to move',
        subtitle: 'The film',
        fields: { videoUrl: 'https://cdn.example.com/x.mp4', posterImageUrl: 'https://cdn.example.com/p.jpg', overlayOpacity: 0.5 },
        blocks: [{ kind: 'cta', text: 'Shop', url: 'https://example.com/x', fields: { style: 'primary' } }],
      }),
    );
    expect(out).toContain('superapp-hero--overlay');
    expect(out).toContain('superapp-hero__video--preview');
    expect(out).toContain('superapp-hero__play');
    expect(out).toContain('superapp-hero__scrim');
    expect(out).toContain('opacity:0.5');
  });

  it('a hero with no videoUrl renders the classic image/centered hero (byte-identical path)', () => {
    const out = render(section('hero', { title: 'Plain', subtitle: 'x', blocks: [{ kind: 'cta', text: 'Go', url: 'https://example.com/g' }] }));
    // (the class names live in the inlined pack sheet — assert the rendered elements are absent).
    expect(out).not.toContain('superapp-hero__video--preview');
    expect(out).not.toContain('superapp-hero__play');
  });
});

describe('A5 — storefront Liquid video-hero tokens', () => {
  it('parses YouTube ids server-side into a privacy-enhanced no-cookie embed', () => {
    expect(liquid).toContain('mod_cfg.fields.videoUrl');
    expect(liquid).toContain('youtube-nocookie.com/embed/');
    expect(liquid).toContain('player.vimeo.com/video/');
    expect(liquid).toContain('watch?v=');
  });
  it('mp4 renders a <video> hooked for the reduced-motion guard, with a scrim', () => {
    expect(liquid).toContain('data-sa-hero-video');
    expect(liquid).toContain('type="video/mp4"');
    expect(liquid).toContain('superapp-hero__scrim');
    expect(liquid).toContain('overlayOpacity');
  });
  it('the runtime pauses autoplaying hero videos under prefers-reduced-motion', () => {
    expect(js).toContain('guardReducedMotionVideos');
    expect(js).toContain('video[data-sa-hero-video][autoplay]');
  });
});

// ── A6 — UGC / Instagram grid ────────────────────────────────────────────────
describe('A6 — UGC grid', () => {
  const spec = section('ugc-grid', {
    title: 'As worn by you',
    layout: 'grid',
    blocks: [
      { kind: 'slide', text: 'Golden hour', imageUrl: 'https://cdn.example.com/1.jpg', fields: { caption: 'Golden hour', authorHandle: '@maya', productUrl: 'https://example.com/products/tote' } },
      { kind: 'slide', text: 'Everyday', imageUrl: 'https://cdn.example.com/2.jpg', fields: { caption: 'Everyday', authorHandle: 'devon' } },
    ],
  });

  it('ugc-grid maps to the gallery archetype', () => {
    expect(KIND_ARCHETYPE['ugc-grid']).toBe('gallery');
  });

  it('preview renders the overlay with caption, @handle and a Shop-this link', () => {
    const out = render(spec);
    expect(out).toContain('superapp-gallery--ugc');
    expect(out).toContain('superapp-gallery__ugc');
    expect(out).toContain('superapp-gallery__ugchandle');
    expect(out).toContain('@maya');
    expect(out).toContain('superapp-gallery__ugcshop');
    expect(out).toContain('Shop this');
  });

  it('storefront Liquid gates the UGC branch on kind and reads the new fields', () => {
    expect(liquid).toContain('superapp-gallery--ugc');
    expect(liquid).toContain("sa_kind_h == 'ugc-grid'");
    expect(liquid).toContain('fields.authorHandle');
    expect(liquid).toContain('fields.productUrl');
  });
});

// ── A7 — per-device visibility ───────────────────────────────────────────────
describe('A7 — device visibility (pack + style.responsive, one path)', () => {
  it('preview shows a device affordance note for hide flags + mobileColumns', () => {
    expect(render(section('hero', { device: { mobile: false }, blocks: [{ kind: 'cta', text: 'x', url: 'https://example.com/x' }] }))).toContain('Hidden on mobile');
    expect(render(section('ugc-grid', { layout: 'grid', device: { mobileColumns: 2 }, blocks: [{ kind: 'slide', imageUrl: 'https://cdn.example.com/1.jpg', fields: { caption: 'c' } }] }))).toContain('Mobile: 2 columns');
  });

  it('style.responsive.hideOnDesktop also produces the note (aliased to the same path)', () => {
    expect(render(section('hero', { responsive: { hideOnDesktop: true }, blocks: [{ kind: 'cta', text: 'x', url: 'https://example.com/x' }] }))).toContain('Hidden on desktop');
  });

  it('default/absent device emits no note element (back-compat)', () => {
    // (the .sa-device-note style always ships; assert the NOTE ELEMENT is absent).
    expect(render(section('hero', { blocks: [{ kind: 'cta', text: 'x', url: 'https://example.com/x' }] }))).not.toContain('<div class="sa-device-note"');
    expect(render(section('hero', { device: { desktop: true, mobile: true }, blocks: [{ kind: 'cta', text: 'x', url: 'https://example.com/x' }] }))).not.toContain('<div class="sa-device-note"');
  });

  it('storefront lowers BOTH config.device AND style.responsive into the module-root sa-hide-* classes', () => {
    expect(liquid).toContain('data-sa-device');
    expect(liquid).toContain('hide-desktop');
    expect(liquid).toContain('hide-mobile');
    expect(liquid).toContain('mod_cfg.device');
    expect(liquid).toContain('mod_sty.responsive.hideOnDesktop');
    expect(liquid).toContain('mod_sty.responsive.hideOnMobile');
    expect(liquid).toContain('--sa-mobile-cols');
    // The scope wrapper is still opened exactly once (device rides a data attribute).
    expect((liquid.match(/<div class="superapp-scope"/g) ?? []).length).toBe(1);
  });

  it('the CSS carries the two device utility queries + the mobileColumns override', () => {
    expect(css).toMatch(/\[data-sa-device~=['"]?hide-mobile['"]?\]/);
    expect(css).toMatch(/\[data-sa-device~=['"]?hide-desktop['"]?\]/);
    expect(css).toContain('--sa-mobile-cols');
  });
});

// ── A8 — size-chart modal ────────────────────────────────────────────────────
describe('A8 — size-chart modal', () => {
  const spec = section('size-chart', {
    title: 'Size guide',
    subtitle: 'Inches.',
    fields: { triggerLabel: 'Size guide', columns: ['Chest', 'Waist'] },
    blocks: [
      { kind: 'row', text: 'S', fields: { cells: ['35', '28'] } },
      { kind: 'row', text: 'M', fields: { cells: ['38', '31'] } },
    ],
  });

  it('preview renders a trigger mock + a static table with the row/cell data', () => {
    const out = render(spec);
    expect(out).toContain('superapp-sizechart__trigger');
    expect(out).toContain('>Size guide<');
    expect(out).toContain('<table class="superapp-sizechart__table"');
    expect(out).toContain('>Chest<');
    expect(out).toContain('>S<');
    expect(out).toContain('>35<');
  });

  it('honest no-op: a size-chart with no rows renders nothing (falls back to the tech note)', () => {
    const out = render(section('size-chart', { fields: { triggerLabel: 'Size guide' }, blocks: [] }));
    // (class names live in the inlined pack sheet — assert the rendered elements are absent).
    expect(out).not.toContain('<table class="superapp-sizechart__table"');
    expect(out).not.toContain('<button class="superapp-sizechart__trigger"');
  });

  it('storefront Liquid opens a modal reusing the popup chrome, gated on rows (honest no-op)', () => {
    expect(liquid).toContain("sa_kind_h == 'size-chart'");
    expect(liquid).toContain('data-sa-sizechart-open');
    expect(liquid).toContain('data-sa-sizechart-modal');
    expect(liquid).toContain('superapp-popup__panel');
    expect(liquid).toContain('fields.cells');
    // The table only renders when there is at least one row block.
    expect(liquid).toContain('sc_rows.size > 0');
  });

  it('the runtime wires the trigger→modal (focus trap + Escape) via initSizeCharts', () => {
    expect(js).toContain('initSizeCharts');
    expect(js).toContain('setupSizeChart');
    expect(js).toContain("querySelectorAll('[data-sa-sizechart]')");
  });
});
