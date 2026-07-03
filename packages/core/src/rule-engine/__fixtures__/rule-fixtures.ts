/**
 * Shared rule + context fixtures (R2.1). ONE table, consumed by:
 *   - the TS evaluator test (`__tests__/rule-engine.test.ts`)
 *   - the server/client PARITY test (`__tests__/rule-engine-parity.test.ts`), which
 *     extracts the vanilla `evaluateRules` from `superapp-modules.js` and asserts it
 *     returns the identical verdict for every case.
 *
 * A fixture is a fully-defaulted `RuleEnginePack` value + a resolved `RuleContext` +
 * the expected `{ verdict, resolvable }`. Kept in plain data (no Zod) so the vanilla
 * JS evaluator can eat the exact same objects without a parse step.
 */
import type { RuleEnginePack } from '../../control-packs/packs/rule-engine.pack.js';
import type { RuleContext } from '../evaluate.js';

export interface RuleFixture {
  name: string;
  rules: RuleEnginePack;
  ctx: RuleContext;
  expected: { verdict: 'show' | 'hide'; resolvable: boolean };
}

/** Build a fully-defaulted pack from a partial (mirrors the Zod defaults). */
function pack(p: Partial<RuleEnginePack>): RuleEnginePack {
  return {
    enabled: p.enabled ?? true,
    logic: p.logic ?? 'AND',
    groups: p.groups ?? [],
    matchAction: p.matchAction ?? 'SHOW',
    onUnresolved: p.onUnresolved ?? 'defer',
  };
}

