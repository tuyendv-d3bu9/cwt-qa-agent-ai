// Test: assembleDeliverable() của qa-test-designer.
// KHÔNG gọi LLM, KHÔNG DB (knowledge.js chỉ mở DB trong thân hàm, không lúc import).
//
// Bộ này sinh ra từ lần chạy thật 2026-08-24: file deliverable có HAI H1, số mục đụng nhau
// (`## 1. Test Cases` rồi ngay dưới `## 1. Coverage Strategy Map`), và HAI mục "Self Count
// Check" nói ngược nhau — mục LLM tự khai nói đủ hết, mục tool nói CHƯA ĐẠT. Người đọc không
// có cách nào biết mục nào là thước đo.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const TD = await import(abs("agents/qa-test-designer/index.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const h1 = (s) => (s.match(/^#\s+\S/gm) || []).length;
const OK = { ok: true, ideaCount: 20, testCaseCount: 21, blockedCount: 0, issues: [] };
const BAD = { ok: false, ideaCount: 20, testCaseCount: 3, blockedCount: 0, issues: ["thiếu 17 test case."] };

// ─────────── 1. LLM trả về tài liệu đầy đủ (có H1 riêng) ───────────
{
    const body = [
        "# Deliverable — QA Test Designer",
        "",
        "## 1. Coverage Strategy Map",
        "| Test Idea | Viewpoint |",
        "|---|---|",
        "| a | Negative |",
        "",
        "## 3. Test Cases",
        "| TC_ID | Title |",
        "|---|---|",
        "| TC-D-001 | A |",
        "",
        "## 4. Self Count Check (deterministic, tool coverage-check.js)",
        "- Total Test Cases Generated: 21",
    ].join("\n");
    const out = TD.assembleDeliverable({ testCases: body, check: OK });

    chk(">>> KHÔNG bọc thêm H1 khi LLM đã có H1", h1(out) === 1, `${h1(out)} H1`);
    chk(">>> KHÔNG thêm '## 1. Test Cases' đụng số với mục của LLM",
        !/##\s*1\.\s*Test Cases/.test(out));
    chk(">>> giữ nguyên toàn bộ thân LLM", out.includes("## 3. Test Cases") && out.includes("| TC-D-001 | A |"));
    // Hai mục cùng tên là cái bẫy: một cái là LLM tự khai, một cái là số đo.
    chk(">>> mục của tool KHÔNG mang số, không đụng '## 4.' của LLM",
        /##\s*Kiểm đếm bằng tool/.test(out) && !/##\s*\d+\.\s*Kiểm đếm/.test(out));
    chk(">>> dán nhãn mục self-count của LLM là TỰ KHAI",
        /do LLM TỰ KHAI, chưa qua đo/.test(out), out.slice(-300));
    chk(">>> mục đo bằng tool nằm CUỐI file",
        out.trimEnd().lastIndexOf("## Kiểm đếm bằng tool") > out.lastIndexOf("## 4. Self Count Check"));
    chk(">>> ghi số đo thật khi đạt",
        /idea Analyst: 20, test case: 21, blocked: 0/.test(out), out.slice(-200));
}

// ─────────── 2. LLM chỉ trả về bảng (không có H1) ───────────
{
    const body = "| TC_ID | Title |\n|---|---|\n| TC-D-001 | A |";
    const out = TD.assembleDeliverable({ testCases: body, check: OK });
    chk(">>> tự thêm H1 khi LLM không có", h1(out) === 1 && /^#\s+Deliverable — QA Test Designer/.test(out),
        `${h1(out)} H1`);
    chk(">>> có mục '## 1. Test Cases' bọc bảng", /##\s*1\.\s*Test Cases/.test(out));
    chk(">>> KHÔNG dán nhãn tự-khai khi LLM không tự khai",
        !/do LLM TỰ KHAI/.test(out));
    chk(">>> vẫn có mục đo bằng tool", /##\s*Kiểm đếm bằng tool/.test(out));
}

// ─────────── 3. Gate chưa đạt phải hiện nguyên văn lý do ───────────
{
    const out = TD.assembleDeliverable({ testCases: "| TC_ID | Title |\n|---|---|\n| TC-D-001 | A |", check: BAD });
    chk(">>> in **CHƯA ĐẠT** khi gate hỏng", /\*\*CHƯA ĐẠT\*\*/.test(out));
    chk(">>> in nguyên văn lý do, không tóm tắt mất thông tin",
        out.includes("thiếu 17 test case."), out.slice(-200));
}

// ─────────── 4. Đầu vào rỗng / null không nổ ───────────
{
    for (const v of [undefined, null, "", "   \n  "]) {
        let out = null, err = null;
        try { out = TD.assembleDeliverable({ testCases: v, check: OK }); } catch (e) { err = e; }
        chk(`>>> testCases=${JSON.stringify(v)} không nổ`, err === null && typeof out === "string",
            err?.message ?? "");
        chk(`>>> testCases=${JSON.stringify(v)} vẫn có mục đo`, /##\s*Kiểm đếm bằng tool/.test(out ?? ""));
    }
}

// ─────────── Tổng kết ───────────
let bad = 0;
for (const [name, cond, extra] of P) {
    if (!cond) { bad++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ""}`); }
}
console.log(`designer-assemble: ${P.length - bad}/${P.length}`);
process.exit(bad === 0 ? 0 : 1);
