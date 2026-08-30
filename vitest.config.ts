import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/**/test/**/*.integration.test.ts',
      'packages/**/test/**/*.conformance.test.ts',
      'packages/**/test/**/*.adversarial.test.ts',
      'packages/**/test/**/*.migration.test.ts',
    ],
    coverage: { provider: 'v8', reporter: ['text', 'json-summary'] },
  },
});
