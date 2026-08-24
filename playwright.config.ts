import { defineConfig } from '@playwright/test';
// Every path below comes from agents/runtime/paths.js — the same module the agents use, so
// the test runner and the agents cannot disagree about where anything is. Hardcoding them
// here is how "the verifier reads a test-results.json nobody writes" happens.
import * as P from './agents/runtime/paths.js';

// testDir is .qa-run/tests (GENERATED specs). tests/steps and tests/pages stay outside it
// on purpose: they are committed, human-reviewed code, not run output, and Playwright must
// not try to execute a step library as if it were a spec.
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
  testDir: P.SPEC_DIR,
  fullyParallel: true,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: P.TEST_RESULTS }],
  ],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Playwright's OWN artifacts (trace.zip, error-context.md, test-failed-*.png), NOT the
  // before/after screenshots the specs take. This used to be 'evidence', so Playwright
  // created a per-failure subfolder inside the very directory holding the evidence images
  // — two writers, one folder, and no way to tell whose file was whose.
  outputDir: P.ARTIFACTS_DIR,
});
