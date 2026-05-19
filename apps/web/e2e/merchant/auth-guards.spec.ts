import { test, expect } from '@playwright/test';

const MERCHANT_BASE = process.env.PLAYWRIGHT_MERCHANT_URL ?? 'http://127.0.0.1:3000';

test.describe('merchant auth guards without Shopify session', () => {
  test.beforeEach(async ({}, testInfo) => {
    try {
      const res = await fetch(MERCHANT_BASE, { method: 'HEAD' });
      if (!res.ok && res.status !== 410) {
        testInfo.skip(true, `merchant server not reachable at ${MERCHANT_BASE}`);
      }
    } catch {
      testInfo.skip(true, `merchant server not reachable at ${MERCHANT_BASE}`);
    }
  });

  test('advanced and picker are gated like other merchant routes', async ({ request }) => {
    for (const path of ['/advanced', '/picker', '/modules']) {
      const response = await request.get(`${MERCHANT_BASE}${path}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect([410, 302, 401, 403], `unexpected status for ${path}: ${response.status()}`).toContain(
        response.status(),
      );
    }
  });
});
