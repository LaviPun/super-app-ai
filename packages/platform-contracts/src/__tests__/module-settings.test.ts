import { describe, expect, it } from 'vitest';
import {
  AdminFormSchema,
  FillMissingRequestSchema,
  SettingsDiffSchema,
  buildFillMissingDiff,
} from '../module-settings.js';

describe('module settings contracts', () => {
  it('parses a fill-missing request with defaults', () => {
    const req = FillMissingRequestSchema.parse({
      moduleId: 'm1',
      moduleType: 'theme.section',
    });
    expect(req.currentConfig).toEqual({});
    expect(req.expectedControls).toEqual([]);
  });

  it('SC-001: fill-missing never overwrites merchant-set fields', () => {
    const { config, diff } = buildFillMissingDiff({
      moduleType: 'theme.section',
      currentConfig: { heading: 'My heading', delaySeconds: undefined },
      merchantSetKeys: ['heading'],
      proposed: { heading: 'AI heading', delaySeconds: 5, ctaLabel: 'Shop' },
    });
    // merchant-set heading preserved
    expect(config.heading).toBe('My heading');
    // missing fields filled
    expect(config.delaySeconds).toBe(5);
    expect(config.ctaLabel).toBe('Shop');
    expect(diff.preservedKeys).toContain('heading');
    expect(diff.addedKeys).toEqual(expect.arrayContaining(['delaySeconds', 'ctaLabel']));
    expect(SettingsDiffSchema.parse(diff)).toBeTruthy();
  });

  it('preserves an already-present non-empty value even if not in merchantSetKeys', () => {
    const { config, diff } = buildFillMissingDiff({
      moduleType: 'theme.section',
      currentConfig: { ctaLabel: 'Buy now' },
      merchantSetKeys: [],
      proposed: { ctaLabel: 'Shop now' },
    });
    expect(config.ctaLabel).toBe('Buy now');
    expect(diff.preservedKeys).toContain('ctaLabel');
    expect(diff.addedKeys).not.toContain('ctaLabel');
  });

  it('validates an admin form (jsonSchema + uiSchema pairing)', () => {
    const form = AdminFormSchema.parse({
      jsonSchema: { type: 'object', properties: { heading: { type: 'string' } } },
      uiSchema: [{ path: 'heading', widget: 'text', label: 'Heading', tier: 'basic' }],
      defaults: { heading: '' },
    });
    expect(form.uiSchema[0]?.widget).toBe('text');
  });
});
