// Test R1: tách ĐẶC TẢ khỏi KẾT QUẢ, và cột `Kết quả`.
//
// Câu hỏi gốc của người dùng: "cần tách chỗ testcase ra thành file riêng, có OK, NG ở đâu".
// Trước R1, cả hai thứ nằm chung trong `deliverable-test-designer.md` — một file vừa là đặc tả
// vừa là báo cáo có lập luận. Muốn biết "có những test case nào" phải lọc bằng mắt.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const D = await import(abs("agents/runtime/testcase-doc.js"));
const V = await import(abs("agents/qa-verifier/tools/verdict-combiner.js"));
const TD = await import(abs("agents/qa-test-designer/index.js"));

const T = [];
const chk = (n, c, e = "") => T.push([n, c, e]);

const HEAD = `| ${D.TESTCASE_FIELDS.join(" | ")} |\n|${D.TESTCASE_FIELDS.map(() => "---").join("|")}|`;
const row = (id, title, pri = "High") =>
    `| ${id} | ${title} | đã đăng nhập | mở giỏ | voucher_code=SALE20 | thấy "Áp dụng thành công" | ${pri} | [EP] |`;

const DELIVERABLE = `# Deliverable — QA Test Designer

## 1. Coverage Strategy Analysis
Một đoạn văn dài dòng không liên quan.

| Viewpoint | Số idea |
|---|---|
| Happy | 4 |

## 2. Test Cases
${HEAD}
${row("TC-D-001", "Áp mã hợp lệ", "Critical")}
${row("TC-D-002", "Mã hết hạn")}

## 3. Self Count Check
LLM tự khai là đủ.
`;

// ─────────── 1. Trích đúng bảng, bỏ qua bảng khác trong cùng tài liệu ───────────
{
    const r = D.extractTestCases(DELIVERABLE);
    chk("tìm được bảng test case", r.found === true);
    chk(">>> KHÔNG nhặt nhầm bảng 'Coverage Strategy' ở trên (bảng đó không có cột TC_ID)",
        r.rows.length === 2, JSON.stringify(r.rows.map(x => x[0])));
    chk("lấy đúng 8 cột", r.headers.length === 8, r.headers.join("|"));
    chk("không có problem với bảng đúng", r.problems.length === 0, JSON.stringify(r.problems));
}
{
    const r = D.extractTestCases("# Không có bảng nào\n\nchỉ có chữ.");
    chk("không có bảng → báo rõ, không trả bảng rỗng im lặng",
        r.found === false && r.problems.some(p => /Không tìm thấy bảng/.test(p)), JSON.stringify(r.problems));
}
{
    // Một hàng thiếu ô đẩy mọi giá trị sang trái: Priority đọc ra nội dung của Expected Result.
    const bad = `${HEAD}\n| TC-D-001 | Thiếu ô | a | b | c | d | e |`;
    const r = D.extractTestCases(bad);
    chk(">>> hàng thiếu ô → BÁO (nếu không, Priority đọc ra nội dung của cột khác)",
        r.problems.some(p => /7 ô/.test(p)), JSON.stringify(r.problems));
}
{
    const dup = `${HEAD}\n${row("TC-D-001", "A")}\n${row("TC-D-001", "B")}`;
    chk("TC_ID trùng → báo", D.extractTestCases(dup).problems.some(p => /trùng/.test(p)));
}

// ─────────── 2. testcases.md — chỉ đặc tả ───────────
{
    const { rows } = D.extractTestCases(DELIVERABLE);
    const md = D.renderTestCases({ rows, feature: "Voucher", generatedAt: "2026-08-28" });
    chk("có đủ cả 2 test case", /TC-D-001/.test(md) && /TC-D-002/.test(md));
    chk(">>> KHÔNG mang theo lập luận/kiểm đếm (đó là việc của deliverable-test-designer.md)",
        !/Coverage Strategy/.test(md) && !/Self Count Check/.test(md), md.slice(0, 200));
    chk("nói rõ là file sinh tự động, đừng sửa tay", /đừng sửa tay/i.test(md));
    // Đọc lại được chính cái mình vừa ghi — nếu không thì qa-automation không dùng được nó.
    const back = D.extractTestCases(md);
    chk(">>> KHÉP KÍN: render rồi extract lại ra đúng số dòng và đúng TC_ID",
        back.rows.length === rows.length && back.rows[0][0] === "TC-D-001" && back.problems.length === 0,
        JSON.stringify(back.problems));
}
{
    // Dấu `|` trong nội dung sẽ cắt đôi hàng và làm lệch mọi cột phía sau.
    const rows = [["TC-X-001", "Giá 10|20", "p", "s", "d", 'thấy "a|b"', "High", "[EP]"]];
    const back = D.extractTestCases(D.renderTestCases({ rows }));
    chk(">>> ô chứa dấu | vẫn đọc lại đúng 8 cột (escape, không cắt hàng)",
        back.rows[0].length === 8 && back.problems.length === 0,
        JSON.stringify({ n: back.rows[0].length, p: back.problems }));
}

