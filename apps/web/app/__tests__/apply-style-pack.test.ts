import { describe, it, expect } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { applyStylePackTokens } from '~/services/ai/apply-style-pack.server';
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

const DENSITY = ['airy', 'comfortable', 'compact'];
const IDIOMS = ['soft', 'glow', 'border', 'emboss'];
const DURATIONS = ['none', 'fast', 'base', 'slow'];
const EASINGS = ['standard', 'enter', 'exit', 'mechanical'];

function section(style: Record<string, unknown> = {}): RecipeSpec {
  return { type: 'theme.section', style } as unknown as RecipeSpec;
}
type Styled = { style: { spacing: Record<string, unknown>; shape: Record<string, unknown>; motion: Record<string, unknown> } };

describe('applyStylePackTokens', () => {
  it('fills density / elevation / motion tokens from the selected pack', () => {
    const r = applyStylePackTokens(section({}), palette, {}) as unknown as Styled;
    expect(DENSITY).toContain(r.style.spacing.density);
    expect(IDIOMS).toContain(r.style.shape.elevation);
    expect(DURATIONS).toContain(r.style.motion.duration);
    expect(EASINGS).toContain(r.style.motion.easing);
  });

  it('respects tokens the model already set', () => {
    const r = applyStylePackTokens(
      section({ spacing: { density: 'compact' }, shape: { elevation: 'glow' } }),
      palette,
      {},
    ) as unknown as Styled;
    expect(r.style.spacing.density).toBe('compact');
    expect(r.style.shape.elevation).toBe('glow');
  });

  it('no-ops for non-storefront types', () => {
    const r = applyStylePackTokens(
      { type: 'functions.discountRules', config: {} } as unknown as RecipeSpec,
      palette,
      {},
    ) as unknown as { style?: unknown };
    expect(r.style).toBeUndefined();
  });

  it('no-ops when palette source is none', () => {
    const r = applyStylePackTokens(section({}), { neutrals: [], source: 'none' }, {}) as unknown as {
      style: Record<string, unknown>;
    };
    expect(r.style.spacing).toBeUndefined();
  });
});
