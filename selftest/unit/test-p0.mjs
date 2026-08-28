// Test P0.2 (ui-flow-parser) + P0.6 (money). KHÔNG gọi LLM.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const F = await import(abs("agents/qa-leader/tools/ui-flow-parser.js"));
const M = await import(abs("agents/runtime/money.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// ─────────── P0.6: so tiền theo SỐ, bỏ đơn vị ───────────
const same = [
    ["150.000 ₫", "150000đ"],
    ["150.000 ₫", "150.000 VNĐ"],
    ["10.000đ", "10.000 ₫"],          // đúng ca làm TC-D-012 fail
    ["799.999đ", "799999"],
    ["1.234.567 ₫", "1234567 VND"],
];
for (const [a, b] of same) {
    chk(`"${a}" == "${b}"`, M.sameMoney(a, b), `${M.parseMoney(a)} vs ${M.parseMoney(b)}`);
}
chk("số KHÁC nhau thì vẫn phải KHÁC", !M.sameMoney("150.000đ", "150.001đ"));
chk("non-breaking space (web hay dùng, vô hình trong diff) không làm lệch",
    M.sameMoney("150.000 ₫", "150000"), JSON.stringify(M.parseMoney("150.000 ₫")));
chk("không có số -> null, KHÔNG phải 0 ('không có' không được thành 0đ)",
    M.parseMoney("Không có") === null && M.parseMoney("") === null);
chk("không parse được thì KHÔNG coi là bằng nhau", !M.sameMoney("abc", "abc"));
chk("số thập phân KHÔNG bị hiểu thành nghìn", M.parseMoney("1.5") === 1.5 && M.parseMoney("0,75") === 0.75);
chk("phân cách nghìn nhận đúng", M.parseMoney("1.234") === 1234 && M.parseMoney("12,345,678") === 12345678);
chk("moneyIn: lấy hết số tiền trên 1 dòng UI thật",
    JSON.stringify(M.moneyIn("150.000 ₫ 199.000 ₫")) === JSON.stringify([150000, 199000]),
    JSON.stringify(M.moneyIn("150.000 ₫ 199.000 ₫")));
chk("containsMoney: tìm giá trị bất kể cách viết",
    M.containsMoney("Tạm tính: 150.000 ₫", "150000") && !M.containsMoney("Tạm tính: 150.000 ₫", "160000"));

// ─────────── P0.2: parser luồng ───────────
const doc = `
# UI Flow

> Ví dụ trong code block KHÔNG được tính là flow thật:
\`\`\`markdown
## Flow: ví dụ mẫu
**Entry:** https://example.com/
1. bước mẫu
\`\`\`

## Flow: Áp mã giảm giá
**Entry:** https://cwshopgo.github.io/

1. Trang chủ — bấm "Thêm vào giỏ" trên thẻ sản phẩm
2. Bấm "Thanh toán" trên thanh tabbar
3. Nhập mã vào ô "Mã giảm giá" rồi bấm "Áp dụng"
4. Kiểm tra tổng tiền đã giảm

## CHƯA RÕ

1. Câu hỏi này KHÔNG phải bước của flow
2. Câu hỏi khác
`;
const { flows, problems } = F.parseUiFlows(doc);
chk(">>> chỉ 1 flow: ví dụ trong code block bị bỏ qua", flows.length === 1, JSON.stringify(flows.map(f => f.name)));
chk(">>> heading khác đóng flow: 2 câu hỏi ở 'CHƯA RÕ' KHÔNG bị tính thành bước",
    flows[0].steps.length === 4, JSON.stringify(flows[0].steps.map(s => s.n + ':' + s.text)));
chk("entry đọc đúng", flows[0].entry === "https://cwshopgo.github.io/");
chk(">>> tên trong ngoặc kép chỉ là GỢI Ý cho AI, không phải selector", JSON.stringify(F.hintsOf(flows[0])) === JSON.stringify(["Thêm vào giỏ","Thanh toán","Mã giảm giá","Áp dụng"]), JSON.stringify(F.hintsOf(flows[0])));
chk("bước 'Kiểm tra …' là check, không phải action (đừng đi click nó)",
    flows[0].steps[3].kind === "check" && F.actionSteps(flows[0]).length === 3,
    JSON.stringify(flows[0].steps.map(s => s.kind)));
chk("doc sạch -> không problem", problems.length === 0, JSON.stringify(problems));

// action step không nêu tên phần tử -> PHẢI báo, không đoán
const bad = F.parseUiFlows('## Flow: X\n**Entry:** https://a.b/\n\n1. nhập mã vào ô mã giảm giá rồi áp dụng\n');
chk(">>> bước viết bằng LỜI NGHIỆP VỤ (không ngoặc kép) là BÌNH THƯỜNG, không phải lỗi", bad.problems.length === 0, JSON.stringify(bad.problems));

// thiếu Entry / số bước nhảy
const b2 = F.parseUiFlows('## Flow: Y\n\n1. bấm "A"\n3. bấm "B"\n');
chk("thiếu Entry + số bước nhảy -> báo cả 2", b2.problems.length >= 2, JSON.stringify(b2.problems));
chk("không có flow nào -> báo rõ", F.parseUiFlows("# chả có gì").problems.some(p => p.includes("Không tìm thấy flow")));

// ─────────── tài liệu THẬT của dự án ───────────
const { readFileSync } = await import("node:fs");
const real = F.parseUiFlows(readFileSync("project-docs/03_DEV/UI-flow.md", "utf8"));
chk("UI-flow.md thật: đọc được 2 flow trở lên", real.flows.length >= 2, JSON.stringify(real.flows.map(f => f.name)));

// Bản trước khoá cứng: "luồng 1 có ĐÚNG 5 bước", "luồng 2 là gỡ mã, ĐÚNG 6 bước".
// Hai câu đó không kiểm tra parser — chúng kiểm tra rằng TÀI LIỆU NGHIỆP VỤ không được đổi.
// Web lên Store v2.0 (bắt buộc đăng nhập mới xem được giỏ) → tài liệu buộc phải viết lại, và
// 2 test này đỏ trong khi parser không có gì sai. Sai lầm là neo test vào VỊ TRÍ của flow
// trong một file mà người ta được phép sửa.
//
// Giờ kiểm TÍNH CHẤT — đúng những thứ nếu hỏng thì automation hỏng theo, bất kể web bản nào:
for (const f of real.flows) {
    chk(`UI-flow.md thật: flow "${f.name}" có entry hợp lệ`,
        /^https?:\/\//.test(f.entry ?? ""), String(f.entry));
    chk(`UI-flow.md thật: flow "${f.name}" có ít nhất 2 bước`,
        f.steps.length >= 2, f.steps.length + " bước");
    chk(`UI-flow.md thật: flow "${f.name}" có ít nhất 1 bước KIỂM TRA (không có thì chẳng quan sát được gì)`,
        f.steps.some(s => s.kind === "check"), JSON.stringify(f.steps.map(s => s.kind)));
}
// Ít nhất một bước trong tài liệu thật phải là bước GHÉP 2 ĐỘNG TÁC ("… rồi …").
// Đây là thứ đã làm cả bộ test "áp mã" chạy mà chưa từng bấm nút áp mã, nên nó phải còn
// được tập dượt trên tài liệu thật, không chỉ trên chuỗi dựng sẵn ở đầu file.
chk(">>> UI-flow.md thật: còn ít nhất 1 bước ghép 2 động tác, và parser tách được",
    real.flows.some(f => f.steps.some(s => (s.parts?.length ?? 1) > 1)),
    JSON.stringify(real.flows.flatMap(f => f.steps.filter(s => (s.parts?.length ?? 1) > 1).map(s => s.parts))));
console.log("   [thật] gợi ý tên (có thể rỗng): " + JSON.stringify(F.hintsOf(real.flows[0])));
console.log("   [thật] problems: " + (real.problems.length ? JSON.stringify(real.problems) : "(không có)"));

// ─────────── Mục "Quy ước…" trong tài liệu luồng (thêm 2026-08-23) ───────────
//
// Tài liệu luồng còn chứa những điều KHÔNG phải một bước, nhưng đổi hẳn cách viết automation
// ("web không có DB, vào lại trang là sạch" → KHÔNG được điều hướng lại giữa luồng). Trước khi
// có phần này, `distillUiFlows()` chỉ mang các khối `## Flow:` vào tầng 3, nên quy ước nằm
// trong tài liệu mà không tới được prompt của agent nào — đúng loại lỗi P9.
{
    const doc = [
        `## Flow: A`, `**Entry:** https://x.io/`, `1. làm gì đó`, ``,
        `## Quy ước nghiệp vụ đã xác nhận`, `Mở đầu.`, ``,
        `### Reset`, `Vào lại trang là sạch.`, ``,
        `| a | b |`, `|---|---|`, `| 1 | 2 |`, ``,
        `#### Sâu hơn`, `vẫn thuộc mục quy ước`, ``,
        `## CHƯA RÕ`, `không thuộc quy ước`,
    ].join("\n");
    const r = F.parseUiFlows(doc);
    chk("có mục Quy ước thì vẫn parse đúng flow", r.flows.length === 1 && r.problems.length === 0, JSON.stringify(r.problems));
    chk(">>> heading CON (###, ####) là NỘI DUNG của mục quy ước, không đóng mục",
        /### Reset/.test(r.conventions) && /#### Sâu hơn/.test(r.conventions) && /vẫn thuộc mục quy ước/.test(r.conventions),
        JSON.stringify(r.conventions));
    chk(">>> heading CÙNG CẤP (##) đóng mục — phần sau không bị hút vào",
        !/CHƯA RÕ|không thuộc quy ước/.test(r.conventions), JSON.stringify(r.conventions));
    chk("bảng markdown trong mục được giữ nguyên văn", /\| 1 \| 2 \|/.test(r.conventions));
}
{
    const r = F.parseUiFlows([`## Flow: A`, `**Entry:** https://x.io/`, `1. làm gì đó`].join("\n"));
    chk("không có mục Quy ước thì conventions = null, KHÔNG phải chuỗi rỗng", r.conventions === null, String(r.conventions));
}
{
    const doc = [`## Quy ước A`, `x`, `## Quy ước B`, `y`, `## Flow: A`, `**Entry:** https://x.io/`, `1. b`].join("\n");
    const r = F.parseUiFlows(doc);
    chk("hai mục Quy ước → báo vấn đề, chỉ dùng mục đầu",
        r.problems.some(p => /nhiều hơn một mục/.test(p)) && /^x$/m.test(r.conventions) && !/^y$/m.test(r.conventions),
        JSON.stringify({ p: r.problems, c: r.conventions }));
}
{
    const doc = [`## Flow: A`, `**Entry:** https://x.io/`, `1. b`, `## Quy ước`, `cuối file, không heading nào đóng`].join("\n");
    chk("mục Quy ước nằm CUỐI file vẫn được chốt lại",
        /cuối file/.test(F.parseUiFlows(doc).conventions ?? ""), JSON.stringify(F.parseUiFlows(doc).conventions));
}
{
    // Tài liệu THẬT của dự án phải mang được 3 quy ước người dùng đã trả lời.
    const { readFileSync } = await import("node:fs");
    const real = F.parseUiFlows(readFileSync("project-docs/03_DEV/UI-flow.md", "utf8"));
    chk(">>> UI-flow.md thật: có flow hợp lệ, 0 vấn đề", real.flows.length >= 2 && real.problems.length === 0,
        JSON.stringify({ n: real.flows.length, p: real.problems }));
    chk(">>> quy ước thật mang được luật 'không điều hướng giữa luồng' (nguyên nhân gốc của 5 ca timeout 17/08)",
        /không điều hướng lại|TUYỆT ĐỐI không điều hướng/.test(real.conventions ?? ""), String(real.conventions).slice(0, 80));
    // Hai câu dưới trước đây soi chuỗi của WEB BẢN CŨ: "web không có database" và trạng thái
    // "Đang kích hoạt giảm giá". Store v2.0 làm cả hai thành sai:
    //   - v2.0 CÓ lưu trữ: phiên đăng nhập và lịch sử đơn nằm trong localStorage, nên
    //     "vào lại trang là sạch" chỉ còn đúng với giỏ hàng. Test case cần trạng thái
    //     "chưa đăng nhập" mà chỉ reload thì sẽ chạy nhầm trên phiên vẫn đang đăng nhập.
    //   - chuỗi "Đang kích hoạt giảm giá" không còn tồn tại trên UI.
    // Điều PHẢI giữ là: mục Quy ước vẫn chở được những luật đổi cách viết automation tới prompt
    // (đúng lỗi P9: luật nằm trong tài liệu mà không tới được agent nào). Nên kiểm Ý, không kiểm
    // nguyên văn của một phiên bản web.
    const conv = real.conventions ?? "";
    chk(">>> quy ước thật nói rõ thứ gì CÒN LẠI sau khi tải lại trang (v2.0: đăng nhập không mất)",
        /đăng nhập/i.test(conv) && /(KHÔNG sạch|không mất|vẫn còn đăng nhập)/i.test(conv), conv.slice(0, 120));
    chk("quy ước thật mang được cách nhìn ra mã đang áp hay không",
        /áp dụng thành công/i.test(conv) && /gỡ mã/i.test(conv));
}

let bad2 = 0;
for (const [n, c, e] of P) { if (!c) bad2++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad2 === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad2}/${P.length} SAI`);
// Thoat khac 0 khi co test hong - thieu dong nay thi bo test fail van thoat 0 va moi trinh
// chay tu dong se bao PASS cho no (dung loi da gap o test-classify.mjs).
process.exit(bad2 === 0 ? 0 : 1);
