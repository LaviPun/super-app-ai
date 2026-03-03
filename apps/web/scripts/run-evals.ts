/**
 * Evals runner script — run with: pnpm --filter web exec tsx scripts/run-evals.ts
 *
 * Set EVAL_PROVIDER_ID to run against a real LLM provider (by provider DB id).
 * Without it, uses the StubLlmClient.
 */
import { runEvals } from '../app/services/ai/evals.server.js';
import { StubLlmClient, getLlmClient } from '../app/services/ai/llm.server.js';

const providerId = process.env.EVAL_PROVIDER_ID;

async function main() {
  let client = new StubLlmClient();

  if (providerId) {
    const resolved = await getLlmClient(undefined);
    client = resolved.client;
    console.log(`[evals] Using provider: ${resolved.providerId ?? 'stub'}`);
  } else {
    console.log('[evals] Using StubLlmClient (set EVAL_PROVIDER_ID to use real provider)');
  }

  const summary = await runEvals(client, 3);

  console.log(`\n${'='.repeat(60)}`);
  console.log('EVALS SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total prompts:        ${summary.total}`);
  console.log(`Schema valid:         ${summary.schemaValidCount}/${summary.total} (${(summary.schemaValidRate * 100).toFixed(1)}%)`);
  console.log(`Compiler success:     ${summary.compilerSuccessCount}/${summary.total} (${(summary.compilerSuccessRate * 100).toFixed(1)}%)`);
  console.log(`\nPer-prompt results:`);

  for (const r of summary.results) {
    const status = r.schemaValid ? (r.compilerSuccess ? '✓' : '~') : '✗';
    const typeMatch = r.matchedExpectedType ? '✓' : '≠';
    const extra = r.error ? ` | ${r.error.slice(0, 80)}` : '';
    console.log(`  ${status} [${typeMatch}] ${r.promptId} (${r.durationMs}ms, ${r.attempts} attempt(s))${extra}`);
  }

  console.log(`\nLegend: ✓=pass ~=schema ok but compile failed ✗=schema invalid`);
  console.log(`        [✓]=matched expected type [≠]=unexpected type`);

  const passThreshold = 0.9;
  if (summary.schemaValidRate < passThreshold) {
    console.error(`\n[evals] FAIL: schema-valid rate ${(summary.schemaValidRate * 100).toFixed(1)}% < ${passThreshold * 100}% threshold`);
    process.exit(1);
  } else {
    console.log(`\n[evals] PASS`);
  }
}

main().catch(err => {
  console.error('[evals] Error:', err);
  process.exit(1);
});
