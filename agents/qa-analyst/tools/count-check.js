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

/** Count viewpoints and test idea per viewpoint from skill 03 output */
export function countTestIdeas(viewpointsMarkdown) {
    const blocks = viewpointsMarkdown.split(/###\s*Viewpoint:/i).slice(1);
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