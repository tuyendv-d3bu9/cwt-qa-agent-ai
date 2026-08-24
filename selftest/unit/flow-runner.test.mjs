// Test Q1.1: PHẦN CHẠY của flow-runner.js. KHÔNG gọi LLM, KHÔNG gọi MCP.
//
// VÌ SAO BỘ NÀY TỒN TẠI. Trước nó: 508 test, **không một bộ nào gọi `flow-runner.js`** — file
// được gọi là "khung chạy chính". Test cho `flow-file.js` chỉ phủ nửa ĐỌC (parse + kiểm khai
// báo); nửa CHẠY (spawn script, kiểm `expect_step`, bỏ qua bước đã xong, rẽ nhánh) chưa từng
// thực thi lần nào, trong khi Q1 đã được tick 🟢. Đúng tội "0-BUG" trong TODO.update2.md, tái
// phạm ở chính file quan trọng nhất.
//
// CÁCH TEST: `process.chdir()` sang một sandbox tạm có DB thật + `agents/` giả + script giả —
// đúng cách `test-k-session.mjs` đã làm. Không sửa code production để test được.
//
// ⚠ THỨ TỰ LÀ BẮT BUỘC: `chdir` PHẢI xong TRƯỚC khi import bất cứ module runtime nào.
// `agents/runtime/db.js` chốt `const ROOT = process.cwd()` **lúc nạp module**, và
// `safeDbPath()` resolve mọi đường dẫn DB theo `ROOT` đó — KHÔNG theo cwd hiện tại. Nên
// `chdir` sau khi import thì DB vẫn là DB THẬT của repo.
//
// Bản đầu của file này import `db.js` trước khi chdir. Kết quả: các ca test ghi thẳng vào
// `.qa-run/runs.db` thật — tạo một run rác VÀ đổi `session.run_id`, tức là **chiếm phiên đang
// làm việc của người dùng**. Đã phải xoá tay để khôi phục. Vì thế có `assertSandboxed()` bên
// dưới: sai thứ tự lần nữa thì bộ test NỔ ngay, không âm thầm ghi vào dữ liệu thật.

import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const repo = process.cwd();
const url = (p) => "file:///" + path.resolve(repo, p).split(path.sep).join("/");
const sandbox = path.join(os.tmpdir(), "qa-agent-flow-runner-test");

rmSync(sandbox, { recursive: true, force: true });
mkdirSync(sandbox, { recursive: true });
process.chdir(sandbox);          // <- TRƯỚC mọi import runtime. Đừng đổi thứ tự này.

const MEMORY_URL = url("agents/runtime/memory.js");
const { closeAll, RUNS_DB_ABS } = await import(url("agents/runtime/db.js"));
const F = await import(url("workflow/flow-file.js"));
const R = await import(url("workflow/flow-runner.js"));
const M = await import(MEMORY_URL);

/**
 * Chứng minh DB đang dùng nằm TRONG sandbox, không phải trong repo.
 * Gọi trước ca test đầu tiên. Nếu ai đó chuyển các dòng `import` lên trên `chdir`, hàm này
 * dừng cả bộ test thay vì để nó ghi vào `.qa-run/runs.db` thật.
 */
function assertSandboxed() {
    const inRepo = path.resolve(repo, ".qa-run/runs.db");
    const inSandbox = path.resolve(sandbox, ".qa-run/runs.db");
    const actual = RUNS_DB_ABS ?? null;
    if (actual !== inSandbox) {
        throw new Error(
            `BỘ TEST CHƯA ĐƯỢC CÁCH LY — DB đang trỏ tới:\n  ${actual}\n` +
            `  đáng lẽ phải là: ${inSandbox}\n` +
            `  (DB thật của repo: ${inRepo})\n` +
            `  Nguyên nhân gần như luôn là: có module runtime được import TRƯỚC process.chdir().`
        );
    }
}

