// agents/qa-verifier/tools/verdict-combiner.js
// Deterministic (NO LLM) combination of the two verification channels.
//
// THE RULE THIS ENCODES (agents/qa-automation/knowledge/oracle-problem.md):
//   expect()  answers "đúng hay sai"  -> the ONLY source of pass/fail
//   ảnh (VLM) answers "vì sao" and "có gì expect() không nhìn tới"
// The image can only DOWNGRADE a conclusion (pass -> needs a human look). It can never
// turn a failing test into a passing one, and never concludes pass by itself.
//
// Why code and not the LLM: the mapping is a fixed 5-row table. An LLM asked to "combine
// the two channels" would occasionally decide a failing test looks fine in the screenshot
// and call it passed — exactly the failure mode oracle-problem.md exists to prevent.
// Same reasoning as count-check.js / coverage-check.js.

/** Labels this node assigns per test case. */
export const LABELS = {
    PASSED: "PASSED",
    SPEC_ISSUE: "SPEC_ISSUE",
    BEHAVIOR_MISMATCH: "BEHAVIOR_MISMATCH",
    UNCLEAR: "UNCLEAR",
};

/**
 * @param {{status: string}} testResult - parsed Playwright result ("passed" | others)
 * @param {object|null} visual - JSON from skill 03, or null when no image was analysed
 * @returns {{label: string, reason: string, channel: "functional"|"functional+visual"}}
 */
export function combine(testResult, visual) {
    const passed = testResult?.status === "passed";

    // No visual channel for this test case (image missing, or the cost guard skipped it).
    // Fall back to the functional channel alone — the pre-existing behaviour.
    if (!visual) {
        return passed
            ? { label: LABELS.PASSED, reason: "expect() pass; không có phân tích ảnh cho test case này", channel: "functional" }
            : { label: LABELS.UNCLEAR, reason: "expect() fail và không có ảnh để phân loại nguyên nhân — cần người xem", channel: "functional" };
    }

    const match = visual.matches_expected;
    const unreadable = match === "unreadable" || match === null || match === undefined;
    const lowConfidence = String(visual.confidence ?? "").toLowerCase() === "low";

    // An image nobody can read decides nothing. It must not be treated as agreement.
    if (unreadable) {
        return {
            label: LABELS.UNCLEAR,
            reason: `Ảnh không đọc được kết luận (${visual.mismatch_details || "VLM không xác định được"}) — cần người xem`,
            channel: "functional+visual",
        };
    }

    if (passed) {
        if (match === true) {
            return lowConfidence
                ? { label: LABELS.UNCLEAR, reason: "expect() pass, ảnh khớp nhưng VLM tự đánh confidence thấp — cần người xem", channel: "functional+visual" }
                : { label: LABELS.PASSED, reason: "expect() pass và ảnh sau khi chạy khớp Expected Result", channel: "functional+visual" };
        }
        // FALSE-GREEN — the case the system was completely blind to before. The assertion
        // is green while the screen shows something else: either the assert is too loose,
        // or the UI is broken somewhere the assert does not look.
        return {
            label: LABELS.UNCLEAR,
            reason: `FALSE-GREEN: expect() pass nhưng ảnh KHÔNG khớp Expected Result (${visual.mismatch_details || "không nêu chi tiết"}). ` +
                `Nghĩa là assert quá lỏng, hoặc UI sai ở chỗ assert không nhìn tới — cần người xem.`,
            channel: "functional+visual",
        };
    }

    // Test failed. The image decides WHY, not whether.
    if (match === true) {
        return {
            label: LABELS.SPEC_ISSUE,
            reason: "expect() fail nhưng ảnh cho thấy sản phẩm hoạt động ĐÚNG Expected Result → spec/selector lỗi thời, không phải lỗi sản phẩm",
            channel: "functional+visual",
        };
    }
    return {
        label: LABELS.BEHAVIOR_MISMATCH,
        reason: `expect() fail và ảnh cho thấy sản phẩm SAI Expected Result (${visual.mismatch_details || "không nêu chi tiết"}) → nghi vấn bug thật, có ảnh làm evidence`,
        channel: "functional+visual",
    };
}

/**
 * Overall verdict from the per-test labels. Deterministic on purpose: the verdict drives
 * what the workflow does next (rerun automation vs stop for a human), so it must not
 * depend on how an LLM phrased its report.
 *
 * ASK before FIX: anything needing a human decision outranks a mechanical spec fix.
 */
export function deriveVerdict(labels) {
    const set = new Set(labels);
    if (set.has(LABELS.UNCLEAR)) return "ASK";
    if (set.has(LABELS.BEHAVIOR_MISMATCH)) return "ASK";
    if (set.has(LABELS.SPEC_ISSUE)) return "FIX";
    return "PASS";
}

/**
 * Which test cases deserve a (paid) vision call.
 *
 * Decision J.6: every FAILED test case, plus PASSED ones at High/Critical priority —
 * false-green matters most where money or the main flow is involved. `all: true` (CLI
 * --vlm-all) forces every test case.
 *
 * Returns the selection AND what was left out, so the report can say so instead of
 * implying every test case was visually checked.
 */
export function selectForVision(results, { all = false, priorities = ["critical", "high"] } = {}) {
    const wanted = [];
    const skipped = [];
    for (const r of results) {
        const failed = r.status !== "passed";
        const highPriority = priorities.includes(String(r.priority ?? "").toLowerCase());
        if (all || failed || highPriority) wanted.push(r);
        else skipped.push({ tcId: r.tcId, why: `pass và Priority=${r.priority ?? "?"} (không thuộc ${priorities.join("/")})` });
    }
    return { wanted, skipped };
}
