/* Render a representative spread of template previews to standalone HTML files
 * so they can be viewed/screenshotted directly (no embedded-app / auth / iframe).
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/_render-preview-samples.ts <outDir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { MODULE_TEMPLATES, findTemplate } from '@superapp/core';
import { PreviewService } from '../app/services/preview/preview.service';

const outDir = process.argv[2] || '/tmp/preview-samples';
mkdirSync(outDir, { recursive: true });
const svc = new PreviewService();

// Explicit IDs to verify the fixes, plus one sample per distinct spec-kind for breadth.
const mustInclude = ['EMB-BODY-05', 'EMB-BODY-06', 'POS-CUST-12', 'POS-PROD-08'];
const seenKind = new Set<string>();
const pick: string[] = [...mustInclude];
for (const t of MODULE_TEMPLATES) {
  const kind = String((t.spec as { config?: { kind?: string } }).config?.kind ?? t.type);
  if (!seenKind.has(kind) && !pick.includes(t.id)) {
    seenKind.add(kind);
    pick.push(t.id);
  }
  if (pick.length >= 16) break;
}

const index: string[] = [];
for (const id of pick) {
  const t = findTemplate(id);
  if (!t) { index.push(`MISSING ${id}`); continue; }
  const r = svc.render(t.spec);
  const kind = String((t.spec as { config?: { kind?: string } }).config?.kind ?? t.type);
  const file = `${outDir}/${id}.html`;
  if (r.kind === 'HTML') {
    writeFileSync(file, r.html);
  } else {
    writeFileSync(file, `<!doctype html><meta charset=utf-8><pre style="font:13px ui-monospace;padding:16px">${JSON.stringify(r.json, null, 2).replace(/</g, '&lt;')}</pre>`);
  }
  index.push(`${id}  [${kind}]  ${t.category}  "${t.name}"  -> ${id}.html (${r.kind})`);
}
writeFileSync(`${outDir}/INDEX.txt`, index.join('\n'));
console.log(index.join('\n'));
console.log(`\nWrote ${pick.length} files to ${outDir}`);
