/**
 * AI Eval Runner — three modes:
 *
 * 1. CI / local (no API key):   pnpm --filter web evals
 *    Uses StubLlmClient. Validates the eval pipeline itself works (schema + compiler + non-destructive).
 *
 * 2. Live LLM run (DB provider): EVAL_PROVIDER_ID=<AiProvider id or name> pnpm --filter web evals
 *    Pins EXACTLY that provider row. Fails fast if the row is not in the eval DB.
 *
 * 3. Live LLM run (env client):  EVAL_PROVIDER_ID=env pnpm --filter web evals
 *    Uses the env-configured client (ANTHROPIC_API_KEY / ANTHROPIC_DEFAULT_MODEL, etc.).
 *
 * Validity guarantees for live runs (modes 2 and 3):
 *   - No cross-provider fallback — a run labeled claude-sonnet-* can never silently
 *     score another model's outputs.
 *   - ANTHROPIC_SKILLS / ANTHROPIC_CODE_EXECUTION env are ignored so the request
 *     shape matches production's DB-provider calls.
 *
 * Exit codes:
 *   0  — all thresholds met
 *   1  — at least one threshold failed (or EVAL_PROVIDER_ID could not be resolved)
 */
import { runEvals, resolveEvalLlmClient, EvalProviderNotFoundError } from '../app/services/ai/evals.server.js';

const strictMode = process.argv.includes('--strict');
const defaultPassThreshold = strictMode ? '0.99' : '0.9';

// Quality gate thresholds (can be overridden by env vars for staged rollout)
const SCHEMA_VALID_THRESHOLD = parseFloat(
  process.env.EVAL_THRESHOLD_SCHEMA ?? defaultPassThreshold,
);
const COMPILER_SUCCESS_THRESHOLD = parseFloat(
  process.env.EVAL_THRESHOLD_COMPILER ?? defaultPassThreshold,
);
const NON_DESTRUCTIVE_THRESHOLD = parseFloat(
  process.env.EVAL_THRESHOLD_ND ?? '1.0',
);
const ALLOWED_VALUES_THRESHOLD = parseFloat(
  process.env.EVAL_THRESHOLD_ALLOWED_VALUES ?? defaultPassThreshold,
);
const FORBIDDEN_SURFACE_THRESHOLD = parseFloat(
  process.env.EVAL_THRESHOLD_FORBIDDEN_SURFACE ?? defaultPassThreshold,
);

const providerId = process.env.EVAL_PROVIDER_ID?.trim();

