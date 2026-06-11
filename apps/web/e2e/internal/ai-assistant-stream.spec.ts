import { expect, test } from '@playwright/test';

test('stream smoke is opt-in and skipped by default', async ({ page }) => {
  test.skip(
    !process.env.PLAYWRIGHT_ENABLE_STREAM_SMOKE,
    'Set PLAYWRIGHT_ENABLE_STREAM_SMOKE=1 with a live/stub router to run stream checks.',
  );

  await page.goto('/internal/ai-assistant');
  const assistantRoles = page.locator('.AiAssistant-message.ai .AiAssistant-role');
  const assistantCountBefore = await assistantRoles.count();
  await page.getByPlaceholder('Ask anything...').fill('Health check');
  await page.getByRole('button', { name: '↵' }).click();
  await expect
    .poll(async () => assistantRoles.count(), {
      message: 'expected at least one new assistant message after sending prompt',
    })
    .toBeGreaterThan(assistantCountBefore);
});
