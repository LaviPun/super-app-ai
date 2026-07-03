import { describe, it, expect } from 'vitest';
import { compileRecipe } from '~/services/recipes/compiler';
import { renderNativeSection, nativeSectionFilename, toSectionSlug } from '~/services/recipes/compiler/native-section';
import {
  isWritableThemePath,
  assertWritablePath,
  DisallowedThemePathError,
  validateSectionSchema,
  InvalidSectionSchemaError,
  toThemeGid,
} from '~/services/publish/theme-files.server';
import { evaluateNativeSectionEligibility } from '@superapp/core';
import type { RecipeSpec } from '@superapp/core';

type ThemeSectionSpec = Extract<RecipeSpec, { type: 'theme.section' }>;

/** A representative pricing-with-blocks theme.section (distinct block kinds + fields). */
const PRICING_SPEC = {
  type: 'theme.section',
  name: 'Pricing 3 Tier',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: {
    kind: 'pricing',
    activation: 'section',
    title: 'Choose your plan',
    subtitle: 'No hidden fees',
    fields: {},
    fieldSchema: { fields: [{ name: 'ctaLabel', label: 'CTA label', type: 'text' }] },
    blocks: [
      { kind: 'plan', text: 'Starter', fields: { price: '19', period: 'mo', recommended: false } },
      { kind: 'plan', text: 'Growth', fields: { price: '49', period: 'mo', recommended: true } },
      { kind: 'plan', text: 'Scale', fields: { price: '99', period: 'mo', recommended: false } },
      { kind: 'faq-item', text: 'Can I cancel anytime?' },
    ],
  },
  style: { colors: { text: '#111', background: '#fff' } },
} as unknown as ThemeSectionSpec;

