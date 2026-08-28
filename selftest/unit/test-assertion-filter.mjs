// R2.3c/d — CHỌN cái gì trong Expected Result đáng biến thành assertion.
// KHÔNG gọi LLM, không mở trình duyệt.
//
// Mọi chuỗi `expected` dưới đây là NGUYÊN VĂN từ bảng test case đã sinh ra thật
// (.qa-run/deliverables/deliverable-test-designer.md, lần chạy 2026-08-24). Không phải ví dụ
// tôi bịa cho dễ qua: đây đúng là dữ liệu đã tạo ra 3 assertion mã-số-bug, 2 assertion mã HTTP
// và 8 assertion luôn-xanh trong 20 spec thật.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const G = await import(abs("agents/qa-automation/tools/gherkin-codegen.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const codeOnly = (s) => s.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");

// ─────────── assertableAmounts: LOẠI cái không phải tiền ───────────
{
    const A = G.assertableAmounts;

    chk(">>> mã số bug KHÔNG thành assertion (đã sinh ra toContain(-1163) thật)",
        eq(A("Do server phân biệt chữ hoa/thường, hệ thống báo lỗi không tìm thấy mã. (Regression test cho BUG-1163)."), []),
        JSON.stringify(A("... (Regression test cho BUG-1163).")));

    chk(">>> mã HTTP KHÔNG thành assertion (đã sinh ra toContain(404), toContain(400) thật)",
        eq(A("Hệ thống trả về lỗi (HTTP 400/404) với mã lỗi `VOUCHER_NOT_FOUND`."), []),
        JSON.stringify(A("Hệ thống trả về lỗi (HTTP 400/404) với mã lỗi `VOUCHER_NOT_FOUND`.")));

    chk(">>> phần trăm KHÔNG thành assertion (đã sinh ra toContain(20) thật)",
        eq(A("khối tổng kết cập nhật số tiền giảm 20% và tổng tiền sau giảm"), []),
        JSON.stringify(A("khối tổng kết cập nhật số tiền giảm 20% và tổng tiền sau giảm")));

    chk(">>> mốc giờ KHÔNG thành assertion (đã sinh ra toContain(59) thật)",
        eq(A("Kiểm tra thời điểm biên hết hiệu lực lúc 23:59:59 ngày hết hạn"), []),
        JSON.stringify(A("Kiểm tra thời điểm biên hết hiệu lực lúc 23:59:59")));

    chk(">>> số đếm nhỏ KHÔNG thành assertion (đã sinh ra toContain(0), toContain(1) thật)",
        eq(A("Hệ thống cho phép cộng dồn 01 mã đơn hàng và 01 mã freeship."), []),
        JSON.stringify(A("Hệ thống cho phép cộng dồn 01 mã đơn hàng và 01 mã freeship.")));

    chk("tên field có gạch dưới không bị đọc thành số",
        eq(A("trả về lỗi `VOUCHER_MIN_ORDER_NOT_MET` và min_order_value chưa đạt"), []),
        JSON.stringify(A("trả về lỗi `VOUCHER_MIN_ORDER_NOT_MET` và min_order_value chưa đạt")));

    // ── Còn GIỮ đúng thứ là tiền ──
    chk("tiền có đơn vị: nhận", eq(A("Tổng tiền sau giảm là 700.000đ"), [700000]), JSON.stringify(A("Tổng tiền sau giảm là 700.000đ")));
    chk("tiền ký hiệu ₫: nhận", eq(A("giảm 100.000 ₫"), [100000]), JSON.stringify(A("giảm 100.000 ₫")));
    chk("tiền không đơn vị nhưng ≥1000: nhận",
        eq(A("giỏ hàng có tổng subtotal là 199.999 và ngưỡng 200.000"), [199999, 200000]),
        JSON.stringify(A("giỏ hàng có tổng subtotal là 199.999 và ngưỡng 200.000")));
    chk("khử trùng lặp", eq(A("từ 200.000đ xuống 200.000đ"), [200000]), JSON.stringify(A("từ 200.000đ xuống 200.000đ")));

    chk(">>> câu THẬT của TC-D-009: giữ ngưỡng tiền, bỏ mã lỗi",
        eq(A("Hệ thống từ chối áp dụng, trả về lỗi `VOUCHER_MIN_ORDER_NOT_MET` và hiển thị thông báo đơn hàng chưa đạt giá trị tối thiểu 200.000đ."), [200000]),
        JSON.stringify(A("... tối thiểu 200.000đ.")));
}

