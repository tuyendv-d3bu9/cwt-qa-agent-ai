// agents/qa-verifier/tools/parse-test-results.js
// Deterministic parse of Playwright's JSON reporter output — kept out of the LLM's
// hands so raw JSON isn't misread. NOTE: the exact nested shape of Playwright's
// JSON reporter (produced by `npx playwright test --reporter=json`) has not been
// verified against a real report in this repo yet — this walks the structure
// recursively (suites can nest suites) rather than assuming one fixed depth, so it
// degrades gracefully if the real shape differs slightly from what's assumed here.

/** Recursively collect all `spec` objects out of a Playwright JSON reporter tree */
function collectSpecs(node, specs = []) {
    if (!node || typeof node !== "object") return specs;
    if (Array.isArray(node.specs)) specs.push(...node.specs);
    if (Array.isArray(node.suites)) {
        for (const suite of node.suites) collectSpecs(suite, specs);
    }
    return specs;
}

/** Extract a TC_ID (e.g. TC-D-001) from a spec/test title, if present */
function extractTcId(title) {
    const match = /TC-D-\d{3}/.exec(title || "");
    return match ? match[0] : null;
}

/**
 * Parse a Playwright JSON reporter report into a flat, deterministic list.
 * @returns {Array<{ tcId: string|null, title: string, status: string, errorMessage: string|null }>}
 */
export function parseTestResults(reportJson) {
    const specs = collectSpecs(reportJson);
    const out = [];

    for (const spec of specs) {
        const title = spec.title || "";
        const tcId = extractTcId(title);
        for (const t of spec.tests || []) {
            for (const result of t.results || []) {
                out.push({
                    tcId,
                    title,
                    status: result.status || "unknown",
                    errorMessage: result.error?.message || null,
                });
            }
        }
    }

    return out;
}

/** Group parsed results by TC_ID for the deliverable's per-test-case table */
export function groupByTcId(parsedResults) {
    const byTcId = {};
    for (const r of parsedResults) {
        const key = r.tcId || `UNKNOWN:${r.title}`;
        (byTcId[key] ||= []).push(r);
    }
    return byTcId;
}