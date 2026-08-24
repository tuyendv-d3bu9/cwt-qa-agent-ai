// agents/qa-automation/tools/spec-assertion-check.js
// Same role as qa-analyst/tools/count-check.js and qa-test-designer/tools/coverage-check.js:
// LLMs unreliably self-report whether a generated spec actually asserts anything.
// This tool enforces the oracle-problem.md hard rule deterministically —
// verdict must come from expect(), never from a screenshot alone.

const TRIVIAL_ASSERTIONS = [/expect\(true\)\.toBe\(true\)/, /expect\(1\)\.toBe\(1\)/];

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

/** Count non-trivial expect() calls in a spec file's content */
export function countRealAssertions(specContent) {
    return findAssertionCalls(specContent).filter(c => !TRIVIAL_ASSERTIONS.some(t => t.test(c))).length;
}

/** True if the spec takes a screenshot but never asserts anything */
export function isScreenshotOnly(specContent) {
    return /\.screenshot\(/.test(specContent) && countRealAssertions(specContent) === 0;
}

/**
 * Verify one generated spec file against the oracle-problem.md hard rule.
 * @returns {{ ok: boolean, tcId: string, assertionCount: number, issues: string[] }}
 */
export function verifySpec({ tcId, specContent }) {
    const assertionCount = countRealAssertions(specContent);
    const issues = [];

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