import { describe, it, expect } from 'vitest';
import {
  composeConfig,
  composeConfigSchema,
  getManifest,
  hasManifest,
  getPack,
  requirePack,
  listPackIds,
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

describe('module manifests', () => {
  it('seeds theme.section with the full storefront pack set', () => {
    expect(hasManifest('theme.section')).toBe(true);
    expect(getManifest('theme.section')?.packs).toContain('trigger');
  });
});

describe('composeConfig', () => {
  it('builds a grouped config schema keyed by pack namespace', () => {
    const composed = composeConfig('theme.section', 'basic');
    expect(composed.packs.map((p) => p.id)).toEqual(['content', 'style', 'trigger', 'page-targeting', 'frequency-cap', 'countdown', 'behavior']);
    // Grouped namespaces present in the schema shape.
    const shapeKeys = Object.keys(composed.schema.shape).sort();
    expect(shapeKeys).toEqual(['behavior', 'content', 'countdown', 'frequencyCap', 'style', 'targeting', 'trigger']);
    // UI hints carried through for the form renderer.
    expect(composed.uiSchema.trigger?.groupLabel).toBe('Trigger & Timing');
  });

  it('validates a fully-specified popup config (default-only packs may be empty objects)', () => {
    const schema = composeConfigSchema('theme.section', 'basic');
    const parsed = schema.parse({
      content: {
        heading: 'Get 10% off',
        body: 'Join our list for a welcome discount.',
        primaryCta: { text: 'Sign up', url: 'https://example.com/signup' },
      },
      style: {},
      trigger: { mode: 'ON_EXIT_INTENT', delaySeconds: 0 },
      targeting: { pages: 'HOMEPAGE' },
      frequencyCap: {},
      countdown: {},
      behavior: {},
    }) as Record<string, any>;
    expect(parsed.content.heading).toBe('Get 10% off');
    expect(parsed.trigger.mode).toBe('ON_EXIT_INTENT');
    // Pack defaults applied.
    expect(parsed.targeting.templates).toEqual([]);
    expect(parsed.style.layout.mode).toBe('inline');
    expect(parsed.frequencyCap.frequency).toBe('ONCE_PER_DAY');
    expect(parsed.behavior.showCloseButton).toBe(true);
  });

  it('applies enum + url validation from the underlying pack schemas', () => {
    const schema = composeConfigSchema('theme.section', 'basic');
    const bad = schema.safeParse({
      content: { heading: 'x', primaryCta: { text: 'Go', url: 'not-a-url' } },
      trigger: { mode: 'NOT_A_TRIGGER' },
      targeting: {},
      frequencyCap: {},
      countdown: {},
      behavior: {},
    });
    expect(bad.success).toBe(false);
  });

  it('covers the same key controls as the legacy popup config', () => {
    // Coverage parity check: the composed popup exposes content, trigger,
    // targeting, and style — the dimensions the hand-written branch had.
    const composed = composeConfig('theme.section', 'basic');
    const namespaces = composed.packs.map((p) => p.namespace);
    for (const ns of ['content', 'trigger', 'targeting', 'style']) {
      expect(namespaces).toContain(ns);
    }
  });

  it('throws for module types without a v2 manifest', () => {
    expect(() => composeConfig('functions.discountRules')).toThrow(/No v2 manifest/);
  });

  it('advanced popup composes the full pack surface incl. escape hatch', () => {
    const basic = composeConfig('theme.section', 'basic').packs.map((p) => p.id);
    expect(basic).toEqual(['content', 'style', 'trigger', 'page-targeting', 'frequency-cap', 'countdown', 'behavior']);

    const advanced = composeConfig('theme.section', 'advanced').packs.map((p) => p.id);
    expect(advanced).toContain('audience');
    expect(advanced).toContain('schedule');
    expect(advanced).toContain('advanced-custom');

    // Advanced packs are optional at the basic tier (forward-compatible schema).
    const basicShape = composeConfig('theme.section', 'basic').schema.shape;
    expect('audience' in basicShape).toBe(false);
    const advShape = composeConfig('theme.section', 'advanced').schema.shape;
    expect('audience' in advShape).toBe(true);
    expect('advancedCustom' in advShape).toBe(true);
  });
});
