// Test R6.1: TƯ CÁCH NGƯỜI DÙNG trong tài liệu luồng.
//
// VÌ SAO BỘ NÀY TỒN TẠI. ShopGo lên bản v2.0: chưa đăng nhập thì **không xem được giỏ hàng** —
// bấm Thanh toán ra modal đăng nhập. Trước R6, bộ máy không có chỗ nào ghi được "luồng này chạy
// với tư cách nào", nên:
//
//   - `flow-walker` explore ở tư cách khách sẽ đâm tường ngay bước 2 của mọi luồng liên quan giỏ;
//   - và tệ hơn: luồng "khách bị chặn ở giỏ hàng" lỡ chạy trên phiên còn đăng nhập thì thấy giỏ
//     mở ra bình thường — **không assertion nào bắt được**, vì assertion chỉ nói về cái nhìn
//     thấy, không nói về tư cách đang dùng. Test XANH SAI, không phải test đỏ.
//
// Nên tư cách phải là thứ ĐƯỢC KHAI và ĐƯỢC KIỂM, không phải thứ đoán ra.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const F = await import(abs("agents/qa-leader/tools/ui-flow-parser.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const flow = (name, lines) => `## Flow: ${name}\n**Entry:** https://x.io/\n${lines.join("\n")}\n`;

// ─────────── 1. normIdentity — tên tư cách thành slug dùng làm tên file ───────────
{
    chk("tên thường giữ nguyên", F.normIdentity("customer") === "customer");
    chk("hoa/thường và khoảng trắng thừa được chuẩn hoá", F.normIdentity("  CUSTOMER ") === "customer");
    chk(">>> 'khách' / 'khach' / 'guest' đều là MỘT tư cách (chuẩn hoá về 'guest')",
        F.normIdentity("khách") === F.GUEST_IDENTITY &&
        F.normIdentity("khach") === F.GUEST_IDENTITY &&
        F.normIdentity("Guest") === F.GUEST_IDENTITY,
        [F.normIdentity("khách"), F.normIdentity("khach"), F.normIdentity("Guest")].join(","));
    chk("dấu tiếng Việt bị bóc để làm được tên file", F.normIdentity("Quản trị viên") === "quan-tri-vien",
        F.normIdentity("Quản trị viên"));
    chk("chữ đ → d", F.normIdentity("Đại lý") === "dai-ly", F.normIdentity("Đại lý"));
    chk("rỗng/thiếu → null, KHÔNG phải chuỗi rỗng (chuỗi rỗng sẽ thành tên file rỗng)",
        F.normIdentity("") === null && F.normIdentity(null) === null && F.normIdentity("  ") === null);
    chk("markdown ** bị bóc", F.normIdentity("**customer**") === "customer", F.normIdentity("**customer**"));
}

// ─────────── 2. Đọc được hai directive ───────────
{
    const r = F.parseUiFlows(
        flow("Đăng nhập", ["**Tư cách:** khách", "**Tạo tư cách:** customer", "1. đăng nhập"]) +
        flow("Mua hàng", ["**Tư cách:** customer", "1. mua"]));
    chk("đọc được '**Tư cách:**'", r.flows[1].identity === "customer", JSON.stringify(r.flows[1]));
    chk("đọc được '**Tạo tư cách:**'", r.flows[0].createsIdentity === "customer", JSON.stringify(r.flows[0]));
    chk(">>> luồng đăng nhập vừa TẠO 'customer' vừa CẦN 'khách' — hợp lệ, không phải lỗi",
        r.flows[0].identity === F.GUEST_IDENTITY && r.problems.length === 0, JSON.stringify(r.problems));
}
{
    // "Tạo tư cách" không được đọc nhầm thành "Tư cách" — nếu nhầm, luồng đăng nhập biến thành
    // luồng CẦN tư cách nó đang định tạo, và tới lúc chạy sẽ chờ một state không ai dựng.
    const r = F.parseUiFlows(flow("L", ["**Tạo tư cách:** customer", "1. x"]));
    chk(">>> '**Tạo tư cách:**' KHÔNG bị đọc thành '**Tư cách:**'",
        r.flows[0].createsIdentity === "customer" && r.flows[0].identity === null, JSON.stringify(r.flows[0]));
}
{
    const r = F.parseUiFlows(flow("L", ["Tư cách: customer", "1. x"]));   // không có **
    chk("dấu ** là tuỳ chọn (giống Entry)", r.flows[0].identity === "customer", JSON.stringify(r.flows[0]));
}

// ─────────── 3. Không khai gì cả → dự án không có đăng nhập, giữ nguyên hành vi cũ ───────────
{
    const r = F.parseUiFlows(flow("A", ["1. x"]) + flow("B", ["1. y"]));
    chk(">>> KHÔNG khai tư cách ở đâu → 0 problem (dự án không có đăng nhập vẫn chạy như cũ)",
        r.problems.length === 0, JSON.stringify(r.problems));
    chk("identitiesOf rỗng khi không khai gì",
        F.identitiesOf(r.flows).needed.length === 0 && F.identitiesOf(r.flows).created.length === 0);
}

