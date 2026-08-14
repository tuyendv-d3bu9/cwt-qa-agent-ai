// agents/qa-reporter/index.js
// Node: QA Reporter — 7 report types (giáo trình QA Agent Reporter), chỉ chạy
// đúng loại được yêu cầu trong reportTypes. Report thật ghi vào output/,
// .state/deliverable-reporter.md chỉ là bản ghi nội bộ pipeline (Self Count Check).

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { verifyAllDrafts } from "./tools/traceability-check.js";
import { calculateSprintMetrics, getPreviousSprintMetrics, appendSprintMetrics } from "./tools/sprint-metrics-calculator.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../shared/knowledge/fact-framework.md", import.meta.url), "utf8");
const SCHEMA = await readFile(new URL("./knowledge/bug-report-schema.md", import.meta.url), "utf8");
const TRACEABILITY = await readFile(new URL("./knowledge/traceability-rule.md", import.meta.url), "utf8");
const AUDIENCE_TONE = await readFile(new URL("./knowledge/audience-tone.md", import.meta.url), "utf8");
const REPORT_TYPES_OVERVIEW = await readFile(new URL("./knowledge/report-types-overview.md", import.meta.url), "utf8");
const SPRINT_CONVENTIONS = await readFile(new URL("./knowledge/sprint-metrics-conventions.md", import.meta.url), "utf8");
const OUTPUT_CONVENTIONS = await readFile(new URL("./knowledge/output-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    const system = [ROLE, FACT, SCHEMA, TRACEABILITY, AUDIENCE_TONE, REPORT_TYPES_OVERVIEW, SPRINT_CONVENTIONS, OUTPUT_CONVENTIONS, skillText].join("\n\n");
    const res = await callLLM({ system, contents: [{ role: "user", parts: [{ text: userText }] }] });
    return res.text;
}

// ── Parsers (same conventions as qa-verifier/qa-automation) ──
function parseVerifierTable(verifierMarkdown) {
    const rows = verifierMarkdown.split("\n")
        .filter(l => l.trim().startsWith("|") && !l.includes("---") && !/^\|\s*TC_ID/i.test(l.trim()));
    return rows.map(l => {
        const cells = l.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        const [TC_ID, Status, Label, Note] = cells;
        return { TC_ID, Status, Label: (Label || "").toUpperCase(), Note };
    });
}

function findTestCase(testCaseMarkdown, tcId) {
    const row = testCaseMarkdown.split("\n").find(l => l.trim().startsWith("|") && l.includes(tcId));
    if (!row) return null;
    const cells = row.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    const [TC_ID, Title, Precondition, Steps, TestData, ExpectedResult, Priority, Tags] = cells;
    return { TC_ID, Title, Precondition, Steps, TestData, ExpectedResult, Priority, Tags };
}

function countDesignedTestCases(testCaseMarkdown) {
    return testCaseMarkdown.split("\n")
        .filter(l => l.trim().startsWith("|") && /TC-D-\d{3}/.test(l)).length;
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
        const content = await askLLM(skill,
            `tc_id=${candidate.TC_ID}\nverifier_classification=${JSON.stringify(candidate)}\ntest_case=${JSON.stringify(testCase)}`);
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
        const path = `output/bug-reports/${severity}.md`;
        await runTool("write_file", { path, content: items.join("\n\n") });
        outputFiles.push(path);
    }
    return outputFiles;
}

