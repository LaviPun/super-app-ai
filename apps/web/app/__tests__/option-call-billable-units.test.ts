import { describe, it, expect } from 'vitest';
import { optionCallBillableUnits } from '~/services/ai/llm.server';

/**
 * Guards the quota-metering invariant: a single merchant "generate" request fans
 * out into N parallel option calls, but must count as exactly ONE billable request
 * toward the aiRequestsPerMonth quota. Only the first option call carries the unit.
 * If someone "fixes" this back to 1-per-call, one create silently burns 3× quota.
 */
describe('optionCallBillableUnits', () => {
  it('charges the first option call one billable unit', () => {
    expect(optionCallBillableUnits(0)).toBe(1);
  });

  it('charges sibling option calls zero (cost is still tracked separately via costCents)', () => {
    expect(optionCallBillableUnits(1)).toBe(0);
    expect(optionCallBillableUnits(2)).toBe(0);
  });

  it('a full 3-option fan-out sums to exactly 1 quota unit', () => {
    const total = [0, 1, 2].reduce((sum, idx) => sum + optionCallBillableUnits(idx), 0);
    expect(total).toBe(1);
  });

  it('a single-option generation (optionCount=1) still charges 1', () => {
    expect([0].reduce((sum, idx) => sum + optionCallBillableUnits(idx), 0)).toBe(1);
  });
});
