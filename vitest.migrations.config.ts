import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.migration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
