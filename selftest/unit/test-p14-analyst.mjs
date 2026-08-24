// Test P1.4: qa-analyst đã thật sự là agent chưa.
// Tool THẬT (đọc project-docs thật), executor THẬT, selfCheck THẬT của analyst.
// Chỉ LLM là giả -> không tốn token, nhưng đường đi thì là đường thật.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const { runAgentLoop, fileToolExecutor } = await import(abs("agents/runtime/agent-loop.js"));
const { declarationsFor, runTool } = await import(abs("agents/runtime/tools.js"));
const { checkMissingRules, checkViewpoints, verifyDeliverable } = await import(abs("agents/qa-analyst/tools/count-check.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const ANALYST_TOOLS = ["list_files", "read_file", "file_exists"];
const tools = declarationsFor(ANALYST_TOOLS);
const execute = fileToolExecutor(runTool, ANALYST_TOOLS);

function fakeLLM(script) {
    const seen = [];
    const fn = async ({ contents }) => {
        seen.push(JSON.parse(JSON.stringify(contents)));
        const next = script.shift();
        if (!next) throw new Error("fakeLLM: hết script");
        return { text: next.text ?? "", functionCalls: next.calls ?? [], usage: { promptTokenCount: 7, candidatesTokenCount: 3 } };
    };
    fn.seen = seen;
    return fn;
}

// ─────────── 1. Agent TỰ đi tìm tài liệu, không cần nhồi sẵn ───────────
{
    const llm = fakeLLM([
        { calls: [{ name: "list_files", args: { dir: "project-docs" } }] },
        { calls: [{ name: "read_file", args: { path: "project-docs/03_DEV/UI-flow.md" } }] },
        { text: "Đã đọc UI-flow.md. Luồng: thêm vào giỏ -> Thanh toán -> nhập mã." },
    ]);
    const r = await runAgentLoop({ system: "s", task: "phân tích Function D", tools, execute, llm, verbose: false, maxSteps: 12 });

    chk(">>> agent TỰ list rồi TỰ đọc đúng file cần — không phải nhồi sẵn cả project-docs",
        r.ok && r.steps === 2 && r.toolCalls.map(c => c.name).join(",") === "list_files,read_file",
        JSON.stringify(r.toolCalls.map(c => c.name)));

    const afterList = JSON.stringify(llm.seen[1]);
    chk("agent thấy DANH SÁCH file thật của repo (project-docs/03_DEV/UI-flow.md có trong đó)",
        afterList.includes("UI-flow.md"), afterList.slice(0, 200));

    const afterRead = JSON.stringify(llm.seen[2]);
    chk("agent thấy NỘI DUNG thật của file nó chọn đọc",
        afterRead.includes("cwshopgo.github.io"), afterRead.slice(0, 200));
}

// ─────────── 2. Tool ngoài quyền bị chặn dù model có xin ───────────
{
    const llm = fakeLLM([
        { calls: [{ name: "write_file", args: { path: "project-docs/hack.md", content: "x" } }] },
        { text: "không ghi được, đành thôi" },
    ]);
    const r = await runAgentLoop({ system: "s", task: "t", tools, execute, llm, verbose: false });
    chk(">>> analyst xin write_file -> BỊ CHẶN (node này chỉ được đọc)",
        r.toolCalls[0].failed === true && JSON.stringify(llm.seen[1]).includes("không nằm trong danh sách"),
        JSON.stringify(llm.seen[1]).slice(0, 200));
    const created = await runTool("file_exists", { path: "project-docs/hack.md" });
    chk("và file KHÔNG hề được tạo ra trên đĩa", created.exists === false);
}

// ─────────── 3. selfCheck thật của analyst buộc sửa, không chỉ ghi chú ───────────
{
    const thin = "| Rule | Mô tả |\n|---|---|\n| R1 | a |\n| R2 | b |";
    const full = "| Rule | Mô tả |\n|---|---|\n| R1 | a |\n| R2 | b |\n| R3 | c |\n| R4 | d |\n| R5 | e |\n| R6 | f |";
    const llm = fakeLLM([{ text: thin }, { text: full }]);
    const r = await runAgentLoop({ system: "s", task: "t", llm, verbose: false, selfCheck: (t) => checkMissingRules(t) });
    chk(">>> gate 02 (>=5 rule): bản thiếu bị trả lại, bản đủ được nhận",
        r.ok && r.revisions === 1 && r.text === full, JSON.stringify({ ok: r.ok, rev: r.revisions }));
    chk("model đọc được CON SỐ cụ thể để sửa (2 -> cần 5, thêm 3)",
        JSON.stringify(llm.seen[1]).includes("Chỉ có 2 business rule") && JSON.stringify(llm.seen[1]).includes("thêm 3 dòng"),
        JSON.stringify(llm.seen[1]).slice(-300));
}

// ─────────── 4. Gate 03 nhắc luôn cái bẫy định dạng ───────────
{
    const c = checkViewpoints("Viewpoint A: 1. x 2. y");   // sai định dạng heading -> đếm 0
    chk(">>> sai định dạng -> đếm 0 idea, VÀ issue nói rõ bẫy định dạng (không thì model sửa nội dung mãi mà vẫn 0)",
        !c.ok && c.totalIdeas === 0 && c.issues.some(i => i.includes("định dạng")), JSON.stringify(c));
}

// ─────────── 5. verifyDeliverable vẫn khớp với 2 gate rời (một nguồn ngưỡng) ───────────
{
    const mr = "| Rule | Mô tả |\n|---|---|\n" + [1, 2, 3, 4, 5, 6].map(i => `| R${i} | x |`).join("\n");
    const vp = [1, 2, 3, 4].map(i => `### Viewpoint ${i}: V${i}\n` + Array.from({ length: 6 }, (_, j) => `${j + 1}. idea`).join("\n")).join("\n\n");
    const whole = verifyDeliverable({ missingRulesMarkdown: mr, viewpointsMarkdown: vp });
    const a = checkMissingRules(mr), b = checkViewpoints(vp);
    chk("verifyDeliverable = ghép 2 gate rời, không định nghĩa lại ngưỡng lần thứ hai",
        whole.ok === (a.ok && b.ok) && whole.missingRuleCount === a.count && whole.totalIdeas === b.totalIdeas,
        JSON.stringify({ whole: whole.ok, a: a.ok, b: b.ok, ideas: whole.totalIdeas }));
}

// ─────────── 6. coverage-check của designer giờ khớp count-check ───────────
{
    const CV = await import(abs("agents/qa-test-designer/tools/coverage-check.js"));
    const CC = await import(abs("agents/qa-analyst/tools/count-check.js"));
    const real = (await runTool("read_file", { path: ".qa-run/deliverables/deliverable-analyst.md" })).content;
    chk(">>> 2 node đếm CÙNG một con số trên cùng dữ liệu thật (trước: 26 vs 0)",
        CV.countAnalystIdeas(real) === CC.countTestIdeas(real).totalIdeas && CV.countAnalystIdeas(real) > 0,
        `designer=${CV.countAnalystIdeas(real)} analyst=${CC.countTestIdeas(real).totalIdeas}`);
    chk("TC_ID không còn hardcode feature 'D'",
        CV.verifyDeliverable({ deliverableAnalystMarkdown: "", testCaseMarkdown: "| TC_ID |a|b|c|d|e|f|g|\n|-|-|-|-|-|-|-|-|\n| TC-E-001 |t|p|s|d|e|High|[EP]|" }).issues.length === 0);
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
