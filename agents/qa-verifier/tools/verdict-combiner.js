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
    /**
     * R2.4c — hỏng ở một bước GIỮA luồng, không phải ở assertion cuối.
     *
     * Đây là nhãn trả lời trực tiếp câu hỏi đã mở ra cả TODO.Update4:
     *   *"áp mã không thành công nhưng khách vẫn ấn thanh toán → thanh toán thành công.
     *     vậy chỗ áp mã chưa thành công thì xem ở đâu? đánh giá bằng cái gì?"*
     *
     * Xem ở đâu  : `.qa-run/evidence/<TC>/<NN-label>.jpg` của ĐÚNG bước đó
     * Đánh giá bằng: `expect()` của checkpoint tại chính bước đó, do Playwright ghi lại trong
     *                `result.steps[i].error`
     *
     * Khác `BEHAVIOR_MISMATCH` ở chỗ nó chỉ được ĐÚNG MỘT bước và ĐÚNG MỘT ảnh, thay vì
     * "test fail, xem ảnh màn hình cuối".
     */
    CHECKPOINT_FAILED: "CHECKPOINT_FAILED",
};

/**
 * Nhãn → cột `Kết quả` của bảng test case (R1.1).
 *
 * NĂM giá trị, không phải hai. Ép về OK/NG là nói dối hai lần:
 *   - `SPEC_ISSUE` thành NG  → báo nhầm bug cho dev, trong khi hỏng là ở TEST
 *   - `UNCLEAR`    thành OK  → false-green, đúng thứ oracle-problem.md tồn tại để chặn
 * Test không nằm trong lượt chạy (R4) không có nhãn → "N/A", KHÔNG để trống.
 */
export const RESULT_OF = {
    [LABELS.PASSED]: "OK",
    [LABELS.BEHAVIOR_MISMATCH]: "NG",
    [LABELS.CHECKPOINT_FAILED]: "NG",
    [LABELS.SPEC_ISSUE]: "RETEST",
    [LABELS.UNCLEAR]: "CẦN XÁC NHẬN",
};

/** Kết quả cho một test case KHÔNG nằm trong lượt chạy này. */
export const RESULT_NOT_RUN = "N/A";

