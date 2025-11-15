import { defineConfig } from '@playwright/test';

const shouldManageStack = process.env.PW_SKIP_STACK === '1' ? false : true;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  // Entire system is brought up by global setup (LocalStack, 5 APIs, SQS Lambda, mocks, FE)
  webServer: undefined,
  ...(shouldManageStack
    ? { globalSetup: './tests/global-setup.ts', globalTeardown: './tests/global-teardown.ts' }
    : {}),
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    // add firefox / webkit if needed
  ],
});
