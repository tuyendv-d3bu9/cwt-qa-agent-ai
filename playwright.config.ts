import { defineConfig } from '@playwright/test';

// Output path is fixed at memory/working/test-results.json — agents/qa-verifier/index.js
// reads exactly this path (role.md contract), not the Playwright default location.
//
// baseURL is PROJECT DATA, not code (memory/README.md: anything project-specific lives
// in tier-2 config so the same codebase can serve another project). Resolution order:
//   1. BASE_URL env var — lets CI override without touching the DB
//   2. tier-2 config key "base_url", written by the document-analysis step
//   3. undefined — specs using absolute URLs still run; relative ones fail loudly,
//      which is better than silently pointing at somebody else's site
// The import is wrapped because this config must still load when the knowledge DB
// does not exist yet (fresh clone, before any analysis run).
async function resolveBaseUrl(): Promise<string | undefined> {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  try {
    const { getConfig } = await import('./agents/runtime/knowledge.js');
    return getConfig('base_url', undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

const baseURL = await resolveBaseUrl();

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'memory/working/test-results.json' }],
  ],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: 'evidence',
});
