/**
 * SERVER/CLIENT EVALUATOR PARITY — the anti-drift contract (plan top-risk X-3).
 *
 * The rule evaluator exists twice: the TS source of truth
 * (`rule-engine/evaluate.ts`, used by preview + tests) and a hand-ported vanilla
 * ES5 copy in `extensions/theme-app-extension/src/superapp-modules.src.js` (the
 * storefront runtime source — the shipped `assets/` copy is a MINIFIED build of
 * it, so the marker comments only exist in the source file). This test extracts
 * the vanilla `evaluateRules` from that source and asserts it returns the
 * IDENTICAL `{ verdict, resolvable }` as the TS `evaluateRuleEngine` for every
 * shared fixture. If the two implementations drift, this test fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateRuleEngine } from '../rule-engine/evaluate.js';
import { RULE_FIXTURES } from '../rule-engine/__fixtures__/rule-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_JS = join(
  __dirname,
  '../../../../extensions/theme-app-extension/src/superapp-modules.src.js',
);

const BEGIN = 'RULE-ENGINE-EVALUATOR:BEGIN';
const END = 'RULE-ENGINE-EVALUATOR:END';

/** Pull the marked evaluator region out of the extension IIFE. */
function extractClientEvaluator(): (rules: unknown, ctx: unknown) => unknown {
  const src = readFileSync(EXTENSION_JS, 'utf8');
  const lines = src.split('\n');
  const beginLine = lines.findIndex((l) => l.includes(BEGIN));
  const endLine = lines.findIndex((l) => l.includes(END));
  if (beginLine === -1 || endLine === -1 || endLine <= beginLine) {
    throw new Error(`Evaluator markers not found in ${EXTENSION_JS} — did the region get renamed?`);
  }
  // Whole lines strictly BETWEEN the two marker (comment) lines: the function
  // declarations ruleToNum/ruleToStr/ruleCompare/ruleEvalRow/evaluateRules.
  const region = lines.slice(beginLine + 1, endLine).join('\n');
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${region}\n; return evaluateRules;`);
  return factory() as (rules: unknown, ctx: unknown) => unknown;
}

describe('rule-engine server/client parity (X-3 anti-drift)', () => {
  const clientEvaluateRules = extractClientEvaluator();

  it('the vanilla evaluator region is present and extractable', () => {
    expect(typeof clientEvaluateRules).toBe('function');
  });

  for (const fx of RULE_FIXTURES) {
    it(`parity: ${fx.name}`, () => {
      const tsResult = evaluateRuleEngine(fx.rules, fx.ctx);
      const jsResult = clientEvaluateRules(fx.rules, fx.ctx);
      // Both must equal the fixture expectation AND each other.
      expect(tsResult).toEqual(fx.expected);
      expect(jsResult).toEqual(fx.expected);
      expect(jsResult).toEqual(tsResult);
    });
  }
});
