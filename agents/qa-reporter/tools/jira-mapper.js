// agents/qa-reporter/tools/jira-mapper.js
// Deterministic (KHÔNG dùng LLM) mapping từ bug draft / test case đã có sẵn sang
// payload Jira — tái dùng đúng pattern parse "field | value" table row đã có
// trong index.js's extractSeverity(), chỉ tổng quát hoá cho field bất kỳ.
// KHÔNG tự bịa field nào ngoài những gì đã có trong draft/test case gốc.

function extractField(draftMarkdown, fieldName) {
    const row = (draftMarkdown || "").split("\n")
        .find(l => new RegExp(`\\|\\s*${fieldName}\\s*\\|`, "i").test(l));
    if (!row) return "";
    const cells = row.split("|").map(c => c.trim());
    return cells[2] || "";
}

const SEVERITY_TO_JIRA_PRIORITY = { critical: "Highest", major: "High", minor: "Medium" };

/** Map 1 bug draft (markdown, output của skill 01_bug_report_writer.md) -> Jira issue payload. */
export function mapBugDraftToJiraIssue({ tcId, draftMarkdown, projectKey }) {
    const title = extractField(draftMarkdown, "Title") || `Bug liên quan ${tcId}`;
    const severity = (extractField(draftMarkdown, "Severity") || "").toLowerCase();
    const steps = extractField(draftMarkdown, "Steps to Reproduce");
    const actual = extractField(draftMarkdown, "Actual Result");
    const expected = extractField(draftMarkdown, "Expected Result");
    const environment = extractField(draftMarkdown, "Environment");

    const description =
        `Steps to Reproduce: ${steps}\n\n` +
        `Actual Result: ${actual}\n\n` +
        `Expected Result: ${expected}\n\n` +
        `Environment: ${environment}\n\n` +
        `[DRAFT do QA Reporter Agent sinh — chưa qua xác nhận con người. Nguồn: ${tcId}]`;

    return {
        projectKey,
        issueType: "Bug",
        summary: `[${tcId}] ${title}`,
        description,
        labels: [tcId.replace(/[^a-zA-Z0-9_-]/g, "-"), "ai-draft"],
        priority: SEVERITY_TO_JIRA_PRIORITY[severity], // undefined if severity unknown -> Jira project default applies
    };
}

/** Map 1 test case + verdict thật -> Jira issue payload (lưu test case + kết quả, không chỉ bug). */
export function mapTestCaseToJiraIssue({ testCase, verdict, projectKey }) {
    const description =
        `Precondition: ${testCase.Precondition}\n\n` +
        `Steps: ${testCase.Steps}\n\n` +
        `Test Data: ${testCase.TestData}\n\n` +
        `Expected Result: ${testCase.ExpectedResult}\n\n` +
        `Kết quả chạy thật: ${verdict}`;

    return {
        projectKey,
        issueType: "Task",
        summary: `[${testCase.TC_ID}] ${testCase.Title}`,
        description,
        labels: [testCase.TC_ID.replace(/[^a-zA-Z0-9_-]/g, "-"), "qa-test-case"],
    };
}
