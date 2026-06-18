import { describe, it, expect } from 'vitest';
import type { RunContext } from '@superapp/core';
import { resolveValue, evalExpression, evalNode } from '~/services/workflows/expression-evaluator';

function ctxWith(payload: Record<string, unknown>, vars: Record<string, unknown> = {}): RunContext {
  return {
    trigger: { provider: 'shopify', event: 'order.created', payload },
    workflow: { id: 'wf', version: 1 },
    run: { id: 'run1', startedAt: new Date().toISOString() },
    vars,
    steps: {},
    lastError: null,
  };
}

describe('expression evaluator — refs, templates, indexing', () => {
  const ctx = ctxWith({ order: { total: 120, name: '#1001', line_items: [{ qty: 2 }, { qty: 3 }] } });

  it('resolves $ref paths incl. array indexing', () => {
    expect(resolveValue({ $ref: '$.trigger.payload.order.total' }, ctx)).toBe(120);
    expect(resolveValue({ $ref: '$.trigger.payload.order.line_items[1].qty' }, ctx)).toBe(3);
  });

  it('interpolates $tmpl', () => {
    expect(resolveValue({ $tmpl: 'Order {{$.trigger.payload.order.name}}' }, ctx)).toBe('Order #1001');
  });
});

describe('expression evaluator — arithmetic', () => {
  const ctx = ctxWith({ order: { total: 100 } });
  it('add/subtract/multiply/divide/modulo', () => {
    expect(evalNode({ op: 'add', args: [{ $ref: '$.trigger.payload.order.total' }, 20] }, ctx)).toBe(120);
    expect(evalNode({ op: 'subtract', args: [100, 30] }, ctx)).toBe(70);
    expect(evalNode({ op: 'multiply', args: [4, 5, 2] }, ctx)).toBe(40);
    expect(evalNode({ op: 'divide', args: [100, 4] }, ctx)).toBe(25);
    expect(evalNode({ op: 'divide', args: [1, 0] }, ctx)).toBe(0); // safe
    expect(evalNode({ op: 'modulo', args: [10, 3] }, ctx)).toBe(1);
  });
  it('round/abs/min/max/sum', () => {
    expect(evalNode({ op: 'round', args: [3.14159, 2] }, ctx)).toBe(3.14);
    expect(evalNode({ op: 'abs', args: [-5] }, ctx)).toBe(5);
    expect(evalNode({ op: 'min', args: [3, 1, 2] }, ctx)).toBe(1);
    expect(evalNode({ op: 'max', args: [3, 1, 2] }, ctx)).toBe(3);
    expect(evalNode({ op: 'sum', args: [[1, 2, 3, 4]] }, ctx)).toBe(10);
  });
});

describe('expression evaluator — string + array', () => {
  const ctx = ctxWith({ tags: ['vip', 'wholesale'], name: '  Jane  ' });
  it('string ops', () => {
    expect(evalNode({ op: 'concat', args: ['a', 'b', 'c'] }, ctx)).toBe('abc');
    expect(evalNode({ op: 'upper', args: ['hi'] }, ctx)).toBe('HI');
    expect(evalNode({ op: 'trim', args: [{ $ref: '$.trigger.payload.name' }] }, ctx)).toBe('Jane');
    expect(evalNode({ op: 'replace', args: ['a-b-c', '-', '_'] }, ctx)).toBe('a_b_c');
    expect(evalNode({ op: 'split', args: ['a,b,c', ','] }, ctx)).toEqual(['a', 'b', 'c']);
  });
  it('array ops', () => {
    const items = { $ref: '$.trigger.payload.tags' };
    expect(evalNode({ op: 'length', args: [items] }, ctx)).toBe(2);
    expect(evalNode({ op: 'first', args: [items] }, ctx)).toBe('vip');
    expect(evalNode({ op: 'last', args: [items] }, ctx)).toBe('wholesale');
    expect(evalNode({ op: 'join', args: [items, '|'] }, ctx)).toBe('vip|wholesale');
    expect(evalNode({ op: 'includes', args: [items, 'vip'] }, ctx)).toBe(true);
    expect(evalNode({ op: 'at', args: [items, -1] }, ctx)).toBe('wholesale');
  });
});

describe('expression evaluator — date + util', () => {
  const ctx = ctxWith({});
  it('date math', () => {
    const base = '2026-01-01T00:00:00.000Z';
    expect(evalNode({ op: 'addDays', args: [base, 5] }, ctx)).toBe('2026-01-06T00:00:00.000Z');
    expect(evalNode({ op: 'diffDays', args: ['2026-01-10T00:00:00Z', base] }, ctx)).toBe(9);
    expect(evalNode({ op: 'isAfter', args: ['2026-02-01Z', base] }, ctx)).toBe(true);
  });
  it('coalesce + if', () => {
    expect(evalNode({ op: 'coalesce', args: [null, undefined, 'fallback'] }, ctx)).toBe('fallback');
    expect(evalNode({ op: 'if', args: [true, 'yes', 'no'] }, ctx)).toBe('yes');
    expect(evalNode({ op: 'if', args: [{ op: 'gt', args: [5, 10] }, 'a', 'b'] }, ctx)).toBe('b');
  });
});

describe('expression evaluator — boolean conditions (nested)', () => {
  const ctx = ctxWith({ order: { total: 250, country: 'US' } });
  it('combines arithmetic into a boolean condition', () => {
    const expr = {
      op: 'and',
      args: [
        { op: 'gte', args: [{ $ref: '$.trigger.payload.order.total' }, 200] },
        { op: 'eq', args: [{ $ref: '$.trigger.payload.order.country' }, 'US'] },
      ],
    };
    expect(evalExpression(expr, ctx)).toBe(true);
  });

  it('transforms can embed expressions (resolveValue evaluates {op})', () => {
    const out = resolveValue(
      { discounted: { op: 'multiply', args: [{ $ref: '$.trigger.payload.order.total' }, 0.9] } },
      ctx,
    ) as { discounted: number };
    expect(out.discounted).toBe(225);
  });
});
