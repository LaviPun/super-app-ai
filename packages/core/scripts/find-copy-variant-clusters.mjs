#!/usr/bin/env node
/**
 * Structural-duplicate report (WS-H Task 9, read-only).
 *
 * Prints every cluster of `TemplateEntry`s sharing `spec.type` + a
 * string-blanked `JSON.stringify(spec.config)` fingerprint (see
 * scripts/lib/cluster-fingerprint.mjs), sorted by cluster size descending.
 * This is the exact script used to derive the "34 clusters / 121 templates"
 * figure in the WS-H plan's "Verified ground truth" — run it any time to
 * reconfirm that number is still accurate.
 *
 * Requires a fresh `pnpm --filter @superapp/core build` (reads from dist/).
 *
 * Usage: node packages/core/scripts/find-copy-variant-clusters.mjs
 */
import { ALL_TEMPLATES } from '../dist/templates/index.js';
import { findClusters } from './lib/cluster-fingerprint.mjs';

const clusters = findClusters(ALL_TEMPLATES);
const totalTemplates = clusters.reduce((s, c) => s + c.length, 0);
console.log(`${clusters.length} clusters, ${totalTemplates} templates total.`);
for (const c of clusters) {
  console.log(`  ${c.length}  ${c.map((t) => t.id).join(', ')}`);
}
