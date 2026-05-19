#!/usr/bin/env node
/**
 * Platform V2 verification gate — runs typecheck, lint (where present), unit,
 * integration, Playwright, evals, prisma validate, and per-package builds.
 *
 * Usage:
 *   node scripts/v2-test-matrix.mjs [--continue] [--skip=evals,e2e,web-build]
 *
 * Exit code: 0 when all non-skipped steps pass; 1 otherwise (unless --continue,
 * which always exits 1 if any step failed but still runs the full matrix).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const V2_FILTERS = [
  '@superapp/platform-contracts',
  '@superapp/db',
  '@superapp/network-security',
  '@superapp/core',
  '@superapp/rate-limit',
  '@superapp/api',
  '@superapp/workers',
  '@superapp/frontend',
];

const filterArg = V2_FILTERS.map((name) => `--filter ${name}`).join(' ');

const args = process.argv.slice(2);
const continueOnFailure = args.includes('--continue');
const skipArg = args.find((a) => a.startsWith('--skip='));
const skip = new Set(
  (skipArg?.slice('--skip='.length) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** @type {{ id: string; title: string; category: string; cmd: string; cwd?: string; skipKey?: string; knownBaselineFailure?: boolean }[]} */
const STEPS = [
  {
    id: 'typecheck-v2',
    title: 'Typecheck (V2 packages)',
    category: 'typecheck',
    cmd: `pnpm ${filterArg} typecheck`,
  },
  {
    id: 'lint-web',
    title: 'Lint (Remix baseline — shared contracts)',
    category: 'lint',
    cmd: 'pnpm --filter web lint',
    skipKey: 'lint',
  },
  {
    id: 'lint-v2-present',
    title: 'Lint (V2 packages, if-present)',
    category: 'lint',
    cmd: `pnpm ${filterArg} --if-present lint`,
    skipKey: 'lint',
  },
  {
    id: 'prisma-validate',
    title: 'Prisma validate (legacy schema — V2 DB boundary)',
    category: 'prisma',
    cmd: 'pnpm exec prisma validate',
    cwd: 'apps/web',
    skipKey: 'prisma',
  },
    {
    id: 'build-deps-v2',
    title: 'Build V2 library packages (dist types for dependents)',
    category: 'build',
    cmd: 'pnpm --filter @superapp/platform-contracts --filter @superapp/network-security --filter @superapp/core --filter @superapp/db build',
    skipKey: 'build-deps',
  },
{
    id: 'unit-v2',
    title: 'Unit tests (V2 packages)',
    category: 'unit',
    cmd: `pnpm ${filterArg} test`,
  },
  {
    id: 'integration-api',
    title: 'Integration — API job queue + orchestration + connectors',
    category: 'integration',
    cmd: 'pnpm --filter @superapp/api exec vitest run src/__tests__/job-orchestrator.test.ts src/__tests__/bullmq-job-queue.test.ts src/__tests__/connectors.routes.test.ts',
    skipKey: 'integration',
  },
  {
    id: 'integration-workers',
    title: 'Integration — workers runtime + processors + webhook/connector',
    category: 'integration',
    cmd: 'pnpm --filter @superapp/workers exec vitest run src/__tests__/runtime.test.ts src/__tests__/processors.test.ts src/__tests__/webhook-flow.test.ts src/__tests__/connector-execution.test.ts',
    skipKey: 'integration',
  },
  {
    id: 'integration-legacy-parity',
    title: 'Integration — Remix parity (connector worker + preview sandbox routes)',
    category: 'integration',
    cmd: 'pnpm --filter web exec vitest run app/__tests__/connector-worker.test.ts app/__tests__/connector-test-routes.test.ts',
    skipKey: 'integration',
  },
  {
    id: 'evals-stub',
    title: 'AI evals (stub LLM — legacy web harness)',
    category: 'evals',
    cmd: 'pnpm --filter web evals',
    skipKey: 'evals',
    knownBaselineFailure: true,
  },
  {
    id: 'evals-strict',
    title: 'AI evals strict gate (CI parity)',
    category: 'evals',
    cmd: 'pnpm --filter web evals --strict',
    skipKey: 'evals-strict',
    knownBaselineFailure: true,
  },
  {
    id: 'playwright-frontend',
    title: 'Playwright — Next internal AI assistant',
    category: 'e2e',
    cmd: 'pnpm --filter @superapp/frontend test:e2e',
    skipKey: 'e2e',
  },
  {
    id: 'build-platform-contracts',
    title: 'Build @superapp/platform-contracts',
    category: 'build',
    cmd: 'pnpm --filter @superapp/platform-contracts build',
    skipKey: 'build',
  },
  {
    id: 'build-db',
    title: 'Build @superapp/db',
    category: 'build',
    cmd: 'pnpm --filter @superapp/db build',
    skipKey: 'build',
  },
  {
    id: 'build-network-security',
    title: 'Build @superapp/network-security',
    category: 'build',
    cmd: 'pnpm --filter @superapp/network-security build',
    skipKey: 'build',
  },
  {
    id: 'build-core',
    title: 'Build @superapp/core',
    category: 'build',
    cmd: 'pnpm --filter @superapp/core build',
    skipKey: 'build',
  },
  {
    id: 'build-api',
    title: 'Build @superapp/api',
    category: 'build',
    cmd: 'pnpm --filter @superapp/api build',
    skipKey: 'build',
  },
  {
    id: 'build-workers',
    title: 'Build @superapp/workers',
    category: 'build',
    cmd: 'pnpm --filter @superapp/workers build',
    skipKey: 'build',
  },
  {
    id: 'build-frontend',
    title: 'Build @superapp/frontend',
    category: 'build',
    cmd: 'pnpm --filter @superapp/frontend build',
    skipKey: 'build',
  },
  {
    id: 'build-web',
    title: 'Build Remix web (legacy baseline)',
    category: 'build',
    cmd: 'pnpm --filter web build',
    skipKey: 'web-build',
    knownBaselineFailure: true,
  },
];

