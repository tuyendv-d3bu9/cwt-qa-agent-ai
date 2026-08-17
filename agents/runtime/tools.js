// agents/runtime/tools.js
// Registry of generic FILE operations shared by all 6 agents. Every path passed in
// here goes through safe() — agents must never touch node:fs directly, because some
// paths come from LLM output (e.g. qa-leader's document classification mapping).
//
// DELIBERATELY NOT IN THIS REGISTRY (không phải thiếu sót, đừng "sửa"):
//   - agents/runtime/mcp-client.js  — MCP tool list comes from mcpClient.listTools()
//                                     at runtime; it cannot be declared statically here.
//   - agents/runtime/jira-client.js — a service client with its own domain methods
//                                     (createIssue/addComment), not a generic file op.

import { readFile, writeFile, mkdir, readdir, stat, rename, unlink } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

// Containment check. NOTE: a plain `abs.startsWith(ROOT)` is NOT enough — it lets a
// sibling directory through (".../qa-agent-ai-evil" starts with ".../qa-agent-ai"),
// so the separator must be part of the comparison.
// Known limitation: symlinks are not resolved (path.resolve is purely lexical, and
// realpath() would fail on not-yet-existing write targets). This repo creates no
// symlinks; revisit if that ever changes.
function safe(p) {
  if (typeof p !== "string" || p.length === 0) throw new Error(`Invalid path: ${JSON.stringify(p)}`);
  const abs = path.resolve(ROOT, p);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    throw new Error(`Path out of project scope: ${p}`);
  }
  return abs;
}

export const TOOLS = {
  list_files: {
    async run({ dir }) {
      const out = [];
      async function walk(d) {
        for (const name of await readdir(d)) {
          if (name.startsWith(".") || name === "node_modules") continue;
          const full = path.join(d, name);
          const st = await stat(full);
          if (st.isDirectory()) await walk(full);
          else out.push({ path: path.relative(ROOT, full), size_bytes: st.size });
        }
      }
      await walk(safe(dir));
      return { count: out.length, files: out };
    },
  },

  read_file: {
    async run({ path: p }) {
      const content = await readFile(safe(p), "utf8");
      return { path: p, chars: content.length, content };
    },
  },

  write_file: {
    async run({ path: p, content }) {
      const abs = safe(p);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return { ok: true, path: p, chars: content.length };
    },
  },

  // Both ends validated. Exists because qa-leader's step2_classify() moves files to a
  // destination path produced by an LLM — doing that with a raw fs.rename() bypassed
  // safe() entirely and could write outside project-docs/.
  move_file: {
    async run({ from, to }) {
      const absFrom = safe(from);
      const absTo = safe(to);
      await mkdir(path.dirname(absTo), { recursive: true });
      await rename(absFrom, absTo);
      return { ok: true, from: path.relative(ROOT, absFrom), to: path.relative(ROOT, absTo) };
    },
  },

  // Returns exists:false instead of an error for a missing path, so callers stop
  // having to infer existence from read_file's error string or reach for fs.access().
  // An out-of-scope path is still an error, not "does not exist".
  file_exists: {
    async run({ path: p }) {
      const abs = safe(p);
      try {
        const st = await stat(abs);
        return { exists: true, isFile: st.isFile(), isDirectory: st.isDirectory(), size_bytes: st.size };
      } catch {
        return { exists: false, isFile: false, isDirectory: false, size_bytes: null };
      }
    },
  },

  // unlink() only — errors on a directory, which is the intended guard: no agent
  // should be able to remove a whole tree through this registry.
  delete_file: {
    async run({ path: p }) {
      await unlink(safe(p));
      return { ok: true, path: p };
    },
  },

  read_json: {
    async run({ path: p }) {
      const content = await readFile(safe(p), "utf8");
      return { path: p, data: JSON.parse(content) };
    },
  },

  write_json: {
    async run({ path: p, data }) {
      const abs = safe(p);
      const content = JSON.stringify(data, null, 2);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return { ok: true, path: p, chars: content.length };
    },
  },
};

export async function runTool(name, args) {
  if (!TOOLS[name]) return { error: `Not found tool name "${name}"` };
  try {
    return await TOOLS[name].run(args ?? {});
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
}