/** Node giả: KHÔNG import gì, nên nó không cần `agents/runtime/` trong sandbox. */
const fakeNode = (name, { produces = [], data = "{}" } = {}) => `
export const CONTRACT = {
    agent: ${JSON.stringify(name)},
    requires: [],
    produces: ${JSON.stringify(produces)},
    inputs: {},
};
export async function run() {
    ${produces.map(p => `
    { const { mkdirSync, writeFileSync } = await import("node:fs");
      const path = await import("node:path");
      mkdirSync(path.dirname(${JSON.stringify(p)}), { recursive: true });
      writeFileSync(${JSON.stringify(p)}, "x", "utf8"); }`).join("")}
    return { status: "success", data: ${data}, error: null };
}
`;

// `closeAll()` giữa các ca: đóng handle SQLite đang mở để xoá được file DB. Không đóng thì
// ca sau vẫn thấy trạng thái ca trước (và trên Windows còn không xoá nổi file).
function seed() {
    // KHONG chdir ra khoi sandbox va KHONG xoa chinh sandbox: tren Windows khong xoa duoc
    // thu muc dang la cwd, va chdir ra ngoai roi quay lai cung khong doi duoc ROOT da chot.
    // Chi don NOI DUNG.
    closeAll();
    for (const sub of [".qa-run", "agents", "memory"]) {
        rmSync(path.join(sandbox, sub), { recursive: true, force: true });
    }
    for (const f of ["argv.json", "ok.js", "waiting.js", "boom.js", "echo.js"]) {
        rmSync(path.join(sandbox, f), { force: true });
    }
    for (const n of ["qa-analyst", "qa-second"]) {
        mkdirSync(path.join(sandbox, "agents", n), { recursive: true });
        writeFileSync(path.join(sandbox, "agents", n, "role.md"), `# Role: ${n}\n`, "utf8");
    }
    writeFileSync(path.join(sandbox, "agents/qa-analyst/index.js"), fakeNode("qa-analyst"), "utf8");
    writeFileSync(path.join(sandbox, "agents/qa-second/index.js"),
        fakeNode("qa-second", { produces: [".qa-run/deliverables/second.md"] }), "utf8");

    // Script giả: XONG — tự đánh bước `qa-analyst` là done, đúng như leader-analyst.js làm.
    writeFileSync(path.join(sandbox, "ok.js"), `
import { startRun, markStep } from ${JSON.stringify(MEMORY_URL)};
await startRun(process.argv[2] ?? "F");
await markStep("qa-analyst", { status: "done", output: "a.md" });
console.log("script: xong");
process.exit(0);
`, "utf8");

    // Script giả: DỪNG CHỜ NGƯỜI — mở phiên nhưng KHÔNG đánh done, rồi thoát 0.
    // Đây là hình dạng thật của leader-analyst.js khi nó chờ người điền gap-report.
    writeFileSync(path.join(sandbox, "waiting.js"), `
import { startRun } from ${JSON.stringify(MEMORY_URL)};
await startRun("F");
console.log("script: hay dien gap-report roi chay lai");
process.exit(0);
`, "utf8");

    // Script giả: HỎNG.
    writeFileSync(path.join(sandbox, "boom.js"), `console.error("script: no"); process.exit(3);`, "utf8");

    // Script giả: ghi lại cờ/đối số nó nhận được, để kiểm việc truyền tham số.
    writeFileSync(path.join(sandbox, "echo.js"), `
import { writeFileSync } from "node:fs";
import { startRun, markStep } from ${JSON.stringify(MEMORY_URL)};
writeFileSync("argv.json", JSON.stringify(process.argv.slice(2)), "utf8");
await startRun("F");
await markStep("qa-analyst", { status: "done", output: "a.md" });
process.exit(0);
`, "utf8");

}


/**
 * Thêm một node giả với TÊN RIÊNG.
 *
 * BẮT BUỘC tên riêng cho mỗi ca test: Node cache module ESM theo URL, nên ghi lại cùng một
 * `agents/qa-x/index.js` rồi gọi `discoverNodes()` lần nữa sẽ nạp lại BẢN CŨ trong cache, chứ
 * không đọc file vừa ghi. Ba ca test đầu tiên của mục 7–9 "chạy" trên node của mục trước đúng
 * vì lỗi này — và một trong chúng còn báo xanh nhờ ăn may.
 */
