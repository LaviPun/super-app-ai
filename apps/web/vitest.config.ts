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
  },
});
