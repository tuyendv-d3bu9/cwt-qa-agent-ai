// agents/qa-leader/tools/project-docs-hash.js
// Deterministic (no LLM) content hashing of project-docs/, used to decide WHAT needs
// re-distilling — see skills/02b_project_knowledge_distillation.md.
//
// This used to return ONE hash for the whole directory, which could only answer
// "did anything change?". That is not enough: it forced a full re-distillation of
// every fact, re-worded files that had not changed, and could not tell which
// downstream artifacts were affected. It now returns a hash PER FILE, so the caller
// can distill only the files that actually moved (TODO.update.md H.1/H.5).

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

function hashOne(relPath, content) {
    return createHash("sha256").update(relPath + "\n" + content + "\n").digest("hex");
}

/**
 * @returns {Promise<Record<string, string>>} map of posix relative path -> sha256
 */
export async function hashProjectDocsPerFile(dir = "project-docs") {
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

    const map = {};
    for (const file of files) {
        const rel = file.replace(/\\/g, "/");
        const content = await readFile(file, "utf8").catch(() => "");
        map[rel] = hashOne(rel, content);
    }
    return map;
}

/**
 * Single hash of the whole directory, derived from the per-file map so the two can
 * never disagree. Kept for the cheap "did anything at all change?" check.
 */
export async function hashProjectDocs(dir = "project-docs") {
    const map = await hashProjectDocsPerFile(dir);
    const hash = createHash("sha256");
    for (const rel of Object.keys(map).sort()) hash.update(rel + "\n" + map[rel] + "\n");
    return hash.digest("hex");
}

/**
 * Compare a previous per-file hash map against the current one.
 * A null/absent/legacy-shaped `previous` yields "everything is added", which is the
 * correct behaviour for a first run or after the manifest format changed.
 */
export function diffManifest(previous, current) {
    const prev = previous && typeof previous === "object" ? previous : {};
    const added = [];
    const changed = [];
    const removed = [];

    for (const [file, hash] of Object.entries(current)) {
        if (!(file in prev)) added.push(file);
        else if (prev[file] !== hash) changed.push(file);
    }
    for (const file of Object.keys(prev)) {
        if (!(file in current)) removed.push(file);
    }

    added.sort(); changed.sort(); removed.sort();
    return { added, changed, removed, unchangedCount: Object.keys(current).length - added.length - changed.length };
}
