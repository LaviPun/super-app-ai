import { expect, test, type Page } from '@playwright/test';

/**
 * Internal Admin smoke test (SuperApp AI redesign).
 * Visits every admin route, asserts the response is < 500, the design shell renders
 * (`.admin-shell` + `.admin-nav`), and no uncaught console errors are emitted.
 *
 * Uses the storageState produced by auth.setup.ts (configured in playwright.config.ts).
 */

// Every admin route reachable from the design nav, plus a representative detail page each.
const ADMIN_ROUTES: string[] = [
  '/internal', // Dashboard
  // Operations
  '/internal/stores',
  '/internal/stores/shp_8x21',
  '/internal/jobs',
  '/internal/jobs/job_8x21', // detail (placeholder falls back to first job)
  '/internal/activity',
  '/internal/api-logs',
  '/internal/logs',
  '/internal/webhooks',
  '/internal/webhooks/wh_1',
  '/internal/audit',
  '/internal/trace/cor_rs8f2',
  // Platform
  '/internal/modules',
  '/internal/modules/mod_a1',
  '/internal/flows',
  '/internal/flows/flo_1',
  '/internal/connectors',
  '/internal/connectors/con_1',
  '/internal/data-stores',
  '/internal/data-stores/reviews',
  '/internal/customers',
  '/internal/customers/cus_8x21',
  // AI & Models
  '/internal/ai-providers',
  '/internal/ai-assistant',
  '/internal/model-setup',
  '/internal/usage',
  '/internal/release-dashboard',
  // Catalog
  '/internal/plan-tiers',
  '/internal/categories',
  '/internal/templates',
  '/internal/recipe-edit',
  // Settings
  '/internal/settings',
];

// Console messages that are noise rather than genuine app errors.
function isIgnorableConsoleError(text: string): boolean {
  return (
    text.includes('favicon') ||
    text.includes('Download the React DevTools') ||
    text.includes('[vite]') ||
    text.includes('ResizeObserver loop')
  );
}

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isIgnorableConsoleError(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (!isIgnorableConsoleError(err.message)) errors.push(err.message);
  });
  return errors;
}

for (const route of ADMIN_ROUTES) {
  test(`admin route renders: ${route}`, async ({ page }) => {
    const errors = await collectConsoleErrors(page);

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(response!.status(), `5xx for ${route}`).toBeLessThan(500);

    // The design shell must render on every authed admin page.
    await expect(page.locator('.admin-shell'), `.admin-shell missing on ${route}`).toBeVisible();
    await expect(page.locator('.admin-nav'), `.admin-nav missing on ${route}`).toBeVisible();

    // No uncaught console errors.
    expect(errors, `console errors on ${route}: ${errors.join(' | ')}`).toHaveLength(0);
  });
}

test('command palette opens with the design markup', async ({ page }) => {
  await page.goto('/internal');
  await expect(page.locator('.admin-shell')).toBeVisible();
  // ⌘K / Ctrl+K toggles the command palette overlay (.cmdk). The keydown listener
  // attaches after client hydration, so retry the shortcut to absorb that timing
  // (an immediate single press can land before the listener is registered).
  await expect(async () => {
    if (await page.locator('.cmdk').count()) await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await expect(page.locator('.cmdk')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.cmdk')).toHaveCount(0);
});

test('nav sections + brand match the design spec', async ({ page }) => {
  await page.goto('/internal', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.admin-brand .brand-name')).toHaveText('SuperApp AI');
  await expect(page.locator('.admin-brand .brand-sub')).toHaveText('Internal Admin');
  for (const section of ['Overview', 'Operations', 'Platform', 'AI & Models', 'Catalog']) {
    await expect(page.locator('.nav-sec-title', { hasText: section })).toBeVisible();
  }
});
