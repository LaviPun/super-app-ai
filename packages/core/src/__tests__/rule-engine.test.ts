import { describe, it, expect } from 'vitest';
import {
  RuleEnginePackSchema,
  RuleConditionSchema,
  RuleGroupSchema,
  evaluateRuleEngine,
  isServerResolvable,
  RULE_LIMITS,
} from '../index.js';
import { RULE_FIXTURES } from '../rule-engine/__fixtures__/rule-fixtures.js';

describe('rule-engine schema (R2.1)', () => {
  it('defaults an empty pack to always-show (back-compat)', () => {
    expect(RuleEnginePackSchema.parse({})).toEqual({
      enabled: false,
      logic: 'AND',
      groups: [],
      matchAction: 'SHOW',
      onUnresolved: 'defer',
    });
  });

  it('accepts a valid (object, attribute) pair', () => {
    const row = RuleConditionSchema.parse({
      object: 'customer',
      attribute: 'ordersCount',
      operator: 'greater_than_or_equal',
      value: 1,
    });
    expect(row.attribute).toBe('ordersCount');
  });

  it('rejects an unknown (object, attribute) pair (anti-drift superRefine)', () => {
    const r = RuleConditionSchema.safeParse({
      object: 'product',
      attribute: 'zzz',
      operator: 'equal_to',
      value: 'x',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an attribute that belongs to a DIFFERENT object', () => {
    // `ordersCount` is a customer attribute, not a product one.
    const r = RuleConditionSchema.safeParse({
      object: 'product',
      attribute: 'ordersCount',
      operator: 'greater_than',
      value: 1,
    });
    expect(r.success).toBe(false);
  });

  it('requires a value for value-taking operators, but not for is_set/is_not_set', () => {
    expect(
      RuleConditionSchema.safeParse({ object: 'customer', attribute: 'countryCode', operator: 'equal_to', value: '' }).success,
    ).toBe(false);
    expect(
      RuleConditionSchema.safeParse({ object: 'customer', attribute: 'countryCode', operator: 'is_set' }).success,
    ).toBe(true);
    expect(
      RuleConditionSchema.safeParse({ object: 'customer', attribute: 'countryCode', operator: 'is_not_set' }).success,
    ).toBe(true);
  });

  it('rejects an unknown operator', () => {
    expect(
      RuleConditionSchema.safeParse({ object: 'geo', attribute: 'countryCode', operator: 'regex', value: '.*' }).success,
    ).toBe(false);
  });

  it('a group requires at least one condition', () => {
    expect(RuleGroupSchema.safeParse({ logic: 'AND', conditions: [] }).success).toBe(false);
  });

  it('enforces the group/row/value caps', () => {
    const cond = { object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'US' };
    const overGroups = {
      enabled: true,
      groups: Array.from({ length: RULE_LIMITS.maxGroups + 1 }, () => ({ logic: 'AND', conditions: [cond] })),
    };
    expect(RuleEnginePackSchema.safeParse(overGroups).success).toBe(false);

    const overRows = {
      enabled: true,
      groups: [{ logic: 'AND', conditions: Array.from({ length: RULE_LIMITS.maxRowsPerGroup + 1 }, () => cond) }],
    };
    expect(RuleEnginePackSchema.safeParse(overRows).success).toBe(false);

    const overList = {
      object: 'product',
      attribute: 'tags',
      operator: 'equal_to',
      value: Array.from({ length: RULE_LIMITS.maxValueListLen + 1 }, (_, i) => `t${i}`),
    };
    expect(RuleConditionSchema.safeParse(overList).success).toBe(false);
  });
});

describe('rule-engine evaluator (R2.1) — fixture table', () => {
  for (const fx of RULE_FIXTURES) {
    it(fx.name, () => {
      expect(evaluateRuleEngine(fx.rules, fx.ctx)).toEqual(fx.expected);
    });
  }
});

describe('isServerResolvable', () => {
  it('is true when no behavioral rows are present', () => {
    const rules = RuleEnginePackSchema.parse({
      enabled: true,
      groups: [{ logic: 'AND', conditions: [{ object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'US' }] }],
    });
    expect(isServerResolvable(rules)).toBe(true);
  });

  it('is false when any behavioral row is present', () => {
    const rules = RuleEnginePackSchema.parse({
      enabled: true,
      groups: [{ logic: 'AND', conditions: [{ object: 'behavioral', attribute: 'exitIntent', operator: 'equal_to', value: true }] }],
    });
    expect(isServerResolvable(rules)).toBe(false);
  });

  it('is true for a disabled pack regardless of rows', () => {
    const rules = RuleEnginePackSchema.parse({
      enabled: false,
      groups: [{ logic: 'AND', conditions: [{ object: 'behavioral', attribute: 'exitIntent', operator: 'equal_to', value: true }] }],
    });
    expect(isServerResolvable(rules)).toBe(true);
  });
});
