import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, type RecipeSpec } from '@superapp/core';
import { renderNativeSection } from '~/services/recipes/compiler/native-section';
import { isWritableThemePath, validateSectionSchema } from '~/services/publish/theme-files.server';

type ThemeSectionSpec = Extract<RecipeSpec, { type: 'theme.section' }>;

/**
 * Per-archetype native-section compilation (section-archetype contract, R0/R6).
 *
 * `theme-native-section.test.ts` locks the compile plumbing (schema shape,
 * allow-list, placement, back-compat) — but only through ONE archetype
 * (`pricing`). This suite locks the 2026-07 archetype buildout itself:
 *  1. the whole native library compiles to valid, allow-listed section files;
 *  2. every kind alias routes to its archetype markup (same BEM roots the
 *     preview renderers emit), not the generic block dump;
 *  3. the BLOCK_REQUIRED fallback (block-driven archetype with no blocks →
 *     generic) holds;
 *  4. the archetype's structural CSS ships scoped to the native section root.
 */

/** Minimal native-section spec factory mirroring theme-native-section.test.ts. */
const section = (
  kind: string,
  blocks: Array<{ kind: string; text?: string; fields?: Record<string, unknown> }> = [],
  fields: Record<string, unknown> = {},
): ThemeSectionSpec =>
  ({
    type: 'theme.section',
    name: `Native ${kind}`,
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind,
      activation: 'section',
      title: 'Section title',
      subtitle: 'Section subtitle',
      fields,
      blocks,
    },
    style: { pack: 'luxe' },
  }) as unknown as ThemeSectionSpec;

