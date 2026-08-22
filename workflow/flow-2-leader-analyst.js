// workflow/flow-2-leader-analyst.js
// Flow 2: QA Leader + QA Analyst
// Workflow is the orchestrator — it calls each agent node in sequence.
// Agents do NOT call each other.
//
// This flow OPENS the run (session) that flow-3 later continues: it is the entry point
// of the pipeline, so "phiên hiện tại" starts here. Re-running it with the same feature
// continues the same run; a different feature opens a new one (--new-run forces a new
// run even for the same feature). See agents/runtime/memory.js.
//
// Run:
//   node workflow/flow-2-leader-analyst.js "Task name to analyze" [--new-run]

// readFile/writeFile are used here only on the two hard-coded constants below
// (TASK_FILE, GAP_FILE) — no path here derives from LLM output, so the safe()
// containment check in tools.js adds nothing. Existence checks DO go through the
// registry (see the read_file call below) so there is one way to ask that question.
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { runSetup, runReview, trackProgress, distillUiFlows } from "../agents/qa-leader/index.js";
import { run as runAnalyst, CONTRACT as ANALYST_CONTRACT } from "../agents/qa-analyst/index.js";
import { runTool } from "../agents/runtime/tools.js";
import { loadState, markStep, startRun, currentRun, finishRun } from "../agents/runtime/memory.js";
import {
    parseGapReport, renderGapReport, answersToDecisions, confirmationLines,
} from "../agents/qa-leader/tools/gap-answers.js";
import { storeKnowledgeSection } from "../agents/qa-leader/tools/project-knowledge-store.js";
import { initDatabases } from "../agents/runtime/db.js";
import { runRoundLoop } from "../agents/runtime/loop.js";
import { requireInputs, verifyProduced } from "../agents/runtime/handover.js";
import * as P from "../agents/runtime/paths.js";

const MAX_ROUNDS = 3;
const GAP_FILE = P.GAP_REPORT;
const TASK_FILE = P.TASK_ASSIGNMENT;

const argv = process.argv.slice(2);
// Flags are stripped before joining, otherwise "--new-run" would end up inside the
// feature name and every invocation would look like a different feature.
const forceNewRun = argv.includes("--new-run");
const task =
    argv.filter(a => !a.startsWith("--")).join(" ") ||
    "Analyze Function D - Voucher Checkout";

// ── Create/migrate the databases before any agent runs ──────────
// Explicit here rather than lazily on first use, so the schema always exists and a
// first-time creation is something you can see in the log.
for (const { path, created } of initDatabases()) {
    if (created) console.log(`Created ${path}`);
}

// ── Read the clarification form, PER QUESTION ──────────────────
// This used to be `formAnswers = <whole file>`, which was then appended to
// task-assignment.md as prose. That could not tell an answered form from an untouched one,
// so an unanswered form went straight through and the pipeline carried on as though the
// conflicts had been resolved. Now the file is parsed (deterministically, no LLM) and each
// question's answer is a separate, checkable thing.
let gap = null;              // parsed form, or null when there is no form yet
let formAnswers = null;      // answered questions rendered for the prompt; null if none
const gapRes = await runTool("read_file", { path: GAP_FILE });
if (!gapRes.error) {
    gap = parseGapReport(gapRes.content);

    if (gap.total === 0) {
        // A form that parses to zero questions is a FORMAT problem, not "no questions".
        // Saying nothing here would look identical to "everything answered".
        console.warn(
            `\n>> ${GAP_FILE} tồn tại nhưng KHÔNG parse được câu hỏi nào.\n` +
            `   Định dạng phải là các khối "### GAP-nnn" với 4 trường (Vấn đề/Nguồn/Câu hỏi/Trả lời)\n` +
            `   — xem agents/qa-leader/skills/03_info_gap_reporting.md. File sẽ bị BỎ QUA.\n`
        );
    } else if (gap.unanswered.length > 0) {
        // STOP AGAIN, naming only what is still missing. Deliberately without re-running the
        // gap-check LLM call: re-generating the form would re-ask everything, throwing away
        // the answers already typed and costing a call to do it.
        console.log(`\n>> Còn ${gap.unanswered.length}/${gap.total} câu CHƯA trả lời trong ${GAP_FILE}:\n`);
        for (const q of gap.unanswered) {
            console.log(`   [${q.id}] ${q.question.replace(/\s+/g, " ").trim()}`);
        }
        if (gap.answered.length) {
            console.log(`\n   (${gap.answered.length} câu đã trả lời được giữ nguyên, không phải điền lại.)`);
        }
        // Rewrite the form preserving what was typed, so nothing the person wrote is lost.
        await writeFile(GAP_FILE, renderGapReport(gap.questions), "utf8");
        console.log(`\n   Trả lời nốt trong ${GAP_FILE} rồi chạy lại đúng lệnh này.\n`);
        process.exit(0);
    } else {
        // ── All answered: CONFIRM BACK, then make each answer durable ──
        console.log(`\nĐã nhận đủ ${gap.total}/${gap.total} câu trả lời. Tôi hiểu là:\n`);
        for (const line of confirmationLines(gap.answered)) console.log(line);

        const stampIso = new Date().toISOString();
        let stored = 0;
        for (const d of answersToDecisions(gap.answered, { stampIso })) {
            // tier 3, hand-editable, git owns the history. upsertSection splices by byte
            // range so anything the user edited by hand in this file survives untouched.
            const res = await storeKnowledgeSection({
                kind: "decision",
                status: "confirmed",
                title: d.title,
                content: d.content,
                sourceFile: GAP_FILE,
                sourceHash: d.sourceRef,
            });
            if (res.action !== "unchanged") stored++;
        }
        console.log(
            `\n   ${stored} câu trả lời đã ghi vào ${P.DECISIONS_LOG} thành tri thức bền ` +
            `→ lần sau KHÔNG bị hỏi lại.\n`
        );

        formAnswers = gap.answered
            .map(q => `- [${q.id}] ${q.question.trim()}\n  → ${q.answer.trim()}`)
            .join("\n");
    }
}

