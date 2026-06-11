import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const KEY_PAGES = [
  '/internal/login',
  '/internal',
  '/internal/ai-assistant',
  '/internal/templates',
  '/internal/settings',
];

test.describe('internal admin accessibility', () => {
  for (const path of KEY_PAGES) {
    test(`no serious axe violations on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['color-contrast'])
        .analyze();

      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
