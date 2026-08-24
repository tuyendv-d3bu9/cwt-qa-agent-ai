// Test P7.3: đọc + KIỂM file luồng khai báo. KHÔNG gọi LLM, KHÔNG DB.
// Có đọc đĩa ở mục cuối — cố ý: hai file luồng THẬT trong flows/ phải hợp lệ, và đó là
// kiểm tra duy nhất phát hiện được "file luồng thật bị gõ sai".
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const F = await import(abs("workflow/flow-file.js"));
const R = await import(abs("agents/runtime/node-registry.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const parse = (lines) => F.parseFlowFile(Array.isArray(lines) ? lines.join("\n") : lines, { file: "t.flow.yml" });

/** Registry giả: 3 node, hợp đồng tối thiểu để kiểm đường dữ liệu. */
const fakeNodes = new Map([
    ["n1", { name: "n1", contract: { agent: "n1", requires: [], produces: ["a.md"], inputs: {} } }],
    ["n2", { name: "n2", contract: { agent: "n2", requires: ["a.md"], produces: ["b.md"], inputs: {} } }],
    ["n3", { name: "n3", contract: { agent: "n3", requires: ["ngoai.md"], produces: [], inputs: {} } }],
]);
const FAKE_PATHS = { TEST_RESULTS: "x/test-results.json" };

// ─────────── 1. Luồng tối thiểu ───────────
{
    const { flow, problems } = parse([`name: f1`, `steps:`, `  - node: n1`]);
    chk(">>> luồng tối thiểu parse sạch", problems.length === 0 && flow.steps.length === 1, JSON.stringify(problems));
    chk("mặc định: type declarative, requires_run bật, rerun khi needs_rework",
        flow.type === "declarative" && flow.requiresRun === true && flow.steps[0].rerunIfRework === true,
        JSON.stringify({ t: flow.type, r: flow.requiresRun }));
    chk("label mặc định lấy theo tên node", flow.steps[0].label === "n1", flow.steps[0].label);
}

// ─────────── 2. Key gõ sai — im lặng bỏ qua nghĩa là MẤT cửa duyệt mà không ai biết ───────────
{
    const { problems } = parse([`name: f1`, `step:`, `  - node: n1`]);
    chk(">>> key lạ ở mức ngoài cùng ('step' thay vì 'steps') bị báo",
        problems.some(p => p.includes(`"step"`)), JSON.stringify(problems));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - node: n1`, `    gates: n0`]);
    chk(">>> key lạ trong bước ('gates' thay vì 'gate') bị báo — nếu bỏ qua thì luồng chạy KHÔNG có cửa duyệt",
        problems.some(p => p.includes(`"gates"`)), JSON.stringify(problems));
}

// ─────────── 3. confirm_flag phải có lý do — xác nhận mù không phải xác nhận ───────────
{
    const { problems } = parse([`name: f1`, `flags:`, `  - name: confirm-mcp`, `steps:`, `  - node: n1`, `    confirm_flag: confirm-mcp`]);
    chk(">>> confirm_flag không kèm confirm_reason bị báo",
        problems.some(p => p.includes("confirm_reason")), JSON.stringify(problems));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - node: n1`, `    wait_for_file: TEST_RESULTS`]);
    chk("wait_for_file không kèm wait_for_hint bị báo (dừng mà không nói chạy lệnh gì)",
        problems.some(p => p.includes("wait_for_hint")), JSON.stringify(problems));
}

