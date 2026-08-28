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
    // Expected Result phải KIỂM CHỨNG ĐƯỢC. Bản trước của bộ test này dùng
    // "Áp mã thành công, tổng tiền giảm đúng" — câu không có số tiền nào và không có chuỗi UI
    // nào trong ngoặc kép. Bản cũ của emitSpec biến nguyên câu đó thành
    // `getByText("Áp mã thành công, tổng tiền giảm đúng")` — assertion LUÔN ĐỎ, vì không trang
    // nào in ra đúng câu đó. Và bộ test này đã KHOÁ đúng hành vi sai ấy lại.
    // Từ R2.3c/d: câu như vậy làm spec THROW (ca test riêng ở test-assertion-filter.mjs).
    // Fixture đổi sang một Expected Result kiểm chứng được thật; Ý ĐỊNH ca test giữ nguyên.
    const tc = {
        tcId: "TC-D-001",
        expected: 'Áp mã thành công, hiển thị "Đang kích hoạt giảm giá", tổng tiền sau giảm là 700.000đ',
        data: { fields: { voucher_code: "SALE20" } },
    };
    const out = G.emitSpec({ scenario: sc, catalogue, testCase: tc });

    // Luật: spec KHÔNG được chứa locator của PHẦN TỬ — mọi hành động đi qua step library, và
    // locator sống ở Page Object do Playwright sinh.
    //
    // Có ĐÚNG MỘT ngoại lệ, và nó có trước R2: `page.locator('body').innerText()` của cơ chế
    // so tiền theo GIÁ TRỊ (memory/semantic/money-comparison.md). Đó không phải locator trỏ vào
    // một phần tử để thao tác — nó đọc text cả trang. Bản trước của ca test này cấm mọi chuỗi
    // `locator(` và vẫn xanh, chỉ vì fixture cũ không có số tiền nào nên không đi vào nhánh đó.
    // Tức là luật chưa từng được kiểm ở nhánh tiền. Giờ ghi ngoại lệ ra cho tường minh.
    {
        const code = codeOnly(out.content);
        const locators = [...code.matchAll(/\.(?:locator|getByRole|getByLabel|getByPlaceholder|getByTestId)\([^)]*\)/g)]
            .map(m => m[0])
            .filter(s => !s.startsWith(".locator('body')"));
        chk(">>> spec sinh ra KHÔNG có locator PHẦN TỬ nào (mọi hành động qua step library)",
            locators.length === 0, JSON.stringify(locators));
        chk("ngoại lệ DUY NHẤT được phép là locator('body') của cơ chế so tiền",
            code.includes(".locator('body').innerText()"),
            code.match(/.*locator\('body'\).*/)?.[0] ?? "(không có nhánh tiền)");
    }
    chk(">>> KHÔNG có 'TODO: locator chưa xác định' — đúng thứ làm 13/21 spec vô dụng",
        !out.content.includes("TODO"));
    chk("import đúng các hàm step đã dùng",
        out.content.includes("import { openEntry, step1_themSanPhamVaoGio, step2_moTrangThanhToan, step3_nhapMaGiamGia, step5_kiemTraDonHang }"),
        out.content.split("\n").find(l => l.startsWith("import { openEntry")));
    chk("bước cần value được truyền value từ .feature",
        out.content.includes("step3_nhapMaGiamGia(page, 'SALE20')"), out.content.match(/.*step3.*/)?.[0]);
    // Từ R2.2 mọi lời gọi bước đi qua `withShot(...)`. Ý ĐỊNH của ca test không đổi:
    // bước không cần giá trị thì KHÔNG được truyền giá trị nào.
    chk("bước không cần value -> gọi 1 tham số",
        out.content.includes("=> step1_themSanPhamVaoGio(page))"),
        out.content.split("\n").find(l => l.includes("step1_themSanPhamVaoGio")));
    chk(">>> assertion sinh từ Expected Result (chỗ duy nhất quyết pass/fail)",
        codeOnly(out.content).includes("toContain(700000)") &&
        codeOnly(out.content).includes('getByText("Đang kích hoạt giảm giá"'),
        out.assertionNote);
    chk(">>> KHÔNG assert nguyên câu Expected Result (nhánh cũ LUÔN ĐỎ)",
        !codeOnly(out.content).includes('getByText("Áp mã thành công'),
        out.assertionNote);
    // R2.2 ĐỔI HẲN chỗ này. Trước: đúng 2 ảnh — một ở trang chủ trước khi làm gì, một trong
    // `afterEach` sau khi test đã kết thúc. Với luồng 5 bước thì khoảnh khắc "áp mã thành
    // công hay không" — thứ DUY NHẤT cần nhìn — không có ảnh nào. Giờ: một ảnh mỗi bước,
    // cộng ảnh điểm vào và ảnh cuối, và mỗi bước bọc `test.step` để báo cáo JSON của
    // Playwright ghi lại được HỎNG Ở BƯỚC NÀO.
    {
        const shots = [...out.content.matchAll(/withShot\(page, tc\.tcId, (\d+), '([^']+)'/g)];
        chk(">>> MỖI BƯỚC một ảnh, không phải 2 ảnh cho cả test case",
            shots.length === 4, JSON.stringify(shots.map(m => m[1] + ":" + m[2])));
        chk("có ảnh điểm vào và ảnh cuối",
            out.content.includes("shot(page, tc.tcId, 0, 'entry')") &&
            out.content.includes("shot(page, tc.tcId, 99, 'final')"));
        chk(">>> KHÔNG còn 2 ảnh kiểu cũ, và không còn afterEach chụp sau khi test kết thúc",
            !out.content.includes("-before.jpg") && !out.content.includes("-after.jpg") &&
            !out.content.includes("test.afterEach"));
    }
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
