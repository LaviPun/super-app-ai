import { describe, it, expect } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { StubLlmClient } from '~/services/ai/llm.server';
import { runTournament, generateCandidatesWithClient } from '~/services/tournament/tournament.server';
import { DIMENSIONS, type Candidate } from '~/services/tournament/types';
import { renderMarkdown } from '~/services/tournament/report';

describe('module tournament (offline / StubLlmClient)', () => {
  it('runs all five phases and ranks a valid candidate above a broken one', async () => {
    const client = new StubLlmClient();

    // One genuinely valid candidate from the stub, plus a deliberately broken one.
    const [valid] = await generateCandidatesWithClient(client, 'exit-intent popup offering 10% off', 1);
    if (!valid) throw new Error('stub did not produce a valid candidate');

    const candidates: Candidate[] = [
      { ...valid, id: 'cand1' },
      // Bogus type — fails the schema gate, so it should be heavily penalized.
      { id: 'cand2', explanation: 'broken', recipe: { type: 'not.a.real.type', name: 'Broken' } as unknown as RecipeSpec },
    ];

    const result = await runTournament({
      client,
      prompt: 'exit-intent popup offering 10% off',
      moduleType: 'theme.section',
      candidates,
      concurrency: 4,
    });

    // Audit fans out candidates × dimensions; judge once per candidate; harvest + synthesize once each.
    const auditRuns = result.agentRuns.filter((r) => r.phase === 'audit');
    expect(auditRuns).toHaveLength(candidates.length * DIMENSIONS.length);
    expect(result.agentRuns.filter((r) => r.phase === 'judge')).toHaveLength(candidates.length);
    expect(result.agentRuns.filter((r) => r.phase === 'harvest')).toHaveLength(1);
    expect(result.agentRuns.filter((r) => r.phase === 'synthesize')).toHaveLength(1);

    // Verify ran per candidate; the broken one fails schema.
    expect(result.verify).toHaveLength(candidates.length);
    const v1 = result.verify.find((v) => v.candidateId === 'cand1')!;
    const v2 = result.verify.find((v) => v.candidateId === 'cand2')!;
    expect(v1.schemaValid).toBe(true);
    expect(v2.schemaValid).toBe(false);

    // Winner is the valid candidate; the broken one is penalized to the floor.
    expect(result.winnerId).toBe('cand1');
    const s2 = result.scores.find((s) => s.candidateId === 'cand2')!;
    expect(s2.verifyPenalty).toBeGreaterThanOrEqual(6);
    expect(s2.finalScore).toBeLessThan(result.scores.find((s) => s.candidateId === 'cand1')!.finalScore);

    // A synthesized best-of artifact is emitted and re-verified.
    expect(result.synthesizedRecipe).not.toBeNull();
    expect(result.synthesizedRecipeVerify?.schemaValid).toBe(true);

    // Report renders without throwing and names the winner.
    const md = renderMarkdown(result);
    expect(md).toContain('Leaderboard');
    expect(md).toContain('cand1');
  });

  it('generateCandidatesWithClient skips schema-invalid outputs', async () => {
    const client = new StubLlmClient();
    const candidates = await generateCandidatesWithClient(client, 'dismissible notification bar free shipping', 2);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    candidates.forEach((c) => expect(c.recipe.type).toBeTruthy());
  });
});
