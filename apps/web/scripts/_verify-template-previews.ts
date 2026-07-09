/* Verification: do distinct templates produce distinct PreviewService output?
 * Proves the data path behind the templates-gallery preview fix.
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/_verify-template-previews.ts
 */
import { MODULE_TEMPLATES, findTemplate } from '@superapp/core';
import { PreviewService } from '../app/services/preview/preview.service';
import { createHash } from 'node:crypto';

const svc = new PreviewService();
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

// Sample: first 3 of each category so we exercise same-category distinctness
const byCat = new Map<string, typeof MODULE_TEMPLATES>();
for (const t of MODULE_TEMPLATES) {
  const arr = byCat.get(t.category) ?? [];
  if (arr.length < 3) arr.push(t);
  byCat.set(t.category, arr);
}

const rows: { id: string; cat: string; kind: string; len: number; hash: string }[] = [];
for (const [, arr] of byCat) {
  for (const t of arr) {
    const tpl = findTemplate(t.id)!;
    let kind = '?', body = '', len = 0;
    try {
      const r = svc.render(tpl.spec);
      kind = r.kind;
      body = r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
      len = body.length;
    } catch (e) {
      kind = 'ERROR';
      body = e instanceof Error ? e.message : String(e);
    }
    rows.push({ id: t.id, cat: t.category, kind, len, hash: hash(body) });
  }
}

console.log(`Total templates: ${MODULE_TEMPLATES.length}`);
console.log(`Sampled: ${rows.length} across ${byCat.size} categories\n`);
for (const r of rows) {
  console.log(`${r.hash}  ${String(r.len).padStart(6)}b  ${r.kind.padEnd(5)}  [${r.cat}]  ${r.id}`);
}

const uniqueHashes = new Set(rows.map(r => r.hash));
const errs = rows.filter(r => r.kind === 'ERROR');
console.log(`\nDistinct output hashes: ${uniqueHashes.size} / ${rows.length}`);
console.log(`Render errors: ${errs.length}`);
if (errs.length) errs.forEach(e => console.log(`  ERROR ${e.id}: ${e.hash}`));

// Same-category distinctness check (the actual bug: identical previews within a category)
for (const [cat, arr] of byCat) {
  const hs = arr.map(t => {
    try { const r = svc.render(findTemplate(t.id)!.spec); return hash(r.kind === 'HTML' ? r.html : JSON.stringify(r.json)); }
    catch { return 'err'; }
  });
  const distinct = new Set(hs).size;
  const flag = distinct === hs.length ? 'OK' : 'DUPLICATE!';
  console.log(`  [${cat}] ${distinct}/${hs.length} distinct  ${flag}`);
}
