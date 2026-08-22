// Test P7.3a: parser YAML tập-con. KHÔNG gọi LLM, KHÔNG DB, KHÔNG đọc đĩa.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const Y = await import(abs("agents/runtime/yaml-lite.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const parse = (t) => Y.parseYamlLite(t, { file: "t.yml" });
/** Bắt lỗi và trả message — parser này TỪ CHỐI là chức năng chính, nên phải test cả nhánh nổ. */
const boom = (t) => { try { parse(t); return null; } catch (e) { return e.message; } };

// ─────────── 1. mapping phẳng + các kiểu vô hướng ───────────
{
    const r = parse(`name: full-qa\ntitle: Thiết kế → báo cáo\nrounds: 3\nratio: 1.5\ngate: true\nskip: false\nnote:\nnil: ~`);
    chk(">>> mapping phẳng đọc đúng chuỗi/số/bool/null",
        r.name === "full-qa" && r.title === "Thiết kế → báo cáo" && r.rounds === 3 && r.ratio === 1.5
        && r.gate === true && r.skip === false && r.note === null && r.nil === null,
        JSON.stringify(r));
}

// ─────────── 2. list mapping — hình dạng thật của flows/*.flow.yml ───────────
{
    const r = parse([
        `name: design-to-report`,
        `steps:`,
        `  - node: qa-test-designer`,
        `    gate: qa-analyst`,
        `  - node: qa-automation`,
        `    with:`,
        `      confirmMcp: true`,
    ].join("\n"));
    chk("list các mapping: đủ 2 phần tử, không dính vào nhau",
        Array.isArray(r.steps) && r.steps.length === 2, JSON.stringify(r.steps));
    chk("phần tử 1 giữ cả key trên dòng '-' và key dòng dưới",
        r.steps[0].node === "qa-test-designer" && r.steps[0].gate === "qa-analyst", JSON.stringify(r.steps[0]));
    chk("mapping lồng 2 tầng trong 1 phần tử list",
        r.steps[1].node === "qa-automation" && r.steps[1].with.confirmMcp === true, JSON.stringify(r.steps[1]));
}

// ─────────── 3. list dấu '-' NGANG hàng với key mẹ (YAML cho phép) ───────────
{
    const r = parse(`steps:\n- node: a\n- node: b`);
    chk("dấu '-' ngang hàng key mẹ vẫn ra list 2 phần tử",
        r.steps?.length === 2 && r.steps[1].node === "b", JSON.stringify(r));
}

// ─────────── 4. list vô hướng ───────────
{
    const r = parse(`reportTypes:\n  - bug\n  - daily\n  - "sprint: q3"`);
    chk("list vô hướng, phần tử có ngoặc kép giữ nguyên dấu hai chấm",
        JSON.stringify(r.reportTypes) === JSON.stringify(["bug", "daily", "sprint: q3"]), JSON.stringify(r));
}

// ─────────── 5. chú thích ───────────
{
    const r = parse([
        `# vì sao có cửa duyệt ở đây`,
        `node: qa-automation   # chạy MCP thật`,
        `url: https://a.io/b#c`,
        `tag: "#1"`,
    ].join("\n"));
    chk("chú thích cả dòng + cuối dòng bị bỏ", r.node === "qa-automation", JSON.stringify(r));
    chk(">>> '#' trong URL KHÔNG bị coi là chú thích (không có khoảng trắng trước)",
        r.url === "https://a.io/b#c", r.url);
    chk("'#' trong ngoặc kép không bị coi là chú thích", r.tag === "#1", r.tag);
}

// ─────────── 6. dấu hai chấm trong giá trị ───────────
{
    const r = parse(`title: "Bước 2: nhập mã"\ntime: 12:30\nplain: Bước 2 - nhập mã`);
    chk("chuỗi trong ngoặc kép giữ dấu hai chấm", r.title === "Bước 2: nhập mã", r.title);
    chk(">>> '12:30' KHÔNG bị hiểu là mapping (không có khoảng trắng sau dấu hai chấm)",
        r.time === "12:30", JSON.stringify(r.time));
    chk("chuỗi thường không ngoặc vẫn nguyên vẹn", r.plain === "Bước 2 - nhập mã", r.plain);
}

// ─────────── 7. TỪ CHỐI cú pháp ngoài tập con — đây là chức năng, không phải hạn chế ───────────
{
    chk(">>> TAB ở thụt lề bị từ chối, kèm số dòng",
        (boom(`a:\n\tb: 1`) ?? "").includes("TAB") && (boom(`a:\n\tb: 1`) ?? "").includes("t.yml:2"),
        boom(`a:\n\tb: 1`));
    chk("object inline {} bị từ chối", (boom(`a: {b: 1}`) ?? "").includes("inline"), boom(`a: {b: 1}`));
    chk("list inline [] bị từ chối", (boom(`a: [1, 2]`) ?? "").includes("inline"), boom(`a: [1, 2]`));
    chk("'|2' (chỉ số thụt lề) bị từ chối", (boom(`a: |2\n  x`) ?? "").includes("chỉ được có"), boom(`a: |2\n  x`));
    chk("'>+' bị từ chối", (boom(`a: >+\n  x`) ?? "").includes("chỉ được có"), boom(`a: >+\n  x`));
    chk("anchor & bị từ chối", (boom(`a: &x 1`) ?? "").includes("anchor"), boom(`a: &x 1`));
    chk("nhiều document bị từ chối", (boom(`---\na: 1\n---\nb: 2`) ?? "").includes("nhiều document"), boom(`---\na: 1\n---\nb: 2`));
    chk("một '---' mở đầu thì CHẤP NHẬN", parse(`---\na: 1`)?.a === 1, JSON.stringify(parse(`---\na: 1`)));
}