// ── Phiên hiện tại: mở run mới, hay tiếp tục run đang mở? ───────
// A run is continued only when it is still `active` AND for the same feature.
// A different feature is a different piece of work, so it gets its own run instead of
// appending to the previous one's steps — which is exactly what the old JSON backend
// did, silently mixing two features into one state file.
const runBefore = await currentRun();
const askPendingBefore = (await loadState()).steps.find(s => s.agent === "qa-analyst")?.status === "waiting_ask";
const canContinue = !forceNewRun && runBefore?.status === "active" && runBefore.feature === task;

if (canContinue) {
    console.log(`Tiếp tục run: ${runBefore.run_id}  (feature: "${task}")`);
} else {
    const why = forceNewRun ? "cờ --new-run"
        : !runBefore ? "chưa có phiên nào"
            : runBefore.feature !== task ? `feature khác với run trước ("${runBefore.feature ?? "chưa gán"}")`
                : `run trước đã đóng (status: ${runBefore.status})`;
    const opened = await startRun(task);
    console.log(`Run mới: ${opened.run_id}  (feature: "${task}") — ${why}.`);
    if (runBefore && askPendingBefore) {
        console.log(
            `  Lưu ý: run trước "${runBefore.run_id}" đang chờ ASK và KHÔNG được tiếp tục ở đây. ` +
            `Nó vẫn còn trong lịch sử (node agents/approve.js để xem); muốn tiếp tục nó thì chạy lại với đúng feature cũ.`
        );
    }
}

// ── Load persisted state of THIS run (agents/runtime/memory.js — single
// checkpoint mechanism for the whole pipeline) to know if resuming from an ASK pause ─
const savedState = await loadState();
const analystStep = savedState.steps.find(s => s.agent === "qa-analyst");

let startRound = 1;

if (analystStep?.status === "waiting_ask" && formAnswers) {
    // ── RESUME from ASK pause inside review loop ───────────────
    console.log(`Resuming review from round ${analystStep.round} after ASK…\n`);
    startRound = analystStep.round;

    // Hand the answers to the Analyst as STRUCTURED Q→A pairs, one per line, keyed by GAP id.
    // The old version pasted the entire gap-report file in here verbatim — questions,
    // instructions, HTML comments and all — so the Analyst had to work out for itself which
    // text was a question and which was an answer. And because every answer is now also
    // recorded in decisions-log.md, this append is only a convenience for THIS round, not
    // the place the knowledge lives.
    const current = await readFile(TASK_FILE, "utf8").catch(() => "");
    await writeFile(
        TASK_FILE,
        current +
        `\n\n## Người dùng đã xác nhận (sau ASK vòng ${analystStep.round})\n\n` +
        `> Đây là câu trả lời ĐÃ ĐƯỢC XÁC NHẬN cho các câu hỏi làm rõ. Dùng đúng những gì ghi ở đây,\n` +
        `> KHÔNG tự suy diễn thêm, và KHÔNG hỏi lại những điểm đã có câu trả lời.\n\n` +
        `${formAnswers}\n`,
        "utf8"
    );
} else {
    // ── FIRST RUN or RESUME from gap-check pause ───────────────
    console.log("Running QA Leader setup (steps 1-4)…");
    const setupResult = await runSetup({ task, formAnswers });

    if (setupResult.status === "not_started") {
        console.log(`\n>> project-docs/ is empty. Add project documentation and run again.`);
        process.exit(0);
    }

    if (setupResult.status === "waiting_input") {
        console.log(`\n>> Open ${setupResult.data.formPath}, answer each question, save the file, then run this command again.`);
        process.exit(0);
    }

    // status === "ready"

    // Distil the flow document into tier-3 knowledge BEFORE the analyst/designer run, because
    // both read `memory/project/ui-flows.md` and it does not exist until this runs.
    // Deterministic (no LLM) — ui-flow-parser.js already structured the document.
    // Also lifts `**Entry:**` into the tier-2 `base_url`, giving that config a documented
    // source instead of only `.env`.
    const flowDistill = await distillUiFlows();
    if (flowDistill.status === "ok") {
        console.log(`Luồng nghiệp vụ: ${flowDistill.flows} luồng → ${flowDistill.file}` +
            (flowDistill.sections ? ` (${flowDistill.sections} mục cập nhật)` : " (không đổi)"));
    } else {
        // Not fatal: a project may not have written the flow document yet. But it IS the
        // reason test-case Steps stay vague and automation has to invent the navigation, so
        // it must be visible rather than silently skipped.
        console.warn(
            `[luồng] Bỏ qua chưng cất luồng — ${flowDistill.reason}.\n` +
            `        Hệ quả: Steps của test case sẽ mơ hồ và qa-automation phải tự đoán đường đi.\n` +
            `        Viết ${P.UI_FLOW_DOC} bằng lời nghiệp vụ (xem hướng dẫn trong chính file đó).`
        );
    }

    await trackProgress("Task Assignment Done", "Task assigned to QA Analyst.");
    console.log("Setup complete. Starting analyst-review loop…\n");
}

