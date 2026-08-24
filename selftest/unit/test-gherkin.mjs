// Test P4.2: .feature -> .spec.ts deterministic. KHÔNG gọi LLM.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const G = await import(abs("agents/qa-automation/tools/gherkin-codegen.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const codeOnly = (s) => s.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");

const catalogue = {
    available: [
        { name: "step1_themSanPhamVaoGio", text: "Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng", kind: "action", needsValue: false },
        { name: "step2_moTrangThanhToan", text: "Mở trang thanh toán / giỏ hàng", kind: "action", needsValue: false },
        { name: "step3_nhapMaGiamGia", text: "Nhập mã giảm giá vào ô nhập mã rồi áp dụng", kind: "action", needsValue: true },
        { name: "step5_kiemTraDonHang", text: "Kiểm tra đơn hàng vừa tạo trong mục đơn hàng", kind: "check", needsValue: false },
    ],
    missing: [{ text: "Bớt sản phẩm khỏi giỏ", why: "đi luồng chưa tới" }],
};

const feature = `Feature: Áp mã giảm giá khi checkout

  @TC-D-001 @Critical
  Scenario: Áp mã PERCENT hợp lệ
    Given Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
    And Mở trang thanh toán / giỏ hàng
    When Nhập mã giảm giá vào ô nhập mã rồi áp dụng "SALE20"
    Then Kiểm tra đơn hàng vừa tạo trong mục đơn hàng
`;

// ─────────── parse ───────────
{
    const r = G.parseFeature(feature);
    chk("đọc được Feature + 1 Scenario", r.feature.includes("Áp mã") && r.scenarios.length === 1);
    chk(">>> lấy TC_ID từ TAG (truy vết .feature ↔ test case ↔ spec)", r.scenarios[0].tcId === "TC-D-001", JSON.stringify(r.scenarios[0].tags));
    chk("4 step, tách được giá trị trong ngoặc kép thành arg",
        r.scenarios[0].steps.length === 4 && r.scenarios[0].steps[2].arg === "SALE20" &&
        !r.scenarios[0].steps[2].text.includes("SALE20"),
        JSON.stringify(r.scenarios[0].steps[2]));
    chk("file sạch -> không problem", r.problems.length === 0, JSON.stringify(r.problems));
}
{
    const noTag = G.parseFeature(`Feature: X\n  Scenario: Y\n    Given Z\n`);
    chk("thiếu tag @TC- -> BÁO mất truy vết", noTag.problems.some(p => p.includes("mất truy vết")), JSON.stringify(noTag.problems));
    chk("không có Scenario -> báo", G.parseFeature("Feature: X").problems.some(p => p.includes("Scenario")));
}

// ─────────── khớp step ───────────
{
    chk("khớp chính xác", G.matchStep("Mở trang thanh toán / giỏ hàng", catalogue.available).step?.name === "step2_moTrangThanhToan");
    chk("khác dấu/hoa-thường/dấu câu vẫn khớp",
        G.matchStep("mo trang thanh toan gio hang", catalogue.available).step?.name === "step2_moTrangThanhToan");
    chk(">>> không có step nào khớp -> null + lý do (KHÔNG chọn bừa)",
        G.matchStep("Bớt sản phẩm khỏi giỏ", catalogue.available).step === null &&
        G.matchStep("Bớt sản phẩm khỏi giỏ", catalogue.available).why.includes("không có step nào"));
    const dup = [{ name: "a", text: "nhập mã", kind: "action", needsValue: true }, { name: "b", text: "nhập mã", kind: "action", needsValue: true }];
    chk(">>> 2 step khớp như nhau -> BÁO nhập nhằng, không tung xúc xắc",
        G.matchStep("nhập mã", dup).step === null && G.matchStep("nhập mã", dup).why.includes("không thể chọn hộ"),
        G.matchStep("nhập mã", dup).why);
}

// ─────────── sinh spec ───────────
{
    const sc = G.parseFeature(feature).scenarios[0];
    const tc = { tcId: "TC-D-001", expected: "Áp mã thành công, tổng tiền giảm đúng", data: { fields: { voucher_code: "SALE20" } } };
    const out = G.emitSpec({ scenario: sc, catalogue, testCase: tc });

    chk(">>> spec sinh ra KHÔNG có locator nào (mọi hành động qua step library)",
        !codeOnly(out.content).includes("getByRole") && !codeOnly(out.content).includes("locator("),
        codeOnly(out.content).match(/.*getByRole.*/)?.[0] ?? "ok");
    chk(">>> KHÔNG có 'TODO: locator chưa xác định' — đúng thứ làm 13/21 spec vô dụng",
        !out.content.includes("TODO"));
    chk("import đúng các hàm step đã dùng",
        out.content.includes("import { openEntry, step1_themSanPhamVaoGio, step2_moTrangThanhToan, step3_nhapMaGiamGia, step5_kiemTraDonHang }"),
        out.content.split("\n").find(l => l.startsWith("import { openEntry")));
    chk("bước cần value được truyền value từ .feature",
        out.content.includes("step3_nhapMaGiamGia(page, 'SALE20')"), out.content.match(/.*step3.*/)?.[0]);
    chk("bước không cần value -> gọi 1 tham số", out.content.includes("step1_themSanPhamVaoGio(page);"));
    chk(">>> có ĐÚNG 1 assertion, sinh từ Expected Result (chỗ duy nhất quyết pass/fail)",
        (codeOnly(out.content).match(/await expect\(/g) ?? []).length === 1 &&
        out.content.includes("Áp mã thành công, tổng tiền giảm đúng"),
        String((codeOnly(out.content).match(/await expect\(/g) ?? []).length));
    chk("có 2 ảnh before/after, đúng .qa-run/evidence/",
        (out.content.match(/\.qa-run\/evidence\//g) ?? []).length === 2);
    chk("mỗi lời gọi có comment là step Gherkin gốc (đọc spec biết ngay nó làm gì)",
        out.content.includes("// Given Ở trang chủ") && out.content.includes("// When Nhập mã giảm giá"));
    chk("data lấy từ file JSON, KHÔNG nhúng literal test data khác", out.content.includes("dataset.cases.find"));
}

// ─────────── step không khớp -> KHÔNG sinh spec nào ───────────
{
    const bad = G.parseFeature(`Feature: X\n  @TC-D-016\n  Scenario: Y\n    Given Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng\n    When Bớt sản phẩm khỏi giỏ\n`).scenarios[0];
    const out = G.emitSpec({ scenario: bad, catalogue, testCase: { tcId: "TC-D-016", expected: "Hệ thống tự gỡ mã" } });
    chk(">>> có step không khớp -> content=null, KHÔNG sinh spec bỏ lửng giữa luồng",
        out.content === null && out.unmatched.length === 1, JSON.stringify(out.unmatched));
    chk("nêu rõ step nào không khớp và vì sao", out.unmatched[0].step.includes("Bớt sản phẩm") && out.unmatched[0].why.length > 0);
}

// ─────────── thiếu Expected Result -> spec THROW, không đi qua bằng 2 ảnh ───────────
{
    const sc = G.parseFeature(feature).scenarios[0];
    const out = G.emitSpec({ scenario: sc, catalogue, testCase: { tcId: "TC-D-001", expected: "" } });
    chk(">>> test case thiếu Expected Result -> spec chủ động throw (không pass bằng 2 screenshot)",
        out.content.includes("throw new Error") && out.content.includes("thiếu Expected Result") &&
        !codeOnly(out.content).includes("await expect("),
        out.assertionNote);
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
