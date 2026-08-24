/**
 * Shared structural-duplicate fingerprinting logic (WS-H Task 9).
 *
 * A "copy-variant cluster" is a group of `TemplateEntry`s that share `spec.type`
 * plus a string-blanked `JSON.stringify(spec.config)` fingerprint — i.e. the
 * SAME shape (same keys, same nesting, same non-string values), differing only
 * in copy text (title/subtitle/body/labels/URLs/etc, all strings). This is the
 * single source of truth for that fingerprint, imported by:
 *   - find-copy-variant-clusters.mjs (read-only report)
 *   - dedupe-copy-variants.mjs (the batch codemod)
 *   - packages/core/src/__tests__/template-library-integrity.test.ts (the guard)
 * so the definition can never drift between the three call sites.
 */

/** Recursively replace every string leaf with the sentinel 'S' so two configs
 * that differ only in copy text produce an identical blanked shape. Object keys
 * are sorted so key-order differences don't defeat the fingerprint. */
export function blankStrings(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return typeof obj === 'string' ? 'S' : obj;
  }
  if (Array.isArray(obj)) return obj.map(blankStrings);
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, blankStrings(obj[k])]));
}

/** The fingerprint key for a single template entry. */
export function fingerprintKey(entry) {
  return `${entry.spec.type}::${JSON.stringify(blankStrings(entry.spec.config))}`;
}

/** Group templates by fingerprint; return only clusters with >1 member, largest
 * first (stable ordering: ties broken by first member's id). */
export function findClusters(templates) {
  const groups = new Map();
  for (const t of templates) {
    const key = fingerprintKey(t);
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length || a[0].id.localeCompare(b[0].id));
}
