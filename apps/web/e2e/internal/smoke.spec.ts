import { expect, test, type Page } from '@playwright/test';

/**
 * Internal Admin smoke test (SuperApp AI redesign).
 * Visits every admin route, asserts the response is < 500, the design shell renders
 * (`.admin-shell` + `.admin-nav`), and no uncaught console errors are emitted.
 *
 * Uses the storageState produced by auth.setup.ts (configured in playwright.config.ts).
 */

// Every list/index admin route reachable from the design nav. These render the
// design shell even on an empty DB (they show EmptyStates), so we assert the
// shell + nav are present.
const SHELL_ROUTES: string[] = [
  '/internal', // Dashboard
  // Operations
  '/internal/stores',
  '/internal/jobs',
  '/internal/activity',
  '/internal/api-logs',
  '/internal/logs',
  '/internal/webhooks',
  '/internal/audit',
  // Platform
  '/internal/modules',
  '/internal/flows',
  '/internal/connectors',
  '/internal/data-stores',
  '/internal/customers',
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

// Detail routes driven with synthetic ids. On CI's empty DB these records don't
// exist; the loaders correctly return not-found rather than fabricating a record
// (the old placeholder-fallback behavior was removed in the 2026-07 repair pass).
// We assert they respond gracefully (no 5xx, no uncaught console error) without
// requiring the design shell.
const DETAIL_ROUTES: string[] = [
  '/internal/stores/shp_8x21',
  '/internal/jobs/job_8x21',
  '/internal/webhooks/wh_1',
  '/internal/modules/mod_a1',
  '/internal/flows/flo_1',
  '/internal/connectors/con_1',
  '/internal/data-stores/reviews',
  '/internal/customers/cus_8x21',
  '/internal/trace/cor_rs8f2',
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

for (const route of SHELL_ROUTES) {
  test(`admin route renders: ${route}`, async ({ page }) => {
    const errors = await collectConsoleErrors(page);

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(response!.status(), `5xx for ${route}`).toBeLessThan(500);

    // The design shell must render on every authed admin list page.
    await expect(page.locator('.admin-shell'), `.admin-shell missing on ${route}`).toBeVisible();
    await expect(page.locator('.admin-nav'), `.admin-nav missing on ${route}`).toBeVisible();

    // No uncaught console errors.
    expect(errors, `console errors on ${route}: ${errors.join(' | ')}`).toHaveLength(0);
  });
}

for (const route of DETAIL_ROUTES) {
  test(`admin detail route handles unknown id gracefully: ${route}`, async ({ page }) => {
    const errors = await collectConsoleErrors(page);

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response, `no response for ${route}`).not.toBeNull();
    // A missing record returns not-found (404), never a 5xx/crash.
    expect(response!.status(), `5xx for ${route}`).toBeLessThan(500);

    // No uncaught console errors, even on the not-found path.
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
