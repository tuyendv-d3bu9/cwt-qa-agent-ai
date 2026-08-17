// agents/runtime/tool.js

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

function safe(p) {
  const abs = path.resolve(ROOT, p);
  if (!abs.startsWith(ROOT)) throw new Error(`Path out of project scope: ${p}`);
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
};

export async function runTool(name, args) {
  if (!TOOLS[name]) return { error: `Not found tool name "${name}"` };
  try {
    return await TOOLS[name].run(args ?? {});
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
}
