// agents/qa-reporter/tools/traceability-check.js
// Same role as the other agents' deterministic tools (count-check.js,
// coverage-check.js, spec-assertion-check.js): enforce traceability-rule.md's
// hard rule without trusting the LLM's own say-so — every bug report field must
// be either real content or an explicitly disclosed [CẦN BỔ SUNG] marker, never
// a silently empty or vague filler value.

const MISSING_MARKER = /\[CẦN BỔ SUNG/;
const VALID_SEVERITY = ["Critical", "Major", "Minor"];
const VALID_PRIORITY = ["High", "Medium", "Low"];

/** Parse a single bug draft's field table (from skill 01's markdown table output) into a record */
export function parseBugDraft(draftMarkdown) {
    const rows = draftMarkdown.split("\n")
        .filter(l => l.trim().startsWith("|") && !l.includes("---") && !/^\|\s*Trường/i.test(l.trim()));
    const record = {};
    for (const row of rows) {
        const [, field, value] = row.split("|").map(c => c.trim());
        if (field) record[field] = value ?? "";
    }
    return record;
}

/**
 * Verify one bug draft against traceability-rule.md.
 * @returns {{ ok: boolean, tcId: string, issues: string[] }}
 */
export function verifyBugDraft({ tcId, draftMarkdown }) {
    const record = parseBugDraft(draftMarkdown);
    const issues = [];
    const requiredFields = ["Title", "Environment", "Steps to Reproduce", "Actual Result", "Expected Result", "Severity", "Priority"];

    for (const field of requiredFields) {
        const value = record[field] ?? "";
        if (value.trim() === "") {
            issues.push(`${tcId}: trường "${field}" rỗng, không có cả [CẦN BỔ SUNG] marker.`);
        }
    }

    const severity = record["Severity"] ?? "";
    if (severity && !MISSING_MARKER.test(severity) && !VALID_SEVERITY.includes(severity.trim())) {
        issues.push(`${tcId}: Severity "${severity}" không thuộc {${VALID_SEVERITY.join(", ")}} và không phải [CẦN BỔ SUNG].`);
    }

    const priority = record["Priority"] ?? "";
    if (priority && !MISSING_MARKER.test(priority) && !VALID_PRIORITY.includes(priority.trim())) {
        issues.push(`${tcId}: Priority "${priority}" không thuộc {${VALID_PRIORITY.join(", ")}} và không phải [CẦN BỔ SUNG].`);
    }

    return { ok: issues.length === 0, tcId, issues };
}

/** Verify a batch of bug drafts at once, for the deliverable's Self Count Check */
export function verifyAllDrafts(drafts) {
    const results = drafts.map(verifyBugDraft);
    const issues = results.flatMap(r => r.issues);
    return { ok: issues.length === 0, results, issues };
}