// ─────────── 4. branch ───────────
{
    const { flow, problems } = parse([
        `name: f1`, `steps:`, `  - node: n1`, `    branch_on: verdict`, `    branch:`,
        `      - value: PASS`, `        action: continue`,
        `      - value: FIX`, `        action: rework`, `        rework_node: n1`,
        `      - value: ASK`, `        action: stop`, `        message: đọc file rồi quyết`,
    ]);
    chk("3 nhánh đọc đúng action", problems.length === 0 && flow.steps[0].branch.length === 3, JSON.stringify(problems));
    chk("nhánh rework giữ rework_node", flow.steps[0].branch[1].reworkNode === "n1", JSON.stringify(flow.steps[0].branch[1]));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - node: n1`, `    branch_on: verdict`, `    branch:`, `      - value: ASK`, `        action: stop`, `        message: x`]);
    chk(">>> mọi nhánh đều dừng → báo (các bước sau không bao giờ chạy tới)",
        problems.some(p => p.includes("continue")), JSON.stringify(problems));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - node: n1`, `    branch_on: verdict`, `    branch:`, `      - value: FIX`, `        action: rework`]);
    chk("rework thiếu rework_node bị báo", problems.some(p => p.includes("rework_node")), JSON.stringify(problems));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - node: n1`, `    branch_on: verdict`, `    branch:`, `      - value: ASK`, `        action: stop`]);
    chk("stop thiếu message bị báo (dừng im lặng = người dùng tưởng treo)",
        problems.some(p => p.includes("message")), JSON.stringify(problems));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - node: n1`, `    branch:`, `      - value: PASS`]);
    chk("có branch mà thiếu branch_on bị báo", problems.some(p => p.includes("branch_on")), JSON.stringify(problems));
}

// ─────────── 5. Luồng kiểu script ───────────
{
    const { flow, problems } = parse([`name: f2`, `type: script`, `script: workflow/x.js`]);
    chk("luồng script hợp lệ, không cần steps", problems.length === 0 && flow.type === "script", JSON.stringify(problems));
    const bad = parse([`name: f2`, `type: script`, `script: workflow/x.js`, `steps:`, `  - node: n1`]);
    chk("luồng script có steps bị báo (thứ tự nằm trong chính script đó)",
        bad.problems.some(p => p.includes("steps")), JSON.stringify(bad.problems));
    const noScript = parse([`name: f2`, `type: script`]);
    chk("luồng script thiếu `script:` bị báo", noScript.problems.some(p => p.includes("script")), JSON.stringify(noScript.problems));
}

// ─────────── 6. validateFlow đối chiếu registry — bù cho việc mất kiểm tra tĩnh của import ───────────
{
    const { flow } = parse([`name: f1`, `steps:`, `  - node: khong-co`]);
    const v = F.validateFlow(flow, { nodes: fakeNodes, paths: FAKE_PATHS });
    chk(">>> tên node không có trong registry bị bắt TRƯỚC khi chạy bước nào",
        v.problems.some(p => p.includes("khong-co")), JSON.stringify(v.problems));
}
{
    const { flow } = parse([`name: f1`, `steps:`, `  - node: n1`, `    gate: khong-co`]);
    const v = F.validateFlow(flow, { nodes: fakeNodes, paths: FAKE_PATHS });
    chk("gate trỏ tới node không tồn tại bị bắt", v.problems.some(p => p.includes("gate")), JSON.stringify(v.problems));
}
{
    const { flow } = parse([`name: f1`, `steps:`, `  - node: n1`, `    delete_stale:`, `      - KHONG_CO_TRONG_PATHS`]);
    const v = F.validateFlow(flow, { nodes: fakeNodes, paths: FAKE_PATHS });
    chk("delete_stale trỏ tới export không có trong paths.js bị bắt",
        v.problems.some(p => p.includes("KHONG_CO_TRONG_PATHS")), JSON.stringify(v.problems));
}
{
    const { flow } = parse([`name: f1`, `steps:`, `  - node: n1`, `    with:`, `      vlmAll: $flag.chua-khai`]);
    const v = F.validateFlow(flow, { nodes: fakeNodes, paths: FAKE_PATHS });
    chk(">>> $flag trỏ tới cờ chưa khai trong `flags:` bị bắt", v.problems.some(p => p.includes("chua-khai")), JSON.stringify(v.problems));
}

