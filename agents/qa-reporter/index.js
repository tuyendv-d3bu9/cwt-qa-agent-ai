// agents/qa-reporter/index.js
// Node: QA Reporter — 7 report types (giáo trình QA Agent Reporter), chỉ chạy
// đúng loại được yêu cầu trong reportTypes. Report thật ghi vào .qa-run/reports/;
// .qa-run/deliverables/deliverable-reporter.md chỉ là bản ghi nội bộ pipeline (Self Count Check).
// Mọi đường dẫn lấy từ runtime/paths.js — đừng gõ lại literal ở đây.

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { runAgentLoop } from "../runtime/agent-loop.js";
import { createIssue } from "../runtime/jira-client.js";
import { verifyAllDrafts, verifyBugDraft } from "./tools/traceability-check.js";
import { calculateSprintMetrics, getPreviousSprintMetrics, appendSprintMetrics } from "./tools/sprint-metrics-calculator.js";
import { mapBugDraftToJiraIssue, mapTestCaseToJiraIssue } from "./tools/jira-mapper.js";
import { exportTestCaseXlsx } from "./tools/testcase-xlsx.js";
import * as P from "../runtime/paths.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const SCHEMA = await readFile(new URL("./knowledge/bug-report-schema.md", import.meta.url), "utf8");
const TRACEABILITY = await readFile(new URL("./knowledge/traceability-rule.md", import.meta.url), "utf8");
const AUDIENCE_TONE = await readFile(new URL("./knowledge/audience-tone.md", import.meta.url), "utf8");
const REPORT_TYPES_OVERVIEW = await readFile(new URL("./knowledge/report-types-overview.md", import.meta.url), "utf8");
const SPRINT_CONVENTIONS = await readFile(new URL("./knowledge/sprint-metrics-conventions.md", import.meta.url), "utf8");
const OUTPUT_CONVENTIONS = await readFile(new URL("./knowledge/output-conventions.md", import.meta.url), "utf8");
// Project knowledge (memory/project/) — bug-report-schema.md cross-references this
// for the actual Severity scale instead of redefining it (single-source).
const KNOWN_ISSUES = await readFile(new URL("../../memory/project/known-issues.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

const systemFor = (skillText) =>
    [ROLE, FACT, SCHEMA, KNOWN_ISSUES, TRACEABILITY, AUDIENCE_TONE, REPORT_TYPES_OVERVIEW, SPRINT_CONVENTIONS, OUTPUT_CONVENTIONS, skillText].join("\n\n");

async function askLLM(skillText, userText) {
    const res = await callLLM({ system: systemFor(skillText), contents: [{ role: "user", parts: [{ text: userText }] }] });
    return res.text;
}

/**
 * Same call, but a deterministic gate's failure is fed BACK so the model revises (P11).
 *
 * `verifyAllDrafts()` has always run — after every draft was already written, with its result
 * going into the deliverable's "Self Count Check" as a note. So a bug report missing its
 * "Steps to Reproduce" shipped, and the model that omitted it never found out. A bug report
 * with an empty required field is the one artefact here that LEAVES THE TEAM, which makes it
 * the worst place to only warn a human who may not read that section.
 */
async function askLLMChecked(skillText, userText, { selfCheck, label, maxRevisions = 2 }) {
    const out = await runAgentLoop({
        system: systemFor(skillText),
        task: userText,
        selfCheck,
        maxRevisions,
        label,
    });
    if (!out.ok) {
        console.warn(`  [qa-reporter/${label}] CHƯA ĐẠT (${out.exhausted}) — ${out.issues.join(" ")}`);
    }
    return out.text;
}

// ── Parsers (same conventions as qa-verifier/qa-automation) ──
/**
 * Verifier's per-test-case table. Its shape grew twice: once when the visual channel was
 * added (`Kênh dùng`), and again at R1.1/R2.4c (`Kết quả`, `Bước hỏng`).
 *
 * Câu chú thích cũ ở đây khai rằng số cột "is checked, so a future shape change fails loudly".
 * Nó KHÔNG được kiểm — `cellCount` chỉ được gán và không nơi nào đọc. Một bảo vệ được khai mà
 * không tồn tại còn tệ hơn không khai: người sửa sau tin vào nó. Giờ đã kiểm thật, bên dưới.
 */
/** Số cột của bảng qa-verifier. Đổi bảng ở qa-verifier thì PHẢI đổi con số này cùng lượt —
 *  `parseVerifierTable` đọc theo vị trí, nên lệch cột là gán nhầm mọi thứ mà không lỗi.
 *  TC_ID · expect() · Nhãn · Kênh dùng · Lý do · Ảnh evidence · Kết quả · Bước hỏng */
const EXPECTED_VERIFIER_COLUMNS = 8;

function parseVerifierTable(verifierMarkdown) {
    const rows = String(verifierMarkdown ?? "").split("\n")
        .filter(l => l.trim().startsWith("|") && !l.includes("---") && !/^\|\s*TC_ID/i.test(l.trim()));
    const parsed = [];
    const shapeIssues = [];
    for (const l of rows) {
        const cells = l.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        const [TC_ID, Status, Label, Channel, Reason, Evidence, KetQua, FailedStep] = cells;
        if (!TC_ID || TC_ID === "—") continue;

        // ĐẾM CỘT PHẢI ĐƯỢC KIỂM THẬT.
        //
        // Chú thích cũ ở đây tự khai "the count is checked, so a future shape change fails
        // loudly" — nhưng `cellCount` chỉ được GÁN, không nơi nào đọc. Bảo vệ đó không tồn tại,
        // và người sửa sau đọc chú thích sẽ tưởng là có. Hậu quả nếu verifier chèn thêm một cột
        // vào GIỮA: mọi cột sau lệch một ô, `Evidence` nhận câu văn lý do, `file_exists` trả
        // false, và MỌI bug report ra đời không có ảnh — im lặng.
        if (cells.length !== EXPECTED_VERIFIER_COLUMNS) {
            shapeIssues.push(`${TC_ID}: ${cells.length} cột, mong ${EXPECTED_VERIFIER_COLUMNS}`);
        }

        parsed.push({
            TC_ID,
            Status,
            Label: (Label || "").toUpperCase(),
            Channel: Channel ?? null,
            Reason: Reason ?? null,
            // `\`evidence/TC-x/02-ap-ma.jpg\`` -> evidence/TC-x/02-ap-ma.jpg ; "—" means none
            Evidence: Evidence && Evidence !== "—" ? Evidence.replace(/`/g, "").trim() : null,
            // R1.1 — cột OK/NG. R2.4c — nhãn bước hỏng (cũng là tên file ảnh của bước đó).
            KetQua: KetQua && KetQua !== "—" ? KetQua : null,
            FailedStep: FailedStep && FailedStep !== "—" ? FailedStep.replace(/`/g, "").trim() : null,
            // Kept so older callers reading `.Note` still get the meaningful text.
            Note: Reason ?? null,
            cellCount: cells.length,
        });
    }
    if (shapeIssues.length) {
        // Nổ TO thay vì lặng lẽ gán nhầm cột: một báo cáo sai nhãn tệ hơn một lần chạy dừng.
        throw new Error(
            `Bảng của qa-verifier sai số cột — qa-reporter đọc theo VỊ TRÍ nên sẽ gán nhầm mọi cột.\n` +
            shapeIssues.map(s => `  ${s}`).join("\n") +
            `\n  Sửa bảng ở assembleDeliverable() của qa-verifier, hoặc cập nhật ` +
            `EXPECTED_VERIFIER_COLUMNS ở đây — CÙNG một lượt.`);
    }
    return parsed;
}

function findTestCase(testCaseMarkdown, tcId) {
    const row = testCaseMarkdown.split("\n").find(l => l.trim().startsWith("|") && l.includes(tcId));
    if (!row) return null;
    const cells = row.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    const [TC_ID, Title, Precondition, Steps, TestData, ExpectedResult, Priority, Tags] = cells;
    return { TC_ID, Title, Precondition, Steps, TestData, ExpectedResult, Priority, Tags };
}

/**
 * Count designed test cases. The ID pattern is generic — `TC-<F>-<nnn>` where <F> is the
 * project's feature code (memory/semantic/testing-conventions.md). This used to hardcode
 * `TC-D-\d{3}`, which silently counted 0 for any project whose feature code is not "D".
 */
function countDesignedTestCases(testCaseMarkdown) {
    return String(testCaseMarkdown ?? "").split("\n")
        .filter(l => l.trim().startsWith("|") && /\bTC-[A-Za-z0-9]+-\d+\b/.test(l)).length;
}

function extractSeverity(draftMarkdown) {
    const row = draftMarkdown.split("\n").find(l => /\|\s*Severity\s*\|/i.test(l));
    if (!row) return null;
    const cells = row.split("|").map(c => c.trim());
    return (cells[2] || "").trim();
}

// ── Bug drafts: computed once, reused by daily/sprint/release/rca; only
//    written to output/ if "bug" is explicitly requested (role.md: never
//    write a report type that wasn't asked for). ──
async function buildBugDrafts({ candidates, testCaseDeliverable }) {
    const skill = await loadSkill("01_bug_report_writer.md");
    const drafts = [];
    for (const candidate of candidates) {
        const testCase = findTestCase(testCaseDeliverable.content, candidate.TC_ID);
        // Evidence path comes from the verifier table, verified to exist before being
        // quoted — a bug report pointing at a missing screenshot is worse than one that
        // honestly says there is none.
        let evidence = null;
        if (candidate.Evidence) {
            const check = await runTool("file_exists", { path: candidate.Evidence });
            evidence = check.exists ? candidate.Evidence : null;
            if (!check.exists) console.error(`  [bug] ${candidate.TC_ID}: verifier ghi ảnh ${candidate.Evidence} nhưng file không tồn tại — bỏ khỏi bug report.`);
        }
        // Gate per draft, not per batch: `verifyBugDraft` already works on one draft, and a
        // per-draft gate tells the model exactly which field of which report is empty —
        // a batch-level "3 vấn đề" is a message nobody can act on in one turn.
        const content = await askLLMChecked(skill,
            `tc_id=${candidate.TC_ID}\nverifier_classification=${JSON.stringify(candidate)}\ntest_case=${JSON.stringify(testCase)}\n` +
            `evidence_image=${evidence ?? "[không có ảnh evidence]"}`,
            {
                label: `bug:${candidate.TC_ID}`,
                selfCheck: (text) => {
                    const v = verifyBugDraft({ tcId: candidate.TC_ID, draftMarkdown: text });
                    return { ok: v.ok, issues: v.issues };
                },
            });
        drafts.push({ tcId: candidate.TC_ID, content, severity: (extractSeverity(content) || "").toLowerCase() });
    }
    const check = verifyAllDrafts(drafts.map(d => ({ tcId: d.tcId, draftMarkdown: d.content })));
    return { drafts, check };
}

async function writeBugReportFiles(drafts) {
    const bySeverity = { critical: [], major: [], minor: [] };
    for (const d of drafts) {
        const bucket = ["critical", "major", "minor"].includes(d.severity) ? d.severity : "major"; // unclear severity -> safer bucket, not minor
        bySeverity[bucket].push(d.content);
    }
    const outputFiles = [];
    for (const [severity, items] of Object.entries(bySeverity)) {
        if (items.length === 0) continue;
        const path = P.bugReport(severity);
        await runTool("write_file", { path, content: items.join("\n\n") });
        outputFiles.push(path);
    }
    return outputFiles;
}

// ── Jira push (agents/runtime/jira-client.js) — see knowledge/jira-integration.md.
// Only called when run()'s `jira.confirm === true`, checked EVERY call by the
// caller (never a persistent flag). Errors on one issue don't abort the rest —
// same "don't let one bad item block the whole batch" pattern as executeSteps()
// in qa-automation. ──
async function pushBugsToJira(drafts, projectKey) {
    const results = [];
    for (const d of drafts) {
        const payload = mapBugDraftToJiraIssue({ tcId: d.tcId, draftMarkdown: d.content, projectKey });
        try {
            const issue = await createIssue(payload);
            results.push({ tcId: d.tcId, status: "created", ...issue });
        } catch (err) {
            results.push({ tcId: d.tcId, status: "error", error: String(err.message ?? err) });
        }
    }
    return results;
}

async function pushTestCasesToJira(verifierRows, testCaseDeliverable, projectKey) {
    const results = [];
    for (const row of verifierRows) {
        const testCase = findTestCase(testCaseDeliverable.content, row.TC_ID);
        if (!testCase) continue;
        const payload = mapTestCaseToJiraIssue({ testCase, verdict: row.Status, projectKey });
        try {
            const issue = await createIssue(payload);
            results.push({ tcId: row.TC_ID, status: "created", ...issue });
        } catch (err) {
            results.push({ tcId: row.TC_ID, status: "error", error: String(err.message ?? err) });
        }
    }
    return results;
}

async function runDailySummary({ testExecutionData, bugsText, manualInputs }) {
    const skill = await loadSkill("02_daily_summary_writer.md");
    const outputFiles = [];
    for (const audience of ["dev", "pm"]) {
        const content = await askLLM(skill,
            `audience=${audience}\ntest_execution_data=${testExecutionData}\nbugs=${bugsText}\n` +
            `blockers=${manualInputs.blockers || ""}\nnext_actions=${manualInputs.nextActions || ""}`);
        const path = P.dailySummary(audience);
        await runTool("write_file", { path, content });
        outputFiles.push(path);
    }
    return outputFiles;
}

async function runSprintReport({ verifierRows, testCaseDeliverable, bugsText, sprintDate }) {
    if (!sprintDate) {
        throw new Error("sprintDate là bắt buộc cho reportTypes 'sprint' — phải truyền từ ngoài vào, agent không tự tạo ngày.");
    }
    const totalTestCasesDesigned = countDesignedTestCases(testCaseDeliverable.content);
    const metrics = calculateSprintMetrics({ rows: verifierRows, totalTestCasesDesigned });

    const historyRaw = await runTool("read_file", { path: P.SPRINT_HISTORY });
    const history = historyRaw.error ? [] : JSON.parse(historyRaw.content);
    const previousMetrics = getPreviousSprintMetrics(history);

    const skill = await loadSkill("03_sprint_report_writer.md");
    const content = await askLLM(skill,
        `sprint_metrics=${JSON.stringify(metrics)}\nprevious_sprint_metrics=${JSON.stringify(previousMetrics)}\nbug_list=${bugsText}`);
    await runTool("write_file", { path: P.SPRINT_REPORT, content });

    const updatedHistory = appendSprintMetrics(history, { date: sprintDate, ...metrics });
    await runTool("write_file", { path: P.SPRINT_HISTORY, content: JSON.stringify(updatedHistory, null, 2) });

    return [P.SPRINT_REPORT, P.SPRINT_HISTORY];
}

async function runReleaseNote({ manualInputs, bugsText }) {
    const skill = await loadSkill("04_release_note_writer.md");
    const content = await askLLM(skill, `new_features=${manualInputs.newFeatures || ""}\nbug_list=${bugsText}`);
    await runTool("write_file", { path: P.RELEASE_NOTE, content });
    return [P.RELEASE_NOTE];
}

async function runRcaReport({ manualInputs, bugsText }) {
    const skill = await loadSkill("05_rca_report_writer.md");
    const content = await askLLM(skill,
        `bug_description=${bugsText}\ntechnical_cause=${manualInputs.technicalCause || ""}\n` +
        `incident_timeline=${manualInputs.incidentTimeline || ""}\nfix_information=${manualInputs.fixInformation || ""}`);
    await runTool("write_file", { path: P.RCA_REPORT, content });
    return [P.RCA_REPORT];
}

async function runCommunication({ manualInputs }) {
    const template = manualInputs.communicationTemplate;
    if (!template) {
        throw new Error("manualInputs.communicationTemplate là bắt buộc cho reportTypes 'communication'.");
    }
    const skill = await loadSkill("06_qa_communication_writer.md");
    const content = await askLLM(skill, `template=${template}\ncontext_data=${manualInputs.communicationContext || ""}`);
    const path = P.communication(template.replace(/_/g, "-"));
    await runTool("write_file", { path, content });
    return [path];
}

async function runLogNarrative({ verifierDeliverable }) {
    const skill = await loadSkill("07_log_narrative_writer.md");
    const content = await askLLM(skill, `verifier_deliverable=${verifierDeliverable.content}`);
    await runTool("write_file", { path: P.QA_NARRATIVE, content });
    return [P.QA_NARRATIVE];
}

// Handover contract — see memory/README.md rule 3. Output files live in output/ and
// depend on which reportTypes were requested, so `produces` lists only the internal
// pipeline record that is written on every run.
export const CONTRACT = {
    agent: "qa-reporter",
    requires: [P.DELIVERABLE_VERIFIER, P.DELIVERABLE_TEST_DESIGNER],
    produces: [P.DELIVERABLE_REPORTER, P.TESTCASES_XLSX],
    inputs: {
        verifierDeliverableFile: "DELIVERABLE_VERIFIER",
        testCaseFile: "DELIVERABLE_TEST_DESIGNER",
    },
    // `reportTypes`, `manualInputs`, `sprintDate`, `jira` are not paths → they come from
    // the step's `with:` block. `jira.confirm` in particular must be passed explicitly on
    // EVERY call (knowledge/jira-integration.md); there is deliberately no way to make it
    // sticky, and a flow file declaring it counts as passing it explicitly for that flow.
};

export async function run({
    reportTypes = ["bug"],
    verifierDeliverableFile = P.DELIVERABLE_VERIFIER,
    testCaseFile = P.DELIVERABLE_TEST_DESIGNER,
    manualInputs = {},
    sprintDate = null,
    // Jira extension (agents/runtime/jira-client.js) — undefined/null by default,
    // run() behaves exactly as before if this isn't passed. `confirm: true` MUST
    // be passed explicitly EVERY call (see knowledge/jira-integration.md) — there
    // is no persistent flag/env var to "always allow" writing to Jira.
    jira = null,
} = {}) {
    const verifierDeliverable = await runTool("read_file", { path: verifierDeliverableFile });
    const testCaseDeliverable = await runTool("read_file", { path: testCaseFile });
    const verifierRows = parseVerifierTable(verifierDeliverable.content);
    // CHECKPOINT_FAILED nằm ở đây, nếu không thì một bug THẬT (hỏng ngay tại bước áp mã, có ảnh
    // đúng bước làm bằng chứng) sẽ không bao giờ ra bug report. Thêm nhãn vào LABELS mà quên
    // chỗ này là đúng cái bẫy bảng 11.G của TODO.Update4 nói tới.
    const candidates = verifierRows.filter(r =>
        r.Label === "BEHAVIOR_MISMATCH" || r.Label === "UNCLEAR" || r.Label === "CHECKPOINT_FAILED");

    const outputFiles = [];

    // ── R1.2e: bản Excel của bảng kết quả ──────────────────────────────
    //
    // Nguồn là `testcases-result.md` (do qa-verifier ghi), KHÔNG phải bảng trong
    // `deliverable-verifier.md`. Hai bảng đó có thể lệch nhau — bảng của verifier chỉ chứa test
    // case ĐÃ CHẠY, còn file kết quả chứa CẢ BỘ, kể cả những case `N/A`. Gửi ra ngoài nhóm thì
    // phải là cả bộ, nếu không người nhận đọc "12 dòng" thành "bộ test có 12 case".
    //
    // Chưa có file (phiên cũ, hoặc verifier chưa chạy) thì BỎ QUA kèm cảnh báo — không dựng
    // một file Excel rỗng để trông cho đủ.
    const resultMd = await runTool("read_file", { path: P.TESTCASES_RESULT });
    if (resultMd.error) {
        console.warn(`  [qa-reporter] chưa có ${P.TESTCASES_RESULT} → không xuất Excel.`);
    } else {
        const x = await exportTestCaseXlsx({ markdown: resultMd.content });
        for (const p of x.problems) console.warn(`  [qa-reporter/xlsx] ${p}`);
        if (x.written) {
            outputFiles.push(x.path);
            console.log(`  Excel: ${x.path} (${x.rows} dòng)`);
        } else {
            console.warn(`  [qa-reporter] không xuất được Excel — bảng kết quả không đọc được.`);
        }
    }

    let bugCheck = { ok: true, results: [], issues: [] };
    let bugsText = "";
    let bugDrafts = [];

    // Bug drafts are the shared input for daily/sprint/release/rca — computed once,
    // but only WRITTEN to output/ if "bug" was explicitly requested. Also needed
    // (independent of reportTypes) if the caller wants them pushed to Jira.
    const needsBugData = reportTypes.some(t => ["bug", "daily", "sprint", "release", "rca"].includes(t)) || jira?.pushBugs;
    if (needsBugData) {
        const { drafts, check } = await buildBugDrafts({ candidates, testCaseDeliverable });
        bugCheck = check;
        bugDrafts = drafts;
        bugsText = drafts.map(d => d.content).join("\n\n") || "Không có bug candidate nào trong lần chạy này.";
        if (reportTypes.includes("bug")) {
            outputFiles.push(...(await writeBugReportFiles(drafts)));
        }
    }

    if (reportTypes.includes("daily")) {
        const passedCount = verifierRows.filter(r => (r.Status || "").toLowerCase() === "passed").length;
        const testExecutionData = `Total: ${verifierRows.length}, Passed: ${passedCount}`;
        outputFiles.push(...(await runDailySummary({ testExecutionData, bugsText, manualInputs })));
    }

    if (reportTypes.includes("sprint")) {
        outputFiles.push(...(await runSprintReport({ verifierRows, testCaseDeliverable, bugsText, sprintDate })));
    }

    if (reportTypes.includes("release")) {
        outputFiles.push(...(await runReleaseNote({ manualInputs, bugsText })));
    }

    if (reportTypes.includes("rca")) {
        outputFiles.push(...(await runRcaReport({ manualInputs, bugsText })));
    }

    if (reportTypes.includes("communication")) {
        outputFiles.push(...(await runCommunication({ manualInputs })));
    }

    if (reportTypes.includes("narrative")) {
        outputFiles.push(...(await runLogNarrative({ verifierDeliverable })));
    }

    // Jira push — ONLY when confirm === true is passed explicitly on THIS call.
    // No other condition (reportTypes, env var, previous call) can substitute
    // for this — see knowledge/jira-integration.md.
    let jiraResults = null;
    if (jira?.confirm === true) {
        jiraResults = { bugs: [], testCases: [] };
        if (jira.pushBugs) {
            jiraResults.bugs = await pushBugsToJira(bugDrafts, jira.projectKey);
        }
        if (jira.pushTestCases) {
            jiraResults.testCases = await pushTestCasesToJira(verifierRows, testCaseDeliverable, jira.projectKey);
        }
    }

    const checkSection = bugCheck.ok
        ? `Bug draft: đạt — tất cả ${bugCheck.results.length} draft đều đủ trường/traceable.`
        : `Bug draft: **CHƯA ĐẠT** — ${bugCheck.issues.join(" ")}`;
    const jiraSection = jiraResults
        ? `\n## Jira\n- Bugs pushed: ${jiraResults.bugs.length}\n- Test cases pushed: ${jiraResults.testCases.length}\n`
        : "";
    const deliverableContent =
        `# Deliverable — QA Reporter (nội bộ pipeline)\n\n` +
        `## Report types đã chạy\n${reportTypes.join(", ")}\n\n` +
        `## Output files\n${outputFiles.map(f => `- ${f}`).join("\n")}\n\n` +
        `## Self Count Check\n${checkSection}\n` +
        jiraSection;
    await runTool("write_file", { path: P.DELIVERABLE_REPORTER, content: deliverableContent });

    return { status: "success", data: { deliverableFile: P.DELIVERABLE_REPORTER, outputFiles, jiraResults }, error: null };
}
