/**
 * WS-QF / AI-2 review fix — cross-leg billing dedupe.
 *
 * Critical gap found in review: `recordAiUsage` (which claims the billable
 * unit) is awaited INSIDE an option task before the stream generator yields
 * that option's SSE frame. If the connection drops between that DB write and
 * the client parsing the frame (the documented Cloudflare-tunnel mid-stream
 * drop), the client sees `gotAny:false, transportFailed:true`,
 * `nextStepAfterStream` returns 'batch-fallback', and — without this fix — the
 * batch route's fresh `GenerationBillingState` bills its own unit on top of
 * the stream leg's already-recorded one. Two units for one click.
 *
 * The fix: the client sends one correlationId per attempt (per click, not per
 * leg) on both the stream request and (only on fallback) the batch request.
 * `seedBillingStateForCorrelation` checks whether ANY AiUsage row already
 * carries a billed unit (requestCount > 0) for that correlationId before a
 * leg is allowed to bill, closing the window deterministically (as opposed to
 * narrowing it by flushing frames before the billing write).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  newGenerationBillingState,
  claimOptionBillableUnit,
  seedBillingStateForCorrelation,
} from '~/services/ai/llm.server';
import type { AiUsageService } from '~/services/observability/ai-usage.service';

function fakeUsage(billedCorrelationIds: Set<string>): Pick<AiUsageService, 'hasBilledUnit'> {
  return {
    hasBilledUnit: vi.fn(async (correlationId: string) => billedCorrelationIds.has(correlationId)),
  };
}

describe('seedBillingStateForCorrelation (cross-leg billing dedupe)', () => {
  it('REGRESSION: stream leg bills 1 for correlationId X; a later batch leg for the SAME X bills 0 (total stays 1)', async () => {
    // Simulates the drop-after-billed interleaving: the stream leg's
    // recordAiUsage already wrote a requestCount:1 row for X (the DB write
    // completed before the connection dropped), and the client's batch
    // fallback carries the same client-generated correlationId.
    const billedElsewhere = new Set<string>(['corr-X']);

    // Stream leg: unaffected by this fix — always the plain, un-checked
    // primitive, and always the first leg to run for a given correlationId.
    const streamState = newGenerationBillingState();
    const streamUnit = claimOptionBillableUnit(streamState, 'ok');
    expect(streamUnit).toBe(1);

    // Batch leg, SAME correlationId — must see the pre-existing billed row and
    // seed its state as already-charged, so its own successes claim 0.
    const batchState = await seedBillingStateForCorrelation(fakeUsage(billedElsewhere), 'corr-X');
    const batchUnits = ['ok', 'ok', 'ok'].map((o) => claimOptionBillableUnit(batchState, o as 'ok'));
    expect(batchUnits).toEqual([0, 0, 0]);

    const total = streamUnit + batchUnits.reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });

  it('batch WITHOUT a correlationId (direct, non-fallback use) still bills 1 — no behavior change for non-fallback callers', async () => {
    const usage = fakeUsage(new Set());
    const batchState = await seedBillingStateForCorrelation(usage, undefined);
    expect(claimOptionBillableUnit(batchState, 'ok')).toBe(1);
    // Never even queries the DB when there's no correlationId to check.
    expect(usage.hasBilledUnit).not.toHaveBeenCalled();
  });

  it('two different correlationIds bill independently', async () => {
    const billedElsewhere = new Set<string>(['corr-A']); // only A was already billed
    const stateA = await seedBillingStateForCorrelation(fakeUsage(billedElsewhere), 'corr-A');
    const stateB = await seedBillingStateForCorrelation(fakeUsage(billedElsewhere), 'corr-B');
    expect(claimOptionBillableUnit(stateA, 'ok')).toBe(0); // A already billed on another leg
    expect(claimOptionBillableUnit(stateB, 'ok')).toBe(1); // B is a fresh attempt
  });

  it('a correlationId with no prior billed row bills normally (this IS the first/only leg)', async () => {
    const state = await seedBillingStateForCorrelation(fakeUsage(new Set()), 'corr-fresh');
    expect(claimOptionBillableUnit(state, 'ok')).toBe(1);
  });

  it('a fully-failed batch leg for an already-billed correlationId still bills 0 (no double-negative surprise)', async () => {
    const billedElsewhere = new Set<string>(['corr-X']);
    const state = await seedBillingStateForCorrelation(fakeUsage(billedElsewhere), 'corr-X');
    const total = ['failed', 'failed'].map((o) => claimOptionBillableUnit(state, o as 'failed')).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });
});
