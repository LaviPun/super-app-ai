/**
 * Module-Candidate Tournament — shared types.
 *
 * A "tournament" runs several generated module candidates through a 5-phase
 * pipeline (Audit → Judge → Verify → Harvest → Synthesize) and picks a winner.
 * It is the in-repo analog of the multi-agent "PR tournament" reference UI:
 * instead of competing pull requests, we compare competing generated recipes.
 *
 * Pure types + the `Finding` schema. No I/O here.
 */
import { z } from 'zod';
import type { RecipeSpec } from '@superapp/core';

/** Audit dimensions — one agent runs per (candidate × dimension). */
export const DIMENSIONS = ['tests', 'api', 'security', 'correctness', 'fit'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type Phase = 'audit' | 'judge' | 'verify' | 'harvest' | 'synthesize';

/** Structured output every audit/judge agent is asked to emit. */
export const FindingSchema = z.object({
  /** 0 (unusable) … 10 (excellent) for this dimension. */
  score: z.number().min(0).max(10),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  notes: z.string().default(''),
});
export type Finding = z.infer<typeof FindingSchema>;

/** A generated module under evaluation. */
export type Candidate = {
  id: string;
  explanation: string;
  recipe: RecipeSpec;
};

/** One LLM agent invocation, with token/model accounting from `GenerateResult`. */
export type AgentRun = {
  id: string; // e.g. "audit:cand2:security"
  phase: Phase;
  candidateId: string | null; // null for cross-candidate phases (harvest/synthesize)
  dimension: Dimension | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  /** Parsed finding, or null when the model output did not parse (e.g. stub mode). */
  finding: Finding | null;
  /** Raw model text, kept for the report when parsing failed. */
  rawText: string;
  error?: string;
};

/** Deterministic verify gates for one candidate (no LLM). */
export type VerifyResult = {
  candidateId: string;
  schemaValid: boolean;
  compilerSuccess: boolean;
  nonDestructive: boolean;
  nonDestructiveViolations: string[];
  designQaPass: boolean;
  designQaSummary: string;
  /** Number of blocking richness-floor / basicness failures (035 vocab-hardening). */
  richnessFailCount: number;
  /** Number of gates actually evaluated — the report's stand-in for "tools used". */
  gatesRun: number;
  error?: string;
};

/** Per-candidate aggregate after Judge + Verify reconciliation. */
export type CandidateScore = {
  candidateId: string;
  auditAvg: number; // mean of audit findings (0..10)
  judgeScore: number; // judge panel score (0..10)
  verifyPenalty: number; // subtracted for failed deterministic gates
  finalScore: number; // judgeScore - verifyPenalty, clamped to [0,10]
  rationale: string;
};

export type TournamentResult = {
  prompt: string;
  moduleType: string;
  candidates: Candidate[];
  agentRuns: AgentRun[];
  verify: VerifyResult[];
  scores: CandidateScore[];
  winnerId: string | null;
  /** Reusable patterns harvested across candidates (Harvest phase). */
  harvest: string[];
  /** Final synthesis prose (Synthesize phase). */
  synthesis: string;
  /** Optional "best-of" recipe emitted by Synthesize, validated through verify gates. */
  synthesizedRecipe: RecipeSpec | null;
  synthesizedRecipeVerify: VerifyResult | null;
  totals: { tokensIn: number; tokensOut: number; agentCount: number; durationMs: number };
};
