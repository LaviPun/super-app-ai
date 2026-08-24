import { expect, test } from '@playwright/test';

// Realigned to the real UI 2026-08-24 (task-8b): the previous assertions (a
// standalone "Save Claude default" button, a checkbox literally named "Enable
// code execution for Claude", and "Code execution safety boundary" copy) never
// existed anywhere in the codebase — see task-8b-report.md.
test('shows ai providers controls and the Claude code-execution toggle', async ({ page }) => {
  await page.goto('/internal/ai-providers');
  await expect(page.getByRole('heading', { name: 'AI Providers' })).toBeVisible();
  // On an empty provider list the "Add provider" action renders twice (the page
  // header action and the empty-state action) — both open the same modal.
  const addProvider = page.getByRole('button', { name: 'Add provider' }).first();
  await expect(addProvider).toBeVisible();

  await addProvider.click();
  const dialog = page.getByRole('dialog', { name: 'Add AI provider' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Provider type').selectOption('ANTHROPIC');
  await expect(dialog.getByText('Claude options')).toBeVisible();
  const codeExec = dialog.getByRole('checkbox', { name: 'Enable code execution (beta)' });
  await codeExec.check();
  await expect(codeExec).toBeChecked();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