// ─────────── 7. Đường dữ liệu: input đến từ đâu ───────────
{
    const { flow } = parse([`name: f1`, `steps:`, `  - node: n1`, `  - node: n2`, `  - node: n3`]);
    const v = F.validateFlow(flow, { nodes: fakeNodes, paths: FAKE_PATHS });
    chk("n2 cần a.md do n1 sinh ra trong CÙNG luồng → không báo là ngoài",
        !v.external.some(e => e.step === "n2"), JSON.stringify(v.external));
    chk(">>> n3 cần ngoai.md không ai trong luồng sinh ra → xếp vào `external`, KHÔNG phải `problems`",
        v.external.some(e => e.step === "n3" && e.path === "ngoai.md") && v.problems.length === 0,
        JSON.stringify(v));
}

// ─────────── 8. parseArgs / resolveWith ───────────
{
    const { flow } = parse([
        `name: f1`, `flags:`, `  - name: confirm-mcp`, `  - name: vlm-all`,
        `params:`, `  - name: report-types`, `    kind: list`, `    default: daily,narrative`,
        `steps:`, `  - node: n1`,
    ]);
    const a = F.parseArgs(flow, ["--confirm-mcp"]);
    chk("cờ không truyền thì false, có truyền thì true", a.flags["confirm-mcp"] === true && a.flags["vlm-all"] === false, JSON.stringify(a.flags));
    chk("param kind list có default dạng 'a,b' được tách thành mảng",
        JSON.stringify(a.params["report-types"]) === JSON.stringify(["daily", "narrative"]), JSON.stringify(a.params));
    const b = F.parseArgs(flow, ["--report-types=bug"]);
    chk("truyền --param=giá trị thì đè default", JSON.stringify(b.params["report-types"]) === JSON.stringify(["bug"]), JSON.stringify(b.params));
    const c = F.parseArgs(flow, ["--confrim-mcp"]);
    chk(">>> cờ GÕ SAI vào `unknown`, không im lặng bỏ qua (bỏ qua = người dùng tưởng đã bật)",
        c.unknown.length === 1 && c.flags["confirm-mcp"] === false, JSON.stringify(c));

    const w = F.resolveWith({ vlmAll: "$flag.vlm-all", reportTypes: "$param.report-types", thuong: 5 },
        { flags: { "vlm-all": true }, params: { "report-types": ["bug"] } });
    chk("resolveWith thay $flag/$param, giữ nguyên giá trị thường",
        w.vlmAll === true && JSON.stringify(w.reportTypes) === JSON.stringify(["bug"]) && w.thuong === 5, JSON.stringify(w));
}

