#!/usr/bin/env node
/**
 * Dedupe copy-variant clusters down to a per-cluster cap (WS-H Task 9, H2).
 * FIX ROUND 1: rebuilt on the corrected same-file + identity-preserving +
 * name/description-similarity fingerprint (scripts/lib/cluster-fingerprint.mjs)
 * after the original naive fingerprint deleted 31 genuinely distinct templates
 * (see that module's header for the full incident writeup). `templateId` has
 * no Prisma foreign key anywhere (H2) — deleting excess TRUE copy-variants is
 * still safe, but "true copy-variant" is now checked far more strictly.
 *
 * For every cluster with MORE than `--cap` (default 4) members: keep the first
 * `cap` (preferring any already `tier: 'exemplar'`, then declaration order),
 * delete the object literal for every other member from its declaring source
 * file. With the corrected fingerprint, the honest result across the current
 * library is 0 clusters even exist (let alone exceed the cap) — see the Task
 * 8-10 report's "Fix round 1" section for the full per-cluster-group listing
 * (empty) that justifies this. This script is kept as a permanent, correct
 * guardrail for FUTURE authoring, not because it currently deletes anything.
 *
 * `--check` reports what WOULD be deleted (id + file) without writing
 * anything. Without `--check`, rewrites the source files for real.
 *
 * Deletion mechanism unchanged from the original: line-based, not a
 * whole-tree regex (see removeEntryById below for the exact contract).
 *
 * Requires a fresh `pnpm --filter @superapp/core build` (reads from dist/) to
 * compute clusters; edits the readable TS SOURCE under src/templates/, not dist.
 *
 * Usage: node packages/core/scripts/dedupe-copy-variants.mjs [--cap N] [--check]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEMPLATES } from '../dist/templates/index.js';
import { findClusters } from './lib/cluster-fingerprint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..', 'src', 'templates');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const capIdx = args.indexOf('--cap');
const CAP = capIdx !== -1 ? Number(args[capIdx + 1]) : 4;

/** All .ts template source files (same three dirs the integrity test scans). */
function allSourceFiles() {
  return ['modules', 'blocks', 'sections'].flatMap((d) =>
    readdirSync(join(SRC_ROOT, d))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(SRC_ROOT, d, f)),
  );
}

function buildFileIndex() {
  const index = new Map();
  for (const file of allSourceFiles()) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/id:\s*'([^']+)',/g)) {
      index.set(m[1], relative(SRC_ROOT, file));
    }
  }
  return index;
}

function decideKeepAndDelete(cluster, cap) {
  const ranked = [...cluster].sort((a, b) => {
    const aEx = a.tier === 'exemplar' ? 0 : 1;
    const bEx = b.tier === 'exemplar' ? 0 : 1;
    if (aEx !== bEx) return aEx - bEx;
    return 0; // stable sort preserves declaration order for ties
  });
  return { keep: ranked.slice(0, cap), remove: ranked.slice(cap) };
}

/** Remove the TemplateEntry object literal for `id` from `lines` (array of source
 * lines, mutated copy returned). Returns { lines, removed } — removed=false if
 * the id wasn't found in this file (caller tries the next file). */
function removeEntryById(lines, id) {
  const idLineIdx = lines.findIndex((l) => l.trim() === `id: '${id}',`);
  if (idLineIdx === -1) return { lines, removed: false };

  let startIdx = -1;
  for (let i = idLineIdx - 1; i >= 0; i--) {
    if (lines[i] === '  {') {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) throw new Error(`could not find opening '  {' for ${id} above line ${idLineIdx}`);

  // Absorb an immediately-preceding single-line `//` comment ONLY if it looks
  // like a per-entry annotation (mentions this exact id) — never a shared
  // section-header comment, which must survive for the entries still below it.
  // (Fix round 1: the original version absorbed ANY preceding comment line
  // unconditionally, silently deleting shared `// ── section header ──`
  // comments along with the first cluster member under them.)
  if (startIdx > 0 && lines[startIdx - 1].includes(id)) {
    startIdx -= 1;
  }

  let endIdx = -1;
  for (let i = idLineIdx + 1; i < lines.length; i++) {
    if (lines[i] === '  },' || lines[i] === '  }') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) throw new Error(`could not find closing '  },' for ${id} below line ${idLineIdx}`);

  const nextLines = [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
  return { lines: nextLines, removed: true };
}

const fileIndex = buildFileIndex();
const templatesWithFile = ALL_TEMPLATES.filter((t) => fileIndex.has(t.id)).map((t) => ({
  ...t,
  file: fileIndex.get(t.id),
}));

const clusters = findClusters(templatesWithFile);
const oversized = clusters.filter((c) => c.length > CAP);

const toRemove = new Set();
const decisions = [];
for (const cluster of oversized) {
  const { keep, remove } = decideKeepAndDelete(cluster, CAP);
  for (const t of remove) toRemove.add(t.id);
  decisions.push({ clusterSize: cluster.length, keep: keep.map((t) => t.id), remove: remove.map((t) => t.id) });
}

console.log(`${clusters.length} genuine copy-variant cluster(s) found (any size).`);
console.log(`${oversized.length} oversized cluster(s) (cap=${CAP}), ${toRemove.size} template(s) to remove:`);
for (const d of decisions) {
  console.log(`  cluster of ${d.clusterSize}: keep [${d.keep.join(', ')}]  remove [${d.remove.join(', ')}]`);
}

if (toRemove.size === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

if (CHECK) {
  process.exit(0);
}

let totalRemoved = 0;
for (const file of allSourceFiles()) {
  let lines = readFileSync(file, 'utf8').split('\n');
  let fileChanged = false;
  for (const id of [...toRemove]) {
    const { lines: nextLines, removed } = removeEntryById(lines, id);
    if (removed) {
      lines = nextLines;
      fileChanged = true;
      toRemove.delete(id);
      totalRemoved++;
      console.log(`  removed ${id} from ${file.replace(SRC_ROOT, 'templates')}`);
    }
  }
  if (fileChanged) {
    writeFileSync(file, lines.join('\n'));
  }
}

if (toRemove.size > 0) {
  console.error(`ERROR: could not locate source entries for: ${[...toRemove].join(', ')}`);
  process.exit(1);
}

console.log(`Removed ${totalRemoved} template(s) across the source tree.`);
