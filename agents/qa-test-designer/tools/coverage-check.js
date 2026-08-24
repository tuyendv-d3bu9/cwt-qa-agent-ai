// agents/qa-test-designer/tools/coverage-check.js
// Same role as agents/qa-analyst/tools/count-check.js: LLMs self-report coverage
// unreliably (e.g. claiming "all ideas covered" while silently dropping some).
// This tool counts and cross-checks the ACTUAL output, deterministically.

import { countTestIdeas } from "../../qa-analyst/tools/count-check.js";
import { findTable } from "../../runtime/md-table.js";

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

/** Ô đầu dòng tiêu đề của bảng test case. Chỉ bảng này được đọc, không bảng nào khác. */
export const TC_TABLE_HEADER = /^TC[_\s-]?ID$/i;

/**
 * Đọc các dòng dữ liệu của RIÊNG bảng test case 8 trường.
 *
 * PHẠM VI BẢNG LÀ BẮT BUỘC. Bản trước lấy mọi dòng bắt đầu bằng `|` trong cả tài liệu, nên
 * nó đọc luôn bảng "Coverage Strategy Map" (5 cột) và các bảng Boundary Set do skill 01/02
 * sinh ra. Lần chạy thật 2026-08-24: 21 dòng của Coverage Strategy Map bị báo là 21 test
 * case sai format, kèm cả ô tiêu đề "Test Idea (từ Analyst)" — trong khi bảng test case
 * thật có đủ 21 dòng TC-D-001..021 hợp lệ. Xem agents/runtime/md-table.js.
 *
 * Việc nhận dòng ngăn cách vẫn theo TỪNG Ô, không phải `!line.includes("---")`: GFM cho
 * phép `|-|-|-|`, mà phép thử chuỗi con cũ không nhận ra — dòng ngăn cách khi đó trở thành
 * DÒNG DỮ LIỆU rồi trượt kiểm TC_ID với thông báo `TC_ID sai format: -`.
 */
export function parseTestCaseRows(testCaseMarkdown) {
    return findTable(testCaseMarkdown, { firstHeaderCell: TC_TABLE_HEADER }).rows;
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
    const table = findTable(testCaseMarkdown, { firstHeaderCell: TC_TABLE_HEADER });
    const rows = table.rows;
    const blockedCount = countBlockedIdeas(testCaseMarkdown);
    const testCaseCount = rows.length;

    const issues = [];

    // Nói thẳng "không thấy bảng" thay vì để nó biến thành "bỏ sót idea". Hai nguyên nhân
    // khác nhau cần hai câu sửa khác nhau: một là viết lại tiêu đề bảng, một là viết thêm
    // test case. Gộp chúng vào một thông báo là đẩy người viết đi sai đường.
    if (!table.found) {
        issues.push(
            `Không tìm thấy bảng test case — thiếu dòng tiêu đề \`| TC_ID | Title | ... |\`. ` +
            `Bảng test case phải có ô đầu tiêu đề đúng là TC_ID.`
        );
        return { ok: false, ideaCount, testCaseCount: 0, blockedCount, issues };
    }

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
