#!/usr/bin/env node
/**
 * Tier-tag the remaining untagged templates (WS-H Task 10).
 *
 * `TemplateTier = 'exemplar' | 'standard' | 'floor'` is consumed by RAG ranking
 * (`solution-search.server.ts`: exemplar +1.5, floor -1 and excluded from the
 * top pick) but only a small minority of the library carries a `tier` at all —
 * the rest is invisible to that ranking logic. This script fills in the gap
 * with a documented heuristic (not hidden in code):
 *
 *   1. Already-tagged templates keep their existing tag, always. This script
 *      never overwrites a tier a human or an earlier pass already set.
 *   2. Every `COVERAGE_TEMPLATES` entry (the coverage-floor backfill file,
 *      `packages/core/src/templates/coverage.ts`) gets `tier: 'floor'`
 *      explicitly if untagged — its entries exist only to satisfy the "every
 *      RECIPE_SPEC_TYPE has >=1 template" invariant, not to be recommended.
 *      (In practice every coverage.ts entry already carries an explicit tier,
 *      so this is a safety net, not a live code path today.)
 *   3. For every remaining copy-variant cluster (see
 *      scripts/lib/cluster-fingerprint.mjs — same same-file + identity-
 *      preserving + name/description-similarity fingerprint Task 9's dedupe
 *      uses (fix round 1), now re-run against the POST-DEDUPE library so
 *      ranking runs against the final set, not templates about to be deleted;
 *      on the current library this is 0 clusters, so this rule is dormant
 *      today but stays correct for future authoring): the cluster's single
 *      "best" member is decided by (a) any member ALREADY tagged `exemplar`
 *      wins outright, else (b) the member with the most non-empty string leaf
 *      values in `spec.config` (a completeness proxy — same idea
 *      dedupe-copy-variants.mjs used for "keep the exemplar first"), else
 *      (c) earliest declaration order. An untagged winner gets `standard`;
 *      every other untagged member of that cluster gets `floor`.
 *   4. Every remaining untagged template (not in any cluster) gets `standard`.
 *
 * `--check` reports the tag each untagged template WOULD receive without
 * writing anything. Without `--check`, rewrites the source files for real.
 *
 * Insertion mechanism: line-based, like dedupe-copy-variants.mjs — finds the
 * entry's `id: '<id>',` line (its bounds already established as the first
 * property of every TemplateEntry across this codebase) and inserts
 * `tier: '<value>',` on the line immediately after it. `id` is a REQUIRED
 * TemplateEntry field (unlike the optional `icon`), so anchoring on it is safe
 * for every entry in the library, not just the ones that happen to carry an
 * icon.
 *
 * Requires a fresh `pnpm --filter @superapp/core build` (reads from dist/) to
 * compute clusters + existing tiers; edits the readable TS SOURCE under
 * src/templates/, not dist.
 *
 * Usage: node packages/core/scripts/tag-template-tiers.mjs [--check]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEMPLATES } from '../dist/templates/index.js';
import { COVERAGE_TEMPLATES } from '../dist/templates/coverage.js';
import { findClusters } from './lib/cluster-fingerprint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..', 'src', 'templates');
const CHECK = process.argv.includes('--check');

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
      if (m[1]) index.set(m[1], relative(SRC_ROOT, file));
    }
  }
  return index;
}

/** Count non-empty string leaf values anywhere in a config object — a proxy
 * for "how filled-in is this template" (same idea as dedupe's exemplar-first
 * preference, generalized to a comparable score). */
function completeness(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.length > 0 ? 1 : 0;
  if (typeof value === 'object') {
    return Object.values(value).reduce((sum, v) => sum + completeness(v), 0);
  }
  return 0; // numbers/booleans don't count toward "copy completeness"
}

const coverageIds = new Set(COVERAGE_TEMPLATES.map((t) => t.id));
const fileIndex = buildFileIndex();
const templatesWithFile = ALL_TEMPLATES.filter((t) => fileIndex.has(t.id)).map((t) => ({
  ...t,
  file: fileIndex.get(t.id),
}));
const clusters = findClusters(templatesWithFile);
const clusterByMemberId = new Map();
for (const cluster of clusters) {
  for (const t of cluster) clusterByMemberId.set(t.id, cluster);
}

/** For a cluster, decide which member is the "winner" (gets 'standard' if
 * untagged; every other untagged member gets 'floor'). */
function clusterWinner(cluster) {
  const exemplar = cluster.find((t) => t.tier === 'exemplar');
  if (exemplar) return exemplar;
  let best = cluster[0];
  let bestScore = completeness(best.spec.config);
  for (const t of cluster.slice(1)) {
    const score = completeness(t.spec.config);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

/** id -> desired tier, for every currently-untagged template. */
const decisions = new Map();
for (const t of ALL_TEMPLATES) {
  if (t.tier) continue; // rule 1: never touch an already-tagged template
  if (coverageIds.has(t.id)) {
    decisions.set(t.id, 'floor'); // rule 2
    continue;
  }
  const cluster = clusterByMemberId.get(t.id);
  if (cluster) {
    const winner = clusterWinner(cluster);
    decisions.set(t.id, winner.id === t.id ? 'standard' : 'floor'); // rule 3
  } else {
    decisions.set(t.id, 'standard'); // rule 4
  }
}

const byTier = { exemplar: 0, standard: 0, floor: 0 };
for (const tier of decisions.values()) byTier[tier]++;
console.log(
  `${decisions.size} untagged template(s) to tag: ${byTier.standard} standard, ${byTier.floor} floor (0 exemplar — this heuristic never invents a new exemplar).`,
);

if (decisions.size === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

if (CHECK) {
  process.exit(0);
}

/** Insert `tier: '<tier>',` right after the `id: '<id>',` line in `lines`.
 * Returns { lines, tagged } — tagged=false if the id wasn't found in this file. */
function tagEntryById(lines, id, tier) {
  const idLineIdx = lines.findIndex((l) => l.trim() === `id: '${id}',`);
  if (idLineIdx === -1) return { lines, tagged: false };
  const indent = lines[idLineIdx].match(/^\s*/)[0];
  const next = [...lines.slice(0, idLineIdx + 1), `${indent}tier: '${tier}',`, ...lines.slice(idLineIdx + 1)];
  return { lines: next, tagged: true };
}

let totalTagged = 0;
const remaining = new Map(decisions);
for (const file of allSourceFiles()) {
  let lines = readFileSync(file, 'utf8').split('\n');
  let fileChanged = false;
  for (const [id, tier] of [...remaining]) {
    const { lines: nextLines, tagged } = tagEntryById(lines, id, tier);
    if (tagged) {
      lines = nextLines;
      fileChanged = true;
      remaining.delete(id);
      totalTagged++;
    }
  }
  if (fileChanged) writeFileSync(file, lines.join('\n'));
}

if (remaining.size > 0) {
  console.error(`ERROR: could not locate source entries for: ${[...remaining.keys()].join(', ')}`);
  process.exit(1);
}

console.log(`Tagged ${totalTagged} template(s) across the source tree.`);
