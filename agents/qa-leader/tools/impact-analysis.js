// agents/qa-leader/tools/impact-analysis.js
// Deterministic (NO LLM) answer to: "these documents changed — what is now out of date,
// and whose job is it to redo?"
//
// Division of labour, same as every other tool in this repo: FINDING the affected
// artifacts is a graph query, so it is code. Only the human-readable explanation and
// the suggested order are left to the LLM (skill 02d). An LLM guessing at the
// dependency set would be unverifiable, and would quietly miss things.
//
// Generic: no project, node or file name is hardcoded. The chain it walks is whatever
// was recorded in derives_from:
//     doc -> section -> knowledge-file -> testcase -> spec
//
// Note the honest limitation: this can only report what the graph knows. An artifact
// whose producer never registered it (see registerArtifact* helpers used by the
// downstream nodes) is invisible here — reported explicitly as coverage info rather
// than silently treated as "nothing affected".

import { artifactId, downstreamOf, markArtifactsStale, upsertArtifact, linkArtifacts } from "../../runtime/db.js";

/** Who has to act when an artifact of this kind goes stale. */
const OWNER_BY_KIND = {
    section: "Người dùng review (hoặc để bước chưng cất ghi lại mục đó)",
    "knowledge-file": "Không cần hành động riêng — hệ quả của mục `###` bên trên",
    testcase: "Node thiết kế test — chạy lại để cập nhật test case",
    spec: "Node tự động hoá — explore lại UI + sinh lại spec",
    screenshot: "Node tự động hoá — chụp lại evidence",
};

const KIND_LABEL = {
    section: "Mục tri thức",
    "knowledge-file": "File tri thức",
    testcase: "Test case",
    spec: "Spec automation",
    screenshot: "Evidence",
};

/**
 * Compute what the changed/removed documents invalidate.
 *
 * @param {{added?: string[], changed?: string[], removed?: string[]}} changedFiles
 * @param {{markStale?: boolean}} [opts] - markStale:false to preview without writing
 * @returns {{sources: object[], affected: object[], byKind: object, total: number}}
 */
export function computeImpact(changedFiles, { markStale = true } = {}) {
    const changed = changedFiles?.changed ?? [];
    const removed = changedFiles?.removed ?? [];
    // `added` files invalidate nothing: nothing downstream existed for them yet.
    const sources = [...changed.map(f => ({ file: f, reason: "nội dung đã đổi" })),
                     ...removed.map(f => ({ file: f, reason: "tài liệu nguồn đã bị xoá" }))];

    const seen = new Map();
    for (const src of sources) {
        for (const art of downstreamOf([artifactId("doc", src.file)])) {
            const existing = seen.get(art.id);
            if (existing) {
                if (!existing.causedBy.includes(src.file)) existing.causedBy.push(src.file);
                continue;
            }
            seen.set(art.id, {
                id: art.id,
                kind: art.kind,
                ref: art.ref,
                label: KIND_LABEL[art.kind] ?? art.kind,
                owner: OWNER_BY_KIND[art.kind] ?? "Chưa xác định",
                causedBy: [src.file],
            });
        }
    }

    const affected = [...seen.values()].sort((a, b) => (a.kind + a.ref).localeCompare(b.kind + b.ref));
    if (markStale && affected.length) markArtifactsStale(affected.map(a => a.id));

    const byKind = {};
    for (const a of affected) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;

    return { sources, affected, byKind, total: affected.length };
}

/**
 * Deterministic markdown report. Written even when the LLM step is skipped or fails,
 * so the pipeline never ends up with "something changed" and no record of what.
 */
export function renderImpactReport({ sources, affected, byKind, total }, stamp) {
    const lines = [
        "# Impact Report — tài liệu dự án thay đổi",
        "",
        `*Sinh tự động (deterministic, KHÔNG dùng LLM) lúc ${stamp}.*`,
        "",
        "## 1. Tài liệu nguồn đã thay đổi",
        "",
    ];

    if (!sources.length) {
        lines.push("Không có tài liệu nào đổi nội dung hoặc bị xoá.", "");
    } else {
        lines.push("| Tài liệu | Lý do |", "|---|---|");
        for (const s of sources) lines.push(`| \`${s.file}\` | ${s.reason} |`);
        lines.push("");
    }

    lines.push("## 2. Thứ đã lỗi thời (truy từ graph `derives_from`)", "");
    if (!total) {
        lines.push(
            "Không có artifact nào phái sinh từ các tài liệu trên **được ghi trong graph**.",
            "",
            "Lưu ý: điều này KHÔNG chắc chắn nghĩa là không có gì bị ảnh hưởng — nó có thể là",
            "chuỗi truy vết chưa được ghi (test case/spec sinh ra trước khi cơ chế này tồn tại).",
            "Chạy lại các bước sau tài liệu để graph được ghi đầy đủ.",
            ""
        );
    } else {
        lines.push(`Tổng: **${total}** artifact. ` + Object.entries(byKind).map(([k, n]) => `${KIND_LABEL[k] ?? k}: ${n}`).join(", "), "");
        lines.push("| Loại | Artifact | Do tài liệu | Ai cần xử lý |", "|---|---|---|---|");
        for (const a of affected) {
            lines.push(`| ${a.label} | \`${a.ref}\` | ${a.causedBy.map(f => `\`${f}\``).join(", ")} | ${a.owner} |`);
        }
        lines.push("");
    }

    lines.push(
        "## 3. Giới hạn đã biết",
        "",
        "Báo cáo này chỉ thấy được thứ đã có trong graph. Artifact mà node sinh ra nó chưa",
        "đăng ký thì không xuất hiện ở đây — được ghi rõ như vậy thay vì im lặng coi là",
        "\"không ảnh hưởng gì\".",
        ""
    );

    return lines.join("\n");
}

/**
 * Register a produced artifact and its provenance. Called by the downstream nodes so
 * the chain is complete; without it impact analysis stops at the knowledge files.
 */
export function registerArtifact({ kind, ref, hash = null, derivedFrom = [] }) {
    const id = upsertArtifact({ kind, ref, hash });
    for (const source of derivedFrom) {
        if (!source) continue;
        linkArtifacts(id, source);
    }
    return id;
}

export { OWNER_BY_KIND, KIND_LABEL };
