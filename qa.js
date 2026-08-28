// qa.js
// UI terminal cho cả hệ thống.


import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { loadFlows, renderFlow, listFlowFiles } from "./workflow/flow-file.js";
import { runFlow } from "./workflow/flow-runner.js";
import { discoverNodes, downstreamOf } from "./agents/runtime/node-registry.js";
import { approveStep, printState, loadState, currentRun, markStep } from "./agents/runtime/memory.js";
import { supervise } from "./agents/qa-leader/index.js";
import { db, KNOWLEDGE_DB } from "./agents/runtime/db.js";
import * as P from "./agents/runtime/paths.js";

const argv = process.argv.slice(2);

// ─────────────────────────────────────────────────────────────────────
// Hiển thị
// ─────────────────────────────────────────────────────────────────────

const HR = "─".repeat(72);

async function cmdFlows() {
    const loaded = await loadFlows();
    const { nodes } = await discoverNodes();
    if (loaded.length === 0) {
        console.log(`Chưa có file luồng nào trong flows/. Xem workflow/flow-file.js để biết định dạng.`);
        return loaded;
    }
    loaded.forEach(({ flow, problems }, i) => {
        console.log(HR);
        if (!flow) { console.log(`${i + 1}) (file không đọc được)`); problems.forEach(p => console.log(`   SAI: ${p}`)); return; }
        console.log(`${i + 1}) ${renderFlow(flow, { nodes })}`);
        // Luồng hỏng vẫn được liệt kê — im lặng bỏ qua thì người dùng chỉ thấy luồng "biến mất".
        problems.forEach(p => console.log(`   SAI: ${p}`));
        // In cả `params` chứ không chỉ `flags`: luồng `analyze` cần một chuỗi task, mà bản đầu
        // chỉ in cờ nên dòng gợi ý bỏ sót đúng cái đối số bắt buộc.
        console.log(`   Lệnh: node qa.js run ${flow.name}` +
            (flow.params?.length ? " " + flow.params.map(p =>
                p.positional ? `"<${p.name}>"`
                    : p.default === null ? `--${p.name}=<${p.kind}>`
                        : `[--${p.name}=<${p.kind}>]`).join(" ") : "") +
            (flow.flags?.length ? " " + flow.flags.map(f => `[--${f.name}]`).join(" ") : ""));
    });
    console.log(HR);
    return loaded;
}

async function cmdNodes() {
    const { nodes, broken } = await discoverNodes();
    console.log(`\nNode dùng được (${nodes.size}) — dò theo quy ước: agents/<tên>/ có role.md + CONTRACT hợp lệ\n`);
    for (const n of nodes.values()) {
        const c = n.contract;
        console.log(`  ${n.name}   [entry: ${n.entry}]`);
        console.log(`     cần   : ${(c.requires ?? []).join(", ") || "(không)"}`);
        console.log(`     sinh  : ${(c.produces ?? []).join(", ") || "(không)"}`);
        const inputs = Object.entries(c.inputs ?? {});
        console.log(`     nhận  : ${inputs.length ? inputs.map(([k, v]) => `${k}=paths.${v}`).join(", ") : "(không có tham số đường dẫn)"}`);
    }
    if (broken.length) {
        console.log(`\nNode HỎNG (${broken.length}) — không vào registry, không luồng nào gọi được:\n`);
        for (const b of broken) {
            console.log(`  ${b.name}`);
            b.problems.forEach(p => console.log(`     ${p}`));
        }
    }
    console.log("");
}

async function cmdState() {
    await printState();
}

async function cmdSupervise() {
    const out = await supervise({ limit: 20, staleHours: 24, write: true });
    console.log("");
    console.log(out.markdown);
    if (out.reportFile) console.log(`(đã ghi ${out.reportFile})`);
    return out;
}