describe('033 native-section compile', () => {
  it('native_section mode emits a THEME_ASSET_UPSERT with a sections/superapp-*.liquid key', () => {
    const out = compileRecipe(PRICING_SPEC, {
      kind: 'THEME',
      themeId: '123456',
      moduleId: 'mod-pricing-1',
      mode: 'native_section',
    });
    const upsert = out.ops.find((o) => o.kind === 'THEME_ASSET_UPSERT');
    expect(upsert).toBeDefined();
    const op = upsert as { kind: 'THEME_ASSET_UPSERT'; themeId: string; key: string; value: string };
    expect(op.key).toBe('sections/superapp-mod-pricing-1.liquid');
    expect(op.key).toMatch(/^sections\/superapp-[a-z0-9-]+\.liquid$/);
    expect(op.themeId).toBe('123456');
    // The native path does NOT emit a metaobject payload (mediums are exclusive).
    expect(out.themeModulePayload).toBeUndefined();
  });

  it('the {% schema %} value is valid JSON with blocks / presets / max_blocks:50', () => {
    const out = compileRecipe(PRICING_SPEC, {
      kind: 'THEME',
      themeId: '123456',
      moduleId: 'mod-pricing-1',
      mode: 'native_section',
    });
    const op = out.ops.find((o) => o.kind === 'THEME_ASSET_UPSERT') as { value: string };
    const schema = validateSectionSchema(op.value); // parses {% schema %} → object

    expect(schema.max_blocks).toBe(50);
    expect(typeof schema.name).toBe('string');

    // Distinct block kinds → distinct block type definitions (plan + faq-item).
    const blocks = schema.blocks as Array<{ type: string; settings: unknown[] }>;
    expect(blocks.map((b) => b.type).sort()).toEqual(['faq-item', 'plan']);

    // Presets carry the authored blocks so the designed layout appears on add.
    const presets = schema.presets as Array<{ blocks?: Array<{ type: string }> }>;
    expect(presets).toHaveLength(1);
    const presetBlocks = presets[0]?.blocks ?? [];
    expect(presetBlocks).toHaveLength(4);
    // Every preset block type is a declared block type.
    const declared = new Set(blocks.map((b) => b.type));
    for (const pb of presetBlocks) expect(declared.has(pb.type)).toBe(true);
  });

  it('renderNativeSection block loop drives on block.type and includes a scoped style block', () => {
    const { liquid, filename } = renderNativeSection(PRICING_SPEC, { slug: 'mod-pricing-1' });
    expect(filename).toBe('sections/superapp-mod-pricing-1.liquid');
    expect(liquid).toContain('{% schema %}');
    expect(liquid).toContain('{% endschema %}');
    expect(liquid).toContain('{%- for block in section.blocks -%}');
    expect(liquid).toContain("{%- when 'plan' -%}");
    // Style re-scoped to the native section selector (not [data-module-id]).
    expect(liquid).toContain('#shopify-section-{{ section.id }}');
    expect(liquid).not.toContain('[data-module-id');
    // theme-check invariant: an image render must carry width+height (no CLS).
    if (liquid.includes('<img')) {
      expect(liquid).toMatch(/<img[^>]*\bwidth=/);
      expect(liquid).toMatch(/<img[^>]*\bheight=/);
    }
  });

  it('034 #6 — threads enabled_on section groups + templates into the {% schema %}', () => {
    const spec = {
      ...PRICING_SPEC,
      placement: {
        enabled_on: { templates: ['product', 'metaobject/book'], groups: ['header', 'custom.overlay'] },
      },
    } as unknown as ThemeSectionSpec;
    const { liquid } = renderNativeSection(spec, { slug: 'mod-grp-1' });
    const schema = validateSectionSchema(liquid) as {
      enabled_on?: { templates?: string[]; groups?: string[] };
      disabled_on?: unknown;
    };
    expect(schema.enabled_on?.templates).toEqual(['product', 'metaobject/book']);
    expect(schema.enabled_on?.groups).toEqual(['header', 'custom.overlay']);
    expect(schema.disabled_on).toBeUndefined();
  });

  it('034 #6 — honors disabled_on (templates + groups) in the {% schema %}', () => {
    const spec = {
      ...PRICING_SPEC,
      placement: { disabled_on: { templates: ['cart'], groups: ['footer'] } },
    } as unknown as ThemeSectionSpec;
    const { liquid } = renderNativeSection(spec, { slug: 'mod-grp-2' });
    const schema = validateSectionSchema(liquid) as {
      enabled_on?: unknown;
      disabled_on?: { templates?: string[]; groups?: string[] };
    };
    expect(schema.disabled_on?.templates).toEqual(['cart']);
    expect(schema.disabled_on?.groups).toEqual(['footer']);
    expect(schema.enabled_on).toBeUndefined();
  });

  it('034 #6 — no placement → schema has neither enabled_on nor disabled_on (back-compat)', () => {
    const { liquid } = renderNativeSection(PRICING_SPEC, { slug: 'mod-grp-3' });
    const schema = validateSectionSchema(liquid) as Record<string, unknown>;
    expect(schema).not.toHaveProperty('enabled_on');
    expect(schema).not.toHaveProperty('disabled_on');
  });

  it('slug is filesystem/handle-safe (lowercase, [a-z0-9-], no unsafe chars)', () => {
    expect(toSectionSlug('My Fancy Module!! 2026')).toBe('my-fancy-module-2026');
    expect(nativeSectionFilename('WEIRD__name')).toBe('sections/superapp-weird-name.liquid');
    // Even a name-derived slug always matches the allow-list.
    const { filename } = renderNativeSection(
      { ...PRICING_SPEC, name: 'Über Sale $$$' },
      { slug: 'Über Sale $$$' },
    );
    expect(isWritableThemePath(filename)).toBe(true);
  });
});

