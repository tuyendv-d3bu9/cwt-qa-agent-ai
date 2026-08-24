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
export function emitSpec({ scenario, catalogue, testCase, stepsImport = "../../tests/steps/flow.steps", dataImport = "./data/test-cases.json" }) {
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
    const used = [...new Set(calls.map(c => c.fn))];

    const lines = [
        `// SINH TỰ ĐỘNG từ .feature bởi agents/qa-automation/tools/gherkin-codegen.js.`,
        `// ĐỪNG SỬA TAY — sửa file .feature rồi sinh lại.`,
        `//`,
        `// Spec này KHÔNG chứa locator: mọi hành động đi qua thư viện step (tests/steps/),`,
        `// và locator nằm ở Page Object do Playwright sinh. LLM chỉ viết .feature.`,
        ``,
        `import { test, expect } from '@playwright/test';`,
        `import dataset from '${dataImport}' with { type: 'json' };`,
        `import { openEntry${used.length ? ", " + used.join(", ") : ""} } from '${stepsImport}';`,
        ``,
        `const tc = dataset.cases.find(c => c.tcId === '${tcId}')!;`,
        ``,
        `test.afterEach(async ({ page }) => {`,
        `  await page.waitForTimeout(500);`,
        `  await page.screenshot({ path: \`.qa-run/evidence/\${tc.tcId}-after.jpg\`, type: 'jpeg', quality: 60, scale: 'css' });`,
        `});`,
        ``,
        `test('${tcId}: ${(scenario.name || "").replace(/'/g, "\\'")}', async ({ page }) => {`,
        `  await openEntry(page);`,
        `  await page.screenshot({ path: \`.qa-run/evidence/\${tc.tcId}-before.jpg\`, type: 'jpeg', quality: 60, scale: 'css' });`,
        ``,
    ];

    for (const c of calls) {
        lines.push(`  // ${c.gherkin}`);
        if (c.kind === "check") {
            lines.push(`  await ${c.fn}(page);`);
            continue;
        }
        if (c.needsValue) {
            // Value from the .feature if the author quoted one, otherwise from the data file.
            // Never a literal baked into the spec: changing test data must not require
            // regenerating (and re-exploring for) the spec.
            const value = c.arg !== null ? `'${c.arg.replace(/'/g, "\\'")}'` : `String(Object.values(tc.data?.fields ?? {})[0] ?? '')`;
            lines.push(`  await ${c.fn}(page, ${value});`);
            continue;
        }
        lines.push(`  await ${c.fn}(page);`);
    }

    // The assertion is the ONE place pass/fail is decided (knowledge/oracle-problem.md), and
    // it comes from the test case's Expected Result. When that cannot be turned into a
    // checkable assertion, the spec FAILS LOUDLY instead of passing on two screenshots —
    // 13 of the 21 real specs were exactly that: goto + screenshot + nothing.
    lines.push(``, `  await page.waitForTimeout(500);`, `  // Expected Result: ${expected || "(test case không ghi)"}`);
    let assertionNote;
    if (!expected) {
        lines.push(
            `  // Test case không có Expected Result → không có gì để assert.`,
            `  throw new Error('${tcId}: test case thiếu Expected Result — không thể sinh assertion. Bổ sung vào bảng test case rồi sinh lại spec.');`,
        );
        assertionNote = "thiếu Expected Result → spec chủ động throw";
    } else {
        // If the Expected Result names a money amount, assert the AMOUNT, not the string.
        // `10.000đ` never matches a UI rendering `10.000 ₫` — that is exactly how TC-D-012
        // failed while the product was correct. Rule: memory/semantic/money-comparison.md.
        const amounts = moneyIn(expected);
        if (amounts.length) {
            lines.push(
                `  // Expected Result có giá trị tiền: assert theo SỐ, bỏ đơn vị.`,
                `  // "10.000đ" và "10.000 ₫" là CÙNG một giá trị — assert nguyên chuỗi là bắt test`,
                `  // biết cách trình bày của một dự án cụ thể (memory/semantic/money-comparison.md).`,
                `  const bodyText = await page.locator('body').innerText();`,
                `  const soTienTrenTrang = [...bodyText.matchAll(/-?\\d[\\d.,]*/g)]`,
                `    .map(m => Number(m[0].replace(/[.,](?=\\d{3}\\b)/g, '').replace(',', '.')))`,
                `    .filter(Number.isFinite);`,
                ...amounts.map(a => `  expect(soTienTrenTrang, 'không thấy giá trị ${a} trên trang').toContain(${a});`),
            );
            assertionNote = `assert ${amounts.length} giá trị tiền theo SỐ (bỏ đơn vị)`;
        } else {
            lines.push(
                `  // So khớp theo Expected Result (không có giá trị tiền trong đó).`,
                `  await expect(page.getByText(${JSON.stringify(expected)}, { exact: false })).toBeVisible();`,
            );
            assertionNote = "assert theo Expected Result nguyên văn";
        }
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
