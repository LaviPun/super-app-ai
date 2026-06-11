import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const ADMIN_PASSWORD = process.env.INTERNAL_ADMIN_PASSWORD ?? 'ci-placeholder';

test('authenticate internal admin', async ({ page }) => {
  mkdirSync('e2e/.auth', { recursive: true });
  await page.goto('/internal/login?to=/internal/ai-assistant');
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Authenticate' }).click();
  await expect(page).toHaveURL(/\/internal\/ai-assistant/);
  await page.context().storageState({ path: 'e2e/.auth/internal-admin.json' });
});
