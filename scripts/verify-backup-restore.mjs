#!/usr/bin/env node
/**
 * Local backup restore verification (DevOps hardening 2026-09, item g).
 *
 * Owner-run equivalent of .github/workflows/db-restore-verify.yml: restores a
 * nightly pg_dump backup into a SCRATCH dockerized Postgres 18 and
 * sanity-counts the result. Never touches a real database.
 *
 * Usage:
 *   node scripts/verify-backup-restore.mjs                 # download newest GitHub artifact via `gh`
 *   node scripts/verify-backup-restore.mjs --file dump.sql.gz   # verify a local dump file
 *
 * Requirements: docker, and (without --file) an authenticated `gh` CLI.
 * Plain .mjs (not .ts): repo-root scripts are node-runnable without a TS
 * runner (matches build-theme-liquid.mjs / check-shopify-config.mjs).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CONTAINER = 'superapp-restore-verify';
const PG_IMAGE = 'postgres:18-alpine';
const CRITICAL_TABLES = ['Shop', 'Session', 'Job', 'AppSettings', '_prisma_migrations'];

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });
}

function fail(msg) {
  console.error(`\n✗ FAIL: ${msg}`);
  process.exitCode = 1;
  cleanup();
  process.exit(1);
}

function cleanup() {
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
}

function downloadArtifactZip(workdir) {
  console.log('Locating newest superapp-postgres-* artifact via gh …');
  const raw = sh('gh', [
    'api',
    'repos/{owner}/{repo}/actions/artifacts?per_page=50',
    '--jq',
    '[.artifacts[] | select(.name | startswith("superapp-postgres-")) | select(.expired == false)] | sort_by(.created_at) | last // empty',
  ]).trim();
  if (!raw) fail('No unexpired backup artifact found — is db-backup.yml producing backups? (check open ops-backup-failure issues)');
  const artifact = JSON.parse(raw);
  console.log(`Downloading artifact ${artifact.name} (${artifact.size_in_bytes} bytes) …`);
  const zipPath = join(workdir, 'backup.zip');
  const dl = spawnSync('bash', ['-c', `gh api "repos/{owner}/{repo}/actions/artifacts/${artifact.id}/zip" > "${zipPath}"`], {
    stdio: 'inherit',
  });
  if (dl.status !== 0) fail('artifact download failed');
  const unzip = spawnSync('unzip', ['-o', zipPath, '-d', workdir], { stdio: 'inherit' });
  if (unzip.status !== 0) fail('unzip failed');
  const dump = readdirSync(workdir).find((f) => f.startsWith('superapp-postgres-') && f.endsWith('.sql.gz'));
  if (!dump) fail('downloaded artifact contains no superapp-postgres-*.sql.gz');
  return join(workdir, dump);
}

function psql(sql) {
  const res = spawnSync('docker', ['exec', '-e', 'PGPASSWORD=postgres', CONTAINER, 'psql', '-U', 'postgres', '-d', 'superapp_restore', '-tAc', sql], {
    encoding: 'utf8',
  });
  if (res.status !== 0) return null;
  return res.stdout.trim();
}

async function main() {
  const workdir = mkdtempSync(join(tmpdir(), 'superapp-restore-'));
  process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

  const fileArg = process.argv.indexOf('--file');
  const dumpFile = fileArg !== -1 ? process.argv[fileArg + 1] : downloadArtifactZip(workdir);
  if (!dumpFile) fail('no dump file resolved');
  console.log(`Dump: ${dumpFile}`);

  cleanup(); // remove any stale container from a previous run
  console.log(`Starting scratch ${PG_IMAGE} …`);
  sh('docker', ['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=superapp_restore', PG_IMAGE]);

  // Wait for readiness (up to ~30s).
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const res = spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' });
    if (res.status === 0) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) fail('scratch postgres never became ready');

  console.log('Restoring (ON_ERROR_STOP=1) …');
  const restore = spawnSync(
    'bash',
    ['-c', `gunzip -c "${dumpFile}" | docker exec -i -e PGPASSWORD=postgres ${CONTAINER} psql -v ON_ERROR_STOP=1 -U postgres -d superapp_restore -q`],
    { stdio: 'inherit' },
  );
  if (restore.status !== 0) fail('restore errored — the backup is NOT cleanly restorable');

  const tables = Number(psql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"));
  console.log(`Restored public tables: ${tables}`);
  if (!(tables >= 20)) fail(`only ${tables} tables restored (expected the full app schema, 20+)`);

  for (const t of CRITICAL_TABLES) {
    const count = psql(`SELECT count(*) FROM "${t}"`);
    if (count == null) fail(`critical table "${t}" is missing from the restored dump`);
    console.log(`  ${t}: ${count} rows`);
  }
  const migrations = Number(psql('SELECT count(*) FROM "_prisma_migrations"'));
  if (!(migrations >= 1)) fail('_prisma_migrations is empty — this does not look like the production database');

  cleanup();
  console.log('\n✓ Restore verification PASSED.');
}

main().catch((err) => fail(err?.message ?? String(err)));
