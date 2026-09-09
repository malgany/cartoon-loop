import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/static',
  outputDir: './test-results/static',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4174/cartoon-loop/', viewport: { width: 1440, height: 960 } },
  webServer: {
    command: 'node scripts/serve-built.mjs',
    url: 'http://127.0.0.1:4174/cartoon-loop/',
    reuseExistingServer: !process.env.CI,
  },
});
