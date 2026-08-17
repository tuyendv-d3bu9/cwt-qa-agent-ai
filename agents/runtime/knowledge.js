// agents/runtime/knowledge.js
// INTERFACE for tier 2 of the memory layer — stable project reference knowledge.
// Read memory/README.md first; this file implements the "queried, not injected"
// contract described there.
//
// Nothing in this file is specific to any project. The four categories (terms,
// components, fields, config) exist in every project; only their rows differ.
//
// WHY QUERIED, NOT INJECTED: a real project can have hundreds of terms and fields.
// Injecting all of them into every prompt means paying for the part that is not used.
// contextFor() extracts keywords from the text of the work at hand and returns only
// the matching entries, as a short markdown block.
//
// The keyword matching is DETERMINISTIC — no LLM decides what is relevant, for the
// same reason count-check.js / coverage-check.js are plain code: a selection step that
// the pipeline depends on must be reproducible and auditable.
//
// Agents MUST go through this module. Writing SQL against the tier-2 tables from an
// agent is not allowed (same rule as node:fs going through tools.js).

import { db } from "./db.js";

const now = () => new Date().toISOString();

/** Stable id from a natural key, so re-storing the same entry updates it in place. */
function slug(prefix, name) {
    const base = String(name)
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    return `${prefix}:${base}`;
}

// db() with NO argument, so it follows db.js's current knowledge-DB path. Passing
// KNOWLEDGE_DB explicitly (as this did originally) hardcoded the real file and made
// useKnowledgeDb() a no-op for everything in this module — tests believed they were
// isolated while actually writing into the real knowledge DB.
function handle() {
    return db();
}

// ── WRITE side — used by the coordinator node after document analysis ────────

export function putTerm({ term, definition, aliases = [], sourceRef = null }) {
    const id = slug("term", term);
    handle()
        .prepare(`INSERT INTO terms (id, term, definition, aliases, source_ref, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET term = excluded.term, definition = excluded.definition,
                    aliases = excluded.aliases, source_ref = excluded.source_ref, updated_at = excluded.updated_at`)
        .run(id, term, definition, aliases.join("\n"), sourceRef, now());
    return id;
}

export function putComponent({ name, kind, ref = null, description = null, sourceRef = null }) {
    const id = slug("component", name);
    handle()
        .prepare(`INSERT INTO components (id, name, kind, ref, description, source_ref, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, ref = excluded.ref,
                    description = excluded.description, source_ref = excluded.source_ref, updated_at = excluded.updated_at`)
        .run(id, name, kind, ref, description, sourceRef, now());
    return id;
}

export function putField({ name, component = null, dataType = null, constraints = null, notes = null, sourceRef = null }) {
    const id = slug("field", `${component ?? "global"}-${name}`);
    handle()
        .prepare(`INSERT INTO fields (id, name, component, data_type, constraints, notes, source_ref, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET name = excluded.name, component = excluded.component,
                    data_type = excluded.data_type, constraints = excluded.constraints, notes = excluded.notes,
                    source_ref = excluded.source_ref, updated_at = excluded.updated_at`)
        .run(id, name, component, dataType, constraints, notes, sourceRef, now());
    return id;
}

export function putConfig({ key, value, description = null, sourceRef = null }) {
    handle()
        .prepare(`INSERT INTO config (key, value, description, source_ref, updated_at)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description,
                    source_ref = excluded.source_ref, updated_at = excluded.updated_at`)
        .run(key, String(value), description, sourceRef, now());
    return key;
}

// ── READ side ───────────────────────────────────────────────────────────────

/**
 * Project configuration. This is how agent code avoids hardcoding project values
 * (environment URL, project name, source document directory). Callers should pass a
 * fallback so a not-yet-populated database degrades instead of crashing.
 */
export function getConfig(key, fallback = null) {
    const row = handle().prepare(`SELECT value FROM config WHERE key = ?`).get(key);
    return row ? row.value : fallback;
}

export function allConfig() {
    return handle().prepare(`SELECT * FROM config ORDER BY key`).all();
}

/** True when tier 2 has not been populated yet — callers can then skip lookups. */
export function isEmpty() {
    const h = handle();
    const count = (table) => h.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    return count("terms") + count("components") + count("fields") + count("config") === 0;
}

