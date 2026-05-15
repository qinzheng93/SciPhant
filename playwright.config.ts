import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 30000,
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
});
