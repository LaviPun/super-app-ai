/**
 * V-B conversion-core PURE LOGIC — node-side exercise of the two DOM-free
 * functions that drive the storefront progress bar (B1): the Shopify money
 * formatter and the progress-state computation. They live in the theme-extension
 * runtime source (`apps/web/theme-extension-src/superapp-modules.src.js`, a
 * browser IIFE that references `window`), so — exactly like spin-game-logic and
 * the rule-engine parity test — we extract the whole-code region strictly between
 * the single-line MONEY-FMT BEGIN/END markers and evaluate just that region. This
 * pins the shipped money-format + progress math to explicit expectations with no
 * second copy of the algorithm.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_JS = join(HERE, '../../theme-extension-src/superapp-modules.src.js');

const BEGIN = 'MONEY-FMT:BEGIN';
const END = 'MONEY-FMT:END';

type MoneyFn = (cents: number, format: string) => string;
type Tier = { th: number };
type ProgressFn = (
  current: number,
  tiers: Tier[],
) => { pct: number; remaining: number; nextIndex: number; complete: boolean };

function extractVbLogic(): { moneyFmt: MoneyFn; progressCompute: ProgressFn } {
  const src = readFileSync(EXTENSION_JS, 'utf8');
  const lines = src.split('\n');
  const beginLine = lines.findIndex((l) => l.includes(BEGIN));
  const endLine = lines.findIndex((l) => l.includes(END));
  if (beginLine === -1 || endLine === -1 || endLine <= beginLine) {
    throw new Error(`MONEY-FMT markers not found in ${EXTENSION_JS} — did the region get renamed?`);
  }
  const region = lines.slice(beginLine + 1, endLine).join('\n');
  const factory = new Function(`${region}\n; return { moneyFmt: moneyFmt, progressCompute: progressCompute };`);
  return factory() as { moneyFmt: MoneyFn; progressCompute: ProgressFn };
}

describe('V-B conversion-core runtime logic (storefront source)', () => {
  const { moneyFmt, progressCompute } = extractVbLogic();

  it('the marked region is present and extractable', () => {
    expect(typeof moneyFmt).toBe('function');
    expect(typeof progressCompute).toBe('function');
  });

  describe('moneyFmt — standard Shopify money_format placeholders', () => {
    it('formats {{amount}} with 2 decimals + comma thousands', () => {
      expect(moneyFmt(2500, '${{amount}}')).toBe('$25.00');
      expect(moneyFmt(123456, '${{amount}}')).toBe('$1,234.56');
      expect(moneyFmt(0, '${{amount}}')).toBe('$0.00');
    });
    it('honors amount_no_decimals + the EU comma/space separators', () => {
      expect(moneyFmt(123456, '${{amount_no_decimals}}')).toBe('$1,235');
      expect(moneyFmt(123456, '{{amount_with_comma_separator}} €')).toBe('1.234,56 €');
      expect(moneyFmt(123456, '{{amount_no_decimals_with_comma_separator}} kr')).toBe('1.235 kr');
    });
    it('strips HTML in a custom money_format and keeps the surrounding text', () => {
      expect(moneyFmt(2500, '<span class="money">${{amount}}</span>')).toBe('$25.00');
    });
    it('is robust to a missing/blank format (defaults to ${{amount}})', () => {
      expect(moneyFmt(500, '')).toBe('$5.00');
    });
  });

  describe('progressCompute — fill %, remaining, next-tier, completeness', () => {
    const tiers = [{ th: 5000 }, { th: 10000 }, { th: 15000 }]; // cents

    it('reports the % toward the HIGHEST tier and the next unreached tier', () => {
      const st = progressCompute(3250, tiers); // 65% to the first tier (5000)
      expect(st.pct).toBeCloseTo((3250 / 15000) * 100, 5);
      expect(st.nextIndex).toBe(0);
      expect(st.remaining).toBe(5000 - 3250);
      expect(st.complete).toBe(false);
    });

    it('advances to the next tier once one is met', () => {
      const st = progressCompute(7000, tiers); // past tier 0, before tier 1
      expect(st.nextIndex).toBe(1);
      expect(st.remaining).toBe(10000 - 7000);
      expect(st.complete).toBe(false);
    });

    it('caps at 100% and marks complete when the last tier is reached', () => {
      const st = progressCompute(20000, tiers);
      expect(st.pct).toBe(100);
      expect(st.nextIndex).toBe(-1);
      expect(st.remaining).toBe(0);
      expect(st.complete).toBe(true);
    });

    it('handles a single-tier bar and an empty tier set', () => {
      expect(progressCompute(3000, [{ th: 6000 }])).toMatchObject({ nextIndex: 0, remaining: 3000, complete: false });
      expect(progressCompute(6000, [{ th: 6000 }])).toMatchObject({ pct: 100, complete: true });
      expect(progressCompute(10, [])).toMatchObject({ pct: 0, complete: true, nextIndex: -1 });
    });
  });
});
