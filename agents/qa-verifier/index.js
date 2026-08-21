// agents/qa-verifier/index.js
// Node: QA Verifier — decides PASS/FIX/ASK from TWO channels:
//
//   functional  expect() results in test-results.json  -> the ONLY source of pass/fail
//   visual      evidence/<TC_ID>-after.jpg read by a VLM -> WHY it failed, and whether a
//               green assertion is hiding a broken screen (false-green)
//
// The combination is deterministic (tools/verdict-combiner.js), not an LLM judgement:
// see agents/qa-automation/knowledge/oracle-problem.md — an image may only downgrade a
// conclusion, never upgrade one. Never runs the tests itself, never invents the oracle.

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM, callVisionLLM } from "../runtime/llm.js";
import { markStep } from "../runtime/memory.js";
import { parseTestResults, groupByTcId } from "./tools/parse-test-results.js";
import { combine, deriveVerdict, selectForVision, LABELS } from "./tools/verdict-combiner.js";
import * as P from "../runtime/paths.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const VERDICT_MAPPING = await readFile(new URL("./knowledge/verdict-mapping.md", import.meta.url), "utf8");
const UI_BASELINE_RULE = await readFile(new URL("./knowledge/ui-conventions-baseline.md", import.meta.url), "utf8");
const CHECKPOINT = await readFile(new URL("./knowledge/checkpoint-protocol.md", import.meta.url), "utf8");
// Cross-node knowledge — read directly, not copied (see role.md "Cross-node").
const RISK_TAXONOMY = await readFile(new URL("../qa-leader/knowledge/task-management-conventions.md", import.meta.url), "utf8");
const ORACLE_BOUNDARY = await readFile(new URL("../qa-automation/knowledge/oracle-problem.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

const DELIVERABLE_FILE = P.DELIVERABLE_VERIFIER;

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    const system = [ROLE, FACT, VERDICT_MAPPING, UI_BASELINE_RULE, ORACLE_BOUNDARY, CHECKPOINT, RISK_TAXONOMY, skillText].join("\n\n");
    const res = await callLLM({ system, contents: [{ role: "user", parts: [{ text: userText }] }] });
    return res.text;
}

function parseJSON(raw) {
    const cleaned = String(raw ?? "").replace(/^```[\w]*\n?/m, "").replace(/```\s*$/m, "").trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

/** Look up one column of a TC row in the 8-field test case table. */
function findCell(testCaseMarkdown, tcId, index) {
    const row = String(testCaseMarkdown ?? "").split("\n").find(l => l.trim().startsWith("|") && l.includes(tcId));
    if (!row) return null;
    const cells = row.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    return cells[index] ?? null;
}

// TC_ID, Title, Precondition, Steps, Test Data, Expected Result, Priority, Tags
const findExpectedResult = (md, tcId) => findCell(md, tcId, 5);
const findPriority = (md, tcId) => findCell(md, tcId, 6);

/**
 * Run the visual channel for one test case.
 * Returns visual=null when there is no usable image — which the combiner maps to UNCLEAR,
 * never to agreement. A missing screenshot must not look like confirmation.
 */
async function analyseScreenshot({ tcId, expectedResult, uiConventions, skill }) {
    const imagePath = P.screenshotAfter(tcId);
    const exists = await runTool("file_exists", { path: imagePath });
    if (!exists.exists) return { visual: null, note: `không có ${imagePath}` };

    try {
        const res = await callVisionLLM({
            system: [ROLE, ORACLE_BOUNDARY, VERDICT_MAPPING, skill].join("\n\n"),
            text: `tc_id=${tcId}\nexpected_result=${expectedResult ?? "[không tìm thấy trong bảng test case]"}\nui_conventions=${uiConventions}`,
            images: [imagePath],
        });
        const visual = parseJSON(res.text);
        if (!visual) return { visual: null, note: `VLM trả về JSON không parse được cho ${tcId}` };
        return { visual, note: null, imagePath };
    } catch (err) {
        // Reading/sending the image failed — report it, do not silently treat as pass.
        return { visual: null, note: `lỗi khi phân tích ảnh ${imagePath}: ${err.message}` };
    }
}

function assembleDeliverable({ verdict, analysed, visionSkipped, notes, narrative }) {
    const rows = analysed.map(a =>
        `| ${a.tcId} | ${a.status} | ${a.label} | ${a.channel} | ${String(a.reason).replace(/\|/g, "\\|")} | ${a.imagePath ? `\`${a.imagePath}\`` : "—"} |`
    ).join("\n");

    const counts = {};
    for (const a of analysed) counts[a.label] = (counts[a.label] ?? 0) + 1;

    const skippedSection = visionSkipped.length
        ? visionSkipped.map(s => `- ${s.tcId}: ${s.why}`).join("\n")
        : "*Mọi test case đều đã được soi ảnh.*";

    const notesSection = notes.length ? notes.map(n => `- ${n}`).join("\n") : "*Không có.*";

    return (
        `# Deliverable — QA Verifier\n\n` +
        `## Verdict: ${verdict}\n\n` +
        `Verdict này do \`tools/verdict-combiner.js\` suy ra **deterministic** từ nhãn của từng test case ` +
        `(KHÔNG phải do LLM tự kết luận). Quy tắc: có \`UNCLEAR\` hoặc \`BEHAVIOR_MISMATCH\` → ASK; ` +
        `chỉ có \`SPEC_ISSUE\` → FIX; còn lại → PASS.\n\n` +
        `## 1. Phân loại từng test case\n\n` +
        `| TC_ID | expect() | Nhãn | Kênh dùng | Lý do | Ảnh evidence |\n|---|---|---|---|---|---|\n` +
        `${rows || "| — | — | — | — | *không có kết quả nào* | — |"}\n\n` +
        `Tổng: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ") || "0"}\n\n` +
        `## 2. Test case KHÔNG được soi ảnh (tiết kiệm chi phí VLM)\n\n${skippedSection}\n\n` +
        `> Những test case này chỉ được kết luận bằng kênh \`expect()\`. Cần soi hết thì chạy lại với \`--vlm-all\`.\n\n` +
        `## 3. Ghi chú kỹ thuật (ảnh thiếu / VLM lỗi)\n\n${notesSection}\n\n` +
        `## 4. Diễn giải\n\n${narrative}\n`
    );
}

// Handover contract — see memory/README.md rule 3.
export const CONTRACT = {
    agent: "qa-verifier",
    requires: [
        P.TEST_RESULTS,
        P.UI_CONVENTIONS,
        P.DELIVERABLE_TEST_DESIGNER,
    ],
    produces: [DELIVERABLE_FILE],
};

/**
 * @param {{testResultsFile: string, uiConventionsFile: string, testCaseFile: string, vlmAll?: boolean}} opts
 *   vlmAll — analyse the screenshot of EVERY test case, not just failures and
 *   High/Critical passes (decision J.6).
 */
export async function run({ testResultsFile, uiConventionsFile, testCaseFile, vlmAll = false }) {
    const uiConventions = await runTool("read_file", { path: uiConventionsFile });
    if (uiConventions.error) {
        return { status: "error", data: null, error: `ui-conventions.md chưa tồn tại — QA Automation phải chạy trước. (${uiConventions.error})` };
    }

    const testResultsRaw = await runTool("read_file", { path: testResultsFile });
    if (testResultsRaw.error) {
        return { status: "error", data: null, error: `test-results.json chưa tồn tại — cần chạy 'npx playwright test --reporter=json' trước. (${testResultsRaw.error})` };
    }

    const testCaseDeliverable = await runTool("read_file", { path: testCaseFile });
    let parsed;
    try {
        parsed = parseTestResults(JSON.parse(testResultsRaw.content));
    } catch (err) {
        return { status: "error", data: null, error: `test-results.json không parse được: ${err.message}` };
    }
    const grouped = groupByTcId(parsed);

    // Flatten, attaching Priority so the vision-cost guard can use it.
    const flat = [];
    for (const [tcId, results] of Object.entries(grouped)) {
        for (const result of results) {
            flat.push({
                ...result,
                tcId,
                priority: findPriority(testCaseDeliverable.content, tcId),
                expectedResult: findExpectedResult(testCaseDeliverable.content, tcId),
            });
        }
    }

    const { wanted, skipped: visionSkipped } = selectForVision(flat, { all: vlmAll });
    const wantedKeys = new Set(wanted.map(r => `${r.tcId}::${r.title ?? ""}`));

    const visionSkill = await loadSkill("03_screenshot_analysis.md");
    const analysed = [];
    const notes = [];

    for (const result of flat) {
        let visual = null;
        let imagePath = null;

        if (wantedKeys.has(`${result.tcId}::${result.title ?? ""}`)) {
            const out = await analyseScreenshot({
                tcId: result.tcId,
                expectedResult: result.expectedResult,
                uiConventions: uiConventions.content,
                skill: visionSkill,
            });
            visual = out.visual;
            imagePath = out.imagePath ?? null;
            if (out.note) notes.push(`${result.tcId}: ${out.note}`);
        }

        // Deterministic — the image cannot turn a failure into a pass.
        const { label, reason, channel } = combine(result, visual);
        analysed.push({ tcId: result.tcId, status: result.status, label, reason, channel, imagePath, visual, priority: result.priority });
    }

    const verdict = deriveVerdict(analysed.map(a => a.label));

    // The LLM writes the explanation only. The verdict is already fixed above, so a
    // differently-worded report cannot change what the workflow does next.
    const narrative = await askLLM(await loadSkill("02_verdict_writer.md"),
        `verdict_deterministic=${verdict}\n` +
        `labelled_results=${JSON.stringify(analysed.map(({ visual, ...rest }) => ({
            ...rest,
            visual_summary: visual
                ? { matches_expected: visual.matches_expected, mismatch_details: visual.mismatch_details, ui_anomalies: visual.ui_anomalies, confidence: visual.confidence }
                : null,
        })))}\n` +
        `KHÔNG được đổi verdict — chỉ diễn giải verdict đã cho.`);

    await runTool("write_file", {
        path: DELIVERABLE_FILE,
        content: assembleDeliverable({ verdict, analysed, visionSkipped, notes, narrative }),
    });

    if (verdict === "ASK") {
        await markStep("qa-verifier", { status: "waiting_ask", output: DELIVERABLE_FILE });
    } else {
        await markStep("qa-verifier", { status: "done", output: DELIVERABLE_FILE });
    }

    return {
        status: "success",
        data: {
            deliverableFile: DELIVERABLE_FILE,
            verdict,
            labels: analysed.map(a => ({ tcId: a.tcId, label: a.label, imagePath: a.imagePath })),
            visionAnalysed: analysed.filter(a => a.visual).length,
            visionSkipped: visionSkipped.length,
            notes,
        },
        error: null,
    };
}

export { LABELS };
