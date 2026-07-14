import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { runRenderQa } from '~/services/ai/design-qa-render.server';

/** A minimal renderable theme.section from a config object. */
function section(config: Record<string, unknown>, style?: Record<string, unknown>): RecipeSpec {
  return {
    type: 'theme.section',
    name: 'Render QA Fixture',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config,
    style: style ?? {
      layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
      spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
      typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
      colors: { text: '#111827', background: '#FFFFFF', overlayBackdropOpacity: 0.45 },
      shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'border' },
      responsive: { hideOnMobile: false, hideOnDesktop: false },
      accessibility: { focusVisible: true, reducedMotion: true },
      pack: 'luxe',
    },
  } as unknown as RecipeSpec;
}

const ids = (r: RecipeSpec) => runRenderQa(r).map((i) => i.id);

describe('render QA — scope + failure safety', () => {
  it('returns [] for non-renderable types', () => {
    const r = { type: 'functions.cartTransform', name: 'fn', category: 'FUNCTIONS' } as unknown as RecipeSpec;
    expect(runRenderQa(r)).toEqual([]);
  });

  it('all issues (if any) are warn severity — telemetry-first', () => {
    const r = section({ kind: 'hero', title: 'Hi', subtitle: 'x', blocks: [{ kind: 'cta', text: 'Go', url: '/g' }] });
    for (const issue of runRenderQa(r)) expect(issue.severity).toBe('warn');
  });

  it('renders a clean hero without a moustache/placeholder leak', () => {
    const r = section({
      kind: 'hero',
      title: 'Built to last',
      subtitle: 'Premium essentials',
      fields: { bodyText: 'Real body copy.', mediaImageUrl: 'https://cdn.example.com/x.jpg', mediaAlt: 'A photo' },
      blocks: [{ kind: 'cta', text: 'Shop now', url: 'https://example.com/c' }],
    });
    const out = ids(r);
    expect(out).not.toContain('render:moustache-leak');
    expect(out).not.toContain('render:lorem');
    expect(out).not.toContain('render:placeholder-word');
  });
});

describe('render QA — placeholder leakage', () => {
  it('flags an unrendered {{ }} moustache token', () => {
    const r = section({ kind: 'hero', title: 'Hello {{ customer.name }}', subtitle: 'x', blocks: [{ kind: 'cta', text: 'Go', url: '/g' }] });
    expect(ids(r)).toContain('render:moustache-leak');
  });

  it('flags lorem ipsum placeholder copy', () => {
    const r = section({
      kind: 'hero',
      title: 'Lorem ipsum dolor sit amet',
      subtitle: 'lorem ipsum consectetur',
      blocks: [{ kind: 'cta', text: 'Go', url: '/g' }],
    });
    expect(ids(r)).toContain('render:lorem');
  });

  it('flags a TODO / PLACEHOLDER marker in copy', () => {
    const r = section({ kind: 'hero', title: 'TODO write this', subtitle: 'x', blocks: [{ kind: 'cta', text: 'Go', url: '/g' }] });
    expect(ids(r)).toContain('render:placeholder-word');
  });
});

describe('render QA — heading length', () => {
  it('flags a hero heading longer than 120 chars', () => {
    const long = 'A'.repeat(140);
    const r = section({ kind: 'hero', title: long, subtitle: 'x', blocks: [{ kind: 'cta', text: 'Go', url: '/g' }] });
    expect(ids(r)).toContain('render:heading-too-long');
  });

  it('does not flag a normal-length hero heading', () => {
    const r = section({ kind: 'hero', title: 'Built to last, designed to love', subtitle: 'x', blocks: [{ kind: 'cta', text: 'Go', url: '/g' }] });
    expect(ids(r)).not.toContain('render:heading-too-long');
  });
});