// ─────────── 9. HAI FILE LUỒNG THẬT trong flows/ phải hợp lệ ───────────
{
    const { nodes } = await R.discoverNodes();
    const loaded = await F.loadFlows();
    chk("flows/ có ít nhất 2 file luồng", loaded.length >= 2, String(loaded.length));

    for (const { flow, problems } of loaded) {
        chk(`[${flow?.name ?? "?"}] parse không có vấn đề`, problems.length === 0, JSON.stringify(problems));
        if (!flow) continue;
        const v = F.validateFlow(flow, { nodes });
        chk(`[${flow.name}] đối chiếu registry thật: không sai`, v.problems.length === 0, JSON.stringify(v.problems));
    }

    const names = loaded.map(f => f.flow?.name).filter(Boolean).sort();
    chk(">>> đúng bộ 4 luồng, không còn tên flow-2/flow-3",
        JSON.stringify(names) === JSON.stringify(["analyze", "design", "full", "verify"]), JSON.stringify(names));

    const full = loaded.find(f => f.flow?.name === "full")?.flow;
    chk(">>> full: 5 bước, bước đầu là SCRIPT rồi tới 4 node, đúng thứ tự",
        JSON.stringify(full?.steps.map(s => s.kind === "script" ? "script" : s.node))
        === JSON.stringify(["script", "qa-test-designer", "qa-automation", "qa-verifier", "qa-reporter"]),
        JSON.stringify(full?.steps.map(s => s.kind === "script" ? "script" : s.node)));
    chk(">>> bước script khai `expect_step` — nếu thiếu, luồng đi tiếp khi nửa đầu còn chờ người",
        full?.steps[0].expectStep === "qa-analyst", JSON.stringify(full?.steps[0]));
    chk("bước script truyền task xuống và chuyển tiếp cờ --new-run",
        JSON.stringify(full?.steps[0].args) === JSON.stringify(["$param.task"])
        && JSON.stringify(full?.steps[0].passFlags) === JSON.stringify(["new-run"]),
        JSON.stringify({ a: full?.steps[0].args, p: full?.steps[0].passFlags }));
    chk(">>> mọi bước NODE đều có cửa duyệt người (Human-Final như 6 role.md tuyên bố)",
        full?.steps.filter(s => s.kind === "node").every(s => s.gate),
        JSON.stringify(full?.steps.map(s => s.gate)));
    chk(">>> bước qa-automation vẫn CẦN --confirm-mcp (không được mất khi gộp luồng)",
        full?.steps[2].confirmFlag === "confirm-mcp" && Boolean(full?.steps[2].confirmReason),
        JSON.stringify(full?.steps[2].confirmFlag));
    chk(">>> test-results.json cũ bị xoá trước khi automation chạy lại",
        JSON.stringify(full?.steps[2].deleteStale) === JSON.stringify(["TEST_RESULTS"]), JSON.stringify(full?.steps[2].deleteStale));
    chk(">>> verifier vẫn dừng chờ người/CI chạy playwright",
        full?.steps[3].waitForFile === "TEST_RESULTS" && full?.steps[3].waitForHint.includes("playwright"),
        JSON.stringify(full?.steps[3].waitForHint));
    chk(">>> 3 verdict đủ cả (thiếu một cái là runner dừng vì 'verdict lạ')",
        JSON.stringify(full?.steps[3].branch.map(b => b.value).sort()) === JSON.stringify(["ASK", "FIX", "PASS"]),
        JSON.stringify(full?.steps[3].branch.map(b => b.value)));
    chk("report-types KHÔNG mặc định sinh 'bug' (bug phải do người xác nhận)",
        !full?.params.find(p => p.name === "report-types")?.default.includes("bug"),
        JSON.stringify(full?.params.find(p => p.name === "report-types")?.default));
    chk(">>> `full` không đòi phiên sẵn (bước script tự mở phiên)", full?.requiresRun === false, String(full?.requiresRun));

    const analyze = loaded.find(f => f.flow?.name === "analyze")?.flow;
    chk(">>> `analyze` KHÔNG gọi MCP: không bước nào có confirm_flag (luồng an toàn cho lớp học)",
        analyze?.steps.every(s => !s.confirmFlag), JSON.stringify(analyze?.steps.map(s => s.confirmFlag)));
    chk(">>> `analyze` KHÔNG đóng phiên (design/full còn tiếp chính phiên đó)",
        analyze?.finish === null, String(analyze?.finish));

    const verify = loaded.find(f => f.flow?.name === "verify")?.flow;
    chk("`verify` ĐÒI phiên sẵn — không có phiên thì không có spec nào để kiểm chứng",
        verify?.requiresRun === true, String(verify?.requiresRun));

    chk(">>> task là đối số VỊ TRÍ ở cả 3 luồng cần nó (QA Manual không phải gõ --task=)",
        [full, analyze, loaded.find(f => f.flow?.name === "design")?.flow]
            .every(f => f?.params.find(p => p.name === "task")?.positional === true));
}

