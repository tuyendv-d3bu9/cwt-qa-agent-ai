// Test R1.2e: xuất `testcases-result.md` ra Excel.
//
// Bộ này ghi FILE THẬT rồi ĐỌC LẠI bằng chính thư viện xlsx. Không kiểm bằng cách so chuỗi:
// một exporter viết đúng biến trong bộ nhớ mà thư viện không ghi ra được thì vẫn là hỏng, và
// đó chính là chuyện đã xảy ra với style ô — xem chú thích đầu testcase-xlsx.js.

import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const X = await import(abs("agents/qa-reporter/tools/testcase-xlsx.js"));
const D = await import(abs("agents/runtime/testcase-doc.js"));
const XLSX = (await import("xlsx")).default;

const T = [];
const chk = (n, c, e = "") => T.push([n, c, e]);

const tmp = mkdtempSync(path.join(os.tmpdir(), "qa-xlsx-"));

const MD = D.renderTestCaseResults({
    rows: [
        ["TC-D-001", "Áp mã hợp lệ", "đã đăng nhập", "mở giỏ", "d", "e", "Critical", "[EP]"],
        ["TC-D-002", "Mã hết hạn", "đã đăng nhập", "mở giỏ", "d", "e", "High", "[EP]"],
        ["TC-D-003", "Chưa chạy", "x", "y", "d", "e", "Low", "[EP]"],
    ],
    byTcId: {
        "TC-D-001": { ketQua: "OK", nhan: "PASSED", lyDo: "đúng", anh: "", chayLuc: "12:00" },
        "TC-D-002": { ketQua: "NG", nhan: "CHECKPOINT_FAILED", lyDo: "không thấy thông báo", anh: "e/03.jpg", chayLuc: "12:01" },
    },
});

// ─────────── 1. colName ───────────
{
    chk("colName: 0→A, 7→H, 25→Z, 26→AA",
        X.colName(0) === "A" && X.colName(7) === "H" && X.colName(25) === "Z" && X.colName(26) === "AA",
        [X.colName(0), X.colName(7), X.colName(25), X.colName(26)].join(","));
}

// ─────────── 2. buildTestCaseSheet ───────────
{
    const { aoa, autofilterRef, cols } = X.buildTestCaseSheet(D.parseTestCaseResults(MD).rows);
    chk("dòng đầu là tiêu đề đúng thứ tự hợp đồng",
        aoa[0].join("|") === D.RESULT_FIELDS.join("|"), aoa[0].join("|"));
    chk("đủ 3 dòng dữ liệu + 1 dòng tiêu đề", aoa.length === 4, String(aoa.length));
    chk(">>> vùng autofilter phủ HẾT dữ liệu (thiếu dòng cuối = lọc ra thiếu kết quả)",
        autofilterRef === "A1:H4", autofilterRef);
    chk("mỗi cột có bề rộng", cols.length === D.RESULT_FIELDS.length);
}

// ─────────── 3. Ghi file thật rồi đọc lại ───────────
{
    const out = path.join(tmp, "kq.xlsx");
    const r = await X.exportTestCaseXlsx({ markdown: MD, outPath: out, XLSX });
    chk("báo là đã ghi, đúng số dòng", r.written === true && r.rows === 3, JSON.stringify(r));

    const wb = XLSX.readFile(out);
    chk("sheet đặt đúng tên", wb.SheetNames.includes(X.SHEET_NAME), wb.SheetNames.join(","));
    const ws = wb.Sheets[X.SHEET_NAME];
    const back = XLSX.utils.sheet_to_json(ws, { header: 1 });

    chk(">>> ĐỌC LẠI TỪ FILE: tiêu đề đúng", back[0].join("|") === D.RESULT_FIELDS.join("|"), back[0].join("|"));
    chk(">>> ĐỌC LẠI TỪ FILE: OK/NG nằm đúng cột 'Kết quả'",
        back[1][3] === "OK" && back[2][3] === "NG", JSON.stringify([back[1][3], back[2][3]]));
    chk(">>> ĐỌC LẠI TỪ FILE: test case chưa chạy là 'N/A', không phải ô trống",
        back[3][3] === "N/A", JSON.stringify(back[3]));
    chk("giữ được nhãn deterministic để truy ngược", back[2][4] === "CHECKPOINT_FAILED", String(back[2][4]));
    chk("giữ được đường dẫn ảnh bước lỗi", back[2][6] === "e/03.jpg", String(back[2][6]));

    // Đây là thứ THAY cho tô màu — nếu nó không round-trip thì người nhận không lọc được NG.
    chk(">>> autofilter SỐNG SÓT qua ghi/đọc (đây là thứ thay cho tô màu, xlsx community không tô được)",
        ws["!autofilter"]?.ref === "A1:H4", JSON.stringify(ws["!autofilter"] ?? null));
}

// ─────────── 4. Không có bảng → KHÔNG ghi file rỗng ───────────
{
    const out = path.join(tmp, "rong.xlsx");
    const r = await X.exportTestCaseXlsx({ markdown: "# chả có bảng nào", outPath: out, XLSX });
    chk(">>> không parse được → KHÔNG ghi file (Excel 0 dòng đọc như 'không test case nào chạy')",
        r.written === false && r.problems.length > 0, JSON.stringify(r));
    let exists = true;
    try { XLSX.readFile(out); } catch { exists = false; }
    chk("và file thật sự không được tạo ra", exists === false);
}

rmSync(tmp, { recursive: true, force: true });

let bad = 0;
for (const [n, c, e] of T) { if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + n + (e && !c ? "   → " + String(e).slice(0, 200) : "")); }
console.log(`\ntestcase-xlsx: ${T.length - bad}/${T.length}`);
process.exit(bad === 0 ? 0 : 1);
