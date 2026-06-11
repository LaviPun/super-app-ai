import { expect, test } from '@playwright/test';

test('internal assistant shell exposes V2 async boundaries', async ({ page }) => {
  await page.goto('/internal/ai-assistant');

  await expect(page.getByRole('heading', { name: 'AI Assistant' })).toBeVisible();
  await expect(page.getByText('Queued tool run')).toBeVisible();
  await expect(page.getByText('Fastify SSE boundary')).toBeVisible();
  await expect(page.getByText(/INTERNAL_TOOL_RUN/).first()).toBeVisible();
  await expect(page.getByText('/v1/internal/assistant/jobs/:jobId/events')).toBeVisible();
});
