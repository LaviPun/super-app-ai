import { expect, test } from '@playwright/test';

// Realigned to the real UI 2026-08-24 (task-8b): the previous button-name
// assertions ("Validate assistant targets" / "Save local AI settings") never
// matched the actual copy — see task-8b-report.md.
test('shows model setup controls and validation action', async ({ page }) => {
  await page.goto('/internal/model-setup');
  await expect(page.getByRole('heading', { name: 'Local AI Setting' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate targets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save config' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch active here (shadow)' })).toBeVisible();
});

// Realigned to the real UI 2026-08-24 (task-8b): there is no
// `select[name="activeTarget"]` dropdown — the real target switcher is the
// Local/Cloud tabs + a per-tab "Switch active here (shadow)" button, and the
// active target is shown via an Active/Standby badge, not "Resolved now:" text.
// See task-8b-report.md.
test('keeps localMachine as the active target across reload', async ({ page }) => {
  await page.goto('/internal/model-setup');

  const localTab = page.getByRole('button', { name: 'Local (localMachine)' });
  await localTab.click();
  const activeBadge = page.getByText('Active', { exact: true });
  if (!(await activeBadge.isVisible())) {
    // Not already the active target — make it so via the real switch control.
    await page.getByRole('button', { name: 'Switch active here (shadow)' }).click();
    await expect(activeBadge).toBeVisible();
  }

  await page.reload();
  await localTab.click();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
});
