/**
 * R2.1 — generation wiring for the rule-engine (display rules).
 *
 * The pack is OPTIONAL: the model may emit `config.ruleEngine` or omit it. These
 * assert the authoring contract is surfaced to the two types that pin the pack,
 * and NOT to types that don't (the over-emission guard — the prompt tells the
 * model to omit it for unconstrained requests).
 */
import { describe, it, expect } from 'vitest';
import {
  getFullRecipeSchemaSpec,
  DISPLAY_RULES_SPEC,
} from '~/services/ai/prompt-expectations.server';

describe('rule-engine generation prompt (R2.1)', () => {
  it('surfaces the display-rules contract on theme.section', () => {
    const spec = getFullRecipeSchemaSpec('theme.section');
    expect(spec).toContain('config.ruleEngine');
    expect(spec).toContain('DISPLAY RULES');
    // The object/attribute allowlist and operators must be present so the model can't drift.
    expect(spec).toContain('customer: loggedIn,tags,ordersCount');
    expect(spec).toContain('greater_than_or_equal');
    // Over-emission guard: the prompt explicitly tells the model to omit it by default.
    expect(spec).toContain('to ALWAYS show');
  });

  it('surfaces the display-rules contract on proxy.widget (also pins the pack)', () => {
    expect(getFullRecipeSchemaSpec('proxy.widget')).toContain('config.ruleEngine');
  });

  it('does NOT surface the display-rules contract on types that do not pin the pack', () => {
    // functions.discountRules does not pin ruleEngine → no display-rules block.
    expect(getFullRecipeSchemaSpec('functions.discountRules')).not.toContain('config.ruleEngine');
    expect(getFullRecipeSchemaSpec('checkout.upsell')).not.toContain('DISPLAY RULES');
  });

  it('the contract only references known operators (no invented/regex operator)', () => {
    expect(DISPLAY_RULES_SPEC).not.toMatch(/\bregex\b/);
    expect(DISPLAY_RULES_SPEC).toContain('is_set,is_not_set');
  });
});
