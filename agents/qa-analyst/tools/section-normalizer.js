// agents/qa-analyst/tools/section-normalizer.js
// Deterministic (NO LLM) cleanup of ONE skill's output before it is assembled into the
// deliverable. Same philosophy as count-check.js: the prompt asks, the code enforces.
//
// WHY THIS EXISTS. Each skill is supposed to produce exactly one section of
// deliverable-analyst.md, and index.js assembles the file. Measured behaviour says
// otherwise, even after the skills were given an explicit "PHẠM VI OUTPUT — chỉ mục N"
// boundary and a format spec:
//
//   - skill 01 re-emitted its own `## 1. Requirement Summary` heading on top of the one
//     index.js writes, so the heading appeared TWICE;
//   - skill 01 kept going past its own section and wrote `## 2. Missing Business Rules`,
//     `## 3. Viewpoints & Test Ideas` and `## 4. Self Count Check` as well — the work of
//     skill 02, skill 03 and count-check.js;
//   - skill 03 wrapped its whole answer in a ```markdown fence.
//
// The pull is structural, not a wording problem: role.md and delivery-rules.md sit AHEAD of
// the skill in the system prompt and both describe the WHOLE deliverable, so the model is
// being told to produce all of it and then told to produce a part of it. Adding a third
// paragraph of "please don't" is not a fix. Trimming deterministically is.
//
// This does not paper over a bad answer: it removes material that provably belongs to
// another section, and it never invents anything.

/**
 * The four `##` headings index.js owns. A skill's output must not contain ANY of them —
 * its own is redundant, and the others are somebody else's job.
 * Loose on wording ("Viewpoints & Test Ideas", "Viewpoint & Test Idea", "(6W Analysis)")
 * because the model paraphrases titles; strict on the `## <n>.` shape, which it keeps.
 */
const SECTION_HEADINGS = [
    { n: 1, re: /^#{1,3}\s*1\.\s*Requirement\s+Summary\b/i },
    { n: 2, re: /^#{1,3}\s*2\.\s*Missing\s+Business\s+Rules?\b/i },
    { n: 3, re: /^#{1,3}\s*3\.\s*Viewpoints?\b/i },
    { n: 4, re: /^#{1,3}\s*4\.\s*Self\s+Count\s+Check\b/i },
];

/** Remove one ```/```lang fence pair that wraps the ENTIRE text. */
function stripOuterFence(text) {
    const lines = text.split("\n");
    let start = 0;
    let end = lines.length - 1;
    while (start < lines.length && lines[start].trim() === "") start++;
    while (end > start && lines[end].trim() === "") end--;
    if (!/^```/.test(lines[start] ?? "") || !/^```\s*$/.test(lines[end] ?? "")) return text;
    return lines.slice(start + 1, end).join("\n");
}

/**
 * @param {string} text        raw skill output
 * @param {number} sectionNo   which section (1..4) this skill owns
 * @returns {{text: string, removed: string[]}}
 *   `removed` names what was trimmed, so callers can log it instead of silently rewriting
 *   the model's answer. A silent trim would hide a skill that is misbehaving.
 */
export function normalizeSection(text, sectionNo) {
    const removed = [];
    let body = String(text ?? "");

    const unfenced = stripOuterFence(body);
    if (unfenced !== body) {
        removed.push("code fence bọc toàn bộ output");
        body = unfenced;
    }

    const lines = body.split("\n");
    const own = SECTION_HEADINGS.find(h => h.n === sectionNo);
    const foreign = SECTION_HEADINGS.filter(h => h.n !== sectionNo);

    // Drop a leading duplicate of this section's own heading (index.js already wrote it).
    let from = 0;
    while (from < lines.length && lines[from].trim() === "") from++;
    if (own && own.re.test(lines[from] ?? "")) {
        removed.push(`heading trùng "${lines[from].trim()}"`);
        from++;
    }

    // Truncate at the first heading belonging to ANOTHER section — everything from there
    // on is another skill's output.
    let to = lines.length;
    for (let i = from; i < lines.length; i++) {
        const hit = foreign.find(h => h.re.test(lines[i]));
        if (hit) {
            removed.push(`lấn sang mục ${hit.n} tại "${lines[i].trim()}" (bỏ ${lines.length - i} dòng)`);
            to = i;
            break;
        }
    }

    // Demote any remaining `##` to `###`: this content is nested INSIDE a `##` section, so
    // a `##` of its own breaks the document outline and the section-splitting in
    // updateCountCheck(). Fenced code blocks are left alone — a `##` in there is not a heading.
    let inFence = false;
    const out = lines.slice(from, to).map(line => {
        if (/^\s*```/.test(line)) inFence = !inFence;
        if (inFence) return line;
        return line.replace(/^##(?!#)\s*/, "### ");
    });

    return { text: out.join("\n").trim(), removed };
}
