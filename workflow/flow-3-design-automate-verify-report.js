// workflow/flow-3-design-automate-verify-report.js
// Flow 3: QA Test Designer + QA Automation + QA Verifier + QA Reporter
// Workflow is the orchestrator — it calls each agent node in sequence.
// Agents do NOT call each other.
//
// Requires flow-2-leader-analyst.js to have already reached PASS (qa-analyst
// step "done" in the current run — memory/working/runs.db) — this flow starts from
// memory/working/deliverable-analyst.md.
//
// This flow has THREE kinds of point where it must stop and hand control back to a
// human, by design (not a gap — see agents/qa-automation/role.md and qa-verifier/role.md):
//   1. Before QA Automation runs — it calls REAL MCP Playwright against the live
//      site configured as tier-2 "base_url". Requires --confirm-mcp every time.
//   2. After QA Automation, before QA Verifier — a human/CI must run
//      `npx playwright test --reporter=json` themselves; no agent runs tests.
//   3. Before EVERY node — the Human-Final gate that all six role.md files declare:
//      the previous node's deliverable must be approved by a person
//      (`node agents/approve.js <agent> "<name>"`). This gate existed in
//      agents/runtime/memory.js but was never called, so it was dead code and the
//      declared contract was not actually enforced. --no-gate skips it for a fast demo.
//
// Run:
//   node workflow/flow-3-design-automate-verify-report.js --confirm-mcp [--vlm-all] [--no-gate] [reportTypes]
//   --vlm-all: soi ảnh mọi test case (mặc định chỉ soi test fail + test pass High/Critical)
//   --no-gate: bỏ cửa duyệt người giữa các node (chỉ dùng khi demo nhanh)
//   reportTypes: comma-separated, e.g. "daily,narrative" (default if verdict PASS).
//   Bug reports are NOT auto-generated here — verdict ASK means a human must
//   review memory/working/deliverable-verifier.md first; run qa-reporter with
//   reportTypes including "bug" yourself once you've confirmed real bugs.

import "dotenv/config";
import { runTool } from "../agents/runtime/tools.js";
import { run as runTestDesigner, CONTRACT as DESIGNER_CONTRACT } from "../agents/qa-test-designer/index.js";
import { run as runAutomation, CONTRACT as AUTOMATION_CONTRACT } from "../agents/qa-automation/index.js";
import { run as runVerifier, CONTRACT as VERIFIER_CONTRACT } from "../agents/qa-verifier/index.js";
import { run as runReporter, CONTRACT as REPORTER_CONTRACT } from "../agents/qa-reporter/index.js";
import { loadState, markStep, requireApproved, currentRun, finishRun } from "../agents/runtime/memory.js";
import { initDatabases } from "../agents/runtime/db.js";
import { getConfig } from "../agents/runtime/knowledge.js";
import { requireInputs, verifyProduced } from "../agents/runtime/handover.js";

const TASK_FILE = "memory/working/task-assignment.md";
const ANALYST_DELIVERABLE = "memory/working/deliverable-analyst.md";
const TEST_DESIGNER_DELIVERABLE = "memory/working/deliverable-test-designer.md";
const TEST_RESULTS_FILE = "memory/working/test-results.json";
const UI_CONVENTIONS_FILE = "memory/working/ui-conventions.md";

const args = process.argv.slice(2);
const confirmMcp = args.includes("--confirm-mcp");
// Soi ảnh MỌI test case thay vì chỉ test fail + test pass High/Critical (quyết định J.6).
// Đắt hơn, nên mặc định tắt; bật khi cần soi kỹ toàn bộ.
const vlmAll = args.includes("--vlm-all");
// Bỏ cửa duyệt người (K.4). Mặc định là BẬT cửa, đúng như 6 role.md tuyên bố.
const noGate = args.includes("--no-gate");
const reportTypesArg = args.find(a => !a.startsWith("--"));
const reportTypes = reportTypesArg ? reportTypesArg.split(",").map(s => s.trim()) : ["daily", "narrative"];

