#!/usr/bin/env node
// Batch codemod (WS-H Task 6): strip hardcoded full-palette `text`/`background`
// overrides from template `colors:` blocks, keeping accent/scrim tuning
// (`seed`, `overlayBackdrop`, `overlayBackdropOpacity`) intact.
//
// A `colors:` block that hardcodes BOTH `text` and `background` replaces the
// store's real palette wholesale — that's the "48 hardcoded demo palettes"
// bug (docs/superpowers/plans/2026-08-24-ws-h-templates.md, Task 6). A block
// that carries only `seed`/`overlayBackdrop*` is a legitimate accent tint on
// top of the store's real palette and must survive untouched.
//
// Usage:
//   node packages/core/scripts/strip-demo-palettes.mjs           # rewrite in place
//   node packages/core/scripts/strip-demo-palettes.mjs --check   # CI-friendly: exit 1, no writes
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates');
const CHECK = process.argv.includes('--check');

function stripFullPaletteOverrides(src) {
  return src.replace(/colors:\s*\{([^}]*)\}/g, (whole, inner) => {
    if (!/text:.*background:|background:.*text:/.test(inner)) return whole;
    const kept = inner
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && !/^text:/.test(p) && !/^background:/.test(p))
      .join(', ');
    return `colors: { ${kept} }`;
  });
}

let offenders = 0;
for (const dir of ['modules', 'blocks', 'sections']) {
  const d = join(ROOT, dir);
  for (const f of readdirSync(d).filter((f) => f.endsWith('.ts'))) {
    const path = join(d, f);
    const src = readFileSync(path, 'utf8');
    const next = stripFullPaletteOverrides(src);
    if (next !== src) {
      offenders++;
      if (CHECK) console.error(`would strip full-palette override in ${dir}/${f}`);
      else writeFileSync(path, next);
    }
  }
}
console.log(`${CHECK ? 'Found' : 'Stripped'} ${offenders} file(s) with hardcoded text+background overrides.`);
if (CHECK && offenders > 0) process.exit(1);
