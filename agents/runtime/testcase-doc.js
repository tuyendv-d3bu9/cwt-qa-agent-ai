// agents/runtime/testcase-doc.js
// R1 — HỢP ĐỒNG về hình dạng hai file test case. MỘT chỗ quyết định, ba node dùng.
//
//   qa-test-designer  ghi  testcases.md          (ĐẶC TẢ — 8 trường)
//   qa-verifier       ghi  testcases-result.md   (KẾT QUẢ — 8 trường + cột Kết quả)
//   qa-reporter       đọc  cả hai, xuất .xlsx
//
// VÌ SAO Ở `runtime/` CHỨ KHÔNG Ở TOOLS CỦA MỘT NODE. Ba node cùng phụ thuộc vào thứ tự cột.
// Đặt nó trong `qa-verifier/tools/` thì `qa-reporter` phải import xuyên qua ranh giới node, và
// tới lúc ai đó thêm một cột thì hai node còn lại vẫn đọc theo vị trí cũ — im lặng lệch nhau.
// Đúng lỗi đã có thật: `parseVerifierTable()` khai là kiểm số cột nhưng `cellCount` chỉ được
// gán, không ai đọc.

import { findTable, splitRow } from "./md-table.js";

/** 8 trường của một test case. Thứ tự này LÀ hợp đồng — đổi là đổi cả 3 node. */
export const TESTCASE_FIELDS = Object.freeze([
    "TC_ID", "Title", "Precondition", "Steps", "Test Data", "Expected Result", "Priority", "Tags",
]);

/** Cột của file KẾT QUẢ. `Kết quả` là cột người đọc tìm — để ngay sau Priority, không để cuối. */
export const RESULT_FIELDS = Object.freeze([
    "TC_ID", "Title", "Priority", "Kết quả", "Nhãn", "Lý do", "Ảnh bước lỗi", "Chạy lúc",
]);

/** Ô đầu dòng tiêu đề của bảng test case — chấp nhận `TC_ID`, `TC ID`, `TCID`. */
export const TC_HEADER_RE = /^TC[\s_-]?ID$/i;

/** Escape một ô markdown: dấu `|` chưa escape sẽ cắt đôi hàng và làm lệch mọi cột phía sau. */
export function cell(value) {
    return String(value ?? "")
        .replace(/\r?\n+/g, " ")     // xuống dòng trong ô cũng cắt bảng
        .replace(/\|/g, "\\|")
        .trim();
}

/**
 * Trích bảng 8 trường ra khỏi một deliverable dài.
 *
 * @returns {{found: boolean, headers: string[], rows: string[][], problems: string[]}}
 */
export function extractTestCases(markdown) {
    const t = findTable(markdown, { firstHeaderCell: TC_HEADER_RE });
    const problems = [];
    if (!t.found) {
        problems.push(`Không tìm thấy bảng test case (cần dòng tiêu đề bắt đầu bằng ô "TC_ID").`);
        return { found: false, headers: [], rows: [], problems };
    }
    if (t.headers.length !== TESTCASE_FIELDS.length) {
        problems.push(
            `Bảng test case có ${t.headers.length} cột, cần ${TESTCASE_FIELDS.length}: ` +
            `${TESTCASE_FIELDS.join(" | ")}. Thấy: ${t.headers.join(" | ")}.`);
    }
    // Một hàng thiếu ô sẽ đẩy mọi giá trị sang trái — Priority đọc ra nội dung của Expected
    // Result. Không kiểm ở đây thì lỗi đó đi thẳng vào file đặc tả và không ai thấy.
    for (const [i, r] of t.rows.entries()) {
        if (r.length !== t.headers.length) {
            problems.push(`Dòng ${i + 1} (${r[0] ?? "?"}) có ${r.length} ô, dòng tiêu đề có ${t.headers.length}.`);
        }
    }
    const seen = new Set();
    for (const r of t.rows) {
        const id = r[0];
        if (!id) { problems.push(`Có dòng không có TC_ID.`); continue; }
        if (seen.has(id)) problems.push(`TC_ID trùng: ${id}.`);
        seen.add(id);
    }
    return { found: true, headers: t.headers, rows: t.rows, problems };
}

function table(headers, rows) {
    return [
        `| ${headers.map(cell).join(" | ")} |`,
        `|${headers.map(() => "---").join("|")}|`,
        ...rows.map(r => `| ${r.map(cell).join(" | ")} |`),
    ].join("\n");
}

/**
 * `testcases.md` — CHỈ bảng đặc tả, không lập luận, không kiểm đếm.
 *
 * Cố ý không có phần "Coverage Strategy" hay "Self Count Check": ai muốn đọc lập luận thì mở
 * `deliverable-test-designer.md`. File này để trả lời đúng một câu — "có những test case nào".
 */
