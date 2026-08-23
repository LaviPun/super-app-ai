/**
 * Billing contract for fan-out option generation (WS-QF / AI-2):
 *  - Exactly ONE billable unit per merchant request, claimed by the FIRST
 *    SUCCESSFUL option call (argument evaluation is synchronous, so the
 *    check-and-set can't race across the parallel option tasks).
 *  - FAILED option calls NEVER bill. QuotaService.countUsage sums requestCount
 *    over all AiUsage rows, so a requestCount:1 on a RECIPE_GENERATION_OPTION_FAILED
 *    row would charge quota for a generation the merchant never received.
 *  - A request where every option fails bills 0 units (regression guard).
 */
import { describe, it, expect } from 'vitest';
import { newGenerationBillingState, claimOptionBillableUnit } from '~/services/ai/llm.server';

describe('claimOptionBillableUnit', () => {
  it('bills exactly 1 unit across three successful options', () => {
    const state = newGenerationBillingState();
    const units = ['ok', 'ok', 'ok'].map((o) => claimOptionBillableUnit(state, o as 'ok'));
    expect(units).toEqual([1, 0, 0]);
  });

  it('a failed option never bills; the first SUCCESS claims the unit', () => {
    const state = newGenerationBillingState();
    expect(claimOptionBillableUnit(state, 'failed')).toBe(0);
    expect(claimOptionBillableUnit(state, 'ok')).toBe(1);
    expect(claimOptionBillableUnit(state, 'ok')).toBe(0);
  });

  it('REGRESSION: a fully-failed generation bills 0 units (never counted by QuotaService)', () => {
    const state = newGenerationBillingState();
    const total = ['failed', 'failed', 'failed']
      .map((o) => claimOptionBillableUnit(state, o as 'failed'))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it('single-option request with a success bills exactly 1', () => {
    const state = newGenerationBillingState();
    expect(claimOptionBillableUnit(state, 'ok')).toBe(1);
  });
});
