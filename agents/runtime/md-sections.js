// agents/runtime/md-sections.js
// Surgical read/write of "### " sections inside the "## Content" block of a tier-3
// knowledge file (memory/README.md, tier 3).
//
// WHY THIS EXISTS: tier 3 is hand-editable by the user. An agent that rewrites the
// whole file destroys those edits — which is exactly the failure the DB-backed
// approach was supposed to fix and did not. So an agent may only replace the ONE
// section derived from the document that just changed; every other byte of the file,
// including hand edits and section order, is preserved.
//
// Generic on purpose: no project, and no specific file, is referenced here.

const CONTENT_RE = /^##\s+Content\s*$/m;
const H2_RE = /^##\s+\S/m;
const H3_LINE_RE = /^###\s+(.+?)\s*$/;

/**
 * Split a knowledge file into { head, content, tail }.
 * `content` is the text between the "## Content" heading and the next "## " heading.
 * Returns null when the file has no "## Content" heading (caller decides what to do).
 */
export function splitContentBlock(markdown) {
    const match = CONTENT_RE.exec(markdown);
    if (!match) return null;

    const contentStart = match.index + match[0].length;
    const rest = markdown.slice(contentStart);

    // Next "## " heading at the same level ends the content block.
    const nextH2 = H2_RE.exec(rest);
    const contentEnd = nextH2 ? contentStart + nextH2.index : markdown.length;

    return {
        head: markdown.slice(0, contentStart),
        content: markdown.slice(contentStart, contentEnd),
        tail: markdown.slice(contentEnd),
    };
}

/**
 * Parse a content block into an optional preamble plus "### " sections.
 * Bodies are kept verbatim (trailing whitespace trimmed only at the very end) so a
 * round-trip through parse + serialize is byte-stable.
 */
export function parseSections(contentBlock) {
    const lines = contentBlock.split("\n");
    const preamble = [];
    const sections = [];
    let current = null;

    for (const line of lines) {
        const heading = H3_LINE_RE.exec(line);
        if (heading) {
            if (current) sections.push(current);
            current = { title: heading[1], bodyLines: [] };
            continue;
        }
        if (current) current.bodyLines.push(line);
        else preamble.push(line);
    }
    if (current) sections.push(current);

    return {
        preamble: preamble.join("\n").trim(),
        sections: sections.map(s => ({ title: s.title, body: s.bodyLines.join("\n").trim() })),
    };
}

/**
 * Byte ranges of each "### " section within a content block.
 *
 * Writes are done by splicing these ranges, NOT by parse-then-serialize. An earlier
 * version rebuilt the whole block from parsed sections, which silently reflowed blank
 * lines in sections nobody had touched — so "your hand edits are preserved" was only
 * true for the text, not for the formatting. Splicing makes it true for both.
 */
function sectionRanges(content) {
    const re = /^###[ \t]+(.+?)[ \t]*$/gm;
    const out = [];
    let m;
    while ((m = re.exec(content)) !== null) {
        out.push({ title: m[1], start: m.index, bodyStart: m.index + m[0].length });
    }
    for (let i = 0; i < out.length; i++) {
        out[i].end = i + 1 < out.length ? out[i + 1].start : content.length;
    }
    return out;
}

/** Titles of the sections currently in a file. */
export function listSections(markdown) {
    const split = splitContentBlock(markdown);
    if (!split) return [];
    return parseSections(split.content).sections.map(s => s.title);
}

export function getSection(markdown, title) {
    const split = splitContentBlock(markdown);
    if (!split) return null;
    return parseSections(split.content).sections.find(s => s.title === title) ?? null;
}

/**
 * Replace the body of the section titled `title`, or append a new section when it
 * does not exist yet. Section ORDER is preserved (an updated section stays where it
 * was), and no other section is touched.
 *
 * Returns { markdown, action: "updated" | "inserted" | "unchanged" }.
 */
export function upsertSection(markdown, { title, body }) {
    const split = splitContentBlock(markdown);
    if (!split) throw new Error('File thiếu heading "## Content" — không thể cập nhật theo mục.');

    const ranges = sectionRanges(split.content);
    const target = ranges.find(r => r.title === title);
    const nextBody = body.trim();
    const block = `### ${title}\n${nextBody}\n\n`;

    let nextContent;
    let action;

    if (target) {
        if (split.content.slice(target.bodyStart, target.end).trim() === nextBody) {
            return { markdown, action: "unchanged" };
        }
        // Splice: only this section's bytes change. Everything before and after is
        // carried over untouched, including the user's own formatting.
        nextContent = split.content.slice(0, target.start) + block + split.content.slice(target.end);
        action = "updated";
    } else {
        const existing = split.content.replace(/\s+$/, "");
        nextContent = (existing ? existing + "\n\n" : "\n\n") + block;
        action = "inserted";
    }

    return { markdown: split.head + nextContent + split.tail, action };
}

/**
 * Remove a section. Used only on explicit instruction — a source document being
 * deleted does NOT auto-delete knowledge (that would silently destroy content the
 * user may have edited); such sections get flagged instead.
 */
export function removeSection(markdown, title) {
    const split = splitContentBlock(markdown);
    if (!split) return { markdown, action: "unchanged" };

    const target = sectionRanges(split.content).find(r => r.title === title);
    if (!target) return { markdown, action: "unchanged" };

    const nextContent = split.content.slice(0, target.start) + split.content.slice(target.end);
    return { markdown: split.head + nextContent + split.tail, action: "removed" };
}

/** Skeleton for a tier-3 file that does not exist yet. */
export function emptyKnowledgeFile({ title, type, source, consumedBy, preamble = "" }) {
    return (
        `# Project Knowledge: ${title}\n\n` +
        `## Type\n${type}\n\n` +
        `## Content\n\n${preamble ? preamble + "\n" : ""}\n` +
        `## Source\n${source}\n\n` +
        `## Consumed by\n${consumedBy}\n`
    );
}
