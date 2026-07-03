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
} from '../control-packs/index.js';

describe('control pack registry', () => {
  it('registers the control packs', () => {
    expect(listPackIds().sort()).toEqual([
      'advanced-custom', 'audience', 'behavior', 'content', 'countdown',
      'frequency-cap', 'page-targeting', 'schedule', 'style', 'trigger',
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
