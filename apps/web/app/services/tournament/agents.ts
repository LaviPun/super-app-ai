/**
 * Agent prompt builders + response schemas for each tournament phase.
 *
 * Every agent is just an `LlmClient.generateRecipe(prompt, { responseSchema })`
 * call. Audit and judge agents emit a `Finding` (score + strengths/risks/notes);
 * harvest and synthesize emit free-form prose we parse leniently.
 */
import type { Candidate, Dimension, Finding } from '~/services/tournament/types';

/** JSON Schema mirror of `FindingSchema`, passed to providers that support structured output. */
export const FINDING_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'strengths', 'risks', 'notes'],
  properties: {
    score: { type: 'number', minimum: 0, maximum: 10, description: '0 unusable … 10 excellent' },
    strengths: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
};

const DIMENSION_BRIEF: Record<Dimension, string> = {
  tests: 'testability and behavioral coverage — would this module be easy to verify and hard to silently break?',
  api: 'API/config surface quality — naming, shape, defaults, and how cleanly a merchant would configure it.',
  security: 'security and safety — destructive operations, injection/escaping, scope creep, and data exposure.',
  correctness: 'functional correctness — does the recipe actually implement what the prompt asked for, without bugs?',
  fit: 'fit to intent and design system — does it match the user request and the project design conventions?',
};

function recipeBlock(candidate: Candidate): string {
  return [
    `Candidate ${candidate.id}`,
    candidate.explanation ? `Rationale: ${candidate.explanation}` : '',
    'Recipe JSON:',
    '```json',
    JSON.stringify(candidate.recipe, null, 2),
    '```',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Audit agent: score one candidate on one dimension. */
export function buildAuditPrompt(dimension: Dimension, candidate: Candidate, userPrompt: string): string {
  return [
    `You are an independent reviewer auditing a generated Shopify module on a single dimension: ${dimension}.`,
    `Focus only on: ${DIMENSION_BRIEF[dimension]}`,
    '',
    `Original user request: "${userPrompt}"`,
    '',
    recipeBlock(candidate),
    '',
    'Return a JSON object with: score (0-10 for this dimension only), strengths (array), risks (array), notes (string).',
    'Be critical and specific. Do not award a high score unless it is earned on this dimension.',
  ].join('\n');
}

/** Judge agent: weigh one candidate's five audit findings into one verdict. */
export function buildJudgePrompt(
  candidate: Candidate,
  findings: Array<{ dimension: Dimension; finding: Finding | null }>,
  userPrompt: string,
): string {
  const findingLines = findings.map(
    (f) =>
      `- ${f.dimension}: ${
        f.finding ? `score ${f.finding.score}/10 — ${f.finding.notes || '(no notes)'}` : 'no parseable finding'
      }`,
  );
  return [
    'You are the head judge. Aggregate independent audit findings for one candidate into a single overall verdict.',
    `Original user request: "${userPrompt}"`,
    '',
    recipeBlock(candidate),
    '',
    'Audit findings:',
    ...findingLines,
    '',
    'Return a JSON object with: score (0-10 overall, weighting correctness and fit most heavily), strengths, risks, notes (a one-paragraph rationale).',
  ].join('\n');
}

/** Harvest agent: extract reusable wins across all candidates. */
export function buildHarvestPrompt(candidates: Candidate[], userPrompt: string): string {
  return [
    'You are reviewing several competing implementations of the same request. Identify the strongest, reusable ideas from across ALL candidates — patterns worth keeping regardless of which candidate wins.',
    `Original user request: "${userPrompt}"`,
    '',
    candidates.map(recipeBlock).join('\n\n'),
    '',
    'Return a JSON object with: notes (a short summary) and strengths (an array where each item is one concrete reusable win, prefixed with the candidate id it came from). Leave score as 0 and risks empty.',
  ].join('\n');
}

/** Synthesize agent: pick a winner and justify, given final scores + harvest. */
export function buildSynthesizePrompt(
  candidates: Candidate[],
  ranking: Array<{ candidateId: string; finalScore: number; rationale: string }>,
  harvest: string[],
  userPrompt: string,
): string {
  const rankLines = ranking.map((r, i) => `${i + 1}. ${r.candidateId} — ${r.finalScore.toFixed(1)}/10 (${r.rationale})`);
  return [
    'You are synthesizing the result of a module tournament. Given the ranked candidates and the harvested reusable wins, declare the winner and explain why, then note which harvested ideas the winner should adopt.',
    `Original user request: "${userPrompt}"`,
    '',
    'Ranking (already computed from audit + judge + deterministic verify gates):',
    ...rankLines,
    '',
    'Harvested reusable wins:',
    ...(harvest.length ? harvest.map((h) => `- ${h}`) : ['- (none)']),
    '',
    'Return a JSON object with: notes (2-4 sentences: the winner id, why it won, and which harvested wins to fold in). Leave score 0, strengths/risks may list adopt/avoid items.',
  ].join('\n');
}
