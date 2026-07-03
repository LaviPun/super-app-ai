import { describe, it, expect } from 'vitest';
import {
  getManifest,
  getPack,
  requirePack,
  listPackIds,
  listPacks,
  AudiencePackSchema,
  SchedulePackSchema,
  AdvancedCustomPackSchema,
  TriggerPackSchema,
  LayoutArchetypePackSchema,
  layoutArchetypePack,
  resolveTypeEnumOptions,
  resolveTypeEnumsForType,
  describeTypeEnums,
} from '../control-packs/index.js';
import type { TypeEnumField } from '../control-packs/index.js';

describe('control pack registry', () => {
  it('registers the control packs', () => {
    expect(listPackIds().sort()).toEqual([
      'advanced-custom', 'audience', 'behavior', 'content', 'countdown',
      'frequency-cap', 'layout-archetype', 'page-targeting', 'pricing', 'rule-engine', 'schedule', 'style', 'trigger',
    ]);
  });

  it('resolves packs by id and throws on unknown ids', () => {
    expect(getPack('trigger')?.namespace).toBe('trigger');
    expect(getPack('nope')).toBeUndefined();
    expect(() => requirePack('nope')).toThrow(/Unknown control pack/);
  });
});

describe('module manifests (surviving requirement-spec consumer)', () => {
  it('seeds theme.section with the full storefront pack set', () => {
    // getManifest survives the R2.4 prune because requirement-spec.server.ts
    // reads a type's pack set to derive its deterministic mustHaveControls list.
    expect(getManifest('theme.section')?.packs).toContain('trigger');
  });

  it('returns undefined for un-manifested types', () => {
    expect(getManifest('functions.discountRules')).toBeUndefined();
  });

  it('R2.1 — rule-engine is an ADVANCED pack on theme.section (opt-in)', () => {
    const manifest = getManifest('theme.section');
    expect(manifest?.advancedPacks).toContain('rule-engine');
    // Not a basic pack (must not surface at the basic tier).
    expect(manifest?.packs).not.toContain('rule-engine');
    expect(getPack('rule-engine')?.namespace).toBe('ruleEngine');
  });
});

describe('pack schemas (the surviving vocabulary)', () => {
  it('every registered pack parses {} without throwing', () => {
    for (const p of listPacks()) {
      const r = p.schema.safeParse({});
      if (r.success) expect(r.data).toBeTypeOf('object');
    }
  });

  it('AudiencePackSchema applies its defaults', () => {
    const parsed = AudiencePackSchema.parse({});
    expect(parsed).toMatchObject({ visitor: 'any', loggedInOnly: false, customerTags: [] });
  });

  it('SchedulePackSchema parses an empty object to an object', () => {
    expect(SchedulePackSchema.parse({})).toBeTypeOf('object');
  });

  it('AdvancedCustomPackSchema round-trips customHtml (live escape hatch)', () => {
    const parsed = AdvancedCustomPackSchema.parse({ customHtml: '<b>hi</b>' });
    expect(parsed.customHtml).toBe('<b>hi</b>');
  });

  it('TriggerPackSchema rejects an unknown mode', () => {
    expect(TriggerPackSchema.safeParse({ mode: 'NOPE' }).success).toBe(false);
  });
});

describe('R2.4 prune — dead composer/preset symbols are gone', () => {
  it('composeConfig / preset / hasManifest exports are removed from @superapp/core', async () => {
    const mod = (await import('../index.js')) as Record<string, unknown>;
    expect(mod.composeConfig).toBeUndefined();
    expect(mod.composeConfigSchema).toBeUndefined();
    expect(mod.getPresetsForType).toBeUndefined();
    expect(mod.listV2Presets).toBeUndefined();
    expect(mod.hasManifest).toBeUndefined();
    expect(mod.listManifestTypes).toBeUndefined();
  });
});

describe('R2.5 — per-type enum enabler (flat-pin)', () => {
  it('layout-archetype pack registers with a typeEnum on `layout`', () => {
    expect(getPack('layout-archetype')?.namespace).toBe('layout');
    expect(layoutArchetypePack.typeEnums?.layout?.kind).toBe('typeEnum');
  });

  it('LayoutArchetypePackSchema applies its default and accepts a value', () => {
    expect(LayoutArchetypePackSchema.parse({}).layout).toBe('stacked');
    expect(LayoutArchetypePackSchema.parse({ layout: 'grid', columns: 3 })).toMatchObject({
      layout: 'grid',
      columns: 3,
    });
  });

  it('resolves the theme.section option-set (the proof case)', () => {
    const resolved = resolveTypeEnumsForType('theme.section');
    const layout = resolved.find((r) => r.packNamespace === 'layout' && r.field === 'layout');
    expect(layout).toBeDefined();
    const values = layout!.options.map((o) => o.value);
    expect(values).toEqual(['stacked', 'grid', 'masonry', 'carousel']);
    // `grid` is legal for theme.section; `sidebar` is not in the option-set.
    expect(values).toContain('grid');
    expect(values).not.toContain('sidebar');
    expect(layout!.default).toBe('stacked');
  });

  it('per-type divergence — the SAME field resolves different options by type', () => {
    // theme.section supplies a catalog entry; a type with no entry falls back.
    const field = layoutArchetypePack.typeEnums?.layout;
    expect(field).toBeDefined();
    const themeSection = resolveTypeEnumOptions('theme.section', 'layout', field!).map((o) => o.value);
    // functions.discountRules has no catalog entry → the pack fallback set.
    const fallbackType = resolveTypeEnumOptions('functions.discountRules', 'layout', field!).map((o) => o.value);
    expect(themeSection).toContain('masonry'); // catalog-only value
    expect(fallbackType).not.toContain('masonry'); // fallback lacks it
    expect(fallbackType).toEqual(['stacked', 'grid', 'carousel']); // == pack fallback
    // Same pack, different option-sets → the whole point of R2.5.
    expect(themeSection).not.toEqual(fallbackType);
  });

  it('resolveTypeEnumOptions throws on an empty fallback', () => {
    const bad: TypeEnumField = { kind: 'typeEnum', enumKey: 'x', fallback: [] };
    expect(() => resolveTypeEnumOptions('functions.discountRules', 'nope', bad)).toThrow(/empty fallback/);
  });

  it('describeTypeEnums emits one closed-enum prose line for theme.section', () => {
    const lines = describeTypeEnums('theme.section');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('config.layout.layout');
    expect(lines[0]).toContain('stacked | grid | masonry | carousel');
  });

  it('types without a per-type enum resolve to nothing (schema/prose unchanged)', () => {
    expect(resolveTypeEnumsForType('functions.discountRules')).toEqual([]);
    expect(describeTypeEnums('functions.discountRules')).toEqual([]);
  });
});
