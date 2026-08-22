// Test P7.2: tự dò node + kiểm CONTRACT. KHÔNG gọi LLM, KHÔNG đọc đĩa (tiêm listDirs/load).
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const R = await import(abs("agents/runtime/node-registry.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// paths.js giả — chỉ cần vài export để kiểm luật "inputs phải trỏ tới export có thật".
const FAKE_PATHS = { TASK: "x/task.md", OUT: "x/out.md", OTHER: "x/other.md" };

const goodModule = { CONTRACT: {}, run: () => { } };
const validate = (contract, module = goodModule, dirName = "qa-x") =>
    R.validateContract(contract, { dirName, module, paths: FAKE_PATHS });

// ─────────── 1. CONTRACT hợp lệ ───────────
{
    const problems = validate({ agent: "qa-x", requires: ["x/task.md"], produces: ["x/out.md"], inputs: { taskFile: "TASK" } });
    chk(">>> CONTRACT đủ và đúng thì không có vấn đề nào", problems.length === 0, JSON.stringify(problems));
}
{
    const problems = validate({ agent: "qa-x", requires: [], produces: [], inputs: {} });
    chk("node đầu luồng (requires/inputs rỗng) vẫn hợp lệ", problems.length === 0, JSON.stringify(problems));
}

// ─────────── 2. Thiếu CONTRACT ───────────
{
    const problems = R.validateContract(undefined, { dirName: "qa-x", module: goodModule, paths: FAKE_PATHS });
    chk("không export CONTRACT → báo, và chỉ đúng file template để xem",
        problems.length === 1 && problems[0].includes("_qa-template/contract.md"), JSON.stringify(problems));
}

// ─────────── 3. agent lệch tên thư mục — khoá của run_steps ───────────
{
    const problems = validate({ agent: "qa-y", requires: [], produces: [], inputs: {} });
    chk(">>> agent lệch tên thư mục bị bắt, và nói rõ hậu quả (duyệt một tên, tra tên khác)",
        problems.some(p => p.includes("run_steps")), JSON.stringify(problems));
}

// ─────────── 4. inputs trỏ tới export không có thật ───────────
{
    const problems = validate({ agent: "qa-x", requires: ["x/task.md"], produces: [], inputs: { taskFile: "KHONG_CO" } });
    chk(">>> inputs trỏ tới export lạ bị bắt (nếu không, node nhận undefined rồi chết bên trong)",
        problems.some(p => p.includes("KHONG_CO")), JSON.stringify(problems));
}

// ─────────── 5. inputs đọc file KHÔNG khai trong requires — cửa gác mất tác dụng ───────────
{
    const problems = validate({ agent: "qa-x", requires: ["x/other.md"], produces: [], inputs: { taskFile: "TASK" } });
    chk(">>> inputs có path ngoài requires bị bắt",
        problems.some(p => p.includes("requireInputs")), JSON.stringify(problems));
}

// ─────────── 6. entry không tồn tại ───────────
{
    const problems = validate({ agent: "qa-x", requires: [], produces: [], inputs: {}, entry: "runSetup" });
    chk("entry khai mà không có function tương ứng thì báo",
        problems.some(p => p.includes("runSetup")), JSON.stringify(problems));
    const ok = R.validateContract(
        { agent: "qa-x", requires: [], produces: [], inputs: {}, entry: "runSetup" },
        { dirName: "qa-x", module: { runSetup: () => { } }, paths: FAKE_PATHS });
    chk("entry khác 'run' mà có thật thì hợp lệ", ok.length === 0, JSON.stringify(ok));
}

// ─────────── 7. requires/produces sai kiểu ───────────
{
    const problems = validate({ agent: "qa-x", requires: "x/task.md", produces: [""], inputs: {} });
    chk("requires không phải mảng → báo", problems.some(p => p.includes("requires")), JSON.stringify(problems));
    chk("produces có phần tử rỗng → báo", problems.some(p => p.includes("produces")), JSON.stringify(problems));
}
{
    const problems = validate({ agent: "qa-x", requires: [], produces: [], inputs: ["TASK"] });
    chk("inputs là mảng (không phải map) → báo", problems.some(p => p.includes("inputs")), JSON.stringify(problems));
}

// ─────────── 8. discoverNodes: node hỏng KHÔNG vào registry, nhưng phải LIỆT KÊ được ───────────
{
    const { nodes, broken } = await R.discoverNodes({
        listDirs: () => ["qa-tot", "qa-hong"],
        load: async (d) => d === "qa-tot"
            ? { CONTRACT: { agent: "qa-tot", requires: [], produces: [], inputs: {} }, run: () => { } }
            : { CONTRACT: { agent: "SAI-TEN", requires: [], produces: [], inputs: {} }, run: () => { } },
    });
    chk("node đúng vào registry", nodes.has("qa-tot") && nodes.size === 1, [...nodes.keys()].join(","));
    chk(">>> node hỏng KHÔNG vào registry nhưng vẫn liệt kê trong `broken` (im lặng bỏ qua = 'node biến mất')",
        broken.length === 1 && broken[0].name === "qa-hong", JSON.stringify(broken.map(b => b.name)));
}

// ─────────── 9. discoverNodes: file không import nổi ───────────
{
    const { nodes, broken } = await R.discoverNodes({
        listDirs: () => ["qa-no"],
        load: async () => { throw new Error("module is not defined"); },
    });
    chk("node không import nổi → vào `broken` kèm nguyên văn lỗi, không làm sập cả lần dò",
        nodes.size === 0 && broken[0].problems[0].includes("module is not defined"), JSON.stringify(broken));
}

// ─────────── 10. resolveArgs: dựng đối số từ inputs + with ───────────
{
    const node = { name: "qa-x", contract: { inputs: { taskFile: "TASK", outFile: "OUT" } } };
    const a = R.resolveArgs(node, { paths: FAKE_PATHS });
    chk(">>> resolveArgs dịch inputs thành đối số thật của run()",
        a.taskFile === "x/task.md" && a.outFile === "x/out.md", JSON.stringify(a));
    const b = R.resolveArgs(node, { with: { vlmAll: true, taskFile: "x/khac.md" }, paths: FAKE_PATHS });
    chk("`with` cấp tham số không phải path VÀ được phép đè path", b.vlmAll === true && b.taskFile === "x/khac.md", JSON.stringify(b));
}

// ─────────── 11. classifyStatus — từ vựng status là phần của hợp đồng ───────────
{
    chk("'success' và 'ready' đều là XONG (qa-leader trả 'ready')",
        R.classifyStatus("success") === "DONE" && R.classifyStatus("ready") === "DONE");
    chk("'waiting_input'/'waiting_ask' là CHỜ NGƯỜI, không phải lỗi",
        R.classifyStatus("waiting_input") === "WAITING" && R.classifyStatus("waiting_ask") === "WAITING");
    chk("'error' là lỗi, 'not_started' là không có gì để làm",
        R.classifyStatus("error") === "FAILED" && R.classifyStatus("not_started") === "NOT_STARTED");
    chk(">>> status ngoài từ vựng trả null (để runner DỪNG chứ không đoán)",
        R.classifyStatus("done") === null && R.classifyStatus(undefined) === null);
}

// ─────────── 12. Registry THẬT của repo — 6 node phải hợp lệ hết ───────────
{
    const { nodes, broken } = await R.discoverNodes();
    const want = ["qa-analyst", "qa-automation", "qa-leader", "qa-reporter", "qa-test-designer", "qa-verifier"];
    chk(">>> cả 6 node thật trong repo đều có CONTRACT hợp lệ",
        want.every(n => nodes.has(n)), `có: ${[...nodes.keys()].join(", ")}`);
    chk(">>> KHÔNG có node hỏng (agents/runtime/ là thư viện, không được nhận nhầm là node)",
        broken.length === 0, JSON.stringify(broken.map(b => b.name)));
    chk("qa-leader dùng entry 'runSetup', không phải 'run'", nodes.get("qa-leader")?.entry === "runSetup");
}

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nnode-registry: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