// Goes through the tool registry (agents/runtime/tools.js) rather than fs.access(),
// so "does this exist?" is asked exactly one way everywhere in the repo.
async function fileExists(path) {
    const res = await runTool("file_exists", { path });
    return res.exists === true;
}

// Create/migrate the databases before any agent runs (same reason as in flow-2:
// explicit at run start, not lazily whenever some code path first touches them).
for (const { path, created } of initDatabases()) {
    if (created) console.log(`Created ${path}`);
}

// ── Precondition: a run must be open (flow-2 opens it) ──────────
// This flow continues the run flow-2 started; it never opens one itself, because a run
// whose first half never happened has no analyst deliverable to work from.
const run = await currentRun();
if (!run) {
    console.log(`\n>> Chưa có phiên nào đang mở. Chạy workflow/flow-2-leader-analyst.js "<tên task>" trước.`);
    process.exit(1);
}
console.log(`Run: ${run.run_id}  (feature: "${run.feature ?? "chưa gán"}")  [${run.status}]${noGate ? "  — CỬA DUYỆT NGƯỜI ĐANG TẮT (--no-gate)" : ""}`);

const state = await loadState();
const stepFor = (agent) => state.steps.find(s => s.agent === agent);

/**
 * Human-Final gate (K.4). Blocks until a person has approved the previous node's
 * deliverable. Exits instead of throwing so the message is the last thing on screen —
 * a stack trace here would bury the one line that says what to do next.
 */
async function gate(agent) {
    if (noGate) {
        console.log(`  [gate] Bỏ qua duyệt "${agent}" (--no-gate).`);
        return;
    }
    try {
        await requireApproved(agent);
    } catch (err) {
        console.error(
            `\n>> CỬA DUYỆT NGƯỜI chặn tại "${agent}":\n   ${err.message.split("\n").join("\n   ")}\n\n` +
            `   Đây là hành vi đã khai trong cả 6 role.md (Human-Final), không phải lỗi.\n` +
            `   Demo nhanh không cần duyệt: thêm cờ --no-gate.\n`
        );
        process.exit(1);
    }
}

/** Say up front what will block next, so the stop is expected instead of a surprise. */
function approveHint(agent, file) {
    if (noGate) return;
    console.log(`  Cần duyệt trước khi đi tiếp: đọc ${file} rồi chạy  node agents/approve.js ${agent} "<tên bạn>"`);
}

// ── Precondition: flow-2 must have reached PASS ─────────────────
const analystStep = stepFor("qa-analyst");
if (analystStep?.status !== "done") {
    console.log(`\n>> qa-analyst chưa PASS (status hiện tại: ${analystStep?.status ?? "chưa chạy"}). Chạy flow-2-leader-analyst.js cho tới PASS trước.`);
    process.exit(1);
}
await gate("qa-analyst");

// ── Step: QA Test Designer (pure LLM, no external action) ──────
let designerStep = stepFor("qa-test-designer");
if (designerStep?.status !== "done") {
    console.log("[1/4] Running QA Test Designer…");
    // Handover rule 3 (memory/README.md): declared inputs are checked BEFORE the node
    // runs, so a missing upstream file fails here instead of mid-LLM-call.
    await requireInputs(DESIGNER_CONTRACT);
    const out = await runTestDesigner({ taskFile: TASK_FILE, deliverableFile: ANALYST_DELIVERABLE });
    if (out.status !== "success") {
        console.error("QA Test Designer error:", out);
        process.exit(1);
    }
    const producedDesigner = await verifyProduced(DESIGNER_CONTRACT);
    if (!producedDesigner.ok) {
        console.error(`QA Test Designer báo success nhưng KHÔNG ghi output đã khai: ${producedDesigner.missing.join(", ")}`);
        process.exit(1);
    }
    await markStep("qa-test-designer", { status: "done", output: TEST_DESIGNER_DELIVERABLE });
    console.log(`  Done. Check ${TEST_DESIGNER_DELIVERABLE}`);
    approveHint("qa-test-designer", TEST_DESIGNER_DELIVERABLE);
} else {
    console.log("[1/4] QA Test Designer already done — skipping.");
}

