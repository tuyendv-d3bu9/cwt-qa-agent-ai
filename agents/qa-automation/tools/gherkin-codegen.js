// agents/qa-automation/tools/gherkin-codegen.js
// `.feature` (nguồn sự thật của luồng) → `.spec.ts` (thứ Playwright chạy).
// DETERMINISTIC — the LLM writes the .feature; it does not write a line of the spec.
//
// WHAT THIS REPLACES. `authorSpecFor()` asked the LLM for a WHOLE spec file, once per test
// case: 21 calls, 21 independent chances to invent a selector, a flow, or a data field.
// Measured on the real run: 13 of the 21 emitted files contained ZERO actions — every step
// commented out as `// TODO: locator chưa xác định` — and three of them contained
// `ref="f15e27"` selectors that can never match. From here the LLM's output is a `.feature`
// file: a list of steps drawn from a BOUNDED catalogue. If it names a step that does not
// exist, that is caught deterministically below instead of becoming broken TypeScript.
//
// WHY NOT playwright-bdd. A BDD runner would change the shape of test-results.json, and
// agents/qa-verifier/tools/parse-test-results.js reads the current Playwright JSON reporter
// shape (`suites[].specs[].tests[].results[]`). Adding a runner breaks the verifier's
// contract. So `.feature` stays the source of truth for the FLOW and this file compiles it
// down to an ordinary Playwright spec — reporter, trace and JSON output all unchanged.

import { moneyIn } from "../../runtime/money.js";
// Khoá nối giữa tiêu đề `test.step` (vào test-results.json) và tên file ảnh. MỘT nguồn duy
// nhất: tự ghép chuỗi ở đây lần thứ hai là chỗ để hai bên lệch nhau, và lệch thì verifier có
// nhãn bước hỏng nhưng không tìm ra ảnh — rồi im lặng kết luận bằng ảnh cuối như cũ.
import { stepShotLabel } from "../../runtime/paths.js";

const FEATURE_RE = /^\s*Feature\s*:\s*(.+?)\s*$/i;
const SCENARIO_RE = /^\s*(Scenario|Scenario Outline)\s*:\s*(.+?)\s*$/i;
const STEP_RE = /^\s*(Given|When|Then|And|But)\s+(.+?)\s*$/i;
const TAG_RE = /(@[\w.-]+)/g;

/**
 * Parse a `.feature` file.
 *
 * Tolerant on purpose: Gherkin written by a model drifts (extra blank lines, a stray
 * comment, `And` where `When` was meant). What it is NOT tolerant about is a step whose
 * text matches nothing in the catalogue — that is reported, never guessed at.
 *
 * @returns {{feature: string|null, scenarios: Array<{name, tags: string[], tcId: string|null,
 *            steps: Array<{keyword, text, arg: string|null}>}>, problems: string[]}}
 */
