// agents/qa-analyst/tools/count-check.js
// LLMs often "self-report" incorrect counts (e.g., claiming ">=20 test ideas"
// when there are actually only 14). This tool counts the ACTUAL number.

const MIN_MISSING_RULES = 5;
const MIN_VIEWPOINTS = 4;
const MIN_TOTAL_IDEAS = 20;

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

/**
 * Verify deterministic toàn bộ deliverable trước khi ghi file.
 * @returns {{ ok: boolean, missingRuleCount: number, viewpointCount: number, totalIdeas: number, issues: string[] }}
 */
export function verifyDeliverable({ missingRulesMarkdown, viewpointsMarkdown }) {
    const missingRuleCount = countMissingRules(missingRulesMarkdown);
    const { viewpointCount, totalIdeas, perViewpoint } = countTestIdeas(viewpointsMarkdown);

    const issues = [];
    if (missingRuleCount < MIN_MISSING_RULES) {
        issues.push(`Missing rules count: ${missingRuleCount}, required: ${MIN_MISSING_RULES}.`);
    }
    if (viewpointCount < MIN_VIEWPOINTS) {
        issues.push(`Viewpoint count: ${viewpointCount}, required: ${MIN_VIEWPOINTS}.`);
    }
    if (totalIdeas < MIN_TOTAL_IDEAS) {
        issues.push(`Total test ideas: ${totalIdeas} (per viewpoint: ${perViewpoint.join(", ")}), required: ${MIN_TOTAL_IDEAS}.`);
    }

    return { ok: issues.length === 0, missingRuleCount, viewpointCount, totalIdeas, issues };
}