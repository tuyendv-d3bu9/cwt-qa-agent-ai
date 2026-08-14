// agents/qa-test-designer/index.js
// Node: QA Test Designer — converts QA Analyst's viewpoints/test ideas into
// structured test cases for Function D. Does not re-analyze requirements.

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { verifyDeliverable } from "./tools/coverage-check.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../shared/knowledge/fact-framework.md", import.meta.url), "utf8");
const FRAMEWORKS = await readFile(new URL("./knowledge/framework-definitions.md", import.meta.url), "utf8");
const DOMAIN = await readFile(new URL("./knowledge/shopgo-domain.md", import.meta.url), "utf8");
const COVERAGE = await readFile(new URL("./knowledge/boundary-coverage-conventions.md", import.meta.url), "utf8");
const GLOSSARY = await readFile(new URL("./knowledge/glossary.md", import.meta.url), "utf8");
// Cross-node knowledge — read directly, not copied (see role.md "Cross-node").
const VIEWPOINTS = await readFile(new URL("../qa-analyst/knowledge/viewpoint-library.md", import.meta.url), "utf8");
const RISK_MATRIX = await readFile(new URL("../qa-leader/knowledge/task-management-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    const system = [ROLE, FACT, FRAMEWORKS, DOMAIN, COVERAGE, GLOSSARY, VIEWPOINTS, RISK_MATRIX, skillText].join("\n\n");
    const res = await callLLM({
        system,
        contents: [{ role: "user", parts: [{ text: userText }] }],
    });
    return res.text;
}

function assembleDeliverable({ testCases, check }) {
    const checkSection = check.ok
        ? `Đạt đủ coverage (idea Analyst: ${check.ideaCount}, test case: ${check.testCaseCount}, blocked: ${check.blockedCount}).`
        : `**CHƯA ĐẠT** — ${check.issues.join(" ")}`;
    return (
        `# Deliverable — QA Test Designer\n\n` +
        `## 1. Test Cases\n${testCases}\n\n` +
        `## 2. Self Count Check (deterministic, tool coverage-check.js)\n${checkSection}\n`
    );
}

export async function run({ taskFile, deliverableFile }) {
    const task = await runTool("read_file", { path: taskFile });
    const analystDeliverable = await runTool("read_file", { path: deliverableFile });

    const skill1 = await loadSkill("01_coverage_strategy.md");
    const strategy = await askLLM(skill1, `task=${task.content}\ndeliverable_analyst_content=${analystDeliverable.content}`);

    const skill2 = await loadSkill("02_boundary_generator.md");
    const boundarySets = await askLLM(skill2, `coverage_strategy_output=${strategy}`);

    const skill3 = await loadSkill("03_test_case_formatter.md");
    const testCases = await askLLM(skill3, `coverage_strategy_output=${strategy}\nboundary_sets=${boundarySets}`);

    const check = verifyDeliverable({ deliverableAnalystMarkdown: analystDeliverable.content, testCaseMarkdown: testCases });
    const deliverable = assembleDeliverable({ testCases, check });

    await runTool("write_file", { path: ".state/deliverable-test-designer.md", content: deliverable });
    return { status: "success", data: { deliverableFile: ".state/deliverable-test-designer.md" }, error: null };
}