// ─────────── 10. Bước dạng SCRIPT (Q1.1) ───────────
{
    const { flow, problems } = parse([
        `name: f1`, `params:`, `  - name: task`, `    positional: true`,
        `flags:`, `  - name: new-run`,
        `steps:`, `  - script: workflow/leader-analyst.js`, `    expect_step: n1`,
        `    args:`, `      - $param.task`, `    pass_flags:`, `      - new-run`,
    ]);
    chk("bước script parse sạch", problems.length === 0, JSON.stringify(problems));
    chk("bước script có kind='script', node=null", flow.steps[0].kind === "script" && flow.steps[0].node === null, JSON.stringify(flow.steps[0].kind));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - script: workflow/x.js`]);
    chk(">>> bước script THIẾU expect_step bị từ chối — script chờ-người và script xong ĐỀU thoát 0",
        problems.some(p => p.includes("expect_step") && p.includes("mã thoát")), JSON.stringify(problems));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - node: n1`, `    script: workflow/x.js`]);
    chk("khai cả node và script bị từ chối", problems.some(p => p.includes("một trong hai")), JSON.stringify(problems));
}
{
    const { problems } = parse([`name: f1`, `steps:`, `  - script: workflow/x.js`, `    expect_step: n1`, `    branch_on: verdict`]);
    chk("key chỉ dành cho node (branch_on) khai trên bước script bị từ chối",
        problems.some(p => p.includes("branch_on")), JSON.stringify(problems));
}
{
    const { flow } = parse([`name: f1`, `steps:`, `  - script: workflow/khong-co.js`, `    expect_step: n1`]);
    const v = F.validateFlow(flow, { nodes: fakeNodes, paths: FAKE_PATHS, fileExists: () => false });
    chk(">>> file script không tồn tại bị bắt TRƯỚC khi chạy (tên gõ sai = luồng chết giữa đường)",
        v.problems.some(p => p.includes("không có file này")), JSON.stringify(v.problems));
}
{
    const { flow } = parse([`name: f1`, `steps:`, `  - script: workflow/x.js`, `    expect_step: khong-co`]);
    const v = F.validateFlow(flow, { nodes: fakeNodes, paths: FAKE_PATHS, fileExists: () => true });
    chk("expect_step trỏ tới node không tồn tại bị bắt", v.problems.some(p => p.includes("khong-co")), JSON.stringify(v.problems));
}
{
    const { flow } = parse([`name: f1`, `steps:`, `  - script: workflow/x.js`, `    expect_step: n1`, `    pass_flags:`, `      - chua-khai`]);
    const v = F.validateFlow(flow, { nodes: fakeNodes, paths: FAKE_PATHS, fileExists: () => true });
    chk("pass_flags trỏ tới cờ chưa khai bị bắt", v.problems.some(p => p.includes("chua-khai")), JSON.stringify(v.problems));
}

// ─────────── 11. Param vị trí ───────────
{
    const { flow } = parse([`name: f1`, `params:`, `  - name: task`, `    positional: true`, `steps:`, `  - node: n1`]);
    chk(">>> đối số không có '--' vào đúng param vị trí",
        F.parseArgs(flow, ["Phân tích voucher"]).params.task === "Phân tích voucher",
        JSON.stringify(F.parseArgs(flow, ["Phân tích voucher"])));
    chk("--task= vẫn dùng được song song", F.parseArgs(flow, ["--task=abc"]).params.task === "abc");
    chk(">>> chuỗi vị trí THỨ HAI vào `unknown`, không im lặng biến mất",
        JSON.stringify(F.parseArgs(flow, ["a", "b"]).unknown) === JSON.stringify(["b"]),
        JSON.stringify(F.parseArgs(flow, ["a", "b"]).unknown));
}
{
    const { problems } = parse([`name: f1`, `params:`, `  - name: a`, `    positional: true`, `  - name: b`, `    positional: true`, `steps:`, `  - node: n1`]);
    chk("hai param vị trí bị từ chối (không cách nào biết đối số nào của ai)",
        problems.some(p => p.includes("chỉ được một")), JSON.stringify(problems));
}

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nflow-file: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
