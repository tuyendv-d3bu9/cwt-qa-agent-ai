// agents/qa-leader/index.js
// Node: QA Leader — coordinator of 6 skills (01-06), does not analyze requirements itself.
// Leader is the highest-level coordination node, so index.js is longer than normal worker nodes.
// This is intentional and does not violate the "concise assembler" principle.

import { readFile } from "node:fs/promises";
import { rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { convertDirectory } from "./tools/convert-to-md.js";
import { run as runAnalyst } from "../qa-analyst/index.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("./knowledge/fact-framework.md", import.meta.url), "utf8");
const CONVENTIONS = await readFile(new URL("./knowledge/task-management-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);
const FOLDERS = ["01_Bussiness", "02_BA", "03_DEV", "04_Dessign", "05_QA", "06_Communication"];
const MAX_ROUNDS = 3;

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

// Step 1 (skill 01) — standardize formats, DO NOT use LLM (deterministic tool)
async function step1_convert() {
    return convertDirectory("project-docs", "project-docs");
}

// Step 2 (skill 02) — classify files still located at root project-docs/ into exactly one of the 6 folders
async function step2_classify() {
    const skill = await loadSkill("02_doc_classification.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const unclassified = listing.files.filter(f => !FOLDERS.some(folder => f.path.includes(`/${folder}/`)));
    if (unclassified.length === 0) return { moved: [] };

    const contents = {};
    for (const f of unclassified) {
        const r = await runTool("read_file", { path: f.path });
        contents[f.path] = r.content.slice(0, 1000); // only take the first 1000 characters to classify, no need to read the whole file
    }
    const raw = await askLLM(skill,
        `document_list=${JSON.stringify(unclassified.map(f => f.path))}\ndocument_contents=${JSON.stringify(contents)}\n` +
        `Return only a JSON object in the format { "tenFile.md": "02_BA/tenFile.md", ... } — DO NOT write anything outside the JSON.`);
    const mapping = JSON.parse(raw);

    const moved = [];
    for (const [from, to] of Object.entries(mapping)) {
        await mkdir(path.dirname(to), { recursive: true });
        await rename(from, to);
        moved.push([from, to]);
    }
    return { moved };
}

// Step 3 (skill 03) — cross-check, detect gaps/contradictions
async function step3_gapCheck() {
    const skill = await loadSkill("03_info_gap_reporting.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const raw = await askLLM(skill,
        `classified_documents=${JSON.stringify(listing.files.map(f => f.path))}\n` +
        `Tra ve dung 1 JSON object: {"hasGap": bool, "reportMarkdown": string} — reportMarkdown la Bao cao theo dung format skill da mo ta.`);
    return JSON.parse(raw);
}

// Human-Final stop point used for both initial gaps and intermediate ASK
async function pauseForHuman(reportMarkdown) {
    await runTool("write_file", { path: ".state/gap-report.md", content: reportMarkdown });
    return { status: "waiting_input", data: { formPath: ".state/gap-report.md" }, error: null };
}

// Step 4 (skill 04) — Generate task assignment, write to file Leader can write
async function step4_assignTask(task) {
    const skill = await loadSkill("04_task_assignment.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const content = await askLLM(skill,
        `validated_documents=${JSON.stringify(listing.files.map(f => f.path))}\n` +
        `qa_analyst_name=QA Analyst Agent\ntask_scope=${task}`);
    await runTool("write_file", { path: ".state/task-assignment.md", content });
}

// Step 5 (skill 05) — review deliverable of Analyst by FACT framework, make decision
async function step5_review(round) {
    const skill = await loadSkill("05_deliverable_review.md");
    const deliverable = await runTool("read_file", { path: ".state/deliverable.md" });
    const raw = await askLLM(skill,
        `deliverable_content=${deliverable.content}\nround=${round}\n` +
        `Return only a JSON object: {"verdict": "PASS"|"FIX"|"ASK", "reportMarkdown": string}`,
        FACT + "\n\n" + CONVENTIONS);
    return JSON.parse(raw);
}

// Step 6 (skill 06) — track progress, called after each milestone
async function step6_trackProgress(stage, note) {
    const skill = await loadSkill("06_workflow_progress_tracking.md");
    const content = await askLLM(skill, `workflow_stage=${stage}\nnote=${note}`);
    await runTool("write_file", { path: ".state/progress-report.md", content });
}

export async function run({ task, formAnswers = null }) {
    const listing = await runTool("list_files", { dir: "project-docs" });
    if (listing.files.length === 0) {
        return { status: "not_started", data: null, error: "project-docs/ is empty. Please add documents and try again." };
    }

    await step1_convert();
    await step2_classify();

    if (!formAnswers) {
        const { hasGap, reportMarkdown } = await step3_gapCheck();
        if (hasGap) return pauseForHuman(reportMarkdown);
    }

    await step4_assignTask(task + (formAnswers ? `\n\nUser confirmed:\n${formAnswers}` : ""));
    await step6_trackProgress("Task Assignment Done", "Task assigned to QA Analyst");

    for (let round = 1; round <= MAX_ROUNDS; round++) {
        const analystOut = await runAnalyst({ taskFile: ".state/task-assignment.md" });
        if (analystOut.status !== "success") return analystOut;

        const { verdict, reportMarkdown } = await step5_review(round);
        if (verdict === "ASK") return pauseForHuman(reportMarkdown);

        if (verdict === "PASS") {
            await step6_trackProgress("Completed", `PASS sau ${round} vong.`);
            return { status: "success", data: { rounds: round }, error: null };
        }

        // FIX — write feedback to task-assignment.md (do not create new file), call Analyst again
        const current = await runTool("read_file", { path: ".state/task-assignment.md" });
        await runTool("write_file", { path: ".state/task-assignment.md", content: current.content + `\n\n## Feedback vong ${round} (FIX)\n${reportMarkdown}` });
    }

    await step6_trackProgress("Blocked", `Exceeded ${MAX_ROUNDS} FIX rounds — need human review.`);
    return { status: "error", data: null, error: `Exceeded ${MAX_ROUNDS} FIX rounds — need human review.` };
}