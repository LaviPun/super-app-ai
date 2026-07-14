/**
 * SPIN-GAME LOGIC — node-side exercise of the two PURE functions that drive the
 * storefront spin-to-win wheel + scratch card. They live in the theme-extension
 * runtime source (`apps/web/theme-extension-src/superapp-modules.src.js`, a
 * browser IIFE that references `window`), so — exactly like the rule-engine
 * parity test — we extract the whole-code region strictly between the single-line
 * SPIN-GAME-LOGIC BEGIN/END markers and evaluate just that region. This pins the
 * shipped weighted-random pick + no-prize detection to explicit expectations
 * without a second copy of the algorithm.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_JS = join(
  __dirname,
  '../../../../apps/web/theme-extension-src/superapp-modules.src.js',
);

const BEGIN = 'SPIN-GAME-LOGIC:BEGIN';
const END = 'SPIN-GAME-LOGIC:END';

type PickFn = (weights: unknown[], rand?: () => number) => number;
type NoPrizeFn = (code: unknown, label: unknown) => boolean;

function extractGameLogic(): { pickWeightedIndex: PickFn; isNoPrize: NoPrizeFn } {
  const src = readFileSync(EXTENSION_JS, 'utf8');
  const lines = src.split('\n');
  const beginLine = lines.findIndex((l) => l.includes(BEGIN));
  const endLine = lines.findIndex((l) => l.includes(END));
  if (beginLine === -1 || endLine === -1 || endLine <= beginLine) {
    throw new Error(`Spin-game markers not found in ${EXTENSION_JS} — did the region get renamed?`);
  }
  const region = lines.slice(beginLine + 1, endLine).join('\n');
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${region}\n; return { pickWeightedIndex: pickWeightedIndex, isNoPrize: isNoPrize };`);
  return factory() as { pickWeightedIndex: PickFn; isNoPrize: NoPrizeFn };
}

describe('spin-to-win game logic (storefront runtime source)', () => {
  const { pickWeightedIndex, isNoPrize } = extractGameLogic();

  it('the marked region is present and extractable', () => {
    expect(typeof pickWeightedIndex).toBe('function');
    expect(typeof isNoPrize).toBe('function');
  });

  describe('pickWeightedIndex — weighted random over slice weights', () => {
    it('selects the wedge whose cumulative band contains the random target', () => {
      // weights [30,20,20,25,5] → total 100. band edges: 30,50,70,95,100.
      const weights = [30, 20, 20, 25, 5];
      expect(pickWeightedIndex(weights, () => 0)).toBe(0); // target 0 → band 0
      expect(pickWeightedIndex(weights, () => 0.299)).toBe(0); // 29.9 < 30
      expect(pickWeightedIndex(weights, () => 0.3)).toBe(1); // 30 → band 1
      expect(pickWeightedIndex(weights, () => 0.69)).toBe(2); // 69 → band 2 (50..70)
      expect(pickWeightedIndex(weights, () => 0.94)).toBe(3); // 94 → band 3 (70..95)
      expect(pickWeightedIndex(weights, () => 0.999)).toBe(4); // 99.9 → band 4 (95..100)
    });

    it('honors the weight distribution over many draws (heavier slice wins more)', () => {
      const weights = [90, 10];
      let zero = 0;
      const N = 4000;
      let seed = 0.12345;
      const prng = () => {
        // deterministic LCG so the test is stable
        seed = (seed * 9301 + 0.49297) % 1;
        return seed;
      };
      for (let i = 0; i < N; i++) if (pickWeightedIndex(weights, prng) === 0) zero++;
      // ~90% expected; assert a wide-but-meaningful band.
      expect(zero / N).toBeGreaterThan(0.8);
      expect(zero / N).toBeLessThan(0.98);
    });

    it('treats NaN / negative weights as zero', () => {
      // Only index 2 has positive weight → always chosen.
      expect(pickWeightedIndex([0, -5, 7, Number.NaN], () => 0)).toBe(2);
      expect(pickWeightedIndex([0, -5, 7, Number.NaN], () => 0.999)).toBe(2);
    });

    it('falls back to a uniform pick when every weight is zero/absent', () => {
      expect(pickWeightedIndex([0, 0, 0], () => 0)).toBe(0);
      expect(pickWeightedIndex([0, 0, 0], () => 0.99)).toBe(2);
      expect(pickWeightedIndex([undefined, undefined], () => 0.4)).toBe(0);
    });

    it('returns -1 for an empty slice set', () => {
      expect(pickWeightedIndex([], () => 0.5)).toBe(-1);
    });
  });

  describe('isNoPrize — honest no-prize detection', () => {
    it('is a no-prize when the coupon code is empty/whitespace', () => {
      expect(isNoPrize('', '10% off')).toBe(true);
      expect(isNoPrize('   ', 'anything')).toBe(true);
      expect(isNoPrize(null, 'anything')).toBe(true);
      expect(isNoPrize(undefined, 'anything')).toBe(true);
    });

    it('is a win when a real code is present and the label is not lose-ish', () => {
      expect(isNoPrize('SPIN10', '10% off')).toBe(false);
      expect(isNoPrize('FREESHIP', 'Free shipping')).toBe(false);
    });

    it('is a no-prize when the label reads lose-ish even if a stray code is present', () => {
      expect(isNoPrize('X', 'No luck — try again')).toBe(true);
      expect(isNoPrize('X', 'Better luck next time')).toBe(true);
      expect(isNoPrize('X', 'Sorry, no prize')).toBe(true);
    });
  });
});