function addNode(name, opts) {
    mkdirSync(path.join(sandbox, "agents", name), { recursive: true });
    writeFileSync(path.join(sandbox, "agents", name, "role.md"), `# Role: ${name}
`, "utf8");
    writeFileSync(path.join(sandbox, "agents", name, "index.js"), opts.src ?? fakeNode(name, opts), "utf8");
}

assertSandboxed();
seed();

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

/** Chạy một luồng viết bằng yaml, im lặng (runner in rất nhiều). */
async function run(yaml, argv = []) {
    const { flow, problems } = F.parseFlowFile(yaml, { file: "t.flow.yml" });
    if (problems.length) throw new Error("luồng khai sai: " + problems.join(" | "));
    const lines = [];
    const res = await R.runFlow(flow, { argv, log: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) });
    return { ...res, log: lines.join("\n") };
}

const FLOW_SCRIPT_THEN_NODE = (script) => `
name: t
requires_run: false
params:
  - name: task
    positional: true
flags:
  - name: new-run
  - name: no-gate
steps:
  - script: ${script}
    label: nua dau
    args:
      - $param.task
    pass_flags:
      - new-run
    expect_step: qa-analyst
  - node: qa-second
    label: buoc sau
    require_step: qa-analyst
`;

// ─────────── 1. Script DỪNG CHỜ NGƯỜI: không đi tiếp, và KHÔNG phải lỗi ───────────
{
    const r = await run(FLOW_SCRIPT_THEN_NODE("waiting.js"), ["Task A", "--no-gate"]);
    chk(">>> script thoát 0 mà expect_step chưa done → DỪNG dạng chờ-người (stopped), KHÔNG phải lỗi",
        r.stopped === true && r.ok === true, JSON.stringify({ ok: r.ok, stopped: r.stopped, reason: r.reason }));
    chk(">>> bước SAU không được chạy khi nửa đầu còn đang chờ người",
        !r.steps.some(s => s.node === "qa-second"), JSON.stringify(r.steps));
    chk("thông báo nói rõ trạng thái hiện tại của bước đang chờ",
        /qa-analyst/.test(r.reason) && /chưa chạy|waiting/.test(r.reason), r.reason);
}

// ─────────── 2. Script XONG: đi tiếp, và bước sau THẤY trạng thái vừa ghi ───────────
{
    seed();
    const r = await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task B", "--no-gate"]);
    chk(">>> script xong → đi tiếp bước sau", r.ok === true && r.stopped === false,
        JSON.stringify({ ok: r.ok, stopped: r.stopped, reason: r.reason }));
    chk(">>> `require_step: qa-analyst` THẤY bước vừa hoàn thành TRONG CÙNG LƯỢT " +
        "(đây là lỗi đọc-lại-trạng-thái đã sửa: bản trước đọc ảnh chụp một lần ở đầu vòng)",
        r.steps.some(s => s.node === "qa-second" && s.action === "done"), JSON.stringify(r.steps));
}

// ─────────── 3. Script HỎNG (mã thoát ≠ 0) ───────────
{
    seed();
    const r = await run(FLOW_SCRIPT_THEN_NODE("boom.js"), ["Task C", "--no-gate"]);
    chk("script thoát mã ≠ 0 → luồng dừng và BÁO LỖI", r.ok === false, JSON.stringify({ ok: r.ok, reason: r.reason }));
    chk("thông báo nêu đúng mã thoát", /mã 3/.test(r.reason), r.reason);
}

// ─────────── 4. Chạy lại: bỏ qua bước đã xong ───────────
{
    seed();
    await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task D", "--no-gate"]);
    const again = await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task D", "--no-gate"]);
    chk(">>> chạy lại đúng lệnh cũ: bước script bị BỎ QUA (không chạy lại nửa đầu)",
        again.steps[0]?.action === "skipped", JSON.stringify(again.steps));
    chk("bước node đã xong cũng bị bỏ qua", again.steps[1]?.action === "skipped", JSON.stringify(again.steps));
    chk("chạy lại không báo lỗi", again.ok === true, JSON.stringify(again.reason));
}

