// agents/qa-analyst/tools/count-check.js
// LLMs often "self-report" incorrect counts (e.g., claiming ">=20 test ideas"
// when there are actually only 14). This tool counts the ACTUAL number.

const MIN_MISSING_RULES = 5;
const MIN_VIEWPOINTS = 4;
const MIN_TOTAL_IDEAS = 20;
// Not a quality bar — just "is there a summary here at all". Deliberately low: judging
// whether a summary is GOOD is not something a character count can do, and pretending
// otherwise would push the model to pad.
const MIN_SUMMARY_CHARS = 200;

/** Count actual data rows in markdown table (exclude header + separator) */
export function countMissingRules(missingRulesMarkdown) {
    const rows = missingRulesMarkdown
        .split("\n")
        .filter(l => l.trim().startsWith("|") && !l.includes("---") && !l.toLowerCase().includes("mô tả"));
    return rows.length;
}

/** Count viewpoints and test idea per viewpoint from skill 03 output.
 *  Handles two formats the LLM produces:
 *    A) Heading-per-viewpoint:  `### Viewpoint 1: Label` (or `### Viewpoint: Label`)
 *       with numbered list items (`1. …`) underneath.
 *    B) Markdown table with one row per viewpoint and semicolon-separated ideas in a cell.
 *  Tries A first; falls back to B when A finds nothing.
 */
