// Test: skill nói "xem `X.md`" thì X PHẢI vào prompt. KHÔNG gọi LLM.
// Mục 6 đọc đĩa thật — cố ý: nó kiểm 7 node THẬT trong repo, và đó là kiểm duy nhất bắt được
// "một skill nhắc tài liệu mà node không nạp".
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const S = await import(abs("agents/runtime/skill-docs.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const boom = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// ─────────── 1. referencedDocs: nhận đúng 3 dạng ───────────
{
    const refs = S.referencedDocs([
        "- `knowledge/analysis-integrity.md` — source integrity rules.",
        "- `memory/semantic/06W.md` — framework 06W.",
        "- `agents/qa-analyst/knowledge/viewpoint-library.md` — đọc trực tiếp, không copy.",
    ].join("\n"));
    chk(">>> nhận cả 3 dạng: knowledge/ của chính node, memory/semantic/, và knowledge/ của node khác",
        refs.length === 3
        && refs.includes("knowledge/analysis-integrity.md")
        && refs.includes("memory/semantic/06W.md")
        && refs.includes("agents/qa-analyst/knowledge/viewpoint-library.md"),
        JSON.stringify(refs));
}

// ─────────── 2. Bỏ qua có chủ ý ───────────
{
    const refs = S.referencedDocs([
        "Xem `memory/project/domain-facts.md`",      // tầng 2-3: TRUY VẤN qua knowledge.js, không nạp cả file
        "Ghi ra `.qa-run/deliverables/x.md`",        // sản phẩm lần chạy, không phải tri thức
        "Dùng sau `01_requirement_summary.md`",      // skill khác, không phải tài liệu
        "Tool `tools/count-check.js` đếm",           // code
        "file README.md không có backtick",          // không trong backtick
    ].join("\n"));
    chk(">>> KHÔNG nạp memory/project/* (tầng 2–3 được truy vấn, nạp cả file là sai kiến trúc)",
        !refs.some(r => r.includes("memory/project")), JSON.stringify(refs));
    chk("không nạp .qa-run/* (sản phẩm của lần chạy)", !refs.some(r => r.includes(".qa-run")), JSON.stringify(refs));
    chk("không coi skill khác là tài liệu", !refs.some(r => r.includes("01_requirement")), JSON.stringify(refs));
    chk("chỉ nhận .md, không nhận .js", !refs.some(r => r.endsWith(".js")), JSON.stringify(refs));
    chk("tổng cộng không nhận gì trong ví dụ trên", refs.length === 0, JSON.stringify(refs));
}

// ─────────── 3. Trùng lặp + nhắc nhiều lần cùng một file ───────────
{
    const refs = S.referencedDocs("`knowledge/a.md` rồi lại `knowledge/a.md` và `knowledge/b.md`");
    chk("nhắc 2 lần cùng file thì chỉ tính 1", refs.length === 2, JSON.stringify(refs));
}

// ─────────── 4. resolveRef ───────────
{
    chk("`knowledge/x.md` giải theo node đang đọc",
        S.resolveRef("knowledge/x.md", "agents/qa-analyst") === "agents/qa-analyst/knowledge/x.md");
    chk("`memory/semantic/x.md` giữ nguyên (gốc repo)",
        S.resolveRef("memory/semantic/x.md", "agents/qa-analyst") === "memory/semantic/x.md");
    chk("`agents/<node khác>/knowledge/x.md` giữ nguyên",
        S.resolveRef("agents/qa-leader/knowledge/x.md", "agents/qa-analyst") === "agents/qa-leader/knowledge/x.md");
}

// ─────────── 5. Thiếu file → NỔ (không im lặng bỏ qua) ───────────
{
    const msg = await boom(() => S.loadSkillDocs("Xem `knowledge/khong-ton-tai.md`", { agentDir: "agents/qa-analyst" }));
    chk(">>> skill nhắc file KHÔNG tồn tại thì NỔ (prompt hứa quy tắc không có thật → model bịa)",
        (msg ?? "").includes("KHÔNG tồn tại") && (msg ?? "").includes("khong-ton-tai.md"), msg);

    const lenient = await S.loadSkillDocs("Xem `knowledge/khong-ton-tai.md`", { agentDir: "agents/qa-analyst", strict: false });
    chk("strict:false thì báo trong `missing` chứ không nổ",
        lenient.missing.length === 1 && lenient.docs.length === 0, JSON.stringify(lenient.missing));

    const noDir = await boom(() => S.loadSkillDocs("x", {}));
    chk("thiếu agentDir thì nổ ngay (không đoán node nào)", (noDir ?? "").includes("agentDir"), noDir);
}

// ─────────── 6. skillDocsText: bỏ tài liệu node ĐÃ nạp tĩnh ───────────
{
    const FACT = await readFile("memory/semantic/fact-framework.md", "utf8");
    const skill = await readFile("agents/qa-analyst/skills/02_missing_rule_finder.md", "utf8");

    const all = await S.skillDocsText(skill, { agentDir: "agents/qa-analyst", already: [] });
    chk("skill 02 của analyst nhắc 06W.md — nạp được", all.used.includes("memory/semantic/06W.md"), JSON.stringify(all.used));

    const deduped = await S.skillDocsText(skill, { agentDir: "agents/qa-analyst", already: [FACT] });
    chk(">>> tài liệu node đã nạp tĩnh thì KHÔNG vào prompt lần hai",
        deduped.skipped.includes("memory/semantic/fact-framework.md")
        && !deduped.used.includes("memory/semantic/fact-framework.md"),
        JSON.stringify(deduped));
    chk("nhưng tài liệu chưa có vẫn được nạp", deduped.used.includes("memory/semantic/06W.md"), JSON.stringify(deduped.used));
    chk("text ghép có ghi rõ nguồn từng tài liệu", deduped.text.includes("### Tài liệu skill này tham chiếu: memory/semantic/06W.md"));
}

// ─────────── 7. MỌI skill của MỌI node: tài liệu nhắc tới phải TỒN TẠI ───────────
{
    const agents = (await readdir("agents", { withFileTypes: true }))
        .filter(e => e.isDirectory() && e.name.startsWith("qa-")).map(e => e.name);
    const missing = [];
    let checked = 0;
    for (const agent of agents) {
        const dir = `agents/${agent}`;
        let skills = [];
        try { skills = (await readdir(`${dir}/skills`)).filter(f => f.endsWith(".md")); } catch { continue; }
        for (const s of skills) {
            const txt = await readFile(`${dir}/skills/${s}`, "utf8");
            const r = await S.loadSkillDocs(txt, { agentDir: dir, strict: false });
            checked++;
            for (const m of r.missing) missing.push(`${agent}/${s} → ${m}`);
        }
    }
    chk(`>>> ${checked} skill của ${agents.length} node: KHÔNG skill nào nhắc tài liệu không tồn tại`,
        missing.length === 0, missing.join(" | "));
}

// ─────────── 8. Node đã NẠP mọi tài liệu skill của nó nhắc tới ───────────
{
    // Kiểm bằng cách so với chính lời gọi trong index.js: node nào dùng skillDocsText thì
    // đương nhiên đủ; node nào không dùng thì phải nạp tĩnh đủ từng file.
    const agents = (await readdir("agents", { withFileTypes: true }))
        .filter(e => e.isDirectory() && e.name.startsWith("qa-")).map(e => e.name);
    const gaps = [];
    for (const agent of agents) {
        const dir = `agents/${agent}`;
        let idx = "";
        try { idx = await readFile(`${dir}/index.js`, "utf8"); } catch { continue; }
        if (idx.includes("skillDocsText")) continue;   // nạp theo skill, luôn đủ
        let skills = [];
        try { skills = (await readdir(`${dir}/skills`)).filter(f => f.endsWith(".md")); } catch { continue; }
        for (const s of skills) {
            const txt = await readFile(`${dir}/skills/${s}`, "utf8");
            for (const ref of S.referencedDocs(txt)) {
                const base = S.resolveRef(ref, dir).split("/").pop();
                if (!idx.includes(base)) gaps.push(`${agent}/${s} → ${ref}`);
            }
        }
    }
    chk(">>> KHÔNG node nào có skill nhắc tài liệu mà node không đưa vào prompt",
        gaps.length === 0, gaps.join(" | "));
}

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nskill-docs: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
