import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

/**
 * V-B conversion core (B1 progress bar / B2 post-ATC offer / B3 sticky ATC) —
 * preview⇄storefront parity. Markup-only assertions on the PreviewService output
 * plus a token check on the storefront Liquid branch, following the
 * vocab-va-preview.test.ts pattern.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
const LIQUID_SRC = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets/superapp-module.liquid');

const service = new PreviewService();
const render = (spec: RecipeSpec): string => {
  const r = service.render(spec);
  return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
};
const section = (kind: string, config: Record<string, unknown>): RecipeSpec =>
  ({
    type: 'theme.section',
    name: kind,
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: { kind, activation: 'section', title: '', subtitle: '', fields: {}, blocks: [], ...config },
    placement: { enabled_on: { templates: ['product'] } },
  }) as unknown as RecipeSpec;

describe('B1 — cart-goal progress bar preview', () => {
  const spec = section('progress-bar', {
    title: 'Free shipping progress',
    progressGoal: {
      basis: 'cart-total',
      tiers: [
        { threshold: 50, rewardType: 'shipping', label: 'Free shipping' },
        { threshold: 100, rewardType: 'discount', label: '10% off' },
        { threshold: 150, rewardType: 'product', label: 'Free gift' },
      ],
      beforeText: 'Spend {remaining} more to reach your next reward',
      afterText: 'All unlocked — {amount} in your cart!',
      barStyle: 'chunky',
    },
  });

  it('renders a track + fill + one marker per tier, not a plain announcement band', () => {
    const out = render(spec);
    expect(out).toContain('class="superapp-progress');
    expect(out).toContain('superapp-progress--chunky');
    expect(out).toContain('superapp-progress__fill');
    // Markup-only token (the class name also lives in the inlined pack stylesheet).
    expect((out.match(/class="superapp-progress__marker/g) ?? []).length).toBe(3);
    // Not the generic band countdown/announcement markup.
    expect(out).not.toContain('data-sa-countdown');
  });

  it('simulates 65%-to-first-tier and substitutes the {remaining} token (money-formatted)', () => {
    const out = render(spec);
    // current = 0.65 * 50 = 32.50, remaining to first tier = 17.50.
    expect(out).toContain('$17.50');
    expect(out).not.toContain('{remaining}');
    // fill width is current/maxTier = 32.5/150 ≈ 21.67% → rounded 22%.
    expect(out).toMatch(/width:22%/);
  });
});

describe('B2 — post-add-to-cart offer preview', () => {
  const spec = section('post-atc-offer', {
    title: 'Post-add upsell',
    // ASCII only: esc() numerically encodes chars > 127 in the preview.
    offerTitle: 'Add this before you go',
    acceptLabel: 'Add to order',
    declineLabel: 'No thanks',
    recommendation: { strategy: 'related', fallback: 'related', productLimit: 4 },
  });

  it('renders a static modal mock with the offer title and accept/decline actions', () => {
    const out = render(spec);
    expect(out).toContain('superapp-postatc-mock');
    expect(out).toContain('Add this before you go');
    expect(out).toContain('superapp-postatc__accept');
    expect(out).toContain('>Add to order<');
    expect(out).toContain('>No thanks<');
    // Surfaces the resolution source honestly.
    expect(out).toContain('related');
  });
});

describe('B3 — sticky ATC v2 preview', () => {
  it('renders a static bar mock with a variant select + scroll affordance', () => {
    const out = render(section('sticky-atc', { ctaText: 'Add to bag', fields: { showQuantity: true } }));
    expect(out).toContain('superapp-satc--preview');
    expect(out).toContain('superapp-satc__variant');
    expect(out).toContain('superapp-satc__qty');
    expect(out).toContain('>Add to bag<');
    expect(out).toContain('scrolls out of view');
  });

  it('omits the quantity stepper when showQuantity is false', () => {
    const out = render(section('sticky-atc', { fields: { showQuantity: false } }));
    // Markup-only token (the class name also lives in the inlined pack stylesheet).
    expect(out).not.toContain('class="superapp-satc__qty"');
  });
});

describe('B1 / B2 / B3 — storefront Liquid branch tokens present', () => {
  const liquid = readFileSync(LIQUID_SRC, 'utf8');

  it('B1 progress-bar renders a JSON-config mount + track/fill read from /cart.js', () => {
    expect(liquid).toContain("sa_kind_h == 'progress-bar'");
    expect(liquid).toContain('data-sa-progress');
    expect(liquid).toContain('data-sa-progress-config');
    expect(liquid).toContain('mod_cfg.progressGoal | json');
    expect(liquid).toContain('shop.money_format');
  });

  it('B2 post-atc-offer mounts the recommendation-seeded modal trigger', () => {
    expect(liquid).toContain("sa_kind_h == 'post-atc-offer'");
    expect(liquid).toContain('data-sa-postatc');
    expect(liquid).toContain('data-strategy=');
    expect(liquid).toContain('data-accept=');
  });

  it('B3 sticky-atc renders real product context (variant loop) gated on a product', () => {
    expect(liquid).toContain("when 'sticky-atc'");
    expect(liquid).toContain('data-sa-satc');
    expect(liquid).toContain('data-watch=');
    expect(liquid).toContain('for v in product.variants');
    expect(liquid).toContain('data-sa-satc-add');
    expect(liquid).toContain('/cart/add');
  });
});
