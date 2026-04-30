import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';

describe('PreviewService structured fixtures', () => {
  const service = new PreviewService();

  it('renders structured HTML preview for non-theme templates', () => {
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
      expect(preview.html).toContain('Workflow context');
      expect(preview.html).toContain('Fixture products');
      expect(preview.html).toContain('checkout');
    }
  });

  it('keeps theme templates on interactive HTML renderer', () => {
    const spec: RecipeSpec = {
      type: 'theme.popup',
      name: 'Welcome Popup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
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
});
