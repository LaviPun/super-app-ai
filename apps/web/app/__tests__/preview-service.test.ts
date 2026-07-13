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
      // Surface-authentic checkout frame (2026-07-10) labels the surface in its caption.
      expect(preview.html).toContain('Shopify Checkout');
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
      // Both pack maps are in the inlined stylesheet regardless of the wrapper pack.
      // Bracket form + quote-tolerant: the shipped CSS is minified (unquoted selectors),
      // and the `[...]` keeps this matching the CSS, not the double-quoted wrapper attr.
      expect(out.html).toMatch(/\[data-sa-pack=['"]?luxe['"]?\]/);
      expect(out.html).toMatch(/\[data-sa-pack=['"]?bold['"]?\]/);
    });

    // ── Token discipline + composition (composition-rules.md §04) ─────────────
    // Storefront archetype renderers must draw every accent/CTA/chip color from
    // `--sa-*` tokens (dressed by the inlined pack stylesheet), never a hardcoded
    // brand hex. This denylist is the regression guard the screenshot defects
    // (blue icons, indigo "MOST POPULAR" chip, violet hero media) would trip.
    const FORBIDDEN_ACCENT =
      /#(?:2563eb|6366f1|4f46e5|7c3aed|3b82f6|818cf8|a5b4fc|8b5cf6)\b|\b(?:indigo|violet|slateblue)\b/i;

    const arch = (kind: string, blocks: unknown[], pack: 'luxe' | 'bold' = 'luxe'): RecipeSpec =>
      ({
        type: 'theme.section',
        name: kind,
        category: 'STOREFRONT_UI',
        requires: ['THEME_ASSETS'],
        style: { pack, colors: { seed: '#8a6d3b' } },
        config: { kind, activation: 'section', fields: {}, blocks, title: 'Title', subtitle: 'Sub' },
      }) as unknown as RecipeSpec;

    const html = (spec: RecipeSpec): string => {
      const out = service.render(spec);
      if (out.kind !== 'HTML') throw new Error('expected HTML');
      return out.html;
    };

    it('emits no hardcoded accent hex in any storefront archetype preview', () => {
      const specs: RecipeSpec[] = [
        arch('feature', [{ kind: 'feature', text: 'Fast', fields: { heading: 'Speed', icon: 'bolt' } }]),
        arch('pricing', [
          { kind: 'plan', text: 'Pro', fields: { price: '29', period: 'mo', recommended: true, features: ['A', 'B'], ctaLabel: 'Go' } },
        ]),
        arch('stats', [{ kind: 'stat', text: 'Average rating', fields: { value: '4.9', suffix: '/5', label: 'Rating' } }]),
        arch('faq', [{ kind: 'faq-item', text: 'Q', fields: { question: 'Why?', answer: 'Because.' } }]),
        arch('hero', [{ kind: 'cta', text: 'Buy', url: '#' }]),
        arch('pricing', [{ kind: 'plan', text: 'Pro', fields: { recommended: true, features: ['X'] } }], 'bold'),
      ];
      for (const spec of specs) {
        expect(html(spec)).not.toMatch(FORBIDDEN_ACCENT);
      }
    });

    it('renders pricing features as the left-aligned flex-row class the pack dresses', () => {
      const out = html(
        arch('pricing', [
          { kind: 'plan', text: 'Pro', fields: { price: '29', features: ['Unlimited seats', 'Priority support'] } },
        ]),
      );
      // The `.superapp-pricing__feature` list item is styled by the pack sheet as
      // `display:flex; align-items:flex-start; text-align:left` with a ✓ ::before —
      // emitting the class (not a bespoke centered marker) is what fixes the
      // "✓ detached from centered text" defect.
      expect(out).toContain('superapp-pricing__features');
      expect(out).toContain('class="superapp-pricing__feature">Unlimited seats');
    });

    it('renders stat prefix/value/suffix (unit affixes no longer dropped)', () => {
      const out = html(
        arch('stats', [
          { kind: 'stat', text: 'ignored-when-value-set', fields: { value: '4.9', suffix: '/5', prefix: '', label: 'Average rating' } },
          { kind: 'stat', text: '$1.2M', fields: { label: 'Revenue' } },
        ]),
      );
      expect(out).toContain('class="superapp-stats__value">4.9/5<');
      expect(out).toContain('class="superapp-stats__value">$1.2M<');
      expect(out).toContain('class="superapp-stats__label">Average rating<');
    });

    it('wraps buyer-facing surfaces in the pack but NOT operator surfaces', () => {
      // Buyer-facing (checkout/cart/post-purchase/customer account) carry the
      // two-pack design system — they render in front of the shopper (2026-07-10).
      const checkout = service.render(
        {
          type: 'checkout.block',
          name: 'Checkout Trust Block',
          category: 'STOREFRONT_UI',
          requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
          config: { target: 'purchase.checkout.block.render', title: 'T', message: 'M' },
          style: { pack: 'bold', colors: { seed: '#E11D48' } },
        } as unknown as RecipeSpec,
        { surface: 'checkout' },
      );
      if (checkout.kind !== 'HTML') throw new Error('expected HTML');
      expect(checkout.html).toContain('data-sa-pack="bold"');

      // Operator surfaces (admin/POS/functions/…) stay on the neutral surface
      // chrome — no pack wrapper.
      const admin = service.render({
        type: 'admin.block',
        name: 'Admin Block',
        category: 'ADMIN_UI',
        requires: [],
        config: { target: 'admin.order-details.block.render', label: 'Do thing' },
      } as unknown as RecipeSpec);
      if (admin.kind !== 'HTML') throw new Error('expected HTML');
      expect(admin.html).not.toContain('data-sa-pack=');
    });
  });
});
