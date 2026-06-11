import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/merchant',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_MERCHANT_URL ?? 'http://127.0.0.1:3000',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
