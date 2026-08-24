import { expect, test } from '@playwright/test';

// Realigned to the real UI 2026-08-24 (task-8b): the previous assertions
// (data-testid="memory-list"/"memory-create"/"memory-import" + a confirm/cancel
// "Import session JSON" dialog) never existed in this route — see task-8b-report.md.
test('renders assistant with memory controls and the import-session panel', async ({ page }) => {
  await page.goto('/internal/ai-assistant');
  await expect(page.getByRole('heading', { name: 'AI Assistant' })).toBeVisible();

  // Memory create form is real, always-visible UI in the observability panel.
  await expect(page.getByPlaceholder('Memory title')).toBeVisible();
  await expect(page.getByPlaceholder('What should the assistant always know?')).toBeVisible();
  const saveMemory = page.getByRole('button', { name: 'Save memory' });
  await expect(saveMemory).toBeVisible();
  await expect(saveMemory).toBeDisabled();

  // Import session is a real inline collapsible panel (not a modal): closed by
  // default; expanding reveals the JSON textarea + Import button.
  const importBtn = page.getByRole('button', { name: 'Import', exact: true });
  await expect(importBtn).toBeHidden();
  await page.getByRole('button', { name: 'Expand import session' }).click();
  await expect(importBtn).toBeVisible();
  await expect(importBtn).toBeDisabled();
  await page.getByRole('button', { name: 'Collapse import session' }).click();
  await expect(importBtn).toBeHidden();
});
