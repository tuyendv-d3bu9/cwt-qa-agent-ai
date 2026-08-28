// Test R4: chọn tập test case để chạy.
//
// Câu hỏi gốc: "chỗ nào có thể điều khiển là lần 1 tôi chạy các test case 1 2 3, hay bộ testcase
// happy path?". Trước R4: không có chỗ nào. `grep --tc` toàn repo = 0 kết quả. Cách duy nhất là
// `npx playwright test --grep TC-D-001` gõ tay, và nó CHỈ lọc ở tầng chạy — 20 spec vẫn được
// sinh, MCP vẫn mở trình duyệt 20 lần, tiền LLM vẫn trả đủ.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const F = await import(abs("agents/runtime/tc-filter.js"));
const Y = await import(abs("agents/runtime/yaml-lite.js"));

const T = [];
const chk = (n, c, e = "") => T.push([n, c, e]);

const ALL = [
    { tcId: "TC-D-001", tags: "[Happy Path]", priority: "Critical" },
    { tcId: "TC-D-002", tags: "[EP], [REGRESSION]", priority: "High" },
    { tcId: "TC-D-003", tags: "[BVA]", priority: "High" },
    { tcId: "TC-D-004", tags: "[Happy Path]", priority: "Medium" },
    { tcId: "TC-D-010", tags: "[EP]", priority: "Low" },
];

// ─────────── 1. Không có cờ nào → chạy tất cả ───────────
{
    const f = F.parseFilter({});
    chk(">>> không cờ nào → empty, chạy TẤT CẢ (giữ nguyên hành vi trước R4)", f.empty === true);
    const r = F.applyFilter(ALL, f);
    chk("chọn hết, không bỏ ai", r.selected.length === 5 && r.skipped.length === 0);
    chk("scope nói 5/5", r.scope === "5/5 test case", r.scope);
    chk("không lọc thì KHÔNG dựng --grep", F.grepFor(f) === null);
}

// ─────────── 2. Danh sách ID ───────────
{
    const f = F.parseFilter({ tc: "TC-D-001,TC-D-002, TC-D-003" });
    const r = F.applyFilter(ALL, f);
    chk("chọn đúng 3 test case đầu", r.selected.map(t => t.tcId).join(",") === "TC-D-001,TC-D-002,TC-D-003",
        r.selected.map(t => t.tcId).join(","));
    chk("2 test case còn lại vào `skipped`, không biến mất", r.skipped.length === 2, String(r.skipped.length));
    chk("khoảng trắng thừa quanh dấu phẩy không làm hỏng", r.selected.length === 3);
}

// ─────────── 3. Khoảng ───────────
{
    chk("khai triển khoảng, giữ số 0 đệm",
        F.expandRange("TC-D-001..TC-D-004").join(",") === "TC-D-001,TC-D-002,TC-D-003,TC-D-004",
        F.expandRange("TC-D-001..TC-D-004").join(","));
    const r = F.applyFilter(ALL, F.parseFilter({ tc: "TC-D-002..TC-D-004" }));
    chk("khoảng chỉ lấy TC có thật, không đòi TC không tồn tại",
        r.selected.map(t => t.tcId).join(",") === "TC-D-002,TC-D-003,TC-D-004", r.selected.map(t => t.tcId).join(","));

    let threw = null;
    try { F.expandRange("TC-D-001..TC-E-003"); } catch (e) { threw = e.message; }
    chk(">>> hai đầu khoảng khác phần gốc → NÉM, không đoán khoảng ở giữa",
        threw !== null && /phần gốc khác nhau/.test(threw), String(threw));

    threw = null;
    try { F.expandRange("TC-D-005..TC-D-001"); } catch (e) { threw = e.message; }
    chk("khoảng đi ngược → ném", threw !== null && /đi ngược/.test(threw), String(threw));
}