/** Bước nào đang chờ ai — câu hỏi thật của người dùng là "giờ làm gì tiếp". */
async function cmdNext() {
    const run = await currentRun();
    if (!run) {
        console.log(
            `\nChưa có phiên nào đang mở.\n` +
            `  Chạy thử không cần trình duyệt:  node qa.js run analyze --task="<tên task>"\n` +
            `  Chạy toàn bài:                   node qa.js run full --task="<tên task>" --confirm-mcp\n`
        );
        return;
    }
    const state = await loadState();
    console.log(`\nPhiên ${run.run_id} — feature "${run.feature ?? "chưa gán"}" [${run.status}]\n`);
    for (const s of state.steps) {
        const mark = s.status === "done" ? (s.human_approved ? "✓ đã duyệt" : "⧗ CHỜ BẠN DUYỆT") : s.status;
        console.log(`  ${s.agent.padEnd(18)} ${mark}${s.output ? `   → ${s.output}` : ""}`);
    }
    const waiting = state.steps.find(s => s.status === "done" && !s.human_approved);
    if (waiting) {
        console.log(`\n>> Việc tiếp theo là của BẠN: đọc ${waiting.output} rồi\n   node qa.js approve ${waiting.agent} "<tên bạn>"\n`);
    } else {
        console.log(`\n>> Không có gì chờ bạn duyệt. Chạy tiếp: node qa.js run full --confirm-mcp\n`);
    }
}

// ─────────────────────────────────────────────────────────────────────
// Chạy luồng
// ─────────────────────────────────────────────────────────────────────

async function cmdRun(name, args) {
    const loaded = await loadFlows();
    const found = loaded.find(f => f.flow?.name === name);
    if (!found) {
        console.error(`\nKhông có luồng nào tên "${name}". Đang có: ` +
            (loaded.map(f => f.flow?.name).filter(Boolean).join(", ") || "(chưa có luồng nào)") + "\n");
        return 1;
    }
    if (found.problems.length) {
        console.error(`\nFile luồng "${found.flow.file}" khai sai — không chạy:`);
        found.problems.forEach(p => console.error(`  ${p}`));
        console.error("");
        return 1;
    }

    // Luồng kiểu script: chạy chính script đó trong tiến trình con, truyền nguyên đối số.
    // KHÔNG import rồi gọi: các script đó gọi `process.exit()` ở nhiều nhánh, import vào đây
    // là để nó giết luôn cả UI.
    if (found.flow.type === "script") {
        console.log(`\n>> Luồng "${name}" là script: node ${found.flow.script} ${args.join(" ")}\n`);
        return await spawnNode(found.flow.script, args);
    }

    const res = await runFlow(found.flow, { argv: args });
    if (res.reason) console.log(`\n>> ${res.reason.split("\n").join("\n   ")}\n`);
    return res.ok ? 0 : 1;
}

function spawnNode(script, args) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
        child.on("exit", (code) => resolve(code ?? 0));
        child.on("error", (err) => { console.error(`Không chạy được ${script}: ${err.message}`); resolve(1); });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Sinh lại một bước (và mọi bước phụ thuộc nó)
// ─────────────────────────────────────────────────────────────────────

/**
 * "Test case sinh ra dở / code automation sai — làm lại thế nào?"
 *
 * Trước lệnh này KHÔNG có cách nào tử tế. `flow-runner` bỏ qua mọi bước `done`, và
 * `needs_rework` chỉ được đặt tự động khi verifier trả verdict FIX. Người dùng muốn sinh lại
 * một bước thì chỉ còn hai đường, cả hai đều tệ: `--new-run` (làm lại từ đầu, trả tiền lại cho
 * cả phần phân tích) hoặc sửa tay SQLite.
 *
 * VÀ LỖ THỨ HAI, nặng hơn: đánh lại MỘT bước là chưa đủ. `qa-automation` đã sinh 21 spec TỪ
 * bảng test case cũ; `qa-verifier` đã kết luận TRÊN những spec đó. Chỉ đánh lại
 * `qa-test-designer` thì runner bỏ qua các bước sau (vẫn `done`) → **bảng test case mới đi cùng
 * spec cũ**, và không có gì báo. Nên mặc định là đánh lại CẢ hạ nguồn, tính từ `CONTRACT`.
 */
