import { describe, it, expect } from 'vitest';
import { MODULE_TEMPLATES, type RecipeSpec, type DeployTarget } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import {
  checkCompiledLiquid,
  ThemeCheckFailedError,
  type CompiledLiquidFile,
} from '~/services/publish/theme-check.server';

/**
 * Pre-publish Theme Check gate (035, plan Phase 3b).
 *
 * Locks the three contract behaviors of the gate:
 *   1. good compiled Liquid passes with zero errors;
 *   2. known-bad Liquid (unclosed tag) and invalid `{% schema %}` JSON produce
 *      `error`-severity offenses (the block signal);
 *   3. a library/timeout failure degrades to `degraded: true` (never blocks);
 * plus the CI/eval coverage guarantee: EVERY native-compilable storefront
 * `theme.section` template compiles to Liquid that passes Theme Check with zero
 * errors (regression net against a template that would brick a merchant theme).
 */

type ThemeSectionSpec = Extract<RecipeSpec, { type: 'theme.section' }>;

/** A minimal, valid native section (hero + one CTA block). */
const GOOD_LIQUID: CompiledLiquidFile = {
  path: 'sections/superapp-good.liquid',
  content: `<div class="superapp-section">
  {%- if section.settings.title != blank -%}<h2 class="superapp-section__title">{{ section.settings.title | escape }}</h2>{%- endif -%}
  {%- for block in section.blocks -%}
    {%- case block.type -%}
      {%- when 'item' -%}<p ${'{{'} block.shopify_attributes ${'}}'}>{{ block.settings.text | escape }}</p>
      {%- else -%}<span></span>
    {%- endcase -%}
  {%- endfor -%}
</div>
{% schema %}
{
  "name": "Good",
  "settings": [{ "type": "text", "id": "title", "label": "Title" }],
  "blocks": [{ "type": "item", "name": "Item", "settings": [{ "type": "text", "id": "text", "label": "Text" }] }],
  "presets": [{ "name": "Good" }]
}
{% endschema %}`,
};

/** Unclosed `{% if %}` — a hard Liquid/HTML parse error. */
const BAD_LIQUID_UNCLOSED_TAG: CompiledLiquidFile = {
  path: 'sections/superapp-bad-tag.liquid',
  content: `<div>{% if section.settings.title != blank %}{{ section.settings.title | escape }}</div>
{% schema %}
{ "name": "BadTag", "settings": [], "presets": [{ "name": "BadTag" }] }
{% endschema %}`,
};

/** Valid Liquid, invalid `{% schema %}` — unknown setting type. */
const BAD_SCHEMA_JSON: CompiledLiquidFile = {
  path: 'sections/superapp-bad-schema.liquid',
  content: `<div>{{ section.settings.title | escape }}</div>
{% schema %}
{ "name": "BadSchema", "settings": [{ "type": "not_a_real_setting_type", "id": "x", "label": "X" }] }
{% endschema %}`,
};

describe('theme-check gate — fixtures', () => {
  it('passes a good compiled section with zero errors', async () => {
    const result = await checkCompiledLiquid([GOOD_LIQUID]);
    expect(result.degraded).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('flags an unclosed Liquid tag as an error', async () => {
    const result = await checkCompiledLiquid([BAD_LIQUID_UNCLOSED_TAG]);
    expect(result.degraded).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /syntax/i.test(e.check))).toBe(true);
    // The offense names the offending file so the merchant knows where to look.
    expect(result.errors.every((e) => e.file.includes('superapp-bad-tag.liquid'))).toBe(true);
  });

  it('flags invalid {% schema %} JSON as an error', async () => {
    const result = await checkCompiledLiquid([BAD_SCHEMA_JSON]);
    expect(result.degraded).toBe(false);
    expect(result.errors.some((e) => e.check === 'ValidSchema')).toBe(true);
  });

  it('degrades (never blocks) when the run cannot complete in time', async () => {
    // A 0ms timeout forces the degraded path deterministically without a real crash.
    const result = await checkCompiledLiquid([GOOD_LIQUID], { timeoutMs: 0 });
    expect(result.degraded).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.degradedReason).toBeTruthy();
  });

  it('is a no-op (not degraded) for an empty file list', async () => {
    const result = await checkCompiledLiquid([]);
    expect(result).toEqual({ errors: [], warnings: [], degraded: false });
  });

  it('ThemeCheckFailedError names the offense, file and line', () => {
    const err = new ThemeCheckFailedError([
      { check: 'LiquidHTMLSyntaxError', message: 'Unclosed tag', file: 'sections/superapp-x.liquid', line: 3, severity: 'error' },
    ]);
    expect(err.code).toBe('THEME_CHECK_FAILED');
    expect(err.message).toContain('LiquidHTMLSyntaxError');
    expect(err.message).toContain('sections/superapp-x.liquid');
    expect(err.message).toContain('line 3');
  });
});

describe('theme-check gate — template compile coverage', () => {
  // Every storefront theme.section that takes the native_section medium
  // (activation !== 'head'). Compiled through the real publish compile path
  // (compileRecipe → THEME_ASSET_UPSERT) so the assertion covers exactly the
  // bytes a publish would write to a merchant theme.
  const nativeSectionTemplates = MODULE_TEMPLATES.filter(
    (t) =>
      t.spec.type === 'theme.section' &&
      (t.spec.config as { activation?: string }).activation !== 'head',
  );

  it('has a non-trivial native-section library to cover', () => {
    expect(nativeSectionTemplates.length).toBeGreaterThan(90);
  });

  it(
    'compiles every native-section template to Liquid that passes Theme Check with zero errors',
    async () => {
      const files: CompiledLiquidFile[] = [];
      const compileFailures: Array<{ id: string; error: string }> = [];

      for (const t of nativeSectionTemplates) {
        const target: DeployTarget = {
          kind: 'THEME',
          themeId: '1',
          moduleId: t.id,
          mode: 'native_section',
        };
        try {
          const out = compileRecipe(t.spec as ThemeSectionSpec, target);
          const upsert = out.ops.find((o) => o.kind === 'THEME_ASSET_UPSERT') as
            | { kind: 'THEME_ASSET_UPSERT'; key: string; value: string }
            | undefined;
          if (!upsert) {
            compileFailures.push({ id: t.id, error: 'no THEME_ASSET_UPSERT op emitted' });
            continue;
          }
          files.push({ path: upsert.key, content: upsert.value });
        } catch (e) {
          compileFailures.push({ id: t.id, error: e instanceof Error ? e.message : String(e) });
        }
      }

      expect(
        compileFailures,
        `compile failed for: ${JSON.stringify(compileFailures.slice(0, 5))}`,
      ).toEqual([]);

      // The ENTIRE native-section library (~190 templates) is written into one
      // temp theme and validated in a single Theme Check pass — no sampling, so a
      // broken template of any kind is caught. Theme Check's fixed docs/JSON-schema
      // warmup dominates the runtime (~25-30s for the whole library; a 5-file
      // subset is already ~3.5s), so a per-kind sample would barely be faster while
      // losing content-driven coverage — hence we check them all. A generous
      // per-call timeout keeps it from degrading on a slow CI box.
      const result = await checkCompiledLiquid(files, { timeoutMs: 120_000 });
      expect(result.degraded, 'theme-check should run, not degrade, in CI').toBe(false);
      expect(
        result.errors,
        `Theme Check errors on compiled templates: ${JSON.stringify(result.errors.slice(0, 10), null, 2)}`,
      ).toEqual([]);
    },
    90_000,
  );
});
