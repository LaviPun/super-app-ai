import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { KIND_ARCHETYPE } from '~/services/recipes/kind-archetype';

/**
 * R0 preview⇄storefront parity guard.
 *
 * The kind→archetype alias table now lives in ONE canonical TS module
 * (~/services/recipes/kind-archetype), imported by both PreviewService and the
 * native-section compiler — so those two can no longer drift. The THIRD copy is
 * the storefront Liquid `case sa_kind_h … endcase` dispatch in
 * superapp-module.liquid, which can't import a TS const. If a kind is mapped in TS
 * but absent from that Liquid `when` table, it previews/compiles as an archetype
 * but renders `generic` on the live storefront (silent parity break). This test
 * extracts the Liquid `when` kinds and locks them against the canonical TS table.
 *
 * BUILD SOURCE: the readable source is the superapp-module snippet FAMILY under
 * apps/web/theme-extension-src/liquid/snippets/ — a dispatcher (superapp-module.liquid)
 * plus kind-family sub-snippets it {% render %}s (superapp-module-sections.liquid holds
 * the `case sa_kind_h` archetype dispatch). scripts/build-theme-liquid.mjs emits an
 * output-preserving minified copy of every file into extensions/theme-app-extension/
 * snippets/ (it only strips comments/indentation/blank lines — the `when '<kind>'`
 * tokens are untouched). We scan the WHOLE family (so the guarantee survives the
 * dispatch moving between files), asserting against the SOURCE (the thing humans edit)
 * and separately that the built copies carry the same kind set (rebuild not forgotten).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
const SRC_SNIPPETS = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets');
const BUILT_SNIPPETS = join(REPO_ROOT, 'extensions/theme-app-extension/snippets');

/** Concatenate every `superapp-module*.liquid` renderer-family file in a snippets dir. */
function readModuleFamily(dir: string): string {
  return readdirSync(dir)
    .filter((f) => /^superapp-module.*\.liquid$/.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

/**
 * Storefront-only kinds handled by the Liquid `case sa_kind_h` table but
 * deliberately absent from the canonical TS table. These map to the `pdp` and
 * `sticky-atc` Liquid archetypes, which are NOT part of the 18-archetype TS
 * `SectionArchetype` union (PreviewService/native-section render `sticky-atc` as
 * `technical` and have no `pdp` branch). Enumerated here so drift in EITHER
 * direction still fails: a new Liquid `when` kind that isn't canonical and isn't
 * listed here trips the reverse-coverage assertion below.
 */
const LIQUID_ONLY_KINDS = new Set([
  'pdp', 'product-page', 'product-detail', 'buy-box',
  'sticky-add-to-cart', 'atc-bar',
]);

/** Extract the kind aliases from the `case sa_kind_h … endcase` dispatch block. */
function extractLiquidKinds(liquid: string): string[] {
  const start = liquid.indexOf('case sa_kind_h');
  expect(start, 'could not locate `case sa_kind_h` archetype dispatch in Liquid').toBeGreaterThan(-1);
  const end = liquid.indexOf('endcase', start);
  expect(end, 'could not locate `endcase` closing the archetype dispatch').toBeGreaterThan(start);
  const block = liquid.slice(start, end);
  const kinds = new Set<string>();
  for (const whenMatch of block.matchAll(/when\s+(.+)/g)) {
    const clause = whenMatch[1] ?? '';
    for (const q of clause.matchAll(/'([^']+)'/g)) {
      if (q[1]) kinds.add(q[1]);
    }
  }
  return [...kinds];
}

describe('kind→archetype alias parity (canonical TS ⇄ storefront Liquid)', () => {
  const canonicalKinds = Object.keys(KIND_ARCHETYPE);
  const liquidKinds = extractLiquidKinds(readModuleFamily(SRC_SNIPPETS));

  it('every canonical TS kind is dispatched by the Liquid `when` table', () => {
    const missing = canonicalKinds.filter((k) => !liquidKinds.includes(k));
    expect(missing, `kinds mapped in TS but absent from the Liquid dispatch (would render generic on the storefront): ${missing.join(', ')}`).toEqual([]);
  });

  it('every Liquid `when` kind is either canonical or a documented storefront-only kind', () => {
    const stray = liquidKinds.filter((k) => !(k in KIND_ARCHETYPE) && !LIQUID_ONLY_KINDS.has(k));
    expect(stray, `kinds dispatched by Liquid but neither in the canonical TS table nor LIQUID_ONLY_KINDS: ${stray.join(', ')}`).toEqual([]);
  });

  it('guards a non-trivial number of aliases (so the table can’t silently go empty)', () => {
    expect(canonicalKinds.length).toBeGreaterThan(20);
    expect(liquidKinds.length).toBeGreaterThan(20);
  });

  it('the built extension copy carries the same kind set as the source (rebuild not forgotten)', () => {
    const builtKinds = extractLiquidKinds(readModuleFamily(BUILT_SNIPPETS));
    expect(builtKinds.sort()).toEqual([...liquidKinds].sort());
  });
});