async function cmdRedo(name, { only = false } = {}) {
    if (!name) {
        console.error(
            `\nCần tên node. Ví dụ:\n` +
            `  node qa.js redo qa-test-designer      # test case dở → sinh lại nó + mọi bước phụ thuộc\n` +
            `  node qa.js redo qa-automation         # spec/code sai → sinh lại spec + kiểm chứng + báo cáo\n` +
            `  node qa.js redo qa-automation --only  # CHỈ node đó, giữ nguyên hạ nguồn (hiếm khi đúng)\n`
        );
        return 1;
    }

    const run = await currentRun();
    if (!run) {
        console.error(`\nChưa có phiên nào đang mở — không có gì để sinh lại.\n`);
        return 1;
    }

    const { nodes } = await discoverNodes();
    if (!nodes.get(name)) {
        console.error(`\nKhông có node nào tên "${name}". Đang có: ${[...nodes.keys()].join(", ")}\n`);
        return 1;
    }

    const state = await loadState();
    const has = (agent) => state.steps.some(s => s.agent === agent);
    if (!has(name)) {
        console.error(`\nBước "${name}" chưa từng chạy trong phiên này — không có gì để sinh lại.\n`);
        return 1;
    }

    // Chỉ đánh lại những bước ĐÃ chạy trong phiên này. Node ở hạ nguồn mà chưa chạy thì để yên:
    // nó sẽ tự chạy lần đầu theo luồng, không cần đánh dấu.
    const downstream = only ? [] : downstreamOf(name, nodes).filter(has);

    await markStep(name, { status: "needs_rework", note: `Người dùng yêu cầu sinh lại (${new Date().toISOString().slice(0, 10)})` });
    for (const d of downstream) {
        await markStep(d, { status: "needs_rework", note: `Đầu vào đổi: "${name}" được sinh lại` });
    }

    if (name === "qa-automation" || downstream.includes("qa-automation")) {
        try {
            db(KNOWLEDGE_DB).prepare("UPDATE artifacts SET status = 'stale', updated_at = ? WHERE kind = 'spec'").run(new Date().toISOString());
        } catch (_) {}
        try {
            if (fs.existsSync(P.UI_ELEMENTS)) fs.unlinkSync(P.UI_ELEMENTS);
        } catch (_) {}
    }

    console.log(`\n>> Đã đánh "${name}" cần sinh lại.`);
    if (downstream.length) {
        console.log(`   Kèm ${downstream.length} bước phụ thuộc: ${downstream.join(", ")}`);
        console.log(`   (đầu ra của chúng dựng trên đầu ra cũ của "${name}" — giữ nguyên là trộn bản mới với bản cũ)`);
    } else if (only) {
        console.log(`   --only: KHÔNG đánh hạ nguồn. Đầu ra của các bước sau vẫn dựng trên bản cũ.`);
    }
    // Đánh `needs_rework` cũng xoá dấu duyệt (memory.js): duyệt là duyệt MỘT bản đầu ra cụ thể,
    // bản đó sắp bị thay.
    console.log(`   Dấu duyệt của các bước trên đã bị xoá — sẽ phải duyệt lại bản mới.`);
    console.log(`\n   Chạy lại:  node qa.js run full --confirm-mcp\n`);
    return 0;
}

// ─────────────────────────────────────────────────────────────────────
// Sinh node mới từ mô tả (P7.5)
// ─────────────────────────────────────────────────────────────────────

async function cmdNew(description, opts = {}) {
    if (!description) {
        console.error(`\nCần một mô tả. Ví dụ:\n  node qa.js new "node đọc log CI, tóm tắt các test flaky trong 7 ngày"\n`);
        return 1;
    }
    let architect;
    try {
        architect = await import("./agents/qa-architect/index.js");
    } catch (err) {
        console.error(`\nChưa có agents/qa-architect/ (bộ sinh node): ${err.message}\n`);
        return 1;
    }
    const out = await architect.run({ description, ...opts });
    console.log("");
    console.log(out.data?.report ?? out.error ?? "(không có báo cáo)");
    console.log("");
    return out.status === "success" ? 0 : 1;
}

