/**
 * Visual-QA harness (module-design-system.md R7 / §1.4 "QA at 375×812, light+dark").
 *
 * Renders the PreviewService output for a matrix of module kinds × packs ×
 * {light, dark-theme} into self-contained HTML files, ready to be opened in a
 * real browser (Playwright, the browse daemon, or by hand) and screenshotted
 * at 375×812. The dark variant simulates a dark STORE THEME (body colors the
 * modules must inherit), which is the failure mode that matters for §3.3.2.
 *
 * Run:  pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/visual-qa-previews.ts
 * Out:  <repo>/test-results/design-system/<kind>--<pack>--<mode>.html (+ index.html)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

const OUT = path.resolve(process.cwd(), '../../test-results/design-system');

const KINDS: Array<{ kind: string; config: Record<string, unknown> }> = [
  { kind: 'banner', config: { fields: { heading: 'The Autumn Edit' }, heading: 'The Autumn Edit', subheading: 'Considered pieces for the season ahead', ctaText: 'Shop the edit', ctaUrl: '#', imageUrl: 'https://placehold.co/800x500/png' } },
  { kind: 'notification-bar', config: { message: 'Free shipping on orders over $75', linkText: 'Details', linkUrl: '#' } },
  { kind: 'popup', config: { title: 'Take 10% off your first order', body: 'Join the list for early access and offers.', ctaText: 'Get my code', ctaUrl: '#' } },
  { kind: 'contactForm', config: { title: 'Get in touch', subtitle: 'We reply within one business day.', showName: true, showEmail: true, showMessage: true } },
  { kind: 'floatingWidget', config: { variant: 'chat', label: 'Chat with us', anchor: 'bottom_right' } },
  { kind: 'effect', config: { effectKind: 'embers', intensity: 'medium', speed: 'normal' } },
  { kind: 'hero', config: { title: 'Built for the long run', subtitle: 'Materials that age well', ctaText: 'Discover', ctaUrl: '#', blocks: [] } },
  { kind: 'faq', config: { title: 'Questions', blocks: [ { kind: 'text', text: 'How long is shipping?', fields: { answer: '2–4 business days, tracked.' } }, { kind: 'text', text: 'What is the return window?', fields: { answer: '30 days, no questions asked.' } } ] } },
  { kind: 'pricing', config: { title: 'Choose your plan', blocks: [ { kind: 'text', text: 'Starter', fields: { price: '$9', period: '/mo', features: ['1 store', 'Email support'] } }, { kind: 'text', text: 'Growth', fields: { price: '$29', period: '/mo', featured: true, features: ['5 stores', 'Priority support'] } } ] } },
  { kind: 'stats', config: { title: 'By the numbers', blocks: [ { kind: 'stat', text: '12k', fields: { value: '12k', label: 'Orders shipped' } }, { kind: 'stat', text: '4.9', fields: { value: '4.9', label: 'Average rating' } } ] } },
  { kind: 'testimonial', config: { title: 'What customers say', blocks: [ { kind: 'text', text: 'Quietly the best purchase I made this year.', fields: { author: 'Maya R.', rating: 5 } } ] } },
];

const DARK_BODY = '<style>body{background:#0d0d10;color:#e8e8e6;}</style>';

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const service = new PreviewService();
  const cells: string[] = [];
  for (const { kind, config } of KINDS) {
    for (const pack of ['luxe', 'bold'] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const spec = {
          type: 'theme.section',
          name: `${kind} (${pack}/${mode})`,
          category: 'STOREFRONT_UI',
          requires: ['THEME_ASSETS'],
          config: { kind, activation: 'section', ...config },
          style: { pack, ...(pack === 'bold' ? { colors: { seed: '#ff4d2e' } } : { colors: { seed: '#b08d57' } }) },
        } as unknown as RecipeSpec;
        const out = service.render(spec);
        if (out.kind !== 'HTML') continue;
        const html = mode === 'dark' ? out.html.replace('</head>', `${DARK_BODY}</head>`) : out.html;
        const file = `${kind}--${pack}--${mode}.html`;
        fs.writeFileSync(path.join(OUT, file), html);
        cells.push(file);
      }
    }
  }
  const index = `<!doctype html><meta charset="utf-8"><title>Design-system visual QA</title>
<style>body{font:14px system-ui;padding:24px}a{display:block;padding:4px 0}</style>
<h1>Design-system visual QA — ${cells.length} cells (view at 375×812)</h1>
${cells.map((f) => `<a href="./${f}">${f}</a>`).join('\n')}`;
  fs.writeFileSync(path.join(OUT, 'index.html'), index);
  console.log(`wrote ${cells.length} preview cells + index to ${OUT}`);
}

main();