// ─────────── 4. Tags và priority ───────────
{
    const r = F.applyFilter(ALL, F.parseFilter({ tags: "@Happy Path" }));
    chk("lọc theo tag, khớp được cả khi bảng ghi kiểu [Happy Path]",
        r.selected.map(t => t.tcId).join(",") === "TC-D-001,TC-D-004", r.selected.map(t => t.tcId).join(","));
    chk("gõ tag không có @ vẫn khớp",
        F.applyFilter(ALL, F.parseFilter({ tags: "Happy Path" })).selected.length === 2);
    chk("lọc theo priority", F.applyFilter(ALL, F.parseFilter({ priority: "High" })).selected.length === 2);
    chk("priority nhiều giá trị", F.applyFilter(ALL, F.parseFilter({ priority: "Critical,Low" })).selected.length === 2);
}

// ─────────── 5. Nhiều tiêu chí = GIAO (AND) ───────────
{
    const r = F.applyFilter(ALL, F.parseFilter({ tags: "@Happy Path", priority: "Critical" }));
    chk(">>> tags AND priority (không phải hợp) — chỉ TC-D-001 vừa Happy Path vừa Critical",
        r.selected.map(t => t.tcId).join(",") === "TC-D-001", r.selected.map(t => t.tcId).join(","));
}

// ─────────── 6. LUẬT QUAN TRỌNG NHẤT: không khớp ai thì DỪNG ───────────
//
// Im lặng chạy 0 test rồi báo PASS không sai ở một test case — nó sai ở TOÀN BỘ kết luận.
{
    let err = null;
    try { F.applyFilter(ALL, F.parseFilter({ tc: "TC-D-999" })); } catch (e) { err = e; }
    chk(">>> lọc không khớp TC nào → NÉM, KHÔNG trả mảng rỗng rồi báo PASS",
        err !== null && err.name === "FilterError", String(err));
    chk(">>> thông báo LIỆT KÊ các TC_ID đang có (gõ sai 1 ký tự phải thấy ngay danh sách đúng)",
        err?.available?.tcId?.includes("TC-D-001"), JSON.stringify(err?.available ?? null));
    chk("liệt kê cả tag và priority đang có",
        err?.available?.tags?.length > 0 && err?.available?.priority?.includes("Critical"),
        JSON.stringify(err?.available));
    chk("thông báo nhắc lại chính cờ người dùng đã gõ", /--tc=TC-D-999/.test(err.message), err.message);
}

// ─────────── 7. suites.yml ───────────
{
    const { readFileSync } = await import("node:fs");
    const suites = Y.parseYamlLite(readFileSync("flows/suites.yml", "utf8"), { file: "flows/suites.yml" });

    chk(">>> flows/suites.yml THẬT nạp được bằng yaml-lite (kiểu khối, không inline)",
        typeof suites === "object" && Object.keys(suites).length >= 3, JSON.stringify(Object.keys(suites)));

    const r = F.applyFilter(ALL, F.parseFilter({ suite: "happy", suites }));
    chk("--suite=happy → đúng các TC Happy Path", r.selected.map(t => t.tcId).join(",") === "TC-D-001,TC-D-004",
        r.selected.map(t => t.tcId).join(","));
    chk("--suite=critical → theo priority",
        F.applyFilter(ALL, F.parseFilter({ suite: "critical", suites })).selected.map(t => t.tcId).join(",") === "TC-D-001");

    let err = null;
    try { F.parseFilter({ suite: "khong-co", suites }); } catch (e) { err = e; }
    chk(">>> gõ tên bộ không tồn tại → nêu tên các bộ ĐANG CÓ",
        err?.available?.includes("happy") && err?.available?.includes("smoke"), JSON.stringify(err?.available));

    // suite + cờ khác cùng lúc: vẫn là GIAO.
    const both = F.applyFilter(ALL, F.parseFilter({ suite: "happy", priority: "Medium", suites }));
    chk("--suite kết hợp --priority vẫn là GIAO", both.selected.map(t => t.tcId).join(",") === "TC-D-004",
        both.selected.map(t => t.tcId).join(","));
}
{
    let err = null;
    try { F.parseFilter({ suite: "rong", suites: { rong: {} } }); } catch (e) { err = e; }
    chk("bộ khai rỗng (không tc/tags/priority) → báo, không im lặng chọn tất cả",
        err !== null && /không khai/.test(err.message), String(err));
}

