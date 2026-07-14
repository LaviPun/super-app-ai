/**
 * Design-system contract test (module-design-system.md §9.1 / R7).
 *
 * Codifies the spec ⇄ render-layer coverage matrix as a standing test: the
 * render layer (theme-extension CSS/Liquid/JS) and the preview pipeline must
 * keep delivering the two-pack contract. If a spec promise regresses out of
 * the render layer, this file fails — the spec can't silently outrun the code.
 *
 * Reads the extension files from disk (vitest runs with cwd = apps/web).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

const EXT = path.resolve(process.cwd(), '../../extensions/theme-app-extension');
const css = fs.readFileSync(path.join(EXT, 'assets/superapp-modules.css'), 'utf8');
const js = fs.readFileSync(path.join(EXT, 'assets/superapp-modules.js'), 'utf8');
const snippet = fs.readFileSync(path.join(EXT, 'snippets/superapp-module.liquid'), 'utf8');
const bundleSnippet = fs.readFileSync(path.join(EXT, 'snippets/superapp-product-bundle.liquid'), 'utf8');

describe('design-system contract — CSS token layer (§3.3 / §9.3)', () => {
  it('defines all four pack token maps on the scope wrapper', () => {
    // Quote-tolerant: the shipped asset is minified, which strips attribute-selector
    // quotes (`[data-sa-pack=luxe]`) — still valid CSS. The `[...]` bracket keeps this
    // matching the CSS selector, not the wrapper element (which uses double quotes).
    for (const pack of ['luxe', 'bold', 'playful', 'utility'] as const) {
      expect(css, `missing token map for data-sa-pack=${pack}`).toMatch(
        new RegExp(`\\.superapp-scope\\[data-sa-pack=['"]?${pack}['"]?\\]`),
      );
    }
  });

  it('the new packs derive their structural grammar (radius/motion) in the token map', () => {
    // Playful → pill CTAs (9999px btn radius) + springy ease; Utility → near-zero
    // radius (4px) + fast micro-motion. Assert the distinguishing tokens landed so a
    // silently-empty map can't pass the selector check above.
    const playful = css.match(/\.superapp-scope\[data-sa-pack=['"]?playful['"]?\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(playful).toMatch(/--sa-btn-radius:\s*9999px/);
    const utility = css.match(/\.superapp-scope\[data-sa-pack=['"]?utility['"]?\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(utility).toMatch(/--sa-radius:\s*4px/);
    // Fast micro-motion — the minifier may collapse the time unit (120ms → .12s).
    expect(utility).toMatch(/--sa-motion:\s*(120ms|\.12s)/);
  });

  it('carries the typographic voice: fluid display scale + font roles (§1.1)', () => {
    expect(css).toContain('--sa-display-size');
    expect(css).toContain('--sa-font-display');
    expect(css).toContain('--sa-font-mono');
    expect(css).toMatch(/--sa-display-size:\s*clamp\(/);
  });

  it('drives CTAs from the OKLCH ramp chain, never bare currentColor/Canvas (§2.4)', () => {
    // Terminal fallback must be CanvasText, NOT var(--sa-ink): --sa-ink is
    // currentColor, and currentColor in `background` resolves against the
    // element's own `color` (Canvas) → white-on-white invisible CTAs on any
    // spec without a seed ramp. 2026-07-10 repair; keep the chain ramp-first.
    expect(css).toContain('var(--sa-btn-bg, var(--sa-solid, CanvasText))');
    expect(css).toContain('var(--sa-btn-text, var(--sa-solid-content, Canvas))');
    expect(css).not.toContain('var(--sa-btn-bg, var(--sa-solid, var(--sa-ink)))');
  });

  it('survives dark themes: color-mix hairlines + prefers-color-scheme branch (§1.4)', () => {
    expect(css).toContain('color-mix(');
    expect(css).toContain('prefers-color-scheme: dark');
  });

  it('has the motion/state system: entrance, shimmer, shake, reduced-motion (§7.1 F4/F6/F8)', () => {
    expect(css).toContain('@keyframes superapp-enter');
    expect(css).toContain('@keyframes superapp-shimmer');
    expect(css).toContain('@keyframes superapp-shake');
    expect(css).toContain('.sa-reveal');
    expect(css).toContain('.is-inview');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('implements the full 12-effect catalog (§6)', () => {
    for (const kf of [
      'superapp-fall', // snowfall
      'superapp-rise', // embers
      'superapp-confetti',
      'superapp-petal',
      'superapp-firework',
      'superapp-twinkle', // glitter/stars
      'superapp-rain',
      'superapp-bubble',
      'superapp-shoot', // shooting stars
      'superapp-balloon',
      'superapp-spotlight',
      'superapp-ambient', // ambient-gradient
    ]) {
      expect(css, `missing effect keyframe ${kf}`).toContain(`@keyframes ${kf}`);
    }
  });

  it('honors effect intensity/speed/auto-stop controls (§6)', () => {
    expect(css).toContain('data-intensity');
    expect(css).toContain('data-speed');
    expect(css).toContain('var(--sa-loops, infinite)');
  });

  it('styles the previously-unstyled kinds: recommendations + bundle (§4.1)', () => {
    expect(css).toContain('.superapp-recs__grid');
    expect(css).toContain('.superapp-recs__skeleton');
    expect(css).toContain('.superapp-bundle');
  });

  it('has the anti-slop content branches', () => {
    expect(css).toContain('.superapp-section--minimal');
    expect(css).toContain('.superapp-section--textonly');
    expect(css).toContain('.superapp-section__empty');
  });

  it('never regresses to the legacy token name', () => {
    expect(css).not.toContain('--sa-border-width');
  });

  it('keeps the popup scrim on the compiled token (audit fix)', () => {
    expect(css).toContain('var(--sa-backdrop');
  });

  it('defines the §04 composition primitives (composition-rules.md)', () => {
    for (const cls of [
      '.superapp-container',
      '.superapp-stack',
      '.superapp-grid',
      '.superapp-split',
      '.superapp-cluster',
      '.superapp-row',
      '.superapp-align-center',
      '.superapp-measure',
    ]) {
      expect(css, `missing primitive ${cls}`).toContain(cls);
    }
  });

  it('styles the first-class conversion surfaces: pdp + sticky-atc (§4.2)', () => {
    expect(css).toContain('.superapp-pdp');
    expect(css).toContain('.superapp-satc');
  });

  it('ships the §05 atoms (badge/pill/tabs)', () => {
    expect(css).toContain('.superapp-badge');
    expect(css).toContain('.superapp-pill');
    expect(css).toContain('.superapp-tabs');
  });
});

describe('design-system contract — Liquid render layer (§3.3.4 scoping & identity)', () => {
  it('wraps every module in the pack scope exactly once', () => {
    expect(snippet.match(/<div class="superapp-scope"/g)?.length).toBe(1);
    expect(snippet).toContain('data-sa-pack=');
    expect(snippet.match(/\/superapp-scope/g)?.length).toBe(1);
  });

  it('resolves pack precedence: block setting → style_json.pack → luxe (§3.3.1)', () => {
    expect(snippet).toContain('mod_sty.pack');
    expect(snippet).toMatch(/default:\s*'luxe'/);
  });

  it('carries the entrance + effect + countdown hooks (§6/§7)', () => {
    expect(snippet).toContain('sa-reveal');
    expect(snippet).toContain('data-intensity');
    expect(snippet).toContain('data-speed');
    expect(snippet).toContain('data-sa-countdown');
  });

  it('uses SVG widget icons, not emoji', () => {
    expect(snippet).toContain('<svg');
    expect(snippet).not.toContain('💬');
  });

  it('bundle snippet no longer carries inline styles (tokenized centrally)', () => {
    expect(bundleSnippet).not.toContain('<style>');
  });

  it('renders pdp + sticky-atc as dedicated branches (§4.2 renderer note)', () => {
    // Minify-tolerant: the build now trims tag-delimiter whitespace, so the shipped
    // form is `{%when 'pdp'%}` (theme-check-valid). Match with or without spaces.
    expect(snippet).toMatch(/\{%-?\s*when 'pdp'\s*-?%\}/);
    expect(snippet).toMatch(/\{%-?\s*when 'sticky-atc'\s*-?%\}/);
  });

  it('composes with the §04 primitives (containers, rows, clusters, measure)', () => {
    expect(snippet).toContain('superapp-container');
    expect(snippet).toContain('superapp-row');
    expect(snippet).toContain('superapp-cluster');
    expect(snippet).toContain('superapp-measure');
  });
});

describe('design-system contract — JS runtime (§5.4/§6/§7)', () => {
  it('implements scroll reveal, effect triggers, countdown, celebration', () => {
    expect(js).toContain('IntersectionObserver');
    expect(js).toContain('sa-reveal');
    expect(js).toContain('data-sa-countdown');
    expect(js).toContain('superapp:celebrate');
    expect(js).toContain('--sa-loops');
  });

  it('keeps reduced-motion guards', () => {
    expect(js).toContain('prefers-reduced-motion');
  });
});

describe('design-system contract — preview parity matrix (R0)', () => {
  const service = new PreviewService();
  const kinds: Array<{ kind: string; config: Record<string, unknown> }> = [
    { kind: 'banner', config: { fields: { heading: 'Hi' }, blocks: [] } },
    { kind: 'notification-bar', config: { fields: { message: 'Sale' }, blocks: [] } },
    { kind: 'popup', config: { fields: {}, blocks: [], title: 'Welcome' } },
    { kind: 'contactForm', config: { fields: {}, blocks: [], title: 'Contact', showEmail: true } },
    { kind: 'effect', config: { fields: {}, blocks: [], effectKind: 'snowfall' } },
    { kind: 'floatingWidget', config: { fields: {}, blocks: [], variant: 'chat', label: 'Chat' } },
    { kind: 'hero', config: { fields: {}, blocks: [], title: 'Big launch' } },
  ];

  for (const { kind, config } of kinds) {
    for (const pack of ['luxe', 'bold', 'playful', 'utility'] as const) {
      it(`renders ${kind} × ${pack} inside the pack scope with the real stylesheet`, () => {
        const spec = {
          type: 'theme.section',
          name: `${kind} preview`,
          category: 'STOREFRONT_UI',
          requires: ['THEME_ASSETS'],
          config: { kind, activation: 'section', ...config },
          style: { pack },
        } as unknown as RecipeSpec;
        const out = service.render(spec);
        if (out.kind !== 'HTML') throw new Error('expected HTML preview');
        expect(out.html).toContain(`data-sa-pack="${pack}"`);
        // The real storefront stylesheet is inlined (pack map markers present).
        // Bracket form + quote-tolerant so the minified asset (unquoted selectors) matches.
        expect(out.html).toMatch(/\[data-sa-pack=['"]?luxe['"]?\]/);
        expect(out.html).toContain('--sa-display-size');
      });
    }
  }
});