function runStep(step) {
  const started = Date.now();
  const result = spawnSync(step.cmd, {
    cwd: step.cwd ? join(root, step.cwd) : root,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY ?? 'test-placeholder',
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET ?? 'test-placeholder',
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL ?? 'https://placeholder.example.com',
      ENCRYPTION_KEY:
        process.env.ENCRYPTION_KEY ??
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      INTERNAL_ADMIN_PASSWORD: process.env.INTERNAL_ADMIN_PASSWORD ?? 'test-placeholder',
      INTERNAL_ADMIN_SESSION_SECRET:
        process.env.INTERNAL_ADMIN_SESSION_SECRET ?? 'test-placeholder',
      CRON_SECRET: process.env.CRON_SECRET ?? 'test-placeholder',
    },
  });
  const durationMs = Date.now() - started;
  const status = result.status === 0 ? 'pass' : 'fail';
  return { status, durationMs, signal: result.signal ?? null };
}

/** @type {Record<string, { status: string; durationMs: number; knownBaselineFailure?: boolean }>} */
const report = {};
let failed = 0;
let skippedCount = 0;

console.log('\n=== Platform V2 test matrix ===\n');

for (const step of STEPS) {
  if (step.skipKey && skip.has(step.skipKey)) {
    console.log(`\n--- SKIP ${step.title} (--skip=${step.skipKey}) ---\n`);
    report[step.id] = { status: 'skipped', durationMs: 0 };
    skippedCount += 1;
    continue;
  }

  console.log(`\n--- ${step.title} [${step.category}] ---\n`);
  const outcome = runStep(step);
  report[step.id] = {
    status: outcome.status,
    durationMs: outcome.durationMs,
    knownBaselineFailure: step.knownBaselineFailure,
  };

  if (outcome.status !== 'pass') {
    failed += 1;
    const tag = step.knownBaselineFailure ? ' (known baseline failure)' : '';
    console.error(`\n✗ ${step.id} failed${tag}\n`);
    if (!continueOnFailure) {
      break;
    }
  } else {
    console.log(`\n✓ ${step.id} passed (${outcome.durationMs}ms)\n`);
  }
}

const resultsDir = join(root, 'test-results');
mkdirSync(resultsDir, { recursive: true });
const reportPath = join(resultsDir, 'v2-matrix.json');
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      continueOnFailure,
      skip: [...skip],
      failed,
      skipped: skippedCount,
      steps: report,
    },
    null,
    2,
  ),
);

console.log(`\nReport written to ${reportPath}`);
console.log(`Failed steps: ${failed}; skipped: ${skippedCount}`);

if (failed > 0) {
  process.exit(1);
}
