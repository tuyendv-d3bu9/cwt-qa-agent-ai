// agents/qa-analyst/index.js
// Node: QA Analyst —  requirement analyst , NOT decide source of conflict.

import { readFile } from "node:fs/promises";
import { runTool, declarationsFor } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { runAgentLoop, fileToolExecutor } from "../runtime/agent-loop.js";
import { contextFor } from "../runtime/knowledge.js";
import { verifyDeliverable, checkSummary, checkMissingRules, checkViewpoints } from "./tools/count-check.js";
import { normalizeSection } from "./tools/section-normalizer.js";
import * as P from "../runtime/paths.js";

// READ-ONLY tool set. This node analyses requirements; it has no business writing,
// moving or deleting anything — its single output is written by run() at the end, by
// code, not by the model. declarationsFor() throws on an unknown name so a typo cannot
// silently hand the agent fewer capabilities than intended.
const ANALYST_TOOLS = ["list_files", "read_file", "file_exists"];
const analystTools = declarationsFor(ANALYST_TOOLS);
const execute = fileToolExecutor(runTool, ANALYST_TOOLS);

// Cost of the last run(), printed at the end — measured, never claimed. See the MEASURED
// note on seedDocuments() below for why that distinction earned its keep.
const stats = { llmCalls: 0, toolCalls: 0, revisions: 0, promptTokens: 0, outputTokens: 0 };

/**
 * Below this many characters, the whole document corpus goes into the prompt up front.
 *
 * MEASURED, 2026-08-19, on this repo's project-docs (29,253 chars ≈ 8.4k tokens):
 *   stuff-everything-in-one-prompt :  1 LLM call,   ~8.4k prompt tokens
 *   listing-only + let it explore  : 15 LLM calls, 138.9k prompt tokens  ← 16.6x MORE
 *
 * The comment that used to sit here claimed the tool version "reads LESS". It does read
 * fewer BYTES OF FILE, and that is irrelevant: a tool loop re-sends the ENTIRE
 * conversation every iteration, so everything read so far is paid for again on each turn —
 * cost grows quadratically in the number of steps. On a corpus small enough to fit in one
 * prompt, exploring it one file at a time is simply worse.
 *
 * So tools are not the point here; being ABLE TO GO BACK is. Seeding the corpus makes the
 * common case one call, and the small step budget leaves room for the genuine
 * "I found a reference to something I have not read" case. Above the threshold the seed is
 * dropped and the agent must explore, because then the corpus no longer fits at all.
 */
const SEED_CORPUS_LIMIT = 200_000;

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

const systemFor = (skillText, userText) =>
    // Tier 2 is QUERIED, not injected — see memory/README.md and knowledge.js.
    [ROLE, FACT, DELIVERY_RULES, CONVENTIONS, contextFor(userText), skillText].filter(Boolean).join("\n\n");

async function askLLM(skillText, userText) {
    const res = await callLLM({
        system: systemFor(skillText, userText),
        contents: [{ role: "user", parts: [{ text: userText }] }],
    });
    stats.llmCalls++;
    stats.promptTokens += res.usage?.promptTokenCount ?? 0;
    stats.outputTokens += res.usage?.candidatesTokenCount ?? 0;
    return res.text;
}

/**
 * One step of analysis, as an AGENT rather than a prompt.
 *
 * `tools` lets it fetch what it decides it needs; `selfCheck` is a deterministic gate whose
 * failure is fed back so it revises. Both were absent before: this node made 4 blind
 * single-shot calls, and its count-check result was written into section 4 of the
 * deliverable as a note for a human — the model that produced the shortfall never saw it.
 */
