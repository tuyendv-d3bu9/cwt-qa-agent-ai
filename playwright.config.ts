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

// ── TƯ CÁCH NGƯỜI DÙNG → PROJECT (R6) ────────────────────────────────
//
// `identities.json` do pipeline ghi ra từ `**Tư cách:**` trong tài liệu luồng. KHÔNG có file
// đó (dự án không có đăng nhập, hoặc chưa chạy bước sinh spec) → một project duy nhất, hành vi
// y hệt trước khi có R6. Đây là lý do mọi thứ dưới đây đều phải chịu được `null`.
//
// VÌ SAO PHẢI TÁCH PROJECT chứ không dùng chung một context:
//   - Test tư cách `guest` cần trình duyệt SẠCH. Ở ShopGo v2.0 phiên đăng nhập nằm trong
//     `localStorage`, nên "mở lại trang" KHÔNG đưa về trạng thái khách. Chạy chung với test đã
//     đăng nhập thì luồng "khách bị chặn ở giỏ hàng" thấy giỏ mở ra bình thường và **báo xanh**.
//   - Test tư cách `customer` cần state nạp sẵn, để 20 test case không phải đi qua modal đăng
//     nhập 20 lần — và để bước đăng nhập không phải là một step nghiệp vụ ai cũng chép lại.
//
// Playwright tạo context MỚI cho mỗi test, nên `guest` không cần xoá gì: mặc định đã sạch.
// Điều phải làm rõ là `customer` **không** được rơi vào project `guest` và ngược lại — lọc bằng
// `grep` trên tag `@identity:<tên>` mà codegen gắn vào tiêu đề test.
type IdentityPlan = { needed: string[]; created: string[] };

async function readIdentityPlan(): Promise<IdentityPlan | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(P.IDENTITIES_JSON, 'utf8'));
    const needed = Array.isArray(raw?.needed) ? raw.needed.filter((s: unknown) => typeof s === 'string') : [];
    const created = Array.isArray(raw?.created) ? raw.created.filter((s: unknown) => typeof s === 'string') : [];
    return needed.length ? { needed, created } : null;
  } catch {
    return null;   // chưa sinh, hoặc file hỏng → quay về hành vi một-project
  }
}

const plan = await readIdentityPlan();

// Spec dựng đăng nhập nằm trong `<testDir>/auth/`. Nó KHÔNG phải test nghiệp vụ, nên mọi
// project thường phải bỏ qua thư mục đó — nếu không nó chạy thêm một lần như một test bình
// thường và tính vào kết quả.
const AUTH_SUBDIR = /[\\/]auth[\\/]/;

const projects = plan
  ? [
      // 1) project dựng state: mỗi tư cách phải-tạo có một spec setup riêng
      ...plan.created.map((id) => ({
        name: `auth:${id}`,
        testMatch: new RegExp(`[\\\\/]auth[\\\\/]${id}\\.setup\\.ts$`),
      })),
      // 2) project chạy test, lọc theo tag tiêu đề
      ...plan.needed.map((id) => ({
        name: id,
        grep: new RegExp(`@identity:${id}\\b`),
        testIgnore: AUTH_SUBDIR,
        use: plan.created.includes(id) ? { storageState: P.authStatePath(id) } : {},
        dependencies: plan.created.includes(id) ? [`auth:${id}`] : [],
      })),
    ]
  : undefined;

export default defineConfig({
  testDir: P.SPEC_DIR,
  ...(projects ? { projects } : {}),
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
