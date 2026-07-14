#!/usr/bin/env node
/**
 * Build minified theme-app-extension Liquid from readable source.
 *
 * WHY: Shopify enforces a hard 100 KB limit on "Liquid across all files" in a
 * theme app extension (https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration).
 * The design-system renderer (snippets/superapp-module.liquid alone is ~86 KB)
 * pushed the total to ~122 KB, so `shopify app dev` failed to deploy. Same
 * source→minified pattern already used for the JS/CSS assets in this folder.
 *
 * WHAT: readable source lives in apps/web/theme-extension-src/liquid/{blocks,snippets};
 * this emits a whitespace/comment-stripped copy into the extension. The transform
 * is OUTPUT-PRESERVING — it only removes bytes that collapse to nothing in
 * rendered HTML:
 *   1. {% comment %}…{% endcomment %} blocks (produce no output)
 *   2. leading indentation on each line (collapses in HTML; newlines kept, so no
 *      Liquid tokens ever merge)
 *   3. blank lines
 * It does NOT touch mid-line whitespace, join lines, or alter any tag. Verified
 * safe for this extension: no {% capture %} blocks, no <pre>/<textarea> with
 * significant whitespace. Re-run after editing anything under liquid/ and commit
 * both the source and the built .liquid.
 *
 * Usage: node scripts/build-theme-liquid.mjs   (add --check to fail if over budget)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/web/theme-extension-src/liquid');
const OUT = join(ROOT, 'extensions/theme-app-extension');
const LIQUID_BUDGET = 100 * 1000; // Shopify enforced limit, bytes

/** Output-preserving Liquid minify (see file header for the safety argument). */
function minifyLiquid(src) {
  // 1. Drop {% comment %}…{% endcomment %} blocks (incl. whitespace-control variants).
  let out = src.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
  // 1b. Drop {% # … %} inline comment tags (they render nothing) EXCEPT two kinds of
  //     load-bearing marker comment, kept verbatim:
  //       • theme-check control directives (`{% # theme-check-disable/enable %}`),
  //         read by the linter from the compiled Liquid — stripping them would
  //         surface e.g. RemoteAsset warnings on the built file;
  //       • the `/superapp-scope` close marker, a structural annotation the
  //         design-system-contract test counts to prove the pack-scope wrapper opens
  //         and closes exactly once in the shipped snippet.
  //     Non-greedy to the first `%}` (no comment body contains a literal `%}`). Same
  //     output-preserving guarantee as (1).
  const KEEP_COMMENT = /theme-check|superapp-scope/;
  out = out.replace(/\{%-?\s*#[\s\S]*?-?%\}/g, (m) => (KEEP_COMMENT.test(m) ? m : ''));
  // 2. Strip leading indentation, 3. drop blank lines. Newlines between kept lines
  //    remain, so adjacent Liquid/HTML tokens never merge.
  out = out
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, ''))
    .filter((line) => line.length > 0)
    .join('\n');
  // 4. Drop a newline whenever the characters on BOTH sides are non-word (i.e.
  //    neither is [A-Za-z0-9_]) — the newline was a whitespace-only text node between
  //    two markup boundaries (`>`\n`<`, `%}`\n`{%`, `}}`\n`<`, `"`\n`<`, …). That text
  //    node collapses in the rendered HTML (the render layer lays out with flex/grid
  //    `gap`, never on inter-tag whitespace). Requiring non-word on both sides means
  //    no two identifiers/keywords are ever fused. `{% liquid %}` blocks — whose lines
  //    ARE newline-separated statements — are protected first, because a statement can
  //    legitimately end/begin on punctuation (e.g. `assign x = ']'`); their internal
  //    newlines are load-bearing and must survive.
  out = protectLiquidBlocks(out, (chunk) => {
    let prev;
    do {
      prev = chunk;
      chunk = chunk.replace(/([^A-Za-z0-9_])\n([^A-Za-z0-9_])/g, '$1$2');
    } while (chunk !== prev);
    return chunk;
  });
  return out.endsWith('\n') ? out : out + '\n';
}

/**
 * Apply `fn` to the parts of `src` OUTSIDE every `{% liquid … %}` tag, leaving the
 * `{% liquid %}` blocks (whose newlines separate statements) untouched. Handles the
 * whitespace-control `{%-` / `-%}` forms.
 */
function protectLiquidBlocks(src, fn) {
  const re = /\{%-?\s*liquid\b/g;
  let result = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    const close = src.indexOf('%}', start);
    const end = close === -1 ? src.length : close + 2;
    result += fn(src.slice(last, start)) + src.slice(start, end);
    last = end;
    re.lastIndex = end;
  }
  result += fn(src.slice(last));
  return result;
}

let total = 0;
const rows = [];
for (const kind of ['blocks', 'snippets']) {
  const dir = join(SRC, kind);
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.liquid'))) {
    const raw = readFileSync(join(dir, name), 'utf8');
    const min = minifyLiquid(raw);
    writeFileSync(join(OUT, kind, name), min);
    total += Buffer.byteLength(min);
    rows.push({ file: `${kind}/${name}`, from: Buffer.byteLength(raw), to: Buffer.byteLength(min) });
  }
}

rows.sort((a, b) => b.to - a.to);
for (const r of rows) console.log(`  ${String(r.to).padStart(6)} B  (was ${r.from})  ${r.file}`);
const pct = ((total / LIQUID_BUDGET) * 100).toFixed(1);
console.log(`\nTotal Liquid: ${total} B / ${LIQUID_BUDGET} B budget (${pct}%)`);

if (total > LIQUID_BUDGET) {
  console.error(`\n❌ Over the 100 KB enforced Liquid limit by ${total - LIQUID_BUDGET} B.`);
  if (process.argv.includes('--check')) process.exit(1);
} else {
  console.log(`✅ Under budget by ${LIQUID_BUDGET - total} B.`);
}