// ─────────── assertableTexts: ngoặc kép = UI, backtick = mã ───────────
{
    const T = G.assertableTexts;

    chk(">>> câu THẬT của TC-D-001: lấy đúng 2 chuỗi UI",
        eq(T('Hệ thống áp dụng mã thành công, hiển thị trạng thái "Đang kích hoạt giảm giá" kèm nút "Gỡ mã", khối tổng kết cập nhật số tiền giảm 20%.'),
            ["Đang kích hoạt giảm giá", "Gỡ mã"]),
        JSON.stringify(T('... "Đang kích hoạt giảm giá" kèm nút "Gỡ mã" ...')));

    chk(">>> câu THẬT của TC-D-006: lấy thông báo lỗi, BỎ mã lỗi API",
        eq(T('Hệ thống trả về lỗi (HTTP 400/404) với mã lỗi `VOUCHER_NOT_FOUND` và giao diện hiển thị thông báo lỗi chuẩn hóa màu đỏ là `"Mã không hợp lệ"`.'),
            ["Mã không hợp lệ"]),
        JSON.stringify(T('... `VOUCHER_NOT_FOUND` ... `"Mã không hợp lệ"`.')));

    chk("mã toàn chữ HOA trong ngoặc kép vẫn bị loại (là mã, không phải câu UI)",
        eq(T('mã "SALE20" và "VOUCHER_NOT_FOUND"'), []), JSON.stringify(T('mã "SALE20" và "VOUCHER_NOT_FOUND"')));

    chk("chuỗi chỉ có số trong ngoặc kép bị loại", eq(T('hiển thị "123"'), []), JSON.stringify(T('hiển thị "123"')));
    chk("không có ngoặc kép → rỗng", eq(T("Tổng tiền không đổi."), []));
}

// ─────────── emitSpec: hết false-green và hết false-red ───────────
const catalogue = {
    available: [{ name: "step1_moTrangThanhToan", text: "Mở trang thanh toán", kind: "action", needsValue: false }],
    missing: [],
};
const scenarioOf = (tcId) => G.parseFeature(
    `Feature: F\n\n  @${tcId}\n  Scenario: S\n    Given Mở trang thanh toán\n`).scenarios[0];

const specFor = (tcId, expected) =>
    G.emitSpec({ scenario: scenarioOf(tcId), catalogue, testCase: { tcId, expected } });