describe('native-section archetype compilation (2026-07 template repair)', () => {
  it('compiles every native theme.section template to a valid, allow-listed section file', () => {
    const native = MODULE_TEMPLATES.filter(
      (t) =>
        t.spec.type === 'theme.section' &&
        (t.spec.config as { activation?: string }).activation === 'section',
    );
    // Guard: the native library must stay substantial or this suite is a no-op.
    expect(native.length, 'expected the native section library to be non-trivial').toBeGreaterThan(90);

    const failures: Array<{ id: string; error: string }> = [];
    for (const t of native) {
      try {
        const { liquid, filename, schema } = renderNativeSection(t.spec as ThemeSectionSpec, { slug: t.id });
        // The {% schema %} embedded in the Liquid must be valid section JSON.
        validateSectionSchema(liquid);
        // Filename is always inside the superapp-owned allow-list.
        expect(isWritableThemePath(filename)).toBe(true);
        // Every preset block type must be a declared block type (theme editor invariant).
        const declared = new Set(
          ((schema.blocks as Array<{ type: string }> | undefined) ?? []).map((b) => b.type),
        );
        const presets = (schema.presets as Array<{ blocks?: Array<{ type: string }> }>) ?? [];
        for (const p of presets) {
          for (const pb of p.blocks ?? []) {
            if (!declared.has(pb.type)) throw new Error(`preset block '${pb.type}' not declared`);
          }
        }
      } catch (e) {
        failures.push({ id: t.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    expect(
      failures,
      `renderNativeSection failed for: ${JSON.stringify(failures.slice(0, 5))}`,
    ).toEqual([]);
  });

  it('routes each kind alias to its archetype markup, not the generic block dump', () => {
    // kind (+ blocks that satisfy BLOCK_REQUIRED) → expected archetype root class.
    // Mirrors the preview-side KIND_CLASS matrix in template-preview-distinctness.
    const CASES: Array<{ kind: string; blocks: Array<{ kind: string; text?: string }>; cls: string }> = [
      { kind: 'hero', blocks: [{ kind: 'cta', text: 'Shop now' }], cls: 'superapp-hero' },
      { kind: 'collection-hero', blocks: [], cls: 'superapp-hero' },
      { kind: 'cta', blocks: [{ kind: 'cta', text: 'Go' }], cls: 'superapp-cta' },
      { kind: 'rich-text', blocks: [], cls: 'superapp-cta' },
      { kind: 'faq', blocks: [{ kind: 'faq-item', text: 'Can I cancel?' }], cls: 'superapp-faq' },
      { kind: 'accordion', blocks: [{ kind: 'faq-item', text: 'Q' }], cls: 'superapp-faq' },
      { kind: 'pricing', blocks: [{ kind: 'plan', text: 'Starter' }], cls: 'superapp-pricing' },
      { kind: 'comparison', blocks: [{ kind: 'plan', text: 'Pro' }], cls: 'superapp-pricing' },
      { kind: 'testimonials', blocks: [{ kind: 'review-card', text: 'Love it' }], cls: 'superapp-testimonial' },
      { kind: 'reviews', blocks: [{ kind: 'review-card', text: 'Great' }], cls: 'superapp-testimonial' },
      { kind: 'social-proof', blocks: [{ kind: 'review-card', text: 'Nice' }], cls: 'superapp-testimonial' },
      { kind: 'stats', blocks: [{ kind: 'stat', text: '10k+' }], cls: 'superapp-stats' },
      { kind: 'gallery', blocks: [{ kind: 'slide', text: 'Look 1' }], cls: 'superapp-gallery' },
      { kind: 'lookbook', blocks: [{ kind: 'slide', text: 'Look 2' }], cls: 'superapp-gallery' },
      { kind: 'newsletter', blocks: [], cls: 'superapp-newsletter' },
      { kind: 'trust-badges', blocks: [{ kind: 'badge', text: 'Secure' }], cls: 'superapp-trust' },
      { kind: 'logo-marquee', blocks: [{ kind: 'logo', text: 'Acme' }], cls: 'superapp-trust' },
      { kind: 'feature', blocks: [{ kind: 'feature', text: 'Fast' }], cls: 'superapp-feature' },
      { kind: '404', blocks: [], cls: 'superapp-launch' },
      { kind: 'coming-soon', blocks: [], cls: 'superapp-launch' },
      { kind: 'team', blocks: [{ kind: 'team-member', text: 'Ada' }], cls: 'superapp-team' },
      { kind: 'timeline', blocks: [{ kind: 'milestone', text: 'Founded' }], cls: 'superapp-timeline' },
      { kind: 'upsell', blocks: [{ kind: 'product-card', text: 'Add-on' }], cls: 'superapp-upsell' },
      { kind: 'contact', blocks: [{ kind: 'contact-method', text: 'Email us' }], cls: 'superapp-contactcard' },
      { kind: 'collection-story', blocks: [], cls: 'superapp-collection' },
      { kind: 'announcement-bar', blocks: [], cls: 'superapp-band' },
      { kind: 'countdown', blocks: [], cls: 'superapp-band' },
      { kind: 'json-ld', blocks: [], cls: 'superapp-techcard' },
    ];

    const missing: Array<{ kind: string; expected: string }> = [];
    for (const { kind, blocks, cls } of CASES) {
      const { liquid } = renderNativeSection(section(kind, blocks), { slug: `arch-${kind}` });
      if (!liquid.includes(`class="${cls}`)) missing.push({ kind, expected: cls });
    }
    expect(
      missing,
      `These kinds compiled to the generic scaffold instead of their archetype: ${JSON.stringify(missing)}`,
    ).toEqual([]);
  });

  it('falls back to the generic scaffold when a block-driven archetype has no blocks', () => {
    // faq is BLOCK_REQUIRED: without blocks it must not emit an empty archetype shell.
    const { liquid } = renderNativeSection(section('faq', []), { slug: 'arch-faq-empty' });
    expect(liquid).not.toContain('class="superapp-faq');
    expect(liquid).toContain('superapp-section__blocks');
    // And it still carries a valid schema.
    validateSectionSchema(liquid);
  });

  it('ships the archetype structural CSS scoped to the native section root', () => {
    const { liquid } = renderNativeSection(
      section('hero', [{ kind: 'cta', text: 'Shop now' }]),
      { slug: 'arch-hero-css' },
    );
    // Scoped to the native root selector, never the app-block module selector.
    expect(liquid).toContain('#shopify-section-{{ section.id }}');
    expect(liquid).not.toContain('[data-module-id');
    // The hero archetype's structural CSS is present inside the {% style %} block.
    const styleBlock = liquid.split('{%- style -%}')[1]?.split('{%- endstyle -%}')[0] ?? '';
    expect(styleBlock).toContain('.superapp-hero');
  });
});
