// R2.2 + R2.4 — ảnh theo TỪNG BƯỚC, và verifier đọc được "hỏng ở bước nào".
//
// CÂU HỎI ĐANG TRẢ LỜI (nguyên văn của người dùng, 2026-08-27):
//   "áp mã không thành công nhưng khách vẫn ấn thanh toán → thanh toán thành công.
//    vậy chỗ áp mã chưa thành công thì xem ở đâu? đánh giá bằng cái gì?"
//   xem ở đâu   → .qa-run/evidence/<TC>/02-ap-ma.jpg
//   đánh giá bằng → expect() của checkpoint tại đúng bước đó, đọc từ result.steps[].error
//
// FIXTURE `REPORT` dưới đây KHÔNG phải tôi bịa: nó là báo cáo JSON THẬT do Playwright 1.62.1
// sinh ra (chạy 2026-08-27 trên một spec do chính `emitSpec()` sinh, dùng `setContent` nên
// không chạm mạng), đã cắt bớt các trường không liên quan. Ba điều đo được từ nó — và không
// đoán được nếu không chạy — được khoá lại ở mục 1.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const PT = await import(abs("agents/qa-verifier/tools/parse-test-results.js"));
const VC = await import(abs("agents/qa-verifier/tools/verdict-combiner.js"));
const G = await import(abs("agents/qa-automation/tools/gherkin-codegen.js"));
const P = await import(abs("agents/runtime/paths.js"));

const T = [];
const chk = (n, c, e = "") => T.push([n, c, e]);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Báo cáo THẬT (đã cắt gọn). Bước "03-thanh-toan" VẮNG MẶT — luồng dừng ở bước 2.
const REPORT = {
    suites: [{
        specs: [{
            title: "TC-SHAPE-001: ap ma roi thanh toan",
            tests: [{
                results: [{
                    status: "failed",
                    error: { message: "[2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible failed" },
                    steps: [
                        { title: "01-them-vao-gio", duration: 42 },
                        { title: "02-ap-ma", duration: 334, error: { message: "[2mexpect([22m…toBeVisible failed" } },
                    ],
                }],
            }],
        }],
    }],
};

// ─────────── 1. Hình dạng THẬT của report — ba điều quyết định thiết kế ───────────
{
    const [r] = PT.parseTestResults(REPORT);

    chk(">>> biết HỎNG Ở BƯỚC NÀO (bản trước vứt `result.steps[]` đi)",
        r.failedStepLabel === "02-ap-ma" && r.failedStepIndex === 1,
        JSON.stringify({ label: r.failedStepLabel, i: r.failedStepIndex }));

    chk(">>> bước SAU chỗ hỏng VẮNG MẶT — không phải có mặt với error rỗng",
        r.stepsStarted === 2 && !r.steps.some(s => s.label === "03-thanh-toan"),
        JSON.stringify(r.steps.map(s => s.label)));

    chk(">>> mã màu ANSI bị bóc (nếu không, báo cáo markdown nhận nguyên ký tự rác)",
        !r.errorMessage.includes("") && r.errorMessage.includes("toBeVisible"),
        JSON.stringify(r.errorMessage));

    chk("mỗi bước biết mình có hỏng không", eq(r.steps.map(s => s.failed), [false, true]));

    // Mã TC phải theo mẫu CHUNG, không khoá cứng "TC-D-" + 3 chữ số.
    chk(">>> mã TC của dự án khác vẫn nhận ra được (trước chỉ khớp /TC-D-\\d{3}/)",
        PT.parseTestResults({ suites: [{ specs: [{ title: "TC-PROMO-0007: x", tests: [{ results: [{ status: "passed", steps: [] }] }] }] }] })[0].tcId === "TC-PROMO-0007");

    // Test qua thì không có bước nào hỏng.
    const ok = PT.parseTestResults({ suites: [{ specs: [{ title: "TC-D-002: y", tests: [{ results: [{ status: "passed", steps: [{ title: "01-a", duration: 5 }] }] }] }] }] })[0];
    chk("test qua → failedStepIndex = -1, không bịa ra bước hỏng",
        ok.failedStepIndex === -1 && ok.failedStepLabel === null, JSON.stringify(ok));
}