{
    // TC-D-001 thật: trước đây sinh ra ĐÚNG MỘT assertion `toContain(20)` từ "giảm 20%".
    const out = specFor("TC-D-001",
        'Hệ thống áp dụng mã thành công, hiển thị trạng thái "Đang kích hoạt giảm giá" kèm nút "Gỡ mã", khối tổng kết cập nhật số tiền giảm 20% và tổng tiền sau giảm.');
    const code = codeOnly(out.content);
    chk(">>> TC-D-001: KHÔNG còn toContain(20) (phần trăm bị đọc thành tiền)",
        !code.includes("toContain(20)"), out.assertionNote);
    chk(">>> TC-D-001: assert trạng thái ÁP MÃ THÀNH CÔNG — đúng thứ cần nhìn",
        code.includes('getByText("Đang kích hoạt giảm giá"') && code.includes('getByText("Gỡ mã"'),
        out.assertionNote);

    // TC-D-008 thật: trước đây sinh ra `toContain(-1163)` từ "BUG-1163".
    const bug = specFor("TC-D-008",
        'hệ thống báo lỗi không tìm thấy mã (hoặc `"Mã không hợp lệ"`). (Regression test cho BUG-1163).');
    chk(">>> TC-D-008: KHÔNG còn toContain(-1163) (mã số bug bị đọc thành tiền)",
        !codeOnly(bug.content).includes("toContain(-1163)"), bug.assertionNote);
    chk("TC-D-008: assert đúng thông báo lỗi trên UI",
        codeOnly(bug.content).includes('getByText("Mã không hợp lệ"'), bug.assertionNote);

    // Câu văn thuần, không số không ngoặc kép: trước đây sinh getByText(cả đoạn) → LUÔN ĐỎ.
    const vague = specFor("TC-D-013",
        "Hệ thống hiển thị và áp dụng chính xác số tiền giảm thực tế theo đúng công thức, đảm bảo khối tổng kết khớp đúng dữ liệu tính toán.");
    const vagueCode = codeOnly(vague.content);
    // Điều cần kiểm là KHÔNG ASSERT cả đoạn văn — không phải "không nhắc tới nó". Thông điệp
    // throw CÓ trích 120 ký tự đầu của Expected Result, và đó là chủ ý: người đọc log phải biết
    // câu nào cần sửa mà không phải mở lại bảng test case.
    const longGetByText = [...vagueCode.matchAll(/getByText\(\s*"([^"]*)"/g)].filter(m => m[1].length > 60);
    chk(">>> Expected Result mơ hồ: KHÔNG assert cả đoạn văn (nhánh cũ LUÔN ĐỎ)",
        longGetByText.length === 0, JSON.stringify(longGetByText.map(m => m[1].slice(0, 40))));
    chk("thông điệp throw CÓ trích Expected Result để người biết sửa câu nào",
        vague.content.includes("Hệ thống hiển thị và áp dụng chính xác"), vague.assertionNote);
    chk(">>> Expected Result mơ hồ: spec THROW và chỉ về BẢNG TEST CASE",
        vagueCode.includes("throw new Error") && vague.content.includes("BẢNG TEST CASE"),
        vague.assertionNote);
    chk("Expected Result mơ hồ: không sinh expect() giả nào",
        !vagueCode.includes("await expect("), vague.assertionNote);

    // Cả tiền lẫn chuỗi UI → assert CẢ HAI.
    const both = specFor("TC-D-012",
        'Số tiền giảm bị chặn đúng bằng trần 100.000đ và hiển thị "Đã đạt giảm tối đa".');
    const bothCode = codeOnly(both.content);
    chk("có cả tiền lẫn chuỗi UI → assert cả hai",
        bothCode.includes("toContain(100000)") && bothCode.includes('getByText("Đã đạt giảm tối đa"'),
        both.assertionNote);

    // Giữ nguyên hành vi cũ: thiếu hẳn Expected Result.
    const empty = specFor("TC-D-999", "");
    chk("thiếu Expected Result → vẫn throw như trước",
        empty.content.includes("throw new Error") && empty.content.includes("thiếu Expected Result"),
        empty.assertionNote);
}

// ─────────── cửa kiểm ĐỘC LẬP: spec-assertion-check bắt được assertion rỗng ruột ───────────
//
// Nguồn sinh ra chúng đã sửa ở trên, nhưng cửa kiểm phải bắt được chúng KHÔNG PHỤ THUỘC nơi
// sinh — đó là lý do spec-assertion-check.js tồn tại. Nếu một ngày ai đó viết tay một spec,
// hoặc nhánh authorSpecFor (LLM viết cả file) được dùng lại, cửa này vẫn phải chặn.
{
    const S = await import(abs("agents/qa-automation/tools/spec-assertion-check.js"));
    const wrap = (body) => `import { test, expect } from '@playwright/test';\ntest('TC-D-001: x', async ({ page }) => {\n${body}\n});\n`;

    const soDem = wrap(`  expect(soTienTrenTrang, 'x').toContain(0);`);
    chk(">>> cửa kiểm bắt toContain(0) là rỗng ruột (18/20 spec thật dính lỗi này)",
        S.hollowAssertions(soDem).length === 1 && S.hollowAssertions(soDem)[0].rule === "số-đếm",
        JSON.stringify(S.hollowAssertions(soDem).map(h => h.rule)));
    chk(">>> assertion rỗng ruột KHÔNG được đếm là assertion thật",
        S.countRealAssertions(soDem) === 0, String(S.countRealAssertions(soDem)));
    chk(">>> verifySpec TỪ CHỐI spec chỉ có assertion rỗng ruột",
        !S.verifySpec({ tcId: "TC-D-001", specContent: soDem }).ok,
        JSON.stringify(S.verifySpec({ tcId: "TC-D-001", specContent: soDem }).issues));

    const soAm = wrap(`  expect(soTienTrenTrang, 'x').toContain(-1163);`);
    chk("cửa kiểm bắt số âm (mã số bug đọc thành tiền)",
        S.hollowAssertions(soAm)[0]?.rule === "số-âm", JSON.stringify(S.hollowAssertions(soAm)));

    const caDoan = wrap(`  await expect(page.getByText("Thông tin số tiền giảm giá và tổng tiền thanh toán thực tế được ghi nhận chính xác vào cơ sở dữ liệu", { exact: false })).toBeVisible();`);
    chk("cửa kiểm bắt assert cả đoạn văn (LUÔN ĐỎ)",
        S.hollowAssertions(caDoan)[0]?.rule === "cả-đoạn-văn", JSON.stringify(S.hollowAssertions(caDoan)));

    // Không được báo oan: assertion thật phải đi qua.
    const that = wrap(
        `  expect(soTienTrenTrang, 'x').toContain(700000);\n` +
        `  await expect(page.getByText("Đang kích hoạt giảm giá", { exact: false })).toBeVisible();`);
    chk(">>> KHÔNG báo oan: tiền thật + chuỗi UI ngắn vẫn là assertion thật",
        S.hollowAssertions(that).length === 0 && S.countRealAssertions(that) === 2,
        JSON.stringify(S.hollowAssertions(that).map(h => h.rule)) + " count=" + S.countRealAssertions(that));
    chk("verifySpec cho qua spec có assertion thật",
        S.verifySpec({ tcId: "TC-D-001", specContent: that }).ok,
        JSON.stringify(S.verifySpec({ tcId: "TC-D-001", specContent: that }).issues));
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
process.exit(bad === 0 ? 0 : 1);
