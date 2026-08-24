// Test P1: agent-loop.js + tools.js declarationsFor().
// LLM và execute đều là GIẢ -> không gọi mạng, không tốn token, chạy được offline.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const { runAgentLoop, fileToolExecutor } = await import(abs("agents/runtime/agent-loop.js"));
const { declarationsFor, TOOLS, runTool } = await import(abs("agents/runtime/tools.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

/** LLM giả: phát lần lượt các phản hồi đã script sẵn, và ghi lại contents nhận được. */
function fakeLLM(script) {
    const seen = [];
    const fn = async ({ contents }) => {
        seen.push(JSON.parse(JSON.stringify(contents)));
        const next = script.shift();
        if (!next) throw new Error("fakeLLM: hết script mà loop vẫn gọi tiếp");
        return { text: next.text ?? "", functionCalls: next.calls ?? [], usage: { promptTokenCount: 10, candidatesTokenCount: 5 } };
    };
    fn.seen = seen;
    return fn;
}
const noTools = [{ name: "read_file", description: "d", parameters: { type: "object", properties: {} } }];

// ─────────── 1. Có tool call -> lặp, và agent PHẢI thấy kết quả ───────────
{
    const llm = fakeLLM([
        { calls: [{ name: "read_file", args: { path: "a.md" } }] },
        { text: "xong" },
    ]);
    const r = await runAgentLoop({
        system: "s", task: "t", tools: noTools, llm, verbose: false,
        execute: async () => ({ content: "NỘI-DUNG-THẬT" }),
    });
    chk(">>> có tool call -> lặp tiếp, không dừng ở lượt đầu", r.steps === 1 && r.text === "xong", JSON.stringify(r.text));

    const turns = llm.seen[1];  // contents của lần gọi LLM thứ 2
    const hasModelCall = turns.some(t => t.role === "model" && t.parts.some(p => p.functionCall));
    const seesResult = JSON.stringify(turns).includes("NỘI-DUNG-THẬT");
    chk(">>> agent THẤY kết quả hành động của mình (điều đang thiếu hoàn toàn)", seesResult, JSON.stringify(turns).slice(0, 300));
    chk("lượt của model được ghi lại (không thì model hỏi lại vô hạn)", hasModelCall);
    chk("đếm token thật, không tuyên bố", r.usage.llmCalls === 2 && r.usage.promptTokens === 20);
}

// ─────────── 2. selfCheck fail -> phản hồi lỗi rồi cho sửa ───────────
{
    const llm = fakeLLM([{ text: "bản xấu" }, { text: "bản tốt" }]);
    let call = 0;
    const r = await runAgentLoop({
        system: "s", task: "t", llm, verbose: false,
        selfCheck: () => (++call === 1 ? { ok: false, issues: ["thiếu cột TC_ID"] } : { ok: true }),
    });
    chk(">>> selfCheck fail -> agent được SỬA, không phải chỉ ghi chú 'CHƯA ĐẠT'",
        r.ok === true && r.text === "bản tốt" && r.revisions === 1, JSON.stringify({ ok: r.ok, text: r.text, rev: r.revisions }));
    chk("vi phạm cụ thể được đưa vào hội thoại cho model đọc",
        JSON.stringify(llm.seen[1]).includes("thiếu cột TC_ID"));
    chk("bản trả lời cũ vẫn nằm trong contents -> là SỬA chứ không viết lại từ đầu",
        llm.seen[1].some(t => t.role === "model" && t.parts.some(p => p.text === "bản xấu")));
}

// ─────────── 3. Hết ngân sách -> nói rõ, KHÔNG giả vờ xong ───────────
{
    const llm = fakeLLM([{ text: "vẫn xấu" }, { text: "vẫn xấu" }, { text: "vẫn xấu" }, { text: "vẫn xấu" }]);
    const r = await runAgentLoop({
        system: "s", task: "t", llm, verbose: false, maxRevisions: 2,
        selfCheck: () => ({ ok: false, issues: ["vẫn thiếu"] }),
    });
    chk(">>> sửa hết lượt vẫn chưa đạt -> ok:false + exhausted:'revisions', KHÔNG âm thầm coi là xong",
        r.ok === false && r.exhausted === "revisions" && r.issues.length === 1, JSON.stringify({ ok: r.ok, ex: r.exhausted }));
}
{
    const llm = fakeLLM([
        { calls: [{ name: "read_file", args: { path: "a" } }] },
        { calls: [{ name: "read_file", args: { path: "b" } }] },
        { calls: [{ name: "read_file", args: { path: "c" } }] },
    ]);
    const r = await runAgentLoop({
        system: "s", task: "t", tools: noTools, llm, verbose: false, maxSteps: 2,
        execute: async () => ({ ok: true }),
    });
    chk(">>> hết ngân sách bước tool -> dừng đúng mốc, exhausted:'steps'",
        r.exhausted === "steps" && r.steps === 2 && r.ok === false, JSON.stringify({ ex: r.exhausted, steps: r.steps }));
}

// ─────────── 4. Tool lỗi: agent thấy lỗi, và lặp lại y hệt thì bị chặn ───────────
{
    const llm = fakeLLM([
        { calls: [{ name: "read_file", args: { path: "khong-co.md" } }] },
        { calls: [{ name: "read_file", args: { path: "khong-co.md" } }] },   // lặp y hệt
        { text: "đành chịu" },
    ]);
    const r = await runAgentLoop({
        system: "s", task: "t", tools: noTools, llm, verbose: false,
        execute: async () => ({ error: "ENOENT" }),
    });
    chk("lỗi tool được đưa nguyên vào hội thoại (không bị nuốt)",
        JSON.stringify(llm.seen[1]).includes("ENOENT"));
    chk(">>> gọi lại Y HỆT lời gọi đang lỗi -> bị cảnh báo, không để đốt hết ngân sách",
        JSON.stringify(llm.seen[2]).includes("LẦN THỨ HAI"), JSON.stringify(llm.seen[2]).slice(0, 200));
    chk("toolCalls ghi lại đủ và đánh dấu failed", r.toolCalls.length === 2 && r.toolCalls.every(c => c.failed));
}

// ─────────── 5. execute throw -> thành lỗi thấy được, không sập loop ───────────
{
    const llm = fakeLLM([{ calls: [{ name: "read_file", args: {} }] }, { text: "ok" }]);
    const r = await runAgentLoop({
        system: "s", task: "t", tools: noTools, llm, verbose: false,
        execute: async () => { throw new Error("BOOM"); },
    });
    chk("execute() throw -> biến thành lỗi thấy được, loop vẫn chạy tiếp",
        r.text === "ok" && JSON.stringify(llm.seen[1]).includes("BOOM"));
}

// ─────────── 6. Khai tool mà thiếu execute -> nổ ngay, không chạy mù ───────────
{
    let threw = false;
    try {
        await runAgentLoop({ system: "s", task: "t", tools: noTools, llm: fakeLLM([{ text: "x" }]), verbose: false });
    } catch { threw = true; }
    chk("khai tool nhưng thiếu execute -> throw ngay lúc gọi", threw);
}

// ─────────── 7. fileToolExecutor chặn tool ngoài danh sách ───────────
{
    const exec = fileToolExecutor(runTool, ["read_file"]);
    const denied = await exec("delete_file", { path: "x" });
    chk(">>> model gọi tool KHÔNG được cấp -> bị chặn, dù Gemini chỉ nên gọi tool đã khai",
        Boolean(denied.error) && denied.error.includes("không nằm trong danh sách"), JSON.stringify(denied));
    const ok = await exec("read_file", { path: "package.json" });
    chk("tool được cấp thì chạy bình thường", !ok.error && ok.content.includes("qa-agent"));
}

// ─────────── 8. declarationsFor: schema đủ dùng cho Gemini ───────────
{
    const decls = declarationsFor(["read_file", "list_files", "file_exists"]);
    chk("declarationsFor trả đúng 3 tool, mỗi tool có name/description/parameters",
        decls.length === 3 && decls.every(d => d.name && d.description && d.parameters?.type === "object"));
    chk("mỗi tool khai required đúng", decls.find(d => d.name === "list_files").parameters.required[0] === "dir");
    let threw = false;
    try { declarationsFor(["khong_ton_tai"]); } catch { threw = true; }
    chk(">>> tên tool sai -> throw, KHÔNG âm thầm cấp ít quyền hơn tác giả tưởng", threw);
    chk("mọi tool trong registry đều có schema (không bỏ sót cái nào)",
        Object.keys(TOOLS).every(n => TOOLS[n].description && TOOLS[n].parameters),
        Object.keys(TOOLS).filter(n => !TOOLS[n].parameters).join(","));
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
