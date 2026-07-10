/**
 * P0 composition-evidence harness (module-design-system.md §04 / composition repair).
 *
 * Renders REAL library templates (not synthetic specs) through the PreviewService
 * — one representative per archetype/kind × pack × {light, dark-theme} — so
 * alignment/composition defects can be screenshot-audited at 375×812 and 1280×800
 * against the guide's §04 layout laws.
 *
 * Run:  pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/visual-qa-templates.ts
 * Out:  <repo>/test-results/design-system-templates/<kind>--<id>--<pack>--<mode>.html (+ index.html)
 */
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_TEMPLATES } from '@superapp/core';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

const OUT = path.resolve(process.cwd(), '../../test-results/design-system-templates');

/** Archetype/module kinds to audit — one representative template each. */
const KINDS = [
  'banner', 'notification-bar', 'popup', 'contactForm', 'floatingWidget',
  'product-bundle', 'product-recommendations',
  'hero', 'feature', 'pricing', 'faq', 'testimonial', 'gallery', 'trust',
  'newsletter', 'stats', 'collection', 'team', 'timeline', 'launch',
  'cta', 'upsell', 'band', 'pdp', 'sticky-atc',
];

const DARK_BODY = '<style>body{background:#0d0d10;color:#e8e8e6;}</style>';

type Entry = { id: string; spec: RecipeSpec };

function kindOf(spec: RecipeSpec): string | undefined {
  return (spec as { config?: { kind?: string } }).config?.kind;
}

function pickRepresentatives(): Map<string, Entry[]> {
  const byKind = new Map<string, Entry[]>();
  for (const t of MODULE_TEMPLATES) {
    if ((t.spec as { type?: string }).type !== 'theme.section') continue;
    const k = kindOf(t.spec);
    if (!k || !KINDS.includes(k)) continue;
    const list = byKind.get(k) ?? [];
    if (list.length < 2) list.push({ id: t.id, spec: t.spec }); // up to 2 per kind (layout variety)
    byKind.set(k, list);
  }
  return byKind;
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const service = new PreviewService();
  const reps = pickRepresentatives();
  const cells: string[] = [];
  const missing: string[] = [];

  for (const kind of KINDS) {
    const entries = reps.get(kind);
    if (!entries?.length) {
      missing.push(kind);
      continue;
    }
    for (const { id, spec } of entries) {
      for (const pack of ['luxe', 'bold'] as const) {
        for (const mode of ['light', 'dark'] as const) {
          const styled = structuredClone(spec) as RecipeSpec & { style?: Record<string, unknown> };
          styled.style = { ...(styled.style ?? {}), pack };
          let out;
          try {
            out = service.render(styled);
          } catch (err) {
            cells.push(`<!-- RENDER ERROR ${kind}/${id}: ${err instanceof Error ? err.message : String(err)} -->`);
            continue;
          }
          if (out.kind !== 'HTML') continue;
          const html = mode === 'dark' ? out.html.replace('</head>', `${DARK_BODY}</head>`) : out.html;
          const file = `${kind}--${id}--${pack}--${mode}.html`.replace(/[^a-zA-Z0-9.-]/g, '-');
          fs.writeFileSync(path.join(OUT, file), html);
          cells.push(file);
        }
      }
    }
  }

  const index = `<!doctype html><meta charset="utf-8"><title>Template composition audit (P0)</title>
<style>body{font:14px system-ui;padding:24px}a{display:block;padding:3px 0}h2{margin-top:20px}</style>
<h1>Template composition audit — ${cells.length} cells (view at 375×812 and 1280×800)</h1>
${missing.length ? `<p><strong>No template found for kinds:</strong> ${missing.join(', ')}</p>` : ''}
${cells.filter((c) => !c.startsWith('<!--')).map((f) => `<a href="./${f}">${f}</a>`).join('\n')}
${cells.filter((c) => c.startsWith('<!--')).join('\n')}`;
  fs.writeFileSync(path.join(OUT, 'index.html'), index);
  console.log(`wrote ${cells.length} cells to ${OUT}; missing kinds: ${missing.join(', ') || 'none'}`);
}

main();
