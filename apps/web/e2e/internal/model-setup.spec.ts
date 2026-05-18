import { expect, test } from '@playwright/test';

test('shows model setup controls and validation action', async ({ page }) => {
  await page.goto('/internal/model-setup');
  await expect(page.getByRole('heading', { name: 'Local AI Setting' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate assistant targets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save local AI settings' })).toBeVisible();
});

test('keeps localMachine as default target after reload', async ({ page }) => {
  await page.goto('/internal/model-setup');

  const activeTarget = page.locator('select[name="activeTarget"]');
  const initialTarget = await activeTarget.inputValue();
  if (initialTarget !== 'localMachine') {
    await page.getByLabel('Target to switch to').selectOption('localMachine');
    await page.getByRole('button', { name: 'Switch target (shadow)' }).click();
    await expect(activeTarget).toHaveValue('localMachine');
  }

  await expect(page.getByText('Resolved now:').locator('..')).toContainText('localMachine');

  await page.reload();

  await expect(activeTarget).toHaveValue('localMachine');
  await expect(page.getByText('Resolved now:').locator('..')).toContainText('localMachine');
});