describe('033 back-compat — app_block / default mode is byte-identical', () => {
  const target = { kind: 'THEME' as const, themeId: '789', moduleId: 'mod-bc-1' };

  it('default (no mode) and explicit app_block produce identical output, no THEME_ASSET op', () => {
    const defaultOut = compileRecipe(PRICING_SPEC, target);
    const appBlockOut = compileRecipe(PRICING_SPEC, { ...target, mode: 'app_block' });

    // No native op on either.
    expect(defaultOut.ops.some((o) => o.kind === 'THEME_ASSET_UPSERT')).toBe(false);
    expect(appBlockOut.ops.some((o) => o.kind === 'THEME_ASSET_UPSERT')).toBe(false);

    // Still the shipped metaobject path.
    expect(defaultOut.themeModulePayload).toBeDefined();
    expect(appBlockOut.themeModulePayload).toBeDefined();

    // Byte-identical: adding `mode` did not perturb the app-block compile.
    expect(JSON.stringify(appBlockOut)).toBe(JSON.stringify(defaultOut));
  });
});

describe('033 allow-list guard', () => {
  it('accepts sections/superapp-*.liquid and superapp assets only', () => {
    expect(isWritableThemePath('sections/superapp-hero.liquid')).toBe(true);
    expect(isWritableThemePath('assets/superapp-hero.css')).toBe(true);
    expect(isWritableThemePath('assets/superapp-hero.js')).toBe(true);
  });

  it('rejects any non-allowlisted key (templates, config, settings_data, layout, other snippets/sections)', () => {
    for (const bad of [
      'templates/index.json',
      'config/settings_data.json',
      'settings_data.json',
      'layout/theme.liquid',
      'locales/en.default.json',
      'snippets/header.liquid',
      'sections/header.liquid', // a real theme section — NOT superapp-owned
      'sections/superapp-hero.liquid.bak', // wrong extension
      'sections/superapp-../etc.liquid', // traversal attempt
    ]) {
      expect(isWritableThemePath(bad)).toBe(false);
      expect(() => assertWritablePath(bad)).toThrow(DisallowedThemePathError);
    }
  });

  it('validateSectionSchema rejects a section whose {% schema %} is not valid JSON', () => {
    const broken = `<div></div>\n{% schema %}\n{ not: valid json ]\n{% endschema %}`;
    expect(() => validateSectionSchema(broken)).toThrow(InvalidSectionSchemaError);
  });

  it('toThemeGid normalizes numeric ids and passes GIDs through', () => {
    expect(toThemeGid('123456')).toBe('gid://shopify/OnlineStoreTheme/123456');
    expect(toThemeGid('gid://shopify/OnlineStoreTheme/123456')).toBe('gid://shopify/OnlineStoreTheme/123456');
  });
});

describe('033 eligibility — honest needs_runtime until write_themes + exemption + flag', () => {
  it('needs_runtime when nothing is granted, naming the unmet gates', () => {
    const e = evaluateNativeSectionEligibility({ grantedScopes: [], exemptionGranted: false, flagEnabled: false });
    expect(e.status).toBe('needs_runtime');
    expect(e.unmet).toContain('write_themes');
    expect(e.unmet).toContain('exemption');
    expect(e.unmet).toContain('flag');
    expect(e.missingScopes).toContain('write_themes');
  });

  it('deployable ONLY when write_themes + exemption + flag all hold', () => {
    const e = evaluateNativeSectionEligibility({
      grantedScopes: ['write_themes', 'read_themes', 'write_metaobjects'],
      exemptionGranted: true,
      flagEnabled: true,
    });
    expect(e.status).toBe('deployable');
    expect(e.unmet).toEqual([]);
  });

  it('still needs_runtime if the exemption is missing even with scope + flag', () => {
    const e = evaluateNativeSectionEligibility({
      grantedScopes: ['write_themes', 'read_themes', 'write_metaobjects'],
      exemptionGranted: false,
      flagEnabled: true,
    });
    expect(e.status).toBe('needs_runtime');
    expect(e.unmet).toEqual(['exemption']);
  });
});
