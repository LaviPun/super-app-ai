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
  const segments = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
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
 * Evaluate an Expression tree against the run context.
 * Returns a boolean for condition nodes, or a resolved value for other uses.
 */
export function evalExpression(expr: Expression, ctx: RunContext): boolean {
  const args = (expr.args ?? []).map(a => {
    if (typeof a === 'object' && a !== null && 'op' in a) {
      return evalExpression(a as Expression, ctx);
    }
    return resolveValue(a, ctx);
  });

  switch (expr.op) {
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
      return false;
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
