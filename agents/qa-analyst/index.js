// agents/qa-analyst/index.js
// Node: QA Analyst —  requirement analyst , NOT decide source of conflict.

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { contextFor } from "../runtime/knowledge.js";
import { verifyDeliverable } from "./tools/count-check.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
// Tier 1 (memory/semantic/) is the ONE definition of the FACT framework. This node used
// to load only its private file — which is not the framework at all but this node's own
// delivery rules, despite being named fact-framework.md — so the shared definition never
// reached the prompt while role.md claimed it did.
const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const DELIVERY_RULES = await readFile(new URL("./knowledge/delivery-rules.md", import.meta.url), "utf8");
const CONVENTIONS = await readFile(new URL("./knowledge/requirement-analysis-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    const res = await callLLM({
        // Tier 2 is QUERIED, not injected — see memory/README.md and knowledge.js.
        system: [ROLE, FACT, DELIVERY_RULES, CONVENTIONS, contextFor(userText), skillText].filter(Boolean).join("\n\n"),
        contents: [{ role: "user", parts: [{ text: userText }] }],
    });
    return res.text;
}

// Read all relevant documents in project-docs/
async function readAllDocs() {
    const listing = await runTool("list_files", { dir: "project-docs" });
    const contents = {};
    for (const f of listing.files) {
        const r = await runTool("read_file", { path: f.path });
        contents[f.path] = r.content;
    }
    return contents;
}

function formatCheckSection(check) {
    return check.ok
        ? `Đạt đủ ngưỡng tối thiểu (missing rules: ${check.missingRuleCount}, viewpoint: ${check.viewpointCount}, test idea: ${check.totalIdeas}).`
        : `**CHƯA ĐẠT** — ${check.issues.join(" ")}`;
}

function assembleDeliverable({ summary, missingRules, viewpoints, check }) {
    const checkSection = formatCheckSection(check);
    return (
        `# Deliverable — QA Analyst\n\n` +
        `## 1. Requirement Summary\n${summary}\n\n` +
        `## 2. Missing Business Rules (6W)\n${missingRules}\n\n` +
        `## 3. Viewpoints & Test Ideas\n${viewpoints}\n\n` +
        `## 4. Self Count Check (deterministic, tool count-check.js)\n${checkSection}\n`
    );
}

function updateCountCheck(content) {
    const clean = content.replace(/##\s*4\.\s*Self Count Check[\s\S]*$/i, "").trim();
    const mr = clean.split(/##\s*2\.\s*Missing/i)[1]?.split(/##\s*3\.\s*Viewpoint/i)[0] ?? clean;
    const vp = clean.split(/##\s*3\.\s*Viewpoint/i)[1] ?? clean;

    const check = verifyDeliverable({ missingRulesMarkdown: mr, viewpointsMarkdown: vp });
    return clean + `\n\n## 4. Self Count Check (deterministic, tool count-check.js)\n${formatCheckSection(check)}\n`;
}

// First run (no FIX feedback) — run sequentially skill 01 -> 02 -> 03
async function runFullAnalysis(task) {
    const docContents = await readAllDocs();
    const skill1 = await loadSkill("01_requirement_summary.md");
    const summary = await askLLM(skill1, `task=${task}\ndoc_contents=${JSON.stringify(docContents)}`);

    const skill2 = await loadSkill("02_missing_rule_finder.md");
    const missingRules = await askLLM(skill2, `requirement_summary=${summary}`);

    const skill3 = await loadSkill("03_viewpoint_and_testidea.md");
    const viewpoints = await askLLM(skill3, `requirement_summary=${summary}\nmissing_rules=${missingRules}`);

    const check = verifyDeliverable({ missingRulesMarkdown: missingRules, viewpointsMarkdown: viewpoints });

    return assembleDeliverable({ summary, missingRules, viewpoints, check });
}

// REVISION LOOP — only fix the points Leader points out, do not run from the beginning
async function runRevision(task) {
    const skill4 = await loadSkill("04_revise_on_feedback.md");
    const prev = await runTool("read_file", { path: "memory/working/deliverable-analyst.md" });
    const feedback = task.split(/(?=##\s*Feedback\s*(?:round|vòng|vong))/i).pop();
    const rawRevised = await askLLM(skill4, `feedback=${feedback}\nprevious_deliverable=${prev.content}`);
    return updateCountCheck(rawRevised);
}

// Handover contract (memory/README.md rule 3). The workflow checks `requires`
// before calling run(), so a missing input fails here with a clear message instead
// of deep inside an LLM call.
export const CONTRACT = {
    agent: "qa-analyst",
    requires: ["memory/working/task-assignment.md"],
    produces: ["memory/working/deliverable-analyst.md"],
};

export async function run({ taskFile }) {
    const task = await runTool("read_file", { path: taskFile });
    const isRevision = /(?:##\s*Feedback\s*(?:round|vòng|vong))/i.test(task.content);

    const deliverable = isRevision
        ? await runRevision(task.content)
        : await runFullAnalysis(task.content);

    await runTool("write_file", { path: "memory/working/deliverable-analyst.md", content: deliverable });
    return { status: "success", data: { deliverableFile: "memory/working/deliverable-analyst.md" }, error: null };
}