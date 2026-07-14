import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

/**
 * V-A A1 / A3 / A4 — preview⇄storefront parity for the three block/section upgrades
 * that render on the builder canvas (volume tiers, stock counter, testimonial
 * carousel). Markup-only assertions (the pack stylesheet is not inlined in archetype
 * previews), following the popup-game-preview.test.ts pattern.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
const LIQUID_SRC = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets/superapp-module.liquid');

const service = new PreviewService();
const render = (spec: RecipeSpec): string => {
  const r = service.render(spec);
  return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
};
const section = (
  kind: string,
  extra: { fields?: Record<string, unknown>; blocks?: Array<{ kind: string; text?: string; fields?: Record<string, unknown> }>; title?: string },
): RecipeSpec =>
  ({
    type: 'theme.section',
    name: kind,
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind,
      activation: 'section',
      title: extra.title ?? 'Section',
      subtitle: '',
      fields: extra.fields ?? {},
      blocks: extra.blocks ?? [],
    },
    placement: { enabled_on: { templates: ['product'] } },
  }) as unknown as RecipeSpec;

describe('A1 — volume/quantity-break tiers preview', () => {
  const spec = section('volume-tiers', {
    title: 'Buy more, save more',
    fields: { highlightBlockIndex: 2 },
    blocks: [
      { kind: 'tier', text: 'Buy 1', fields: { quantityMin: 1, discountLabel: 'Single', percentOff: 0 } },
      { kind: 'tier', text: 'Buy 2', fields: { quantityMin: 2, discountLabel: 'Stock up', percentOff: 10, savingsLabel: 'Save 10%' } },
      { kind: 'tier', text: 'Buy 3', fields: { quantityMin: 3, discountLabel: 'Best value', percentOff: 20, savingsLabel: 'Save 20%', highlight: true, badge: 'Most popular' } },
    ],
  });

  it('renders selectable radio-row tier cards, not plan cards', () => {
    const out = render(spec);
    // Markup-only tokens (class names also live in the inlined pack stylesheet).
    expect((out.match(/type="radio"/g) ?? []).length).toBe(3);
    expect(out).toContain('class="superapp-vtiers"');
    expect(out).not.toContain('class="superapp-pricing__plan');
  });

  it('pre-selects and badges the highlighted tier, and shows per-tier savings', () => {
    const out = render(spec);
    expect(out).toContain('superapp-vtier--hl');
    expect(out).toContain('checked />');
    expect(out).toContain('>Most popular<');
    expect(out).toContain('Save 20%');
    expect(out).toContain('20% off');
  });
});

describe('A3 — stock counter preview', () => {
  it('renders a simulated count from the threshold plus a live-inventory affordance', () => {
    const out = render(section('stock-counter', { fields: { threshold: 10, messageTemplate: 'Only {count} left in stock!', urgency: true } }));
    expect(out).toContain('superapp-stockcounter');
    expect(out).toContain('superapp-stockcounter--urgent');
    // sample = round(10 * 0.7) = 7 → the {count} token is substituted.
    expect(out).toContain('Only 7 left in stock!');
    expect(out).not.toContain('{count}');
    expect(out).toContain('Live inventory on the storefront');
  });

  it('omits the urgent modifier when urgency is off', () => {
    const out = render(section('stock-counter', { fields: { threshold: 5, messageTemplate: 'Low stock — {count} remaining', urgency: false } }));
    // Markup-only: the non-urgent counter carries the base class exactly.
    expect(out).toContain('class="superapp-stockcounter" role="status"');
    expect(out).not.toContain('superapp-stockcounter--urgent"');
  });
});

describe('A4 — testimonial carousel preview (gated)', () => {
  const rich = section('reviews', {
    title: 'Reviews',
    blocks: [
      { kind: 'review-card', text: 'Love it', fields: { author: 'Maya R.', authorTitle: 'Verified buyer', rating: 4.5, verified: true, avatarUrl: 'https://cdn.example.test/a.jpg' } },
      { kind: 'review-card', text: 'Great', fields: { author: 'Devon K.', authorTitle: 'Denver, CO', rating: 5, verified: true } },
      { kind: 'review-card', text: 'Nice', fields: { author: 'Priya S.', authorTitle: 'Repeat customer', rating: 5 } },
    ],
  });

  it('upgrades to a scroll-snap carousel when ≥3 blocks carry avatar/authorTitle', () => {
    const out = render(rich);
    expect(out).toContain('superapp-testimonial--carousel');
    expect(out).toContain('data-superapp-carousel');
    // Half-precision stars via percentage fill.
    expect(out).toContain('--sa-star-fill: 90%'); // 4.5 → 90%
    expect(out).toContain('superapp-testimonial__starsfill');
    // Verified chip + authorTitle meta + initials-avatar fallback (no real avatar url).
    expect(out).toContain('superapp-testimonial__verified');
    expect(out).toContain('Verified buyer');
    expect(out).toContain('superapp-testimonial__avatar--initials');
  });

  it('keeps the classic static grid (byte-identical) for specs without avatar/authorTitle', () => {
    const plain = section('testimonials', {
      title: 'Reviews',
      blocks: [
        { kind: 'review-card', text: 'Love it', fields: { author: 'A', rating: 5 } },
        { kind: 'review-card', text: 'Great', fields: { author: 'B', rating: 4 } },
        { kind: 'review-card', text: 'Nice', fields: { author: 'C', rating: 5 } },
      ],
    });
    const out = render(plain);
    // Markup-only tokens (class names also live in the inlined pack stylesheet).
    expect(out).not.toContain('data-superapp-carousel');
    expect(out).not.toContain('class="superapp-testimonial__starsfill');
    // Original static-grid star row is used instead.
    expect(out).toContain('class="superapp-testimonial__rating"');
  });
});

describe('A1 / A3 / A4 — storefront Liquid branch tokens present', () => {
  const liquid = readFileSync(LIQUID_SRC, 'utf8');
  it('A1 volume-tiers renders radio rows wired to the quantity input', () => {
    expect(liquid).toContain('superapp-vtiers');
    expect(liquid).toContain('data-superapp-tier');
    expect(liquid).toContain('data-quantity=');
  });
  it('A3 stock-counter reads real product inventory (no fake numbers)', () => {
    expect(liquid).toContain("sa_kind_h == 'stock-counter'");
    expect(liquid).toContain('product.selected_or_first_available_variant');
    expect(liquid).toContain('inventory_quantity');
    expect(liquid).toContain('inventory_management');
  });
  it('A4 testimonial carousel is gated on avatarUrl/authorTitle', () => {
    expect(liquid).toContain('superapp-testimonial--carousel');
    expect(liquid).toContain('fields.avatarUrl');
    expect(liquid).toContain('fields.authorTitle');
    expect(liquid).toContain('--sa-star-fill');
  });
});