// ─────────── 8. Phạm vi phải đi kèm verdict ───────────
{
    chk("chạy đủ bộ → verdict giữ nguyên, không thêm nhiễu",
        F.scopedVerdict("PASS", { selected: 20, total: 20 }) === "PASS");
    chk(">>> chạy 3/20 → verdict PHẢI nói rõ phạm vi (PASS trên 3 case mà đọc như PASS cả bộ là nói dối)",
        F.scopedVerdict("PASS", { selected: 3, total: 20 }) === "PASS (3/20 test case)",
        F.scopedVerdict("PASS", { selected: 3, total: 20 }));
}

// ─────────── 9. --grep cho Playwright dựng từ CÙNG bộ lọc ───────────
{
    const f = F.parseFilter({ tc: "TC-D-001,TC-D-002" });
    const g = F.grepFor(f);
    // Dấu `-` KHÔNG cần escape ngoài character class — escape thừa vẫn chạy nhưng làm biểu
    // thức khó đọc khi in ra cho người dùng xem.
    chk("dựng được biểu thức grep", g === "(TC-D-001|TC-D-002)", String(g));
    chk(">>> grep khớp đúng tiêu đề test codegen sinh ra",
        new RegExp(g).test("TC-D-001: Áp mã hợp lệ @identity:customer"), String(g));
    chk("và KHÔNG khớp test case ngoài danh sách",
        !new RegExp(g).test("TC-D-003: Ca khác @identity:guest"), String(g));
    // Lọc theo tag thì tầng 1 đã chỉ sinh spec được chọn → truyền id thật vào để grep chính xác.
    chk("lọc theo tag: dựng grep từ id đã chọn, không từ tag",
        F.grepFor(F.parseFilter({ tags: "@Happy Path" }), ["TC-D-001", "TC-D-004"]) === "(TC-D-001|TC-D-004)",
        String(F.grepFor(F.parseFilter({ tags: "@Happy Path" }), ["TC-D-001", "TC-D-004"])));
}

// ─────────── 10. KHÉP KÍN: --tc trên dòng lệnh → tới được node ───────────
//
// Bốn mắt xích, mỗi mắt ở một file khác nhau. Đứt bất kỳ mắt nào thì cờ vẫn được nhận, vẫn
// không có lỗi, và pipeline vẫn chạy CẢ BỘ — đúng kiểu hỏng im lặng mà R4 sinh ra để chống.
{
    const FF = await import(abs("workflow/flow-file.js"));
    const { readFileSync } = await import("node:fs");
    const { flow, problems } = FF.parseFlowFile(readFileSync("flows/full.flow.yml", "utf8"), { file: "flows/full.flow.yml" });

    chk("flows/full.flow.yml không có vấn đề khai báo", problems.length === 0, JSON.stringify(problems));
    chk("khai đủ 4 cờ lọc", ["tc", "tags", "priority", "suite"].every(n => flow.params.some(p => p.name === n)),
        flow.params.map(p => p.name).join(","));

    // 1) người gõ → parseArgs
    const parsed = FF.parseArgs(flow, ["Task X", "--tc=TC-D-001,TC-D-002"]);
    chk("parseArgs nhận --tc", parsed.params.tc === "TC-D-001,TC-D-002", JSON.stringify(parsed.params));
    chk("cờ lọc không bị coi là đối số lạ", parsed.unknown.length === 0, JSON.stringify(parsed.unknown));

    // 2) flow → node qua `with:`
    const step = flow.steps.find(s => s.node === "qa-automation");
    const args = FF.resolveWith(step.with, { params: parsed.params, flags: parsed.flags });
    chk(">>> `with:` chuyển --tc xuống tận qa-automation", args.tc === "TC-D-001,TC-D-002", JSON.stringify(args));

    // 3) node → bộ lọc → tập test case
    const r = F.applyFilter(ALL, F.parseFilter(args));
    chk(">>> KHÉP KÍN: gõ `--tc=TC-D-001,TC-D-002` cho ra ĐÚNG 2 test case ở tầng sinh spec",
        r.selected.map(t => t.tcId).join(",") === "TC-D-001,TC-D-002", r.selected.map(t => t.tcId).join(","));
    chk("và 3 test case còn lại được ghi nhận là bỏ qua, không biến mất", r.skipped.length === 3);

    // 4) không gõ gì → chạy tất cả, y như trước R4
    const none = FF.parseArgs(flow, ["Task X"]);
    const rAll = F.applyFilter(ALL, F.parseFilter(FF.resolveWith(step.with, { params: none.params, flags: none.flags })));
    chk(">>> không gõ cờ nào → vẫn chạy CẢ BỘ (R4 không được đổi hành vi mặc định)",
        rAll.selected.length === ALL.length, String(rAll.selected.length));
}