export const RULE_FIXTURES: RuleFixture[] = [
  {
    name: 'disabled pack → always show',
    rules: pack({ enabled: false, groups: [] }),
    ctx: { values: {} },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'enabled with no groups → always show',
    rules: pack({ enabled: true, groups: [] }),
    ctx: { values: {} },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'single AND group, all pass → show',
    rules: pack({
      groups: [
        {
          logic: 'AND',
          conditions: [
            { object: 'customer', attribute: 'ordersCount', operator: 'greater_than_or_equal', value: 1 },
            { object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'US' },
          ],
        },
      ],
    }),
    ctx: { values: { 'customer.ordersCount': 3, 'geo.countryCode': 'US' } },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'single AND group, one fails → hide',
    rules: pack({
      groups: [
        {
          logic: 'AND',
          conditions: [
            { object: 'customer', attribute: 'ordersCount', operator: 'greater_than_or_equal', value: 1 },
            { object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'US' },
          ],
        },
      ],
    }),
    ctx: { values: { 'customer.ordersCount': 3, 'geo.countryCode': 'CA' } },
    expected: { verdict: 'hide', resolvable: true },
  },
  {
    name: 'OR group, any passes → show',
    rules: pack({
      groups: [
        {
          logic: 'OR',
          conditions: [
            { object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'US' },
            { object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'CA' },
          ],
        },
      ],
    }),
    ctx: { values: { 'geo.countryCode': 'CA' } },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'outer OR over two groups, second group matches → show',
    rules: pack({
      logic: 'OR',
      groups: [
        {
          logic: 'AND',
          conditions: [
            { object: 'cart', attribute: 'subtotal', operator: 'greater_than_or_equal', value: 75 },
            { object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'US' },
          ],
        },
        {
          logic: 'AND',
          conditions: [
            { object: 'behavioral', attribute: 'utmCampaign', operator: 'equal_to', value: 'spring-sale' },
          ],
        },
      ],
    }),
    ctx: { values: { 'cart.subtotal': 40, 'geo.countryCode': 'CA', 'behavioral.utmCampaign': 'spring-sale' } },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'outer AND over two groups, one group fails → hide',
    rules: pack({
      logic: 'AND',
      groups: [
        { logic: 'AND', conditions: [{ object: 'customer', attribute: 'loggedIn', operator: 'equal_to', value: true }] },
        { logic: 'AND', conditions: [{ object: 'cart', attribute: 'itemCount', operator: 'greater_than', value: 2 }] },
      ],
    }),
    ctx: { values: { 'customer.loggedIn': true, 'cart.itemCount': 1 } },
    expected: { verdict: 'hide', resolvable: true },
  },
  {
    name: 'matchAction HIDE inverts a match → hide',
    rules: pack({
      matchAction: 'HIDE',
      groups: [{ logic: 'AND', conditions: [{ object: 'customer', attribute: 'loggedIn', operator: 'equal_to', value: false }] }],
    }),
    ctx: { values: { 'customer.loggedIn': false } },
    expected: { verdict: 'hide', resolvable: true },
  },
  {
    name: 'matchAction HIDE with no match → show',
    rules: pack({
      matchAction: 'HIDE',
      groups: [{ logic: 'AND', conditions: [{ object: 'customer', attribute: 'loggedIn', operator: 'equal_to', value: false }] }],
    }),
    ctx: { values: { 'customer.loggedIn': true } },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'is_set passes when the value is present',
    rules: pack({
      groups: [{ logic: 'AND', conditions: [{ object: 'behavioral', attribute: 'utmSource', operator: 'is_set', value: '' }] }],
    }),
    ctx: { values: { 'behavioral.utmSource': 'newsletter' } },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'is_not_set passes when the value is absent',
    rules: pack({
      groups: [{ logic: 'AND', conditions: [{ object: 'customer', attribute: 'countryCode', operator: 'is_not_set', value: '' }] }],
    }),
    ctx: { values: {} },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'stringList membership: product.tags equal_to a tag → show',
    rules: pack({
      groups: [{ logic: 'AND', conditions: [{ object: 'product', attribute: 'tags', operator: 'equal_to', value: 'sale' }] }],
    }),
    ctx: { values: { 'product.tags': ['new', 'sale', 'featured'] } },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'contains substring on referrer → show',
    rules: pack({
      groups: [{ logic: 'AND', conditions: [{ object: 'behavioral', attribute: 'referrerContains', operator: 'contains', value: 'google' }] }],
    }),
    ctx: { values: { 'behavioral.referrerContains': 'https://www.google.com/search' } },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'starts_with on customer countryCode → show',
    rules: pack({
      groups: [{ logic: 'AND', conditions: [{ object: 'customer', attribute: 'countryCode', operator: 'starts_with', value: 'U' }] }],
    }),
    ctx: { values: { 'customer.countryCode': 'US' } },
    expected: { verdict: 'show', resolvable: true },
  },
  {
    name: 'unresolved behavioral row (defer) → verdict from resolved rows, resolvable:false',
    rules: pack({
      onUnresolved: 'defer',
      groups: [
        {
          logic: 'AND',
          conditions: [
            { object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'US' },
            { object: 'behavioral', attribute: 'exitIntent', operator: 'equal_to', value: true },
          ],
        },
      ],
    }),
    // geo resolves + passes; behavioral is absent → unresolved (neutral). Verdict from
    // the one resolved row = pass, but resolvable is false so a server caller defers.
    ctx: { values: { 'geo.countryCode': 'US' } },
    expected: { verdict: 'show', resolvable: false },
  },
  {
    name: 'all rows unresolved in an AND group → neutral (show), resolvable:false',
    rules: pack({
      groups: [{ logic: 'AND', conditions: [{ object: 'behavioral', attribute: 'exitIntent', operator: 'equal_to', value: true }] }],
    }),
    ctx: { values: {} },
    expected: { verdict: 'show', resolvable: false },
  },
  {
    name: 'not_equal_to → hide when equal',
    rules: pack({
      groups: [{ logic: 'AND', conditions: [{ object: 'geo', attribute: 'countryCode', operator: 'not_equal_to', value: 'US' }] }],
    }),
    ctx: { values: { 'geo.countryCode': 'US' } },
    expected: { verdict: 'hide', resolvable: true },
  },
];
