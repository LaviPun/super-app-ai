import type { RunContext, Expression, ValueOrTemplate } from '@superapp/core';

/**
 * Resolves a ValueOrTemplate against the current run context.
 *
 * - Literal values pass through unchanged.
 * - { $ref: "$.trigger.payload.order.id" } → drills into context.
 * - { $tmpl: "Order {{$.trigger.payload.name}}" } → string interpolation.
 * - Arrays/objects are resolved recursively.
 */
export function resolveValue(value: unknown, ctx: RunContext): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(v => resolveValue(v, ctx));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    if ('$ref' in obj && typeof obj.$ref === 'string') {
      return resolveContextPath(obj.$ref, ctx);
    }

    if ('$tmpl' in obj && typeof obj.$tmpl === 'string') {
      return resolveTemplate(obj.$tmpl, ctx);
    }

    // Embedded expression node — lets transforms compute values, e.g.
    // { discounted: { op: 'multiply', args: [{ $ref: ... }, 0.9] } }.
    if ('op' in obj && typeof obj.op === 'string') {
      return evalNode(obj as Expression, ctx);
    }

    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      resolved[k] = resolveValue(v, ctx);
    }
    return resolved;
  }

  return value;
}

/**
 * Resolve a context path like "$.trigger.payload.order.total_price" against RunContext.
 */
function resolveContextPath(path: string, ctx: RunContext): unknown {
  // Array indexing: "line_items[1].qty" → "line_items.1.qty".
  const segments = path
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let current: unknown = ctx;

  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }

  return current;
}

/**
 * Resolve a template string like "Order {{$.trigger.payload.name}} created"
 * by replacing {{...}} placeholders with resolved context values.
 */
function resolveTemplate(template: string, ctx: RunContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const val = resolveContextPath(path.trim(), ctx);
    return val != null ? String(val) : '';
  });
}

/**
 * Evaluate an Expression tree against the run context as a boolean condition.
 * Delegates to `evalNode` (the value-returning evaluator) and coerces.
 */
export function evalExpression(expr: Expression, ctx: RunContext): boolean {
  return toBool(evalNode(expr, ctx));
}

/**
 * Evaluate an Expression tree to a VALUE (docs/flow-automation.md §expressions):
 * boolean ops return booleans; arithmetic/string/array/date/util ops return
 * their computed value. Safe — no eval; unknown ops resolve to undefined.
 */
export function evalNode(expr: Expression, ctx: RunContext): unknown {
  const args = (expr.args ?? []).map(a => {
    if (typeof a === 'object' && a !== null && 'op' in a) {
      return evalNode(a as Expression, ctx);
    }
    return resolveValue(a, ctx);
  });

  switch (expr.op) {
    // ── arithmetic ──
    case 'add':
      return args.reduce<number>((s, a) => s + toNumber(a), 0);
    case 'subtract':
      return toNumber(args[0]) - toNumber(args[1]);
    case 'multiply':
      return args.reduce<number>((p, a) => p * toNumber(a), 1);
    case 'divide': {
      const divisor = toNumber(args[1]);
      return divisor === 0 ? 0 : toNumber(args[0]) / divisor; // safe ÷0
    }
    case 'modulo': {
      const mod = toNumber(args[1]);
      return mod === 0 ? 0 : toNumber(args[0]) % mod;
    }
    case 'round': {
      const digits = args.length > 1 ? toNumber(args[1]) : 0;
      const factor = 10 ** digits;
      return Math.round(toNumber(args[0]) * factor) / factor;
    }
    case 'abs':
      return Math.abs(toNumber(args[0]));
    case 'min':
      return Math.min(...args.map(toNumber));
    case 'max':
      return Math.max(...args.map(toNumber));
    case 'sum': {
      const items = Array.isArray(args[0]) ? args[0] : args;
      return items.reduce<number>((s, a) => s + toNumber(a), 0);
    }

    // ── string ──
    case 'concat':
      return args.map(a => (a == null ? '' : String(a))).join('');
    case 'upper':
      return String(args[0] ?? '').toUpperCase();
    case 'lower':
      return String(args[0] ?? '').toLowerCase();
    case 'trim':
      return String(args[0] ?? '').trim();
    case 'replace':
      return String(args[0] ?? '').split(String(args[1] ?? '')).join(String(args[2] ?? ''));
    case 'split':
      return String(args[0] ?? '').split(String(args[1] ?? ','));

    // ── array ──
    case 'length':
      return Array.isArray(args[0]) ? args[0].length : String(args[0] ?? '').length;
    case 'first':
      return Array.isArray(args[0]) ? args[0][0] : undefined;
    case 'last':
      return Array.isArray(args[0]) ? args[0][args[0].length - 1] : undefined;
    case 'join':
      return Array.isArray(args[0]) ? args[0].join(String(args[1] ?? ',')) : '';
    case 'includes': {
      const hay = args[0];
      if (Array.isArray(hay)) return hay.some(h => looseEqual(h, args[1]));
      if (typeof hay === 'string') return hay.includes(String(args[1] ?? ''));
      return false;
    }
    case 'at': {
      if (!Array.isArray(args[0])) return undefined;
      const arr = args[0];
      const idx = toNumber(args[1]);
      return arr[idx < 0 ? arr.length + idx : idx];
    }

    // ── date ──
    case 'addDays': {
      const base = new Date(String(args[0] ?? ''));
      if (isNaN(base.getTime())) return undefined;
      return new Date(base.getTime() + toNumber(args[1]) * 86_400_000).toISOString();
    }
    case 'diffDays': {
      const a = new Date(String(args[0] ?? ''));
      const b = new Date(String(args[1] ?? ''));
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return undefined;
      return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
    }
    case 'isAfter': {
      const a = new Date(String(args[0] ?? ''));
      const b = new Date(String(args[1] ?? ''));
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
      return a.getTime() > b.getTime();
    }

    // ── util ──
    case 'coalesce':
      return args.find(a => a !== null && a !== undefined);
    case 'if':
      return toBool(args[0]) ? args[1] : args[2];
    case 'and':
      return args.every(a => toBool(a));

    case 'or':
      return args.some(a => toBool(a));

    case 'not':
      return !toBool(args[0]);

    case 'eq':
      return looseEqual(args[0], args[1]);

    case 'neq':
      return !looseEqual(args[0], args[1]);

    case 'gt':
      return toNumber(args[0]) > toNumber(args[1]);

    case 'gte':
      return toNumber(args[0]) >= toNumber(args[1]);

    case 'lt':
      return toNumber(args[0]) < toNumber(args[1]);

    case 'lte':
      return toNumber(args[0]) <= toNumber(args[1]);

    case 'in': {
      const needle = args[0];
      const haystack = args[1];
      if (Array.isArray(haystack)) {
        return haystack.some(h => looseEqual(h, needle));
      }
      if (typeof haystack === 'string' && typeof needle === 'string') {
        return haystack.includes(needle);
      }
      return false;
    }

    case 'contains': {
      const collection = args[0];
      const item = args[1];
      if (Array.isArray(collection)) {
        return collection.some(c => looseEqual(c, item));
      }
      if (typeof collection === 'string' && typeof item === 'string') {
        return collection.includes(item);
      }
      return false;
    }

    case 'exists':
      return args[0] !== null && args[0] !== undefined;

    default:
      // Unknown op — resolve to undefined (falsy in conditions), never throw.
      return undefined;
  }
}

function toBool(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (val === null || val === undefined || val === 0 || val === '') return false;
  return true;
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'string') return a === parseFloat(b);
  if (typeof a === 'string' && typeof b === 'number') return parseFloat(a) === b;
  return String(a) === String(b);
}