async function agentStep({ skillText, userText, tools = [], selfCheck, label, maxSteps, sectionNo }) {
    // Trim before the gate, not after: a skill that pasted section 2 into section 1 would
    // otherwise SATISFY the section-1 gate using material that belongs elsewhere. That is
    // exactly how the 44KB triplicated deliverable passed every count check.
    const gate = selfCheck && sectionNo
        ? (text) => selfCheck(normalizeSection(text, sectionNo).text)
        : selfCheck;

    const out = await runAgentLoop({
        system: systemFor(skillText, userText),
        task: userText,
        tools,
        execute: tools.length ? execute : undefined,
        selfCheck: gate,
        maxSteps,
        label,
    });

    stats.llmCalls += out.usage.llmCalls;
    stats.toolCalls += out.toolCalls.length;
    stats.revisions += out.revisions;
    stats.promptTokens += out.usage.promptTokens;
    stats.outputTokens += out.usage.outputTokens;

    // Budget exhausted is reported, never swallowed. The text is still returned — a
    // partial answer plus a loud warning beats silently pretending the gate passed.
    if (!out.ok) {
        console.warn(`  [qa-analyst/${label}] CHƯA ĐẠT (hết ngân sách: ${out.exhausted}) — ${out.issues.join(" ")}`);
    }

    if (!sectionNo) return out.text;

    const { text, removed } = normalizeSection(out.text, sectionNo);
    // Announced, never silent: a trim means a skill ignored its declared scope, and that is
    // a fact about the skill worth seeing rather than quietly cleaning up after.
    for (const r of removed) console.warn(`  [qa-analyst/${label}] đã cắt: ${r}`);
    return text;
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

/**
 * Build the opening context for step 1: always the file listing, plus the contents when
 * the corpus is small enough to be worth sending (see SEED_CORPUS_LIMIT).
 *
 * The LISTING matters on its own. In the first real run the model spent 5 of its 12 tool
 * calls on `file_exists`, probing for paths it was guessing at, because it had been told
 * only that a "project-docs" folder existed. Handing it the actual tree costs one cheap
 * deterministic call and removes the guessing entirely.
 */
async function seedDocuments() {
    const listing = await runTool("list_files", { dir: "project-docs" });
    const paths = (listing.files ?? []).map(f => f.path);
    const total = (listing.files ?? []).reduce((n, f) => n + (f.size_bytes ?? 0), 0);

    if (total > SEED_CORPUS_LIMIT) {
        return {
            seeded: false,
            text:
                `project_docs_files=${JSON.stringify(paths)}\n` +
                `Bộ tài liệu quá lớn (${total} byte) để gửi kèm hết. Dùng read_file để đọc ĐÚNG file cần.\n`,
        };
    }

    const contents = {};
    for (const p of paths) {
        const r = await runTool("read_file", { path: p });
        if (!r.error) contents[p] = r.content;
    }
    return {
        seeded: true,
        text:
            `project_docs_files=${JSON.stringify(paths)}\n` +
            `doc_contents=${JSON.stringify(contents)}\n` +
            `Toàn bộ tài liệu đã gửi kèm ở trên — KHÔNG cần gọi read_file cho chúng nữa.\n` +
            `Chỉ dùng tool khi phát hiện cần một file CHƯA có trong danh sách trên.\n`,
    };
}

// First run (no FIX feedback) — skill 01 -> 02 -> 03
async function runFullAnalysis(task) {
    // Step 1 gets the corpus up front AND keeps tools. The old version could only have the
    // former (blind, no way to fetch anything else); the first agentic version had only the
    // latter and cost 16.6x more. Both, with a small step budget, is the cheap case by
    // default and still able to go back when it genuinely needs to.
    const seed = await seedDocuments();
    const summary = await agentStep({
        skillText: await loadSkill("01_requirement_summary.md"),
        userText: `task=${task}\n\n${seed.text}`,
        // NO TOOLS when the corpus is already in the prompt. Measured, in this order:
        //   listing only + tools, 12 steps : 15 calls, 138.9k tokens, budget exhausted
        //   seeded      + tools,  4 steps :  7 calls, 100.5k tokens, budget exhausted
        //   seeded      + no tools        :  the corpus is complete; nothing to fetch
        // With tools in hand the model kept calling them even though every document was
        // already in the prompt, because role.md line 8 says "Đọc tài liệu liên quan trong
        // project-docs/". That line describes this node's PERMISSIONS, but a model holding
        // a read_file tool reads it as an instruction to go and read. Removing the tools
        // removes the contradiction — cleaner than trying to out-word role.md, and correct:
        // when the whole corpus is present there is genuinely nothing to go back for.
        // Tools stay available in the large-corpus branch, where exploring is the only option.
        tools: seed.seeded ? [] : analystTools,
        label: "01_summary",
        sectionNo: 1,
        maxSteps: seed.seeded ? 0 : 14,
        selfCheck: (text) => checkSummary(text),
    });

    const missingRules = await agentStep({
        skillText: await loadSkill("02_missing_rule_finder.md"),
        userText: `requirement_summary=${summary}`,
        selfCheck: (text) => checkMissingRules(text),
        label: "02_missing_rules",
        sectionNo: 2,
    });

    const viewpoints = await agentStep({
        skillText: await loadSkill("03_viewpoint_and_testidea.md"),
        userText: `requirement_summary=${summary}\nmissing_rules=${missingRules}`,
        selfCheck: (text) => checkViewpoints(text),
        label: "03_viewpoints",
        sectionNo: 3,
    });

    const check = verifyDeliverable({ summaryMarkdown: summary, missingRulesMarkdown: missingRules, viewpointsMarkdown: viewpoints });

    return assembleDeliverable({ summary, missingRules, viewpoints, check });
}

// REVISION LOOP — only fix the points Leader points out, do not run from the beginning
async function runRevision(task) {
    const skill4 = await loadSkill("04_revise_on_feedback.md");
    const prev = await runTool("read_file", { path: P.DELIVERABLE_ANALYST });
    const feedback = task.split(/(?=##\s*Feedback\s*(?:round|vòng|vong))/i).pop();
    const rawRevised = await askLLM(skill4, `feedback=${feedback}\nprevious_deliverable=${prev.content}`);
    return updateCountCheck(rawRevised);
}

// Handover contract (memory/README.md rule 3). The workflow checks `requires`
// before calling run(), so a missing input fails here with a clear message instead
// of deep inside an LLM call.
// `inputs` maps a run() PARAMETER NAME to a paths.js export name, so
// agents/runtime/node-registry.js can call this node without knowing anything about it
// (P7.1). Without it the workflow has to hardcode `run({ taskFile: ... })` by hand, which
// is why the flow order used to live in a 282-line script.
export const CONTRACT = {
    agent: "qa-analyst",
    requires: [P.TASK_ASSIGNMENT],
    produces: [P.DELIVERABLE_ANALYST],
    inputs: { taskFile: "TASK_ASSIGNMENT" },
};

export async function run({ taskFile }) {
    for (const k of Object.keys(stats)) stats[k] = 0;

    const task = await runTool("read_file", { path: taskFile });
    const isRevision = /(?:##\s*Feedback\s*(?:round|vòng|vong))/i.test(task.content);

    const deliverable = isRevision
        ? await runRevision(task.content)
        : await runFullAnalysis(task.content);

    await runTool("write_file", { path: P.DELIVERABLE_ANALYST, content: deliverable });

    console.log(
        `  Chi phí: ${stats.llmCalls} LLM call, ${stats.toolCalls} tool call, ` +
        `${stats.revisions} lần tự sửa; token vào ${stats.promptTokens}, ra ${stats.outputTokens}.`
    );

    return {
        status: "success",
        data: { deliverableFile: P.DELIVERABLE_ANALYST, cost: { ...stats } },
        error: null,
    };
}