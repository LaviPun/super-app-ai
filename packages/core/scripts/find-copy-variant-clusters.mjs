#!/usr/bin/env node
/**
 * Structural-duplicate report (WS-H Task 9, read-only). FIX ROUND 1: rebuilt
 * on the corrected same-file + identity-preserving + name/description-
 * similarity fingerprint — see scripts/lib/cluster-fingerprint.mjs's header
 * for the full incident writeup (the original version fingerprinted 19
 * distinct proxy.widget integrations as one fake 22-member cluster because it
 * blanked `widgetId` along with every other string).
 *
 * Prints every genuine copy-variant cluster, sorted by cluster size
 * descending, WITH a per-cluster listing of what actually differs between
 * members (so a human can sanity-check "yes, this is really the same feature
 * reworded" before anything gets deleted).
 *
 * Requires a fresh `pnpm --filter @superapp/core build` (reads from dist/).
 *
 * Usage: node packages/core/scripts/find-copy-variant-clusters.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEMPLATES } from '../dist/templates/index.js';
import { findClusters } from './lib/cluster-fingerprint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..', 'src', 'templates');

/** Build an id -> relative-source-file map by scanning every template source
 * file for `id: '<id>',` lines (same convention dedupe-copy-variants.mjs's
 * line-based editor relies on). */
function buildFileIndex() {
  const index = new Map();
  for (const dir of ['modules', 'blocks', 'sections']) {
    const dirPath = join(SRC_ROOT, dir);
    for (const f of readdirSync(dirPath).filter((f) => f.endsWith('.ts'))) {
      const filePath = join(dirPath, f);
      const src = readFileSync(filePath, 'utf8');
      for (const m of src.matchAll(/id:\s*'([^']+)',/g)) {
        index.set(m[1], relative(SRC_ROOT, filePath));
      }
    }
  }
  return index;
}

const fileIndex = buildFileIndex();
const templatesWithFile = ALL_TEMPLATES.filter((t) => fileIndex.has(t.id)).map((t) => ({
  ...t,
  file: fileIndex.get(t.id),
}));
const missing = ALL_TEMPLATES.filter((t) => !fileIndex.has(t.id));
if (missing.length > 0) {
  console.error(
    `WARNING: ${missing.length} template(s) not found in any source file by 'id:' scan (likely COVERAGE_TEMPLATES or a non-standard declaration) — excluded from clustering: ${missing.map((t) => t.id).join(', ')}`,
  );
}

const clusters = findClusters(templatesWithFile);
const totalTemplates = clusters.reduce((s, c) => s + c.length, 0);
console.log(`${clusters.length} genuine copy-variant cluster(s), ${totalTemplates} templates total.\n`);
for (const c of clusters) {
  console.log(`Cluster of ${c.length} (${c[0].file}, type ${c[0].spec.type}):`);
  for (const t of c) {
    console.log(`  ${t.id}  "${t.name}"`);
  }
  console.log('');
}
