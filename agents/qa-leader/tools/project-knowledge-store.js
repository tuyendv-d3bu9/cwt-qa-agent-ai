// agents/qa-leader/tools/project-knowledge-store.js
// Writes tier-3 knowledge (memory/project/*.md) ONE SECTION AT A TIME, and records the
// provenance edge for it in the tier-2 traceability graph. Deterministic, no LLM.
//
// See memory/README.md. Two rules from there drive every choice in this file:
//   - Tier 3 is hand-editable by the user, so an agent may only replace the section
//     derived from the document that just changed. Never the whole file.
//   - Nothing project-specific may be hardcoded here; the project name comes from
//     tier-2 config, so the same code serves any project.
//
// The knowledge CONTENT lives in markdown (git owns its history). The DB stores only
// the relationship "this section came from that document", which is the one question
// markdown cannot answer.

import { runTool } from "../../runtime/tools.js";
import { upsertSection, emptyKnowledgeFile, getSection } from "../../runtime/md-sections.js";
import { upsertArtifact, linkArtifacts, markArtifactsStale, downstreamOf, artifactId } from "../../runtime/db.js";
import { getConfig } from "../../runtime/knowledge.js";

// Generic across projects: every project has domain facts, known issues and decisions.
// Titles get the project name appended only when tier-2 config supplies one.
const KINDS = {
    domain: {
        path: "memory/project/domain-facts.md",
        baseTitle: "Domain Facts",
        type: "Fact / Business Context (chưng cất từ tài liệu dự án)",
        consumedBy: "Các node thiết kế test và tự động hoá (đọc trực tiếp — xem role.md từng node).",
    },
    issue: {
        path: "memory/project/known-issues.md",
        baseTitle: "Known Issues",
        type: "Fact / Registry (chưng cất từ tài liệu QA của dự án)",
        consumedBy: "Node thiết kế test (đánh dấu regression), tự động hoá (nhận biết bug đã biết), báo cáo (grounding Severity).",
    },
    decision: {
        path: "memory/project/decisions-log.md",
        baseTitle: "Decisions Log",
        type: "Fact / Change History (chưng cất từ tài liệu giao tiếp của dự án)",
        consumedBy: "Tham chiếu cho người + node phân tích/điều phối khi cần tra quyết định đã chốt.",
    },
};

const STATUS_LABEL = {
    confirmed: "Đã xác nhận",
    pending: "Còn treo — CHƯA có xác nhận trong tài liệu nguồn, không node nào được coi là đã chốt",
};

function fileTitle(kind) {
    const projectName = getConfig("project_name", null);
    return projectName ? `${KINDS[kind].baseTitle} — ${projectName}` : KINDS[kind].baseTitle;
}

/**
 * Section body layout. The status line is part of the body (not a grouping heading)
 * on purpose: grouping would require reordering sections, and reordering is exactly
 * what breaks byte-preservation of the user's hand edits. The confirmed/pending
 * distinction stays explicit either way, which is the actual requirement.
 */
function buildBody({ kind, status, content, sourceFile }) {
    const lines = [];
    if (kind === "decision" || status === "pending") {
        lines.push(`**Trạng thái**: ${STATUS_LABEL[status] ?? status}`);
        lines.push("");
    }
    lines.push(content.trim());
    lines.push("");
    lines.push(`*Nguồn: \`${sourceFile}\`*`);
    return lines.join("\n");
}

async function loadOrCreate(kind) {
    const { path, type, consumedBy } = KINDS[kind];
    const res = await runTool("read_file", { path });
    if (!res.error) return { path, markdown: res.content, created: false };

    return {
        path,
        created: true,
        markdown: emptyKnowledgeFile({
            title: fileTitle(kind),
            type,
            source: "Xem dòng *Nguồn* của từng mục bên trên.",
            consumedBy,
        }),
    };
}

/**
 * Write (or update) ONE section of tier-3 knowledge, and link it to its source
 * document in the traceability graph.
 *
 * Returns { action: "inserted" | "updated" | "unchanged", path, sectionId }.
 */
export async function storeKnowledgeSection({ kind, status = "confirmed", title, content, sourceFile, sourceHash = null }) {
    if (!KINDS[kind]) throw new Error(`kind không hợp lệ: ${kind}`);

    const { path, markdown } = await loadOrCreate(kind);
    const body = buildBody({ kind, status, content, sourceFile });
    const { markdown: next, action } = upsertSection(markdown, { title, body });

    if (action !== "unchanged") {
        const write = await runTool("write_file", { path, content: next });
        if (write.error) throw new Error(`Không ghi được ${path}: ${write.error}`);
    }

    // Provenance chain: doc -> section -> knowledge-file. The file node exists so that
    // downstream consumers can link to something stable: a test-case generator reads
    // whole files, not individual sections, and cannot say which section it used. With
    // the file in the middle, "document X changed" still reaches the test cases and
    // specs built on top of it (agents/runtime/db.js downstreamOf).
    const docId = upsertArtifact({ kind: "doc", ref: sourceFile, hash: sourceHash });
    const sectionId = upsertArtifact({ kind: "section", ref: `${path}#${title}` });
    const fileId = upsertArtifact({ kind: "knowledge-file", ref: path });
    linkArtifacts(sectionId, docId);
    linkArtifacts(fileId, sectionId);

    return { action, path, sectionId, fileId };
}

/**
 * A source document disappeared. Its knowledge is NOT deleted — that would silently
 * destroy content the user may have edited by hand. The affected sections (and
 * everything downstream of them) are flagged instead, for a human to decide.
 */
export function flagKnowledgeFromRemovedSource(sourceFile) {
    const docId = artifactId("doc", sourceFile);
    const affected = downstreamOf([docId]);
    markArtifactsStale(affected.map(a => a.id));
    return affected.map(a => ({ kind: a.kind, ref: a.ref }));
}

/** Read one section back — used by tests and by impact reporting. */
export async function readKnowledgeSection(kind, title) {
    const res = await runTool("read_file", { path: KINDS[kind].path });
    if (res.error) return null;
    return getSection(res.content, title);
}

export { KINDS as KNOWLEDGE_KINDS };
