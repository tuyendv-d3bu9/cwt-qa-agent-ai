// Test: agents/runtime/md-table.js + phạm vi bảng của coverage-check.
// KHÔNG gọi LLM, KHÔNG DB, KHÔNG đọc đĩa ngoài repo.
//
// Bộ này sinh ra từ một lỗi thật trên lần chạy 2026-08-24: bộ kiểm coverage đọc bảng
// "Coverage Strategy Map" thành 21 test case sai format, trong khi bảng test case thật đủ 21
// dòng hợp lệ. Ca "tài liệu có NHIỀU bảng" là ca chính của bộ này.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const T = await import(abs("agents/runtime/md-table.js"));
const CC = await import(abs("agents/qa-test-designer/tools/coverage-check.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const TC = { firstHeaderCell: /^TC[_\s-]?ID$/i };

// ─────────── 1. splitRow ───────────
{
    chk(">>> tách ô cơ bản, bỏ phần tử rỗng đầu/cuối",
        JSON.stringify(T.splitRow("| a | b | c |")) === '["a","b","c"]',
        JSON.stringify(T.splitRow("| a | b | c |")));

    chk(">>> dòng không bắt đầu bằng | trả về mảng rỗng",
        T.splitRow("Đây là câu văn").length === 0);

    // Ô rỗng THẬT ở giữa phải giữ lại — đó là lỗi cần báo, không phải thứ để lặng lẽ bỏ.
    chk(">>> giữ ô rỗng ở giữa (để gate báo 'thiếu trường')",
        JSON.stringify(T.splitRow("| a |  | c |")) === '["a","","c"]',
        JSON.stringify(T.splitRow("| a |  | c |")));

    // `\|` thoát nghĩa: cắt bằng split("|") sẽ tách 1 ô thành 2 và đẩy lệch mọi cột sau nó.
    chk(">>> tôn trọng \\| thoát nghĩa, không đẩy lệch cột",
        JSON.stringify(T.splitRow("| a | x \\| y | c |")) === '["a","x | y","c"]',
        JSON.stringify(T.splitRow("| a | x \\| y | c |")));
}

// ─────────── 2. dòng ngăn cách ───────────
{
    chk(">>> nhận --- là dòng ngăn cách", T.isSeparatorRow(["---", "---"]));
    // GFM cho phép một gạch: `|-|-|` — phép thử includes("---") cũ KHÔNG nhận ra, nên dòng
    // ngăn cách trở thành dòng dữ liệu rồi trượt kiểm TC_ID với thông báo "TC_ID sai format: -".
    chk(">>> nhận |-|-| một gạch là dòng ngăn cách", T.isSeparatorRow(["-", "-"]));
    chk(">>> nhận :-: căn lề là dòng ngăn cách", T.isSeparatorRow([":-:", ":--", "--:"]));
    chk(">>> KHÔNG coi dòng dữ liệu là ngăn cách", !T.isSeparatorRow(["TC-D-001", "Tiêu đề"]));
    chk(">>> mảng rỗng không phải dòng ngăn cách", !T.isSeparatorRow([]));
}

// ─────────── 3. findTable: CA CHÍNH — nhiều bảng trong một tài liệu ───────────
{
    // Đúng hình dạng file thật: Coverage Strategy Map (5 cột) → Boundary set (3 cột) → test case (8 cột).
    const doc = [
        "# Deliverable — QA Test Designer",
        "",
        "## 1. Coverage Strategy Map",
        "",
        "| Test Idea (từ Analyst) | Viewpoint | Likelihood × Impact | Technique | Tags / Note |",
        "|---|---|---|---|---|",
        "| Nhập mã voucher không tồn tại | Negative | Medium × High | EP | `[EP]` |",
        "| Nhập mã voucher chữ thường | Negative | Low × Medium | EP | `[EP]` |",
        "",
        "## 2. Boundary Sets",
        "",
        "| Giá trị | Loại | Kỳ vọng |",
        "|---|---|---|",
        "| 199999 | dưới ngưỡng | từ chối |",
        "",
        "## 3. Test Cases",
        "",
        "| TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags |",
        "|---|---|---|---|---|---|---|---|",
        "| TC-D-001 | Áp mã hợp lệ | Giỏ có hàng | 1. Vào checkout | `SALE20` | Giảm đúng | Critical | `[EP]` |",
        "| TC-D-002 | Mã không tồn tại | Giỏ có hàng | 1. Vào checkout | `KHONGCO` | Báo lỗi | High | `[Negative]` |",
        "",
        "## 4. Self Count Check",
        "- Total: 2",
    ].join("\n");

    const t = T.findTable(doc, TC);
    chk(">>> CHỈ đọc bảng test case, bỏ 2 bảng khác (2 dòng, không phải 5)",
        t.rows.length === 2, `đọc được ${t.rows.length} dòng`);
    chk(">>> mọi dòng đủ 8 cột", t.rows.every(r => r.length === 8),
        JSON.stringify(t.rows.map(r => r.length)));
    chk(">>> TC_ID đọc đúng", t.rows[0][0] === "TC-D-001" && t.rows[1][0] === "TC-D-002",
        `${t.rows[0][0]}, ${t.rows[1][0]}`);
    chk(">>> KHÔNG lấy ô tiêu đề bảng khác làm dữ liệu",
        !t.rows.some(r => r[0].includes("Test Idea")));
    chk(">>> dừng ở dòng không phải bảng, không chạy tới cuối file",
        !t.rows.some(r => r.join("").includes("Total")));
    chk(">>> headers là tiêu đề bảng test case", t.headers[0] === "TC_ID" && t.headers.length === 8,
        JSON.stringify(t.headers));

    // Chính là thông báo lỗi người dùng gặp: gate cũ liệt kê ô tiêu đề bảng khác làm TC_ID sai.
    const bad = CC.parseTestCaseRows(doc).map(r => r[0]);
    chk(">>> coverage-check không còn báo tiêu đề bảng khác là TC_ID sai",
        !bad.includes("Test Idea (từ Analyst)"), JSON.stringify(bad));
}

// ─────────── 4. findTable: bảng bị vỡ thành nhiều khối ───────────
{
    // LLM viết 21 dòng rất dễ chèn câu văn giữa bảng rồi mở lại tiêu đề. Lấy khối đầu thì
    // im lặng mất nửa số dòng — đúng loại hỏng mà cửa duyệt phải bắt, không phải gây ra.
    const doc = [
        "| TC_ID | Title |",
        "|---|---|",
        "| TC-D-001 | A |",
        "",
        "(tiếp phần còn lại)",
        "",
        "| TC_ID | Title |",
        "|---|---|",
        "| TC-D-002 | B |",
    ].join("\n");
    const t = T.findTable(doc, TC);
    chk(">>> gộp cả 2 khối cùng tiêu đề, không mất dòng",
        t.rows.length === 2 && t.blocks === 2, `rows=${t.rows.length} blocks=${t.blocks}`);
    chk(">>> báo số khối để nơi gọi biết bảng bị vỡ", t.blocks === 2);
}

// ─────────── 5. findTable: không có bảng ───────────
{
    const t = T.findTable("Không có bảng nào ở đây.\n\n| Cột khác | X |\n|---|---|\n| 1 | 2 |", TC);
    chk(">>> found=false khi không có bảng khớp tiêu đề", t.found === false && t.rows.length === 0,
        `found=${t.found} rows=${t.rows.length}`);
    chk(">>> chuỗi rỗng / null không nổ",
        T.findTable("", TC).rows.length === 0 && T.findTable(null, TC).rows.length === 0);
}

// ─────────── 6. verifyDeliverable: thiếu bảng phải nói THIẾU BẢNG ───────────
{
    const analyst = "### Viewpoint 1: X\n- idea một\n- idea hai\n";
    const noTable = "## 1. Coverage Strategy Map\n\n| Test Idea | Viewpoint |\n|---|---|\n| a | Negative |\n";
    const r = CC.verifyDeliverable({ deliverableAnalystMarkdown: analyst, testCaseMarkdown: noTable });
    chk(">>> thiếu bảng thì CHƯA ĐẠT", r.ok === false);
    // Hai nguyên nhân khác nhau cần hai câu sửa khác nhau: viết lại tiêu đề bảng ≠ viết thêm test case.
    chk(">>> nói rõ 'không tìm thấy bảng', KHÔNG đổ thành 'bỏ sót idea'",
        r.issues.some(i => /Không tìm thấy bảng test case/.test(i))
        && !r.issues.some(i => /bị bỏ sót/.test(i)),
        JSON.stringify(r.issues));
    chk(">>> testCaseCount = 0 khi không có bảng", r.testCaseCount === 0, String(r.testCaseCount));
}

// ─────────── 7. verifyDeliverable: bảng đúng thì ĐẠT, không bị bảng khác làm hỏng ───────────
{
    const analyst = "### Viewpoint 1: X\n- idea một\n- idea hai\n";
    const doc = [
        "| Test Idea (từ Analyst) | Viewpoint |",
        "|---|---|",
        "| idea một | Negative |",
        "| idea hai | Boundary |",
        "",
        "| TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags |",
        "|---|---|---|---|---|---|---|---|",
        "| TC-D-001 | A | P | 1. x | d | e | High | `[EP]` |",
        "| TC-D-002 | B | P | 1. y | d | e | Low | `[EP]` |",
    ].join("\n");
    const r = CC.verifyDeliverable({ deliverableAnalystMarkdown: analyst, testCaseMarkdown: doc });
    chk(">>> bảng test case đúng thì ĐẠT dù tài liệu có bảng khác", r.ok === true, JSON.stringify(r.issues));
    chk(">>> đếm đúng 2 test case", r.testCaseCount === 2, String(r.testCaseCount));
}

// ─────────── 8. verifyDeliverable: các cửa cũ vẫn phải bắt được ───────────
{
    const analyst = "### Viewpoint 1: X\n- idea một\n";
    const mk = (rows) => [
        "| TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags |",
        "|---|---|---|---|---|---|---|---|",
        ...rows,
    ].join("\n");

    const dup = CC.verifyDeliverable({
        deliverableAnalystMarkdown: analyst,
        testCaseMarkdown: mk(["| TC-D-001 | A | P | S | D | E | High | T |", "| TC-D-001 | B | P | S | D | E | Low | T |"]),
    });
    chk(">>> vẫn bắt TC_ID trùng", dup.issues.some(i => /TC_ID trùng/.test(i)), JSON.stringify(dup.issues));

    const badId = CC.verifyDeliverable({
        deliverableAnalystMarkdown: analyst,
        testCaseMarkdown: mk(["| XX-1 | A | P | S | D | E | High | T |"]),
    });
    chk(">>> vẫn bắt TC_ID sai format", badId.issues.some(i => /sai format/.test(i)), JSON.stringify(badId.issues));

    // Mã feature KHÔNG cố định là "D" — dự án khác có mã khác.
    const otherFeature = CC.verifyDeliverable({
        deliverableAnalystMarkdown: analyst,
        testCaseMarkdown: mk(["| TC-CHECKOUT-007 | A | P | S | D | E | High | T |"]),
    });
    chk(">>> mã feature khác 'D' vẫn hợp lệ",
        !otherFeature.issues.some(i => /sai format/.test(i)), JSON.stringify(otherFeature.issues));

    const empty = CC.verifyDeliverable({
        deliverableAnalystMarkdown: analyst,
        testCaseMarkdown: mk(["| TC-D-001 | A | P | S | D |  | High | T |"]),
    });
    chk(">>> vẫn bắt ô rỗng (thiếu trường)", empty.issues.some(i => /thiếu trường/.test(i)), JSON.stringify(empty.issues));

    const short = CC.verifyDeliverable({
        deliverableAnalystMarkdown: analyst,
        testCaseMarkdown: mk(["| TC-D-001 | A | P | S | D | E |"]),
    });
    chk(">>> vẫn bắt thiếu cột", short.issues.some(i => /thiếu trường/.test(i)), JSON.stringify(short.issues));

    // Dòng ngăn cách một gạch không được thành dòng dữ liệu.
    const oneDash = CC.verifyDeliverable({
        deliverableAnalystMarkdown: analyst,
        testCaseMarkdown: [
            "| TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags |",
            "|-|-|-|-|-|-|-|-|",
            "| TC-D-001 | A | P | S | D | E | High | T |",
        ].join("\n"),
    });
    chk(">>> dòng ngăn cách |-| không bị đọc thành test case",
        oneDash.testCaseCount === 1 && !oneDash.issues.some(i => /sai format/.test(i)),
        `count=${oneDash.testCaseCount} ${JSON.stringify(oneDash.issues)}`);
}

// ─────────── 9. testcase-exporter dùng cùng phạm vi ───────────
{
    const EX = await import(abs("agents/qa-automation/tools/testcase-exporter.js"));
    const doc = [
        "| Test Idea (từ Analyst) | Viewpoint | Likelihood × Impact | Technique | Tags |",
        "|---|---|---|---|---|",
        "| idea một | Negative | Low × Low | EP | `[EP]` |",
        "",
        "| TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags |",
        "|---|---|---|---|---|---|---|---|",
        "| TC-D-001 | A | P | 1. x | voucher_code=SALE20 | E | High | `[EP]` |",
    ].join("\n");
    const out = EX.parseTestCaseTable(doc);
    chk(">>> exporter đọc đúng 1 test case", out.rows.length === 1, String(out.rows.length));
    // Bảng 5 cột của skill 01 từng rơi vào malformed và in ra 21 dòng lỗi giả, che lỗi thật.
    chk(">>> exporter KHÔNG báo bảng khác là 'sai số cột'",
        out.malformed.length === 0, JSON.stringify(out.malformed));
    chk(">>> exporter đọc đúng tên trường", out.rows[0].TC_ID === "TC-D-001" && out.rows[0].Priority === "High",
        JSON.stringify(out.rows[0]));
}

// ─────────── Tổng kết ───────────
let bad = 0;
for (const [name, cond, extra] of P) {
    if (!cond) { bad++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ""}`); }
}
console.log(`md-table: ${P.length - bad}/${P.length}`);
process.exit(bad === 0 ? 0 : 1);