// ─────────── 5. Truyền đối số + cờ xuống script ───────────
{
    seed();
    await run(FLOW_SCRIPT_THEN_NODE("echo.js"), ["Task E", "--new-run", "--no-gate"]);
    const { readFileSync } = await import("node:fs");
    const argv = JSON.parse(readFileSync(path.join(sandbox, "argv.json"), "utf8"));
    chk(">>> $param.task đi xuống script dưới dạng đối số vị trí",
        argv[0] === "Task E", JSON.stringify(argv));
    chk(">>> pass_flags chuyển tiếp cờ ĐANG BẬT thành --new-run",
        argv.includes("--new-run"), JSON.stringify(argv));
    chk("cờ KHÔNG bật thì không xuất hiện trong đối số script",
        !argv.includes("--no-gate"), JSON.stringify(argv));
}

// ─────────── 6. CỬA DUYỆT NGƯỜI thật sự chặn ───────────
{
    seed();
    const yaml = `
name: t
requires_run: false
params:
  - name: task
    positional: true
flags:
  - name: no-gate
steps:
  - script: ok.js
    expect_step: qa-analyst
  - node: qa-second
    gate: qa-analyst
`;
    const blocked = await run(yaml, ["Task F"]);
    chk(">>> chưa ai duyệt → cửa duyệt CHẶN bước sau (stopped, kèm đúng lệnh để duyệt)",
        blocked.stopped === true && /approve/.test(blocked.reason), JSON.stringify({ s: blocked.stopped, r: blocked.reason }));
    chk("bước sau KHÔNG chạy khi bị chặn", !blocked.steps.some(s => s.node === "qa-second"), JSON.stringify(blocked.steps));

    await M.approveStep("qa-analyst", "Tester");
    const passed = await run(yaml, ["Task F"]);
    chk(">>> duyệt xong thì đi tiếp được", passed.ok === true && passed.steps.some(s => s.node === "qa-second"),
        JSON.stringify({ ok: passed.ok, steps: passed.steps }));
}
{
    seed();
    const yaml = `
name: t
requires_run: false
flags:
  - name: no-gate
params:
  - name: task
    positional: true
steps:
  - script: ok.js
    expect_step: qa-analyst
  - node: qa-second
    gate: qa-analyst
`;
    const r = await run(yaml, ["Task G", "--no-gate"]);
    chk("--no-gate bỏ cửa duyệt (chỉ dùng khi demo)", r.ok === true && r.steps.some(s => s.node === "qa-second"),
        JSON.stringify(r.steps));
    chk("và nói rõ trong log là đang bỏ cửa", /Bỏ qua duyệt/.test(r.log));
}

// ─────────── 7. Rẽ nhánh: verdict lạ thì DỪNG, không đoán ───────────
{
    seed();
    addNode("qa-verdict", { produces: [".qa-run/deliverables/v.md"], data: `{ verdict: "LA_QUA" }` });
    const yaml = `
name: t
requires_run: false
flags:
  - name: no-gate
steps:
  - node: qa-verdict
    branch_on: verdict
    branch:
      - value: PASS
        action: continue
      - value: ASK
        action: stop
        message: doc file roi quyet
`;
    const r = await run(yaml, ["--no-gate"]);
    chk(">>> node trả verdict KHÔNG có nhánh nào khai → dừng và BÁO, tuyệt đối không đoán",
        r.ok === false && /LA_QUA/.test(r.reason), JSON.stringify({ ok: r.ok, reason: r.reason }));
    chk("thông báo liệt kê các nhánh đã khai để biết thiếu gì", /PASS|ASK/.test(r.reason), r.reason);
}

// ─────────── 8. Hợp đồng ra: hứa ghi mà không ghi ───────────
{
    seed();
    // Node khai `produces` nhưng KHÔNG ghi file.
    addNode("qa-noout", { src: `
export const CONTRACT = { agent: "qa-noout", requires: [], produces: [".qa-run/deliverables/khong-ghi.md"], inputs: {} };
export async function run() { return { status: "success", data: {}, error: null }; }
` });
    const r = await run(`
name: t
requires_run: false
flags:
  - name: no-gate
steps:
  - node: qa-noout
`, ["--no-gate"]);
    chk(">>> node báo success mà không ghi output đã khai → bị bắt NGAY, không để node sau chết",
        r.ok === false && /khong-ghi\.md/.test(r.reason), JSON.stringify({ ok: r.ok, reason: r.reason }));
}

