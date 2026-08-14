// agents/qa-test-designer/tools/coverage-check.js
// Same role as agents/qa-analyst/tools/count-check.js: LLMs self-report coverage
// unreliably (e.g. claiming "all ideas covered" while silently dropping some).
// This tool counts and cross-checks the ACTUAL output, deterministically.

const TC_ID_PATTERN = /^TC-D-\d{3}$/;
const REQUIRED_FIELDS = 8; // TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags

/** Count test ideas Analyst produced (same parsing logic as qa-analyst's count-check.js) */
export function countAnalystIdeas(deliverableAnalystMarkdown) {
    const blocks = deliverableAnalystMarkdown.split(/###\s*Viewpoint:/i).slice(1);
    return blocks.reduce((total, block) => total + (block.match(/^\s*\d+\.\s/gm) || []).length, 0);
}

/** Parse the 8-field test case table rows (exclude header + separator) */
export function parseTestCaseRows(testCaseMarkdown) {
    return testCaseMarkdown
        .split("\n")
        .filter(l => l.trim().startsWith("|") && !l.includes("---") && !/^\|\s*TC_ID/i.test(l.trim()))
        .map(l => l.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1));
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
        issues.push(`TC_ID sai format (phải là TC-D-<3 số>): ${badIds.join(", ")}.`);
    }

    const incompleteRows = rows.filter(r => r.length < REQUIRED_FIELDS || r.some(c => c === ""));
    if (incompleteRows.length > 0) {
        issues.push(`${incompleteRows.length} test case thiếu trường (cần đủ ${REQUIRED_FIELDS} trường, không trường nào rỗng).`);
    }

    return { ok: issues.length === 0, ideaCount, testCaseCount, blockedCount, issues };
}