async function runDailySummary({ testExecutionData, bugsText, manualInputs }) {
    const skill = await loadSkill("02_daily_summary_writer.md");
    const outputFiles = [];
    for (const audience of ["dev", "pm"]) {
        const content = await askLLM(skill,
            `audience=${audience}\ntest_execution_data=${testExecutionData}\nbugs=${bugsText}\n` +
            `blockers=${manualInputs.blockers || ""}\nnext_actions=${manualInputs.nextActions || ""}`);
        const path = `output/daily-summary-${audience}.md`;
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

    const historyRaw = await runTool("read_file", { path: "output/sprint-history.json" });
    const history = historyRaw.error ? [] : JSON.parse(historyRaw.content);
    const previousMetrics = getPreviousSprintMetrics(history);

    const skill = await loadSkill("03_sprint_report_writer.md");
    const content = await askLLM(skill,
        `sprint_metrics=${JSON.stringify(metrics)}\nprevious_sprint_metrics=${JSON.stringify(previousMetrics)}\nbug_list=${bugsText}`);
    await runTool("write_file", { path: "output/sprint-report.md", content });

    const updatedHistory = appendSprintMetrics(history, { date: sprintDate, ...metrics });
    await runTool("write_file", { path: "output/sprint-history.json", content: JSON.stringify(updatedHistory, null, 2) });

    return ["output/sprint-report.md", "output/sprint-history.json"];
}

async function runReleaseNote({ manualInputs, bugsText }) {
    const skill = await loadSkill("04_release_note_writer.md");
    const content = await askLLM(skill, `new_features=${manualInputs.newFeatures || ""}\nbug_list=${bugsText}`);
    await runTool("write_file", { path: "output/release-note.md", content });
    return ["output/release-note.md"];
}

async function runRcaReport({ manualInputs, bugsText }) {
    const skill = await loadSkill("05_rca_report_writer.md");
    const content = await askLLM(skill,
        `bug_description=${bugsText}\ntechnical_cause=${manualInputs.technicalCause || ""}\n` +
        `incident_timeline=${manualInputs.incidentTimeline || ""}\nfix_information=${manualInputs.fixInformation || ""}`);
    await runTool("write_file", { path: "output/rca-report.md", content });
    return ["output/rca-report.md"];
}

async function runCommunication({ manualInputs }) {
    const template = manualInputs.communicationTemplate;
    if (!template) {
        throw new Error("manualInputs.communicationTemplate là bắt buộc cho reportTypes 'communication'.");
    }
    const skill = await loadSkill("06_qa_communication_writer.md");
    const content = await askLLM(skill, `template=${template}\ncontext_data=${manualInputs.communicationContext || ""}`);
    const path = `output/communications/${template.replace(/_/g, "-")}.md`;
    await runTool("write_file", { path, content });
    return [path];
}

async function runLogNarrative({ verifierDeliverable }) {
    const skill = await loadSkill("07_log_narrative_writer.md");
    const content = await askLLM(skill, `verifier_deliverable=${verifierDeliverable.content}`);
    await runTool("write_file", { path: "output/qa-narrative.md", content });
    return ["output/qa-narrative.md"];
}

export async function run({
    reportTypes = ["bug"],
    verifierDeliverableFile = ".state/deliverable-verifier.md",
    testCaseFile = ".state/deliverable-test-designer.md",
    manualInputs = {},
    sprintDate = null,
} = {}) {
    const verifierDeliverable = await runTool("read_file", { path: verifierDeliverableFile });
    const testCaseDeliverable = await runTool("read_file", { path: testCaseFile });
    const verifierRows = parseVerifierTable(verifierDeliverable.content);
    const candidates = verifierRows.filter(r => r.Label === "BEHAVIOR_MISMATCH" || r.Label === "UNCLEAR");

    const outputFiles = [];
    let bugCheck = { ok: true, results: [], issues: [] };
    let bugsText = "";

    // Bug drafts are the shared input for daily/sprint/release/rca — computed once,
    // but only WRITTEN to output/ if "bug" was explicitly requested.
    const needsBugData = reportTypes.some(t => ["bug", "daily", "sprint", "release", "rca"].includes(t));
    if (needsBugData) {
        const { drafts, check } = await buildBugDrafts({ candidates, testCaseDeliverable });
        bugCheck = check;
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

    const checkSection = bugCheck.ok
        ? `Bug draft: đạt — tất cả ${bugCheck.results.length} draft đều đủ trường/traceable.`
        : `Bug draft: **CHƯA ĐẠT** — ${bugCheck.issues.join(" ")}`;
    const deliverableContent =
        `# Deliverable — QA Reporter (nội bộ pipeline)\n\n` +
        `## Report types đã chạy\n${reportTypes.join(", ")}\n\n` +
        `## Output files\n${outputFiles.map(f => `- ${f}`).join("\n")}\n\n` +
        `## Self Count Check\n${checkSection}\n`;
    await runTool("write_file", { path: ".state/deliverable-reporter.md", content: deliverableContent });

    return { status: "success", data: { deliverableFile: ".state/deliverable-reporter.md", outputFiles }, error: null };
}
