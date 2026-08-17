// agents/qa-leader/index.js
// Node: QA Leader — coordinator of 6 skills (01-06), does not analyze requirements itself.
// Leader only does its own steps (setup + review). Orchestration loop lives in the workflow.

// node:fs is used ONLY to load this node's own static role/knowledge/skill files at
// module load time. Every dynamic path (anything derived from LLM output or pipeline
// data) goes through runTool() so tools.js's safe() containment check applies.
import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { convertDirectory } from "./tools/convert-to-md.js";
import { hashProjectDocsPerFile, diffManifest } from "./tools/project-docs-hash.js";
import { storeKnowledgeSection, flagKnowledgeFromRemovedSource } from "./tools/project-knowledge-store.js";
import { putTerm, putComponent, putField, putConfig } from "../runtime/knowledge.js";
import { computeImpact, renderImpactReport } from "./tools/impact-analysis.js";

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
    const mapping = parseJSON(raw);

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

const MANIFEST_PATH = "memory/project/manifest.json";
const IMPACT_REPORT_PATH = "memory/working/impact-report.md";
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
    await step2b_updateProjectKnowledge();

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
