/**
 * R2.1 — preview reflects display rules via the SHARED evaluator.
 * The preview visitor is a logged-out, first-time, US shopper with an empty cart.
 */
import { describe, it, expect } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

const service = new PreviewService();

function section(ruleEngine: unknown): RecipeSpec {
  return {
    type: 'theme.section',
    name: 'Rule-gated banner',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: { kind: 'banner', activation: 'section', fields: { heading: 'Hello' }, blocks: [], ruleEngine },
  } as unknown as RecipeSpec;
}

describe('preview — rule-engine reflection (R2.1)', () => {
  it('renders the module normally when ruleEngine is absent (back-compat)', () => {
    const out = service.render(section(undefined));
    expect(out.kind).toBe('HTML');
    if (out.kind === 'HTML') {
      expect(out.html).not.toContain('Hidden by display rules');
      expect(out.html).toContain('superapp-banner');
    }
  });

  it('shows the "hidden by display rules" state when a server-resolvable rule hides for the preview visitor', () => {
    // "logged-in only" → the logged-out preview visitor fails → hide.
    const out = service.render(
      section({
        enabled: true, logic: 'AND', matchAction: 'SHOW', onUnresolved: 'defer',
        groups: [{ logic: 'AND', conditions: [{ object: 'customer', attribute: 'loggedIn', operator: 'equal_to', value: true }] }],
      }),
    );
    expect(out.kind).toBe('HTML');
    if (out.kind === 'HTML') {
      expect(out.html).toContain('Hidden by display rules');
      expect(out.html).not.toContain('superapp-banner');
    }
  });

  it('renders the module (not the hidden state) when the rule passes for the preview visitor', () => {
    // geo US == US → passes for the US preview visitor → show.
    const out = service.render(
      section({
        enabled: true, logic: 'AND', matchAction: 'SHOW', onUnresolved: 'defer',
        groups: [{ logic: 'AND', conditions: [{ object: 'geo', attribute: 'countryCode', operator: 'equal_to', value: 'US' }] }],
      }),
    );
    expect(out.kind).toBe('HTML');
    if (out.kind === 'HTML') {
      expect(out.html).not.toContain('Hidden by display rules');
      expect(out.html).toContain('superapp-banner');
    }
  });

  it('does NOT show the hidden state for a behavioral rule (deferred to client, so preview shows the module)', () => {
    const out = service.render(
      section({
        enabled: true, logic: 'AND', matchAction: 'SHOW', onUnresolved: 'defer',
        groups: [{ logic: 'AND', conditions: [{ object: 'behavioral', attribute: 'exitIntent', operator: 'equal_to', value: true }] }],
      }),
    );
    expect(out.kind).toBe('HTML');
    if (out.kind === 'HTML') {
      // Unresolved (behavioral) → not a definite hide → module renders.
      expect(out.html).not.toContain('Hidden by display rules');
      expect(out.html).toContain('superapp-banner');
    }
  });
});
