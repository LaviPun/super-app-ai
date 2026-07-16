/**
 * V-B renderer-batch (B9–B12) PURE LOGIC — node-side exercise of the three DOM-free
 * helpers that drive the storefront before/after slider, tabs, and mega-FAQ search.
 * They live in the theme-extension runtime source
 * (`apps/web/theme-extension-src/superapp-modules.src.js`, a browser IIFE that
 * references `window`), so — exactly like the spin-game + money-format logic — we
 * extract the whole-code region strictly between the single-line
 * RENDERER-BATCH-LOGIC BEGIN/END markers and evaluate just that region. This pins
 * the shipped clamp / tablist-keyboard / FAQ-filter math with no second copy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_JS = join(HERE, '../../theme-extension-src/superapp-modules.src.js');

const BEGIN = 'RENDERER-BATCH-LOGIC:BEGIN';
const END = 'RENDERER-BATCH-LOGIC:END';

type ClampFn = (v: unknown) => number;
type TabFn = (key: string, current: number, count: number) => number;
type FaqItem = { text?: string; category?: string };
type FaqFn = (item: FaqItem, query: unknown, category: unknown) => boolean;

function extractBatchLogic(): { clampPct: ClampFn; tabKeyIndex: TabFn; faqItemMatches: FaqFn } {
  const src = readFileSync(EXTENSION_JS, 'utf8');
  const lines = src.split('\n');
  const beginLine = lines.findIndex((l) => l.includes(BEGIN));
  const endLine = lines.findIndex((l) => l.includes(END));
  if (beginLine === -1 || endLine === -1 || endLine <= beginLine) {
    throw new Error(`RENDERER-BATCH-LOGIC markers not found in ${EXTENSION_JS} — did the region get renamed?`);
  }
  const region = lines.slice(beginLine + 1, endLine).join('\n');
  const factory = new Function(
    `${region}\n; return { clampPct: clampPct, tabKeyIndex: tabKeyIndex, faqItemMatches: faqItemMatches };`,
  );
  return factory() as { clampPct: ClampFn; tabKeyIndex: TabFn; faqItemMatches: FaqFn };
}

describe('V-B renderer-batch runtime logic (storefront source)', () => {
  const { clampPct, tabKeyIndex, faqItemMatches } = extractBatchLogic();

  it('the marked region is present and extractable', () => {
    expect(typeof clampPct).toBe('function');
    expect(typeof tabKeyIndex).toBe('function');
    expect(typeof faqItemMatches).toBe('function');
  });

  describe('clampPct — before/after reveal percentage', () => {
    it('clamps into [0,100]', () => {
      expect(clampPct(-20)).toBe(0);
      expect(clampPct(140)).toBe(100);
      expect(clampPct(37)).toBe(37);
      expect(clampPct('62')).toBe(62);
    });
    it('non-numeric falls back to the 50% midpoint', () => {
      expect(clampPct('nope')).toBe(50);
      expect(clampPct(undefined)).toBe(50);
      expect(clampPct(NaN)).toBe(50);
    });
  });

  describe('tabKeyIndex — ARIA tablist keyboard model', () => {
    it('arrows wrap forward and backward', () => {
      expect(tabKeyIndex('ArrowRight', 0, 3)).toBe(1);
      expect(tabKeyIndex('ArrowDown', 2, 3)).toBe(0); // wrap to start
      expect(tabKeyIndex('ArrowLeft', 0, 3)).toBe(2); // wrap to end
      expect(tabKeyIndex('ArrowUp', 1, 3)).toBe(0);
    });
    it('Home/End jump to the ends; other keys are a no-op', () => {
      expect(tabKeyIndex('Home', 2, 3)).toBe(0);
      expect(tabKeyIndex('End', 0, 3)).toBe(2);
      expect(tabKeyIndex('Enter', 1, 3)).toBe(1);
    });
    it('is safe for an empty tabset', () => {
      expect(tabKeyIndex('ArrowRight', 0, 0)).toBe(0);
    });
  });

  describe('faqItemMatches — client-side FAQ filter', () => {
    const item = { text: 'How do I start a return? Open Account and print the label.', category: 'Returns' };
    it('empty/blank query matches all', () => {
      expect(faqItemMatches(item, '', 'all')).toBe(true);
      expect(faqItemMatches(item, '   ', undefined)).toBe(true);
    });
    it('case-insensitive substring over question+answer text', () => {
      expect(faqItemMatches(item, 'RETURN', 'all')).toBe(true);
      expect(faqItemMatches(item, 'label', 'all')).toBe(true);
      expect(faqItemMatches(item, 'shipping', 'all')).toBe(false);
    });
    it('an active category constrains; "all"/blank does not', () => {
      expect(faqItemMatches(item, '', 'Returns')).toBe(true);
      expect(faqItemMatches(item, '', 'Shipping')).toBe(false);
      expect(faqItemMatches(item, 'return', 'Returns')).toBe(true);
      expect(faqItemMatches(item, 'return', 'Shipping')).toBe(false);
    });
  });
});
