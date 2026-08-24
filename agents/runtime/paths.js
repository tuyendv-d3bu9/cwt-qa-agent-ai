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
export const screenshotBefore = (tcId) => `${EVIDENCE_DIR}/${tcId}-before.jpg`;
export const screenshotAfter = (tcId) => `${EVIDENCE_DIR}/${tcId}-after.jpg`;
