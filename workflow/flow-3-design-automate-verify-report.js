// workflow/flow-3-design-automate-verify-report.js
// Flow 3: QA Test Designer + QA Automation + QA Verifier + QA Reporter
// Workflow is the orchestrator — it calls each agent node in sequence.
// Agents do NOT call each other.
//
// Requires flow-2-leader-analyst.js to have already reached PASS (qa-analyst
// step "done" in memory/working/workflow.json) — this flow starts from
// memory/working/deliverable-analyst.md.
//
// This flow has TWO points where it must stop and hand control back to a human,
// by design (not a gap — see agents/qa-automation/role.md and qa-verifier/role.md):
//   1. Before QA Automation runs — it calls REAL MCP Playwright against the live
//      site (https://cwshopgo.github.io). Requires --confirm-mcp every time.
//   2. After QA Automation, before QA Verifier — a human/CI must run
//      `npx playwright test --reporter=json` themselves; no agent runs tests.
//
// Run:
//   node workflow/flow-3-design-automate-verify-report.js --confirm-mcp [reportTypes]
//   reportTypes: comma-separated, e.g. "daily,narrative" (default if verdict PASS).
//   Bug reports are NOT auto-generated here — verdict ASK means a human must
//   review memory/working/deliverable-verifier.md first; run qa-reporter with
//   reportTypes including "bug" yourself once you've confirmed real bugs.

import { access, unlink } from "node:fs/promises";
import { run as runTestDesigner } from "../agents/qa-test-designer/index.js";
import { run as runAutomation } from "../agents/qa-automation/index.js";
import { run as runVerifier } from "../agents/qa-verifier/index.js";
import { run as runReporter } from "../agents/qa-reporter/index.js";
import { loadState, markStep } from "../agents/runtime/memory.js";

const TASK_FILE = "memory/working/task-assignment.md";
const ANALYST_DELIVERABLE = "memory/working/deliverable-analyst.md";
const TEST_DESIGNER_DELIVERABLE = "memory/working/deliverable-test-designer.md";
const TEST_RESULTS_FILE = "memory/working/test-results.json";
const UI_CONVENTIONS_FILE = "memory/working/ui-conventions.md";

const args = process.argv.slice(2);
const confirmMcp = args.includes("--confirm-mcp");
const reportTypesArg = args.find(a => !a.startsWith("--"));
const reportTypes = reportTypesArg ? reportTypesArg.split(",").map(s => s.trim()) : ["daily", "narrative"];

async function fileExists(path) {
    try { await access(path); return true; } catch { return false; }
}

const state = await loadState();
const stepFor = (agent) => state.steps.find(s => s.agent === agent);

// ── Precondition: flow-2 must have reached PASS ─────────────────
const analystStep = stepFor("qa-analyst");
if (analystStep?.status !== "done") {
    console.log(`\n>> qa-analyst chưa PASS (status hiện tại: ${analystStep?.status ?? "chưa chạy"}). Chạy flow-2-leader-analyst.js cho tới PASS trước.`);
    process.exit(1);
}

// ── Step: QA Test Designer (pure LLM, no external action) ──────
let designerStep = stepFor("qa-test-designer");
if (designerStep?.status !== "done") {
    console.log("[1/4] Running QA Test Designer…");
    const out = await runTestDesigner({ taskFile: TASK_FILE, deliverableFile: ANALYST_DELIVERABLE });
    if (out.status !== "success") {
        console.error("QA Test Designer error:", out);
        process.exit(1);
    }
    await markStep("qa-test-designer", { status: "done", output: TEST_DESIGNER_DELIVERABLE });
    console.log(`  Done. Check ${TEST_DESIGNER_DELIVERABLE}`);
} else {
    console.log("[1/4] QA Test Designer already done — skipping.");
}

// ── Step: QA Automation (REAL MCP Playwright call — needs explicit confirmation) ─
let automationStep = stepFor("qa-automation");
const needsAutomationRun = automationStep?.status !== "done" || automationStep?.status === "needs_rework";

