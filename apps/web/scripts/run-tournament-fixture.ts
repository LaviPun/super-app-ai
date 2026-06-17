/**
 * Fixture tournament runner — runs the 5-phase engine with NO third-party AI.
 *
 * Candidate recipes and every audit/judge/harvest/synthesize finding are
 * supplied by a fixture file (authored out-of-band, e.g. by a Claude Code
 * subagent). The engine still runs the real deterministic Verify gates
 * (compiler / non-destructive / schema / design-QA) and the real scoring +
 * report — only the generative/evaluative text is replayed from the fixture.
 *
 *   pnpm --filter web tournament:fixture --fixture <path.json> [--out dir]
 *
 * Fixture shape:
 * {
 *   "prompt": "...",
 *   "moduleType": "theme.section",
 *   "candidates": [{ "id": "cand1", "explanation": "...", "recipe": { ...RecipeSpec } }],
 *   "responses": {
 *     "audit:cand1:tests": { "score": 7, "strengths": [], "risks": [], "notes": "..." },
 *     "judge:cand1": { ... }, "harvest:all": { ... }, "synthesize:final": { ... }
 *   }
 * }
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runTournament } from '../app/services/tournament/tournament.server.js';
import { ScriptedLlmClient } from '../app/services/tournament/scripted-client.js';
import { renderJson, renderMarkdown, fmtTokens } from '../app/services/tournament/report.js';
import type { Candidate } from '../app/services/tournament/types.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Fixture = {
  prompt: string;
  moduleType: string;
  candidates: Candidate[];
  responses: Record<string, unknown>;
};

async function main() {
  const fixturePath = arg('fixture');
  if (!fixturePath) {
    console.error('Usage: tournament:fixture --fixture <path.json> [--out dir] [--concurrency n]');
    process.exit(2);
  }
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), fixturePath), 'utf8')) as Fixture;
  const concurrency = Math.max(1, parseInt(arg('concurrency') ?? '5', 10) || 5);
  const outDir = resolve(process.cwd(), arg('out') ?? 'scripts/tournament-out');

  console.info('[tournament] mode: FIXTURE (subagent-authored, no third-party AI)');
  console.info(`[tournament] prompt: "${fixture.prompt}"`);
  console.info(`[tournament] candidates: ${fixture.candidates.map((c) => c.id).join(', ')}\n`);

  const client = new ScriptedLlmClient(fixture.responses);
  const result = await runTournament({
    client,
    prompt: fixture.prompt,
    moduleType: fixture.moduleType,
    candidates: fixture.candidates,
    concurrency,
    onAgentSettled: (r) => {
      const score = r.finding ? ` · ${r.finding.score.toFixed(1)}/10` : ' · (no finding)';
      console.info(`  ✓ ${r.id.padEnd(28)} ${fmtTokens(r.tokensIn + r.tokensOut).padStart(7)} tok${score}`);
    },
  });

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mdPath = resolve(outDir, `tournament-${stamp}.md`);
  const jsonPath = resolve(outDir, `tournament-${stamp}.json`);
  writeFileSync(mdPath, renderMarkdown(result), 'utf8');
  writeFileSync(jsonPath, renderJson(result), 'utf8');

  const divider = '='.repeat(64);
  console.info(`\n${divider}\nTOURNAMENT LEADERBOARD\n${divider}`);
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
  result.verify.forEach((v) =>
    console.info(`  verify ${v.candidateId}: schema ${v.schemaValid ? '✓' : '✗'} compile ${v.compilerSuccess ? '✓' : '✗'} nd ${v.nonDestructive ? '✓' : '✗'} qa ${v.designQaPass ? '✓' : '✗'}${v.error ? ` — ${v.error}` : ''}`),
  );
  console.info(`Report: ${mdPath}`);
  console.info(`JSON:   ${jsonPath}`);
  process.exit(result.winnerId ? 0 : 1);
}

main().catch((err) => {
  console.error('[tournament] fatal:', err);
  process.exit(1);
});
