import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

describe('PreviewService structured fixtures', () => {
  const service = new PreviewService();

  it('renders an interactive checkout-surface preview for non-theme templates (WS4)', () => {
    const spec: RecipeSpec = {
      type: 'checkout.block',
      name: 'Checkout Trust Block',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        target: 'purchase.checkout.block.render',
        title: 'Trust guarantee',
        message: 'Free returns and secure checkout',
      },
    };

    const preview = service.render(spec, { surface: 'checkout' });
    expect(preview.kind).toBe('HTML');
    if (preview.kind === 'HTML') {
      // New interactive surface mock — not the removed static diagram.
      expect(preview.html).not.toContain('Workflow context');
      expect(preview.html).toContain('Order summary');
      expect(preview.html).toContain('Trust guarantee');
      expect(preview.html).toContain('checkout UI');
    }
  });

  it('keeps theme templates on interactive HTML renderer', () => {
    const spec: RecipeSpec = {
      type: 'theme.section',
      name: 'Welcome Popup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'popup',
        activation: 'overlay',
        fields: {},
        blocks: [],
        title: 'Welcome',
        trigger: 'ON_LOAD',
        delaySeconds: 0,
        frequency: 'ONCE_PER_DAY',
        maxShowsPerDay: 1,
        showOnPages: 'ALL',
        customPageUrls: [],
        autoCloseSeconds: 0,
        showCloseButton: true,
        countdownEnabled: false,
        countdownSeconds: 0,
        countdownLabel: '',
      },
      placement: {
        enabled_on: {
          templates: ['index'],
        },
      },
    };

    const preview = service.render(spec, { surface: 'product' });
    expect(preview.kind).toBe('HTML');
    if (preview.kind === 'HTML') {
      expect(preview.html).toContain('Open popup preview');
    }
  });

  // ── Preview ⇄ storefront parity (module-design-system.md R0) ────────────────
  describe('two-pack parity wrapper', () => {
    const section = (style?: Record<string, unknown>): RecipeSpec =>
      ({
        type: 'theme.section',
        name: 'Hero Banner',
        category: 'STOREFRONT_UI',
        requires: ['THEME_ASSETS'],
        config: { kind: 'banner', activation: 'section', fields: { heading: 'Hi' }, blocks: [] },
        ...(style ? { style } : {}),
      }) as unknown as RecipeSpec;

    it('wraps storefront previews in .superapp-scope with the resolved pack (default luxe)', () => {
      const out = service.render(section());
      if (out.kind !== 'HTML') throw new Error('expected HTML');
      expect(out.html).toContain('class="superapp-scope" data-sa-pack="luxe"');
    });

    it('stamps data-sa-pack="bold" when style.pack is bold, with the accent override from seed', () => {
      const out = service.render(section({ pack: 'bold', colors: { text: '#111111', background: '#ffffff', seed: '#ff4d2e' } }));
      if (out.kind !== 'HTML') throw new Error('expected HTML');
      expect(out.html).toContain('data-sa-pack="bold"');
      expect(out.html).toContain('--sa-accent-override:#ff4d2e');
    });

    it('inlines the real storefront stylesheet (pack token map present)', () => {
      const out = service.render(section());
      if (out.kind !== 'HTML') throw new Error('expected HTML');
      expect(out.html).toContain("data-sa-pack='luxe'");
      expect(out.html).toContain("data-sa-pack='bold'");
    });

    it('does NOT wrap non-storefront previews', () => {
      const spec: RecipeSpec = {
        type: 'checkout.block',
        name: 'Checkout Trust Block',
        category: 'STOREFRONT_UI',
        requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
        config: { target: 'purchase.checkout.block.render', title: 'T', message: 'M' },
      } as unknown as RecipeSpec;
      const out = service.render(spec, { surface: 'checkout' });
      if (out.kind !== 'HTML') throw new Error('expected HTML');
      expect(out.html).not.toContain('data-sa-pack=');
    });
  });
});
