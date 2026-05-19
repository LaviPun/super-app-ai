import { describe, expect, it } from 'vitest';
import {
  assertPostHogPropertyBoundary,
  filterBrowserPostHogProperties,
} from '../posthog.js';

describe('posthog boundaries', () => {
  it('blocks server-only properties from browser events', () => {
    const result = assertPostHogPropertyBoundary('browser', {
      route: '/modules',
      shopDomain: 'demo.myshopify.com',
      prompt: 'hello',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blocked).toContain('shopDomain');
      expect(result.blocked).toContain('prompt');
    }
  });

  it('allows server events to carry operational metadata', () => {
    expect(
      assertPostHogPropertyBoundary('server', {
        queueName: 'ai-generation',
        jobId: 'job-1',
      }).ok,
    ).toBe(true);
  });

  it('filters browser events down to allowlisted keys', () => {
    expect(
      filterBrowserPostHogProperties({
        route: '/jobs',
        moduleCatalogId: 'hero-banner',
        shopDomain: 'hidden.myshopify.com',
      }),
    ).toEqual({
      route: '/jobs',
      moduleCatalogId: 'hero-banner',
    });
  });
});
