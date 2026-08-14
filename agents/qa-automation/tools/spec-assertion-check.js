// agents/qa-automation/tools/spec-assertion-check.js
// Same role as qa-analyst/tools/count-check.js and qa-test-designer/tools/coverage-check.js:
// LLMs unreliably self-report whether a generated spec actually asserts anything.
// This tool enforces the oracle-problem.md hard rule deterministically —
// verdict must come from expect(), never from a screenshot alone.

const TRIVIAL_ASSERTIONS = [/expect\(true\)\.toBe\(true\)/, /expect\(1\)\.toBe\(1\)/];

/** Count non-trivial expect() calls in a spec file's content */
export function countRealAssertions(specContent) {
    const calls = specContent.match(/expect\([^)]*\)(\s*\.\w+\([^)]*\))+/g) || [];
    return calls.filter(c => !TRIVIAL_ASSERTIONS.some(t => t.test(c))).length;
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

    return { ok: issues.length === 0, tcId, assertionCount, issues };
}

/** Verify a batch of generated specs at once, for the deliverable's Self Count Check */
export function verifyAllSpecs(specs) {
    const results = specs.map(verifySpec);
    const issues = results.flatMap(r => r.issues);
    return { ok: issues.length === 0, results, issues };
}