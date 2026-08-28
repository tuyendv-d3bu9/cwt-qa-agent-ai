// agents/qa-verifier/tools/parse-test-results.js
// Deterministic parse of Playwright's JSON reporter output — kept out of the LLM's
// hands so raw JSON isn't misread.
//
// ── HÌNH DẠNG ĐÃ ĐƯỢC ĐỐI CHIẾU VỚI BÁO CÁO THẬT (2026-08-27) ──
// Chú thích cũ ở đây tự khai là "chưa từng đối chiếu với report thật". Giờ đã đối chiếu, bằng
// cách chạy Playwright thật trên một spec không chạm mạng. Đo được:
//
//   result keys : workerIndex, parallelIndex, status, duration, error, errors, stdout,
//                 stderr, retry, steps, startTime, annotations, attachments, errorLocation
//   step  keys  : title, duration, và error CHỈ KHI bước đó hỏng
//
// BA điều quyết định thiết kế, không đoán được nếu không chạy:
//
//   1. `expect()` KHÔNG bọc trong `test.step()` thì KHÔNG xuất hiện trong `steps[]`.
//      Nên spec phải tự bọc — xem `withShot()` trong tests/steps/_evidence.ts.
//   2. `steps[]` chỉ chứa bước ĐÃ BẮT ĐẦU. Bước nằm sau chỗ hỏng VẮNG MẶT hẳn, chứ không phải
//      có mặt với `error` rỗng. Nên `findIndex(s => s.error)` là cách đúng để tìm bước hỏng,
//      và `steps.length` cho biết luồng đi được tới đâu.
//   3. `error.message` chứa mã màu ANSI (`[2m…`). Đưa thẳng vào báo cáo markdown là ra
//      một mớ ký tự rác — phải bóc.
//
// Vẫn duyệt đệ quy (suite lồng suite) thay vì giả định một độ sâu cố định.

/** Recursively collect all `spec` objects out of a Playwright JSON reporter tree */
function collectSpecs(node, specs = []) {
    if (!node || typeof node !== "object") return specs;
    if (Array.isArray(node.specs)) specs.push(...node.specs);
    if (Array.isArray(node.suites)) {
        for (const suite of node.suites) collectSpecs(suite, specs);
    }
    return specs;
}

/**
 * Extract a TC_ID from a spec/test title.
 *
 * Mẫu CHUNG `TC-<mã feature>-<số>`, không phải `TC-D-\d{3}`. Bản trước khoá cứng chữ "D" và
 * đúng 3 chữ số, nên một dự án đặt `TC-P-0001` sẽ cho `tcId = null` → mọi kết quả rơi vào nhóm
 * `UNKNOWN:<title>` → verifier không ghép được với test case nào, và không có gì báo lỗi.
 * `qa-reporter/index.js` đã sửa đúng lỗi này cho chỗ của nó và ghi lại lý do; đây là chỗ còn
 * sót. Quy ước mã: memory/semantic/testing-conventions.md.
 */
function extractTcId(title) {
    const match = /\bTC-[A-Za-z0-9]+-\d+\b/.exec(title || "");
    return match ? match[0] : null;
}

/**
 * Bóc mã màu ANSI khỏi thông điệp lỗi của Playwright.
 * Không bóc thì báo cáo markdown nhận nguyên `[2mexpect([22m…`.
 */
export function stripAnsi(text) {
    // eslint-disable-next-line no-control-regex
    return String(text ?? "").replace(/\[[0-9;]*m/g, "");
}

/**
 * Bước nào trong luồng đã hỏng.
 *
 * @returns {{steps: Array<{n:number,label:string,failed:boolean,durationMs:number}>,
 *            failedStepIndex: number, failedStepLabel: string|null, stepsStarted: number}}
 *   `failedStepIndex` là chỉ số 0-based trong `steps[]`, `-1` khi không bước nào hỏng
 *   (test qua, hoặc hỏng ngoài mọi `test.step` — ví dụ ở assertion cuối spec).
 */
export function parseSteps(result) {
    const raw = Array.isArray(result?.steps) ? result.steps : [];
    const steps = raw.map((s, i) => ({
        n: i,
        label: String(s?.title ?? ""),
        failed: Boolean(s?.error),
        durationMs: Number(s?.duration ?? 0),
        errorMessage: s?.error?.message ? stripAnsi(s.error.message) : null,
    }));
    const failedStepIndex = steps.findIndex(s => s.failed);
    return {
        steps,
        failedStepIndex,
        failedStepLabel: failedStepIndex >= 0 ? steps[failedStepIndex].label : null,
        stepsStarted: steps.length,
    };
}

/**
 * Parse a Playwright JSON reporter report into a flat, deterministic list.
 * @returns {Array<{ tcId, title, status, errorMessage, steps, failedStepIndex, failedStepLabel, stepsStarted }>}
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
                    errorMessage: result.error?.message ? stripAnsi(result.error.message) : null,
                    // R2.4c: "hỏng ở BƯỚC nào" — thứ mà bản trước vứt đi, và là toàn bộ căn cứ
                    // của nhãn CHECKPOINT_FAILED.
                    ...parseSteps(result),
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