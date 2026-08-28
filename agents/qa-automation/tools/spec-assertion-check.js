// agents/qa-automation/tools/spec-assertion-check.js
// Same role as qa-analyst/tools/count-check.js and qa-test-designer/tools/coverage-check.js:
// LLMs unreliably self-report whether a generated spec actually asserts anything.
// This tool enforces the oracle-problem.md hard rule deterministically —
// verdict must come from expect(), never from a screenshot alone.

const TRIVIAL_ASSERTIONS = [/expect\(true\)\.toBe\(true\)/, /expect\(1\)\.toBe\(1\)/];

/**
 * Assertion TRÔNG như thật nhưng không kiểm được gì.
 *
 * `TRIVIAL_ASSERTIONS` ở trên chỉ bắt hai dạng đồ chơi (`expect(true).toBe(true)`), và điều đó
 * đủ cho tới khi đo 20 spec sinh ra thật. Trong đó có:
 *
 *   expect(soTienTrenTrang).toContain(0)      ← từ "Math.floor"  — trang nào chẳng có số 0
 *   expect(soTienTrenTrang).toContain(1)      ← từ "01 mã"
 *   expect(soTienTrenTrang).toContain(-1163)  ← từ "BUG-1163"    — mã số bug đọc thành tiền
 *   expect(page.getByText("<35 từ>"))         ← cả câu Expected Result — LUÔN ĐỎ
 *
 * Cả bốn đều được `countRealAssertions()` đếm là assertion THẬT, nên `verifySpec()` báo OK cho
 * một spec không kiểm gì cả — cửa kiểm xanh cho cửa kiểm giả. Nguồn sinh ra chúng đã được sửa
 * (gherkin-codegen.js, R2.3c/d), nhưng cửa kiểm phải bắt được chúng ĐỘC LẬP với nơi sinh:
 * đó là toàn bộ lý do file này tồn tại (xem chú thích đầu file).
 *
 * Ngưỡng 1000 giống bên gherkin-codegen: dưới đó mà không có đơn vị tiền thì là số đếm.
 */
