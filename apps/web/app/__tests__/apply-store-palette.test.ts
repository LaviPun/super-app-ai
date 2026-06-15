import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { applyStorePalette } from '~/services/theme/apply-store-palette.server';
import type { StorePalette } from '~/services/theme/theme-analyzer.service';

const palette: StorePalette = {
  primary: '#1773b0',
  background: '#fafafa',
  text: '#121212',
  button: '#1773b0',
  buttonText: '#ffffff',
  neutrals: ['#1773b0', '#121212', '#fafafa'],
  source: 'settings_data',
};

function section(colors: Record<string, unknown> = {}): RecipeSpec {
  return { type: 'theme.section', style: { colors } } as unknown as RecipeSpec;
}

describe('applyStorePalette', () => {
  it('fills optional colors that the model left unset', () => {
    const r = applyStorePalette(section({}), palette) as unknown as { style: { colors: Record<string, string> } };
    expect(r.style.colors.buttonBg).toBe('#1773b0');
    expect(r.style.colors.buttonText).toBe('#ffffff');
  });

  it('replaces schema-default text/background but keeps deliberate model choices', () => {
    const r = applyStorePalette(
      section({ text: '#111111', background: '#abcdef', buttonBg: '#ff0000' }),
      palette,
    ) as unknown as { style: { colors: Record<string, string> } };
    // default text => replaced from palette
    expect(r.style.colors.text).toBe('#121212');
    // non-default background => preserved
    expect(r.style.colors.background).toBe('#abcdef');
    // model-set buttonBg => preserved
    expect(r.style.colors.buttonBg).toBe('#ff0000');
  });

  it('creates the style.colors object when missing', () => {
    const r = applyStorePalette({ type: 'theme.section' } as unknown as RecipeSpec, palette) as unknown as {
      style: { colors: Record<string, string> };
    };
    expect(r.style.colors.buttonBg).toBe('#1773b0');
  });

  it('no-ops for non-storefront recipe types', () => {
    const fn = { type: 'functions.discountRules', config: {} } as unknown as RecipeSpec;
    const r = applyStorePalette(fn, palette) as unknown as { style?: unknown };
    expect(r.style).toBeUndefined();
  });

  it('no-ops when palette source is none', () => {
    const r = applyStorePalette(section({}), { neutrals: [], source: 'none' }) as unknown as {
      style: { colors: Record<string, string> };
    };
    expect(r.style.colors.buttonBg).toBeUndefined();
  });
});
