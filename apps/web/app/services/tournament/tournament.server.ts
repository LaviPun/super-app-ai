/**
 * Module-Candidate Tournament engine — the 5-phase pipeline.
 *
 *   Generate → Audit → Judge → Verify → Harvest → Synthesize
 *
 * The engine is pure orchestration: hand it an `LlmClient` and a set of
 * candidates and it returns a `TournamentResult`. Candidate generation lives in
 * separate helpers so the engine stays testable with `StubLlmClient` and offline.
 *
 * Ranking is deterministic: the LLM judge proposes scores, but the final order
 * is `judge − verifyPenalty`, and when no LLM finding parses (e.g. stub mode)
 * the real compiler/QA gates alone drive the ranking. The winner is always the
 * top of that order, never whatever the synthesis prose happens to say.
 */
import { RecipeSpecSchema } from '@superapp/core';
import type { LlmClient } from '~/services/ai/llm.server';
import { generateValidatedRecipeOptionsParallel } from '~/services/ai/llm.server';
import { classifyUserIntentKeywords } from '~/services/ai/classify.server';
import { runPooled } from '~/services/tournament/pool';
import { verifyRecipe, verifyPenalty } from '~/services/tournament/verify';
import type { KeyedLlmClient } from '~/services/tournament/scripted-client';
import {
  FINDING_JSON_SCHEMA,
  buildAuditPrompt,
  buildJudgePrompt,
  buildHarvestPrompt,
  buildSynthesizePrompt,
} from '~/services/tournament/agents';
import {
  DIMENSIONS,
  FindingSchema,
  type AgentRun,
  type Candidate,
  type CandidateScore,
  type Dimension,
  type Finding,
  type Phase,
  type TournamentResult,
  type VerifyResult,
} from '~/services/tournament/types';

const AUDIT_MAX_TOKENS = 1500;
const JUDGE_MAX_TOKENS = 1800;
const SYNTH_MAX_TOKENS = 2200;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export type RunTournamentOptions = {
  client: LlmClient;
  prompt: string;
  moduleType: string;
  candidates: Candidate[];
  /** Max concurrent agent calls (default 5). */
  concurrency?: number;
  /** Fires as each audit/judge agent settles — used by the CLI for live output. */
  onAgentSettled?: (run: AgentRun) => void;
};

