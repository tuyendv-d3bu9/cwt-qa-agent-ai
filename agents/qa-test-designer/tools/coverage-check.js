// agents/qa-test-designer/tools/coverage-check.js
// Same role as agents/qa-analyst/tools/count-check.js: LLMs self-report coverage
// unreliably (e.g. claiming "all ideas covered" while silently dropping some).
// This tool counts and cross-checks the ACTUAL output, deterministically.

import { countTestIdeas } from "../../qa-analyst/tools/count-check.js";

// `TC-<F>-<nnn>` per memory/semantic/testing-conventions.md — the feature code is NOT
// fixed. This was `/^TC-D-\d{3}$/`, which rejected every test case of any project whose
// feature code is not literally "D" ("TC_ID sai format" on all of them). Same hardcoding
// that was already removed from qa-reporter's countDesignedTestCases().
const TC_ID_PATTERN = /^TC-[A-Za-z0-9]+-\d+$/;
const REQUIRED_FIELDS = 8; // TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags

/**
 * Count the test ideas the Analyst produced.
 *
 * Delegates to qa-analyst's countTestIdeas() instead of re-implementing it. The comment
 * here used to claim "same parsing logic as qa-analyst's count-check.js" while the code
 * did something narrower: it split on /###\s*Viewpoint:/i, which does not match the
 * `### Viewpoint 1: Label` heading the analyst actually emits, and had no table fallback
 * at all. Measured on the real memory/working/deliverable-analyst.md: count-check found
 * 26 ideas, this function found 0.
 *
 * Because it returned 0, the "có idea bị bỏ sót" check below compared against 0 and could
 * never fire — the coverage gate was dead code. The Test Designer could silently drop
 * every idea the Analyst raised and still pass its own self-check.
 *
 * Cross-node tool import, same established pattern as qa-automation importing
 * registerArtifact() from qa-leader/tools/impact-analysis.js: the handover rule in
 * memory/README.md forbids reading another node's private KNOWLEDGE, not sharing code.
 * Two copies of one parser is exactly how the two answers drifted apart.
 */
export function countAnalystIdeas(deliverableAnalystMarkdown) {
    return countTestIdeas(deliverableAnalystMarkdown).totalIdeas;
}

/** A GFM separator cell: dashes with optional alignment colons — `---`, `:-:`, `-`, `:--`. */
const isSeparatorCell = (cell) => /^:?-+:?$/.test(cell.trim());

/**
 * Parse the 8-field test case table rows (exclude header + separator).
 *
 * Separator detection is per-cell, not `!line.includes("---")`. GitHub-flavored Markdown
 * accepts a one-dash separator (`|-|-|-|`), which the old substring test did not recognise
 * — so the separator was returned as a DATA ROW, and then failed the TC_ID format check
 * with the delightful message `TC_ID sai format: -`.
 */
export function parseTestCaseRows(testCaseMarkdown) {
    return testCaseMarkdown
        .split("\n")
        .filter(l => l.trim().startsWith("|") && !/^\|\s*TC_ID/i.test(l.trim()))
        .map(l => l.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1))
        .filter(cells => cells.length > 0 && !cells.every(isSeparatorCell));
}

/** Count how many OPEN QUESTION-blocked ideas were explicitly carried over (not silently dropped) */
export function countBlockedIdeas(testCaseMarkdown) {
    const section = testCaseMarkdown.split(/###\s*Chưa thể tạo test case/i)[1] || "";
    return (section.match(/^\s*-\s/gm) || []).length;
}

/**
 * Verify deterministic toàn bộ deliverable trước khi ghi file.
 * @returns {{ ok: boolean, ideaCount: number, testCaseCount: number, blockedCount: number, issues: string[] }}
 */
export function verifyDeliverable({ deliverableAnalystMarkdown, testCaseMarkdown }) {
    const ideaCount = countAnalystIdeas(deliverableAnalystMarkdown);
    const rows = parseTestCaseRows(testCaseMarkdown);
    const blockedCount = countBlockedIdeas(testCaseMarkdown);
    const testCaseCount = rows.length;

    const issues = [];

    if (testCaseCount + blockedCount < ideaCount) {
        issues.push(
            `Analyst có ${ideaCount} test idea, nhưng chỉ thấy ${testCaseCount} test case + ${blockedCount} mục blocked ` +
            `(tổng ${testCaseCount + blockedCount}) — có idea bị bỏ sót.`
        );
    }

    const tcIds = rows.map(r => r[0]);
    const dupIds = tcIds.filter((id, i) => tcIds.indexOf(id) !== i);
    if (dupIds.length > 0) {
        issues.push(`TC_ID trùng: ${[...new Set(dupIds)].join(", ")}.`);
    }

    const badIds = tcIds.filter(id => !TC_ID_PATTERN.test(id));
    if (badIds.length > 0) {
        // Message describes the ACTUAL pattern. It used to say "phải là TC-D-<3 số>" even
        // after the check was generalised — a gate whose message lies about what it wants
        // sends the author chasing the wrong fix.
        issues.push(`TC_ID sai format (phải là TC-<mã feature>-<số>, ví dụ TC-D-001): ${badIds.join(", ")}.`);
    }

    const incompleteRows = rows.filter(r => r.length < REQUIRED_FIELDS || r.some(c => c === ""));
    if (incompleteRows.length > 0) {
        issues.push(`${incompleteRows.length} test case thiếu trường (cần đủ ${REQUIRED_FIELDS} trường, không trường nào rỗng).`);
    }

    return { ok: issues.length === 0, ideaCount, testCaseCount, blockedCount, issues };
}