/**
 * Split text into candidate keywords. Keeps two shapes that matter for testing docs:
 * ordinary words, and identifier-like tokens (snake_case / camelCase / dotted paths)
 * which are usually field or endpoint names.
 */
export function extractKeywords(text) {
    const raw = String(text ?? "");
    const words = raw.toLowerCase().match(/[\p{L}\p{N}_./-]{2,}/gu) ?? [];
    return [...new Set(words)];
}

function matchesAny(haystack, keywords) {
    const lower = String(haystack ?? "").toLowerCase();
    if (!lower) return false;
    return keywords.some(k => lower.includes(k) || k.includes(lower));
}

export function lookupTerms(keywords) {
    return handle().prepare(`SELECT * FROM terms`).all().filter(row =>
        matchesAny(row.term, keywords) || (row.aliases ?? "").split("\n").some(a => matchesAny(a, keywords))
    );
}

export function lookupComponents(keywords) {
    return handle().prepare(`SELECT * FROM components`).all().filter(row =>
        matchesAny(row.name, keywords) || matchesAny(row.ref, keywords)
    );
}

export function lookupFields(keywords) {
    return handle().prepare(`SELECT * FROM fields`).all().filter(row =>
        matchesAny(row.name, keywords) || matchesAny(row.component, keywords)
    );
}

/**
 * THE MAIN ENTRY POINT for agents.
 *
 * Give it the text of the work at hand (a task assignment, a test case, a step) and it
 * returns a compact markdown block containing only the tier-2 entries that text
 * actually mentions — ready to append to a prompt.
 *
 * Returns "" when nothing matches, so the caller can append it unconditionally without
 * padding the prompt with an empty section.
 *
 * `limit` caps each category so one over-matching keyword cannot flood the prompt;
 * when the cap trims anything, the block says so out loud rather than silently
 * truncating (same rule the repo applies to any other capped output).
 */
export function contextFor(text, { limit = 15 } = {}) {
    if (isEmpty()) return "";

    const keywords = extractKeywords(text);
    if (keywords.length === 0) return "";

    const sections = [];
    const cap = (rows) => ({ shown: rows.slice(0, limit), dropped: Math.max(0, rows.length - limit) });

    const terms = cap(lookupTerms(keywords));
    if (terms.shown.length) {
        sections.push(
            `### Thuật ngữ liên quan\n` +
            terms.shown.map(r => `- **${r.term}**: ${r.definition}${r.source_ref ? ` *(nguồn: ${r.source_ref})*` : ""}`).join("\n") +
            (terms.dropped ? `\n- *(còn ${terms.dropped} thuật ngữ khớp nhưng bị giới hạn ${limit})*` : "")
        );
    }

    const components = cap(lookupComponents(keywords));
    if (components.shown.length) {
        sections.push(
            `### Thành phần liên quan\n` +
            components.shown.map(r => `- **${r.name}** (${r.kind})${r.ref ? ` — \`${r.ref}\`` : ""}${r.description ? `: ${r.description}` : ""}`).join("\n") +
            (components.dropped ? `\n- *(còn ${components.dropped} thành phần khớp nhưng bị giới hạn ${limit})*` : "")
        );
    }

    const fields = cap(lookupFields(keywords));
    if (fields.shown.length) {
        sections.push(
            `### Field liên quan\n` +
            fields.shown.map(r => `- **${r.name}**${r.component ? ` (${r.component})` : ""}${r.data_type ? ` — ${r.data_type}` : ""}${r.constraints ? ` — ràng buộc: ${r.constraints}` : ""}${r.notes ? ` — ${r.notes}` : ""}`).join("\n") +
            (fields.dropped ? `\n- *(còn ${fields.dropped} field khớp nhưng bị giới hạn ${limit})*` : "")
        );
    }

    if (sections.length === 0) return "";

    return (
        `## Tri thức tham chiếu (tầng 2, tra cứu tự động theo nội dung việc đang làm)\n` +
        `Chỉ gồm mục khớp với nội dung công việc. KHÔNG suy diễn thêm ngoài các định nghĩa dưới đây.\n\n` +
        sections.join("\n\n")
    );
}
