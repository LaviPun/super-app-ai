import { expect, test } from '@playwright/test';

test('renders assistant with memory controls and import modal', async ({ page }) => {
  await page.goto('/internal/ai-assistant');
  await expect(page.getByRole('heading', { name: 'AI Assistant' })).toBeVisible();
  await expect(page.getByTestId('memory-list')).toBeVisible();
  await expect(page.getByTestId('memory-create')).toBeVisible();

  await page.getByTestId('memory-import').getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('dialog', { name: 'Import session JSON' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Import session JSON' })).toBeHidden();
});
