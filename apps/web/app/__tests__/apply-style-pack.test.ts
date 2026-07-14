import { describe, it, expect } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { applyStylePackTokens } from '~/services/ai/apply-style-pack.server';
import { resolveStorefrontPack, type PackSelection } from '~/services/ai/style-packs.server';
import type { StorePalette } from '~/services/theme/theme-analyzer.service';

const sel = (packId: PackSelection['packId'], confidence: number): PackSelection => ({
  packId,
  confidence,
  alternatives: [],
  reason: '',
});

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
type Styled = {
  style: { pack?: string; spacing: Record<string, unknown>; shape: Record<string, unknown>; motion: Record<string, unknown> };
};

describe('resolveStorefrontPack (6→4 collapse)', () => {
  it('maps each personality-explicit aesthetic pack to its own render pack', () => {
    expect(resolveStorefrontPack(sel('bold-dtc', 0.8))).toBe('bold');
    expect(resolveStorefrontPack(sel('playful-commerce', 0.8))).toBe('playful');
    expect(resolveStorefrontPack(sel('tech-utility', 0.8))).toBe('utility');
  });
  it('collapses the calm/clean/premium packs to luxe', () => {
    for (const p of ['apple-hig-clean', 'editorial-wellness', 'minimal-luxe'] as const) {
      expect(resolveStorefrontPack(sel(p, 0.8))).toBe('luxe');
    }
  });
  it('biases to luxe on low confidence for every personality-heavy pack', () => {
    expect(resolveStorefrontPack(sel('bold-dtc', 0.2))).toBe('luxe');
    expect(resolveStorefrontPack(sel('playful-commerce', 0.2))).toBe('luxe');
    expect(resolveStorefrontPack(sel('tech-utility', 0.2))).toBe('luxe');
  });
});

describe('applyStylePackTokens', () => {
  it('fills density / elevation / motion tokens from the selected pack', () => {
    const r = applyStylePackTokens(section({}), palette, {}) as unknown as Styled;
    expect(DENSITY).toContain(r.style.spacing.density);
    expect(IDIOMS).toContain(r.style.shape.elevation);
    expect(DURATIONS).toContain(r.style.motion.duration);
    expect(EASINGS).toContain(r.style.motion.easing);
  });

  it('resolves + sets the render grammar (style.pack ∈ the four render packs)', () => {
    const r = applyStylePackTokens(section({}), palette, {}) as unknown as Styled;
    expect(['luxe', 'bold', 'playful', 'utility']).toContain(r.style.pack);
  });

  it('respects a pack the model/merchant already chose', () => {
    const r = applyStylePackTokens(section({ pack: 'bold' }), palette, {}) as unknown as Styled;
    expect(r.style.pack).toBe('bold');
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