// ─────────── 8. key trùng — YAML thật ghi đè âm thầm, ở đây phải nổ ───────────
{
    const m = boom(`node: a\ngate: x\ngate: y`);
    chk(">>> key trùng bị từ chối (ghi đè âm thầm = một ý định biến mất không ai biết)",
        (m ?? "").includes("hai lần"), m);
}

// ─────────── 9. dòng rác / thụt lề sai ───────────
{
    chk("dòng không phải key: value cũng không phải '- ' thì nổ",
        (boom(`node: a\nnày là dòng rác`) ?? "").includes("không phải"), boom(`node: a\nnày là dòng rác`));
    chk("thụt lề vô cớ (không có key mẹ kết thúc bằng ':') thì nổ",
        (boom(`a: 1\n  b: 2`) ?? "").includes("thụt lề"), boom(`a: 1\n  b: 2`));
    chk("phần tử list rỗng thì nổ", (boom(`a:\n  -\nb: 1`) ?? "").includes("rỗng"), boom(`a:\n  -\nb: 1`));
}

// ─────────── 10. file rỗng / chỉ có chú thích ───────────
{
    chk("file rỗng trả null (không nổ)", parse("") === null, String(parse("")));
    chk("file chỉ có chú thích trả null", parse("# gì đó\n\n") === null, String(parse("# gì đó")));
}

// ─────────── 11. khối chuỗi dài — file luồng CẦN cái này (message dừng dài 3 câu) ───────────
{
    const r = parse([
        `message: >-`,
        `  Verdict FIX — spec đã lỗi thời.`,
        `  Chạy lại kèm --confirm-mcp.`,
        `next: qa-automation`,
    ].join("\n"));
    chk(">>> '>-' gấp dòng thành dấu cách",
        r.message === "Verdict FIX — spec đã lỗi thời. Chạy lại kèm --confirm-mcp.", JSON.stringify(r.message));
    chk(">>> key SAU khối vẫn đọc được (con trỏ nhảy đúng qua thân khối)",
        r.next === "qa-automation", JSON.stringify(r));
}
{
    const r = parse(`text: |-\n  dòng một\n  dòng hai\nsau: 1`);
    chk("'|-' giữ nguyên ký tự xuống dòng", r.text === "dòng một\ndòng hai", JSON.stringify(r.text));
    chk("'|-' không nuốt key sau nó", r.sau === 1, JSON.stringify(r));
}
{
    const r = parse(`t: >-\n  đoạn một\n\n  đoạn hai`);
    chk("dòng trắng trong khối gấp dòng = một lần xuống dòng",
        r.t === "đoạn một\nđoạn hai", JSON.stringify(r.t));
}
{
    const r = parse(`t: >-\n  chạy: npx playwright test  # không phải chú thích\nsau: 2`);
    chk(">>> trong khối, '#' là ký tự thường và 'key:' KHÔNG bị hiểu là mapping",
        r.t === "chạy: npx playwright test  # không phải chú thích" && r.sau === 2, JSON.stringify(r));
}
{
    const r = parse(`t: >\n  một dòng`);
    chk("'>' (không có '-') giữ một ký tự xuống dòng ở cuối", r.t === "một dòng\n", JSON.stringify(r.t));
}
{
    chk("khối rỗng bị từ chối", (boom(`t: >-\nsau: 1`) ?? "").includes("rỗng"), boom(`t: >-\nsau: 1`));
    chk("'- >-' (khối trong phần tử list) bị từ chối rõ ràng",
        (boom(`a:\n  - >-\n    x`) ?? "").includes("chỉ dùng được ngay sau"), boom(`a:\n  - >-\n    x`));
}
{
    // Hình dạng thật trong flows/*.flow.yml: khối chuỗi dài NẰM TRONG một phần tử list.
    const r = parse([
        `branch:`,
        `  - value: FIX`,
        `    message: >-`,
        `      spec lỗi thời.`,
        `      chạy lại đi.`,
        `    action: rework`,
        `  - value: PASS`,
        `    action: continue`,
    ].join("\n"));
    chk(">>> khối chuỗi dài trong phần tử list: đọc đúng, và key SAU khối vẫn thuộc cùng phần tử",
        r.branch?.length === 2 && r.branch[0].message === "spec lỗi thời. chạy lại đi."
        && r.branch[0].action === "rework" && r.branch[1].value === "PASS",
        JSON.stringify(r.branch));
}

// ─────────── 12. chuỗi thiếu ngoặc đóng ───────────
{
    chk("chuỗi thiếu ngoặc đóng thì nổ, không âm thầm nuốt",
        (boom(`a: "chưa đóng`) ?? "").includes("thiếu dấu"), boom(`a: "chưa đóng`));
}

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nyaml-lite: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
