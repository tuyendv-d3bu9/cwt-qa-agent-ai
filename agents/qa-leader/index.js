// agents/qa-leader/index.js
// Node: QA Leader — coordinator of 6 skills (01-06), does not analyze requirements itself.
// Leader only does its own steps (setup + review). Orchestration loop lives in the workflow.

import { readFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { convertDirectory } from "./tools/convert-to-md.js";
import { hashProjectDocs } from "./tools/project-docs-hash.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("./knowledge/fact-framework.md", import.meta.url), "utf8");
const CONVENTIONS = await readFile(new URL("./knowledge/task-management-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);
const FOLDERS = ["01_Business", "02_BA", "03_Dev", "04_Design", "05_QA", "06_Communication"];

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText, extraKnowledge = "") {
    const res = await callLLM({
        system: [ROLE, extraKnowledge, skillText].filter(Boolean).join("\n\n"),
        contents: [{ role: "user", parts: [{ text: userText }] }],
    });
    return res.text;
}

// Strip markdown code fences (```json ... ```) that LLM may wrap around JSON
function parseJSON(raw) {
    const cleaned = raw.replace(/^```[\w]*\n?/m, "").replace(/```\s*$/m, "").trim();
    return JSON.parse(cleaned);
}

// Step 1 (skill 01) — standardize formats, DO NOT use LLM (deterministic tool)
async function step1_convert() {
    return convertDirectory("project-docs");
}

// Step 2 (skill 02) — classify files at root project-docs/ into exactly one of the 6 folders
async function step2_classify() {
    const skill = await loadSkill("02_doc_classification.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const unclassified = listing.files.filter(f => !FOLDERS.some(folder => f.path.includes(`/${folder}/`)));
    if (unclassified.length === 0) return { moved: [] };

    const contents = {};
    for (const f of unclassified) {
        const r = await runTool("read_file", { path: f.path });
        contents[f.path] = r.content.slice(0, 1000); // only first 1000 chars to classify
    }
    const raw = await askLLM(skill,
        `document_list=${JSON.stringify(unclassified.map(f => f.path))}\ndocument_contents=${JSON.stringify(contents)}\n` +
        `Return ONLY a raw JSON object (no markdown, no code block) mapping source path -> destination path, e.g. { "project-docs/tenFile.md": "project-docs/02_BA/tenFile.md", ... }`);
    const mapping = parseJSON(raw);

    const moved = [];
    for (const [from, to] of Object.entries(mapping)) {
        const stripped = to.replace(/^(project-docs\/)+/, "");
        const safeTo = `project-docs/${stripped}`;
        await mkdir(path.dirname(safeTo), { recursive: true });
        await rename(from, safeTo);
        moved.push([from, safeTo]);
    }
    return { moved };
}

// Assemble a memory/project/*.md file with the same Type/Content/Source/Consumed-by
// shape used by the hand-authored seed files (see memory/project/*.md).
function assembleProjectKnowledgeFile({ title, type, content, source, consumedBy }) {
    return (
        `# Project Knowledge: ${title}\n\n` +
        `## Type\n${type}\n\n` +
        `## Content\n\n${content}\n\n` +
        `## Source\n${source}\n\n` +
        `## Consumed by\n${consumedBy}\n`
    );
}

// Step 2b (skill 02b) — distill project-docs/ into memory/project/{domain-facts,known-issues,decisions-log}.md.
// Skips (no LLM call) if project-docs/ is unchanged since the last distillation
// (tracked via a content hash in memory/project/manifest.json, tools/project-docs-hash.js).
// Does NOT touch memory/project/glossary.md — that file is a testing convention,
// not project-docs-derived content (see its own header note).
async function step2b_distillKnowledge() {
    const currentHash = await hashProjectDocs("project-docs");
    const manifestPath = "memory/project/manifest.json";
    const manifestRaw = await runTool("read_file", { path: manifestPath });
    const manifest = manifestRaw.error ? null : JSON.parse(manifestRaw.content);

    if (manifest?.projectDocsHash === currentHash) {
        return { distilled: false, reason: "project-docs/ unchanged since last distillation" };
    }

    const skill = await loadSkill("02b_project_knowledge_distillation.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const contents = {};
    for (const f of listing.files) {
        const r = await runTool("read_file", { path: f.path });
        contents[f.path] = r.content;
    }

    const raw = await askLLM(skill,
        `classified_documents=${JSON.stringify(listing.files.map(f => f.path))}\n` +
        `project_docs_content=${JSON.stringify(contents)}`);
    const { domainFacts, knownIssues, decisionsLog } = parseJSON(raw);

    const stamp = new Date().toISOString();

    await runTool("write_file", {
        path: "memory/project/domain-facts.md",
        content: assembleProjectKnowledgeFile({
            title: "Domain Facts — Function D (Voucher/Discount Checkout)",
            type: "Fact / Business Context (distilled from project-docs/)",
            content: domainFacts,
            source: `project-docs/ — chưng cất tự động bởi qa-leader lúc ${stamp}`,
            consumedBy: "qa-test-designer, qa-automation (cross-node, đọc trực tiếp).",
        }),
    });
    await runTool("write_file", {
        path: "memory/project/known-issues.md",
        content: assembleProjectKnowledgeFile({
            title: "Known Issues — Function D",
            type: "Fact / Registry (distilled from project-docs/)",
            content: knownIssues,
            source: `project-docs/05_QA/ — chưng cất tự động bởi qa-leader lúc ${stamp}`,
            consumedBy: "qa-test-designer, qa-automation, qa-reporter (cross-node, đọc trực tiếp).",
        }),
    });
    await runTool("write_file", {
        path: "memory/project/decisions-log.md",
        content: assembleProjectKnowledgeFile({
            title: "Decisions Log — Function D",
            type: "Fact / Change History (distilled from project-docs/06_Communication/)",
            content: decisionsLog,
            source: `project-docs/06_Communication/ — chưng cất tự động bởi qa-leader lúc ${stamp}`,
            consumedBy: "Chưa có node nào load qua index.js ở thời điểm tạo — tham chiếu con người + tương lai.",
        }),
    });
    await runTool("write_file", {
        path: manifestPath,
        content: JSON.stringify({ projectDocsHash: currentHash, distilledAt: stamp }, null, 2),
    });

    return { distilled: true, hash: currentHash };
}

// Step 3 (skill 03) — cross-check, detect gaps/contradictions
async function step3_gapCheck() {
    const skill = await loadSkill("03_info_gap_reporting.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const raw = await askLLM(skill,
        `classified_documents=${JSON.stringify(listing.files.map(f => f.path))}\n` +
        `Return ONLY a raw JSON object (no markdown, no code block): {"hasGap": bool, "reportMarkdown": string}`);
    return parseJSON(raw);
}

// Step 4 (skill 04) — Generate task assignment, write to memory/working/task-assignment.md
async function step4_assignTask(task) {
    const skill = await loadSkill("04_task_assignment.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const content = await askLLM(skill,
        `validated_documents=${JSON.stringify(listing.files.map(f => f.path))}\n` +
        `qa_analyst_name=QA Analyst Agent\ntask_scope=${task}`);
    await runTool("write_file", { path: "memory/working/task-assignment.md", content });
}

// ─────────────────────────────────────────────
// PUBLIC EXPORTS — called by the workflow, not by other agents
// ─────────────────────────────────────────────

/**
 * runSetup — Steps 1-4 (convert -> classify -> gap-check -> assign task).
 * Returns:
 *   { status: "not_started" }         — project-docs/ is empty
 *   { status: "waiting_input", ... }  — gap found, user must fill gap-report
 *   { status: "ready", ... }          — task-assignment.md written, analyst can run
 */
export async function runSetup({ task, formAnswers = null }) {
    const listing = await runTool("list_files", { dir: "project-docs" });
    if (listing.files.length === 0) {
        return { status: "not_started", data: null, error: "project-docs/ is empty. Please add documents and try again." };
    }

    await step1_convert();
    await step2_classify();
    await step2b_distillKnowledge();

    if (!formAnswers) {
        const { hasGap, reportMarkdown } = await step3_gapCheck();
        if (hasGap) {
            await runTool("write_file", { path: "memory/working/gap-report.md", content: reportMarkdown });
            return { status: "waiting_input", data: { formPath: "memory/working/gap-report.md" }, error: null };
        }
    }

    await step4_assignTask(task + (formAnswers ? `\n\nUser confirmed:\n${formAnswers}` : ""));
    return { status: "ready", data: { taskFile: "memory/working/task-assignment.md" }, error: null };
}

/**
 * runReview — Step 5: review analyst deliverable by FACT framework.
 * Returns: { verdict: "PASS" | "FIX" | "ASK", reportMarkdown: string }
 */
export async function runReview({ round }) {
    const skill = await loadSkill("05_deliverable_review.md");
    const deliverable = await runTool("read_file", { path: "memory/working/deliverable-analyst.md" });
    const raw = await askLLM(skill,
        `deliverable_content=${deliverable.content}\nround=${round}\n` +
        `Return only a JSON object: {"verdict": "PASS"|"FIX"|"ASK", "reportMarkdown": string}`,
        FACT + "\n\n" + CONVENTIONS);
    return parseJSON(raw);
}

/**
 * trackProgress — Step 6: write progress report after each milestone.
 */
export async function trackProgress(stage, note) {
    const skill = await loadSkill("06_workflow_progress_tracking.md");
    const content = await askLLM(skill, `workflow_stage=${stage}\nnote=${note}`);
    await runTool("write_file", { path: "memory/working/progress-report.md", content });
}