// ─────────── 11. Tag Playwright (tầng 2) ───────────
{
    const G = await import(abs("agents/qa-automation/tools/gherkin-codegen.js"));
    chk("dựng tham số tag từ tag Gherkin có sẵn",
        G.playwrightTags({ tags: ["TC-D-001", "Critical"] }) === `, { tag: ["@TC-D-001", "@Critical"] }`,
        G.playwrightTags({ tags: ["TC-D-001", "Critical"] }));
    // Playwright bỏ qua phần sau dấu cách trong tag → "@Happy Path" thành "@Happy" và
    // `--grep @Happy-Path` không khớp gì. Im lặng.
    chk(">>> tag có khoảng trắng phải thành gạch nối, nếu không --grep không khớp gì",
        G.playwrightTags({ tags: ["Happy Path"] }) === `, { tag: ["@Happy-Path"] }`,
        G.playwrightTags({ tags: ["Happy Path"] }));
    chk("tư cách cũng vào tag, không trùng lặp",
        G.playwrightTags({ tags: ["TC-D-001"] }, "customer") === `, { tag: ["@TC-D-001", "@identity:customer"] }`,
        G.playwrightTags({ tags: ["TC-D-001"] }, "customer"));
    chk("không có tag nào → không sinh tham số thứ hai (spec y như trước)",
        G.playwrightTags({ tags: [] }) === "", G.playwrightTags({ tags: [] }));

    // Spec sinh ra phải hợp lệ về cú pháp: tag là tham số THỨ HAI, callback là thứ ba.
    const catalogue = { available: [{ name: "step1_them", text: "thêm hàng", kind: "action", needsValue: false }] };
    const src = G.emitSpec({
        scenario: { name: "Áp mã", tcId: "TC-D-001", tags: ["TC-D-001", "Happy Path"], steps: [{ keyword: "Given", text: "thêm hàng", raw: "thêm hàng", arg: null }] },
        catalogue, testCase: { tcId: "TC-D-001", expected: 'thấy "OK"' }, identity: "customer",
    }).content;
    chk(">>> spec sinh ra: test('...', { tag: [...] }, async ({ page }) => {",
        /test\('[^']*',\s*\{ tag: \[[^\]]+\] \},\s*async \(\{ page \}\)/.test(src),
        (src.match(/test\([^\n]*/) ?? [""])[0]);
}

let bad = 0;
for (const [n, c, e] of T) { if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + n + (e && !c ? "   → " + String(e).slice(0, 220) : "")); }
console.log(`\ntc-filter: ${T.length - bad}/${T.length}`);
process.exit(bad === 0 ? 0 : 1);
