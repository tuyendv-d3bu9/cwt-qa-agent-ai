// agents/qa-leader/index.js
// Node: QA Leader — coordinator of its skills (02..06), does not analyze requirements itself.
// Leader only does its own steps (setup + review). Orchestration loop lives in the workflow.

// node:fs is used ONLY to load this node's own static role/knowledge/skill files at
// module load time. Every dynamic path (anything derived from LLM output or pipeline
// data) goes through runTool() so tools.js's safe() containment check applies.
import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { runAgentLoop } from "../runtime/agent-loop.js";
import { convertDirectory } from "./tools/convert-to-md.js";
import { hashProjectDocsPerFile, diffManifest } from "./tools/project-docs-hash.js";
import { storeKnowledgeSection, flagKnowledgeFromRemovedSource } from "./tools/project-knowledge-store.js";
import { putTerm, putComponent, putField, putConfig, getConfig } from "../runtime/knowledge.js";
import { computeImpact, renderImpactReport } from "./tools/impact-analysis.js";
import { listRuns, stepsOfRun } from "../runtime/memory.js";
import { superviseRuns, renderDashboard } from "./tools/run-supervisor.js";
import { parseUiFlows } from "./tools/ui-flow-parser.js";
import { checkGapReportFormat } from "./tools/gap-report-check.js";
import { createHash } from "node:crypto";
import { skillDocsText } from "../runtime/skill-docs.js";
import * as P from "../runtime/paths.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
// Tier 1 first, then this node's own layer on top. The private file explicitly says
// "see memory/semantic/fact-framework.md for the full definition" — but that file was
// never loaded, so the prompt pointed the LLM at something it could not read.
const FACT_SHARED = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const FACT_LEADER = await readFile(new URL("./knowledge/fact-framework-leader.md", import.meta.url), "utf8");
const FACT = [FACT_SHARED, FACT_LEADER].join("\n\n");
const CONVENTIONS = await readFile(new URL("./knowledge/task-management-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

// `skillDocsText` nạp mọi tài liệu mà CHÍNH skill đó nói là nó dùng, suy ra từ văn bản skill.
// Ở node này nó bù đúng một chỗ hụt: `02b_project_knowledge_distillation.md` nhắc
// `memory/semantic/testing-conventions.md` mà askLLM chưa bao giờ nạp file đó — prompt chỉ
// model tới một quy ước nó không đọc được. Cùng loại lỗi đã ghi ở dòng 23–25 phía trên.
async function systemFor(skillText, extraKnowledge = "") {
    const base = [ROLE, extraKnowledge].filter(Boolean);
    const refs = await skillDocsText(skillText, { agentDir: "agents/qa-leader", already: base });
    return [...base, refs.text, skillText].filter(Boolean).join("\n\n");
}

async function askLLM(skillText, userText, extraKnowledge = "") {
    const res = await callLLM({
        system: await systemFor(skillText, extraKnowledge),
        contents: [{ role: "user", parts: [{ text: userText }] }],
    });
    return res.text;
}

/**
 * Strip markdown code fences (```json ... ```) that the LLM may wrap around JSON.
 *
 * Returns null on unparseable output instead of throwing. This used to throw — the only
 * one of the five parseJSON copies in this repo that did — so a single malformed LLM
 * response took down the whole run from inside a helper, with no indication of WHICH of
 * the five call sites produced it. Every caller now has to decide what a failed parse
 * means, which is the point: for step2_classify a null means "move nothing", not "move
 * files according to garbage".
 */
function parseJSON(raw, what = "LLM output") {
    const cleaned = String(raw ?? "").replace(/^```[\w]*\n?/m, "").replace(/```\s*$/m, "").trim();
    try {
        return JSON.parse(cleaned);
    } catch (err) {
        console.error(`  [parseJSON] ${what}: không parse được JSON (${err.message}). 200 ký tự đầu: ${cleaned.slice(0, 200)}`);
        return null;
    }
}

// Step 1 (skill 01) — standardize formats, DO NOT use LLM (deterministic tool)
async function step1_convert() {
    return convertDirectory("project-docs");
}

/** Split a path on either separator — list_files returns OS-native paths (backslashes on Windows). */
const segments = (p) => String(p).split(/[\\/]+/).filter(Boolean);

/**
 * A document is "already classified" when it sits in a subdirectory of the source
 * directory rather than at its root.
 *
 * This replaces a hardcoded list of 6 folder names, which was wrong twice over:
 *   - it compared with `path.includes("/01_Business/")` while list_files returns
 *     OS-native paths, so on Windows NOTHING ever matched;
 *   - the literals had drifted from the real folders on disk (`03_Dev` vs `03_DEV`,
 *     `04_Design` vs `04_Design`).
 * Combined, every already-filed document was treated as unfiled, so each run
 * re-classified the whole corpus with the LLM and moved every file again.
 *
 * Deriving it also satisfies the genericity rule in memory/README.md: the folder
 * taxonomy is project data, and another project may organise documents differently.
 */
function isClassified(filePath, sourceDir) {
    const parts = segments(filePath);
    return parts[0] === sourceDir && parts.length > 2;
}

/** Category folders this project actually uses, read off the real directory tree. */
function existingFolders(files, sourceDir) {
    const folders = new Set();
    for (const f of files) {
        const parts = segments(f.path);
        if (parts[0] === sourceDir && parts.length > 2) folders.add(parts[1]);
    }
    return [...folders].sort();
}

// Step 2 (skill 02) — file documents sitting at the root of the source directory into
// one of the category folders that project already uses.
async function step2_classify(sourceDir = "project-docs") {
    const skill = await loadSkill("02_doc_classification.md");
    const listing = await runTool("list_files", { dir: sourceDir });
    const unclassified = listing.files.filter(f => !isClassified(f.path, sourceDir));
    if (unclassified.length === 0) return { moved: [], skipped: [], folders: existingFolders(listing.files, sourceDir) };

    const folders = existingFolders(listing.files, sourceDir);
    const contents = {};
    for (const f of unclassified) {
        const r = await runTool("read_file", { path: f.path });
        contents[f.path] = r.content.slice(0, 1000); // only first 1000 chars to classify
    }
    const raw = await askLLM(skill,
        `document_list=${JSON.stringify(unclassified.map(f => f.path))}\ndocument_contents=${JSON.stringify(contents)}\n` +
        `available_folders=${JSON.stringify(folders)}\n` +
        `Chỉ được chọn thư mục đích trong available_folders — KHÔNG tự tạo tên thư mục mới, KHÔNG tự sửa chính tả tên thư mục.\n` +
        `Return ONLY a raw JSON object (no markdown, no code block) mapping source path -> destination path, e.g. { "${sourceDir}/tenFile.md": "${sourceDir}/${folders[0] ?? "01_Business"}/tenFile.md", ... }`);
    const mapping = parseJSON(raw, "step2_classify (bảng phân loại tài liệu)");
    if (!mapping || typeof mapping !== "object") {
        // Moving nothing is the safe failure: the files stay where they are and the next
        // run tries again. Proceeding would mean renaming the user's documents based on
        // output we could not even parse.
        return { moved: [], skipped: unclassified.map(f => [f.path, null, "LLM trả về JSON không hợp lệ"]) };
    }

    // `to` comes from LLM output, so it must not reach the filesystem unchecked:
    // runTool("move_file") validates BOTH ends through tools.js's safe(). The prefix
    // normalisation below only fixes the common "project-docs/project-docs/x.md"
    // duplication — it is NOT the security boundary (a "../" left inside `stripped`
    // is what safe() is there to reject).
    const moved = [];
    const skipped = [];
    const dupPrefix = new RegExp(`^(${sourceDir}[\\\\/])+`);
    for (const [from, to] of Object.entries(mapping)) {
        const stripped = to.replace(dupPrefix, "");
        const dest = `${sourceDir}/${stripped}`;
        const res = await runTool("move_file", { from, to: dest });
        if (res.error) {
            console.error(`  [classify] bỏ qua "${from}" -> "${dest}": ${res.error}`);
            skipped.push([from, dest, res.error]);
            continue;
        }
        moved.push([from, dest]);
    }
    return { moved, skipped };
}

const MANIFEST_PATH = P.MANIFEST;
const IMPACT_REPORT_PATH = P.IMPACT_REPORT;
const VALID_KINDS = new Set(["domain", "issue", "decision"]);
const VALID_STATUSES = new Set(["confirmed", "pending"]);
const COMPONENT_KINDS = new Set(["page", "api", "module", "screen", "service"]);

/**
 * Deterministic gate on the LLM's distillation output — no fact reaches the DB
 * without a source_file pointing at a document we actually just fed it. This is the
 * Testable half of the FACT framework enforced in code rather than trusted to the
 * prompt: an unsourced "fact" cannot be traced back by a reviewer, so it is dropped.
 */
function validateFacts(facts, allowedSources) {
    const accepted = [];
    const rejected = [];
    for (const fact of Array.isArray(facts) ? facts : []) {
        const why = [];
        if (!VALID_KINDS.has(fact?.kind)) why.push(`kind không hợp lệ: ${JSON.stringify(fact?.kind)}`);
        if (!VALID_STATUSES.has(fact?.status)) why.push(`status không hợp lệ: ${JSON.stringify(fact?.status)}`);
        if (!fact?.title?.trim()) why.push("thiếu title");
        if (!fact?.content?.trim()) why.push("thiếu content");
        if (!fact?.source_file) why.push("thiếu source_file");
        else if (!allowedSources.has(fact.source_file)) why.push(`source_file không nằm trong danh sách file đã đổi: ${fact.source_file}`);

        if (why.length) rejected.push({ fact, why });
        else accepted.push(fact);
    }
    return { accepted, rejected };
}

/** Deterministic gate for tier-2 rows — same reasoning as validateFacts(). */
function validateReferences(parsed, allowedSources) {
    const ok = { terms: [], components: [], fields: [], config: [] };
    const rejected = [];
    const sourced = (row) => row?.source_ref && allowedSources.has(row.source_ref);

    for (const row of parsed?.terms ?? []) {
        if (row?.term?.trim() && row?.definition?.trim() && sourced(row)) ok.terms.push(row);
        else rejected.push({ type: "term", row });
    }
    for (const row of parsed?.components ?? []) {
        if (row?.name?.trim() && COMPONENT_KINDS.has(row?.kind) && sourced(row)) ok.components.push(row);
        else rejected.push({ type: "component", row });
    }
    for (const row of parsed?.fields ?? []) {
        if (row?.name?.trim() && sourced(row)) ok.fields.push(row);
        else rejected.push({ type: "field", row });
    }
    for (const row of parsed?.config ?? []) {
        if (row?.key?.trim() && row?.value != null && sourced(row)) ok.config.push(row);
        else rejected.push({ type: "config", row });
    }
    return { ok, rejected };
}

/** Read only the documents that actually changed. */
async function readChangedDocs(files) {
    const contents = {};
    for (const file of files) {
        const r = await runTool("read_file", { path: file });
        if (r.error) {
            console.error(`  [distill] không đọc được ${file}: ${r.error}`);
            continue;
        }
        contents[file] = r.content;
    }
    return contents;
}

// Step 2b — update project knowledge for the documents that CHANGED.
//
// Two destinations, per memory/README.md:
//   tier 3 (skill 02b) — memory/project/*.md, ONE SECTION per fact, replaced in place.
//                        The user's hand edits elsewhere in the file survive untouched.
//   tier 2 (skill 02c) — terms/components/fields/config rows, queried on demand
//                        instead of injected into every prompt.
//
// Per-file hashes (tools/project-docs-hash.js vs memory/project/manifest.json) decide
// what is sent to the LLM: a document that did not change costs nothing and its
// knowledge is not rewritten.
//
// Does NOT touch memory/project/glossary.md — see memory/README.md (tier 1 vs tier 2).
async function step2b_updateProjectKnowledge() {
    const currentHashes = await hashProjectDocsPerFile("project-docs");
    const manifestRes = await runTool("read_json", { path: MANIFEST_PATH });
    const previous = manifestRes.error ? null : manifestRes.data?.files;

    const { added, changed, removed, unchangedCount } = diffManifest(previous, currentHashes);
    const toUpdate = [...added, ...changed];

    if (toUpdate.length === 0 && removed.length === 0) {
        return { updated: false, reason: "tài liệu dự án không đổi kể từ lần cập nhật trước", unchangedCount };
    }

    // A deleted source document does NOT delete knowledge — the user may have edited
    // those sections by hand. They get flagged for a human to decide instead.
    const flagged = [];
    for (const file of removed) {
        flagged.push({ file, affected: flagKnowledgeFromRemovedSource(file) });
    }

    const sections = { inserted: 0, updated: 0, unchanged: 0 };
    const reference = { terms: 0, components: 0, fields: 0, config: 0 };
    let rejectedFacts = [];
    let rejectedRefs = [];

    if (toUpdate.length > 0) {
        const contents = await readChangedDocs(toUpdate);
        const allowed = new Set(Object.keys(contents));
        const userText =
            `changed_documents=${JSON.stringify(Object.keys(contents))}\n` +
            `documents_content=${JSON.stringify(contents)}`;

        // ── tier 3: volatile knowledge as markdown sections ──────────────
        const factsRaw = await askLLM(await loadSkill("02b_project_knowledge_distillation.md"), userText);
        const factValidation = validateFacts(parseJSON(factsRaw)?.facts, allowed);
        rejectedFacts = factValidation.rejected;
        for (const { fact, why } of rejectedFacts) {
            console.error(`  [tier3] BỎ mục "${fact?.title ?? "(không title)"}": ${why.join("; ")}`);
        }
        for (const fact of factValidation.accepted) {
            const res = await storeKnowledgeSection({
                kind: fact.kind,
                status: fact.status,
                title: fact.title.trim(),
                content: fact.content.trim(),
                sourceFile: fact.source_file,
                sourceHash: currentHashes[fact.source_file] ?? null,
            });
            sections[res.action]++;
        }

        // ── tier 2: stable reference knowledge as queryable rows ─────────
        const refsRaw = await askLLM(await loadSkill("02c_reference_extraction.md"), userText);
        const refValidation = validateReferences(parseJSON(refsRaw), allowed);
        rejectedRefs = refValidation.rejected;
        for (const { type, row } of rejectedRefs) {
            console.error(`  [tier2] BỎ ${type} "${row?.term ?? row?.name ?? row?.key ?? "(?)"}": thiếu trường bắt buộc hoặc source_ref không hợp lệ`);
        }
        for (const row of refValidation.ok.terms) {
            putTerm({ term: row.term, definition: row.definition, aliases: row.aliases ?? [], sourceRef: row.source_ref });
            reference.terms++;
        }
        for (const row of refValidation.ok.components) {
            putComponent({ name: row.name, kind: row.kind, ref: row.ref ?? null, description: row.description ?? null, sourceRef: row.source_ref });
            reference.components++;
        }
        for (const row of refValidation.ok.fields) {
            putField({ name: row.name, component: row.component ?? null, dataType: row.data_type ?? null, constraints: row.constraints ?? null, notes: row.notes ?? null, sourceRef: row.source_ref });
            reference.fields++;
        }
        for (const row of refValidation.ok.config) {
            putConfig({ key: row.key, value: row.value, description: row.description ?? null, sourceRef: row.source_ref });
            reference.config++;
        }
    }

    // ── Impact analysis (H.3/H.4) ─────────────────────────────────────
    // Which knowledge sections, test cases and specs are now out of date. The SET is
    // found deterministically from the graph; the LLM only explains it. Skipped
    // entirely when nothing changed (added-only runs invalidate nothing downstream).
    const stamp = new Date().toISOString();
    const impact = computeImpact({ added, changed, removed });
    let impactReport = renderImpactReport(impact, stamp);

    if (impact.sources.length > 0) {
        const changedDocs = await readChangedDocs(changed);
        const explainRaw = await askLLM(await loadSkill("02d_change_impact_analysis.md"),
            `changed_documents=${JSON.stringify(impact.sources)}\n` +
            `documents_diff_summary=${JSON.stringify(changedDocs)}\n` +
            `impact_data=${JSON.stringify({ total: impact.total, byKind: impact.byKind, affected: impact.affected })}`);
        // The deterministic table stays; the explanation is appended to it, never
        // replaces it — so a bad LLM turn cannot lose the factual part.
        impactReport += `\n## 4. Diễn giải (LLM, dựa trên đúng danh sách trên)\n\n${explainRaw.trim()}\n`;
    }

    await runTool("write_file", { path: IMPACT_REPORT_PATH, content: impactReport });

    await runTool("write_json", {
        path: MANIFEST_PATH,
        data: { files: currentHashes, updatedAt: stamp },
    });

    return {
        updated: true,
        changedFiles: { added, changed, removed },
        unchangedCount,
        sections,
        reference,
        rejected: { facts: rejectedFacts.length, references: rejectedRefs.length },
        flagged,
        impact: { total: impact.total, byKind: impact.byKind, reportFile: IMPACT_REPORT_PATH },
    };
}

// Step 3 (skill 03) — cross-check, detect gaps/contradictions
/**
 * Gate for step 3's output (P11). Deterministic, no LLM.
 *
 * Two layers: the JSON envelope here, the gap-report FORMAT in
 * `tools/gap-report-check.js` (which is where it can be tested without an LLM).
 */
function checkGapReport(raw) {
    const parsed = parseJSON(raw, "step3_gapCheck (gate định dạng)");
    if (!parsed || typeof parsed.hasGap !== "boolean") {
        return { ok: false, issues: [`Phải trả về JSON {"hasGap": bool, "reportMarkdown": string}.`] };
    }
    // hasGap=false: không có câu hỏi nào thì không có gì phải định dạng.
    if (parsed.hasGap === false) return { ok: true, issues: [] };
    return checkGapReportFormat(parsed.reportMarkdown);
}

async function step3_gapCheck() {
    const skill = await loadSkill("03_info_gap_reporting.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const userText =
        `classified_documents=${JSON.stringify(listing.files.map(f => f.path))}\n` +
        `Return ONLY a raw JSON object (no markdown, no code block): {"hasGap": bool, "reportMarkdown": string}`;

    const loop = await runAgentLoop({
        system: await systemFor(skill),
        task: userText,
        label: "gap-check",
        maxRevisions: 2,
        selfCheck: (text) => checkGapReport(text),
    });
    if (!loop.ok) {
        console.warn(`  [qa-leader/gap-check] CHƯA ĐẠT (${loop.exhausted}) — ${loop.issues.join(" ")}`);
    }
    const raw = loop.text;
    const parsed = parseJSON(raw, "step3_gapCheck (rà soát mâu thuẫn tài liệu)");
    if (!parsed || typeof parsed.hasGap !== "boolean") {
        // Unreadable gap check => treat as A GAP, never as "tài liệu nhất quán".
        // Same rule as verdict-combiner's "ảnh không đọc được -> UNCLEAR, không phải PASSED":
        // a signal we cannot read must escalate to a human, never grant approval.
        return {
            hasGap: true,
            reportMarkdown:
                `### Không đọc được kết quả rà soát tài liệu\n\n` +
                `Bước rà soát mâu thuẫn/thiếu hụt đã chạy nhưng **kết quả trả về không parse được**, ` +
                `nên KHÔNG thể kết luận tài liệu đã nhất quán.\n\n` +
                `Đây được coi là **có gap** một cách có chủ ý: coi là "không có gap" sẽ để cả pipeline ` +
                `chạy tiếp dựa trên giả định chưa từng được kiểm.\n\n` +
                `**Cần làm:** chạy lại bước này. Nếu vẫn lỗi, xem log \`[parseJSON] step3_gapCheck\` ` +
                `để biết LLM đã trả về gì.\n`,
        };
    }
    return parsed;
}

// Step 4 (skill 04) — Generate task assignment, write to P.TASK_ASSIGNMENT
async function step4_assignTask(task) {
    const skill = await loadSkill("04_task_assignment.md");
    const listing = await runTool("list_files", { dir: "project-docs" });
    const content = await askLLM(skill,
        `validated_documents=${JSON.stringify(listing.files.map(f => f.path))}\n` +
        `qa_analyst_name=QA Analyst Agent\ntask_scope=${task}`);
    await runTool("write_file", { path: P.TASK_ASSIGNMENT, content });
}

// ─────────────────────────────────────────────
// PUBLIC EXPORTS — called by the workflow, not by other agents
// ─────────────────────────────────────────────

// Handover contract (P7.1). qa-leader was the ONE node without a CONTRACT, which meant a
// generic runner could not include it in a declarative flow at all.
//
// Two things are unusual here and both are declared rather than special-cased in the runner:
//   `entry: "runSetup"` — this node has five public functions (runSetup, runReview,
//   trackProgress, distillUiFlows, supervise), not one `run`. The flow file picks the
//   entry it wants; "runSetup" is the pipeline's starting point.
//   `requires: []`  — its input is the task STRING, not a file. Nothing to check on disk.
//
// `produces` lists TASK_ASSIGNMENT only. runSetup can also legitimately end at
// `waiting_input` having written GAP_REPORT instead — that is not a broken promise, so
// flow-runner.js checks `produces` only for statuses that mean "finished".
export const CONTRACT = {
    agent: "qa-leader",
    entry: "runSetup",
    requires: [],
    produces: [P.TASK_ASSIGNMENT],
    inputs: {},
};

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
    await step2b_updateProjectKnowledge();

    if (!formAnswers) {
        const { hasGap, reportMarkdown } = await step3_gapCheck();
        if (hasGap) {
            await runTool("write_file", { path: P.GAP_REPORT, content: reportMarkdown });
            return { status: "waiting_input", data: { formPath: P.GAP_REPORT }, error: null };
        }
    }

    await step4_assignTask(task + (formAnswers ? `\n\nUser confirmed:\n${formAnswers}` : ""));
    return { status: "ready", data: { taskFile: P.TASK_ASSIGNMENT }, error: null };
}

/**
 * runReview — Step 5: review analyst deliverable by FACT framework.
 * Returns: { verdict: "PASS" | "FIX" | "ASK", reportMarkdown: string }
 */
export async function runReview({ round }) {
    const skill = await loadSkill("05_deliverable_review.md");
    const deliverable = await runTool("read_file", { path: P.DELIVERABLE_ANALYST });
    const raw = await askLLM(skill,
        `deliverable_content=${deliverable.content}\nround=${round}\n` +
        `Return only a JSON object: {"verdict": "PASS"|"FIX"|"ASK", "reportMarkdown": string}`,
        FACT + "\n\n" + CONVENTIONS);
    const parsed = parseJSON(raw, "runReview (verdict PASS/FIX/ASK)");
    const VERDICTS = new Set(["PASS", "FIX", "ASK"]);
    if (!parsed || !VERDICTS.has(parsed.verdict)) {
        // A verdict we cannot read becomes ASK, not PASS and not FIX.
        // Before this, null fell through runRoundLoop's checks (`=== "ASK"` false,
        // `=== "PASS"` false) and was treated as FIX — so an unparseable review silently
        // burned all MAX_ROUNDS retries, each one a full analyst + review LLM pass.
        return {
            verdict: "ASK",
            reportMarkdown:
                `### Không đọc được verdict của bước review\n\n` +
                `Review đã chạy nhưng verdict trả về không hợp lệ ` +
                `(nhận được: ${JSON.stringify(parsed?.verdict)}).\n\n` +
                `Được coi là **ASK** có chủ ý — verdict quyết định pipeline làm gì tiếp, nên khi ` +
                `không đọc được thì phải dừng cho người xem, không tự chọn PASS (bỏ qua lỗi thật) ` +
                `cũng không tự chọn FIX (đốt hết số vòng retry mà không ai biết vì sao).\n`,
        };
    }
    return parsed;
}

/**
 * trackProgress — Step 6: write progress report after each milestone.
 */
export async function trackProgress(stage, note) {
    const skill = await loadSkill("06_workflow_progress_tracking.md");
    const content = await askLLM(skill, `workflow_stage=${stage}\nnote=${note}`);
    await runTool("write_file", { path: P.PROGRESS_REPORT, content });
}

/**
 * distillUiFlows — `project-docs/03_DEV/UI-flow.md` → tier-3 `memory/project/ui-flows.md`.
 *
 * NO LLM. `ui-flow-parser.js` already turned the document into structure (flow name, entry
 * URL, ordered steps), so there is nothing left to interpret. Paying a model to re-read
 * something already parsed would add cost and a chance of paraphrasing the navigation
 * backbone — the one thing that must not drift.
 *
 * Three outputs, three consumers:
 *   tier 3 `ui-flows.md`  → qa-test-designer writes Steps that name real flow steps
 *   tier 2 `components`   → queryable "which screens does this project have"
 *   tier 2 `base_url`     → the config every node reads instead of hardcoding a URL
 *
 * `**Entry:**` becoming `base_url` matters: until now `base_url` could only come from `.env`
 * or a manual putConfig, so a fresh clone had no way to know where the app lives even though
 * the project documentation says so on its second line.
 */
export async function distillUiFlows({ docPath = P.UI_FLOW_DOC } = {}) {
    const doc = await runTool("read_file", { path: docPath });
    if (doc.error) {
        return { status: "skipped", reason: `không đọc được ${docPath}: ${doc.error}`, flows: 0, problems: [] };
    }

    const { flows, problems } = parseUiFlows(doc.content);
    for (const p of problems) console.warn(`  [ui-flow] ${p}`);
    if (flows.length === 0) {
        return { status: "skipped", reason: "không tìm thấy flow nào trong tài liệu", flows: 0, problems };
    }

    const hash = createHash("sha256").update(doc.content).digest("hex").slice(0, 16);
    let sections = 0;
    let components = 0;

    for (const flow of flows) {
        // One `###` section per flow. Steps are rendered verbatim — the whole value of this
        // file is that it says what the document says, in the words the document used.
        const body = [
            flow.entry ? `**Điểm bắt đầu:** ${flow.entry}` : `**Điểm bắt đầu:** (tài liệu không nêu)`,
            ``,
            `| # | Bước | Loại |`,
            `|---|---|---|`,
            ...flow.steps.map(s => `| ${s.n} | ${s.text.replace(/\|/g, "\\|")} | ${s.kind} |`),
            ``,
            `> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do`,
            `> \`qa-automation\` tìm bằng MCP lúc chạy (\`tools/flow-walker.js\`) và lưu ở registry.`,
        ].join("\n");

        const res = await storeKnowledgeSection({
            kind: "uiflow",
            status: "confirmed",
            title: `Luồng: ${flow.name}`,
            content: body,
            sourceFile: docPath,
            sourceHash: hash,
        });
        if (res.action !== "unchanged") sections++;

        // Tier 2: the flow itself is a queryable component of the system under test.
        putComponent({
            name: flow.name,
            kind: "module",
            ref: flow.entry ?? null,
            description: `Luồng nghiệp vụ ${flow.steps.length} bước, chưng cất từ ${docPath}`,
            source_ref: docPath,
        });
        components++;

        // De-hardcoding: the URL now has a documented source of truth.
        if (flow.entry && !getConfig("base_url", null)) {
            putConfig({
                key: "base_url",
                value: flow.entry,
                description: `Lấy từ **Entry:** của luồng "${flow.name}" trong ${docPath}`,
                source_ref: docPath,
            });
        }
    }

    return { status: "ok", flows: flows.length, sections, components, problems, file: P.UI_FLOWS };
}

/**
 * supervise — look at EVERY run at once and say who has to act next.
 *
 * This is the Leader doing the one thing its name implies and previously could not: watch
 * the other agents. It became possible only once run state moved from a single JSON file
 * (which held exactly one run, `run_id` permanently null) into `.qa-run/runs.db`.
 *
 * Entirely deterministic — no LLM. "Is this run stuck?" and "who must act?" are rules over
 * recorded facts (status, timestamps, approval flags), each with one right answer. Asking a
 * model would add cost and the chance of a different answer each time for no gain.
 *
 * @param {{limit?: number, staleHours?: number, nowMs?: number, write?: boolean}} opts
 */
export async function supervise({ limit = 20, staleHours = 24, nowMs = Date.now(), write = true } = {}) {
    const runs = await listRuns(limit);
    const result = await superviseRuns({ runs, loadSteps: stepsOfRun, nowMs, staleHours });
    const markdown = renderDashboard(result);
    if (write) {
        const res = await runTool("write_file", { path: P.SUPERVISION_REPORT, content: markdown });
        if (res.error) console.error(`  [supervise] không ghi được ${P.SUPERVISION_REPORT}: ${res.error}`);
    }
    return { ...result, markdown, reportFile: write ? P.SUPERVISION_REPORT : null };
}
