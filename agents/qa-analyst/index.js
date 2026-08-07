// agents/qa-analyst/index.js

import { runTool } from "../runtime/tools.js";

export async function run({ taskFile }) {
    const task = await runTool("read_file", { path: taskFile });

    const fakeDeliverable =
        `# [STUB] Deliverable gia lap\n\n` +
        `Day la output GIA, sinh boi QA Analyst STUB — KHONG phai phan tich that.\n` +
        `Se bi thay bang deliverable thuc khi Analyst that duoc xay o buoi sau.\n\n` +
        `## Task da nhan\n${task.content}\n`;

    await runTool("write_file", { path: ".state/deliverable.md", content: fakeDeliverable });
    return { status: "success", data: { deliverableFile: ".state/deliverable.md" }, error: null };
}