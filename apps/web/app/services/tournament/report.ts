/**
 * Tournament report rendering — markdown (human) + JSON (machine).
 * Pure functions over a `TournamentResult`; no filesystem access here.
 */
import type { AgentRun, TournamentResult, VerifyResult } from '~/services/tournament/types';

/** "24.7k" / "950" token formatting, matching the reference UI. */
export function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function gateGlyph(ok: boolean): string {
  return ok ? '✓' : '✗';
}

function verifyLine(v: VerifyResult): string {
  const parts = [
    `schema ${gateGlyph(v.schemaValid)}`,
    `compile ${gateGlyph(v.compilerSuccess)}`,
    `non-destructive ${gateGlyph(v.nonDestructive)}`,
    `design-qa ${gateGlyph(v.designQaPass)}`,
  ];
  return `${v.candidateId}: ${parts.join(' · ')} (${v.gatesRun} gates)${v.error ? ` — ${v.error}` : ''}`;
}

function agentRow(r: AgentRun): string {
  const score = r.finding ? `${r.finding.score.toFixed(1)}/10` : '—';
  return `| \`${r.id}\` | ${r.model} | ${fmtTokens(r.tokensIn + r.tokensOut)} tok | ${r.durationMs}ms | ${score} |`;
}

export function renderMarkdown(result: TournamentResult): string {
  const lines: string[] = [];
  lines.push(`# Module Tournament`);
  lines.push('');
  lines.push(`**Prompt:** ${result.prompt}`);
  lines.push(`**Module type:** \`${result.moduleType}\` · **Candidates:** ${result.candidates.length} · **Agents:** ${result.totals.agentCount}`);
  lines.push(`**Tokens:** ${fmtTokens(result.totals.tokensIn)} in / ${fmtTokens(result.totals.tokensOut)} out · **Wall:** ${(result.totals.durationMs / 1000).toFixed(1)}s`);
  lines.push('');

  // Leaderboard
  lines.push(`## 🏆 Leaderboard`);
  lines.push('');
  lines.push(`| Rank | Candidate | Final | Judge | Audit avg | Verify penalty |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  [...result.scores]
    .sort((a, b) => b.finalScore - a.finalScore)
    .forEach((s, i) => {
      const crown = s.candidateId === result.winnerId ? ' 👑' : '';
      lines.push(
        `| ${i + 1} | \`${s.candidateId}\`${crown} | **${s.finalScore.toFixed(1)}** | ${s.judgeScore.toFixed(1)} | ${s.auditAvg.toFixed(1)} | −${s.verifyPenalty} |`,
      );
    });
  lines.push('');

  // Winner / synthesis
  lines.push(`## Synthesis`);
  lines.push('');
  lines.push(result.winnerId ? `**Winner:** \`${result.winnerId}\`` : '**No winner** — all candidates failed verification.');
  lines.push('');
  lines.push(result.synthesis);
  lines.push('');

  // Harvest
  lines.push(`## Harvested wins`);
  lines.push('');
  if (result.harvest.length) result.harvest.forEach((h) => lines.push(`- ${h}`));
  else lines.push('_None extracted._');
  lines.push('');

  // Verify detail
  lines.push(`## Verify gates`);
  lines.push('');
  result.verify.forEach((v) => lines.push(`- ${verifyLine(v)}`));
  lines.push('');

  // Per-phase agent tables
  for (const phase of ['audit', 'judge', 'harvest', 'synthesize'] as const) {
    const rows = result.agentRuns.filter((r) => r.phase === phase);
    if (!rows.length) continue;
    lines.push(`## Phase: ${phase} (${rows.length} agent${rows.length === 1 ? '' : 's'})`);
    lines.push('');
    lines.push(`| Agent | Model | Tokens | Time | Score |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    rows.forEach((r) => lines.push(agentRow(r)));
    lines.push('');
  }

  return lines.join('\n');
}

export function renderJson(result: TournamentResult): string {
  return JSON.stringify(result, null, 2);
}