// ── Round-retry loop (PASS/FIX/ASK) — shared by both the resume path and the
// first-run path via agents/runtime/loop.js's runRoundLoop (see TODO.md E.3;
// previously this was 2 near-identical hand-written for-loops here) ─────────
const result = await runRoundLoop({
    startRound,
    maxRounds: MAX_ROUNDS,
    produce: async (round) => {
        console.log(`[Round ${round}] Running QA Analyst…`);
        // Handover rule 3 (memory/README.md) — declared inputs checked before the call.
        await requireInputs(ANALYST_CONTRACT);
        const analystOut = await runAnalyst({ taskFile: TASK_FILE });
        if (analystOut.status !== "success") {
            console.error(`Analyst error:`, analystOut);
            process.exit(1);
        }
        const produced = await verifyProduced(ANALYST_CONTRACT);
        if (!produced.ok) {
            console.error(`Analyst báo success nhưng KHÔNG ghi output đã khai: ${produced.missing.join(", ")}`);
            process.exit(1);
        }
    },
    review: async (round) => {
        console.log(`[Round ${round}] Running QA Leader review…`);
        const out = await runReview({ round });
        console.log(`  Verdict: ${out.verdict}`);
        return out;
    },
    onAsk: async (round, reportMarkdown) => {
        await markStep("qa-analyst", { status: "waiting_ask", round, output: GAP_FILE });
        await writeFile(GAP_FILE, reportMarkdown, "utf8");
    },
    onPass: async (round) => {
        await markStep("qa-analyst", { status: "done", output: P.DELIVERABLE_ANALYST });
        await trackProgress("Completed", `PASS after ${round} round(s).`);
    },
    onFix: async (round, reportMarkdown) => {
        const taskContent = await readFile(TASK_FILE, "utf8");
        await writeFile(
            TASK_FILE,
            taskContent + `\n\n## Feedback round ${round} (FIX)\n${reportMarkdown}`,
            "utf8"
        );
    },
    onBlocked: async () => {
        await markStep("qa-analyst", { status: "blocked" });
        // The run is closed as `blocked`, not left `active`: a human has to step in, and
        // the next flow-2 invocation should open a fresh run rather than silently
        // resume one that already gave up.
        await finishRun("blocked");
        await trackProgress("Blocked", `Exceeded ${MAX_ROUNDS} FIX rounds — need human review.`);
    },
});

if (result.verdict === "ASK") {
    console.log(`\n>> Leader needs clarification. Open ${GAP_FILE}, answer the questions, then run this command again.`);
    process.exit(0);
}

if (result.verdict === "PASS") {
    console.log(
        `\n>> Done after ${result.round} round(s). Check memory/working/deliverable-analyst.md\n` +
        `   Cửa duyệt người: flow-3 sẽ CHẶN cho tới khi bạn đọc file trên rồi chạy\n` +
        `   node agents/approve.js qa-analyst "<tên bạn>"\n` +
        `   (bỏ cửa khi demo nhanh: flow-3 ... --no-gate)\n`
    );
    process.exit(0);
}

console.error(`\n>> Exceeded ${MAX_ROUNDS} FIX rounds. Human review required.`);
process.exit(1);