// ─────────── 3. testcases-result.md — cột Kết quả ───────────
{
    const { rows } = D.extractTestCases(DELIVERABLE);
    const md = D.renderTestCaseResults({
        rows,
        byTcId: { "TC-D-001": { ketQua: "OK", nhan: "PASSED", lyDo: "đúng", anh: "", chayLuc: "12:00" } },
        generatedAt: "2026-08-28",
    });
    chk("test case đã chạy hiện đúng kết quả", /TC-D-001 \| Áp mã hợp lệ \| Critical \| OK \| PASSED/.test(md), md);
    chk(">>> test case KHÔNG chạy ghi rõ 'N/A', KHÔNG để ô trống",
        /TC-D-002 \| Mã hết hạn \| High \| N\/A \|/.test(md), md);
    chk("có dòng phân bố để đọc nhanh", /Phân bố:.*OK: 1/.test(md), (md.match(/\*\*Phân bố.*/) ?? [""])[0]);
    chk("nói rõ cột Kết quả là deterministic, không do LLM viết", /KHÔNG do LLM viết/.test(md));

    const back = D.parseTestCaseResults(md);
    chk(">>> KHÉP KÍN: đọc lại file kết quả ra đúng 8 cột, 0 problem",
        back.found && back.rows.length === 2 && back.problems.length === 0, JSON.stringify(back.problems));
    chk("đọc lại lấy đúng giá trị cột Kết quả",
        back.rows[0]["Kết quả"] === "OK" && back.rows[1]["Kết quả"] === "N/A",
        JSON.stringify(back.rows.map(r => r["Kết quả"])));
}
{
    // Ô Kết quả trống đọc vừa như "chưa ai nhìn tới" vừa như "không có gì bất thường".
    const md = `| ${D.RESULT_FIELDS.join(" | ")} |\n|${D.RESULT_FIELDS.map(() => "-").join("|")}|\n| TC-1 | t | High |  | x | y | z | w |`;
    chk(">>> ô Kết quả TRỐNG → báo (hai nghĩa ngược nhau, không được im lặng)",
        D.parseTestCaseResults(md).problems.some(p => /TRỐNG/.test(p)),
        JSON.stringify(D.parseTestCaseResults(md).problems));
}

// ─────────── 4. Cột Kết quả khớp ánh xạ deterministic đang có ───────────
{
    // Không định nghĩa lại bảng ánh xạ ở đây — dùng chính `resultOf()` để hai chỗ không lệch.
    chk("PASSED → OK", V.resultOf(V.LABELS.PASSED) === "OK");
    chk("BEHAVIOR_MISMATCH → NG", V.resultOf(V.LABELS.BEHAVIOR_MISMATCH) === "NG");
    chk("CHECKPOINT_FAILED → NG", V.resultOf(V.LABELS.CHECKPOINT_FAILED) === "NG");
    chk(">>> SPEC_ISSUE → RETEST, KHÔNG phải NG (test hỏng ≠ sản phẩm hỏng — ép thành NG là báo nhầm bug cho dev)",
        V.resultOf(V.LABELS.SPEC_ISSUE) === "RETEST");
    chk(">>> UNCLEAR → CẦN XÁC NHẬN, KHÔNG phải OK (ép thành OK là false-green)",
        V.resultOf(V.LABELS.UNCLEAR) === "CẦN XÁC NHẬN");
    chk("không chạy → N/A", V.resultOf(null) === V.RESULT_NOT_RUN && V.RESULT_NOT_RUN === "N/A");
}

// ─────────── 5. R1.2c — lỗi bọc lồng hai tài liệu ───────────
{
    const inner = `# Deliverable — QA Test Designer\n\n## 1. Coverage Strategy Analysis\nx\n`;
    const check = { ok: true, ideaCount: 4, testCaseCount: 2, blockedCount: 0, issues: [] };

    const plain = TD.assembleDeliverable({ testCases: inner, check });
    chk("LLM tự viết H1 → không bọc thêm (hành vi cũ, vẫn đúng)",
        (plain.match(/^# /gm) ?? []).length === 1, JSON.stringify(plain.match(/^#+ .*/gm)));

    // ĐÂY là ca đã xảy ra thật: model bọc cả tài liệu trong ```markdown … ```
    const fenced = "```markdown\n" + inner + "```";
    const out = TD.assembleDeliverable({ testCases: fenced, check });
    chk(">>> tài liệu bọc trong ```markdown``` vẫn nhận ra H1 → KHÔNG sinh ra file có HAI H1",
        (out.match(/^# /gm) ?? []).length === 1, JSON.stringify(out.match(/^#+ .*/gm)));
    chk(">>> và KHÔNG đẻ ra hai mục cùng số ('## 1. Test Cases' rồi '## 1. Coverage Strategy')",
        !/^## 1\. Test Cases$/m.test(out), JSON.stringify(out.match(/^## .*/gm)));
    chk("dấu fence đã được bóc, không còn ``` trong file", !out.includes("```"), out.slice(0, 120));
}
{
    // Fence Ở GIỮA tài liệu (ví dụ mã trong phần ghi chú) KHÔNG được đụng tới.
    const withCode = "# T\n\nví dụ:\n\n```js\nconst a = 1;\n```\n\nhết.";
    chk("fence ở giữa tài liệu được giữ nguyên", TD.unfence(withCode).includes("```js"), TD.unfence(withCode));
    chk("fence không có ngôn ngữ cũng bóc được", TD.unfence("```\n# T\n```") === "# T", TD.unfence("```\n# T\n```"));
}

let bad = 0;
for (const [n, c, e] of T) { if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + n + (e && !c ? "   → " + String(e).slice(0, 220) : "")); }
console.log(`\ntestcase-doc: ${T.length - bad}/${T.length}`);
process.exit(bad === 0 ? 0 : 1);
