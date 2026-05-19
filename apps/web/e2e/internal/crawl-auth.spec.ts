import { test, expect } from '@playwright/test';

const ROUTES = [
  '/internal',
  '/internal/release-dashboard',
  '/internal/activity',
  '/internal/logs',
  '/internal/api-logs',
  '/internal/audit',
  '/internal/webhooks',
  '/internal/stores',
  '/internal/usage',
  '/internal/ai-accounts',
  '/internal/jobs',
  '/internal/ai-providers',
  '/internal/ai-assistant',
  '/internal/model-setup',
  '/internal/plan-tiers',
  '/internal/categories',
  '/internal/templates',
  '/internal/recipe-edit',
  '/internal/settings',
  '/internal/metaobject-backfill',
  '/internal/advanced',
];

test.describe('authenticated internal crawl', () => {
  test('all nav routes return 200 without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('favicon')) return;
        // Remix Vite dev HMR manifest patch noise — not an app defect.
        if (text.includes('Failed to fetch manifest patches')) return;
        consoleErrors.push(`${msg.location().url}: ${text}`);
      }
    });

    page.on('requestfailed', (req) => {
      const failure = req.failure();
      const url = req.url();
      if (url.includes('favicon')) return;
      // Vite dev client aborts in-flight module/manifest fetches during fast navigations.
      if (failure?.errorText === 'net::ERR_ABORTED') return;
      failedRequests.push(`${req.method()} ${url} — ${failure?.errorText ?? 'failed'}`);
    });

    for (const route of ROUTES) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `status for ${route}`).toBeLessThan(400);
      await expect(page.locator('body')).not.toContainText('Application Error');
      await expect(page.locator('body')).not.toContainText('Unexpected Server Error');
      const title = await page.title();
      expect(title.length, `empty title for ${route}`).toBeGreaterThan(0);
      expect(title, `generic title for ${route}`).not.toBe('Document');
    }

    expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
    expect(failedRequests, `failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
  });

  test('AI assistant import modal opens', async ({ page }) => {
    await page.goto('/internal/ai-assistant');
    await page.getByTestId('memory-import').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('templates index loads', async ({ page }) => {
    await page.goto('/internal/templates');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
