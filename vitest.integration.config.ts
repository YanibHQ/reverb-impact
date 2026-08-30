import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