// ─────────── 4. Khai một nửa → BÁO, không đoán ───────────
//
// Đây là ca quan trọng nhất của cả bộ. Mặc định "khách" thì luồng cần đăng nhập chạy sai;
// mặc định "đã đăng nhập" thì luồng kiểm việc-chặn-khách chạy sai. Cả hai đều là đoán, và cái
// giá của đoán sai ở đây là test xanh sai. Nên: khai hết, hoặc không khai gì.
{
    const r = F.parseUiFlows(
        flow("Có khai", ["**Tư cách:** khách", "1. x"]) +
        flow("Quên khai", ["1. y"]));
    chk(">>> tài liệu CÓ khai tư cách mà một luồng quên → problem (không im lặng chọn mặc định)",
        r.problems.some(p => /Quên khai/.test(p) && /Tư cách/.test(p)), JSON.stringify(r.problems));
    chk("thông báo chỉ đúng luồng thiếu, không réo luồng đã khai",
        !r.problems.some(p => /"Có khai"/.test(p)), JSON.stringify(r.problems));
}

// ─────────── 5. Cần một tư cách mà không ai tạo ra nó ───────────
{
    const r = F.parseUiFlows(flow("Mua hàng", ["**Tư cách:** customer", "1. mua"]));
    chk(">>> cần 'customer' mà KHÔNG luồng nào tạo → problem ngay lúc đọc tài liệu",
        r.problems.some(p => /customer/.test(p) && /KHÔNG luồng nào tạo/.test(p)), JSON.stringify(r.problems));
}
{
    // 'guest' là trạng thái CHƯA đăng nhập — luôn có sẵn, không cần luồng nào dựng.
    const r = F.parseUiFlows(flow("Xem hàng", ["**Tư cách:** khách", "1. xem"]));
    chk("tư cách 'khách' KHÔNG cần luồng nào tạo", r.problems.length === 0, JSON.stringify(r.problems));
}

// ─────────── 6. Hai lỗi khai báo vô nghĩa ───────────
{
    const r = F.parseUiFlows(flow("L", ["**Tạo tư cách:** khách", "1. x"]));
    chk("không thể 'tạo tư cách khách' — khách là trạng thái mặc định",
        r.problems.some(p => /không thể/i.test(p) && /khách/.test(p)), JSON.stringify(r.problems));
}
{
    const r = F.parseUiFlows(
        flow("Tạo admin", ["**Tư cách:** customer", "**Tạo tư cách:** admin", "1. x"]) +
        flow("Đăng nhập", ["**Tư cách:** khách", "**Tạo tư cách:** customer", "1. y"]));
    chk(">>> luồng đăng nhập phải bắt đầu từ khách, không từ một tư cách khác",
        r.problems.some(p => /Tạo admin/.test(p) && /bắt đầu từ khách/.test(p)), JSON.stringify(r.problems));
}

// ─────────── 7. identitiesOf ───────────
{
    const r = F.parseUiFlows(
        flow("Đăng nhập", ["**Tư cách:** khách", "**Tạo tư cách:** customer", "1. a"]) +
        flow("Đăng nhập nhanh", ["**Tư cách:** khách", "**Tạo tư cách:** customer", "1. b"]) +
        flow("Mua", ["**Tư cách:** customer", "1. c"]) +
        flow("Xem", ["**Tư cách:** khách", "1. d"]));
    const ids = F.identitiesOf(r.flows);
    chk("needed gồm cả guest lẫn customer, không trùng lặp",
        ids.needed.length === 2 && ids.needed.includes("guest") && ids.needed.includes("customer"),
        JSON.stringify(ids.needed));
    chk(">>> created KHÔNG chứa 'guest' (không có state nào để dựng cho khách)",
        ids.created.length === 1 && ids.created[0] === "customer", JSON.stringify(ids.created));
    chk("hai luồng cùng tạo một tư cách → lấy luồng ĐẦU, deterministic theo thứ tự tài liệu",
        ids.loginFlowFor.customer === "Đăng nhập", JSON.stringify(ids.loginFlowFor));
}

// ─────────── 8. Tài liệu THẬT của dự án ───────────
{
    const { readFileSync } = await import("node:fs");
    const r = F.parseUiFlows(readFileSync("project-docs/03_DEV/UI-flow.md", "utf8"));
    chk(">>> UI-flow.md thật: khai tư cách đầy đủ, 0 problem",
        r.problems.length === 0, JSON.stringify(r.problems));
    chk("mọi luồng thật đều có tư cách", r.flows.every(f => f.identity || f.createsIdentity),
        JSON.stringify(r.flows.filter(f => !f.identity && !f.createsIdentity).map(f => f.name)));
    const ids = F.identitiesOf(r.flows);
    chk("có đúng một tư cách phải dựng bằng luồng đăng nhập",
        ids.created.length === 1, JSON.stringify(ids.created));
    // Bước "đăng nhập" KHÔNG được còn là bước nghiệp vụ trong luồng đã có tư cách customer:
    // để lại thì mỗi test case phải chép cùng một đoạn, và trạng thái nạp sẵn thành vô nghĩa.
    const leftover = r.flows.filter(f => f.identity === "customer")
        .flatMap(f => f.steps.filter(s => /đăng nhập/i.test(s.text)).map(s => `${f.name}: ${s.text}`));
    chk(">>> luồng tư cách 'customer' KHÔNG còn bước đăng nhập (state nạp sẵn, không lặp lại)",
        leftover.length === 0, JSON.stringify(leftover));
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + n + (e && !c ? "   → " + e : "")); }
console.log(`\nidentity: ${P.length - bad}/${P.length}`);
process.exit(bad === 0 ? 0 : 1);
