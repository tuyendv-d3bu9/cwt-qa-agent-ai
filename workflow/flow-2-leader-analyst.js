// workflow/flow-2-leader-analyst.js
// Flow 2: QA Leader + QA Analyst
// Workflow is the orchestrator — it calls each agent node in sequence.
// Agents do NOT call each other.
//
// Run:
//   node workflow/flow-2-leader-analyst.js "Task name to analyze"

// readFile/writeFile are used here only on the two hard-coded constants below
// (TASK_FILE, GAP_FILE) — no path here derives from LLM output, so the safe()
// containment check in tools.js adds nothing. Existence checks DO go through the
// registry (see the read_file call below) so there is one way to ask that question.
import { readFile, writeFile } from "node:fs/promises";
import { runSetup, runReview, trackProgress } from "../agents/qa-leader/index.js";
import { run as runAnalyst, CONTRACT as ANALYST_CONTRACT } from "../agents/qa-analyst/index.js";
import { runTool } from "../agents/runtime/tools.js";
import { loadState, markStep } from "../agents/runtime/memory.js";
import { initDatabases } from "../agents/runtime/db.js";
import { runRoundLoop } from "../agents/runtime/loop.js";
import { requireInputs, verifyProduced } from "../agents/runtime/handover.js";

const MAX_ROUNDS = 3;
const GAP_FILE = "memory/working/gap-report.md";
const TASK_FILE = "memory/working/task-assignment.md";

const task =
    process.argv.slice(2).join(" ") ||
    "Analyze Function D - Voucher Checkout";

// ── Create/migrate the databases before any agent runs ──────────
// Explicit here rather than lazily on first use, so the schema always exists and a
// first-time creation is something you can see in the log.
for (const { path, created } of initDatabases()) {
    if (created) console.log(`Created ${path}`);
}

// ── Read gap-report if it exists (user's answers) ──────────────
// One read_file through the registry replaces the old access()+readFile() pair —
// absence shows up as res.error, so no separate existence probe is needed.
let formAnswers = null;
const gapRes = await runTool("read_file", { path: GAP_FILE });
if (!gapRes.error) {
    formAnswers = gapRes.content;
    console.log(`Found ${GAP_FILE} — using its content as confirmed answers.\n`);
}

// ── Load persisted state (agents/runtime/memory.js — single checkpoint
// mechanism for the whole pipeline) to know if resuming from an ASK pause ─
const savedState = await loadState();
const analystStep = savedState.steps.find(s => s.agent === "qa-analyst");

let startRound = 1;

if (analystStep?.status === "waiting_ask" && formAnswers) {
    // ── RESUME from ASK pause inside review loop ───────────────
    console.log(`Resuming review from round ${analystStep.round} after ASK…\n`);
    startRound = analystStep.round;

    // Append user's clarification to task-assignment so Analyst can re-read it
    const current = await readFile(TASK_FILE, "utf8").catch(() => "");
    await writeFile(
        TASK_FILE,
        current + `\n\n## User Clarification (after ASK round ${analystStep.round})\n${formAnswers}`,
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
        await markStep("qa-analyst", { status: "done", output: "memory/working/deliverable-analyst.md" });
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
        await trackProgress("Blocked", `Exceeded ${MAX_ROUNDS} FIX rounds — need human review.`);
    },
});

if (result.verdict === "ASK") {
    console.log(`\n>> Leader needs clarification. Open ${GAP_FILE}, answer the questions, then run this command again.`);
    process.exit(0);
}

if (result.verdict === "PASS") {
    console.log(`\n>> Done after ${result.round} round(s). Check memory/working/deliverable-analyst.md`);
    process.exit(0);
}

console.error(`\n>> Exceeded ${MAX_ROUNDS} FIX rounds. Human review required.`);
process.exit(1);
