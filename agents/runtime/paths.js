// agents/runtime/paths.js
// THE one place that decides where anything lives. Import from here; never write a
// literal path like "memory/working/deliverable-analyst.md" anywhere else.
//
// WHY THIS FILE EXISTS. Before it, those literals were spread across 13 files —
// 6 agent index.js, 4 agent tools, 2 workflow flows, playwright.config.ts — plus a dozen
// role.md/knowledge .md documents. "memory/working/deliverable-test-designer.md" alone
// appeared 9 times. Moving a directory meant finding every copy, and missing one produced
// a node that silently read a file nobody writes any more.
//
// ── THE SPLIT: tri thức vs sản phẩm ─────────────────────────────────────
//
//   memory/          TRI THỨC — hand-editable, durable, committed (except *.db/manifest)
//     semantic/      methodology, valid for ANY project
//     project/       this project's knowledge: *.md by hand, knowledge.db queried
//
//   tests/steps/     CODE DÙNG LẠI — written and reviewed by a human, committed
//   tests/pages/     generated deterministically from the element registry, reviewed
//
//   .qa-run/         SẢN PHẨM của một lần chạy — regenerable, gitignored, delete freely
//
// The line between the last two is the one that matters: a step library is an asset you
// keep and review; a per-test-case .spec.ts is output. Gitignoring both (the earlier plan)
// would have thrown away the reusable half.
//
// PORTABILITY: every value is a repo-relative POSIX-style path, because that is what
// tools.js's safe() and the whole tool registry expect. Do not put absolute paths or
// Windows separators here.

// ── Roots ────────────────────────────────────────────────────────────
export const RUN_ROOT = ".qa-run";
export const MEMORY_ROOT = "memory";

/** Source documents supplied by the project. INPUT, not output — stays at the repo root. */
export const PROJECT_DOCS = "project-docs";

/** The flow description that tells the agents how to drive the app (see P0). */
export const UI_FLOW_DOC = `${PROJECT_DOCS}/03_DEV/UI-flow.md`;

// ── Tier 1 + 2 + 3: knowledge ────────────────────────────────────────
export const SEMANTIC_DIR = `${MEMORY_ROOT}/semantic`;
export const PROJECT_DIR = `${MEMORY_ROOT}/project`;

export const KNOWLEDGE_DB = `${PROJECT_DIR}/knowledge.db`;
export const MANIFEST = `${PROJECT_DIR}/manifest.json`;
export const DOMAIN_FACTS = `${PROJECT_DIR}/domain-facts.md`;
export const KNOWN_ISSUES = `${PROJECT_DIR}/known-issues.md`;
export const DECISIONS_LOG = `${PROJECT_DIR}/decisions-log.md`;
export const UI_FLOWS = `${PROJECT_DIR}/ui-flows.md`;

// ── Committed, human-reviewed test code ──────────────────────────────
export const STEPS_DIR = "tests/steps";
export const PAGES_DIR = "tests/pages";

// ── Tier 4 + 5: one run's output ─────────────────────────────────────
export const DELIVERABLES_DIR = `${RUN_ROOT}/deliverables`;
export const FEATURES_DIR = `${RUN_ROOT}/features`;
export const SPEC_DIR = `${RUN_ROOT}/tests`;
export const EVIDENCE_DIR = `${RUN_ROOT}/evidence`;
/** Playwright's OWN outputDir (trace.zip, error-context.md, test-failed-*.png).
 *  Deliberately NOT EVIDENCE_DIR: those two were the same folder, so Playwright's
 *  per-failure subfolders sat mixed in with the before/after screenshots the specs take,
 *  and "what is in evidence/?" had two different answers. */
export const ARTIFACTS_DIR = `${RUN_ROOT}/artifacts`;
export const REPORTS_DIR = `${RUN_ROOT}/reports`;
export const MCP_OUT_DIR = `${RUN_ROOT}/mcp`;
export const CACHE_DIR = `${RUN_ROOT}/cache`;
export const RUNS_DB = `${RUN_ROOT}/runs.db`;

