// agents/qa-test-designer/index.js
// Node: QA Test Designer — converts QA Analyst's viewpoints/test ideas into
// structured test cases for whatever feature the task assigns. Does not re-analyze requirements.

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { runAgentLoop } from "../runtime/agent-loop.js";
import { contextFor } from "../runtime/knowledge.js";
import { registerArtifact } from "../qa-leader/tools/impact-analysis.js";
import { artifactId } from "../runtime/db.js";
import { verifyDeliverable, parseTestCaseRows } from "./tools/coverage-check.js";
import * as P from "../runtime/paths.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const FRAMEWORKS = await readFile(new URL("./knowledge/framework-definitions.md", import.meta.url), "utf8");
const COVERAGE = await readFile(new URL("./knowledge/boundary-coverage-conventions.md", import.meta.url), "utf8");
// Project knowledge (memory/project/) — distilled from project-docs/, shared across nodes.
const DOMAIN = await readFile(new URL("../../memory/project/domain-facts.md", import.meta.url), "utf8");
const KNOWN_ISSUES = await readFile(new URL("../../memory/project/known-issues.md", import.meta.url), "utf8");
const CONVENTIONS_T1 = await readFile(new URL("../../memory/semantic/testing-conventions.md", import.meta.url), "utf8");
// Cross-node knowledge — read directly, not copied (see role.md "Cross-node").
const VIEWPOINTS = await readFile(new URL("../qa-analyst/knowledge/viewpoint-library.md", import.meta.url), "utf8");
const RISK_MATRIX = await readFile(new URL("../qa-leader/knowledge/task-management-conventions.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

// Cost of the last run(), printed at the end — measured, never claimed.
const stats = { llmCalls: 0, revisions: 0, promptTokens: 0, outputTokens: 0 };

const systemFor = (skillText, userText) =>
    // Tier 2 is QUERIED, not injected — see memory/README.md and knowledge.js.
    [ROLE, FACT, FRAMEWORKS, DOMAIN, KNOWN_ISSUES, COVERAGE, CONVENTIONS_T1, VIEWPOINTS, RISK_MATRIX, contextFor(userText), skillText]
        .filter(Boolean).join("\n\n");

/** Single-shot call. For the intermediate reasoning steps, whose output nothing can measure. */
async function askLLM(skillText, userText) {
    const res = await callLLM({
        system: systemFor(skillText, userText),
        contents: [{ role: "user", parts: [{ text: userText }] }],
    });
    stats.llmCalls++;
    stats.promptTokens += res.usage?.promptTokenCount ?? 0;
    stats.outputTokens += res.usage?.candidatesTokenCount ?? 0;
    return res.text;
}

/**
 * One step as an AGENT: the deterministic gate's failure is fed BACK so the model revises.
 *
 * WHY THIS EXISTS. `verifyDeliverable()` has always run — but its result was written into the
 * deliverable's "Self Count Check" section as a note for a human, so **the model that dropped
 * a test idea never saw that it had dropped one**. The run that revived this gate found 4
 * silently dropped test ideas; they stayed dropped, because nothing asked for them back.
 *
 * This is the same fix already applied to qa-analyst (P1.4a), whose comment reads: "this node
 * made 4 blind single-shot calls, and its count-check result was written into section 4 of the
 * deliverable as a note for a human — the model that produced the shortfall never saw it."
 * Four other nodes still had that shape; this is one of them.
 */
async function agentStep({ skillText, userText, selfCheck, label, maxRevisions = 2 }) {
    const out = await runAgentLoop({
        system: systemFor(skillText, userText),
        task: userText,
        selfCheck,
        maxRevisions,
        label,
    });

    stats.llmCalls += out.usage.llmCalls;
    stats.revisions += out.revisions;
    stats.promptTokens += out.usage.promptTokens;
    stats.outputTokens += out.usage.outputTokens;

    // Budget exhausted is REPORTED, never swallowed: a partial answer plus a loud warning
    // beats silently pretending the gate passed.
    if (!out.ok) {
        console.warn(`  [qa-test-designer/${label}] CHƯA ĐẠT (hết ngân sách: ${out.exhausted}) — ${out.issues.join(" ")}`);
    }
    return { text: out.text, ok: out.ok, issues: out.issues };
}

/**
 * Ghép deliverable cuối. Hai điều bản trước làm sai, đo được trên lần chạy thật 2026-08-24:
 *
 * 1. LỒNG HAI TÀI LIỆU. Skill 03 trả về một tài liệu đầy đủ (có `# Deliverable — QA Test
 *    Designer` và các mục `## 1..4` của riêng nó). Bọc thêm một `# Deliverable` + `## 1. Test
 *    Cases` bên ngoài cho ra file có HAI H1, và số mục đụng nhau: `## 1. Test Cases` rồi ngay
 *    dưới là `## 1. Coverage Strategy Map`.
 * 2. HAI MỤC "Self Count Check" NÓI NGƯỢC NHAU. Mục của LLM tự khai "All 21 test ideas are
 *    mapped… All 8 mandatory fields fully populated"; mục của tool ngay dưới nói "CHƯA ĐẠT".
 *    Người đọc không có cách nào biết mục nào là thước đo. Nên mục của tool được đặt tên
 *    tách biệt hẳn, luôn ở cuối, và nói rõ nó ĐO — còn mục kia là LLM TỰ KHAI.
 */
export function assembleDeliverable({ testCases, check }) {
    const checkSection = check.ok
        ? `Đạt đủ coverage (idea Analyst: ${check.ideaCount}, test case: ${check.testCaseCount}, blocked: ${check.blockedCount}).`
        : `**CHƯA ĐẠT** — ${check.issues.join(" ")}`;

    const body = String(testCases ?? "").trim();
    // LLM đã tự viết H1 thì không bọc thêm H1 nữa — dùng luôn thân nó.
    const hasOwnTitle = /^#\s+\S/.test(body);
    const head = hasOwnTitle ? `${body}\n` : `# Deliverable — QA Test Designer\n\n## 1. Test Cases\n${body}\n`;
    // Nếu LLM cũng tự viết mục self-count, nói rõ mục nào mới là số đo.
    const llmSelfClaim = /^##.*Self Count Check/im.test(body)
        ? `> Mục "Self Count Check" ở trên do LLM TỰ KHAI, chưa qua đo. Mục dưới đây là số đo thật.\n\n`
        : "";

    return `${head}\n---\n\n${llmSelfClaim}## Kiểm đếm bằng tool (coverage-check.js — deterministic)\n${checkSection}\n`;
}

// Tier-3 files this node consumes — used to record provenance of the test cases it
// produces. Kept next to the readFile calls above so the two cannot drift apart.
const KNOWLEDGE_FILES_READ = [
    P.DOMAIN_FACTS,
    P.KNOWN_ISSUES,
    // Added with P0.4: test-case Steps are now derived from the flow, so a change to the
    // flow document must be able to mark those test cases stale. Leaving it out would make
    // impact analysis silently miss the case "the app's navigation changed" — the very
    // change most likely to invalidate a test case's Steps.
    P.UI_FLOWS,
];

/**
 * TC_ID của mọi dòng trong bảng 8 trường. Deterministic, không LLM.
 *
 * Dùng LẠI parseTestCaseRows chứ không tự parse. Bản trước tự lọc mọi dòng `|` trong cả tài
 * liệu, nên nó đăng ký vào đồ thị truy vết 21 "test case" mang tên các dòng của bảng
 * Coverage Strategy Map ("Nhập mã voucher không tồn tại trong hệ thống", …) — rác bền trong
 * runs.db, và impact analysis sau đó trả lời sai câu "test case nào đã cũ".
 */
function extractTestCaseIds(testCaseMarkdown) {
    return [...new Set(parseTestCaseRows(testCaseMarkdown).map(r => r[0]).filter(Boolean))];
}

// Handover contract — see memory/README.md rule 3.
export const CONTRACT = {
    agent: "qa-test-designer",
    requires: [P.TASK_ASSIGNMENT, P.DELIVERABLE_ANALYST],
    produces: [P.DELIVERABLE_TEST_DESIGNER],
    inputs: { taskFile: "TASK_ASSIGNMENT", deliverableFile: "DELIVERABLE_ANALYST" },
};

export async function run({ taskFile, deliverableFile }) {
    const task = await runTool("read_file", { path: taskFile });
    const analystDeliverable = await runTool("read_file", { path: deliverableFile });

    // The navigation flow, read fresh (tier 3, distilled by qa-leader's distillUiFlows()).
    // Steps in the test-case table have to name steps that EXIST in this flow. Without it
    // this node emitted Steps like "Vào checkout / Nhập mã / Áp dụng" — three vague words —
    // and qa-automation then had to invent the entire navigation itself, once per test case.
    // Twenty-one independent inventions; 13 of the 21 generated specs ended up performing no
    // action at all.
    const flowKnowledge = await runTool("read_file", { path: P.UI_FLOWS });
    const flowSection = flowKnowledge.error
        ? `ui_flows=KHÔNG CÓ (${P.UI_FLOWS} chưa tồn tại — qa-leader chưa chưng cất tài liệu luồng).\n` +
          `Steps vẫn phải viết bằng lời nghiệp vụ rõ ràng, KHÔNG viết tắt kiểu "Vào checkout".\n`
        : `ui_flows=\n${flowKnowledge.content}\n\n` +
          `Steps của mỗi test case PHẢI bám vào các bước có thật trong ui_flows ở trên — dùng lại\n` +
          `cách diễn đạt của luồng. KHÔNG viết bước mơ hồ 3 từ, KHÔNG bịa bước không có trong luồng.\n`;

    const skill1 = await loadSkill("01_coverage_strategy.md");
    const strategy = await askLLM(skill1, `task=${task.content}\ndeliverable_analyst_content=${analystDeliverable.content}\n${flowSection}`);

    const skill2 = await loadSkill("02_boundary_generator.md");
    const boundarySets = await askLLM(skill2, `coverage_strategy_output=${strategy}`);

    // Step 3 is the one the gate can measure — it produces the test-case table itself.
    // Steps 1 and 2 stay single-shot: nothing deterministic can score a coverage strategy or
    // a boundary set, and a gate that cannot fail is worse than no gate (it reads as checked).
    const skill3 = await loadSkill("03_test_case_formatter.md");
    const gate = async (text) => {
        const c = verifyDeliverable({ deliverableAnalystMarkdown: analystDeliverable.content, testCaseMarkdown: text });
        return { ok: c.ok, issues: c.issues };
    };
    const formatted = await agentStep({
        skillText: skill3,
        userText: `coverage_strategy_output=${strategy}\nboundary_sets=${boundarySets}\n${flowSection}`,
        selfCheck: gate,
        label: "test-case-formatter",
    });
    const testCases = formatted.text;

    // Re-measured on the FINAL text: the number in the deliverable must describe what was
    // actually written, not what the last revision attempt happened to score.
    const check = verifyDeliverable({ deliverableAnalystMarkdown: analystDeliverable.content, testCaseMarkdown: testCases });
    const deliverable = assembleDeliverable({ testCases, check });

    await runTool("write_file", { path: P.DELIVERABLE_TEST_DESIGNER, content: deliverable });

    // Register each test case in the traceability graph, derived from the tier-3
    // knowledge files this node actually read. Without this, impact analysis stops at
    // the knowledge files and can never answer "which test cases went stale?".
    // Link is at FILE level, not section level, on purpose: this node reads whole files
    // and cannot honestly claim which individual section a test case came from.
    const knowledgeSources = KNOWLEDGE_FILES_READ.map(p => artifactId("knowledge-file", p));
    for (const tcId of extractTestCaseIds(testCases)) {
        registerArtifact({ kind: "testcase", ref: tcId, derivedFrom: knowledgeSources });
    }

    console.log(
        `  Chi phí: ${stats.llmCalls} LLM call, ${stats.revisions} lần tự sửa; ` +
        `token vào ${stats.promptTokens}, ra ${stats.outputTokens}.`
    );

    // Gate chưa đạt sau khi hết lượt sửa thì đây là một deliverable ĐÃ BIẾT là thiếu. Nó vẫn
    // được ghi ra (một bảng thiếu vài dòng còn dùng được, và cửa duyệt của người là chốt cuối),
    // nhưng phải nổi lên tận workflow qua `notes` — không chỉ nằm trong một mục của file mà
    // người có thể không đọc tới.
    const notes = check.ok ? [] : [`coverage-check CHƯA ĐẠT sau ${stats.revisions} lần tự sửa: ${check.issues.join(" ")}`];

    return {
        status: "success",
        data: { deliverableFile: P.DELIVERABLE_TEST_DESIGNER, coverageOk: check.ok, notes, cost: { ...stats } },
        error: null,
    };
}
