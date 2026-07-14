/**
 * V-B behavior-batch PURE LOGIC — node-side exercise of the B8 cross-module
 * coordination bus decision. `coordinationDecision` lives in the theme-extension
 * runtime source (a browser IIFE that references `window`), so — exactly like
 * spin-game-logic, the rule-engine parity test, and vocab-vb-logic — we extract the
 * whole-code region strictly between the single-line COORDINATION-BUS-LOGIC
 * BEGIN/END markers and evaluate just that region. This pins the shipped bus
 * priority/queue math to explicit expectations with no second copy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_JS = join(HERE, '../../theme-extension-src/superapp-modules.src.js');

const BEGIN = 'COORDINATION-BUS-LOGIC:BEGIN';
const END = 'COORDINATION-BUS-LOGIC:END';

type Cand = { channel?: string; priority?: number; suppressWhile?: string[] };
type Entry = { channel: string; priority: number };
type DecideFn = (cand: Cand, openEntries: Entry[], activeStates: string[]) => 'skip' | 'defer' | 'open';

function extractDecision(): DecideFn {
  const src = readFileSync(EXTENSION_JS, 'utf8');
  const lines = src.split('\n');
  const beginLine = lines.findIndex((l) => l.includes(BEGIN));
  const endLine = lines.findIndex((l) => l.includes(END));
  if (beginLine === -1 || endLine === -1 || endLine <= beginLine) {
    throw new Error(`COORDINATION-BUS-LOGIC markers not found in ${EXTENSION_JS} — did the region get renamed?`);
  }
  const region = lines.slice(beginLine + 1, endLine).join('\n');
  const factory = new Function(`${region}\n; return coordinationDecision;`);
  return factory() as DecideFn;
}

describe('V-B B8 coordination-bus decision (storefront source)', () => {
  const decide = extractDecision();

  it('the marked region is present and extractable', () => {
    expect(typeof decide).toBe('function');
  });

  it('opens when nothing is open and no state is active', () => {
    expect(decide({ channel: 'overlay', priority: 0 }, [], [])).toBe('open');
  });

  it('defers behind an equal-or-higher priority overlay on the same channel (double-popup fix)', () => {
    const open: Entry[] = [{ channel: 'overlay', priority: 0 }];
    expect(decide({ channel: 'overlay', priority: 0 }, open, ['overlay-open'])).toBe('defer');
    expect(decide({ channel: 'overlay', priority: 1 }, [{ channel: 'overlay', priority: 5 }], ['overlay-open'])).toBe('defer');
  });

  it('opens over a strictly-lower-priority overlay on the same channel', () => {
    expect(decide({ channel: 'overlay', priority: 5 }, [{ channel: 'overlay', priority: 2 }], ['overlay-open'])).toBe('open');
  });

  it('ignores open entries on a different channel', () => {
    expect(decide({ channel: 'overlay', priority: 0 }, [{ channel: 'bar', priority: 9 }], ['overlay-open'])).toBe('open');
  });

  it('skips when a suppressWhile state is active (regardless of open entries)', () => {
    expect(decide({ channel: 'overlay', priority: 9, suppressWhile: ['cart-drawer-open'] }, [], ['cart-drawer-open'])).toBe('skip');
    // skip takes precedence over defer
    expect(
      decide({ channel: 'overlay', priority: 0, suppressWhile: ['overlay-open'] }, [{ channel: 'overlay', priority: 0 }], ['overlay-open']),
    ).toBe('skip');
  });

  it('does not skip when the suppress state is not active', () => {
    expect(decide({ channel: 'overlay', priority: 0, suppressWhile: ['cart-drawer-open'] }, [], ['overlay-open'])).toBe('open');
  });

  it('defaults channel to overlay and priority to 0 when the candidate omits them', () => {
    expect(decide({}, [{ channel: 'overlay', priority: 0 }], ['overlay-open'])).toBe('defer');
    expect(decide({}, [{ channel: 'bar', priority: 0 }], [])).toBe('open');
  });
});
