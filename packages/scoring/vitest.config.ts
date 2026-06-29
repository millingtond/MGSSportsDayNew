import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve the workspace package to its TS source so Vitest needs no build step.
export default defineConfig({
  resolve: {
    alias: {
      '@mgs/config-types': fileURLToPath(new URL('../config-types/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
