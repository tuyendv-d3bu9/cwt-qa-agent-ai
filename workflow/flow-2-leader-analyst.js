// workflow/flow-2-leader-analyst.js
// Flow 2: QA Leader + QA Analyst
// Workflow is the orchestrator — it calls each agent node in sequence.
// Agents do NOT call each other.
//
// Run:
//   node workflow/flow-2-leader-analyst.js "Task name to analyze"

import { readFile, writeFile, mkdir, access, unlink } from "node:fs/promises";
import { runSetup, runReview, trackProgress } from "../agents/qa-leader/index.js";
import { run as runAnalyst } from "../agents/qa-analyst/index.js";

const MAX_ROUNDS = 3;
const GAP_FILE = ".state/gap-report.md";
const WORKFLOW_STATE_FILE = ".state/workflow-state.json";

const task =
    process.argv.slice(2).join(" ") ||
    "Analyze Function D - Voucher Checkout";

// ── State helpers ──────────────────────────────────────────────
async function saveState(state) {
    await mkdir(".state", { recursive: true });
    await writeFile(WORKFLOW_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function loadState() {
    try {
        return JSON.parse(await readFile(WORKFLOW_STATE_FILE, "utf8"));
    } catch {
        return null;
    }
}

async function clearState() {
    try { await unlink(WORKFLOW_STATE_FILE); } catch { /* ignore */ }
}

// ── Read gap-report if it exists (user's answers) ──────────────
let formAnswers = null;
try {
    await access(GAP_FILE);
    formAnswers = await readFile(GAP_FILE, "utf8");
    console.log(`Found ${GAP_FILE} — using its content as confirmed answers.\n`);
} catch {
    // first run
}

// ── Load persisted state to know if resuming from an ASK pause ─
const savedState = await loadState();

// ── RESUME from ASK pause inside review loop ───────────────────
if (savedState?.phase === "review" && formAnswers) {
    console.log(`Resuming review from round ${savedState.round} after ASK…\n`);

    // Append user's clarification to task-assignment so Analyst can re-read it
    const current = await readFile(".state/task-assignment.md", "utf8").catch(() => "");
    await writeFile(
        ".state/task-assignment.md",
        current + `\n\n## User Clarification (after ASK round ${savedState.round})\n${formAnswers}`,
        "utf8"
    );
    await clearState();

    for (let round = savedState.round; round <= MAX_ROUNDS; round++) {
        console.log(`[Round ${round}] Running QA Analyst…`);
        const analystOut = await runAnalyst({ taskFile: ".state/task-assignment.md" });
        if (analystOut.status !== "success") {
            console.error(`Analyst error:`, analystOut);
            process.exit(1);
        }

        console.log(`[Round ${round}] Running QA Leader review…`);
        const { verdict, reportMarkdown } = await runReview({ round });
        console.log(`  Verdict: ${verdict}`);

        if (verdict === "ASK") {
            await saveState({ phase: "review", round });
            await writeFile(GAP_FILE, reportMarkdown, "utf8");
            console.log(`\n>> Leader needs clarification. Open ${GAP_FILE}, answer the questions, then run this command again.`);
            process.exit(0);
        }

        if (verdict === "PASS") {
            await trackProgress("Completed", `PASS after ${round} round(s).`);
            console.log(`\n>> Done after ${round} round(s). Check .state/deliverable.md`);
            process.exit(0);
        }

        // FIX — append feedback for next analyst run
        const taskContent = await readFile(".state/task-assignment.md", "utf8");
        await writeFile(
            ".state/task-assignment.md",
            taskContent + `\n\n## Feedback round ${round} (FIX)\n${reportMarkdown}`,
            "utf8"
        );
    }

    await trackProgress("Blocked", `Exceeded ${MAX_ROUNDS} FIX rounds — need human review.`);
    console.error(`\n>> Exceeded ${MAX_ROUNDS} FIX rounds. Human review required.`);
    process.exit(1);
}

// ── FIRST RUN or RESUME from gap-check pause ───────────────────
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

for (let round = 1; round <= MAX_ROUNDS; round++) {
    console.log(`[Round ${round}] Running QA Analyst…`);
    const analystOut = await runAnalyst({ taskFile: ".state/task-assignment.md" });
    if (analystOut.status !== "success") {
        console.error(`Analyst error:`, analystOut);
        process.exit(1);
    }

    console.log(`[Round ${round}] Running QA Leader review…`);
    const { verdict, reportMarkdown } = await runReview({ round });
    console.log(`  Verdict: ${verdict}`);

    if (verdict === "ASK") {
        await saveState({ phase: "review", round });
        await writeFile(GAP_FILE, reportMarkdown, "utf8");
        console.log(`\n>> Leader needs clarification. Open ${GAP_FILE}, answer the questions, then run this command again.`);
        process.exit(0);
    }

    if (verdict === "PASS") {
        await trackProgress("Completed", `PASS after ${round} round(s).`);
        console.log(`\n>> Done after ${round} round(s). Check .state/deliverable.md`);
        process.exit(0);
    }

    // FIX — append feedback for next analyst run
    const taskContent = await readFile(".state/task-assignment.md", "utf8");
    await writeFile(
        ".state/task-assignment.md",
        taskContent + `\n\n## Feedback round ${round} (FIX)\n${reportMarkdown}`,
        "utf8"
    );
}

await trackProgress("Blocked", `Exceeded ${MAX_ROUNDS} FIX rounds — need human review.`);
console.error(`\n>> Exceeded ${MAX_ROUNDS} FIX rounds. Human review required.`);
process.exit(1);