async function main() {
  let resolved: Awaited<ReturnType<typeof resolveEvalLlmClient>>;
  try {
    resolved = await resolveEvalLlmClient(providerId);
  } catch (err) {
    if (err instanceof EvalProviderNotFoundError) {
      console.error(`[evals] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const client = resolved.client;

  console.info(`[evals] Using provider: ${resolved.label}`);
  if (providerId) {
    console.info('[evals] Cross-provider fallback DISABLED for eval runs — scoring exactly one model');
    console.info('[evals] ANTHROPIC_SKILLS / ANTHROPIC_CODE_EXECUTION env IGNORED for eval runs (production DB-provider request shape)');
  }
  console.info(`[evals] Gate mode: ${strictMode ? 'strict (0.99)' : 'default (0.90)'}`);

  const summary = await runEvals(client, 3);

  const divider = '='.repeat(64);
  console.info(`\n${divider}`);
  console.info('EVALS SUMMARY');
  console.info(divider);
  console.info(`Total prompts        : ${summary.total}`);
  console.info(`Schema valid         : ${summary.schemaValidCount}/${summary.total} (${pct(summary.schemaValidRate)}) [threshold: ${pct(SCHEMA_VALID_THRESHOLD)}]`);
  console.info(`Compiler success     : ${summary.compilerSuccessCount}/${summary.total} (${pct(summary.compilerSuccessRate)}) [threshold: ${pct(COMPILER_SUCCESS_THRESHOLD)}]`);
  console.info(`Non-destructive ops  : ${summary.nonDestructiveCount}/${summary.total} (${pct(summary.nonDestructiveRate)}) [threshold: ${pct(NON_DESTRUCTIVE_THRESHOLD)}]`);
  console.info(`Allowed-values gate  : ${summary.allowedValuesCompliantCount}/${summary.total} (${pct(summary.allowedValuesCompliantRate)}) [threshold: ${pct(ALLOWED_VALUES_THRESHOLD)}]`);
  console.info(`Forbidden-surface gate: ${summary.forbiddenSurfaceRejectCount}/${summary.total} (${pct(summary.forbiddenSurfaceRejectRate)}) [threshold: ${pct(FORBIDDEN_SURFACE_THRESHOLD)}]`);
  console.info(`Avg quality (parity) : ${summary.avgQualityScore.toFixed(3)} (competitor-parity checklist, 0-1)`);
  console.info(`Richness fail rate   : ${pct(summary.richnessFailRate)} (prompts with ≥1 blocking richness fail)`);
  console.info(`Avg rank score       : ${summary.avgRankScore.toFixed(1)} (deterministic option-ranking, schema-valid only)`);
  if (summary.avgJudgeScore != null) {
    console.info(`Avg judge score      : ${summary.avgJudgeScore.toFixed(2)}/10 (LLM judge — live run)`);
  }

  console.info(`\nPer-prompt results:`);
  for (const r of summary.results) {
    const schemaIcon   = r.schemaValid     ? '✓' : '✗';
    const compileIcon  = r.compilerSuccess ? '✓' : (r.schemaValid ? '~' : '-');
    const ndIcon       = r.nonDestructive  ? '✓' : (r.compilerSuccess ? '✗' : '-');
    const allowedIcon  = r.allowedValuesCompliant ? '✓' : '✗';
    const surfaceIcon  = r.forbiddenSurfaceRejected ? '✓' : '✗';
    const typeMatch    = r.matchedExpectedType ? '✓' : '≠';

    const errorNote = r.nonDestructiveViolations.length > 0
      ? ` | ND: ${r.nonDestructiveViolations[0].slice(0, 80)}`
      : r.error
        ? ` | ${r.error.slice(0, 80)}`
        : '';

    console.info(
      `  schema:${schemaIcon} compile:${compileIcon} nd:${ndIcon} type:[${typeMatch}] ` +
      `allowed:${allowedIcon} surface:${surfaceIcon} ` +
      `${r.promptId} (${r.durationMs}ms, ${r.attempts} attempt(s))${errorNote}`
    );
  }

  console.info(`\nLegend: ✓=pass ✗=fail ~=schema ok but compile failed -=skipped (prior stage failed)`);
  console.info(`        [✓]=matched expected type [≠]=unexpected type`);
  console.info(`        nd=non-destructive op check`);

  // Distinct errors, deduped, with enough characters to be actionable — the
  // 80-char per-line truncation above once hid a billing error entirely.
  const distinctErrors = new Map<string, string[]>();
  for (const r of summary.results) {
    if (!r.error) continue;
    const ids = distinctErrors.get(r.error) ?? [];
    ids.push(r.promptId);
    distinctErrors.set(r.error, ids);
  }
  if (distinctErrors.size > 0) {
    console.info(`\nDistinct errors (${distinctErrors.size}, first 400 chars each):`);
    for (const [error, ids] of distinctErrors) {
      const idList = ids.length > 5 ? `${ids.slice(0, 5).join(', ')}, +${ids.length - 5} more` : ids.join(', ');
      const text = error.length > 400 ? `${error.slice(0, 400)}…` : error;
      console.info(`  [${ids.length}x — ${idList}]\n    ${text}`);
    }
  }

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
  if (summary.allowedValuesCompliantRate < ALLOWED_VALUES_THRESHOLD) {
    failures.push(
      `Allowed-values rate ${pct(summary.allowedValuesCompliantRate)} < threshold ${pct(ALLOWED_VALUES_THRESHOLD)}`
    );
  }
  if (summary.forbiddenSurfaceRejectRate < FORBIDDEN_SURFACE_THRESHOLD) {
    failures.push(
      `Forbidden-surface rejection rate ${pct(summary.forbiddenSurfaceRejectRate)} < threshold ${pct(FORBIDDEN_SURFACE_THRESHOLD)}`
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