export function renderTestCases({ rows, headers = TESTCASE_FIELDS, feature = null, generatedAt = null }) {
    const meta = [
        `# Test Cases`,
        ``,
        feature ? `**Feature:** ${feature}  ` : null,
        `**Số test case:** ${rows.length}  `,
        generatedAt ? `**Sinh lúc:** ${generatedAt}  ` : null,
        ``,
        `> SINH TỰ ĐỘNG — đừng sửa tay. Đây là ĐẶC TẢ; kết quả chạy nằm ở \`testcases-result.md\`.`,
        `> Lập luận, coverage strategy và kiểm đếm nằm ở \`deliverable-test-designer.md\`.`,
        ``,
    ].filter(l => l !== null);
    return meta.join("\n") + table(headers, rows) + "\n";
}

/**
 * `testcases-result.md` — đặc tả + cột `Kết quả`.
 *
 * @param {object} o
 * @param {string[][]} o.rows       các dòng của bảng 8 trường (đặc tả)
 * @param {Map|object} o.byTcId     tcId → {ketQua, nhan, lyDo, anh, chayLuc}
 * @param {string} [o.notRun]       giá trị cho test case không nằm trong lượt chạy này
 *
 * ⚠ Test case KHÔNG chạy phải ghi rõ (mặc định "N/A"), KHÔNG để trống. Ô trống trong một bảng
 * kết quả đọc như "chưa ai nhìn tới" và cũng đọc như "không có gì bất thường" — hai nghĩa
 * ngược nhau. Đây là lý do R4 (chọn tập test case để chạy) không được phép để ô trống.
 */
export function renderTestCaseResults({ rows, byTcId, notRun = "N/A", feature = null, generatedAt = null }) {
    const get = (id) => (byTcId instanceof Map ? byTcId.get(id) : byTcId?.[id]) ?? null;

    const idx = Object.fromEntries(TESTCASE_FIELDS.map((f, i) => [f, i]));
    const out = rows.map(r => {
        const id = r[idx.TC_ID];
        const v = get(id);
        return [
            id,
            r[idx.Title] ?? "",
            r[idx.Priority] ?? "",
            v?.ketQua ?? notRun,
            v?.nhan ?? "",
            v?.lyDo ?? "",
            v?.anh ?? "",
            v?.chayLuc ?? "",
        ];
    });

    const tally = {};
    for (const r of out) tally[r[3]] = (tally[r[3]] ?? 0) + 1;
    const summary = Object.entries(tally).map(([k, n]) => `${k}: ${n}`).join(" · ");

    const meta = [
        `# Test Cases — Kết quả`,
        ``,
        feature ? `**Feature:** ${feature}  ` : null,
        `**Tổng:** ${out.length}  `,
        `**Phân bố:** ${summary || "(chưa có)"}  `,
        generatedAt ? `**Chạy lúc:** ${generatedAt}  ` : null,
        ``,
        `> SINH TỰ ĐỘNG sau mỗi lần chạy — đừng sửa tay. Sửa đè lên số đo là mất số đo.`,
        `> Cột \`Kết quả\` do \`verdict-combiner.js\` ánh xạ deterministic từ \`Nhãn\`, KHÔNG do LLM viết.`,
        ``,
    ].filter(l => l !== null);
    return meta.join("\n") + table(RESULT_FIELDS, out) + "\n";
}

/**
 * Đọc lại `testcases-result.md`. Dùng bởi qa-reporter để xuất Excel.
 *
 * Kiểm SỐ CỘT thật sự — không chỉ khai là có kiểm.
 */
export function parseTestCaseResults(markdown) {
    const t = findTable(markdown, { firstHeaderCell: TC_HEADER_RE });
    const problems = [];
    if (!t.found) return { found: false, rows: [], problems: [`Không tìm thấy bảng kết quả.`] };
    if (t.headers.length !== RESULT_FIELDS.length) {
        problems.push(
            `Bảng kết quả có ${t.headers.length} cột, cần ${RESULT_FIELDS.length} ` +
            `(${RESULT_FIELDS.join(" | ")}).`);
    }
    const rows = t.rows.map(r => Object.fromEntries(RESULT_FIELDS.map((f, i) => [f, r[i] ?? ""])));
    for (const r of rows) {
        if (!r["Kết quả"]) problems.push(`${r.TC_ID || "(không có TC_ID)"}: ô Kết quả TRỐNG.`);
    }
    return { found: true, rows, problems };
}

export { findTable, splitRow };