// ─────────────────────────────────────────────────────────────────────
// Menu tương tác
// ─────────────────────────────────────────────────────────────────────

const MENU = `
${HR}
  QA AGENT — hệ thống agent QA phối hợp
${HR}
  1) Chạy một luồng
  2) Giờ tôi phải làm gì tiếp?         (bước nào đang chờ ai)
  3) Duyệt một bước                    (cửa Human-Final)
  4) Bảng giám sát MỌI phiên
  5) Liệt kê luồng
  6) Liệt kê node (kèm node hỏng)
  7) Sinh LẠI một bước (test case dở / spec sai)
  8) Sinh node mới từ mô tả
  0) Thoát
${HR}`;

async function interactive() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        for (;;) {
            console.log(MENU);
            const choice = (await rl.question("Chọn: ")).trim();

            if (choice === "0" || choice === "") break;

            if (choice === "1") {
                const loaded = await cmdFlows();
                const pick = (await rl.question("Số thứ tự luồng (Enter để bỏ): ")).trim();
                const flow = loaded[Number(pick) - 1]?.flow;
                if (!flow) { console.log("Bỏ qua."); continue; }
                const hint = flow.type === "script"
                    ? (flow.command ?? `node ${flow.script}`)
                    : [...flow.flags.map(f => `--${f.name}`), ...flow.params.map(p => `--${p.name}=<${p.kind}>`)].join(" ");
                console.log(`Đối số có thể truyền: ${hint || "(không có)"}`);
                const extra = (await rl.question("Đối số (Enter nếu không): ")).trim();
                await cmdRun(flow.name, extra ? splitArgs(extra) : []);
                continue;
            }
            if (choice === "2") { await cmdNext(); continue; }
            if (choice === "3") {
                await cmdNext();
                const agent = (await rl.question("Duyệt bước nào (tên node): ")).trim();
                if (!agent) { console.log("Bỏ qua."); continue; }
                const who = (await rl.question("Tên bạn: ")).trim();
                if (!who) { console.log("Cần tên người duyệt — cửa duyệt phải ghi được AI duyệt."); continue; }
                try {
                    await approveStep(agent, who);
                    console.log(`Đã duyệt "${agent}" bởi ${who}.`);
                } catch (err) {
                    console.error(`Không duyệt được: ${err.message}`);
                }
                continue;
            }
            if (choice === "4") { await cmdSupervise(); continue; }
            if (choice === "5") { await cmdFlows(); continue; }
            if (choice === "6") { await cmdNodes(); continue; }
            if (choice === "7") {
                await cmdNext();
                const node = (await rl.question("Sinh lại bước nào (tên node): ")).trim();
                if (!node) { console.log("Bỏ qua."); continue; }
                await cmdRedo(node);
                continue;
            }
            if (choice === "8") {
                const desc = (await rl.question("Mô tả node mới (một câu, nói rõ nó ĐỌC gì và GHI gì): ")).trim();
                if (!desc) { console.log("Bỏ qua."); continue; }
                await cmdNew(desc);
                continue;
            }
            console.log("Không hiểu. Chọn một số trong menu.");
        }
    } finally {
        rl.close();
    }
}

/** Tách đối số nhập tay, tôn trọng ngoặc kép: `--report-types=bug "tên task"`. */
function splitArgs(line) {
    return [...String(line).matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);
}

// ─────────────────────────────────────────────────────────────────────
// Điều phối lệnh
// ─────────────────────────────────────────────────────────────────────

/**
 * `node qa.js test [--tc=… | --tags=… | --priority=… | --suite=…]` (R4.1c)
 *
 * Gọi hộ `npx playwright test --grep …` cho người không nhớ cú pháp. Dùng CHUNG
 * `tc-filter.js` với tầng sinh spec, nên "bộ smoke" ở đây và "bộ smoke" lúc sinh spec là
 * cùng một danh sách — không phải hai định nghĩa tình cờ giống nhau.
 *
 * Không cờ nào → chạy tất cả, đúng như gõ `npx playwright test`.
 */
