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
 *   1. {% comment %}…{% endcomment %} and {% doc %}…{% enddoc %} blocks (both
 *      produce no output — doc is Shopify's LiquidDoc tag; source keeps them)
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
const LIQUID_BUDGET = 100 * 1000; // Shopify ENFORCED aggregate limit (Liquid across all files), bytes
const PER_FILE_MAX = 100 * 1000; // hard per-file ceiling; the family split keeps each file far below this

/** Output-preserving Liquid minify (see file header for the safety argument). */
function minifyLiquid(src) {
  // 0. Drop `#` comment LINES inside `{% liquid %}` blocks. A line whose first
  //    non-whitespace character is `#` is a Liquid inline comment (the `{% liquid %}`
  //    tag's per-line comment form) — it renders NOTHING, same output class as a
  //    `{% comment %}` block or a `{% # … %}` tag. The rest of the pipeline PROTECTS
  //    `{% liquid %}` interiors (their newlines separate statements), so without this
  //    pass those comment lines shipped verbatim (~2.5 KB of dead weight in the
  //    renderer alone). We strip them here, before any other transform, so the
  //    readable source keeps every explanatory `#` note for humans while the deployed
  //    copy carries none. Theme-check control directives are preserved defensively
  //    (they are authored as `{% # … %}` tags, never bare liquid-block lines, but the
  //    guard keeps this pass safe if that ever changes). Only line-leading `#` is a
  //    comment — a `#` inside a string (e.g. a `'#fff'` hex) is never at line start in
  //    a liquid statement, so quoted values are untouched.
  let out = stripLiquidBlockComments(src);
  // 1. Drop {% comment %}…{% endcomment %} blocks (incl. whitespace-control variants).
  out = out.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
  // 1a. Drop {% doc %}…{% enddoc %} LiquidDoc blocks. `doc` is Shopify's snippet
  //     documentation tag — it renders NOTHING (identical output class to comment),
  //     so stripping it from the DEPLOYED copy is output-preserving. The readable
  //     source keeps every {% doc %}/@param header for humans + editor tooling; only
  //     the shipped extension drops it (V-B budget reclaim, ~3 KB across snippets).
  out = out.replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, '');
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
  // 5. Trim the spaces/tabs immediately INSIDE `{{ … }}` output-tag delimiters —
  //    Liquid strips leading/trailing whitespace of an output tag's markup before
  //    evaluating it, so `{{ x | escape }}` and `{{x | escape}}` render the SAME
  //    bytes (output-preserving). Whitespace-control markers (`{{-` / `-}}`) are
  //    preserved; only [ \t] (never newlines) adjacent to the braces is removed, so
  //    a rare multi-line output tag and the internal `| filter` spacing are left
  //    intact. `{% … %}` tags are deliberately NOT touched (tag-name lexing is more
  //    fragile); `{% liquid %}` blocks never contain `{{ }}`, so this is global-safe.
  out = out.replace(/(\{\{-?)[ \t]+/g, '$1').replace(/[ \t]+(-?\}\})/g, '$1');
  // 6. Same edge-trim for `{% … %}` tag delimiters. Liquid strips the leading/
  //    trailing whitespace of a tag's markup before splitting the tag name, so
  //    `{% if x %}` and `{%if x%}` are equivalent (standard Liquid minification;
  //    Shopify's own shipped assets use the no-space form). Only [ \t] adjacent to
  //    the braces is removed — INTERNAL token spacing (around operators/`=`, inside
  //    quoted strings) is untouched, and `-`/whitespace-control markers survive.
  //    The `{% liquid %}` opener/closer keep their protected newlines (a newline is
  //    not [ \t], so the `%}` that closes a liquid block is never touched here).
  out = out.replace(/(\{%-?)[ \t]+/g, '$1').replace(/[ \t]+(-?%\})/g, '$1');
  // 7. Collapse redundant internal whitespace INSIDE each `{{ … }}` / `{% … %}`
  //    tag (never HTML text), skipping quoted string literals: runs of spaces/tabs
  //    collapse to one, and the spaces around a `|` filter pipe are dropped
  //    (`{{ a | b }}` → `{{a|b}}` — the ubiquitous Shopify filter-minify form).
  //    Single inter-token spaces (around `=`, operators, keywords) are KEPT, so
  //    tag lexing is untouched. `{% liquid %}` blocks are skipped wholesale — their
  //    newline-separated statements are load-bearing.
  out = trimTagInternals(out);
  return out.endsWith('\n') ? out : out + '\n';
}

/**
 * Collapse redundant whitespace inside `{{ … }}` and `{% … %}` tags (see rule 7).
 * Quoted string literals inside a tag are preserved verbatim; `{% liquid %}` blocks
 * are skipped entirely (their internal newlines separate statements). This only
 * removes whitespace Liquid already ignores when lexing a tag, so it is
 * output-preserving.
 */