/**
 * ── TRẠNG THÁI ĐĂNG NHẬP (R6) ────────────────────────────────────────
 *
 * `storageState` của Playwright cho từng tư cách khai trong tài liệu luồng.
 *
 * VÌ SAO Ở `.qa-run/` CHỨ KHÔNG PHẢI `tests/`. Đây là **sản phẩm của một lần chạy**, không phải
 * tài sản giữ lại: nó chứa cookie/localStorage của một phiên đăng nhập thật, hết hạn theo thời
 * gian, và **không được commit**. Để nhầm sang `tests/` là đưa thông tin phiên vào git.
 *
 * `identities.json` là hợp đồng giữa pipeline và `playwright.config.ts`: pipeline ghi ra danh
 * sách tư cách đọc được từ tài liệu luồng, config đọc lên để dựng project. Không có file này
 * thì config chạy đúng như trước khi có R6 — dự án không có đăng nhập không phải khai gì.
 */
export const AUTH_DIR = `${RUN_ROOT}/auth`;
export const IDENTITIES_JSON = `${AUTH_DIR}/identities.json`;
export const authStatePath = (identity) => `${AUTH_DIR}/${identity}.json`;
/** Spec dựng trạng thái đăng nhập — chạy TRƯỚC mọi spec cần tư cách đó (project `dependencies`). */
export const authSetupSpec = (identity) => `${SPEC_DIR}/auth/${identity}.setup.ts`;

// ── Individual run files ─────────────────────────────────────────────
export const TASK_ASSIGNMENT = `${DELIVERABLES_DIR}/task-assignment.md`;
export const GAP_REPORT = `${DELIVERABLES_DIR}/gap-report.md`;
export const PROGRESS_REPORT = `${DELIVERABLES_DIR}/progress-report.md`;
export const IMPACT_REPORT = `${DELIVERABLES_DIR}/impact-report.md`;
export const TEST_RESULTS = `${DELIVERABLES_DIR}/test-results.json`;
/** Bảng giám sát mọi run — qa-leader/tools/run-supervisor.js. */
export const SUPERVISION_REPORT = `${DELIVERABLES_DIR}/supervision.md`;

export const DELIVERABLE_ANALYST = `${DELIVERABLES_DIR}/deliverable-analyst.md`;
export const DELIVERABLE_TEST_DESIGNER = `${DELIVERABLES_DIR}/deliverable-test-designer.md`;
export const DELIVERABLE_AUTOMATION = `${DELIVERABLES_DIR}/deliverable-automation.md`;
export const DELIVERABLE_VERIFIER = `${DELIVERABLES_DIR}/deliverable-verifier.md`;
export const DELIVERABLE_REPORTER = `${DELIVERABLES_DIR}/deliverable-reporter.md`;

/**
 * ── TEST CASE: ĐẶC TẢ vs KẾT QUẢ (R1) ────────────────────────────────
 *
 * Hai file, tách theo đúng ranh giới "cái được thiết kế" và "cái đo được":
 *
 *   TESTCASES         chỉ bảng 8 trường, không lập luận, không kiểm đếm. Đổi khi THIẾT KẾ đổi.
 *   TESTCASES_RESULT  thêm cột `Kết quả` (OK/NG/…). Đổi sau MỖI LẦN CHẠY.
 *
 * VÌ SAO PHẢI TÁCH. Trước R1 cả hai nằm chung trong `deliverable-test-designer.md` — một file
 * vừa là đặc tả vừa là báo cáo có lập luận (coverage strategy, boundary sets, kiểm đếm). Ai
 * muốn "cho tôi xem danh sách test case" phải tự lọc bằng mắt, và mọi node hạ nguồn phải parse
 * lại cả tài liệu để lấy ra một cái bảng.
 *
 * `deliverable-test-designer.md` GIỮ NGUYÊN vai trò báo cáo — không bỏ đi, không thay thế.
 */
export const TESTCASES = `${DELIVERABLES_DIR}/testcases.md`;
export const TESTCASES_RESULT = `${DELIVERABLES_DIR}/testcases-result.md`;
/** Bản gửi ra ngoài nhóm — qa-reporter xuất bằng thư viện `xlsx` đã có sẵn. */
export const TESTCASES_XLSX = `${REPORTS_DIR}/testcases-result.xlsx`;

