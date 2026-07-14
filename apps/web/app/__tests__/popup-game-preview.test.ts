import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

/**
 * Preview parity for the gamified popup variants (spin-to-win wheel + scratch
 * card). The storefront renderer (superapp-module.liquid) upgrades a popup to a
 * wheel when its blocks[] carry kind:'slice', and to a scratch card for
 * kind:'scratch'. PreviewService must mirror both as a static visual — never a
 * plain title/body/cta popup — and a popup WITHOUT slice/scratch blocks must keep
 * rendering the classic popup (feature-gate on block presence).
 */
describe('gamified popup preview (spin-to-win wheel + scratch card)', () => {
  const service = new PreviewService();
  const html = (spec: RecipeSpec) => {
    const r = service.render(spec);
    return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
  };

  const popupSpec = (
    blocks: Array<{ kind: string; text?: string; fields?: Record<string, unknown> }>,
  ): RecipeSpec =>
    ({
      type: 'theme.section',
      name: 'Popup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'popup',
        activation: 'overlay',
        title: 'Spin to win',
        subtitle: 'Enter your email for one spin.',
        fields: {},
        blocks,
      },
      placement: { enabled_on: { templates: ['index'] } },
    }) as unknown as RecipeSpec;

  it('renders a spin-to-win wheel when blocks carry kind:"slice"', () => {
    const out = html(
      popupSpec([
        { kind: 'slice', text: '10% off', fields: { couponCode: 'SPIN10', oddsWeight: 30 } },
        { kind: 'slice', text: 'Free shipping', fields: { couponCode: 'SPINSHIP', oddsWeight: 20 } },
        { kind: 'slice', text: 'No luck — try again', fields: { couponCode: '', oddsWeight: 5 } },
      ]),
    );
    // Wheel dial markup with the per-slice conic gradient (the pack stylesheet is
    // inlined into every popup preview, so we assert on MARKUP-only tokens — inline
    // style, segment count, affordance copy — not on class names that also live in CSS).
    expect(out).toContain('superapp-wheel__dial');
    expect(out).toContain('conic-gradient(from -90deg');
    // Slice labels are surfaced around the hub.
    expect(out).toContain('10% off');
    expect(out).toContain('Free shipping');
    // Segment count is stamped for the CSS wedge geometry.
    expect(out).toContain('--sa-wheel-n:3');
    // Affordance that it animates on the live storefront (not in preview).
    expect(out).toContain('Spins on the storefront');
    // A wheel popup does not render the scratch affordance.
    expect(out).not.toContain('Scratches on the storefront');
  });

  it('renders a scratch card when blocks carry kind:"scratch"', () => {
    const out = html(
      popupSpec([
        { kind: 'scratch', text: 'Mystery 20% off', fields: { couponCode: 'SCRATCH20' } },
      ]),
    );
    // Markup-only tokens (class names also live in the inlined pack stylesheet).
    expect(out).toContain('superapp-scratch__overlay'); // preview-only overlay div
    expect(out).toContain('Mystery 20% off');
    expect(out).toContain('Scratches on the storefront');
    // A scratch popup does not render the wheel affordance.
    expect(out).not.toContain('Spins on the storefront');
    expect(out).not.toContain('conic-gradient(from -90deg');
  });

  it('keeps the classic popup (no wheel/scratch) when there are no slice/scratch blocks', () => {
    const spec = popupSpec([{ kind: 'field', text: 'Email', fields: { input: 'email' } }]);
    (spec.config as unknown as { body: string; ctaText: string; ctaUrl: string }).body = 'Join the list';
    (spec.config as unknown as { ctaText: string }).ctaText = 'Reveal code';
    (spec.config as unknown as { ctaUrl: string }).ctaUrl = 'https://example.com/x';
    const out = html(spec);
    // No game affordances (markup-only tokens); the classic body/cta render instead.
    expect(out).not.toContain('Spins on the storefront');
    expect(out).not.toContain('Scratches on the storefront');
    expect(out).not.toContain('conic-gradient(from -90deg');
    expect(out).not.toContain('superapp-scratch__overlay');
    expect(out).toContain('Join the list');
    expect(out).toContain('Reveal code');
  });
});
