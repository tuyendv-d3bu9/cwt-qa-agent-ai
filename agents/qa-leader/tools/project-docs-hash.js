// agents/qa-leader/tools/project-docs-hash.js
// Deterministic (no LLM) hash of every project-docs/ file's path + content, used
// to detect whether project-docs/ changed since the last knowledge distillation —
// avoids re-running the LLM-costly distillation skill on every workflow run when
// nothing actually changed (see skills/02b_project_knowledge_distillation.md).

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function hashProjectDocs(dir = "project-docs") {
    const files = [];

    async function walk(d) {
        for (const name of await readdir(d)) {
            if (name.startsWith(".") || name === "node_modules") continue;
            const full = path.join(d, name);
            const st = await stat(full);
            if (st.isDirectory()) await walk(full);
            else files.push(full);
        }
    }
    await walk(dir);
    files.sort(); // deterministic order regardless of OS readdir order

    const hash = createHash("sha256");
    for (const file of files) {
        const content = await readFile(file, "utf8").catch(() => "");
        hash.update(file.replace(/\\/g, "/") + "\n" + content + "\n");
    }
    return hash.digest("hex");
}
