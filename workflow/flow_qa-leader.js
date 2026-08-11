// workflow/flow-1-leader-only.js
// Flow 1 (current): only QA Leader is implemented.
// QA Analyst is currently a stub (see agents/qa-analyst/index.js)
// and will be replaced with the real Analyst in Flow 2.
//
// Run:
// node workflow/flow-1-leader-only.js "Task name"

import {
    readFile,
    access,
    mkdir,
    writeFile,
} from "node:fs/promises";

import { run as runLeader } from "../agents/qa-leader/index.js";

const task =
    process.argv.slice(2).join(" ") ||
    "Analyze Function D - Voucher Checkout";

const GAP_FILE = ".state/gap-report.md";
const SHARED_DIR = "shared";

let formAnswers = null;

try {
    await access(GAP_FILE);
    formAnswers = await readFile(GAP_FILE, "utf8");

    console.log(
        `Found ${GAP_FILE}. Using its content as the confirmed answers.\n`
    );
} catch {
    // First run: no gap report yet.
}

const result = await runLeader({ task, formAnswers });

console.log(JSON.stringify(result, null, 2));

// Publish public artifacts to the shared directory.
if (result.status === "success") {
    await mkdir(SHARED_DIR, { recursive: true });

    if (result.data?.sharedArtifacts) {
        for (const artifact of result.data.sharedArtifacts) {
            await writeFile(
                `${SHARED_DIR}/${artifact.fileName}`,
                artifact.content,
                "utf8"
            );
        }

        console.log(
            `\n>> Published ${result.data.sharedArtifacts.length} artifact(s) to ${SHARED_DIR}/`
        );
    }
}

if (result.status === "waiting_input") {
    console.log(
        `\n>> Open ${result.data.formPath}, answer each question directly below it, save the file, then run the same command again.`
    );
}

if (result.status === "not_started") {
    console.log(
        `\n>> project-docs/ is empty. Add project documentation and run the command again.`
    );
}