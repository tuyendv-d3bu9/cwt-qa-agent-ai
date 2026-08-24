// Test P2: vòng hỏi-đáp. KHÔNG gọi LLM.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const G = await import(abs("agents/qa-leader/tools/gap-answers.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const form = (a1 = "", a2 = "", a3 = "") => `# Báo cáo thông tin cần làm rõ

---

### GAP-001 · Mâu thuẫn phiên bản BRD

**Vấn đề:** Tồn tại 2 phiên bản BRD (v1.0 và v1.2).

**Nguồn:** \`02_BA/BRD-v1.0.md\` vs \`02_BA/BRD-v1.2.md\`

**Câu hỏi:** Phiên bản nào là bản chính thức?

**Trả lời:**
<!-- Viết câu trả lời của bạn ngay dưới dòng này. Để trống = chưa trả lời. -->
${a1}

---

### GAP-002 · Chat log vs API spec

**Vấn đề:** Chat log bàn thay đổi logic nhưng API spec chưa cập nhật.

**Nguồn:** \`06_Communication/Chat.md\`

**Câu hỏi:** Thay đổi trong chat đã chốt chưa?

**Trả lời:**
${a2}

---

### GAP-003 · CR-005

**Vấn đề:** CR-005 chưa có tài liệu BA tương ứng.

**Nguồn:** \`06_Communication/CR-005.md\`

**Câu hỏi:** CR-005 đã phê duyệt chưa?

**Trả lời:**
${a3}
`;

// ─────────── 1. Form TRỐNG phải bị coi là CHƯA trả lời ───────────
{
    const r = G.parseGapReport(form());
    chk(">>> form để trống -> 3/3 CHƯA trả lời (lỗi cũ: cứ chạy tiếp như đã xong)",
        r.total === 3 && r.unanswered.length === 3 && r.answered.length === 0,
        JSON.stringify({ total: r.total, un: r.unanswered.length }));
    chk("comment hướng dẫn KHÔNG bị tính là câu trả lời", r.questions[0].answer === null);
    chk("đọc đúng id, câu hỏi, nguồn",
        r.questions[0].id === "GAP-001" && r.questions[0].question.includes("chính thức") &&
        r.questions[0].source.includes("BRD-v1.0"), JSON.stringify(r.questions[0]));
}

// ─────────── 2. Trả lời 2/3 -> chỉ thiếu đúng câu thứ 3 ───────────
{
    const r = G.parseGapReport(form("Dùng bản v1.2.", "Đã chốt, sẽ cập nhật API spec."));
    chk(">>> trả lời 2/3 -> báo đúng 1 câu còn thiếu, KHÔNG hỏi lại 2 câu đã trả lời",
        r.answered.length === 2 && r.unanswered.length === 1 && r.unanswered[0].id === "GAP-003",
        JSON.stringify({ answered: r.answered.map(q => q.id), un: r.unanswered.map(q => q.id) }));
    chk("nội dung câu trả lời đọc đúng", r.answered[0].answer === "Dùng bản v1.2.", JSON.stringify(r.answered[0].answer));

    // render lại phải GIỮ câu đã trả lời
    const again = G.parseGapReport(G.renderGapReport(r.questions));
    chk(">>> render lại form: câu đã trả lời được GIỮ NGUYÊN (người dùng không phải điền lại)",
        again.answered.length === 2 && again.answered[0].answer === "Dùng bản v1.2." && again.unanswered.length === 1,
        JSON.stringify(again.answered.map(q => q.answer)));
}

// ─────────── 3. Các dạng "trả lời cho có" vẫn tính là CHƯA ───────────
{
    for (const junk of ["", "   ", "TBD", "n/a", "?", "chưa", "[chưa trả lời]", "<!-- comment thôi -->"]) {
        const r = G.parseGapReport(form(junk));
        chk(`"${junk.trim() || "(rỗng)"}" -> vẫn tính CHƯA trả lời`, r.questions[0].answer === null,
            JSON.stringify(r.questions[0].answer));
    }
    chk("nhưng câu trả lời THẬT thì nhận", G.parseGapReport(form("Bản v1.2")).questions[0].answer === "Bản v1.2");
}

// ─────────── 4. Trả lời nhiều dòng ───────────
{
    const multi = "Dùng bản v1.2.\nLý do: v1.0 là draft, đã bỏ.\n- điểm 1\n- điểm 2";
    const r = G.parseGapReport(form(multi));
    chk("câu trả lời nhiều dòng đọc đủ, không cắt mất", r.questions[0].answer === multi, JSON.stringify(r.questions[0].answer));
}

// ─────────── 5. Biến thành tri thức bền + xác nhận lại ───────────
{
    const r = G.parseGapReport(form("Bản v1.2.", "Đã chốt.", "Đã phê duyệt."));
    const decisions = G.answersToDecisions(r.answered, { stampIso: "2026-08-19T10:00:00.000Z" });
    chk(">>> mỗi câu trả lời thành 1 mục decision (để lần sau KHÔNG hỏi lại)", decisions.length === 3);
    chk("mục decision có cả câu hỏi lẫn câu trả lời + truy được về GAP id",
        decisions[0].title.startsWith("GAP-001") && decisions[0].content.includes("Bản v1.2.") &&
        decisions[0].content.includes("Câu hỏi:") && decisions[0].sourceRef === "GAP-001",
        JSON.stringify(decisions[0]));
    chk("có ngày xác nhận trong nội dung", decisions[0].content.includes("2026-08-19"));

    const lines = G.confirmationLines(r.answered);
    chk(">>> có dòng XÁC NHẬN LẠI để in cho người dùng đọc (điều bạn yêu cầu)",
        lines.length === 3 && lines[0].includes("GAP-001") && lines[0].includes("→ Bản v1.2."),
        JSON.stringify(lines[0]));
}

// ─────────── 6. File sai định dạng -> 0 câu hỏi (để flow-2 báo lỗi định dạng) ───────────
{
    const oldTable = `| STT | Vấn đề | Câu hỏi |\n|---|---|---|\n| 1 | Mâu thuẫn | Bản nào? |`;
    chk(">>> BẢNG kiểu cũ -> parse ra 0 câu hỏi (flow-2 sẽ báo sai định dạng, không im lặng)",
        G.parseGapReport(oldTable).total === 0);
    chk("file rỗng -> 0 câu hỏi", G.parseGapReport("").total === 0);
}

// ─────────── 7. --- và ### trong code block không phá parser ───────────
{
    const withFence = `### GAP-001 · X

**Câu hỏi:** Q?

**Trả lời:**
Xem đoạn dưới:
\`\`\`
---
### GAP-999 · không phải câu hỏi thật
\`\`\`
xong.
`;
    const r = G.parseGapReport(withFence);
    chk("--- và ### trong code block KHÔNG bị hiểu thành câu hỏi mới",
        r.total === 1 && r.questions[0].answer.includes("GAP-999"), JSON.stringify(r.questions.map(q => q.id)));
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