export function parseFeature(text) {
    const lines = String(text ?? "").split("\n");
    const scenarios = [];
    const problems = [];
    let feature = null;
    let current = null;
    let pendingTags = [];

    for (const raw of lines) {
        const line = raw.replace(/\s+$/, "");
        if (!line.trim() || /^\s*#/.test(line)) continue;

        const f = FEATURE_RE.exec(line);
        if (f) { feature = f[1]; continue; }

        if (/^\s*@/.test(line)) { pendingTags = [...line.matchAll(TAG_RE)].map(m => m[1]); continue; }

        const sc = SCENARIO_RE.exec(line);
        if (sc) {
            current = {
                name: sc[2],
                tags: pendingTags,
                // The TC id is the traceability link back to the test case table. Taken from a
                // tag, because a tag is unambiguous; the scenario title is prose.
                tcId: pendingTags.map(t => t.slice(1)).find(t => /^TC-[A-Za-z0-9]+-\d+$/.test(t)) ?? null,
                steps: [],
            };
            scenarios.push(current);
            pendingTags = [];
            continue;
        }

        const st = STEP_RE.exec(line);
        if (st) {
            if (!current) { problems.push(`Step ngoài mọi Scenario: "${line.trim()}"`); continue; }
            // A quoted value in the step is its argument: `When tôi nhập mã "SALE20"`.
            const q = /["'“”]([^"'“”]*)["'“”]/.exec(st[2]);
            current.steps.push({
                keyword: st[1],
                text: st[2].replace(/\s*["'“”][^"'“”]*["'“”]\s*/, " ").replace(/\s+/g, " ").trim(),
                arg: q ? q[1] : null,
                raw: st[2],
            });
            continue;
        }
    }

    if (!feature) problems.push(`Không có dòng "Feature:".`);
    if (scenarios.length === 0) problems.push(`Không có Scenario nào.`);
    for (const s of scenarios) {
        if (!s.tcId) problems.push(`Scenario "${s.name}" không có tag @TC-<...> → mất truy vết về test case.`);
        if (s.steps.length === 0) problems.push(`Scenario "${s.name}" không có step nào.`);
    }
    return { feature, scenarios, problems };
}

/** Normalise step text for matching: case, punctuation and spacing must not decide a match. */
const normalise = (s) => String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Match one Gherkin step to a step function in the catalogue.
 * Exact-normalised first, then containment. Ambiguity is a PROBLEM, not a coin flip:
 * picking one of two equally-matching steps silently produces a test that exercises
 * something other than what it says.
 */
export function matchStep(stepText, available) {
    const want = normalise(stepText);
    const exact = available.filter(s => normalise(s.text) === want);
    if (exact.length === 1) return { step: exact[0], why: "khớp chính xác" };
    if (exact.length > 1) return { step: null, why: `khớp CHÍNH XÁC với ${exact.length} step (${exact.map(s => s.name).join(", ")}) — không thể chọn hộ` };

    const partial = available.filter(s => normalise(s.text).includes(want) || want.includes(normalise(s.text)));
    if (partial.length === 1) return { step: partial[0], why: "khớp một phần" };
    if (partial.length > 1) return { step: null, why: `khớp một phần với ${partial.length} step (${partial.map(s => s.name).join(", ")}) — nhập nhằng` };
    return { step: null, why: `không có step nào trong catalogue khớp` };
}

// ─────────────────────────────────────────────────────────────────────────────
// R2.3c/d — CHỌN cái gì trong Expected Result đáng biến thành assertion
//
// VÌ SAO CÓ PHẦN NÀY. Bản trước gọi thẳng `moneyIn(expected)` rồi assert MỌI con số nó trả
// về. `moneyIn()` không sai — nó được viết để SO tiền, không phải để CHỌN số nào là tiền
// (memory/semantic/money-comparison.md, tier 1, dùng cho mọi dự án). Nhưng dùng nó ở đây thì
// mọi cụm chữ số trong câu văn đều thành assertion. Đo trên 20 spec sinh ra thật:
//
//   toContain(-1163) / (-1171) / (-1150)   ← "BUG-1163", "BUG-1171", "BUG-1150"  (mã số bug)
//   toContain(404) / toContain(400)        ← "HTTP 400/404"                       (mã HTTP)
//   toContain(20)                          ← "giảm 20%"                           (phần trăm)
//   toContain(59)                          ← "23:59:59"                           (giây)
//   toContain(0) ×4, toContain(1) ×4       ← "Math.floor", "01 mã", "1 giây"       (LUÔN XANH)
//
// Và nhánh dự phòng `getByText(<cả đoạn Expected Result>)` (8/20 spec) LUÔN ĐỎ: không trang
// nào in nguyên một câu 35 từ.
//
// Nên hệ thống vừa false-green vừa false-red cùng lúc — đúng hai thứ oracle-problem.md tồn
// tại để chặn. Ba tầng dưới đây thay cho một lời gọi `moneyIn()` trần.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Những vùng KHÔNG được quét tìm tiền. Thay bằng dấu cách (giữ nguyên độ dài) thay vì xoá,
 * để các mẫu sau không dính nhau: "BUG-1163và" không được phép thành một token mới.
 */
const NON_MONEY_SPANS = [
    // Token định danh có gạch nối/gạch dưới: BUG-1163, TC-D-012, VOUCHER_NOT_FOUND,
    // min_order_value, first-order-only. Đây là mẫu CHUNG, không phải danh sách mã của dự án
    // này — dự án khác đặt tên khác vẫn vào đúng khuôn.
    /\b[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)+\b/g,
    // Mã HTTP: "HTTP 400/404", "HTTP 200".
    /\bHTTP\s*\d{3}(?:\s*\/\s*\d{3})*/gi,
    // Giờ/phút/giây: 23:59:59, 00:00.
    /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
    // Phần trăm: "20%", "20 %".
    /-?\d[\d.,]*\s*%/g,
];

/** Đơn vị tiền đứng ngay sau con số. Không ưu tiên tiền tệ nào — thêm đơn vị khác vào đây. */
const CURRENCY_AFTER = /^\s*(?:đ|₫|vnd|đồng|d\b)/i;

/**
 * Số tiền trong Expected Result mà assert được.
 *
 * Nhận khi: có đơn vị tiền ngay sau (`200.000đ`), HOẶC giá trị ≥ 1000 (`subtotal = 200.000`).
 * Ngưỡng 1000 không phải con số đẹp — nó là ranh giới dưới của một khoản tiền VND có nghĩa.
 * Dưới ngưỡng mà không có đơn vị thì gần như chắc chắn là số đếm ("01 mã", "1 giây"), và
 * assert nó là dựng một cửa kiểm LUÔN XANH.
 *
 * @returns {number[]} theo thứ tự xuất hiện, đã khử trùng lặp
 */
export function assertableAmounts(expected) {
    let masked = String(expected ?? "");
    for (const re of NON_MONEY_SPANS) {
        masked = masked.replace(re, (m) => " ".repeat(m.length));
    }

    const out = [];
    for (const m of masked.matchAll(/-?\d[\d.,]*/g)) {
        const raw = m[0].replace(/[.,]+$/, "");
        const value = moneyIn(raw)[0];
        if (!Number.isFinite(value)) continue;
        const hasUnit = CURRENCY_AFTER.test(masked.slice(m.index + m[0].length));
        if (!hasUnit && Math.abs(value) < 1000) continue;
        if (!out.includes(value)) out.push(value);
    }
    return out;
}

/**
 * Chuỗi UI mà tác giả test case đã ĐẶT TRONG NGOẶC KÉP — thứ thật sự hiện trên màn hình.
 *
 * Phân biệt có chủ ý:
 *   "Đang kích hoạt giảm giá"   → text người dùng NHÌN THẤY        → assert được
 *   `VOUCHER_NOT_FOUND`         → mã lỗi API, trong dấu backtick   → KHÔNG assert trên UI
 *
 * Ranh giới đó không phải tôi đặt ra — nó là cách bảng test case đang được viết thật
 * (xem Expected Result của TC-D-001, TC-D-006, TC-D-008). Backtick dành cho mã, ngoặc kép
 * dành cho text màn hình.
 *
 * @returns {string[]} theo thứ tự xuất hiện, đã khử trùng lặp
 */
export function assertableTexts(expected) {
    const out = [];
    for (const m of String(expected ?? "").matchAll(/["“]([^"“”]{2,60})["”]/g)) {
        const s = m[1].trim();
        if (!s) continue;
        // Toàn chữ HOA + số + gạch dưới = mã (SALE20, VOUCHER_NOT_FOUND), không phải câu UI.
        if (/^[A-Z0-9_]+$/.test(s)) continue;
        // Phải có ít nhất một chữ cái — "123" trong ngoặc kép không phải câu thông báo.
        if (!/[\p{L}]/u.test(s)) continue;
        if (!out.includes(s)) out.push(s);
    }
    return out;
}

/**
 * Slug dùng cho TÊN ẢNH và TIÊU ĐỀ `test.step` của một bước.
 *
 * Lấy từ tên hàm step (`step3_nhapMaGiamGiaVaoO` → `nhap-ma-giam-gia-vao-o`) chứ không lấy từ
 * câu Gherkin: tên hàm đã được `toStepName()` chuẩn hoá về ASCII và đã ổn định qua các lần
 * sinh, còn câu Gherkin do LLM viết nên đổi chữ là đổi tên file ảnh.
 */
export function slugForShot(fnName, n) {
    const body = String(fnName ?? "").replace(/^step\d+_/, "");
    const slug = body
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || `buoc-${n}`;
}

/**
 * Compile one scenario into a Playwright spec.
 *
 * @param {object} o
 * @param {object} o.scenario     from parseFeature()
 * @param {object} o.catalogue    from stepCatalogue()
 * @param {object} o.testCase     the 8-field test case (for Expected Result + data)
 * @param {string} o.stepsImport  import path from the spec to the step library
 * @param {string} o.dataImport   import path to tests/data/test-cases.json
 * @returns {{content: string|null, unmatched: Array, assertionNote: string}}
 *   `content: null` when a step could not be matched — no spec is written at all rather
 *   than one with the failing step commented out. A spec that silently skips its own
 *   middle still goes green, which is worse than no spec.
 */
/**
 * Tham số tag của `test()`, dựng từ tag Gherkin có sẵn (R4.1c).
 *
 * Playwright đòi tag bắt đầu bằng `@` và KHÔNG chứa khoảng trắng — `@Happy Path` trong
 * `.feature` phải thành `@Happy-Path`, nếu không Playwright bỏ qua phần sau dấu cách và
 * `--grep @Happy-Path` không khớp gì. Đây là chỗ im lặng hỏng nếu chỉ chép nguyên văn.
 *
 * Trả về chuỗi rỗng khi không có tag nào → `test('...', async ...)` như cũ.
 */
export function playwrightTags(scenario, identity = null) {
    const raw = [...(scenario?.tags ?? [])];
    if (identity) raw.push(`identity:${identity}`);
    const tags = [...new Set(
        raw.map(t => "@" + String(t).replace(/^@/, "").trim().replace(/\s+/g, "-")).filter(t => t.length > 1)
    )];
    if (!tags.length) return "";
    return `, { tag: [${tags.map(t => JSON.stringify(t)).join(", ")}] }`;
}

export function emitSpec({ scenario, catalogue, testCase, identity = null,
    stepsImport = "../../tests/steps/flow.steps",
    dataImport = "./data/test-cases.json",
    evidenceImport = "../../tests/steps/_evidence" }) {
    const unmatched = [];
    const calls = [];

    for (const st of scenario.steps) {
        const { step, why } = matchStep(st.text, catalogue.available ?? []);
        if (!step) { unmatched.push({ step: `${st.keyword} ${st.raw}`, why }); continue; }
        calls.push({ gherkin: `${st.keyword} ${st.raw}`, fn: step.name, needsValue: step.needsValue, arg: st.arg, kind: step.kind });
    }

    if (unmatched.length) return { content: null, unmatched, assertionNote: "" };

    const tcId = scenario.tcId ?? testCase?.tcId ?? "UNKNOWN";
    const expected = String(testCase?.expected ?? "").trim();
    // Checkpoint (`kind: "assert"`) KHÔNG phải một hàm trong thư viện step — nó biên dịch thành
    // `expect()` tại chỗ. Để nó lọt vào danh sách import là sinh ra `import { __checkpoint }`,
    // một tên không ai export, và cả spec chết ở dòng import với lỗi chẳng liên quan gì tới
    // nguyên nhân.
    const used = [...new Set(calls.filter(c => c.kind !== "assert").map(c => c.fn))];

    const lines = [
        `// SINH TỰ ĐỘNG từ .feature bởi agents/qa-automation/tools/gherkin-codegen.js.`,
        `// ĐỪNG SỬA TAY — sửa file .feature rồi sinh lại.`,
        `//`,
        `// Spec này KHÔNG chứa locator: mọi hành động đi qua thư viện step (tests/steps/),`,
        `// và locator nằm ở Page Object do Playwright sinh. LLM chỉ viết .feature.`,
        ``,
        `import { test, expect } from '@playwright/test';`,
        `import dataset from '${dataImport}' with { type: 'json' };`,
        `import { withShot, shot } from '${evidenceImport}';`,
        `import { openEntry${used.length ? ", " + used.join(", ") : ""} } from '${stepsImport}';`,
        ``,
        `const tc = dataset.cases.find(c => c.tcId === '${tcId}')!;`,
        ``,
        // TAG TƯ CÁCH (R6). `playwright.config.ts` lọc test về đúng project bằng
        // `grep: /@identity:<tên>\b/` trên TIÊU ĐỀ test — nên tag phải nằm trong tiêu đề, không
        // phải trong chú thích. Dự án không khai tư cách thì `identity` là null và tiêu đề y
        // như trước.
        //
        // ⚠ Khai tư cách rồi mà spec KHÔNG có tag thì nó rơi ra ngoài mọi project và Playwright
        // báo "0 test" — im lặng, không lỗi. `untaggedSpecs()` trong identity-plan.js là cửa
        // chặn cho đúng chuyện đó.
        // TAG PLAYWRIGHT (R4.1c). `.feature` đã có sẵn `@TC-D-001 @Critical` — dùng lại nguyên
        // xi, không phát minh bộ tag thứ hai. Nhờ vậy `npx playwright test --grep @Critical`
        // chạy được ngay, không cần một lớp bọc dịch qua dịch lại.
        //
        // Tag nằm ở THAM SỐ THỨ HAI của `test()` (Playwright >= 1.42), khác với tag tư cách ở
        // trong tiêu đề: `grep` khớp cả hai, nhưng tag ở tham số hiện ra trong report và lọc
        // được bằng `--grep` mà không làm tiêu đề dài thêm.
        `test('${tcId}: ${(scenario.name || "").replace(/'/g, "\\'")}${identity ? ` @identity:${identity}` : ""}'${playwrightTags(scenario, identity)}, async ({ page }) => {`,
        `  await openEntry(page);`,
        `  await shot(page, tc.tcId, 0, 'entry');`,
        ``,
    ];

    // MỖI BƯỚC MỘT ẢNH (R2.2). `withShot` làm hai việc mà thiếu cái nào cũng hỏng:
    //   1. bọc `test.step()`  → tiêu đề bước vào test-results.json, nên biết HỎNG Ở BƯỚC NÀO
    //                           (đo được: expect() không bọc thì KHÔNG vào `result.steps[]`)
    //   2. chụp trong `finally` → có ảnh kể cả khi bước ném lỗi, tức là có đúng tấm cần nhất
    // Tiêu đề bước và tên file ảnh dùng CHUNG một chuỗi `NN-label` — đó là khoá để qa-verifier
    // ghép "bước hỏng" với "ảnh của bước đó". Xem `stepShotLabel()` trong runtime/paths.js.
    calls.forEach((c, i) => {
        const n = i + 1;
        const label = slugForShot(c.fn, n);
        lines.push(`  // ${c.gherkin}`);

        // CHECKPOINT GIỮA LUỒNG (R2.3a). Đây là NGOẠI LỆ DUY NHẤT cho luật "spec không chứa
        // locator": `getByText(<chuỗi>)` là NỘI DUNG người dùng nhìn thấy, không phải selector
        // cấu trúc — nó không phụ thuộc DOM, không lỗi thời khi UI đổi class/id.
        //
        // Bọc `test.step` như mọi bước khác, nên khi checkpoint đỏ thì `result.steps[]` ghi
        // đúng tên bước đó, `combine()` gán CHECKPOINT_FAILED, và báo cáo chỉ đúng một tấm ảnh.
        if (c.kind === "assert") {
            const want = c.arg ?? "";
            if (!want) {
                lines.push(`  // Checkpoint không có chuỗi để kiểm — bỏ qua (feature phải ghi trong "ngoặc kép").`);
                return;
            }
            // Đi qua ĐÚNG `withShot` như mọi bước khác — KHÔNG tự viết `test.step` + `shot` ở đây.
            //
            // Bản đầu của nhánh này tự dựng khối và đặt `shot()` SAU `expect()`. Chạy thật thì
            // lộ ra ngay: checkpoint đỏ → `expect` ném → dòng `shot()` không bao giờ tới →
            // **bước hỏng là bước DUY NHẤT không có ảnh**. Đúng cái bẫy mà `finally` của
            // `withShot` sinh ra để tránh, và tôi đã đi thẳng vào nó bằng cách viết đường thứ hai.
            // Một đường code cho một việc: "chạy một bước và luôn để lại ảnh" = `withShot`.
            lines.push(
                `  await withShot(page, tc.tcId, ${n}, '${label}', async () => {`,
                `    await expect(page.getByText(${JSON.stringify(want)}, { exact: false }),`,
                `      'checkpoint giữa luồng: không thấy "${want.replace(/'/g, "\\'")}" sau bước trước đó').toBeVisible();`,
                `  });`,
            );
            return;
        }

        if (c.kind === "check") {
            lines.push(`  await withShot(page, tc.tcId, ${n}, '${label}', () => ${c.fn}(page));`);
            return;
        }
        if (c.needsValue) {
            // Value from the .feature if the author quoted one, otherwise from the data file.
            // Never a literal baked into the spec: changing test data must not require
            // regenerating (and re-exploring for) the spec.
            const value = c.arg !== null ? `'${c.arg.replace(/'/g, "\\'")}'` : `String(Object.values(tc.data?.fields ?? {})[0] ?? '')`;
            lines.push(`  await withShot(page, tc.tcId, ${n}, '${label}', () => ${c.fn}(page, ${value}));`);
            return;
        }
        lines.push(`  await withShot(page, tc.tcId, ${n}, '${label}', () => ${c.fn}(page));`);
    });

    // The assertion is the ONE place pass/fail is decided (knowledge/oracle-problem.md), and
    // it comes from the test case's Expected Result. When that cannot be turned into a
    // checkable assertion, the spec FAILS LOUDLY instead of passing on two screenshots —
    // 13 of the 21 real specs were exactly that: goto + screenshot + nothing.
    lines.push(
        ``,
        `  await page.waitForTimeout(500);`,
        // Ảnh cuối: trạng thái màn hình NGAY TRƯỚC khi assert. Chụp sau assert thì test
        // đỏ là không bao giờ tới dòng chụp — mất đúng tấm cần để hiểu vì sao đỏ.
        "  await shot(page, tc.tcId, 99, 'final');",
        `  // Expected Result: ${expected || "(test case không ghi)"}`,
    );
    let assertionNote;
    if (!expected) {
        lines.push(
            `  // Test case không có Expected Result → không có gì để assert.`,
            `  throw new Error('${tcId}: test case thiếu Expected Result — không thể sinh assertion. Bổ sung vào bảng test case rồi sinh lại spec.');`,
        );
        assertionNote = "thiếu Expected Result → spec chủ động throw";
    } else {
        // Hai tầng, cả hai đều deterministic (xem khối chú thích R2.3c/d ở trên):
        //   1. số TIỀN đã lọc  → assert theo GIÁ TRỊ, bỏ đơn vị
        //   2. chuỗi UI trong ngoặc kép → assert đúng chuỗi đó hiện trên màn hình
        // Cả hai cùng có thì assert CẢ HAI — nhiều cửa kiểm thật thì oracle chặt hơn.
        const amounts = assertableAmounts(expected);
        const texts = assertableTexts(expected);
        const notes = [];

        if (amounts.length) {
            lines.push(
                `  // Expected Result có giá trị tiền: assert theo SỐ, bỏ đơn vị.`,
                `  // "10.000đ" và "10.000 ₫" là CÙNG một giá trị — assert nguyên chuỗi là bắt test`,
                `  // biết cách trình bày của một dự án cụ thể (memory/semantic/money-comparison.md).`,
                `  // Đã LOẠI: mã định danh (BUG-1163), mã HTTP, phần trăm, mốc giờ, và số < 1000`,
                `  // không kèm đơn vị tiền — assert những thứ đó là dựng cửa kiểm luôn xanh.`,
                `  const bodyText = await page.locator('body').innerText();`,
                `  const soTienTrenTrang = [...bodyText.matchAll(/-?\\d[\\d.,]*/g)]`,
                `    .map(m => Number(m[0].replace(/[.,](?=\\d{3}\\b)/g, '').replace(',', '.')))`,
                `    .filter(Number.isFinite);`,
                ...amounts.map(a => `  expect(soTienTrenTrang, 'không thấy giá trị ${a} trên trang').toContain(${a});`),
            );
            notes.push(`${amounts.length} giá trị tiền theo SỐ`);
        }

        if (texts.length) {
            lines.push(
                `  // Chuỗi UI mà test case đặt trong ngoặc kép — thứ người dùng NHÌN THẤY.`,
                `  // Mã trong dấu backtick (VOUCHER_NOT_FOUND) KHÔNG được assert: đó là mã lỗi API,`,
                `  // không phải text màn hình.`,
                ...texts.map(t => `  await expect(page.getByText(${JSON.stringify(t)}, { exact: false }), 'không thấy "${t.replace(/'/g, "\\'")}" trên màn hình').toBeVisible();`),
            );
            notes.push(`${texts.length} chuỗi UI trong ngoặc kép`);
        }

        if (!amounts.length && !texts.length) {
            // KHÔNG còn nhánh `getByText(<cả đoạn Expected Result>)`. Nó luôn đỏ (8/20 spec
            // thật), và một assertion luôn đỏ dạy người đọc bỏ qua màu đỏ — tệ hơn không có.
            // Vấn đề nằm ở TEST CASE, nên thông điệp phải chỉ về đó, không chỉ về code.
            const oneLine = expected.replace(/\s+/g, " ").slice(0, 120).replace(/'/g, "\\'");
            lines.push(
                `  // Expected Result không quy được về một assertion kiểm được:`,
                `  //   - không có giá trị tiền nào (sau khi loại mã định danh / % / giờ / số đếm)`,
                `  //   - không có chuỗi UI nào đặt trong ngoặc kép`,
                `  throw new Error(`,
                `    '${tcId}: Expected Result không kiểm chứng được bằng máy — spec KHÔNG được sinh assertion giả.\\n' +`,
                `    '  Expected Result hiện tại: ${oneLine}\\n' +`,
                `    '  Cách sửa (ở BẢNG TEST CASE, không phải ở code): thêm số tiền cụ thể kèm đơn vị,\\n' +`,
                `    '  hoặc đặt câu thông báo người dùng thấy trên màn hình vào trong "ngoặc kép".'`,
                `  );`,
            );
            notes.push("KHÔNG assert được → spec chủ động throw, chỉ về bảng test case");
        }

        assertionNote = notes.join(" + ");
    }

    lines.push(
        `});`,
        ``,
    );

    return { content: lines.join("\n"), unmatched: [], assertionNote };
}

/** Render a .feature from a scenario list — used to write back what the LLM produced. */
export function renderFeature({ feature, scenarios }) {
    const out = [`Feature: ${feature ?? "(không tên)"}`, ``];
    for (const s of scenarios) {
        if (s.tags?.length) out.push(`  ${s.tags.join(" ")}`);
        out.push(`  Scenario: ${s.name}`);
        for (const st of s.steps) out.push(`    ${st.keyword} ${st.raw ?? st.text}`);
        out.push(``);
    }
    return out.join("\n");
}
