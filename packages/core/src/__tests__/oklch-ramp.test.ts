import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  hexToOklch,
  oklchToHex,
  generateSemanticRamp,
  contentColor,
  contrastRatio,
  relativeLuminance,
} from '../oklch-ramp.js';

const maxChannelDiff = (a: string, b: string): number => {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return Math.max(...ra.map((v, i) => Math.abs(v - (rb[i] ?? 0)))) * 255;
};

describe('oklch-ramp — sRGB ⇄ OKLCH round-trip', () => {
  for (const hex of ['#1f3a5f', '#2f80ed', '#0e9f6e', '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#808080']) {
    it(`round-trips ${hex} within 2/255`, () => {
      expect(maxChannelDiff(hex, oklchToHex(hexToOklch(hex)))).toBeLessThanOrEqual(2);
    });
  }

  it('contrastRatio(black, white) === 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('contentColor picks dark on light surfaces and white on dark', () => {
    expect(contentColor('#ffffff')).toBe('#111827');
    expect(contentColor('#000000')).toBe('#ffffff');
    // and it always returns the higher-contrast of the two candidates
    const c = contentColor('#2f80ed');
    expect(contrastRatio('#2f80ed', c)).toBe(
      Math.max(contrastRatio('#2f80ed', '#111827'), contrastRatio('#2f80ed', '#ffffff')),
    );
  });
});

describe('oklch-ramp — generateSemanticRamp', () => {
  const ramp = generateSemanticRamp('#1f3a5f');

  it('produces 12 steps', () => {
    expect(ramp.steps).toHaveLength(12);
    expect(ramp.steps.every((s) => /^#[0-9a-f]{6}$/.test(s))).toBe(true);
  });

  it('lightness is monotonically decreasing 1→12 (perceptually even ramp)', () => {
    const Ls = ramp.steps.map((s) => hexToOklch(s).L);
    for (let i = 1; i < 12; i++) expect(Ls[i] ?? 0).toBeLessThan(Ls[i - 1] ?? 1);
  });

  it('bg (1) is near-white, textHigh (12) is near-black', () => {
    expect(relativeLuminance(ramp.bg)).toBeGreaterThan(0.9);
    expect(relativeLuminance(ramp.textHigh)).toBeLessThan(0.15);
  });

  it('primary text (12) is legible on bg (1) — WCAG AA body', () => {
    expect(contrastRatio(ramp.textHigh, ramp.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('solidContent is legible on the solid (button-safe ≥ 3:1)', () => {
    expect(contrastRatio(ramp.solid, ramp.solidContent)).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic (same seed → identical ramp)', () => {
    expect(generateSemanticRamp('#1f3a5f')).toEqual(ramp);
  });

  it('handles a near-gray seed without throwing (faint tint)', () => {
    const g = generateSemanticRamp('#7a7a7a');
    expect(g.steps).toHaveLength(12);
    expect(relativeLuminance(g.bg)).toBeGreaterThan(relativeLuminance(g.textHigh));
  });
});
