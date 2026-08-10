// workflow/flow-2-leader-analyst.js
// Luong 2: QA Leader + QA Analyst
// Run: node workflow/flow-2-leader-analyst.js "Task name to analyze"
import { readFile, access } from "node:fs/promises";
import { run as runLeader } from "../agents/qa-leader/index.js";

const task = process.argv.slice(2).join(" ") || "Analyze Function D - Voucher Checkout";
const GAP_FILE = ".state/gap-report.md";

let formAnswers = null;
try {
  await access(GAP_FILE);
  formAnswers = await readFile(GAP_FILE, "utf8");
  console.log(`Found ${GAP_FILE} — using its content as confirmed answers.\n`);
} catch {
  // first run
}

const result = await runLeader({ task, formAnswers });
console.log(JSON.stringify(result, null, 2));

if (result.status === "waiting_input") {
  console.log(`\n>> Open ${result.data.formPath}, answer each question directly below it, save the file, then run the same command again.`);
}
if (result.status === "success") {
  console.log(`\n>> Done after ${result.data.rounds} rounds. Check .state/deliverable.md for details.`);
}
if (result.status === "error") {
  console.log(`\n>> Error: ${result.error}`);
}
