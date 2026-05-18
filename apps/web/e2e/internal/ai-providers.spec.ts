import { expect, test } from '@playwright/test';

test('shows ai providers controls and code execution warning', async ({ page }) => {
  await page.goto('/internal/ai-providers');
  await expect(page.getByRole('heading', { name: 'AI Providers' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Claude default' })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Enable code execution for Claude' }).check();
  await expect(page.getByText('Code execution safety boundary')).toBeVisible();
});
