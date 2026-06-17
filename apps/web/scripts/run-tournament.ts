/**
 * Module-Candidate Tournament runner.
 *
 * Generates competing module candidates from one prompt, then runs them through
 * the 5-phase pipeline (Audit → Judge → Verify → Harvest → Synthesize) and
 * writes a markdown + JSON report.
 *
 * Offline / CI (default):   pnpm --filter web tournament --prompt "exit intent popup"
 *   Uses StubLlmClient and offline candidate generation — no network, no DB.
 *   Validates the whole pipeline runs and picks a winner from the verify gates.
 *
 * Live LLM run:             TOURNAMENT_LIVE=1 pnpm --filter web tournament --prompt "…"
 *   Uses the configured provider for agents and the app's parallel generator
 *   for candidates. Costs real tokens.
 *
 * Flags: --prompt <text> (required) · --candidates <1-3> · --concurrency <n> · --out <dir>
 * Exit codes: 0 = winner chosen · 1 = no candidates / all failed verify · 2 = usage error
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StubLlmClient, getLlmClient, type LlmClient } from '../app/services/ai/llm.server.js';
import {
  runTournament,
  generateCandidates,
  generateCandidatesWithClient,
  moduleTypeForPrompt,
} from '../app/services/tournament/tournament.server.js';
import { renderJson, renderMarkdown, fmtTokens } from '../app/services/tournament/report.js';
import type { AgentRun } from '../app/services/tournament/types.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const prompt = arg('prompt');
  if (!prompt) {
    console.error('Usage: tournament --prompt "<request>" [--candidates 1-3] [--concurrency n] [--out dir]');
    process.exit(2);
  }
  const candidateCount = Math.max(1, Math.min(3, parseInt(arg('candidates') ?? '3', 10) || 3));
  const concurrency = Math.max(1, parseInt(arg('concurrency') ?? '5', 10) || 5);
  const outDir = resolve(process.cwd(), arg('out') ?? 'scripts/tournament-out');
  const live = process.env.TOURNAMENT_LIVE === '1';

  console.info(`[tournament] mode: ${live ? 'LIVE (real provider)' : 'OFFLINE (StubLlmClient)'}`);
  console.info(`[tournament] prompt: "${prompt}"`);

  // Resolve client + candidates.
  let client: LlmClient = new StubLlmClient();
  let candidates;
  if (live) {
    const resolved = await getLlmClient(undefined);
    client = resolved.client;
    console.info(`[tournament] provider: ${resolved.providerId ?? 'env-key'}`);
    candidates = await generateCandidates(prompt, { candidateCount });
  } else {
    candidates = await generateCandidatesWithClient(client, prompt, candidateCount);
  }

  if (!candidates.length) {
    console.error('[tournament] no valid candidates generated — aborting.');
    process.exit(1);
  }
  console.info(`[tournament] candidates: ${candidates.map((c) => c.id).join(', ')}\n`);

  // Live agent progress — echoes the reference UI's per-agent rows.
  const onAgentSettled = (r: AgentRun) => {
    const status = r.error ? '✗' : '✓';
    const score = r.finding ? ` · ${r.finding.score.toFixed(1)}/10` : '';
    console.info(
      `  ${status} ${r.id.padEnd(28)} ${r.model.padEnd(24)} ${fmtTokens(r.tokensIn + r.tokensOut).padStart(7)} tok · ${r.durationMs}ms${score}`,
    );
  };

  const result = await runTournament({
    client,
    prompt,
    moduleType: moduleTypeForPrompt(prompt),
    candidates,
    concurrency,
    onAgentSettled,
  });

  // Write reports.
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mdPath = resolve(outDir, `tournament-${stamp}.md`);
  const jsonPath = resolve(outDir, `tournament-${stamp}.json`);
  writeFileSync(mdPath, renderMarkdown(result), 'utf8');
  writeFileSync(jsonPath, renderJson(result), 'utf8');

  // Console leaderboard.
  const divider = '='.repeat(64);
  console.info(`\n${divider}`);
  console.info('TOURNAMENT LEADERBOARD');
  console.info(divider);
  [...result.scores]
    .sort((a, b) => b.finalScore - a.finalScore)
    .forEach((s, i) => {
      const crown = s.candidateId === result.winnerId ? ' 👑' : '';
      console.info(
        `${i + 1}. ${s.candidateId.padEnd(8)} final ${s.finalScore.toFixed(1).padStart(4)}/10  (judge ${s.judgeScore.toFixed(1)}, audit ${s.auditAvg.toFixed(1)}, verify −${s.verifyPenalty})${crown}`,
      );
    });
  console.info(divider);
  console.info(`Winner: ${result.winnerId ?? 'none'}`);
  console.info(`Tokens: ${fmtTokens(result.totals.tokensIn)} in / ${fmtTokens(result.totals.tokensOut)} out · ${result.totals.agentCount} agents`);
  console.info(`Report: ${mdPath}`);
  console.info(`JSON:   ${jsonPath}`);

  process.exit(result.winnerId ? 0 : 1);
}

main().catch((err) => {
  console.error('[tournament] fatal:', err);
  process.exit(1);
});