const HOLLOW_ASSERTION_RULES = [
    {
        name: "số-đếm",
        test: (c) => {
            const m = /\.toContain\(\s*(-?\d+(?:\.\d+)?)\s*\)/.exec(c);
            return m !== null && Math.abs(Number(m[1])) < 1000;
        },
        why: (c) => `\`${c.trim().slice(0, 60)}\` — số |x| < 1000 không kèm đơn vị tiền là số đếm, trang nào cũng có → LUÔN XANH.`,
    },
    {
        name: "số-âm",
        test: (c) => /\.toContain\(\s*-\d+\s*\)/.test(c),
        why: (c) => `\`${c.trim().slice(0, 60)}\` — số âm gần như chắc chắn là mã định danh bị đọc thành tiền (BUG-1163 → -1163).`,
    },
    {
        name: "cả-đoạn-văn",
        test: (c) => {
            const m = /getByText\(\s*(["'])((?:\\.|(?!\1).)*)\1/.exec(c);
            return m !== null && m[2].length > 60;
        },
        why: () => `assert nguyên một đoạn văn dài — không trang nào in cả câu Expected Result → LUÔN ĐỎ. Đặt câu thông báo NGƯỜI DÙNG THẤY vào "ngoặc kép" trong Expected Result.`,
    },
];

/** Các assertion rỗng ruột trong một spec, kèm lý do đọc được. */
export function hollowAssertions(specContent) {
    const out = [];
    for (const call of findAssertionCalls(specContent)) {
        for (const rule of HOLLOW_ASSERTION_RULES) {
            if (rule.test(call)) { out.push({ rule: rule.name, call, why: rule.why(call) }); break; }
        }
    }
    return out;
}

// `ref=eN` (or `[ref="eN"]`) is the accessibility-tree handle Playwright MCP hands out
// for ONE snapshot — see agents/qa-automation/knowledge/mcp-cost-optimization.md, "ref
// transient" trap. It is not a real DOM/HTML attribute. On a real run, the spec-generator
// LLM twice ignored skill 02's explicit "KHÔNG viết action cho nó" instruction and wrote
// `page.click('button[ref="f15e27"]')` / `page.locator('[ref="f10e27"]')` for elements it
// had no known_locator for — a selector that never matches anything real, so the run just
// timed out for 30s. This is cheap and deterministic to catch, so it is checked here
// rather than trusted to the prompt alone.
const REF_SELECTOR_RE = /\[\s*ref\s*=|\bref\s*=\s*["'][^"']*["']\s*\]/;

export function hasEphemeralRefSelector(specContent) {
    return REF_SELECTOR_RE.test(String(specContent ?? ""));
}

/**
 * The spec must be VALID TYPESCRIPT, not a chat answer about TypeScript.
 *
 * Origin: memory/working/clean-specs.mjs, a hand-run script that walked tests/ stripping
 * ``` fences and leading prose out of generated specs. Its existence was the tell — the
 * fence-extraction in authorSpecFor() was letting some outputs through, so a human had to
 * clean up after the pipeline. A file that starts with "Đây là spec cho TC-D-001:" is not
 * a spec; it fails to parse and the whole run reports an import error rather than a test
 * result, which is a confusing way to learn the generator misfired.
 *
 * Checked here rather than trusted to the prompt, for the same reason as the ref= rule:
 * cheap, deterministic, and it feeds the agent loop a concrete violation to fix.
 */
export function hasMarkdownWrapper(specContent) {
    const s = String(specContent ?? "");
    if (/```/.test(s)) return true;
    const firstCode = s.search(/\S/);
    if (firstCode === -1) return true;                       // empty file is not a spec either
    // A spec always opens with an import (or a directive/comment before it). Anything else
    // in front of the first `import` is prose the model added.
    const head = s.slice(0, s.indexOf("import") === -1 ? s.length : s.indexOf("import"));
    return /[A-Za-zÀ-ỹ]{3,}/.test(head.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""));
}

/**
 * Find every `expect(...)` followed by at least one matcher, e.g.
 * `expect(page.getByText('700.000')).toBeVisible()`.
 *
 * A regex cannot do this. The previous implementation was
 *   /expect\([^)]*\)(\s*\.\w+\([^)]*\))+/g
 * and `[^)]*` cannot cross a NESTED `)`. So on `expect(page.getByText('x'))` it consumed
 * up to the inner `)`, matched that as the closing paren, then looked for `.matcher` and
 * found `)` instead — no match. Measured: it matched only the toy form `expect(x).toBe(1)`
 * and failed on EVERY real Playwright assertion (`expect(page.getByText(…))`,
 * `expect(response.status())`, `expect(page.locator(…))`).
 *
 * Consequence: this file's entire purpose is enforcing oracle-problem.md's rule that a
 * verdict must come from `expect()` — and it reported "không có expect() assertion nào"
 * for 20 of the 21 real specs. A gate that cries wolf is worse than no gate once it is
 * wired into the agent loop: the agent would spend its revision budget adding an assertion
 * that was there all along.
 *
 * Hence a small scanner. It tracks quotes and template literals so a paren inside a
 * string — perfectly likely in Vietnamese UI text like `getByText('Thanh toán (2)')` —
 * does not throw the depth count off.
 */
function findAssertionCalls(specContent) {
    const src = String(specContent ?? "");
    const found = [];
    const re = /\bexpect\s*\(/g;
    let m;

    while ((m = re.exec(src)) !== null) {
        let i = m.index + m[0].length;
        let depth = 1;
        let quote = null;   // "'" | '"' | "`" while inside a string

        while (i < src.length && depth > 0) {
            const c = src[i];
            if (quote) {
                if (c === "\\") i++;                 // skip the escaped character
                else if (c === quote) quote = null;
            } else if (c === "'" || c === '"' || c === "`") {
                quote = c;
            } else if (c === "(") depth++;
            else if (c === ")") depth--;
            i++;
        }
        if (depth !== 0) continue;                    // unbalanced — not a usable call

        // Require a matcher chain afterwards: `.toBeVisible(`, `.not.toBeVisible(`,
        // `.resolves.toBe(`. A bare `expect(x)` asserts nothing.
        const chain = /^(?:\s*\.\s*\w+)+\s*\(/.exec(src.slice(i));
        if (!chain) continue;

        // Consume the matcher's OWN arguments too, so the returned text is the complete
        // call. Without this the slice stopped at the matcher's opening paren, and
        // TRIVIAL_ASSERTIONS (`/expect\(true\)\.toBe\(true\)/`) could never match because
        // its trailing `true)` had been cut off — every trivial assertion counted as real.
        let j = i + chain[0].length;
        let mDepth = 1;
        let mQuote = null;
        while (j < src.length && mDepth > 0) {
            const c = src[j];
            if (mQuote) {
                if (c === "\\") j++;
                else if (c === mQuote) mQuote = null;
            } else if (c === "'" || c === '"' || c === "`") {
                mQuote = c;
            } else if (c === "(") mDepth++;
            else if (c === ")") mDepth--;
            j++;
        }

        found.push(src.slice(m.index, j));
    }
    return found;
}

