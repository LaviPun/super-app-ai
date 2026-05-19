import { expect, test } from '@playwright/test';

test('renders merchant preview shell with a sandboxed generated artifact iframe', async ({ page }) => {
  await page.goto('/internal/templates/UAO-001/preview?mode=merchant&surface=cart');

  await expect(page.getByText('Merchant storefront simulation')).toBeVisible();
  await expect(page.getByText('Sandboxed preview')).toBeVisible();
  await expect(page.getByText('Generated preview artifacts only')).toBeVisible();

  const iframe = page.locator('iframe[title$="generated preview"]');
  await expect(iframe).toHaveAttribute('sandbox', '');
  await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
});
