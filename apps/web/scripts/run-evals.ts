/**
 * AI Eval Runner — two modes:
 *
 * 1. CI / local (no API key):   pnpm --filter web evals
 *    Uses StubLlmClient. Validates the eval pipeline itself works (schema + compiler + non-destructive).
 *
 * 2. Live LLM run:              EVAL_PROVIDER_ID=<id> pnpm --filter web evals
 *    Uses the configured provider. Validates real model outputs hit all three quality gates.
 *
 * Exit codes:
 *   0  — all thresholds met
 *   1  — at least one threshold failed
 */
import { runEvals } from '../app/services/ai/evals.server.js';
import { StubLlmClient, getLlmClient } from '../app/services/ai/llm.server.js';

// Quality gate thresholds (can be overridden by env vars for staged rollout)
const SCHEMA_VALID_THRESHOLD   = parseFloat(process.env.EVAL_THRESHOLD_SCHEMA   ?? '0.9');
const COMPILER_SUCCESS_THRESHOLD = parseFloat(process.env.EVAL_THRESHOLD_COMPILER ?? '0.9');
const NON_DESTRUCTIVE_THRESHOLD  = parseFloat(process.env.EVAL_THRESHOLD_ND      ?? '1.0');

const providerId = process.env.EVAL_PROVIDER_ID;

async function main() {
  let client = new StubLlmClient();

  if (providerId) {
    const resolved = await getLlmClient(undefined);
    client = resolved.client;
    console.info(`[evals] Using provider: ${resolved.providerId ?? 'stub'}`);
  } else {
    console.info('[evals] Using StubLlmClient (set EVAL_PROVIDER_ID to use real provider)');
  }

  const summary = await runEvals(client, 3);

  const divider = '='.repeat(64);
  console.info(`\n${divider}`);
  console.info('EVALS SUMMARY');
  console.info(divider);
  console.info(`Total prompts        : ${summary.total}`);
  console.info(`Schema valid         : ${summary.schemaValidCount}/${summary.total} (${pct(summary.schemaValidRate)}) [threshold: ${pct(SCHEMA_VALID_THRESHOLD)}]`);
  console.info(`Compiler success     : ${summary.compilerSuccessCount}/${summary.total} (${pct(summary.compilerSuccessRate)}) [threshold: ${pct(COMPILER_SUCCESS_THRESHOLD)}]`);
  console.info(`Non-destructive ops  : ${summary.nonDestructiveCount}/${summary.total} (${pct(summary.nonDestructiveRate)}) [threshold: ${pct(NON_DESTRUCTIVE_THRESHOLD)}]`);

  console.info(`\nPer-prompt results:`);
  for (const r of summary.results) {
    const schemaIcon   = r.schemaValid     ? '✓' : '✗';
    const compileIcon  = r.compilerSuccess ? '✓' : (r.schemaValid ? '~' : '-');
    const ndIcon       = r.nonDestructive  ? '✓' : (r.compilerSuccess ? '✗' : '-');
    const typeMatch    = r.matchedExpectedType ? '✓' : '≠';

    const errorNote = r.nonDestructiveViolations.length > 0
      ? ` | ND: ${r.nonDestructiveViolations[0].slice(0, 80)}`
      : r.error
        ? ` | ${r.error.slice(0, 80)}`
        : '';

    console.info(
      `  schema:${schemaIcon} compile:${compileIcon} nd:${ndIcon} type:[${typeMatch}] ` +
      `${r.promptId} (${r.durationMs}ms, ${r.attempts} attempt(s))${errorNote}`
    );
  }

  console.info(`\nLegend: ✓=pass ✗=fail ~=schema ok but compile failed -=skipped (prior stage failed)`);
  console.info(`        [✓]=matched expected type [≠]=unexpected type`);
  console.info(`        nd=non-destructive op check`);

  // Evaluate thresholds
  const failures: string[] = [];

  if (summary.schemaValidRate < SCHEMA_VALID_THRESHOLD) {
    failures.push(
      `Schema-valid rate ${pct(summary.schemaValidRate)} < threshold ${pct(SCHEMA_VALID_THRESHOLD)}`
    );
  }
  if (summary.compilerSuccessRate < COMPILER_SUCCESS_THRESHOLD) {
    failures.push(
      `Compiler-success rate ${pct(summary.compilerSuccessRate)} < threshold ${pct(COMPILER_SUCCESS_THRESHOLD)}`
    );
  }
  if (summary.nonDestructiveRate < NON_DESTRUCTIVE_THRESHOLD) {
    failures.push(
      `Non-destructive rate ${pct(summary.nonDestructiveRate)} < threshold ${pct(NON_DESTRUCTIVE_THRESHOLD)}`
    );
  }

  if (failures.length > 0) {
    console.error(`\n[evals] FAIL`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  } else {
    console.info(`\n[evals] PASS — all quality gates met`);
  }
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

main().catch(err => {
  console.error('[evals] Fatal error:', err);
  process.exit(1);
});
