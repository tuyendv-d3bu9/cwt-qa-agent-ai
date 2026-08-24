// agents/runtime/skill-docs.js

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Đường dẫn tài liệu được nhắc trong một skill, lấy từ text trong dấu backtick.
 *
 * CHỈ nhận 3 dạng — mọi thứ khác bị bỏ qua có chủ ý:
 *   `knowledge/x.md`                  → tri thức riêng của node đang chạy
 *   `memory/semantic/x.md`            → tầng 1, dùng chung
 *   `agents/<node>/knowledge/x.md`    → tri thức của node khác (đọc trực tiếp, không copy)
 *
 * Bỏ qua: `memory/project/*` (tầng 2–3 được TRUY VẤN qua knowledge.js, không nạp cả file),
 * `.qa-run/*` (sản phẩm của lần chạy, không phải tri thức), `tools/*.js`, và các skill khác.
 */
export function referencedDocs(skillText) {
    const text = String(skillText ?? "");
    const found = new Set();
    for (const m of text.matchAll(/`([^`\n]+\.md)`/g)) {
        const p = m[1].trim();
        if (/^knowledge\/[\w.-]+\.md$/.test(p)) { found.add(p); continue; }
        if (/^memory\/semantic\/[\w.-]+\.md$/.test(p)) { found.add(p); continue; }
        if (/^agents\/[\w.-]+\/knowledge\/[\w.-]+\.md$/.test(p)) { found.add(p); continue; }
    }
    return [...found].sort();
}

/** Đường dẫn tương đối gốc repo của một tham chiếu, biết node nào đang đọc. */
export function resolveRef(ref, agentDir) {
    return ref.startsWith("knowledge/") ? `${agentDir}/${ref}` : ref;
}

// Đọc một lần rồi giữ: cùng một tài liệu được nhiều skill nhắc, và mỗi node gọi LLM nhiều lượt.
const cache = new Map();

async function readCached(root, relPath) {
    const key = `${root}::${relPath}`;
    if (!cache.has(key)) cache.set(key, readFile(resolve(root, relPath), "utf8"));
    return cache.get(key);
}

/**
 * Nạp mọi tài liệu mà skill này tuyên bố sẽ dùng.
 *
 * @param {string} skillText
 * @param {object} o
 * @param {string} o.agentDir  ví dụ "agents/qa-analyst" (để giải `knowledge/...`)
 * @param {string} [o.root]    gốc repo
 * @param {boolean} [o.strict] mặc định true — thiếu file thì NỔ
 * @returns {Promise<{docs: Array<{path: string, content: string}>, missing: string[], text: string}>}
 *   `text` = phần ghép sẵn để nhét vào system prompt (rỗng nếu skill không nhắc tài liệu nào).
 */
export async function loadSkillDocs(skillText, { agentDir, root = process.cwd(), strict = true } = {}) {
    if (!agentDir) throw new Error("loadSkillDocs: thiếu agentDir — không giải được `knowledge/...` của node nào.");

    const refs = referencedDocs(skillText);
    const docs = [];
    const missing = [];

    for (const ref of refs) {
        const relPath = resolveRef(ref, agentDir);
        try {
            docs.push({ path: relPath, content: await readCached(root, relPath) });
        } catch {
            missing.push(relPath);
        }
    }

    if (missing.length && strict) {
        throw new Error(
            `Skill nhắc tài liệu KHÔNG tồn tại: ${missing.join(", ")}\n` +
            `  Prompt đang hứa một quy tắc không có thật — model sẽ lấp chỗ trống bằng cách bịa.\n` +
            `  Sửa đường dẫn trong skill, hoặc tạo file đó.`
        );
    }

    const text = docs.length
        ? docs.map(d => `### Tài liệu skill này tham chiếu: ${d.path}\n\n${d.content}`).join("\n\n")
        : "";

    return { docs, missing, text };
}

/**
 * Như `loadSkillDocs` nhưng bỏ những tài liệu mà node ĐÃ nạp tĩnh.
 *
 * Cần vì mỗi node vẫn nạp sẵn vài tài liệu nền (role, FACT, conventions…). Nếu một skill
 * cũng nhắc đúng tài liệu đó thì nó sẽ vào prompt hai lần — vừa tốn token vừa khiến model
 * tưởng đang có hai nguồn. So bằng NỘI DUNG chứ không bằng tên biến, nên node không phải
 * khai lại nó đã nạp những gì.
 *
 * @param {string} skillText
 * @param {object} o          như loadSkillDocs, thêm:
 * @param {string[]} o.already  các đoạn đã có trong system prompt
 */
export async function skillDocsText(skillText, { already = [], ...opts } = {}) {
    const { docs, missing } = await loadSkillDocs(skillText, opts);
    const have = already.filter(Boolean);
    const fresh = docs.filter(d => !have.some(part => part.includes(d.content.trim().slice(0, 200))));
    return {
        text: fresh.length ? fresh.map(d => `### Tài liệu skill này tham chiếu: ${d.path}\n\n${d.content}`).join("\n\n") : "",
        used: fresh.map(d => d.path),
        skipped: docs.filter(d => !fresh.includes(d)).map(d => d.path),
        missing,
    };
}

/** Xoá cache — chỉ dùng trong test. */
export function clearSkillDocsCache() {
    cache.clear();
}
