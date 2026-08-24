// Test P11: cửa kiểm ĐỊNH DẠNG gap-report của qa-leader. KHÔNG gọi LLM.
//
// Vì sao định dạng là chuyện sống chết: sai định dạng KHÔNG trông giống lỗi. File vẫn có, vẫn
// đọc được, nhưng 0 câu hỏi được parse → không có gì để hỏi, không có ô để trả lời, và lần
// chạy sau kết luận "đã đủ thông tin". Một lỗi định dạng biến thành "đã xác nhận xong".
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const G = await import(abs("agents/qa-leader/tools/gap-report-check.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const block = (id, { question = "Giỏ hàng reset thế nào?", answer = "" } = {}) => [
    `### GAP-${id} — Chưa rõ cách reset giỏ hàng`,
    ``,
    `**Vấn đề:** tài liệu không nói.`,
    `**Nguồn:** project-docs/03_DEV/UI-flow.md`,
    `**Câu hỏi:** ${question}`,
    `**Trả lời:** ${answer}`,
    ``,
].join("\n");

// ─────────── 1. Form đúng ───────────
{
    const r = G.checkGapReportFormat(`# Báo cáo\n\n${block("001")}${block("002")}`);
    chk(">>> 2 khối GAP có đủ ô Trả lời (còn trống) → ĐẠT",
        r.ok && r.questionCount === 2, JSON.stringify(r));
    chk("ô Trả lời TRỐNG là đúng với form mới sinh, không phải lỗi", r.issues.length === 0, JSON.stringify(r.issues));
}
{
    const r = G.checkGapReportFormat(block("001", { answer: "Bấm nút Clear Cart" }));
    chk("ô Trả lời đã điền cũng đạt", r.ok, JSON.stringify(r.issues));
}

// ─────────── 2. Văn xuôi, không có khối nào ───────────
{
    const r = G.checkGapReportFormat(
        "Tài liệu thiếu thông tin về cách reset giỏ hàng và luồng của TC-D-016. Cần hỏi lại BA.");
    chk(">>> văn xuôi → 0 câu hỏi → BỊ BẮT (nếu bỏ qua, vòng hỏi–đáp không có câu nào để hỏi)",
        !r.ok && r.questionCount === 0, JSON.stringify(r));
    chk("thông báo chỉ đúng cách sửa: cần khối '### GAP-nnn' và dòng '**Trả lời:**'",
        r.issues[0].includes("### GAP-nnn") && r.issues[0].includes("Trả lời"), r.issues[0]);
}
{
    const r = G.checkGapReportFormat("");
    chk("rỗng cũng bị bắt", !r.ok, JSON.stringify(r.issues));
}

// ─────────── 3. Có khối nhưng THIẾU ô Trả lời ───────────
{
    const noField = [
        `### GAP-001 — Chưa rõ cách reset giỏ hàng`,
        ``,
        `**Vấn đề:** tài liệu không nói.`,
        `**Câu hỏi:** Giỏ hàng reset thế nào?`,
        ``,
    ].join("\n");
    const r = G.checkGapReportFormat(noField);
    chk(">>> có khối mà THIẾU ô '**Trả lời:**' → bị bắt (người dùng không có chỗ trả lời)",
        !r.ok && r.issues.some(i => i.includes("Trả lời")), JSON.stringify(r.issues));
    chk("thông báo nêu đúng id câu thiếu", r.issues.some(i => i.includes("GAP-001")), JSON.stringify(r.issues));
}

// ─────────── 4. Có ô Trả lời nhưng KHÔNG có câu hỏi ───────────
{
    const r = G.checkGapReportFormat(block("001", { question: "" }));
    chk("khối không có nội dung câu hỏi → bị bắt (không biết phải trả lời cái gì)",
        !r.ok && r.issues.some(i => i.includes("nội dung câu hỏi")), JSON.stringify(r.issues));
}

// ─────────── 5. Trộn: một khối đúng, một khối thiếu ───────────
{
    const bad = [
        `### GAP-002 — Luồng TC-D-016`,
        ``,
        `**Câu hỏi:** Hệ thống tự gỡ mã lúc nào?`,
        ``,
    ].join("\n");
    const r = G.checkGapReportFormat(block("001") + bad);
    chk("một khối đúng + một khối thiếu ô → vẫn bị bắt, và nói rõ mấy trên mấy",
        !r.ok && r.questionCount === 2 && r.issues.some(i => i.includes("1/2")), JSON.stringify(r));
}

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\ngap-report-check: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
