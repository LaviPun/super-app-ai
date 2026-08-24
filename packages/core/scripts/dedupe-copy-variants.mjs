#!/usr/bin/env node
/**
 * Dedupe copy-variant clusters down to a per-cluster cap (WS-H Task 9, H2).
 *
 * A "copy-variant cluster" (see scripts/lib/cluster-fingerprint.mjs) is a group
 * of TemplateEntry objects sharing spec.type + config SHAPE, differing only in
 * copy text. `templateId` has no Prisma foreign key anywhere (H2, WS-H plan) —
 * deleting excess copy-variants down to a cap is safe.
 *
 * For every cluster with MORE than `--cap` (default 4) members: keep the first
 * `cap` (preferring any already `tier: 'exemplar'`, then declaration order —
 * the order ALL_TEMPLATES iterates them, which is stable/deterministic), delete
 * the object literal for every other member from its declaring source file.
 *
 * `--check` reports what WOULD be deleted (id + file) without writing anything.
 * Without `--check`, rewrites the source files for real.
 *
 * Deletion mechanism: line-based, not a whole-tree regex. Every TemplateEntry in
 * this codebase is a top-level array element indented exactly 2 spaces (`  {`
 * ... `  },`), with `id:` as its first property — confirmed by inspection across
 * every file this script touches. For a target id, the entry's bounds are found
 * by scanning outward from the `id: '<id>',` line to the nearest exactly-2-space
 * `{` above and the nearest exactly-2-space `},`/`}` below, plus an optional
 * single-line `//` comment immediately preceding the entry. This is safe against
 * copy text that happens to contain `{`/`}` characters (which a brace-counting
 * approach would have to parse around) because it only ever inspects INDENTATION
 * of whole lines, never nested content.
 *
 * Requires a fresh `pnpm --filter @superapp/core build` (reads from dist/) to
 * compute clusters; edits the readable TS SOURCE under src/templates/, not dist.
 *
 * Usage: node packages/core/scripts/dedupe-copy-variants.mjs [--cap N] [--check]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEMPLATES } from '../dist/templates/index.js';
import { findClusters } from './lib/cluster-fingerprint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..', 'src', 'templates');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const capIdx = args.indexOf('--cap');
const CAP = capIdx !== -1 ? Number(args[capIdx + 1]) : 4;

function decideKeepAndDelete(cluster, cap) {
  const ranked = [...cluster].sort((a, b) => {
    const aEx = a.tier === 'exemplar' ? 0 : 1;
    const bEx = b.tier === 'exemplar' ? 0 : 1;
    if (aEx !== bEx) return aEx - bEx;
    return 0; // stable sort preserves declaration order for ties
  });
  return { keep: ranked.slice(0, cap), remove: ranked.slice(cap) };
}

/** All .ts template source files (same three dirs the integrity test scans). */
function allSourceFiles() {
  return ['modules', 'blocks', 'sections'].flatMap((d) =>
    readdirSync(join(SRC_ROOT, d))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(SRC_ROOT, d, f)),
  );
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

  // Absorb an immediately-preceding single-line `//` comment (own line, same
  // 2-space indent) as part of the deletion — e.g. `  // POS-HOME-03 — ...`.
  if (startIdx > 0 && /^\s*\/\/.*$/.test(lines[startIdx - 1])) {
    startIdx -= 1;
  }

  let endIdx = -1;
  for (let i = idLineIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (lines[i] === '  },' || lines[i] === '  }') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) throw new Error(`could not find closing '  },' for ${id} below line ${idLineIdx}`);

  const nextLines = [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
  return { lines: nextLines, removed: true };
}

const clusters = findClusters(ALL_TEMPLATES);
const oversized = clusters.filter((c) => c.length > CAP);

/** id -> keep|remove decision, flattened across all oversized clusters. */
const toRemove = new Set();
const decisions = [];
for (const cluster of oversized) {
  const { keep, remove } = decideKeepAndDelete(cluster, CAP);
  for (const t of remove) toRemove.add(t.id);
  decisions.push({ clusterSize: cluster.length, keep: keep.map((t) => t.id), remove: remove.map((t) => t.id) });
}

console.log(
  `${oversized.length} oversized cluster(s) (cap=${CAP}), ${toRemove.size} template(s) to remove:`,
);
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
  let src = readFileSync(file, 'utf8');
  let lines = src.split('\n');
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