// ─────────── 2. Khoá NỐI: tên ảnh và tiêu đề test.step phải TRÙNG ───────────
{
    // Đây là chỗ dễ đứt nhất trong cả R2: nếu hai bên đặt tên khác nhau thì verifier có nhãn
    // bước hỏng nhưng không tìm ra ảnh, và sẽ im lặng kết luận bằng ảnh cuối như cũ.
    chk(">>> `stepShotLabel()` và tiêu đề `test.step` sinh ra cùng một chuỗi",
        P.stepShotLabel(2, "ap-ma") === "02-ap-ma", P.stepShotLabel(2, "ap-ma"));
    chk("đường dẫn ảnh ghép từ đúng nhãn đó",
        P.stepShot("TC-D-001", 2, "ap-ma") === ".qa-run/evidence/TC-D-001/02-ap-ma.jpg",
        P.stepShot("TC-D-001", 2, "ap-ma"));
    chk("slug lấy từ TÊN HÀM step, không lấy từ câu Gherkin (câu do LLM viết, đổi chữ là đổi tên file)",
        G.slugForShot("step3_nhapMaGiamGiaVaoO", 3) === "nhap-ma-giam-gia-vao-o",
        G.slugForShot("step3_nhapMaGiamGiaVaoO", 3));
}

// ─────────── 3. Spec sinh ra: mỗi bước một ảnh, mỗi bước một test.step ───────────
{
    const catalogue = {
        available: [
            { name: "step1_themVaoGio", text: "them vao gio", kind: "action", needsValue: false },
            { name: "step2_apMa", text: "ap ma giam gia", kind: "action", needsValue: true },
            { name: "step3_thanhToan", text: "thanh toan", kind: "action", needsValue: false },
        ],
        missing: [],
    };
    const sc = G.parseFeature(
        `Feature: F\n\n  @TC-D-001\n  Scenario: S\n    Given them vao gio\n    When ap ma giam gia "SALE20"\n    And thanh toan\n`).scenarios[0];
    const out = G.emitSpec({ scenario: sc, catalogue, testCase: { tcId: "TC-D-001", expected: 'hiển thị "Đơn hàng"' } });
    const c = out.content;

    const shots = [...c.matchAll(/withShot\(page, tc\.tcId, (\d+), '([^']+)'/g)].map(m => `${m[1]}:${m[2]}`);
    chk(">>> MỖI BƯỚC một ảnh (trước đây cả test case chỉ có 2 ảnh)",
        eq(shots, ["1:them-vao-gio", "2:ap-ma", "3:thanh-toan"]), JSON.stringify(shots));
    chk("có ảnh điểm vào và ảnh cuối",
        c.includes("shot(page, tc.tcId, 0, 'entry')") && c.includes("shot(page, tc.tcId, 99, 'final')"));
    chk(">>> KHÔNG còn hai ảnh kiểu cũ (-before.jpg / -after.jpg)",
        !c.includes("-before.jpg") && !c.includes("-after.jpg"));
    chk("KHÔNG còn afterEach chụp ảnh sau khi test đã kết thúc", !c.includes("test.afterEach"));
    chk("ảnh cuối chụp TRƯỚC assertion (test đỏ vẫn có ảnh)",
        c.indexOf("99, 'final'") < c.indexOf("expect("), "final nằm sau assertion");
}

// ─────────── 4. combine(): hỏng GIỮA luồng ≠ hỏng ở assertion cuối ───────────
{
    const visualSai = { matches_expected: false, mismatch_details: "không thấy badge áp mã", confidence: "high" };

    const giua = VC.combine(
        { status: "failed", failedStepLabel: "02-ap-ma", failedStepIndex: 1, stepsStarted: 2 }, visualSai);
    chk(">>> hỏng ở bước GIỮA → CHECKPOINT_FAILED, chỉ đúng MỘT bước và MỘT ảnh",
        giua.label === VC.LABELS.CHECKPOINT_FAILED && giua.failedStepLabel === "02-ap-ma" &&
        giua.reason.includes("02-ap-ma"), JSON.stringify(giua));
    chk("nói rõ các bước sau chưa từng chạy (đừng kết luận gì về chúng)",
        giua.reason.includes("chưa từng chạy"), giua.reason);

    const cuoi = VC.combine({ status: "failed", failedStepLabel: null, failedStepIndex: -1 }, visualSai);
    chk("hỏng ở assertion cuối → vẫn là BEHAVIOR_MISMATCH như trước",
        cuoi.label === VC.LABELS.BEHAVIOR_MISMATCH, JSON.stringify(cuoi));

    // Ảnh nói sản phẩm ĐÚNG mà test đỏ → lỗi spec, không phải lỗi sản phẩm. Ưu tiên hơn checkpoint.
    const specLoi = VC.combine(
        { status: "failed", failedStepLabel: "02-ap-ma" }, { matches_expected: true, confidence: "high" });
    chk("ảnh cho thấy sản phẩm ĐÚNG → SPEC_ISSUE thắng, không đổ cho sản phẩm",
        specLoi.label === VC.LABELS.SPEC_ISSUE, JSON.stringify(specLoi));
}

// ─────────── 5. Nhãn mới không được âm thầm thành PASS ───────────
{
    chk(">>> CHECKPOINT_FAILED → verdict ASK (không rơi xuống PASS)",
        VC.deriveVerdict([VC.LABELS.PASSED, VC.LABELS.CHECKPOINT_FAILED]) === "ASK",
        VC.deriveVerdict([VC.LABELS.PASSED, VC.LABELS.CHECKPOINT_FAILED]));

    let threw = false;
    try { VC.deriveVerdict(["MOT_NHAN_AI_DO_THEM_VAO"]); } catch { threw = true; }
    chk(">>> nhãn LẠ thì NỔ, không rơi về PASS — mặc định an toàn của hệ QA là DỪNG HỎI NGƯỜI",
        threw, "deriveVerdict nuốt nhãn lạ và trả PASS");

    chk("test qua hết → PASS như cũ", VC.deriveVerdict([VC.LABELS.PASSED]) === "PASS");
}

// ─────────── 6. Cột Kết quả OK/NG (R1.1) ───────────
{
    chk("PASSED → OK", VC.resultOf(VC.LABELS.PASSED) === "OK");
    chk(">>> CHECKPOINT_FAILED → NG (sản phẩm sai, có ảnh đúng bước làm bằng)",
        VC.resultOf(VC.LABELS.CHECKPOINT_FAILED) === "NG");
    chk(">>> SPEC_ISSUE → RETEST, KHÔNG phải NG (test hỏng, không phải sản phẩm hỏng)",
        VC.resultOf(VC.LABELS.SPEC_ISSUE) === "RETEST", VC.resultOf(VC.LABELS.SPEC_ISSUE));
    chk("UNCLEAR → CẦN XÁC NHẬN, không phải OK", VC.resultOf(VC.LABELS.UNCLEAR) === "CẦN XÁC NHẬN");
    chk("không nằm trong lượt chạy → N/A, không để trống", VC.resultOf(null) === "N/A");

    let threw = false;
    try { VC.resultOf("NHAN_LA"); } catch { threw = true; }
    chk("nhãn lạ → nổ, không trả ô trống", threw);
}

// ─────────── 7. Chia batch ảnh + gộp kết quả ───────────
{
    const images = [
        { n: 0, label: "00-entry", path: "e/00-entry.jpg" },
        { n: 1, label: "01-them-vao-gio", path: "e/01-them-vao-gio.jpg" },
        { n: 2, label: "02-ap-ma", path: "e/02-ap-ma.jpg" },
        { n: 3, label: "03-thanh-toan", path: "e/03-thanh-toan.jpg" },
        { n: 99, label: "99-final", path: "e/99-final.jpg" },
    ];

    const plan = VC.planVisionBatches({ images, failedStepLabel: "02-ap-ma", max: 3 });
    chk(">>> batch ĐẦU TIÊN là cặp (trước, tại) của bước HỎNG — nơi câu trả lời nằm",
        eq(plan.batches[0].labels, ["01-them-vao-gio", "02-ap-ma"]),
        JSON.stringify(plan.batches[0]));
    chk(">>> mỗi batch là một CẶP, không phải một ảnh đơn (cần so sánh trước/sau)",
        plan.batches.every(b => b.images.length === 2), JSON.stringify(plan.batches.map(b => b.labels)));
    chk("tôn trọng trần số batch", plan.batches.length <= 3, String(plan.batches.length));
    chk("ảnh bị cắt bớt được NÊU TÊN (im lặng cắt sẽ đọc thành 'đã soi hết')",
        Array.isArray(plan.dropped), JSON.stringify(plan.dropped));
    chk("không có ảnh → không có batch, không nổ", VC.planVisionBatches({ images: [] }).batches.length === 0);

    // ── Gộp: HẠ CẤP, không phải đa số thắng ──
    const merged = VC.mergeVisualBatches([
        { matches_expected: true, confidence: "high" },
        { matches_expected: false, mismatch_details: "không thấy badge", confidence: "high" },
        { matches_expected: true, confidence: "high" },
    ]);
    chk(">>> MỘT batch nói SAI là cả test case SAI — không cho 2 batch tốt che 1 batch xấu",
        merged.matches_expected === false && merged.mismatch_details.includes("không thấy badge"),
        JSON.stringify(merged));

    const low = VC.mergeVisualBatches([{ matches_expected: true, confidence: "high" }, { matches_expected: true, confidence: "low" }]);
    chk(">>> confidence lấy THẤP NHẤT", low.confidence === "low", JSON.stringify(low));

    const broken = VC.mergeVisualBatches([{ matches_expected: true, confidence: "high" }, null]);
    chk(">>> batch không parse được = unreadable, KHÔNG được bỏ qua",
        broken.matches_expected === "unreadable", JSON.stringify(broken));

    const falseBeatsUnreadable = VC.mergeVisualBatches([null, { matches_expected: false, confidence: "high" }]);
    chk("SAI thắng cả unreadable (hạ cấp mạnh nhất thắng)",
        falseBeatsUnreadable.matches_expected === false, JSON.stringify(falseBeatsUnreadable));

    chk("không có batch nào → null, để combine() coi là không có kênh ảnh",
        VC.mergeVisualBatches([]) === null);
}

// ─────────── 8. Checkpoint giữa luồng (R2.3a/b) ───────────
{
    const SE = await import(abs("agents/qa-automation/tools/step-emitter.js"));
    const SA = await import(abs("agents/qa-automation/tools/spec-assertion-check.js"));

    const cat = SE.stepCatalogue({ steps: [{ name: "step1_apMa", text: "ap ma", kind: "action", needsValue: true }] });
    chk(">>> catalogue LUÔN có step checkpoint dựng sẵn (LLM không tự bịa được assertion)",
        cat.available.some(s => s.kind === "assert" && s.name === "__checkpoint"),
        JSON.stringify(cat.available.map(s => s.name)));

    const sc = G.parseFeature(
        `Feature: F

  @TC-D-001
  Scenario: S
    When ap ma "SALE20"
    Then thấy trên màn hình "Đang kích hoạt giảm giá"
`).scenarios[0];
    const out = G.emitSpec({ scenario: sc, catalogue: cat, testCase: { tcId: "TC-D-001", expected: 'hiển thị "Đang kích hoạt giảm giá"' } });
    const code = out.content;

    // Checkpoint đi qua ĐÚNG `withShot` như mọi bước khác — không có đường thứ hai. Bản đầu
    // của emitSpec tự dựng `test.step` + `shot()` riêng, và đặt `shot()` SAU `expect()`;
    // chạy thật thì bước hỏng là bước DUY NHẤT không có ảnh, vì `expect` ném trước khi tới
    // dòng chụp. `withShot` chụp trong `finally` nên không có lỗ đó.
    chk(">>> checkpoint biên dịch thành expect() NGAY TẠI vị trí của nó trong luồng",
        /withShot\(page, tc\.tcId, 2, 'checkpoint'[\s\S]{0,300}?getByText\("Đang kích hoạt giảm giá"/.test(code),
        code.split(String.fromCharCode(10)).filter(l => l.includes("checkpoint")).join(" | "));
    chk(">>> `__checkpoint` KHÔNG lọt vào danh sách import (không ai export tên đó)",
        !code.includes("__checkpoint"), code.split(String.fromCharCode(10)).find(l => l.startsWith("import { openEntry")));
    chk(">>> checkpoint để lại ảnh KỂ CẢ KHI NÓ ĐỎ (chụp trong `finally` của withShot)",
        /withShot\(page, tc\.tcId, 2, 'checkpoint'/.test(code) && !/test\.step\(/.test(code),
        code.split(String.fromCharCode(10)).filter(l => l.includes("shot(")).join(" | "));

    // Cửa kiểm R2.3b
    chk(">>> Expected Result có chuỗi UI → ĐÒI checkpoint",
        SA.needsCheckpoint('hiển thị "Đang kích hoạt giảm giá"').length === 1);
    chk("mã lỗi API trong backtick KHÔNG bị coi là chuỗi UI",
        SA.needsCheckpoint("trả về lỗi `VOUCHER_NOT_FOUND`").length === 0,
        JSON.stringify(SA.needsCheckpoint("trả về lỗi `VOUCHER_NOT_FOUND`")));
    chk("Expected Result không nêu chuỗi UI nào → KHÔNG đòi (cửa gác hẹp, không báo oan)",
        SA.needsCheckpoint("Tổng tiền sau giảm là 700.000đ").length === 0);

    chk(">>> spec CÓ checkpoint → cửa kiểm cho qua",
        SA.verifySpec({ tcId: "TC-D-001", specContent: code, expectedResult: 'hiển thị "Đang kích hoạt giảm giá"' }).ok,
        JSON.stringify(SA.verifySpec({ tcId: "TC-D-001", specContent: code, expectedResult: 'hiển thị "Đang kích hoạt giảm giá"' }).issues));

    const noCp = G.emitSpec({
        scenario: G.parseFeature(`Feature: F

  @TC-D-001
  Scenario: S
    When ap ma "SALE20"
`).scenarios[0],
        catalogue: cat, testCase: { tcId: "TC-D-001", expected: 'hiển thị "Đang kích hoạt giảm giá"' },
    });
    const v = SA.verifySpec({ tcId: "TC-D-001", specContent: noCp.content, expectedResult: 'hiển thị "Đang kích hoạt giảm giá"' });
    chk(">>> spec THIẾU checkpoint → cửa kiểm TỪ CHỐI, nói rõ phải thêm gì vào .feature",
        !v.ok && v.issues.some(i => i.includes("checkpoint nào giữa luồng")), JSON.stringify(v.issues));
}

let bad = 0;
for (const [n, c, e] of T) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${T.length}/${T.length} ĐÚNG` : `\n${bad}/${T.length} SAI`);
process.exit(bad === 0 ? 0 : 1);
