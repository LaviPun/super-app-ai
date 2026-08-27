import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression coverage for a live merchant-admin console warning:
 * `<s-table-header-row>` warned that more than one `<s-table-header>` in the
 * same row declared `listSlot="secondary"` (`modules._index.tsx` had both
 * "Description" and "Status"). Per the Polaris web components contract
 * (`@shopify/polaris-types`'s `TableHeaderProps.listSlot` doc): `primary`,
 * `secondary`, and `kicker` may each be claimed by AT MOST ONE column per
 * row — `inline` and the default `labeled` are the only slots multiple
 * columns may share.
 *
 * Scans every `.tsx` file under app/routes and app/components (source text,
 * not a rendered tree — no loader/router mocking needed) for
 * `<s-table-header-row>...</s-table-header-row>` blocks and asserts each one
 * respects the single-claim slots, so a future table can't reintroduce this.
 */

const SCAN_ROOTS = ['app/routes', 'app/components'];
const SINGLE_CLAIM_SLOTS = ['primary', 'secondary', 'kicker'] as const;

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsxFiles(full));
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Extract every `<s-table-header-row>...</s-table-header-row>` block's raw text. */
function extractHeaderRowBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /<s-table-header-row[^>]*>([\s\S]*?)<\/s-table-header-row>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    blocks.push(m[1]!);
  }
  return blocks;
}

/** Count `listSlot="<slot>"` occurrences within a header-row block. */
function countSlot(block: string, slot: string): number {
  const re = new RegExp(`listSlot="${slot}"`, 'g');
  return (block.match(re) ?? []).length;
}

describe('s-table-header-row listSlot uniqueness (Polaris single-claim slots)', () => {
  const repoRoot = process.cwd();
  const files = SCAN_ROOTS.flatMap((root) => collectTsxFiles(join(repoRoot, root)));
  const filesWithHeaderRows = files
    .map((path) => ({ path, blocks: extractHeaderRowBlocks(readFileSync(path, 'utf8')) }))
    .filter((f) => f.blocks.length > 0);

  it('finds at least one file with a table-header-row (sanity check the scan works)', () => {
    expect(filesWithHeaderRows.length).toBeGreaterThan(0);
  });

  for (const { path, blocks } of filesWithHeaderRows) {
    const relPath = path.slice(repoRoot.length + 1);
    blocks.forEach((block, i) => {
      const label = blocks.length > 1 ? `${relPath} (table #${i + 1})` : relPath;
      it(`${label}: primary/secondary/kicker each claimed at most once`, () => {
        for (const slot of SINGLE_CLAIM_SLOTS) {
          expect(countSlot(block, slot)).toBeLessThanOrEqual(1);
        }
      });
    });
  }
});
