/**
 * Eval trend-gate tests (035 vocab-hardening — Phase 5b).
 *
 * The pure `evaluateTrend` core is the regression brake for the nightly flywheel.
 * Contracts:
 *   • A >10% drop below the trailing median FAILS.
 *   • A drop within 10% PASSES.
 *   • An improvement PASSES.
 *   • No / insufficient history PASSES with a notice (never blocks the first run).
 *   • JSONL parsing tolerates blank and corrupt lines.
 */
import { describe, it, expect } from 'vitest';
import { evaluateTrend, parseHistoryJsonl, MAX_DROP, MIN_HISTORY, type TrendPoint } from '../../scripts/eval-trend-gate';

const hist = (...scores: number[]): TrendPoint[] => scores.map((s, i) => ({ avgQualityScore: s, date: `2026-07-${String(i + 1).padStart(2, '0')}` }));

describe('evaluateTrend', () => {
  it('fails when the current score drops more than 10% below the trailing median', () => {
    const v = evaluateTrend({ avgQualityScore: 0.6 }, hist(0.8, 0.82, 0.79, 0.81));
    expect(v.pass).toBe(false);
    expect(v.enforced).toBe(true);
    expect(v.median).toBeCloseTo(0.805, 3);
    expect(v.drop).toBeGreaterThan(MAX_DROP);
  });

  it('passes when the drop is within the 10% tolerance', () => {
    // median 0.80, floor = 0.72; 0.75 is a 6.25% drop → within tolerance.
    const v = evaluateTrend({ avgQualityScore: 0.75 }, hist(0.80, 0.80, 0.80));
    expect(v.pass).toBe(true);
    expect(v.enforced).toBe(true);
    expect(v.drop).toBeLessThanOrEqual(MAX_DROP);
  });

  it('passes (and says so) when the current score improves on the median', () => {
    const v = evaluateTrend({ avgQualityScore: 0.9 }, hist(0.80, 0.81, 0.79));
    expect(v.pass).toBe(true);
    expect(v.reason).toMatch(/steady or improving/i);
  });

  it('passes with a notice when there is no history', () => {
    const v = evaluateTrend({ avgQualityScore: 0.42 }, []);
    expect(v.pass).toBe(true);
    expect(v.enforced).toBe(false);
    expect(v.median).toBeNull();
    expect(v.reason).toMatch(/no enforceable history/i);
  });

  it('passes with a notice when history is below the minimum', () => {
    const v = evaluateTrend({ avgQualityScore: 0.1 }, hist(0.9)); // 1 row < MIN_HISTORY
    expect(MIN_HISTORY).toBeGreaterThan(1);
    expect(v.pass).toBe(true);
    expect(v.enforced).toBe(false);
  });

  it('just above the floor → passes (only strictly-below the floor fails)', () => {
    // median 0.80, floor ≈ 0.72; 0.73 is an 8.75% drop → within tolerance.
    const v = evaluateTrend({ avgQualityScore: 0.73 }, hist(0.80, 0.80, 0.80));
    expect(v.pass).toBe(true);
  });

  it('a hair below the floor → fails', () => {
    const v = evaluateTrend({ avgQualityScore: 0.7199 }, hist(0.80, 0.80, 0.80));
    expect(v.pass).toBe(false);
  });
});

describe('parseHistoryJsonl', () => {
  it('parses valid lines and skips blank / corrupt / non-numeric ones', () => {
    const text = [
      JSON.stringify({ avgQualityScore: 0.8, date: 'a' }),
      '', // blank
      '   ', // whitespace
      'not json at all',
      JSON.stringify({ somethingElse: true }), // no avgQualityScore
      JSON.stringify({ avgQualityScore: 'x' }), // non-numeric
      JSON.stringify({ avgQualityScore: 0.75 }),
    ].join('\n');
    const points = parseHistoryJsonl(text);
    expect(points.map((p) => p.avgQualityScore)).toEqual([0.8, 0.75]);
  });

  it('returns [] for empty input', () => {
    expect(parseHistoryJsonl('')).toEqual([]);
  });
});