/**
 * Count non-trivial expect() calls in a spec file's content.
 *
 * "Rỗng ruột" bị trừ ra CÙNG với "tầm thường": một spec chỉ có `toContain(0)` phải đếm là 0,
 * nếu không thì `verifySpec()` báo "có 1 assertion" và cửa kiểm cho qua đúng thứ nó tồn tại
 * để chặn.
 */
export function countRealAssertions(specContent) {
    const hollow = new Set(hollowAssertions(specContent).map(h => h.call));
    return findAssertionCalls(specContent)
        .filter(c => !TRIVIAL_ASSERTIONS.some(t => t.test(c)))
        .filter(c => !hollow.has(c))
        .length;
}

/** True if the spec takes a screenshot but never asserts anything */
export function isScreenshotOnly(specContent) {
    return /\.screenshot\(/.test(specContent) && countRealAssertions(specContent) === 0;
}

/**
 * Expected Result nói tới một TRẠNG THÁI TRUNG GIAN — tức là có thứ cần kiểm ở GIỮA luồng,
 * không phải chỉ ở cuối.
 *
 * Nhận diện bằng chuỗi UI đặt trong ngoặc kép: đó là cách bảng test case thật đang được viết
 * ("hiển thị trạng thái "Đang kích hoạt giảm giá"", "thông báo "Mã không hợp lệ""). Chuỗi
 * trong dấu backtick là mã lỗi API, KHÔNG phải text màn hình — cùng ranh giới mà
 * `assertableTexts()` bên gherkin-codegen dùng.
 *
 * Cố ý HẸP. Một cửa gác báo oan bên trong vòng lặp agent sẽ đốt hết ngân sách sửa cho một lỗi
 * không tồn tại — đúng chuyện đã xảy ra với `countRealAssertions` (báo "không có expect()" cho
 * 20/21 spec thật). Nên chỉ đòi checkpoint khi Expected Result THẬT SỰ nêu một chuỗi UI.
 */
export function needsCheckpoint(expectedResult) {
    return [...String(expectedResult ?? "").matchAll(/["“]([^"“”]{2,60})["”]/g)]
        .map(m => m[1].trim())
        .filter(s => s && !/^[A-Z0-9_]+$/.test(s) && /[\p{L}]/u.test(s));
}

/**
 * Spec có đặt `expect()` ở GIỮA luồng không, hay dồn hết xuống cuối.
 *
 * Dò khối `withShot(page, tc.tcId, N, '<nhãn>', async () => { … expect( … })` — hình dạng mà
 * `emitSpec()` sinh cho step `kind: "assert"`. Quét thô theo khối là đủ: đây là code SINH RA,
 * hình dạng cố định, không phải code người viết tay.
 *
 * Bản đầu dò `test.step(` tường minh. Nhưng checkpoint đi qua `withShot` (chính `withShot` gọi
 * `test.step` bên trong), nên chuỗi đó không còn trong spec — cửa kiểm sẽ từ chối MỌI spec có
 * checkpoint hợp lệ. Một cửa gác báo oan trong vòng lặp agent đốt sạch ngân sách sửa cho một
 * lỗi không tồn tại; đúng chuyện `countRealAssertions` đã làm với 20/21 spec thật.
 */
export function hasMidFlowCheckpoint(specContent) {
    return /withShot\([^)]*?,\s*async[\s\S]{0,400}?\bexpect\s*\(/.test(String(specContent ?? ""));
}

/**
 * Verify one generated spec file against the oracle-problem.md hard rule.
 * @param {{tcId: string, specContent: string, expectedResult?: string|null}} o
 *   `expectedResult` — khi có, bật thêm luật checkpoint (R2.3b). Bỏ trống thì luật đó không
 *   chạy, để mọi nơi gọi cũ không bị báo oan hàng loạt.
 * @returns {{ ok: boolean, tcId: string, assertionCount: number, issues: string[] }}
 */
export function verifySpec({ tcId, specContent, expectedResult = null }) {
    const assertionCount = countRealAssertions(specContent);
    const issues = [];

    // Nêu assertion rỗng ruột TRƯỚC câu "không có assertion nào": một spec có 3 dòng
    // `expect(...)` mà bị báo "không có assertion nào" thì người đọc tưởng cửa kiểm hỏng.
    // Phải nói rõ nó CÓ, nhưng không kiểm được gì, và vì sao.
    for (const h of hollowAssertions(specContent)) {
        issues.push(`${tcId}: assertion rỗng ruột (${h.rule}) — ${h.why}`);
    }
    if (assertionCount === 0) {
        issues.push(`${tcId}: không có expect() assertion nào không tầm thường.`);
    }
    if (isScreenshotOnly(specContent)) {
        issues.push(`${tcId}: chỉ chụp screenshot, không assert — vi phạm oracle-problem.md.`);
    }
    if (!specContent.includes(tcId)) {
        issues.push(`${tcId}: tên test không chứa TC_ID — mất traceability.`);
    }
    if (hasEphemeralRefSelector(specContent)) {
        issues.push(`${tcId}: dùng selector chứa "ref=" (mã tham chiếu snapshot MCP, KHÔNG phải attribute HTML thật) — sẽ không bao giờ khớp, chạy sẽ timeout. Xem knowledge/mcp-cost-optimization.md.`);
    }
    // R2.3b — Expected Result nêu một trạng thái TRUNG GIAN thì phải có checkpoint ở giữa luồng.
    //
    // Không có checkpoint thì mọi assertion dồn xuống cuối, và một luồng hỏng ở bước 3 vẫn chạy
    // tiếp tới bước 5 — đúng kịch bản "áp mã không thành công nhưng vẫn thanh toán thành công".
    // Kiểm bằng CODE chứ không bằng câu nhắc trong prompt: luật sống trong prompt là luật không
    // tồn tại (bài học P4).
    const wantCheckpoints = needsCheckpoint(expectedResult);
    if (wantCheckpoints.length && !hasMidFlowCheckpoint(specContent)) {
        issues.push(
            `${tcId}: Expected Result nêu trạng thái trung gian (${wantCheckpoints.map(w => `"${w}"`).join(", ")}) ` +
            `nhưng spec KHÔNG có checkpoint nào giữa luồng — mọi assertion dồn xuống cuối. ` +
            `Thêm vào .feature một step \`Then thấy trên màn hình "<chuỗi>"\` ngay sau bước tạo ra trạng thái đó.`);
    }

    if (hasMarkdownWrapper(specContent)) {
        issues.push(`${tcId}: file còn code fence \`\`\` hoặc câu văn giải thích trước "import" — đây phải là file .ts chạy được, không phải câu trả lời chat. Trả về CHỈ code, không bọc markdown, không mở đầu bằng lời dẫn.`);
    }

    return { ok: issues.length === 0, tcId, assertionCount, issues };
}

/** Verify a batch of generated specs at once, for the deliverable's Self Count Check */
export function verifyAllSpecs(specs) {
    const results = specs.map(verifySpec);
    const issues = results.flatMap(r => r.issues);
    return { ok: issues.length === 0, results, issues };
}