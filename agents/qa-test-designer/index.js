// agents/qa-test-designer/index.js
// Node: QA Test Designer — converts QA Analyst's viewpoints/test ideas into
// structured test cases for Function D. Does not re-analyze requirements.

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { contextFor } from "../runtime/knowledge.js";
import { registerArtifact } from "../qa-leader/tools/impact-analysis.js";
import { artifactId } from "../runtime/db.js";
import { verifyDeliverable } from "./tools/coverage-check.js";
import * as P from "../runtime/paths.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const FRAMEWORKS = await readFile(new URL("./knowledge/framework-definitions.md", import.meta.url), "utf8");
const COVERAGE = await readFile(new URL("./knowledge/boundary-coverage-conventions.md", import.meta.url), "utf8");
// Project knowledge (memory/project/) — distilled from project-docs/, shared across nodes.
const DOMAIN = await readFile(new URL("../../memory/project/domain-facts.md", import.meta.url), "utf8");
const KNOWN_ISSUES = await readFile(new URL("../../memory/project/known-issues.md", import.meta.url), "utf8");
const CONVENTIONS_T1 = await readFile(new URL("../../memory/semantic/testing-conventions.md", import.meta.url), "utf8");
// Cross-node knowledge — read directly, not copied (see role.md "Cross-node").
const VIEWPOINTS = await readFile(new URL("../qa-analyst/knowledge/viewpoint-library.md", import.meta.url), "utf8");
const RISK_MATRIX = await readFile(new URL("../qa-leader/knowledge/task-management-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    // Tier 2 is QUERIED, not injected — see memory/README.md and knowledge.js.
    const system = [ROLE, FACT, FRAMEWORKS, DOMAIN, KNOWN_ISSUES, COVERAGE, CONVENTIONS_T1, VIEWPOINTS, RISK_MATRIX, contextFor(userText), skillText]
        .filter(Boolean).join("\n\n");
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

// Tier-3 files this node consumes — used to record provenance of the test cases it
// produces. Kept next to the readFile calls above so the two cannot drift apart.
const KNOWLEDGE_FILES_READ = [
    P.DOMAIN_FACTS,
    P.KNOWN_ISSUES,
    // Added with P0.4: test-case Steps are now derived from the flow, so a change to the
    // flow document must be able to mark those test cases stale. Leaving it out would make
    // impact analysis silently miss the case "the app's navigation changed" — the very
    // change most likely to invalidate a test case's Steps.
    P.UI_FLOWS,
];

/** TC_ID of every row in the generated 8-field table. Deterministic, no LLM. */
function extractTestCaseIds(testCaseMarkdown) {
    return [...new Set(
        testCaseMarkdown.split("\n")
            .filter(l => l.trim().startsWith("|") && !l.includes("---"))
            .map(l => l.split("|").map(c => c.trim())[1])
            .filter(id => id && !/^TC_ID$/i.test(id))
    )];
}

// Handover contract — see memory/README.md rule 3.
export const CONTRACT = {
    agent: "qa-test-designer",
    requires: [P.TASK_ASSIGNMENT, P.DELIVERABLE_ANALYST],
    produces: [P.DELIVERABLE_TEST_DESIGNER],
    inputs: { taskFile: "TASK_ASSIGNMENT", deliverableFile: "DELIVERABLE_ANALYST" },
};

export async function run({ taskFile, deliverableFile }) {
    const task = await runTool("read_file", { path: taskFile });
    const analystDeliverable = await runTool("read_file", { path: deliverableFile });

    // The navigation flow, read fresh (tier 3, distilled by qa-leader's distillUiFlows()).
    // Steps in the test-case table have to name steps that EXIST in this flow. Without it
    // this node emitted Steps like "Vào checkout / Nhập mã / Áp dụng" — three vague words —
    // and qa-automation then had to invent the entire navigation itself, once per test case.
    // Twenty-one independent inventions; 13 of the 21 generated specs ended up performing no
    // action at all.
    const flowKnowledge = await runTool("read_file", { path: P.UI_FLOWS });
    const flowSection = flowKnowledge.error
        ? `ui_flows=KHÔNG CÓ (${P.UI_FLOWS} chưa tồn tại — qa-leader chưa chưng cất tài liệu luồng).\n` +
          `Steps vẫn phải viết bằng lời nghiệp vụ rõ ràng, KHÔNG viết tắt kiểu "Vào checkout".\n`
        : `ui_flows=\n${flowKnowledge.content}\n\n` +
          `Steps của mỗi test case PHẢI bám vào các bước có thật trong ui_flows ở trên — dùng lại\n` +
          `cách diễn đạt của luồng. KHÔNG viết bước mơ hồ 3 từ, KHÔNG bịa bước không có trong luồng.\n`;

    const skill1 = await loadSkill("01_coverage_strategy.md");
    const strategy = await askLLM(skill1, `task=${task.content}\ndeliverable_analyst_content=${analystDeliverable.content}\n${flowSection}`);

    const skill2 = await loadSkill("02_boundary_generator.md");
    const boundarySets = await askLLM(skill2, `coverage_strategy_output=${strategy}`);

    const skill3 = await loadSkill("03_test_case_formatter.md");
    const testCases = await askLLM(skill3,
        `coverage_strategy_output=${strategy}\nboundary_sets=${boundarySets}\n${flowSection}`);

    const check = verifyDeliverable({ deliverableAnalystMarkdown: analystDeliverable.content, testCaseMarkdown: testCases });
    const deliverable = assembleDeliverable({ testCases, check });

    await runTool("write_file", { path: P.DELIVERABLE_TEST_DESIGNER, content: deliverable });

    // Register each test case in the traceability graph, derived from the tier-3
    // knowledge files this node actually read. Without this, impact analysis stops at
    // the knowledge files and can never answer "which test cases went stale?".
    // Link is at FILE level, not section level, on purpose: this node reads whole files
    // and cannot honestly claim which individual section a test case came from.
    const knowledgeSources = KNOWLEDGE_FILES_READ.map(p => artifactId("knowledge-file", p));
    for (const tcId of extractTestCaseIds(testCases)) {
        registerArtifact({ kind: "testcase", ref: tcId, derivedFrom: knowledgeSources });
    }

    return { status: "success", data: { deliverableFile: P.DELIVERABLE_TEST_DESIGNER }, error: null };
}