/** @returns {string} giá trị cột `Kết quả`. Nhãn lạ thì NỔ, không đoán — xem deriveVerdict. */
export function resultOf(label) {
    if (label === null || label === undefined) return RESULT_NOT_RUN;
    const r = RESULT_OF[label];
    if (!r) throw new Error(
        `resultOf: nhãn "${label}" không có trong RESULT_OF. Thêm nhãn vào LABELS thì phải ánh xạ ` +
        `nó ở ĐÂY và ở deriveVerdict() cùng lúc — bỏ sót là một test case ra bảng với ô Kết quả trống.`);
    return r;
}

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

    // HỎNG Ở MỘT BƯỚC GIỮA LUỒNG — khác hẳn hỏng ở assertion cuối (R2.4c).
    //
    // `failedStepLabel` đến từ `result.steps[]` của Playwright, và nó CŨNG là tên file ảnh
    // (`stepShotLabel` trong runtime/paths.js). Nên chỗ này vừa nói được hỏng ở đâu, vừa chỉ
    // được đúng MỘT tấm ảnh — thay vì "test fail, xem ảnh màn hình cuối".
    if (testResult?.failedStepLabel) {
        return {
            label: LABELS.CHECKPOINT_FAILED,
            reason: `Hỏng ngay tại bước "${testResult.failedStepLabel}" (bước ${(testResult.failedStepIndex ?? 0) + 1}/${testResult.stepsStarted ?? "?"} đã bắt đầu), ` +
                `KHÔNG phải ở assertion cuối. Ảnh của đúng bước đó là bằng chứng. ` +
                `Các bước sau chưa từng chạy — đừng kết luận gì về chúng.`,
            channel: "functional+visual",
            failedStepLabel: testResult.failedStepLabel,
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

    // NHÃN LẠ THÌ NỔ, KHÔNG RƠI VỀ "PASS".
    //
    // Bản trước kết thúc bằng `return "PASS"` trần. Nghĩa là thêm một nhãn mới vào `LABELS` mà
    // quên sửa hàm này thì nhãn đó rơi xuống PASS — và với `CHECKPOINT_FAILED` (thêm ở chính
    // lượt sửa này) hậu quả là: **bước áp mã hỏng, hệ thống kết luận PASS**. Đúng cái false-green
    // mà oracle-problem.md tồn tại để chặn, chui vào qua đúng việc ta làm để CHỐNG false-green.
    //
    // Mặc định an toàn của một hệ QA không phải "qua" — mà là "dừng lại hỏi người".
    const known = new Set(Object.values(LABELS));
    const unknown = [...set].filter(l => !known.has(l));
    if (unknown.length) {
        throw new Error(
            `deriveVerdict: nhãn không có trong LABELS: ${unknown.join(", ")}. ` +
            `Thêm nhãn mới thì phải xử lý nó ở ĐÂY, ở RESULT_OF, ở danh sách bug candidate của ` +
            `qa-reporter, và ở checkNarrative() — cùng một lượt.`);
    }

    if (set.has(LABELS.UNCLEAR)) return "ASK";
    if (set.has(LABELS.BEHAVIOR_MISMATCH)) return "ASK";
    if (set.has(LABELS.CHECKPOINT_FAILED)) return "ASK";
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
/**
 * Chia ảnh của MỘT test case thành các BATCH để gửi cho VLM.
 *
 * ── VÌ SAO KHÔNG DỒN HẾT VÀO MỘT LỜI GỌI ──
 * `callVisionLLM` gộp `sha256` của MỌI ảnh vào MỘT khoá cache (runtime/llm.js). Một ảnh lệch
 * một pixel — animation chưa xong, con trỏ nhấp nháy — là cả lời gọi miss, trả tiền lại cho
 * toàn bộ ảnh. Ảnh chụp màn hình vốn không tất định, và quy trình này là chạy lại nhiều lần.
 * Chia batch thì đổi một ảnh chỉ hỏng một batch.
 * Cộng thêm: nhiều ảnh trong một lời gọi làm VLM nhầm "ảnh nào là bước nào", mà nhầm là
 * `confidence` tụt → `combine()` đẩy về UNCLEAR → cả test case thành "cần người xem".
 *
 * ── VÌ SAO KHÔNG PHẢI MỖI ẢNH MỘT LỜI GỌI ──
 * Câu hỏi "áp mã có thành công không" trả lời bằng SO SÁNH trước/sau. Một ảnh đơn lẻ không nói
 * được "tổng tiền đã đổi" — chính skill 03 đã ghi giới hạn đó. Nên đơn vị không phải "N ảnh"
 * mà là MỘT CÂU HỎI TRỌN VẸN: một cặp (trước, sau) neo vào một bước.
 *
 * Thứ tự ưu tiên khi phải cắt bớt: bước HỎNG trước (nơi câu trả lời nằm), rồi ảnh cuối
 * (trạng thái kết thúc), rồi các bước còn lại.
 *
 * @param {{images: Array<{path: string, label: string, n: number}>, failedStepLabel?: string|null, max?: number}} o
 * @returns {{batches: Array<{question: string, images: string[], labels: string[]}>, dropped: string[]}}
 */
export function planVisionBatches({ images = [], failedStepLabel = null, max = 3 } = {}) {
    const sorted = [...images].sort((a, b) => a.n - b.n);
    if (!sorted.length) return { batches: [], dropped: [] };

    const pairAt = (i, question) => {
        const chosen = i > 0 ? [sorted[i - 1], sorted[i]] : [sorted[i]];
        return { question, images: chosen.map(c => c.path), labels: chosen.map(c => c.label) };
    };

    const wanted = [];
    const seen = new Set();
    const push = (b) => {
        const key = b.labels.join("|");
        if (seen.has(key)) return;
        seen.add(key);
        wanted.push(b);
    };

    const failedAt = failedStepLabel ? sorted.findIndex(s => s.label === failedStepLabel) : -1;
    if (failedAt >= 0) {
        push(pairAt(failedAt, `Bước "${sorted[failedAt].label}" là bước HỎNG. Ảnh cuối là màn hình ngay tại lúc hỏng.`));
    }

    const last = sorted.length - 1;
    if (last >= 0) push(pairAt(last, `Trạng thái KẾT THÚC của luồng.`));

    // Còn chỗ thì lấp bằng các bước ở giữa, từ cuối về đầu (gần chỗ hỏng thường có ích hơn).
    for (let i = last - 1; i > 0 && wanted.length < max; i--) {
        push(pairAt(i, `Bước "${sorted[i].label}".`));
    }

    const batches = wanted.slice(0, max);
    const kept = new Set(batches.flatMap(b => b.labels));
    const dropped = sorted.map(s => s.label).filter(l => !kept.has(l));
    return { batches, dropped };
}

/**
 * Gộp kết quả nhiều batch thành MỘT kết luận thị giác cho test case.
 *
 * QUY TẮC BẮT BUỘC — theo luật "ảnh chỉ được HẠ CẤP kết luận" (oracle-problem.md):
 *   - `matches_expected = false` nếu BẤT KỲ batch nào nói false  (KHÔNG phải "đa số thắng")
 *   - `confidence` = THẤP NHẤT trong các batch
 *   - batch không parse được = `unreadable`, KHÔNG được bỏ qua
 *
 * Gộp kiểu đa số ở đây cho 2 batch tốt che 1 batch xấu — đúng cái false-green đang muốn diệt.
 */
export function mergeVisualBatches(parts) {
    const list = Array.isArray(parts) ? parts : [];
    if (!list.length) return null;

    const RANK = { high: 3, medium: 2, low: 1 };
    let matches = true;
    let confidence = "high";
    const details = [];
    const anomalies = [];
    const observed = {};

    for (const p of list) {
        if (!p) { matches = "unreadable"; details.push("một batch không trả về JSON đọc được"); continue; }
        const m = p.matches_expected;
        if (m === "unreadable" || m === null || m === undefined) {
            if (matches !== false) matches = "unreadable";
            if (p.mismatch_details) details.push(p.mismatch_details);
        } else if (m === false) {
            matches = false;                       // false thắng mọi thứ, kể cả unreadable
            if (p.mismatch_details) details.push(p.mismatch_details);
        }
        const c = String(p.confidence ?? "high").toLowerCase();
        if ((RANK[c] ?? 1) < (RANK[confidence] ?? 1)) confidence = c;
        for (const a of p.ui_anomalies ?? []) anomalies.push(a);
        Object.assign(observed, p.observed_values ?? {});
    }

    return {
        matches_expected: matches,
        mismatch_details: details.join(" · "),
        ui_anomalies: anomalies,
        observed_values: observed,
        confidence,
        batches: list.length,
    };
}

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