async function cmdTest(args) {
    const { parseFilter, applyFilter, grepFor, loadSuites, FilterError } = await import("./agents/runtime/tc-filter.js");
    const { extractTestCases } = await import("./agents/runtime/testcase-doc.js");
    const P = await import("./agents/runtime/paths.js");
    const { readFile } = await import("node:fs/promises");
    const { spawnSync } = await import("node:child_process");

    const val = (name) => {
        const hit = args.find(a => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : "";
    };
    const opts = { tc: val("tc"), tags: val("tags"), priority: val("priority"), suite: val("suite") };

    let grep = null;
    if (Object.values(opts).some(Boolean)) {
        // Danh sách test case lấy từ ĐẶC TẢ, không từ thư mục spec: lọc theo tag/priority cần
        // cột Tags/Priority, mà chỉ bảng test case mới có.
        let md = null;
        for (const p of [P.TESTCASES, P.DELIVERABLE_TEST_DESIGNER]) {
            try { md = await readFile(p, "utf8"); break; } catch { /* thử file kế */ }
        }
        if (md === null) {
            console.error(`Chưa có bảng test case (${P.TESTCASES}) — chạy qa-test-designer trước.`);
            return 1;
        }
        const all = extractTestCases(md).rows.map(r => ({ tcId: r[0], tags: r[7], priority: r[6] }));
        try {
            const filter = parseFilter({ ...opts, suites: await loadSuites() });
            const sel = applyFilter(all, filter);
            grep = grepFor(filter, sel.selected.map(t => t.tcId));
            console.log(`Chạy ${sel.scope}: ${sel.selected.map(t => t.tcId).join(", ")}`);
        } catch (err) {
            if (!(err instanceof FilterError)) throw err;
            console.error(err.message);
            if (err.available) console.error(`  Đang có: ${JSON.stringify(err.available, null, 1)}`);
            return 1;
        }
    }

    // ⚠ GỌI THẲNG CLI CỦA PLAYWRIGHT BẰNG `node`, không qua `npx` và không qua shell.
    //
    // Hai cái bẫy đã gặp thật, cái sau lộ ra ngay khi vá cái trước:
    //
    //  1. `spawnSync("npx", …, { shell: true })` — biểu thức grep chứa `|` và `()`, nên trên
    //     Windows `cmd.exe` diễn giải chúng TRƯỚC khi tới npx:
    //     `--grep (TC-D-001|TC-D-002)` thành một pipeline, cmd báo
    //     `'TC-D-002)' is not recognized as an internal or external command`.
    //     Chỉ hỏng khi lọc từ HAI test case trở lên — một id (`(TC-D-003)`, không có `|`)
    //     chạy đúng, nên rất dễ lọt qua một lần thử nhanh.
    //
    //  2. Bỏ `shell: true` rồi gọi `npx.cmd` → `spawnSync npx.cmd EINVAL`: Node 22 từ chối
    //     spawn `.cmd`/`.bat` khi không có shell (vá CVE-2024-27980).
    //
    // Chạy `node <cli.js>` thoát cả hai: không có shell nào diễn giải đối số, và không có
    // file `.cmd` nào để Node từ chối.
    const cli = "node_modules/@playwright/test/cli.js";
    const argv = [cli, "test", ...(grep ? ["--grep", grep] : [])];
    console.log(`  npx playwright test${grep ? ` --grep ${grep}` : ""}`);

    const r = spawnSync(process.execPath, argv, { stdio: "inherit" });
    if (r.error) {
        console.error(`Không chạy được Playwright (${cli}): ${r.error.message}\n` +
            `  Cài chưa? npm install`);
        return 1;
    }
    return r.status ?? 1;
}

/**
 * `node qa.js ui [--port=5179] [--host=127.0.0.1]` (R5)
 *
 * Máy chủ web local. Nó KHÔNG chứa logic nghiệp vụ — chỉ `spawn` đúng các lệnh `qa.js` này và
 * stream stdout về trình duyệt. Xem chú thích đầu `ui/server.js`.
 */
async function cmdUi(args) {
    const { startUiServer } = await import("./ui/server.js");
    const val = (n, d) => {
        const hit = args.find(a => a.startsWith(`--${n}=`));
        return hit ? hit.slice(n.length + 3) : d;
    };
    const host = val("host", "127.0.0.1");
    const port = Number(val("port", "5179"));

    // Mặc định 127.0.0.1: máy khác trong mạng KHÔNG nối tới được. Mở ra ngoài phải là ý định
    // tường minh, và phải kèm cảnh báo — máy chủ này ghi file trong repo và sinh tiến trình con.
    if (host !== "127.0.0.1" && host !== "localhost") {
        console.warn(
            `\n⚠  ĐANG MỞ RA NGOÀI: --host=${host}\n` +
            `   Máy chủ này GHI FILE trong repo và SINH TIẾN TRÌNH CON. Bất kỳ ai tới được cổng\n` +
            `   này và có token đều chạy được pipeline của bạn. Chỉ làm việc này trong mạng tin cậy.\n`);
    }

    let srv;
    try {
        srv = await startUiServer({ port, host });
    } catch (err) {
        console.error(`Không mở được cổng ${port}: ${err.message}\n  Thử: node qa.js ui --port=${port + 1}`);
        return 1;
    }

    console.log(`\n  Giao diện QA Agent đang chạy:\n`);
    console.log(`    ${srv.url}\n`);
    console.log(`  Token đổi mỗi lần khởi động — URL cũ sẽ không dùng lại được.`);
    console.log(`  Ctrl+C để dừng.\n`);

    await new Promise((resolve) => {
        process.on("SIGINT", () => { srv.close(); resolve(); });
    });
    return 0;
}

const HELP = `
node qa.js                          menu tương tác
node qa.js flows                    liệt kê luồng
node qa.js nodes                    liệt kê node (kèm node hỏng + hợp đồng của từng node)
node qa.js next                     bước nào đang chờ ai
node qa.js run <luồng> [đối số...]  chạy một luồng
node qa.js approve <node> "<tên>"   duyệt một bước (cửa Human-Final)
node qa.js state                    trạng thái phiên hiện tại + lịch sử
node qa.js watch                    bảng giám sát MỌI phiên
node qa.js redo <node> [--only]     sinh LẠI một bước + mọi bước phụ thuộc nó
node qa.js new "<mô tả>"            sinh node mới từ mô tả  [--dry-run]
node qa.js test [--tc=|--suite=]    chạy spec đã sinh, lọc theo test case
node qa.js ui [--port=|--host=]     mở giao diện web local (thay cho gõ lệnh)
`;

const [cmd, ...rest] = argv;
let code = 0;

switch (cmd) {
    case undefined: await interactive(); break;
    case "flows": await cmdFlows(); break;
    case "nodes": await cmdNodes(); break;
    case "next": await cmdNext(); break;
    case "state": await cmdState(); break;
    case "watch": { const out = await cmdSupervise(); code = out.needsHuman.length > 0 ? 2 : 0; break; }
    case "run": code = await cmdRun(rest[0], rest.slice(1)); break;
    case "new": code = await cmdNew(rest.filter(a => !a.startsWith("--")).join(" "), { dryRun: rest.includes("--dry-run") }); break;
    case "redo": code = await cmdRedo(rest.find(a => !a.startsWith("--")), { only: rest.includes("--only") }); break;
    case "approve": {
        if (!rest[0] || !rest[1]) { console.error(`Cần: node qa.js approve <node> "<tên bạn>"`); code = 1; break; }
        try { await approveStep(rest[0], rest[1]); console.log(`Đã duyệt "${rest[0]}" bởi ${rest[1]}.`); }
        catch (err) { console.error(`Không duyệt được: ${err.message}`); code = 1; }
        break;
    }
    case "test": code = await cmdTest(rest); break;
    case "ui": code = await cmdUi(rest); break;
    case "help": case "--help": case "-h": console.log(HELP); break;
    default:
        console.error(`Không có lệnh "${cmd}".${HELP}`);
        code = 1;
}

process.exit(code);