// ─────────── 9. status ngoài từ vựng hợp đồng ───────────
{
    seed();
    addNode("qa-badstatus", { src: `
export const CONTRACT = { agent: "qa-badstatus", requires: [], produces: [], inputs: {} };
export async function run() { return { status: "hoan_thanh", data: {}, error: null }; }
` });
    const r = await run(`
name: t
requires_run: false
flags:
  - name: no-gate
steps:
  - node: qa-badstatus
`, ["--no-gate"]);
    chk(">>> status lạ ('hoan_thanh') → dừng và báo vi phạm hợp đồng, không coi là xong",
        r.ok === false && /hoan_thanh/.test(r.reason), JSON.stringify({ ok: r.ok, reason: r.reason }));
}

// ─────────── 10. Cờ gõ sai KHÔNG bị bỏ qua ───────────
{
    seed();
    const r = await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task H", "--confrim-mcp"]);
    chk(">>> cờ gõ sai → dừng ngay, không chạy gì (người dùng tưởng đã bật thứ họ chưa bật)",
        r.ok === false && /confrim-mcp/.test(r.reason) && r.steps.length === 0,
        JSON.stringify({ ok: r.ok, steps: r.steps.length }));
}

// ─────────── 11. Luồng đòi phiên mà chưa có phiên ───────────
{
    seed();
    const r = await run(`
name: t
requires_run: true
flags:
  - name: no-gate
steps:
  - node: qa-second
`, ["--no-gate"]);
    chk("luồng requires_run mà chưa có phiên → dừng, chỉ đúng lệnh mở phiên",
        r.ok === false && /qa\.js run analyze/.test(r.reason), JSON.stringify(r.reason));
}

// ─────────── 12. needs_rework → CHẠY LẠI (nền tảng của `node qa.js redo`) ───────────
//
// `qa.js redo <node>` chỉ đánh trạng thái `needs_rework` rồi bảo người dùng chạy lại luồng.
// Nếu runner không tôn trọng trạng thái đó thì cả lệnh `redo` là vô nghĩa — nên phải khoá lại.
{
    seed();
    await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task I", "--no-gate"]);

    // Đánh lại bước node (giống hệt việc `qa.js redo qa-second` làm).
    await M.markStep("qa-second", { status: "needs_rework", note: "người dùng yêu cầu sinh lại" });
    const again = await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task I", "--no-gate"]);
    chk(">>> bước bị đánh needs_rework thì CHẠY LẠI, không bị bỏ qua",
        again.steps.some(s => s.node === "qa-second" && s.action === "done"), JSON.stringify(again.steps));
    chk("bước KHÔNG bị đánh lại vẫn được bỏ qua (không chạy lại cả luồng)",
        again.steps[0]?.action === "skipped", JSON.stringify(again.steps));
}
{
    seed();
    await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task J", "--no-gate"]);
    // Đánh lại bước SCRIPT qua chính `expect_step` của nó.
    await M.markStep("qa-analyst", { status: "needs_rework", note: "sinh lại nửa đầu" });
    const again = await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task J", "--no-gate"]);
    chk(">>> đánh lại `expect_step` thì bước SCRIPT cũng chạy lại",
        again.steps[0]?.node === "qa-analyst" && again.steps[0]?.action === "done", JSON.stringify(again.steps));
}
{
    seed();
    await run(FLOW_SCRIPT_THEN_NODE("ok.js"), ["Task K"]);          // có cửa duyệt
    await M.approveStep("qa-analyst", "Tester");
    await M.markStep("qa-analyst", { status: "needs_rework", note: "sinh lai" });
    const st = await M.loadState();
    chk(">>> đánh needs_rework XOÁ dấu duyệt — duyệt là duyệt MỘT bản đầu ra, bản đó sắp bị thay",
        st.steps.find(s => s.agent === "qa-analyst")?.human_approved === false,
        JSON.stringify(st.steps.find(s => s.agent === "qa-analyst")));
}

process.chdir(repo);
closeAll();
rmSync(sandbox, { recursive: true, force: true });
if (existsSync(sandbox)) console.warn(`(sandbox chua xoa duoc: ${sandbox})`);

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nflow-runner: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
