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
 *
 * Round-2 review reopened two findings this file also covers:
 *  - Finding 2b: the STREAM leg is now symmetrically correlation-aware too
 *    (previously only the batch leg pre-checked), because the server keeps
 *    generating after a client disconnect — the stream leg is not reliably
 *    "first to persist" just because it started first.
 *  - Finding 1: the legacy non-fan-out retry loop in
 *    `generateValidatedRecipeOptions` (types without a per-type JSON Schema)
 *    must bill 0 for every failed attempt, not 1 — a fully-failed generation
 *    must total 0 billed units, matching the fan-out paths' semantics.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  newGenerationBillingState,
  claimOptionBillableUnit,
  seedBillingStateForCorrelation,
  legacyRecipeOptionsBillableUnits,
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
    // fallback carries the same client-generated correlationId. The stream
    // leg itself sees no prior billed row (it's genuinely first here), so it
    // bills normally through the same seeding path the batch leg uses.
    const billedElsewhere = new Set<string>(); // nothing billed yet when the stream leg runs

    const streamState = await seedBillingStateForCorrelation(fakeUsage(billedElsewhere), 'corr-X');
    const streamUnit = claimOptionBillableUnit(streamState, 'ok');
    expect(streamUnit).toBe(1);

    // Now the stream leg's row exists — the batch leg, SAME correlationId,
    // must see it and seed its state as already-charged, so its own
    // successes claim 0.
    billedElsewhere.add('corr-X');
    const batchState = await seedBillingStateForCorrelation(fakeUsage(billedElsewhere), 'corr-X');
    const batchUnits = ['ok', 'ok', 'ok'].map((o) => claimOptionBillableUnit(batchState, o as 'ok'));
    expect(batchUnits).toEqual([0, 0, 0]);

    const total = streamUnit + batchUnits.reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });

  it('Finding 2b (symmetric fix): a STREAM leg with correlationId X, run AFTER a batch leg already billed X, bills 0', async () => {
    // The server keeps generating after a client disconnect, so the batch
    // fallback's write can persist BEFORE the stream leg's own write — the
    // stream leg is not reliably "first" just because it started first. This
    // is exactly what the symmetric fix (seeding the stream leg's billing
    // state through the same hasBilledUnit check) closes.
    const billedElsewhere = new Set<string>(['corr-X']); // the batch leg already won the unit
    const streamState = await seedBillingStateForCorrelation(fakeUsage(billedElsewhere), 'corr-X');
    expect(claimOptionBillableUnit(streamState, 'ok')).toBe(0);
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

describe('legacyRecipeOptionsBillableUnits (Finding 1, reopened: legacy non-fan-out retry loop)', () => {
  // generateValidatedRecipeOptions' legacy path (module types without a
  // per-type JSON Schema) calls this exact function for every attempt's
  // recordAiUsage requestCount — a failed attempt with 'failed', the terminal
  // success with 'ok'. These tests exercise the real production function.

  it('REGRESSION: a fully-failed generation (all attempts fail) bills 0 total, not maxAttempts', async () => {
    const usage = fakeUsage(new Set());
    const attempts = await Promise.all([
      legacyRecipeOptionsBillableUnits(usage, 'corr-all-fail', 'failed'),
      legacyRecipeOptionsBillableUnits(usage, 'corr-all-fail', 'failed'),
      legacyRecipeOptionsBillableUnits(usage, 'corr-all-fail', 'failed'),
    ]);
    expect(attempts).toEqual([0, 0, 0]);
    expect(attempts.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('REGRESSION: failing twice then succeeding bills exactly 1 total, not 3', async () => {
    // A fake ledger stands in for the AiUsage table: successful billing
    // writes add to it, so a later hasBilledUnit check (inside
    // seedBillingStateForCorrelation, called by legacyRecipeOptionsBillableUnits)
    // sees prior REAL billed rows exactly like the production DB would. Failed
    // attempts must NOT add to the ledger (they bill 0), which this also
    // verifies implicitly: if they did, the final success would incorrectly
    // see itself as already billed and claim 0 instead of 1.
    const billed = new Set<string>();
    const usage = fakeUsage(billed);
    const correlationId = 'corr-fail-fail-ok';

    const attempt1 = await legacyRecipeOptionsBillableUnits(usage, correlationId, 'failed');
    const attempt2 = await legacyRecipeOptionsBillableUnits(usage, correlationId, 'failed');
    const attempt3 = await legacyRecipeOptionsBillableUnits(usage, correlationId, 'ok');
    if (attempt3 > 0) billed.add(correlationId); // mirrors the real recordAiUsage write

    expect([attempt1, attempt2, attempt3]).toEqual([0, 0, 1]);
    expect(attempt1 + attempt2 + attempt3).toBe(1);
  });

  it('a successful attempt after failures still bills 1 with no correlationId (no behavior change)', async () => {
    const usage = fakeUsage(new Set());
    const attempt1 = await legacyRecipeOptionsBillableUnits(usage, undefined, 'failed');
    const attempt2 = await legacyRecipeOptionsBillableUnits(usage, undefined, 'ok');
    expect([attempt1, attempt2]).toEqual([0, 1]);
  });

  it('cross-leg dedupe still applies to the legacy path: a success for an already-billed correlationId bills 0', async () => {
    const usage = fakeUsage(new Set(['corr-already-billed']));
    expect(await legacyRecipeOptionsBillableUnits(usage, 'corr-already-billed', 'ok')).toBe(0);
  });
});