if (needsAutomationRun) {
    if (!confirmMcp) {
        console.log(
            "\n>> QA Automation cần chạy — bước này gọi MCP Playwright THẬT, mở trình duyệt " +
            "thật tới https://cwshopgo.github.io để explore DOM (agents/qa-automation/role.md).\n" +
            "   Đây là hành động ra bên ngoài thật, cần xác nhận tường minh mỗi lần.\n" +
            "   Chạy lại với flag --confirm-mcp nếu bạn đồng ý cho phép bước này chạy:\n" +
            "   node workflow/flow-3-design-automate-verify-report.js --confirm-mcp\n"
        );
        process.exit(0);
    }

    // Re-running after a verifier FIX means the old test-results.json (if any)
    // was measured against the OLD spec — stale, must not be reused for re-verify.
    if (await fileExists(TEST_RESULTS_FILE)) {
        await unlink(TEST_RESULTS_FILE);
        console.log(`  Đã xoá ${TEST_RESULTS_FILE} cũ (spec sẽ được sinh lại — kết quả cũ không còn hợp lệ).`);
    }

    console.log("[2/4] Running QA Automation (real MCP Playwright)…");
    const out = await runAutomation({ testCaseFile: TEST_DESIGNER_DELIVERABLE });
    if (out.status !== "success") {
        console.error("QA Automation error:", out);
        process.exit(1);
    }
    await markStep("qa-automation", { status: "done", output: out.data.deliverableFile });
    console.log(`  Done. Specs in ${out.data.specDir}, oracle in ${out.data.uiConventionsFile}`);
} else {
    console.log("[2/4] QA Automation already done — skipping.");
}

// ── Pause point: test-results.json must come from a human/CI running Playwright ─
if (!(await fileExists(TEST_RESULTS_FILE))) {
    console.log(
        `\n>> Chưa có ${TEST_RESULTS_FILE}. Node này KHÔNG tự chạy .spec.ts ` +
        "(xem agents/qa-verifier/role.md — test-results.json phải do người dùng/CI tạo ra).\n" +
        "   Chạy:\n" +
        "   npx playwright test --reporter=json\n" +
        "   Sau đó chạy lại đúng lệnh này để tiếp tục.\n"
    );
    process.exit(0);
}

// ── Step: QA Verifier ────────────────────────────────────────────
console.log("[3/4] Running QA Verifier…");
const verifierOut = await runVerifier({
    testResultsFile: TEST_RESULTS_FILE,
    uiConventionsFile: UI_CONVENTIONS_FILE,
    testCaseFile: TEST_DESIGNER_DELIVERABLE,
});
if (verifierOut.status !== "success") {
    console.error("QA Verifier error:", verifierOut);
    process.exit(1);
}
console.log(`  Verdict: ${verifierOut.data.verdict}`);

if (verifierOut.data.verdict === "ASK") {
    // qa-verifier/index.js already calls markStep("qa-verifier", {status: "waiting_ask", ...}).
    console.log(
        `\n>> Verifier cần người xác nhận. Đọc ${verifierOut.data.deliverableFile} — ` +
        "xác định các test BEHAVIOR_MISMATCH/UNCLEAR có phải bug thật không.\n" +
        "   Sau khi xác nhận, tự chạy qa-reporter với reportTypes phù hợp (vd \"bug\") — " +
        "flow này không tự đoán thay bạn.\n"
    );
    process.exit(0);
}

if (verifierOut.data.verdict === "FIX") {
    await markStep("qa-automation", { status: "needs_rework", note: "Verifier: SPEC_ISSUE — spec lỗi thời so với ui-conventions.md" });
    console.log(
        "\n>> Verdict FIX — spec (.spec.ts) đã lỗi thời so với UI thật, không phải lỗi sản phẩm.\n" +
        "   Chạy lại đúng lệnh này (kèm --confirm-mcp) để QA Automation explore lại + sinh spec mới.\n"
    );
    process.exit(0);
}

// verdict === "PASS"
await markStep("qa-verifier", { status: "done", output: verifierOut.data.deliverableFile });

// ── Step: QA Reporter ─────────────────────────────────────────────
console.log(`[4/4] Running QA Reporter (reportTypes=${JSON.stringify(reportTypes)})…`);
const reporterOut = await runReporter({
    reportTypes,
    verifierDeliverableFile: verifierOut.data.deliverableFile,
    testCaseFile: TEST_DESIGNER_DELIVERABLE,
});
if (reporterOut.status !== "success") {
    console.error("QA Reporter error:", reporterOut);
    process.exit(1);
}
await markStep("qa-reporter", { status: "done", output: reporterOut.data.deliverableFile });

console.log(`\n>> Done. Reports written to: ${reporterOut.data.outputFiles.join(", ")}`);
process.exit(0);
