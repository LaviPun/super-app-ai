/**
 * Copy-variant fingerprinting (WS-H Task 9, FIX ROUND 1 — see the plan's
 * "Fix round 1" note and the task-8-10-report.md "Fix round 1" section for the
 * full incident writeup).
 *
 * ORIGINAL BUG: the first version of this module fingerprinted an entry as
 * `type + JSON.stringify(config-with-every-string-blanked)`. That is far too
 * coarse — it cannot tell "the same feature reworded" from "a completely
 * different feature that happens to reuse the same generic config shape".
 * Concretely: 19 different `proxy.widget` integrations (Loox reviews, Okendo
 * Q&A, a loyalty launcher, a subscription portal, a ProveSource toast, an
 * Appikon back-in-stock signup, ...) all share the shape
 * `{ widgetId, mode, surface, title, message }` — blanking every string
 * (including `widgetId`, the ACTUAL identity of the integration) collapsed all
 * 19 into one fake 22-member "cluster", and the first version of
 * dedupe-copy-variants.mjs deleted 18 of them: real, distinct, shippable
 * templates a merchant searching "Loox" or "loyalty points" would no longer
 * find. Never again: this module now treats string-blanking as a NARROW,
 * explicit exception (pure marketing prose only) rather than the default.
 *
 * A "copy-variant cluster" is now a group of `TemplateEntry`s that:
 *   1. Live in the SAME SOURCE FILE. A true copy-variant pair is authored
 *      side by side as the same underlying template reworded — never split
 *      across files that each represent a different integration/surface.
 *   2. Share `spec.type` + a fingerprint of `spec.config` where every field is
 *      preserved VERBATIM except a small, explicit "pure prose" allowlist
 *      (title/subtitle/message/body/bodyText/bodyCopy/standfirst/intro/
 *      headline/subheadline/eyebrow/description, case-insensitive) — anything
 *      that looks like an identifier, endpoint, target, binding, url, handle,
 *      widgetId, kind, or structural flag must match EXACTLY. This is
 *      "identity-preserving blanking": marketing copy is free to vary, nothing
 *      that carries real meaning is.
 *   3. ALSO pass a name+description similarity gate (Jaccard token overlap on
 *      `name + description`, default threshold 0.5) — even with (1)+(2), two
 *      entries only cluster if they read as the same feature reworded, not
 *      merely the same generic shape. This is the second, independent check;
 *      either gate alone can be fooled, both together are much harder to.
 *
 * Imported by: find-copy-variant-clusters.mjs (read-only report),
 * dedupe-copy-variants.mjs (the batch codemod),
 * packages/core/src/__tests__/template-library-integrity.test.ts (the guard).
 */

/** Field names that are pure marketing/display prose — safe to blank because
 * varying them is, by definition, "the same feature, reworded". Everything
 * NOT in this list is preserved verbatim (identity-bearing by default). */
const PROSE_FIELD_NAMES = new Set([
  'title',
  'subtitle',
  'message',
  'body',
  'bodytext',
  'bodycopy',
  'standfirst',
  'intro',
  'headline',
  'subheadline',
  'eyebrow',
  'description',
]);

/** Recursively preserve every field verbatim EXCEPT prose-allowlisted string
 * leaves, which are blanked to the sentinel 'S'. Object keys are sorted so
 * key-order differences don't defeat the fingerprint. */
export function blankStrings(obj, keyHint) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return keyHint && PROSE_FIELD_NAMES.has(keyHint.toLowerCase()) ? 'S' : obj;
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => blankStrings(v, keyHint));
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, blankStrings(obj[k], k)]));
}

/** Lowercase word tokens from a string (alphanumeric runs, 2+ chars). */
function tokenize(text) {
  return new Set((String(text ?? '').toLowerCase().match(/[a-z0-9]{2,}/g) ?? []));
}

/** Jaccard similarity of two token sets: |intersection| / |union|. */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** The name+description similarity gate (rule 3 above). */
export function nameDescriptionSimilarity(a, b) {
  return jaccard(tokenize(`${a.name} ${a.description}`), tokenize(`${b.name} ${b.description}`));
}

/** The identity-preserving fingerprint key for a single template entry
 * (rule 2 above) — NOT scoped to file yet; findClusters adds the same-file
 * scope (rule 1). */
export function fingerprintKey(entry) {
  return `${entry.spec.type}::${JSON.stringify(blankStrings(entry.spec.config))}`;
}

/**
 * Group templates into copy-variant clusters under all three rules. Requires
 * each entry to carry a `file` property (relative source path — rule 1) in
 * addition to the normal TemplateEntry shape; callers that only have
 * `ALL_TEMPLATES` (no file info) should attach it first (see
 * find-copy-variant-clusters.mjs for the id->file lookup).
 *
 * Returns clusters with >1 member, largest first (ties broken by first
 * member's id).
 */
export function findClusters(templatesWithFile, similarityThreshold = 0.5) {
  // Rule 1 + rule 2: group by file + structural fingerprint.
  const structuralGroups = new Map();
  for (const t of templatesWithFile) {
    const key = `${t.file}::${fingerprintKey(t)}`;
    const bucket = structuralGroups.get(key);
    if (bucket) bucket.push(t);
    else structuralGroups.set(key, [t]);
  }

  // Rule 3: within each structural group, further split by name+description
  // similarity (greedy single-linkage — order-stable for a fixed input order).
  const clusters = [];
  for (const group of structuralGroups.values()) {
    if (group.length < 2) continue;
    const unassigned = [...group];
    while (unassigned.length > 0) {
      const seed = unassigned.shift();
      const cluster = [seed];
      for (let i = unassigned.length - 1; i >= 0; i--) {
        if (nameDescriptionSimilarity(seed, unassigned[i]) >= similarityThreshold) {
          cluster.push(unassigned[i]);
          unassigned.splice(i, 1);
        }
      }
      if (cluster.length > 1) clusters.push(cluster);
    }
  }

  return clusters.sort((a, b) => b.length - a.length || a[0].id.localeCompare(b[0].id));
}
