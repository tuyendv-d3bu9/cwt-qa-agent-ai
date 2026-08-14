// agents/qa-verifier/index.js
// Node: QA Verifier — matches real .spec.ts run results against the frozen
// ui-conventions.md oracle and Test Designer's Expected Result, decides
// PASS/FIX/ASK. Never runs tests itself, never invents the oracle.

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { parseTestResults, groupByTcId } from "./tools/parse-test-results.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../shared/knowledge/fact-framework.md", import.meta.url), "utf8");
const VERDICT_MAPPING = await readFile(new URL("./knowledge/verdict-mapping.md", import.meta.url), "utf8");
const UI_BASELINE_RULE = await readFile(new URL("./knowledge/ui-conventions-baseline.md", import.meta.url), "utf8");
const CHECKPOINT = await readFile(new URL("./knowledge/checkpoint-protocol.md", import.meta.url), "utf8");
// Cross-node knowledge — read directly, not copied (see role.md "Cross-node").
const RISK_TAXONOMY = await readFile(new URL("../qa-leader/knowledge/task-management-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    const system = [ROLE, FACT, VERDICT_MAPPING, UI_BASELINE_RULE, CHECKPOINT, RISK_TAXONOMY, skillText].join("\n\n");
    const res = await callLLM({ system, contents: [{ role: "user", parts: [{ text: userText }] }] });
    return res.text;
}

/** Look up Expected Result for a TC_ID from the 8-field test case table */
function findExpectedResult(testCaseMarkdown, tcId) {
    const row = testCaseMarkdown.split("\n").find(l => l.trim().startsWith("|") && l.includes(tcId));
    if (!row) return null;
    const cells = row.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    return cells[5] || null; // TC_ID, Title, Precondition, Steps, Test Data, Expected Result, Priority, Tags
}

function assembleDeliverable(verdictReport) {
    return `# Deliverable — QA Verifier\n\n${verdictReport}\n`;
}

export async function run({ testResultsFile, uiConventionsFile, testCaseFile }) {
    const uiConventions = await runTool("read_file", { path: uiConventionsFile });
    if (uiConventions.error) {
        return { status: "error", data: null, error: `ui-conventions.md chưa tồn tại — QA Automation phải chạy trước. (${uiConventions.error})` };
    }

    const testResultsRaw = await runTool("read_file", { path: testResultsFile });
    if (testResultsRaw.error) {
        return { status: "error", data: null, error: `test-results.json chưa tồn tại — cần chạy 'npx playwright test --reporter=json' trước. (${testResultsRaw.error})` };
    }

    const testCaseDeliverable = await runTool("read_file", { path: testCaseFile });
    const parsed = parseTestResults(JSON.parse(testResultsRaw.content));
    const grouped = groupByTcId(parsed);

    const skill1 = await loadSkill("01_test_result_analysis.md");
    const analyzed = [];
    for (const [tcId, results] of Object.entries(grouped)) {
        for (const result of results) {
            if (result.status === "passed") {
                analyzed.push({ ...result, tcId, label: "PASSED" });
                continue;
            }
            const expectedResult = findExpectedResult(testCaseDeliverable.content, tcId);
            const label = await askLLM(skill1,
                `failed_test=${JSON.stringify(result)}\nui_conventions=${uiConventions.content}\nexpected_result=${expectedResult}`);
            analyzed.push({ ...result, tcId, label });
        }
    }

    const skill2 = await loadSkill("02_verdict_writer.md");
    const verdictReport = await askLLM(skill2, `all_results=${JSON.stringify(analyzed)}`);
    const verdictMatch = /## Verdict:\s*(PASS|FIX|ASK)/i.exec(verdictReport);
    const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : "ASK"; // never silently assume PASS if unparseable

    if (verdict === "ASK") {
        await runTool("write_file", { path: ".state/workflow-state.json", content: JSON.stringify({ phase: "verify", round: 1 }, null, 2) });
    }

    await runTool("write_file", { path: ".state/deliverable-verifier.md", content: assembleDeliverable(verdictReport) });
    return { status: "success", data: { deliverableFile: ".state/deliverable-verifier.md", verdict }, error: null };
}