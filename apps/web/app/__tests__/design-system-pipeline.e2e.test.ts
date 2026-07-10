/**
 * Design-system pipeline — END-TO-END REALITY TEST (no mocks on the pipeline).
 *
 * Proves the design system is executing code at every stage, for BOTH
 * generated modules and library templates:
 *
 *   raw recipe → applyCompositionRules → applyStorePalette →
 *   applyStylePackTokens → compileThemeSection (real compiler) →
 *   style_json (constructed exactly like MetaobjectService.upsertModuleObject)
 *   → PreviewService.render (real render path, real stylesheet).
 *
 * If any stage becomes a doc-only claim (pack not persisted, tokens not
 * compiled, wrapper not stamped, composition not clamped), this file fails.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { MODULE_TEMPLATES } from '@superapp/core';
import { applyCompositionRules } from '~/services/ai/apply-composition.server';
import { applyStylePackTokens } from '~/services/ai/apply-style-pack.server';
import { applyStorePalette } from '~/services/theme/apply-store-palette.server';
import { compileThemeSection } from '~/services/recipes/compiler/theme.section';
import { PreviewService } from '~/services/preview/preview.service';
import type { StorePalette, StoreTypography } from '~/services/theme/theme-analyzer.service';

const palette: StorePalette = {
  primary: '#b08d57',
  background: '#fbfaf7',
  text: '#1c1813',
  button: '#b08d57',
  buttonText: '#ffffff',
  neutrals: ['#b08d57', '#1c1813', '#fbfaf7'],
  source: 'settings_data',
};
const typography: StoreTypography = {};

/** Persisted metaobject field, constructed EXACTLY like MetaobjectService.upsertModuleObject. */
function styleJsonOf(payload: { style?: Record<string, unknown>; styleCss?: string }): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify({ ...(payload.style ?? {}), ...(payload.styleCss ? { css: payload.styleCss } : {}) }),
  );
}

describe('design-system pipeline e2e — generated module path', () => {
  // A deliberately sloppy "model output": orphaned grid, centered paragraph, no pack.
  const raw = {
    type: 'theme.section',
    name: 'Feature grid',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind: 'feature',
      activation: 'section',
      title: 'Why us',
      body: 'A very long centered paragraph that violates the §04 measure law. '.repeat(8),
      layout: { layout: 'grid', columns: 4 },
      blocks: [
        { kind: 'feature', text: 'Fast', fields: { heading: 'Fast' } },
        { kind: 'feature', text: 'Fair', fields: { heading: 'Fair' } },
      ],
      fields: {},
    },
    style: { typography: { align: 'center' } },
  } as unknown as RecipeSpec;

  const recipe = applyStylePackTokens(applyCompositionRules(raw), palette, typography);
  applyStorePalette(recipe, palette);

  it('post-passes are real: columns clamped, paragraph left-aligned, pack + seed set', () => {
    const r = recipe as unknown as {
      config: { layout: { columns: number } };
      style: { pack?: string; typography: { align: string }; colors?: { seed?: string } };
    };
    expect(r.config.layout.columns).toBe(2); // clamped to block count (§6.1)
    expect(r.style.typography.align).toBe('left'); // never center a paragraph (§04)
    expect(['luxe', 'bold']).toContain(r.style.pack); // resolved render pack
    expect(r.style.colors?.seed).toMatch(/^#[0-9a-f]{6}$/i); // merchant accent seeded
  });

  it('compiler + persistence are real: style_json carries pack, tokens, scoped css', () => {
    const out = compileThemeSection(recipe as Parameters<typeof compileThemeSection>[0], {
      kind: 'THEME',
      themeId: 't1',
      moduleId: 'e2e-mod-1',
    });
    const styleJson = styleJsonOf(out.themeModulePayload!);
    expect(['luxe', 'bold']).toContain(styleJson.pack); // ← what mod_sty.pack reads
    const css = String(styleJson.css);
    expect(css).toContain('[data-module-id="e2e-mod-1"]'); // scoping & identity (§3.3.4)
    expect(css).toContain('--sa-solid'); // OKLCH ramp from the seed
    // Columns persist via config_json (the Liquid renderer clamps + emits
    // --sa-cols at render time from mod_cfg.layout.columns) — assert the
    // clamped value actually reaches the persisted payload.
    const cfg = out.themeModulePayload!.config as { layout?: { columns?: number } };
    expect(cfg.layout?.columns).toBe(2);
  });

  it('preview renders the same recipe inside the real pack scope', () => {
    const out = new PreviewService().render(recipe);
    if (out.kind !== 'HTML') throw new Error('expected HTML');
    expect(out.html).toMatch(/data-sa-pack="(luxe|bold)"/);
    expect(out.html).toContain('--sa-display-size'); // real stylesheet inlined
  });
});

describe('design-system pipeline e2e — library template path', () => {
  const template = MODULE_TEMPLATES.find(
    (t) => (t.spec as { type?: string }).type === 'theme.section' && (t.spec as { config?: { kind?: string } }).config?.kind === 'hero',
  );

  it('a real library template compiles + persists through the same pipeline', () => {
    expect(template, 'no hero template in the library').toBeTruthy();
    const spec = structuredClone(template!.spec) as RecipeSpec;
    applyCompositionRules(spec);
    applyStylePackTokens(spec, palette, typography);
    const out = compileThemeSection(spec as Parameters<typeof compileThemeSection>[0], {
      kind: 'THEME',
      themeId: 't1',
      moduleId: 'e2e-tpl-1',
    });
    const styleJson = styleJsonOf(out.themeModulePayload!);
    expect(['luxe', 'bold']).toContain(styleJson.pack);
    expect(String(styleJson.css)).toContain('[data-module-id="e2e-tpl-1"]');
  });

  it('a real library template previews inside the pack scope with the real stylesheet', () => {
    const spec = structuredClone(template!.spec) as RecipeSpec & { style?: { pack?: string } };
    spec.style = { ...(spec.style ?? {}), pack: 'bold' };
    const out = new PreviewService().render(spec);
    if (out.kind !== 'HTML') throw new Error('expected HTML');
    expect(out.html).toContain('data-sa-pack="bold"');
    // Quote-tolerant: shipped CSS is minified (unquoted attribute selectors).
    expect(out.html).toMatch(/\.superapp-scope\[data-sa-pack=['"]?bold['"]?\]/);
  });
});
