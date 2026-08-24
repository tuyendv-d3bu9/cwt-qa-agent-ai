// agents/runtime/md-table.js
// Đọc MỘT bảng Markdown xác định trong một tài liệu, theo ô đầu của dòng tiêu đề.
//
// VÌ SAO CÓ FILE NÀY — lỗi đo được trên lần chạy thật 2026-08-24.
// Ba nơi tự parse bảng test case bằng cùng một dòng:
//     lines.filter(l => l.trim().startsWith("|") && !l.includes("---"))
// Dòng đó lấy MỌI dòng bắt đầu bằng `|` trong CẢ tài liệu. Nhưng deliverable của
// qa-test-designer có BA bảng: Coverage Strategy Map (5 cột), Boundary Sets, và bảng
// test case (8 cột). Nên bộ kiểm coverage-check đọc 21 dòng của Coverage Strategy Map
// thành 21 test case hỏng và báo:
//     "TC_ID sai format: Test Idea (từ Analyst), Nhập mã voucher không tồn tại, ..."
// Phần tử đầu là Ô TIÊU ĐỀ của bảng khác — dấu hiệu duy nhất cho thấy lỗi ở bộ kiểm,
// không ở nội dung. Bảng test case thật lúc đó ĐÚNG: 21 dòng TC-D-001..021, đủ 8 trường.
//
// Cửa duyệt báo sai còn tệ hơn không có cửa: người viết đi sửa thứ đang đúng, và lần sau
// họ tin cửa nào cũng nói dối. Nên phạm vi bảng là điều kiện bắt buộc, không phải tinh chỉnh.

/** Ô ngăn cách GFM: chỉ gạch + dấu hai chấm căn lề — `---`, `:-:`, `-`, `:--`. */
export const isSeparatorCell = (cell) => /^:?-+:?$/.test(String(cell).trim());

/** Cả dòng là dòng ngăn cách (mọi ô đều là ô ngăn cách, và có ít nhất 1 ô). */
export const isSeparatorRow = (cells) => cells.length > 0 && cells.every(isSeparatorCell);

/**
 * Tách một dòng `| a | b |` thành ["a", "b"].
 *
 * Tôn trọng `\|` thoát nghĩa của GFM — nội dung test case có thể chứa `|` trong Expected
 * Result. Cắt bằng String.split("|") thì một ô thoát nghĩa sẽ tách thành hai, đẩy lệch mọi
 * cột sau nó: Priority rơi vào chỗ Expected Result mà không có gì báo.
 */
export function splitRow(line) {
    const raw = String(line).trim();
    if (!raw.startsWith("|")) return [];

    const cells = [];
    let cur = "";
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === "\\" && raw[i + 1] === "|") { cur += "|"; i++; continue; }
        if (ch === "|") { cells.push(cur); cur = ""; continue; }
        cur += ch;
    }
    cells.push(cur);
    // `|a|b|` cho phần tử rỗng ở đầu và cuối — bỏ đúng hai phần tử đó, không dùng
    // filter(Boolean) vì một ô rỗng THẬT ở giữa là lỗi cần báo, không phải thứ để lặng lẽ bỏ.
    return cells.slice(1, cells.length - 1).map(c => c.trim());
}

/**
 * Tìm bảng có ô đầu dòng tiêu đề khớp `firstHeaderCell`.
 *
 * Gộp MỌI khối khớp, không chỉ khối đầu: một LLM viết 21 dòng rất dễ chèn câu văn giữa
 * bảng, làm bảng vỡ thành hai khối. Lấy khối đầu thì im lặng mất một nửa số dòng — đúng
 * loại hỏng mà cửa duyệt phải bắt, không phải gây ra.
 *
 * @param {string} markdown
 * @param {{ firstHeaderCell: string|RegExp }} o  ô đầu tiên của dòng tiêu đề (khớp cả dòng, không phân biệt hoa thường)
 * @returns {{ found: boolean, blocks: number, headers: string[], rows: string[][], headerLines: number[] }}
 */
export function findTable(markdown, { firstHeaderCell }) {
    const matchHeader = firstHeaderCell instanceof RegExp
        ? (cell) => firstHeaderCell.test(cell)
        : (cell) => cell.trim().toLowerCase() === String(firstHeaderCell).trim().toLowerCase();

    const lines = String(markdown ?? "").split("\n");
    const rows = [];
    const headerLines = [];
    let headers = [];
    let blocks = 0;

    for (let i = 0; i < lines.length; i++) {
        const cells = splitRow(lines[i]);
        if (cells.length === 0 || !matchHeader(cells[0] ?? "")) continue;

        blocks++;
        headerLines.push(i + 1);
        if (headers.length === 0) headers = cells;

        // Chỉ nhận các dòng `|` LIỀN NHAU ngay sau tiêu đề. Gặp dòng không bắt đầu bằng `|`
        // là hết bảng — đây chính là chỗ bản cũ không có, nên nó chạy tiếp tới cuối file.
        for (let j = i + 1; j < lines.length; j++) {
            const row = splitRow(lines[j]);
            if (row.length === 0) { i = j - 1; break; }
            if (isSeparatorRow(row)) continue;
            // Một tiêu đề nữa xuất hiện = khối mới, để vòng ngoài xử lý.
            if (matchHeader(row[0] ?? "")) { i = j - 1; break; }
            rows.push(row);
            if (j === lines.length - 1) i = j;
        }
    }

    return { found: blocks > 0, blocks, headers, rows, headerLines };
}
