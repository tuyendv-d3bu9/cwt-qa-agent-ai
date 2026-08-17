// agents/qa-automation/index.js
// Node: QA Automation — turns QA Test Designer's test cases into static Playwright
// specs. MCP Playwright is used only here, at authoring time — never at spec
// run-time (see knowledge/generate-once-run-many.md).

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { connectPlaywrightMCP } from "../runtime/mcp-client.js";
import { runStepLoop } from "../runtime/loop.js";
import { verifyAllSpecs } from "./tools/spec-assertion-check.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const GEN_ONCE = await readFile(new URL("./knowledge/generate-once-run-many.md", import.meta.url), "utf8");
const ORACLE = await readFile(new URL("./knowledge/oracle-problem.md", import.meta.url), "utf8");
const CONVENTIONS = await readFile(new URL("./knowledge/playwright-conventions.md", import.meta.url), "utf8");
// Project knowledge (memory/project/) — distilled from project-docs/, shared across nodes.
const DOMAIN = await readFile(new URL("../../memory/project/domain-facts.md", import.meta.url), "utf8");
const KNOWN_ISSUES = await readFile(new URL("../../memory/project/known-issues.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    const system = [ROLE, FACT, GEN_ONCE, ORACLE, CONVENTIONS, DOMAIN, KNOWN_ISSUES, skillText].join("\n\n");
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

/** Split a "1. ... 2. ... 3. ..." Steps string into an array of individual step strings */
function splitSteps(stepsText) {
    return (stepsText || "")
        .split(/\d+\.\s*/)
        .map(s => s.trim())
        .filter(Boolean);
}

// Strip markdown code fences the LLM may wrap around JSON (same convention as qa-leader/index.js)
function parseJSON(raw) {
    const cleaned = raw.replace(/^```[\w]*\n?/m, "").replace(/```\s*$/m, "").trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

// Fix for the known bug: this used to just navigate to the root URL and snapshot
// once, regardless of the test case's own Steps — meaning multi-step test cases
// (e.g. "add item to cart, then go to checkout") were explored at the wrong page
// state. Now each step is executed for real via MCP before the final snapshot.
// Uses runtime/loop.js's runStepLoop (see TODO.md E.3) instead of a hand-rolled
// for-loop, so the same step-decision engine can be reused elsewhere.
// NOTE: the exact MCP tool names/schemas below are NOT hardcoded — the LLM picks
// only from `availableTools`, fetched live via mcpClient.listTools(). That list
// hasn't been verified against a real @playwright/mcp connection yet (no live run
// has happened) — first live run should double-check the decisions look sane.
async function executeSteps(testCase, mcpClient, availableTools) {
    const stepSkill = await loadSkill("00_step_navigator.md");
    const steps = splitSteps(testCase.Steps);

    await runStepLoop({
        steps,
        decide: async (step) => {
            const snapshot = await mcpClient.callTool({ name: "browser_snapshot", arguments: {} });
            const decisionRaw = await askLLM(stepSkill,
                `step=${step}\ndom_snapshot=${JSON.stringify(snapshot)}\navailable_tools=${JSON.stringify(availableTools)}`);
            return parseJSON(decisionRaw);
        },
        execute: async (decision, step) => {
            try {
                await mcpClient.callTool({ name: decision.tool, arguments: decision.args || {} });
            } catch (err) {
                // Don't abort the whole authoring pass over one unresolved step —
                // the final snapshot/spec-gen step will still run on whatever state
                // was reached, and spec-assertion-check.js catches empty/bad specs downstream.
                console.error(`  [${testCase.TC_ID}] step failed: "${step}" -> ${err.message}`);
            }
        },
    });
}

// Authoring pass for ONE test case: execute its real Steps via MCP, THEN snapshot
// (fixes the bug where only the root URL was ever explored), then freeze into a static spec.
async function authorSpecFor(testCase, mcpClient, availableTools) {
    const skill1 = await loadSkill("01_dom_explore.md");

    await mcpClient.callTool({ name: "browser_navigate", arguments: { url: "https://cwshopgo.github.io" } });
    await executeSteps(testCase, mcpClient, availableTools);

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
    const { tools: mcpTools } = await mcpClient.listTools();
    const availableTools = mcpTools.map(t => ({ name: t.name, description: t.description }));

    const authored = [];
    for (const testCase of testCases) {
        const { snapshotText, specContent } = await authorSpecFor(testCase, mcpClient, availableTools);
        await runTool("write_file", { path: `tests/${testCase.TC_ID}.spec.ts`, content: specContent });
        authored.push({ testCase, snapshotText, specContent });
    }

    const skill3 = await loadSkill("03_ui_conventions_writer.md");
    const uiConventions = await askLLM(skill3, `all_dom_snapshots=${authored.map(a => a.snapshotText).join("\n\n")}`);
    await runTool("write_file", { path: "memory/working/ui-conventions.md", content: uiConventions });

    const check = verifyAllSpecs(authored.map(a => ({ tcId: a.testCase.TC_ID, specContent: a.specContent })));
    const deliverableContent = assembleDeliverable({ authored, check });
    await runTool("write_file", { path: "memory/working/deliverable-automation.md", content: deliverableContent });

    return {
        status: "success",
        data: { deliverableFile: "memory/working/deliverable-automation.md", specDir: "tests/", uiConventionsFile: "memory/working/ui-conventions.md" },
        error: null,
    };
}