function trimTagInternals(src) {
  return src.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, (tag) => {
    // NB: `{% liquid %}` blocks are NOT skipped — the transforms below only touch
    // [ \t] (never newlines) and only outside quoted strings, so the newline-
    // separated statements inside a liquid block are preserved byte-for-byte while
    // their ignorable filter-pipe/colon/comma spacing is still reclaimed.
    let out = '';
    let i = 0;
    while (i < tag.length) {
      const ch = tag[i];
      if (ch === '"' || ch === "'") {
        const j = tag.indexOf(ch, i + 1);
        const end = j === -1 ? tag.length : j + 1;
        out += tag.slice(i, end); // copy the quoted string literal verbatim
        i = end;
      } else {
        let k = i;
        while (k < tag.length && tag[k] !== '"' && tag[k] !== "'") k++;
        out += tag
          .slice(i, k)
          .replace(/[ \t]{2,}/g, ' ')
          // Filter separators: `| a`, `: b`, `, c` all tolerate zero surrounding
          // whitespace in Liquid (the ubiquitous `{{a|default:'x','y'}}` form).
          // These punctuators only appear OUTSIDE string literals here (URLs/labels
          // with `:` or `,` live inside the protected quotes), so this is safe.
          .replace(/[ \t]*\|[ \t]*/g, '|')
          .replace(/[ \t]*:[ \t]*/g, ':')
          .replace(/[ \t]*,[ \t]*/g, ',')
          // 8. Assignment `=` — Liquid tokenizes `{% assign x = y %}` on the `=`, so
          //    `assign x=y` is identical (verified against the real Shopify parser via
          //    @shopify/theme-check-node — both forms produce zero offenses). Only a
          //    LONE `=` with whitespace on BOTH sides is collapsed: the two-sided
          //    requirement means the comparison operators `==` / `!=` / `>=` / `<=`
          //    (which never carry a space BETWEEN their two chars) are never touched,
          //    and a `=` inside a quoted string is already protected by the split above.
          //    ~2 B reclaimed per assignment across the family (V-B B6/B7/B14 headroom).
          .replace(/[ \t]+=[ \t]+/g, '=');
        i = k;
      }
    }
    return out;
  });
}

/**
 * Remove `#` comment lines from the interior of every `{% liquid … %}` block (see
 * rule 0). A line is a comment iff its first non-whitespace character is `#`; such
 * lines render nothing, so dropping them (and their trailing newline) is
 * output-preserving. Lines carrying a `theme-check` directive are kept defensively.
 * The block open/close and every non-comment statement line survive byte-for-byte.
 */
function stripLiquidBlockComments(src) {
  const re = /\{%-?\s*liquid\b/g;
  let result = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    const close = src.indexOf('%}', start);
    const end = close === -1 ? src.length : close; // interior ends AT the closing `%}`
    result += src.slice(last, start);
    const block = src.slice(start, end); // `{% liquid` + statements, WITHOUT the `%}`
    const kept = block
      .split('\n')
      .filter((line) => {
        const t = line.replace(/^[ \t]+/, '');
        if (t.startsWith('#')) return /theme-check/.test(t);
        return true;
      })
      .join('\n');
    result += kept;
    last = end;
    re.lastIndex = end;
  }
  result += src.slice(last);
  return result;
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
// Per-file report. The renderer is now a snippet FAMILY (a dispatcher + kind-family
// sub-snippets it {% render %}s); each file has years of headroom under PER_FILE_MAX,
// while the aggregate stays the deploy-blocking wall Shopify actually enforces.
for (const r of rows) {
  const flag = r.to > PER_FILE_MAX ? '  ❌ OVER PER-FILE LIMIT' : '';
  console.log(`  ${String(r.to).padStart(6)} B  (was ${r.from})  ${r.file}${flag}`);
}
const pct = ((total / LIQUID_BUDGET) * 100).toFixed(1);
console.log(`\nTotal Liquid: ${total} B / ${LIQUID_BUDGET} B budget (${pct}%)`);

// Two independent gates:
//   • per-file  — Shopify compiles each Liquid file; keep any single file well clear
//     of the 100 KB ceiling so one growing family can't wedge a deploy.
//   • aggregate — "Size of Liquid across all files: 100 KB" is Shopify's ENFORCED
//     theme-app-extension limit (shopify.dev/.../theme-app-extensions/configuration).
//     Splitting a monolith does NOT free aggregate budget — it slightly grows it — so
//     this must stay the hard wall. Growing the render surface means reclaiming bytes
//     (e.g. moving presentation into the CSS/JS assets, which have separate budgets),
//     not just adding snippets.
const overFiles = rows.filter((r) => r.to > PER_FILE_MAX);
let failed = false;
for (const r of overFiles) {
  console.error(`\n❌ ${r.file} is ${r.to} B — over the ${PER_FILE_MAX} B per-file limit by ${r.to - PER_FILE_MAX} B.`);
  failed = true;
}
if (total > LIQUID_BUDGET) {
  console.error(`\n❌ Over the 100 KB enforced aggregate Liquid limit by ${total - LIQUID_BUDGET} B.`);
  failed = true;
} else {
  console.log(`✅ Aggregate under budget by ${LIQUID_BUDGET - total} B. Largest file: ${rows[0].to} B (${rows[0].file}).`);
}
if (failed && process.argv.includes('--check')) process.exit(1);
