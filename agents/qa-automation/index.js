// agents/qa-automation/index.js
// Node: QA Automation — turns QA Test Designer's test cases into static Playwright
// specs. MCP Playwright is used only here, at authoring time — never at spec
// run-time (see knowledge/generate-once-run-many.md).

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { connectPlaywrightMCP } from "../runtime/mcp-client.js";
import { verifyAllSpecs } from "./tools/spec-assertion-check.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../shared/knowledge/fact-framework.md", import.meta.url), "utf8");
const GEN_ONCE = await readFile(new URL("./knowledge/generate-once-run-many.md", import.meta.url), "utf8");
const ORACLE = await readFile(new URL("./knowledge/oracle-problem.md", import.meta.url), "utf8");
const CONVENTIONS = await readFile(new URL("./knowledge/playwright-conventions.md", import.meta.url), "utf8");
// Cross-node knowledge — read directly, not copied (see role.md "Cross-node").
const DOMAIN = await readFile(new URL("../qa-test-designer/knowledge/shopgo-domain.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    const system = [ROLE, FACT, GEN_ONCE, ORACLE, CONVENTIONS, DOMAIN, skillText].join("\n\n");
    const res = await callLLM({ system, contents: [{ role: "user", parts: [{ text: userText }] }] });
    return res.text;
}

/** Parse the 8-field test case table from deliverable-test-designer.md into row objects */
function parseTestCases(deliverableMarkdown) {
    const lines = deliverableMarkdown.split("\n")
        .filter(l => l.trim().startsWith("|") && !l.includes("---") && !/^\|\s*TC_ID/i.test(l.trim()));
    return lines.map(l => {
        const cells = l.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        const [TC_ID, Title, Precondition, Steps, TestData, ExpectedResult, Priority, Tags] = cells;
        return { TC_ID, Title, Precondition, Steps, TestData, ExpectedResult, Priority, Tags };
    });
}

// Authoring pass for ONE test case: explore real DOM once (MCP), then freeze into a static spec.
async function authorSpecFor(testCase, mcpClient) {
    const skill1 = await loadSkill("01_dom_explore.md");
    await mcpClient.callTool({ name: "browser_navigate", arguments: { url: "https://cwshopgo.github.io" } });
    const snapshot = await mcpClient.callTool({ name: "browser_snapshot", arguments: {} });
    const snapshotText = JSON.stringify(snapshot);
    const selectors = await askLLM(skill1, `test_case=${JSON.stringify(testCase)}\ndom_snapshot=${snapshotText}`);

    const skill2 = await loadSkill("02_spec_generator.md");
    const specContent = await askLLM(skill2, `test_case=${JSON.stringify(testCase)}\nselectors=${selectors}`);

    return { snapshotText, specContent };
}

function assembleDeliverable({ authored, check }) {
    const manifest = authored.map(a => `- ${a.testCase.TC_ID}: tests/${a.testCase.TC_ID}.spec.ts`).join("\n");
    const checkSection = check.ok
        ? `Đạt — tất cả ${check.results.length} spec đều có assertion hợp lệ.`
        : `**CHƯA ĐẠT** — ${check.issues.join(" ")}`;
    return (
        `# Deliverable — QA Automation\n\n` +
        `## 1. Spec Manifest\n${manifest}\n\n` +
        `## 2. Self Count Check (deterministic, tool spec-assertion-check.js)\n${checkSection}\n`
    );
}

export async function run({ testCaseFile }) {
    const deliverable = await runTool("read_file", { path: testCaseFile });
    const testCases = parseTestCases(deliverable.content);

    const mcpClient = await connectPlaywrightMCP({ headless: true });
    const authored = [];
    for (const testCase of testCases) {
        const { snapshotText, specContent } = await authorSpecFor(testCase, mcpClient);
        await runTool("write_file", { path: `tests/${testCase.TC_ID}.spec.ts`, content: specContent });
        authored.push({ testCase, snapshotText, specContent });
    }

    const skill3 = await loadSkill("03_ui_conventions_writer.md");
    const uiConventions = await askLLM(skill3, `all_dom_snapshots=${authored.map(a => a.snapshotText).join("\n\n")}`);
    await runTool("write_file", { path: ".state/ui-conventions.md", content: uiConventions });

    const check = verifyAllSpecs(authored.map(a => ({ tcId: a.testCase.TC_ID, specContent: a.specContent })));
    const deliverableContent = assembleDeliverable({ authored, check });
    await runTool("write_file", { path: ".state/deliverable-automation.md", content: deliverableContent });

    return {
        status: "success",
        data: { deliverableFile: ".state/deliverable-automation.md", specDir: "tests/", uiConventionsFile: ".state/ui-conventions.md" },
        error: null,
    };
}