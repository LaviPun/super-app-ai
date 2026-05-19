import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: [resolve(rootDir, '__tests__/**/*.test.ts')],
    environment: 'node',
  },
});
