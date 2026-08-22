// Test P7.5: bộ sinh node. KHÔNG gọi LLM — bản khai được dựng tay, đúng như LLM sẽ trả về.
// Có ghi đĩa ở mục 6: sinh index.js ra .qa-run/cache/ rồi `node --check` THẬT. Đó là kiểm
// duy nhất chứng minh code sinh ra chạy được, thay vì chỉ "trông giống code".
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const E = await import(abs("agents/qa-architect/tools/node-emitter.js"));
const W = await import(abs("agents/qa-architect/tools/wiring-check.js"));
const P_ = await import(abs("agents/runtime/paths.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const SPEC = {
    name: "qa-flaky-scanner",
    title: "QA Flaky Scanner",
    mission: "Phát hiện test không ổn định từ kết quả chạy và báo cho Dev.",
    responsibilities: ["Đọc kết quả chạy", "Chỉ ra test flaky"],
    can: ["Đọc test-results.json"],
    cant: ["Không tự chạy test", "Không gọi node khác"],
    reads: ["TEST_RESULTS", "DELIVERABLE_TEST_DESIGNER"],
    deliverable: "danh sách test flaky kèm số lần retry",
    skill: {
        name: "Flaky report writer",
        purpose: "Viết báo cáo test flaky cho Dev đọc.",
        promptType: "Template-based",
        prompt: "x".repeat(250),
        qualityCheck: "Mỗi dòng có tên test và số lần retry.",
    },
    needsDeterministicTools: [
        { file: "retry-counter.js", what: "đếm số lần retry của từng test", whyCode: "đếm sai thì cả báo cáo sai" },
    ],
};
const clone = (over = {}) => ({ ...SPEC, ...over });

// ─────────── 1. validateSpec: bản khai đúng ───────────
{
    const p = E.validateSpec(SPEC, { existingNodes: ["qa-analyst"] });
    chk(">>> bản khai đầy đủ và đúng thì không có vấn đề", p.length === 0, JSON.stringify(p));
}

// ─────────── 2. validateSpec: tên node ───────────
{
    chk("tên không có tiền tố qa- bị từ chối", E.validateSpec(clone({ name: "flaky" })).some(x => x.includes("name")));
    chk("tên có chữ hoa / gạch dưới bị từ chối", E.validateSpec(clone({ name: "qa_Flaky" })).some(x => x.includes("name")));
    chk(">>> trùng tên node đang chạy thì DỪNG, không ghi đè",
        E.validateSpec(SPEC, { existingNodes: ["qa-flaky-scanner"] }).some(x => x.includes("KHÔNG ghi đè")),
        JSON.stringify(E.validateSpec(SPEC, { existingNodes: ["qa-flaky-scanner"] })));
}

// ─────────── 3. validateSpec: reads là TỪ VỰNG BỊ CHẶN ───────────
{
    const p = E.validateSpec(clone({ reads: ["TEST_RESULTS", "BAO_CAO_TU_BIA"] }));
    chk(">>> reads có tên export bịa ra bị bắt (node chỉ đọc đường dẫn đã khai ở paths.js)",
        p.some(x => x.includes("BAO_CAO_TU_BIA")), JSON.stringify(p));
    chk("reads lặp tên bị bắt", E.validateSpec(clone({ reads: ["TEST_RESULTS", "TEST_RESULTS"] })).some(x => x.includes("lặp")));
    chk("reads rỗng vẫn hợp lệ (node không đọc file nào)", E.validateSpec(clone({ reads: [] })).length === 0);
    chk("reads trỏ tới export là HÀM (specFor) bị bắt — không phải chuỗi đường dẫn",
        E.validateSpec(clone({ reads: ["specFor"] })).some(x => x.includes("specFor")));
}

// ─────────── 4. validateSpec: prompt rỗng = 'vài dòng thông tin gọi là Agent' ───────────
{
    const p = E.validateSpec(clone({ skill: { ...SPEC.skill, prompt: "Viết báo cáo flaky." } }));
    chk(">>> prompt quá ngắn bị từ chối, và nói rõ đang có bao nhiêu ký tự",
        p.some(x => x.includes("200 ký tự") && x.includes("Hiện")), JSON.stringify(p));
}
{
    for (const f of ["responsibilities", "can", "cant"]) {
        chk(`${f} rỗng bị từ chối`, E.validateSpec(clone({ [f]: [] })).some(x => x.includes(f)));
    }
    chk("mission quá ngắn bị từ chối", E.validateSpec(clone({ mission: "abc" })).some(x => x.includes("mission")));
}

// ─────────── 5. paths.js: chèn export, một nguồn duy nhất ───────────
{
    chk("tên export dẫn xuất từ tên node", E.pathsExportName("qa-flaky-scanner") === "DELIVERABLE_FLAKY_SCANNER", E.pathsExportName("qa-flaky-scanner"));
    chk("tên file dẫn xuất từ tên node", E.deliverableFileName("qa-flaky-scanner") === "deliverable-flaky-scanner.md", E.deliverableFileName("qa-flaky-scanner"));

    const src = `const DELIVERABLES_DIR = "x";\nexport const A = "a";\n`;
    const once = E.insertPathsExport(src, "qa-flaky-scanner");
    chk("lần đầu: thêm khối có mốc + export mới",
        once.added && once.content.includes(E.PATHS_BEGIN) && once.content.includes("DELIVERABLE_FLAKY_SCANNER"), once.content);

    const twice = E.insertPathsExport(once.content, "qa-flaky-scanner");
    chk(">>> gọi lại với cùng node thì KHÔNG thêm lần hai (idempotent)",
        !twice.added && twice.content === once.content);

    const second = E.insertPathsExport(once.content, "qa-log-reader");
    chk("node thứ hai chèn VÀO khối đã có, không tạo khối thứ hai",
        second.added
        && (second.content.match(new RegExp(E.PATHS_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length === 1
        && second.content.includes("DELIVERABLE_LOG_READER"), second.content);
    chk("export mới nằm TRƯỚC dòng mốc kết thúc",
        second.content.indexOf("DELIVERABLE_LOG_READER") < second.content.indexOf(E.PATHS_END));
}

// ─────────── 6. emitIndex: code sinh ra phải THẬT SỰ hợp lệ ───────────
{
    const files = E.emitNode(SPEC);
    const names = Object.keys(files);
    chk("sinh đủ index.js + role.md + skill + khung tool + knowledge/",
        names.includes("agents/qa-flaky-scanner/index.js")
        && names.includes("agents/qa-flaky-scanner/role.md")
        && names.some(n => n.startsWith("agents/qa-flaky-scanner/skills/01_"))
        && names.includes("agents/qa-flaky-scanner/tools/retry-counter.js")
        && names.includes("agents/qa-flaky-scanner/knowledge/.gitkeep"),
        names.join(", "));

    const idx = files["agents/qa-flaky-scanner/index.js"];
    chk(">>> CONTRACT sinh ra khai đủ requires/produces/inputs khớp `reads`",
        idx.includes("requires: [P.TEST_RESULTS, P.DELIVERABLE_TEST_DESIGNER]")
        && idx.includes("produces: [P.DELIVERABLE_FLAKY_SCANNER]")
        && idx.includes(`test_resultsPath: "TEST_RESULTS"`),
        idx.split("\n").filter(l => l.includes("requires") || l.includes("produces") || l.includes("inputs")).join(" | "));
    chk("dùng ESM (`export`), KHÔNG dùng module.exports — đúng lỗi P7.0 của template cũ",
        idx.includes("export async function run") && !idx.includes("module.exports"));
    chk(">>> KHÔNG sinh selfCheck giả (một cửa luôn trả 'không có vấn đề' thì LUÔN xanh)",
        !idx.includes("selfCheck"));
    chk(">>> thiếu tool deterministic thì IN CẢNH BÁO MỖI LẦN CHẠY, không chỉ ghi chú thích",
        idx.includes("THIEU_TOOL") && idx.includes("console.warn"));
    chk("không ghi file khi LLM trả về rỗng", idx.includes("không ghi file rỗng"));

    // node --check THẬT trên code vừa sinh.
    const dir = path.join(P_.CACHE_DIR, "architect-test");
    await mkdir(dir, { recursive: true });
    let ok = true, err = "";
    for (const [p, content] of Object.entries(files)) {
        if (!p.endsWith(".js")) continue;
        const tmp = path.join(dir, path.basename(p));
        await writeFile(tmp, content, "utf8");
        try { await execFileAsync(process.execPath, ["--check", tmp]); }
        catch (e) { ok = false; err += `${p}: ${String(e.stderr ?? e.message).split("\n")[0]} `; }
    }
    chk(">>> MỌI file .js sinh ra qua được `node --check` thật", ok, err);

    // Khung tool phải NỔ khi bị gọi, không trả giá trị giả.
    const stubPath = path.join(dir, "retry-counter.js");
    const stub = await import("file:///" + path.resolve(stubPath).split(path.sep).join("/"));
    let threw = false;
    try { stub.check({}); } catch { threw = true; }
    chk(">>> khung tool NỔ khi bị gọi (chưa viết mà trả 'không có vấn đề' là hàm rỗng luôn xanh)", threw);

    await rm(dir, { recursive: true, force: true });
}

// ─────────── 7. Node không cần tool nào ───────────
{
    const files = E.emitNode(clone({ needsDeterministicTools: [] }));
    const idx = files["agents/qa-flaky-scanner/index.js"];
    chk("không có tool thiếu thì không sinh cảnh báo rỗng", !idx.includes("THIEU_TOOL"));
    chk("vẫn có tools/.gitkeep để cấu trúc node đồng nhất", "agents/qa-flaky-scanner/tools/.gitkeep" in files);
}

// ─────────── 8. role.md nói ra chỗ chưa hoàn chỉnh ───────────
{
    const role = E.emitRole(SPEC);
    chk("role.md liệt kê tool còn thiếu, không im lặng", role.includes("CHƯA HOÀN CHỈNH") && role.includes("retry-counter.js"), role.slice(0, 80));
    chk("role.md ghi rõ node không gọi node khác", role.includes("node không gọi node"));
    chk("role.md ghi đúng đường dẫn đầu ra", role.includes("deliverable-flaky-scanner.md"));
}

// ─────────── 9. checkWiring — cửa gác bài học 0-BUG ───────────
{
    const flows = [
        { flow: { file: "flows/a.flow.yml", type: "declarative", steps: [{ node: "qa-analyst" }] }, problems: [] },
        { flow: { file: "flows/b.flow.yml", type: "script", script: "workflow/x.js" }, problems: [] },
    ];
    const no = W.checkWiring({ name: "qa-flaky-scanner", flows });
    chk(">>> node chưa có luồng nào gọi → CHƯA NỐI DÂY, không báo là xong",
        !no.wired && no.report.includes("CHƯA NỐI DÂY"), no.report.split("\n")[0]);
    chk("báo cáo kèm đúng đoạn yaml để dán vào flows/",
        no.report.includes("- node: qa-flaky-scanner") && no.report.includes("steps:"), no.report);
    chk("báo cáo nhắc đúng lỗi 0-BUG", no.report.includes("0-BUG"));

    const yes = W.checkWiring({ name: "qa-analyst", flows });
    chk("node có trong file luồng → đã nối dây, nói rõ luồng nào",
        yes.wired && yes.usedBy.includes("flows/a.flow.yml"), JSON.stringify(yes));

    const viaScript = W.checkWiring({ name: "qa-flaky-scanner", flows, scriptSources: [`import x from "../agents/qa-flaky-scanner/index.js";`] });
    chk("luồng kiểu script gọi bằng import cũng được tính là đã nối", viaScript.wired, JSON.stringify(viaScript.usedBy));
}

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nqa-architect: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
