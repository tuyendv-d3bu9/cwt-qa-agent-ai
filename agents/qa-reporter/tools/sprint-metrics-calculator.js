// agents/qa-reporter/tools/sprint-metrics-calculator.js
// Deterministic math for Sprint QA Report — LLMs are unreliable at exact
// arithmetic across variable-length inputs, so pass/fail rate and bug density
// are computed here, never left to the LLM to compute itself.

function round2(n) {
    return Math.round(n * 100) / 100;
}

/**
 * @param {Array<{Status: string, Label?: string}>} rows - parsed per-test rows (qa-verifier's table)
 * @param {number} totalTestCasesDesigned - total test cases from qa-test-designer's deliverable
 */
export function calculateSprintMetrics({ rows, totalTestCasesDesigned }) {
    const totalTests = rows.length;
    const passed = rows.filter(r => (r.Status || "").toLowerCase() === "passed").length;
    const failed = totalTests - passed;
    const bugCount = rows.filter(r => ["BEHAVIOR_MISMATCH", "UNCLEAR"].includes((r.Label || "").toUpperCase())).length;

    const passRate = totalTests > 0 ? round2((passed / totalTests) * 100) : 0;
    const failRate = totalTests > 0 ? round2((failed / totalTests) * 100) : 0;
    const bugDensity = totalTestCasesDesigned > 0 ? round2(bugCount / totalTestCasesDesigned) : 0;

    return { totalTests, passed, failed, passRate, failRate, bugDensity };
}

/** Last entry of sprint-history.json content (parsed array), or null if empty/missing */
export function getPreviousSprintMetrics(historyArray) {
    if (!Array.isArray(historyArray) || historyArray.length === 0) return null;
    return historyArray[historyArray.length - 1];
}

/** Append a new entry, returning a NEW array (does not mutate the input) */
export function appendSprintMetrics(historyArray, entry) {
    const safeHistory = Array.isArray(historyArray) ? historyArray : [];
    return [...safeHistory, entry];
}
