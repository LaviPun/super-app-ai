/**
 * Eval harness end-to-end tests (035 vocab-hardening — Phase 5b).
 *
 * These exercise `runEvals` itself (not the static golden fixtures — that's
 * `evals.test.ts`). The contract:
 *   • The expanded GOLDEN_PROMPTS (~50) all run through the StubLlmClient path
 *     WITHOUT throwing.
 *   • Every RECIPE_SPEC_TYPE is named by at least one prompt (type coverage).
 *   • The aggregate summary has the full, well-typed shape including the new
 *     quality signals (avgQualityScore, richnessFailRate, avgRankScore).
 *   • Deterministic: two runs produce identical aggregate numbers.
 *   • The optional judge client is wired (a scripted stub judge populates
 *     judgeScore + avgJudgeScore) without touching the deterministic path.
 */
import { describe, it, expect } from 'vitest';
import { RECIPE_SPEC_TYPES } from '@superapp/core';
import type { GenerateHints, LlmClient } from '~/services/ai/llm.server';
import { runEvals, GOLDEN_PROMPTS } from '~/services/ai/evals.server';

describe('GOLDEN_PROMPTS coverage', () => {
  it('has ~50 prompts', () => {
    expect(GOLDEN_PROMPTS.length).toBeGreaterThanOrEqual(45);
  });

  it('names every RECIPE_SPEC_TYPE at least once via expectedType', () => {
    const covered = new Set(GOLDEN_PROMPTS.map((g) => g.expectedType).filter(Boolean));
    const missing = RECIPE_SPEC_TYPES.filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it('includes adversarial phrasings, with the explicit-simplicity ones marked richnessExempt', () => {
    const exempt = GOLDEN_PROMPTS.filter((g) => g.richnessExempt);
    expect(exempt.length).toBeGreaterThanOrEqual(3);
    // Competitor name-drops exist but are NOT exempt (they must still be scored).
    const competitor = GOLDEN_PROMPTS.filter((g) => /like (Privy|Discount Ninja|ReConvert)/i.test(g.prompt));
    expect(competitor.length).toBeGreaterThanOrEqual(3);
    expect(competitor.every((g) => !g.richnessExempt)).toBe(true);
  });

  it('has unique prompt ids', () => {
    const ids = GOLDEN_PROMPTS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('runEvals (StubLlmClient, deterministic)', () => {
  it('runs all prompts to completion and returns a well-shaped summary', async () => {
    const summary = await runEvals(); // default StubLlmClient

    expect(summary.total).toBe(GOLDEN_PROMPTS.length);
    expect(summary.results).toHaveLength(GOLDEN_PROMPTS.length);

    // Every result carries the full field set including the new quality signals.
    for (const r of summary.results) {
      expect(typeof r.schemaValid).toBe('boolean');
      expect(r.qualityScore).toBeGreaterThanOrEqual(0);
      expect(r.qualityScore).toBeLessThanOrEqual(1);
      expect(typeof r.qualityFamily).toBe('string');
      expect(r.richnessFails).toBeGreaterThanOrEqual(0);
      expect(typeof r.rankScore).toBe('number');
      expect(r.judgeScore).toBeUndefined(); // no judge client → never present
    }

    // Aggregate rates are all valid fractions.
    for (const rate of [
      summary.schemaValidRate,
      summary.compilerSuccessRate,
      summary.nonDestructiveRate,
      summary.allowedValuesCompliantRate,
      summary.forbiddenSurfaceRejectRate,
      summary.avgQualityScore,
      summary.richnessFailRate,
    ]) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
    expect(summary.avgRankScore).toBeTypeOf('number');
    expect(summary.avgJudgeScore).toBeUndefined();
  });

  it('the stub keeps schema validity and non-destructiveness at the CI bar', () => {
    // The stub is deterministic and always emits valid, non-destructive recipes.
    // These are the gates CI actually enforces (strict mode = 0.99 / 1.0).
    return runEvals().then((summary) => {
      expect(summary.schemaValidRate).toBe(1);
      expect(summary.nonDestructiveRate).toBe(1);
    });
  });

  it('is deterministic across runs', async () => {
    const a = await runEvals();
    const b = await runEvals();
    expect(b.schemaValidRate).toBe(a.schemaValidRate);
    expect(b.avgQualityScore).toBe(a.avgQualityScore);
    expect(b.richnessFailRate).toBe(a.richnessFailRate);
    expect(b.avgRankScore).toBe(a.avgRankScore);
  });
});

describe('runEvals — optional LLM judge', () => {
  it('populates judgeScore + avgJudgeScore only when a judge client is passed', async () => {
    // A scripted judge that always returns a valid Finding.
    const judgeClient: LlmClient = {
      async generateRecipe(_prompt: string, _hints?: GenerateHints) {
        return {
          rawJson: JSON.stringify({ score: 7.5, strengths: ['ok'], risks: [], notes: 'scripted' }),
          tokensIn: 10,
          tokensOut: 10,
          model: 'scripted-judge',
        };
      },
    };

    const summary = await runEvals(undefined, 3, { judgeClient });
    expect(summary.avgJudgeScore).toBeCloseTo(7.5, 5);
    // Every schema-valid result got a judge score.
    const scored = summary.results.filter((r) => typeof r.judgeScore === 'number');
    expect(scored.length).toBe(summary.results.filter((r) => r.schemaValid).length);
  });

  it('degrades gracefully when the judge returns unparseable output', async () => {
    const badJudge: LlmClient = {
      async generateRecipe() {
        return { rawJson: 'not json', tokensIn: 0, tokensOut: 0, model: 'bad' };
      },
    };
    const summary = await runEvals(undefined, 3, { judgeClient: badJudge });
    // No parseable judge findings → avgJudgeScore stays undefined, no throw.
    expect(summary.avgJudgeScore).toBeUndefined();
    expect(summary.results.every((r) => r.judgeScore === undefined)).toBe(true);
  });
});
