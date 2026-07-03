/**
 * Shared, pure rule-engine evaluator (R2.1). ONE canonical algorithm, imported by
 * the deterministic preview + tests (TS). The storefront client
 * (`extensions/theme-app-extension/assets/superapp-modules.js`) re-implements the
 * SAME tiny algorithm in vanilla ES5 (it cannot import TS at runtime); a fixture
 * PARITY test (`__tests__/rule-engine-parity.test.ts`) pins the two in lockstep —
 * the anti-drift contract (plan top-risk X-3).
 *
 * Hard safety guarantees, enforced here and mirrored in the client:
 *   - no `eval`, no `Function`, no user-supplied `RegExp`
 *   - operators are the fixed `CONDITION_OPERATORS` set (no `regex` operator exists)
 *   - an unresolved value never fabricates a verdict — it is neutral within its group
 *
 * If you change `compare`, `evalRow`, or `evaluateRuleEngine` here you MUST make the
 * identical change in `superapp-modules.js` and update the parity fixtures.
 */
import type { RuleCondition, RuleEnginePack } from '../control-packs/packs/rule-engine.pack.js';

/** Resolved primitive values keyed by `${object}.${attribute}`; `undefined` = unresolved. */
export interface RuleContext {
  values: Record<string, string | number | boolean | string[] | undefined>;
}

export type RowVerdict = 'pass' | 'fail' | 'unresolved';

/** Coerce a value to a finite number, or NaN if it can't be one. */
function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isNaN(n) ? NaN : n;
  }
  return NaN;
}

/** Lowercased string form of a scalar (for case-insensitive string ops). */
function toStr(v: unknown): string {
  if (v == null) return '';
  return String(v).toLowerCase();
}

/**
 * Compare `actual` (the resolved storefront value) against the row `expected` with
 * `operator`. No `eval`, no `RegExp`. `is_set`/`is_not_set` are handled by the
 * caller (they don't reach here). Array `actual` (e.g. product.tags) uses
 * membership for equality/contains; array `expected` uses membership too.
 */
export function compare(
  actual: string | number | boolean | string[],
  operator: RuleCondition['operator'],
  expected: RuleCondition['value'],
): boolean {
  const actualIsArray = Array.isArray(actual);
  const expectedIsArray = Array.isArray(expected);

  switch (operator) {
    case 'equal_to': {
      if (actualIsArray) {
        // membership: does the actual list contain the expected scalar (or any of an expected list)?
        const hay = (actual as string[]).map((s) => toStr(s));
        if (expectedIsArray) return (expected as string[]).some((e) => hay.includes(toStr(e)));
        return hay.includes(toStr(expected));
      }
      if (expectedIsArray) return (expected as string[]).some((e) => toStr(e) === toStr(actual));
      // numeric equality when both sides are number-ish; otherwise string equality.
      const an = toNum(actual);
      const en = toNum(expected);
      if (!Number.isNaN(an) && !Number.isNaN(en)) return an === en;
      return toStr(actual) === toStr(expected);
    }
    case 'not_equal_to':
      return !compare(actual, 'equal_to', expected);
    case 'greater_than':
      return toNum(actual) > toNum(expected);
    case 'less_than':
      return toNum(actual) < toNum(expected);
    case 'greater_than_or_equal':
      return toNum(actual) >= toNum(expected);
    case 'less_than_or_equal':
      return toNum(actual) <= toNum(expected);
    case 'contains': {
      if (actualIsArray) {
        const hay = (actual as string[]).map((s) => toStr(s));
        if (expectedIsArray) return (expected as string[]).some((e) => hay.includes(toStr(e)));
        return hay.includes(toStr(expected));
      }
      return toStr(actual).indexOf(toStr(expected)) !== -1;
    }
    case 'not_contains':
      return !compare(actual, 'contains', expected);
    case 'starts_with':
      return toStr(actual).indexOf(toStr(expected)) === 0;
    case 'ends_with': {
      const a = toStr(actual);
      const e = toStr(expected);
      return e.length <= a.length && a.lastIndexOf(e) === a.length - e.length;
    }
    default:
      return false;
  }
}

/** Evaluate one condition row against the resolved context. */
export function evalRow(row: RuleCondition, ctx: RuleContext): RowVerdict {
  const key = `${row.object}.${row.attribute}`;
  const actual = ctx.values[key];
  if (row.operator === 'is_set') {
    return actual != null && actual !== '' ? 'pass' : 'fail';
  }
  if (row.operator === 'is_not_set') {
    return actual == null || actual === '' ? 'pass' : 'fail';
  }
  if (actual === undefined) return 'unresolved';
  return compare(actual, row.operator, row.value) ? 'pass' : 'fail';
}

/**
 * Evaluate the whole pack. Returns the show/hide verdict AND whether every row was
 * resolvable in this context (`resolvable:false` => a caller with only server data
 * should DEFER to the client rather than trust the verdict).
 *
 * Semantics: within a group, unresolved rows are neutral (dropped); AND requires
 * every resolved row to pass, OR requires any resolved row to pass. A group with
 * ALL rows unresolved is neutral too (AND over empty = true, OR over empty = false)
 * — the plan's "no context → that row doesn't constrain" rule.
 */
export function evaluateRuleEngine(
  rules: RuleEnginePack,
  ctx: RuleContext,
): { verdict: 'show' | 'hide'; resolvable: boolean } {
  if (!rules.enabled || rules.groups.length === 0) {
    return { verdict: 'show', resolvable: true };
  }
  let anyUnresolved = false;
  const groupResults = rules.groups.map((g) => {
    const rows = g.conditions.map((r) => evalRow(r, ctx));
    if (rows.indexOf('unresolved') !== -1) anyUnresolved = true;
    const resolved = rows.filter((v) => v !== 'unresolved');
    if (g.logic === 'AND') return resolved.every((v) => v === 'pass');
    return resolved.some((v) => v === 'pass');
  });
  const matched =
    rules.logic === 'AND' ? groupResults.every(Boolean) : groupResults.some(Boolean);
  const show = rules.matchAction === 'SHOW' ? matched : !matched;
  return { verdict: show ? 'show' : 'hide', resolvable: !anyUnresolved };
}

/**
 * True when every row in the pack addresses a server-resolvable object (i.e. no
 * `behavioral` rows). Lets the compiler/Liquid decide whether the whole set can be
 * evaluated server-side (emit a hard verdict) or must `defer` to the client.
 */
export function isServerResolvable(rules: RuleEnginePack): boolean {
  if (!rules.enabled) return true;
  return rules.groups.every((g) => g.conditions.every((c) => c.object !== 'behavioral'));
}