export function countTestIdeas(viewpointsMarkdown) {
    // ── Format A: heading blocks ──────────────────────────────────────
    const blocks = viewpointsMarkdown.split(/###\s*Viewpoint\s*\d*\s*:/i).slice(1);
    if (blocks.length > 0) {
        const perViewpoint = blocks.map(block => {
            const ideas = block.match(/^\s*\d+\.\s/gm) || [];
            return ideas.length;
        });
        return {
            viewpointCount: perViewpoint.length,
            totalIdeas: perViewpoint.reduce((a, b) => a + b, 0),
            perViewpoint,
        };
    }

    // ── Format B: markdown table ──────────────────────────────────────
    // Each data row = 1 viewpoint; ideas are semicolon-separated inside a cell.
    const tableRows = viewpointsMarkdown
        .split("\n")
        .filter(l => l.trim().startsWith("|") && !l.includes("---") && !/tên viewpoint|viewpoint/i.test(l.split("|")[1] ?? ""));
    if (tableRows.length > 0) {
        const perViewpoint = tableRows.map(row => {
            // The last cell usually holds the ideas ("1. …; 2. …; 3. …")
            const cells = row.split("|").filter(c => c.trim());
            const ideasCell = cells[cells.length - 1] ?? "";
            const ideas = ideasCell.match(/\d+\.\s/g) || [];
            return ideas.length;
        });
        return {
            viewpointCount: perViewpoint.length,
            totalIdeas: perViewpoint.reduce((a, b) => a + b, 0),
            perViewpoint,
        };
    }

    return { viewpointCount: 0, totalIdeas: 0, perViewpoint: [] };
}

// ── Per-step gates ───────────────────────────────────────────────────
// Split out of verifyDeliverable() so agent-loop.js can gate EACH skill's output as it
// is produced, instead of only discovering a shortfall at the end when the deliverable is
// already assembled. Thresholds stay defined once, here.
//
// The issue text is written to be read BY THE MODEL (it goes straight into the next
// conversational turn), so it names the number found, the number required, and what to do
// — "Missing rules count: 3, required: 5" alone tells a model nothing about how to fix it.

/**
 * The Requirement Summary must actually contain something.
 *
 * Added after a real run produced a deliverable whose section 1 was COMPLETELY EMPTY —
 * the agent loop hit its step budget and returned before the model wrote any final text —
 * and section 4 still reported "Đạt đủ ngưỡng tối thiểu", because every threshold was
 * about rules/viewpoints/ideas and nothing looked at the summary at all. A self-check that
 * declares success over an empty section is worse than no self-check.
 *
 * @returns {{ok: boolean, chars: number, issues: string[]}}
 */
export function checkSummary(summaryMarkdown) {
    const text = String(summaryMarkdown ?? "").trim();
    const issues = [];
    if (text.length === 0) {
        issues.push(`Requirement Summary RỖNG — chưa có nội dung nào. Viết lại phần tóm tắt requirement.`);
    } else if (text.length < MIN_SUMMARY_CHARS) {
        issues.push(
            `Requirement Summary chỉ có ${text.length} ký tự, quá ngắn để là một bản tóm tắt requirement ` +
            `(cần tối thiểu ${MIN_SUMMARY_CHARS}). Viết đủ các phần mà skill yêu cầu.`
        );
    }
    return { ok: issues.length === 0, chars: text.length, issues };
}

/** @returns {{ok: boolean, count: number, issues: string[]}} */
export function checkMissingRules(missingRulesMarkdown) {
    const count = countMissingRules(missingRulesMarkdown);
    const issues = count < MIN_MISSING_RULES
        ? [`Chỉ có ${count} business rule còn thiếu, cần tối thiểu ${MIN_MISSING_RULES}. ` +
           `Bổ sung thêm ${MIN_MISSING_RULES - count} dòng nữa vào bảng, mỗi dòng là 1 rule THẬT SỰ ` +
           `thiếu/mơ hồ trong tài liệu — không thêm dòng cho đủ số.`]
        : [];
    return { ok: issues.length === 0, count, issues };
}

/** @returns {{ok: boolean, viewpointCount: number, totalIdeas: number, issues: string[]}} */
export function checkViewpoints(viewpointsMarkdown) {
    const { viewpointCount, totalIdeas, perViewpoint } = countTestIdeas(viewpointsMarkdown);
    const issues = [];
    if (viewpointCount < MIN_VIEWPOINTS) {
        issues.push(`Chỉ có ${viewpointCount} viewpoint, cần tối thiểu ${MIN_VIEWPOINTS}. Thêm viewpoint ở góc nhìn khác.`);
    }
    if (totalIdeas < MIN_TOTAL_IDEAS) {
        issues.push(
            `Tổng ${totalIdeas} test idea, cần tối thiểu ${MIN_TOTAL_IDEAS} ` +
            `(hiện mỗi viewpoint: ${perViewpoint.join(", ")}). Thiếu ${MIN_TOTAL_IDEAS - totalIdeas} idea. ` +
            `Giữ đúng định dạng "### Viewpoint <n>: <tên>" + danh sách "1. ", "2. " — ` +
            `sai định dạng thì bộ đếm không thấy idea nào và bản sửa vẫn bị coi là thiếu.`
        );
    }
    return { ok: issues.length === 0, viewpointCount, totalIdeas, issues };
}

/**
 * Verify deterministic toàn bộ deliverable trước khi ghi file.
 * Composed from the per-step gates above so there is exactly one definition of each rule.
 * @returns {{ ok: boolean, missingRuleCount: number, viewpointCount: number, totalIdeas: number, issues: string[] }}
 */
export function verifyDeliverable({ summaryMarkdown = null, missingRulesMarkdown, viewpointsMarkdown }) {
    const rules = checkMissingRules(missingRulesMarkdown);
    const views = checkViewpoints(viewpointsMarkdown);
    // `summaryMarkdown` is optional so the revision path (which re-parses an existing
    // deliverable) can skip it, but when given it is checked — an empty section 1 must not
    // be reported as passing.
    const summary = summaryMarkdown === null ? { ok: true, chars: null, issues: [] } : checkSummary(summaryMarkdown);
    return {
        ok: summary.ok && rules.ok && views.ok,
        summaryChars: summary.chars,
        missingRuleCount: rules.count,
        viewpointCount: views.viewpointCount,
        totalIdeas: views.totalIdeas,
        issues: [...summary.issues, ...rules.issues, ...views.issues],
    };
}