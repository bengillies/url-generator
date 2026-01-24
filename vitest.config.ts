import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: './tests/fixtures/setup.ts',
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'browser',
          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: {
                headless: true,
              },
            }),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          browser: {
            enabled: false,
          },
        },
      },
    ],
  },
});
