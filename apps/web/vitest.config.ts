import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app'),
    },
  },
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts', 'app/**/__tests__/**/*.ts'],
    env: {
      INTERNAL_ADMIN_SESSION_SECRET: 'vitest-internal-admin-session-secret-32',
    },
    // Several suites cold-import a heavy module graph (Prisma + app services) in
    // their first test. Under full-suite parallel CPU contention that one-time
    // import can exceed vitest's default 5s testTimeout, so the first test in
    // those files times out intermittently (passing in isolation / on warm
    // reruns). This is a test-infra safety-net budget, not a product latency
    // bound — every test fully mocks its I/O and completes in milliseconds once
    // warm — so a generous timeout removes the flake without masking real
    // slowness. Hooks (e.g. beforeAll module imports) get matching headroom.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
