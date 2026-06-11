import { test, expect } from '@playwright/test';

test.describe('Phase 19 async job UX', () => {
  test('internal assistant exposes simulated SSE progress panel', async ({ page }) => {
    await page.goto('/internal/ai-assistant');
    const panel = page.getByTestId('async-job-progress-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByText('Fastify SSE boundary')).toBeVisible();
    await expect(panel.getByTestId('async-job-phase')).toHaveText(/ready|running|queued|tool/i);
    await expect(panel.getByTestId('async-job-timeline').locator('li')).not.toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test('merchant jobs page renders async UX showcase', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByTestId('async-job-ux-showcase')).toBeVisible();
    await expect(page.getByTestId('async-job-demo-publish')).toBeVisible();
    await expect(page.getByTestId('async-job-demo-connector_test')).toBeVisible();
  });

  test('progress panel reaches terminal phase after simulated stream', async ({ page }) => {
    await page.goto('/jobs');
    const publishDemo = page.getByTestId('async-job-demo-publish');
    const retry = publishDemo.getByTestId('async-job-retry');
    const cancel = publishDemo.getByTestId('async-job-cancel');
    await expect(retry).toBeDisabled();
    await expect(cancel).toBeEnabled();
    await expect(publishDemo.getByTestId('async-job-phase')).toHaveText(/published|ready|succeeded/i, {
      timeout: 10_000,
    });
    await expect(retry).toBeDisabled();
    await expect(publishDemo.getByTestId('async-job-timeline').locator('li')).toHaveCount(4);
  });
});