// ── Step: QA Automation (REAL MCP Playwright call — needs explicit confirmation) ─
let automationStep = stepFor("qa-automation");
const needsAutomationRun = automationStep?.status !== "done" || automationStep?.status === "needs_rework";

if (needsAutomationRun) {
    // Gate BEFORE --confirm-mcp: opening a real browser against a live site on the
    // strength of an unreviewed test-case table is the expensive mistake here.
    await gate("qa-test-designer");

    if (!confirmMcp) {
        console.log(
            "\n>> QA Automation cần chạy — bước này gọi MCP Playwright THẬT, mở trình duyệt " +
            `thật tới ${getConfig("base_url", "(chưa cấu hình base_url ở tầng 2)")} để explore DOM (agents/qa-automation/role.md).\n` +
            "   Đây là hành động ra bên ngoài thật, cần xác nhận tường minh mỗi lần.\n" +
            "   Chạy lại với flag --confirm-mcp nếu bạn đồng ý cho phép bước này chạy:\n" +
            "   node workflow/flow-3-design-automate-verify-report.js --confirm-mcp\n"
        );
        process.exit(0);
    }

    // Re-running after a verifier FIX means the old test-results.json (if any)
    // was measured against the OLD spec — stale, must not be reused for re-verify.
    if (await fileExists(TEST_RESULTS_FILE)) {
        await runTool("delete_file", { path: TEST_RESULTS_FILE });
        console.log(`  Đã xoá ${TEST_RESULTS_FILE} cũ (spec sẽ được sinh lại — kết quả cũ không còn hợp lệ).`);
    }

    console.log("[2/4] Running QA Automation (real MCP Playwright)…");
    await requireInputs(AUTOMATION_CONTRACT);
    const out = await runAutomation({ testCaseFile: TEST_DESIGNER_DELIVERABLE });
    if (out.status !== "success") {
        console.error("QA Automation error:", out);
        process.exit(1);
    }
    await markStep("qa-automation", { status: "done", output: out.data.deliverableFile });
    console.log(`  Done. Specs in ${out.data.specDir}, oracle in ${out.data.uiConventionsFile}`);
    approveHint("qa-automation", out.data.deliverableFile);
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
// The spec that produced test-results.json must have been reviewed by a person before
// its results are turned into a verdict — otherwise a bad spec silently becomes "bugs".
await gate("qa-automation");

console.log("[3/4] Running QA Verifier…");
await requireInputs(VERIFIER_CONTRACT);
const verifierOut = await runVerifier({
    testResultsFile: TEST_RESULTS_FILE,
    uiConventionsFile: UI_CONVENTIONS_FILE,
    testCaseFile: TEST_DESIGNER_DELIVERABLE,
    vlmAll,
});
if (verifierOut.status !== "success") {
    console.error("QA Verifier error:", verifierOut);
    process.exit(1);
}
console.log(`  Verdict: ${verifierOut.data.verdict} (soi ảnh ${verifierOut.data.visionAnalysed} test case, bỏ qua ${verifierOut.data.visionSkipped}${vlmAll ? "" : " — dùng --vlm-all để soi hết"})`);
for (const n of verifierOut.data.notes ?? []) console.warn(`  [verifier] ${n}`);

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
approveHint("qa-verifier", verifierOut.data.deliverableFile);

// ── Step: QA Reporter ─────────────────────────────────────────────
// A report is what leaves the team, so the verdict behind it is the last thing a person
// must sign off on. Note this WILL block on the first pass — qa-verifier was marked done
// two lines above and nobody has approved it yet. That is the gate working, not a bug.
await gate("qa-verifier");

console.log(`[4/4] Running QA Reporter (reportTypes=${JSON.stringify(reportTypes)})…`);
await requireInputs(REPORTER_CONTRACT);
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

// The pipeline reached its end: close the run so it becomes history instead of staying
// `active` forever, and so the next flow-2 invocation opens a fresh one.
const closed = await finishRun("done");
console.log(`\n>> Done. Reports written to: ${reporterOut.data.outputFiles.join(", ")}`);
console.log(`>> Run "${closed?.run_id}" đã đóng (status: done). Xem lịch sử: node agents/approve.js`);
process.exit(0);
