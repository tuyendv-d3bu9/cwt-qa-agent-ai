import { defineConfig } from '@playwright/test';

// Output path is fixed at memory/working/test-results.json — agents/qa-verifier/index.js
// reads exactly this path (role.md contract), not the Playwright default location.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'memory/working/test-results.json' }],
  ],
  use: {
    baseURL: 'https://cwshopgo.github.io',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: 'evidence',
});
