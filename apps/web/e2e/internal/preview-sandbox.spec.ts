import { expect, test } from '@playwright/test';

// Realigned to a real template 2026-08-24 (task-8b): "UAO-001" never existed in
// this codebase (real template IDs follow an "XXXX-NN" pattern, e.g. "ADUI-01")
// — see task-8b-report.md. The shell/iframe assertions below are unchanged.
test('renders merchant preview shell with a sandboxed generated artifact iframe', async ({ page }) => {
  await page.goto('/internal/templates/ADUI-01/preview?mode=merchant&surface=cart');

  await expect(page.getByText('Merchant storefront simulation')).toBeVisible();
  await expect(page.getByText('Sandboxed preview')).toBeVisible();
  await expect(page.getByText('Generated preview artifacts only')).toBeVisible();

  const iframe = page.locator('iframe[title$="generated preview"]');
  await expect(iframe).toHaveAttribute('sandbox', '');
  await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
});
