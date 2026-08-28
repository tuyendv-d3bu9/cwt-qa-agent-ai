// agents/qa-reporter/tools/testcase-xlsx.js
// R1.2e — `testcases-result.md` → `.xlsx` để gửi ra ngoài nhóm.
//
// ⚠ ĐO ĐƯỢC, KHÔNG PHẢI PHỎNG ĐOÁN: `xlsx@0.18.5` (bản community) **KHÔNG giữ được style ô**.
// Đã thử ghi rồi đọc lại: ô có `s.fill` quay về `{"patternType":"none"}`, và `!views` (đóng
// băng dòng tiêu đề) trở thành `undefined`. Cả hai đều thuộc bản Pro.
//
// Nên kế hoạch ban đầu ("freeze dòng tiêu đề, tô màu cột Kết quả") **không làm được** với
// dependency hiện có, và thêm thư viện mới chỉ để tô màu là cái giá không đáng.
//
// THAY BẰNG: `!autofilter` — đã kiểm là round-trip được. Người nhận bấm mũi tên ở cột `Kết quả`
// và lọc ra đúng các dòng NG. Về việc "tìm nhanh dòng hỏng" thì nó làm đúng việc của màu, và
// còn hơn màu ở chỗ lọc được.
//
// Nếu sau này thật sự cần màu: dùng `exceljs`, và phải là một quyết định có người duyệt —
// đừng lặng lẽ thêm dependency trong một commit về báo cáo.

import * as P from "../../runtime/paths.js";
import { RESULT_FIELDS, parseTestCaseResults } from "../../runtime/testcase-doc.js";

/** Tên sheet. Excel giới hạn 31 ký tự và cấm `[]:*?/\` — giữ ngắn và ASCII cho chắc. */
export const SHEET_NAME = "Test Cases";

/** Bề rộng cột gợi ý (ký tự). `Lý do` dài nên rộng hơn hẳn. */
const WIDTHS = { TC_ID: 14, Title: 40, Priority: 10, "Kết quả": 14, "Nhãn": 20, "Lý do": 60, "Ảnh bước lỗi": 40, "Chạy lúc": 22 };

/**
 * Dựng dữ liệu sheet từ các dòng đã parse. THUẦN — không đụng đĩa, không đụng thư viện xlsx.
 *
 * @param {Array<Record<string,string>>} rows  kết quả `parseTestCaseResults().rows`
 * @returns {{aoa: string[][], autofilterRef: string, cols: Array<{wch:number}>}}
 */
export function buildTestCaseSheet(rows) {
    const aoa = [
        [...RESULT_FIELDS],
        ...rows.map(r => RESULT_FIELDS.map(f => String(r[f] ?? ""))),
    ];
    // A1:<cột cuối><dòng cuối>. Số cột luôn = RESULT_FIELDS.length nên chỉ cần 1 chữ cái khi
    // < 27 cột; hiện là 8. Viết tổng quát để thêm cột không âm thầm hỏng vùng lọc.
    const lastCol = colName(RESULT_FIELDS.length - 1);
    return {
        aoa,
        autofilterRef: `A1:${lastCol}${aoa.length}`,
        cols: RESULT_FIELDS.map(f => ({ wch: WIDTHS[f] ?? 18 })),
    };
}

/** 0 → A, 25 → Z, 26 → AA. */
export function colName(i) {
    let n = i, s = "";
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
}

/**
 * Đọc `testcases-result.md` rồi ghi ra `.xlsx`.
 *
 * @param {object} o
 * @param {string} o.markdown          nội dung testcases-result.md
 * @param {string} [o.outPath]
 * @param {object} [o.XLSX]            tiêm vào để test không phải ghi file thật
 * @returns {Promise<{written: boolean, path: string, rows: number, problems: string[]}>}
 */
export async function exportTestCaseXlsx({ markdown, outPath = P.TESTCASES_XLSX, XLSX = null }) {
    const parsed = parseTestCaseResults(markdown);
    if (!parsed.found) {
        // KHÔNG ghi ra một file Excel rỗng: người nhận mở lên thấy 0 dòng sẽ đọc thành "không
        // test case nào chạy", chứ không đọc thành "khâu xuất file hỏng".
        return { written: false, path: outPath, rows: 0, problems: parsed.problems };
    }

    const lib = XLSX ?? (await import("xlsx")).default;
    const { aoa, autofilterRef, cols } = buildTestCaseSheet(parsed.rows);

    const ws = lib.utils.aoa_to_sheet(aoa);
    ws["!autofilter"] = { ref: autofilterRef };
    ws["!cols"] = cols;
    const wb = lib.utils.book_new();
    lib.utils.book_append_sheet(wb, ws, SHEET_NAME);
    lib.writeFile(wb, outPath);

    return { written: true, path: outPath, rows: parsed.rows.length, problems: parsed.problems };
}
