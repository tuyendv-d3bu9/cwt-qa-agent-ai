// agents/qa-automation/tools/testcase-exporter.js
// Deterministic (NO LLM) export of the 8-field test-case table into a data file that the
// generated specs load at run time.
//
// WHY — the spec generator used to inline literals into each .spec.ts (`.fill('SALE20')`).
// Changing one piece of test data then meant regenerating the spec, which means another
// MCP exploration and more LLM calls. With data in its own file, data changes cost
// nothing: same code, new values.
//
// The arithmetic stays in the spec's expect(): tier-2/decision #2 says the screenshot
// channel does not verify deltas, expect() does. So Expected Result is exported as text
// for the generator to turn into assertions, not as something the runtime interprets.

import { runTool } from "../../runtime/tools.js";
import { findTable } from "../../runtime/md-table.js";
import * as P from "../../runtime/paths.js";

export const DATA_PATH = P.TEST_CASE_DATA;

const FIELDS = ["TC_ID", "Title", "Precondition", "Steps", "Test Data", "Expected Result", "Priority", "Tags"];

/**
 * Đọc bảng test case do qa-test-designer sinh ra.
 *
 * CHỈ đọc bảng có tiêu đề `| TC_ID | …`. Bản trước lấy mọi dòng `|` trong cả tài liệu, nên
 * 21 dòng của bảng "Coverage Strategy Map" (5 cột) rơi vào `malformed` và index.js in ra 21
 * dòng lỗi giả — che đúng những dòng lỗi thật cần thấy. Xem agents/runtime/md-table.js.
 */
export function parseTestCaseTable(markdown) {
    const rows = [];
    const malformed = [];

    const table = findTable(markdown, { firstHeaderCell: /^TC[_\s-]?ID$/i });
    table.rows.forEach((values, idx) => {
        const id = values[0];
        if (!id) return;

        if (values.length !== FIELDS.length) {
            // Never silently accept a row with the wrong shape — a shifted column would
            // put Expected Result where Priority belongs.
            // `row` = thứ tự dòng TRONG BẢNG, không phải số dòng trong file: findTable() trả
            // về các dòng dữ liệu đã lọc. Gọi nó là `line` như trước là nói sai với người đọc
            // log, họ sẽ mở file rồi nhảy tới một dòng không liên quan.
            malformed.push({ row: idx + 1, cellCount: values.length, expected: FIELDS.length, id });
            return;
        }

        const row = {};
        FIELDS.forEach((f, i) => { row[f] = values[i]; });
        rows.push(row);
    });

    return { rows, malformed };
}

/** Split a "1. ... 2. ..." string into individual steps. */
export function splitSteps(stepsText) {
    return String(stepsText ?? "")
        .split(/\d+\.\s*/)
        .map(s => s.trim().replace(/^<br\s*\/?>|<br\s*\/?>$/gi, "").trim())
        .filter(Boolean);
}

/**
 * "voucher_code=SALE20, order_total=840000" -> { voucher_code: "SALE20", order_total: "840000" }
 * Anything that is not a key=value pair is preserved under `_raw` rather than dropped,
 * so a spec author can still see what the test case actually said.
 */
export function parseTestData(testDataText) {
    const text = String(testDataText ?? "").trim();
    if (!text) return { fields: {}, _raw: "" };

    const fields = {};
    const leftovers = [];
    for (const part of text.split(/[,;]|<br\s*\/?>/i)) {
        const chunk = part.trim();
        if (!chunk) continue;
        const m = /^([\w.\-]+)\s*[=:]\s*(.+)$/.exec(chunk);
        if (m) fields[m[1]] = m[2].trim().replace(/^["'`]|["'`]$/g, "");
        else leftovers.push(chunk);
    }
    return { fields, _raw: leftovers.join("; ") };
}

export function buildDataset(markdown) {
    const { rows, malformed } = parseTestCaseTable(markdown);
    const cases = rows.map(r => ({
        tcId: r.TC_ID,
        title: r.Title,
        precondition: r.Precondition,
        steps: splitSteps(r.Steps),
        data: parseTestData(r["Test Data"]),
        expected: r["Expected Result"],
        priority: r.Priority,
        tags: r.Tags,
    }));
    return { cases, malformed };
}

/**
 * Write tests/data/test-cases.json.
 * `malformed` rows are returned (and logged by the caller) instead of being written —
 * a half-parsed row would generate a wrong spec.
 */
export async function exportTestCases(markdown, path = DATA_PATH) {
    const { cases, malformed } = buildDataset(markdown);
    const res = await runTool("write_json", {
        path,
        data: { generatedFrom: P.DELIVERABLE_TEST_DESIGNER, count: cases.length, cases },
    });
    if (res.error) throw new Error(`Không ghi được ${path}: ${res.error}`);
    return { path, count: cases.length, malformed, cases };
}