/** Run a single agent call, capturing token/model accounting and parsing its finding. */
async function runAgent(
  client: LlmClient,
  id: string,
  phase: Phase,
  candidateId: string | null,
  dimension: Dimension | null,
  prompt: string,
  maxTokens: number,
): Promise<AgentRun> {
  const start = Date.now();
  try {
    const hints = { maxTokens, responseSchema: { name: 'finding', schema: FINDING_JSON_SCHEMA } };
    // Scripted/keyed clients (e.g. subagent-authored fixtures) resolve by agent id.
    const keyed = client as Partial<KeyedLlmClient>;
    const res =
      typeof keyed.generateForAgent === 'function'
        ? await keyed.generateForAgent(id, prompt, hints)
        : await client.generateRecipe(prompt, hints);
    let finding: Finding | null = null;
    try {
      finding = FindingSchema.parse(JSON.parse(res.rawJson));
    } catch {
      finding = null; // e.g. stub mode returns a recipe, not a finding
    }
    return {
      id,
      phase,
      candidateId,
      dimension,
      model: res.model ?? 'unknown',
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      durationMs: Date.now() - start,
      finding,
      rawText: res.rawJson,
    };
  } catch (err) {
    return {
      id,
      phase,
      candidateId,
      dimension,
      model: 'error',
      tokensIn: 0,
      tokensOut: 0,
      durationMs: Date.now() - start,
      finding: null,
      rawText: '',
      error: String(err),
    };
  }
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function runTournament(opts: RunTournamentOptions): Promise<TournamentResult> {
  const { client, prompt, moduleType, candidates } = opts;
  const concurrency = opts.concurrency ?? 5;
  const started = Date.now();
  const agentRuns: AgentRun[] = [];

  // ── Phase 1: Audit (candidates × dimensions, fanned out) ──────────────────
  const auditTasks = candidates.flatMap((c) =>
    DIMENSIONS.map((dim) => () =>
      runAgent(client, `audit:${c.id}:${dim}`, 'audit', c.id, dim, buildAuditPrompt(dim, c, prompt), AUDIT_MAX_TOKENS),
    ),
  );
  const audits = await runPooled(auditTasks, concurrency, (run) => opts.onAgentSettled?.(run));
  agentRuns.push(...audits);

  const auditsFor = (candidateId: string) => audits.filter((a) => a.candidateId === candidateId);

  // ── Phase 2: Judge (one verdict per candidate) ────────────────────────────
  const judgeTasks = candidates.map((c) => () => {
    const findings = auditsFor(c.id).map((a) => ({ dimension: a.dimension as Dimension, finding: a.finding }));
    return runAgent(client, `judge:${c.id}`, 'judge', c.id, null, buildJudgePrompt(c, findings, prompt), JUDGE_MAX_TOKENS);
  });
  const judges = await runPooled(judgeTasks, concurrency, (run) => opts.onAgentSettled?.(run));
  agentRuns.push(...judges);
  const judgeFor = (candidateId: string) => judges.find((j) => j.candidateId === candidateId);

  // ── Phase 3: Verify (deterministic gates, no LLM) ─────────────────────────
  const verify: VerifyResult[] = candidates.map((c) => verifyRecipe(c.id, c.recipe));
  const verifyFor = (candidateId: string) => verify.find((v) => v.candidateId === candidateId)!;

  // ── Score: judge − verify penalty; verify gates alone when no LLM finding ──
  const scores: CandidateScore[] = candidates.map((c) => {
    const auditAvg = mean(auditsFor(c.id).map((a) => a.finding?.score).filter((s): s is number => typeof s === 'number'));
    const judgeScore = judgeFor(c.id)?.finding?.score ?? null;
    const llmScore = judgeScore ?? auditAvg; // may be null in stub/offline mode
    const v = verifyFor(c.id);
    const penalty = verifyPenalty(v);
    const finalScore = llmScore != null ? clamp(llmScore - penalty, 0, 10) : clamp(10 - penalty, 0, 10);
    return {
      candidateId: c.id,
      auditAvg: auditAvg ?? 0,
      judgeScore: judgeScore ?? 0,
      verifyPenalty: penalty,
      finalScore,
      rationale:
        judgeFor(c.id)?.finding?.notes ||
        (llmScore == null ? `Scored from verify gates (${v.gatesRun} run, penalty ${penalty}).` : 'No judge rationale.'),
    };
  });
  const ranking = [...scores].sort((a, b) => b.finalScore - a.finalScore);
  const top = ranking[0] ?? null;
  const winnerId = top?.candidateId ?? null;

  // ── Phase 4: Harvest (reusable wins across candidates) ────────────────────
  const harvestRun = await runAgent(
    client,
    'harvest:all',
    'harvest',
    null,
    null,
    buildHarvestPrompt(candidates, prompt),
    SYNTH_MAX_TOKENS,
  );
  agentRuns.push(harvestRun);
  const harvest =
    harvestRun.finding?.strengths && harvestRun.finding.strengths.length
      ? harvestRun.finding.strengths
      : harvestRun.finding?.notes
        ? [harvestRun.finding.notes]
        : [];

  // ── Phase 5: Synthesize (winner narrative) ────────────────────────────────
  const synthRun = await runAgent(
    client,
    'synthesize:final',
    'synthesize',
    null,
    null,
    buildSynthesizePrompt(
      candidates,
      ranking.map((r) => ({ candidateId: r.candidateId, finalScore: r.finalScore, rationale: r.rationale })),
      harvest,
      prompt,
    ),
    SYNTH_MAX_TOKENS,
  );
  agentRuns.push(synthRun);
  const synthesis =
    synthRun.finding?.notes ||
    (winnerId && top
      ? `Winner: ${winnerId} (${top.finalScore.toFixed(1)}/10). ${top.rationale}`
      : 'No winner: all candidates failed verification.');

  // The synthesized "best-of" artifact is the winning candidate's recipe,
  // re-validated through the same gates (v1: winner recipe, not an LLM merge).
  const winner = candidates.find((c) => c.id === winnerId) ?? null;
  const synthesizedRecipe = winner?.recipe ?? null;
  const synthesizedRecipeVerify = winner ? verifyRecipe(`${winner.id}:synth`, winner.recipe) : null;

  return {
    prompt,
    moduleType,
    candidates,
    agentRuns,
    verify,
    scores,
    winnerId,
    harvest,
    synthesis,
    synthesizedRecipe,
    synthesizedRecipeVerify,
    totals: {
      tokensIn: agentRuns.reduce((a, r) => a + r.tokensIn, 0),
      tokensOut: agentRuns.reduce((a, r) => a + r.tokensOut, 0),
      agentCount: agentRuns.length,
      durationMs: Date.now() - started,
    },
  };
}

/**
 * Live candidate generation — reuses the app's parallel option generator
 * (rich prompt compilation + schema validation + repair). Requires a configured
 * provider; `generateValidatedRecipeOptionsParallel` resolves its own client.
 */
export async function generateCandidates(
  prompt: string,
  opts?: { candidateCount?: number; shopId?: string },
): Promise<Candidate[]> {
  const classification = classifyUserIntentKeywords(prompt);
  const optionCount = clamp(opts?.candidateCount ?? 3, 1, 3);
  const options = await generateValidatedRecipeOptionsParallel(
    prompt,
    { moduleType: classification.moduleType, intent: classification.intent, surface: classification.surface },
    { optionCount, shopId: opts?.shopId, confidenceScore: classification.confidenceScore },
  );
  return options.map((o, i) => ({ id: `cand${i + 1}`, explanation: o.explanation, recipe: o.recipe }));
}

/**
 * Offline candidate generation — N direct `generateRecipe` calls validated
 * against the recipe schema. Used by the no-network CLI smoke and tests with
 * `StubLlmClient`; invalid outputs are skipped.
 */
export async function generateCandidatesWithClient(
  client: LlmClient,
  prompt: string,
  count: number,
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const res = await client.generateRecipe(`${prompt}\n\n(variation ${i + 1})`);
    const parsed = RecipeSpecSchema.safeParse(JSON.parse(res.rawJson));
    if (parsed.success) out.push({ id: `cand${out.length + 1}`, explanation: `variation ${i + 1}`, recipe: parsed.data });
  }
  return out;
}

/** Resolve the module type label for a prompt (for the report header). */
export function moduleTypeForPrompt(prompt: string): string {
  return classifyUserIntentKeywords(prompt).moduleType;
}