export const UI_CONVENTIONS = `${DELIVERABLES_DIR}/ui-conventions.md`;
export const UI_ELEMENTS = `${DELIVERABLES_DIR}/ui-elements.json`;
export const SNAPSHOT_LATEST = `${DELIVERABLES_DIR}/snapshot-latest.md`;
export const EXPLORATORY_FINDINGS = `${DELIVERABLES_DIR}/exploratory-findings.md`;

export const TEST_CASE_DATA = `${SPEC_DIR}/data/test-cases.json`;

// ── Reports (qa-reporter) ────────────────────────────────────────────
export const SPRINT_HISTORY = `${REPORTS_DIR}/sprint-history.json`;
export const SPRINT_REPORT = `${REPORTS_DIR}/sprint-report.md`;
export const RELEASE_NOTE = `${REPORTS_DIR}/release-note.md`;
export const RCA_REPORT = `${REPORTS_DIR}/rca-report.md`;
export const QA_NARRATIVE = `${REPORTS_DIR}/qa-narrative.md`;
export const bugReport = (severity) => `${REPORTS_DIR}/bug-reports/${severity}.md`;
export const dailySummary = (audience) => `${REPORTS_DIR}/daily-summary-${audience}.md`;
export const communication = (template) => `${REPORTS_DIR}/communications/${template}.md`;

// ── Per-test-case files ──────────────────────────────────────────────
export const specFor = (tcId) => `${SPEC_DIR}/${tcId}.spec.ts`;

/**
 * ẢNH THEO TỪNG BƯỚC (R2.2) — một thư mục cho mỗi test case.
 *
 * VÌ SAO ĐỔI. Trước đây mỗi test case có đúng HAI ảnh: `-before.jpg` chụp ở trang chủ trước
 * khi làm gì, và `-after.jpg` chụp trong `afterEach` sau khi test đã kết thúc. Với luồng
 * "thêm giỏ → mở thanh toán → áp mã → thanh toán → xem đơn hàng" thì:
 *   before = trang chủ, chưa có gì xảy ra    → không chứng minh được gì
 *   after  = trang đơn hàng, cách chỗ áp mã hai bước
 * Trạng thái "áp mã thành công / thất bại" — thứ DUY NHẤT cần nhìn — không có ảnh nào.
 *
 * ── `label` LÀ KHOÁ NỐI, KHÔNG PHẢI TÊN CHO ĐẸP ──
 * Cùng một chuỗi `NN-label` được dùng ở HAI nơi:
 *   1. tên file ảnh                      →  .qa-run/evidence/<TC>/03-nhap-ma-giam-gia.jpg
 *   2. tiêu đề `test.step()` trong spec   →  báo cáo JSON của Playwright ghi lại đúng chuỗi đó
 * Nhờ vậy `qa-verifier` ghép được "bước nào hỏng" (từ test-results.json) với "ảnh nào của
 * bước đó" mà không cần đoán theo thứ tự. Đổi cách đặt tên ở một nơi là đứt mối nối — sửa
 * `stepShot` thì phải sửa cả chỗ sinh tiêu đề `test.step` trong gherkin-codegen.js.
 */
export const evidenceDir = (tcId) => `${EVIDENCE_DIR}/${tcId}`;
export const stepShotLabel = (n, label) => `${String(n).padStart(2, "0")}-${label}`;
export const stepShot = (tcId, n, label) => `${evidenceDir(tcId)}/${stepShotLabel(n, label)}.jpg`;

/** @deprecated Ảnh của bố cục CŨ (hai ảnh mỗi test case). Chỉ còn để ĐỌC ảnh từ lần chạy trước;
 *  không sinh mới nữa — xem `stepShot` ở trên. */
export const screenshotBefore = (tcId) => `${EVIDENCE_DIR}/${tcId}-before.jpg`;
export const screenshotAfter = (tcId) => `${EVIDENCE_DIR}/${tcId}-after.jpg`;
