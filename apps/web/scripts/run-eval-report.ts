/**
 * Nightly eval-report runner (035 vocab-hardening — Phase 5b, the flywheel).
 *
 * Emits ONE machine-readable quality snapshot for the whole golden-prompt suite,
 * consumed by the nightly CI job (uploaded as an artifact + appended to the JSONL
 * history that the trend gate reads).
 *
 * Two tiers, both driven off `GOLDEN_PROMPTS`:
 *
 *   1. DETERMINISTIC (always, free, no network):
 *      `runEvals(StubLlmClient)` over ALL ~50 prompts → schemaValidRate,
 *      avgQualityScore (competitor-parity), richnessFailRate, avgRankScore.
 *
 *   2. LIVE (opt-in, costs tokens): when `EVAL_LIVE=1` AND a provider key is
 *      present, runs the offline-candidate tournament with the REAL client over a
 *      handful of representative prompts and records the mean winner score as
 *      `judgeScore`. Guarded per-prompt so one provider hiccup never sinks the
 *      report. Never prints keys.
 *
 * Output:
 *   • Writes `<out>/eval-report-<date>.json` (the artifact).
 *   • Prints one `EVAL_REPORT_JSONL <json>` line to stdout (the history append).
 *
 * Usage:
 *   pnpm --filter web tsx --tsconfig tsconfig.scripts.json scripts/run-eval-report.ts [--out dir]
 *   EVAL_LIVE=1 ANTHROPIC_API_KEY=… (…) pnpm … run-eval-report.ts   # adds judgeScore
 *
 * Exit codes: 0 on success (the trend gate, not this script, decides pass/fail).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runEvals, GOLDEN_PROMPTS } from '../app/services/ai/evals.server.js';
import { StubLlmClient, getLlmClient, type LlmClient } from '../app/services/ai/llm.server.js';
import { runTournament, generateCandidatesWithClient, moduleTypeForPrompt } from '../app/services/tournament/tournament.server.js';

/** The eval-report row schema — one line per nightly run, appended to history JSONL. */
export type EvalReport = {
  date: string;
  total: number;
  schemaValidRate: number;
  compilerSuccessRate: number;
  nonDestructiveRate: number;
  avgQualityScore: number;
  richnessFailRate: number;
  avgRankScore: number;
  /** Present only when the live tier ran. */
  judgeScore?: number;
  /** How the report was produced. */
  mode: 'deterministic' | 'deterministic+live';
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** A provider key is present in the environment (never logged). */
function hasProviderKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || process.env.EVAL_PROVIDER_ID?.trim());
}

/** ~10 representative prompts spanning the parity families for the live tier. */
const LIVE_PROMPT_IDS = [
  'hero-split',
  'popup-exit',
  'discount-tiered',
  'checkout-upsell',
  'flow-order',
  'messaging-email',
  'pricing-table',
  'faq-section',
  'admin-block',
  'adv-competitor-privy',
];

/** Run the live tournament tier and return the mean winner score (0-10), or undefined. */
async function runLiveTier(client: LlmClient): Promise<number | undefined> {
  const prompts = GOLDEN_PROMPTS.filter((g) => LIVE_PROMPT_IDS.includes(g.id));
  const winnerScores: number[] = [];
  for (const gp of prompts) {
    try {
      const candidates = await generateCandidatesWithClient(client, gp.prompt, 2);
      if (candidates.length === 0) continue;
      const result = await runTournament({
        client,
        prompt: gp.prompt,
        moduleType: moduleTypeForPrompt(gp.prompt),
        candidates,
        concurrency: 4,
      });
      const winner = result.scores.find((s) => s.candidateId === result.winnerId);
      if (winner) winnerScores.push(winner.finalScore);
    } catch (err) {
      console.warn(`[eval-report] live tier skipped "${gp.id}": ${String(err).slice(0, 120)}`);
    }
  }
  if (winnerScores.length === 0) return undefined;
  return winnerScores.reduce((a, b) => a + b, 0) / winnerScores.length;
}

async function main() {
  const outDir = resolve(process.cwd(), arg('out') ?? 'scripts/eval-out');
  const live = process.env.EVAL_LIVE === '1' && hasProviderKey();

  console.info(`[eval-report] deterministic suite over ${GOLDEN_PROMPTS.length} prompts (StubLlmClient)…`);
  const summary = await runEvals(new StubLlmClient(), 3);

  let judgeScore: number | undefined;
  if (live) {
    console.info('[eval-report] live tier enabled — running offline-candidate tournament with the configured provider…');
    try {
      const resolved = await getLlmClient(undefined);
      console.info(`[eval-report] provider: ${resolved.providerId ?? 'env-key'}`);
      judgeScore = await runLiveTier(resolved.client);
    } catch (err) {
      console.warn(`[eval-report] live tier unavailable: ${String(err).slice(0, 160)}`);
    }
  } else {
    console.info('[eval-report] live tier disabled (set EVAL_LIVE=1 with a provider key to enable).');
  }

  const report: EvalReport = {
    date: new Date().toISOString(),
    total: summary.total,
    schemaValidRate: round(summary.schemaValidRate),
    compilerSuccessRate: round(summary.compilerSuccessRate),
    nonDestructiveRate: round(summary.nonDestructiveRate),
    avgQualityScore: round(summary.avgQualityScore),
    richnessFailRate: round(summary.richnessFailRate),
    avgRankScore: round(summary.avgRankScore),
    ...(judgeScore != null ? { judgeScore: round(judgeScore) } : {}),
    mode: judgeScore != null ? 'deterministic+live' : 'deterministic',
  };

  mkdirSync(outDir, { recursive: true });
  const stamp = report.date.replace(/[:.]/g, '-');
  const jsonPath = resolve(outDir, `eval-report-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  // Human summary + the machine-readable JSONL line CI appends to history.
  console.info(`\n[eval-report] schemaValid ${pct(report.schemaValidRate)} · avgQuality ${report.avgQualityScore.toFixed(3)} · richnessFail ${pct(report.richnessFailRate)}${report.judgeScore != null ? ` · judge ${report.judgeScore.toFixed(2)}/10` : ''}`);
  console.info(`[eval-report] artifact: ${jsonPath}`);
  console.info(`EVAL_REPORT_JSONL ${JSON.stringify(report)}`);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

main().catch((err) => {
  console.error('[eval-report] fatal:', err);
  process.exit(1);
});
