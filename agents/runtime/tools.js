import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Type } from "@google/genai";

const ROOT = process.cwd();

function safe(p) {
  const abs = path.resolve(ROOT, p);
  if (!abs.startsWith(ROOT)) throw new Error(`Path out of project scope: ${p}`);
  return abs;
}

export const TOOLS = {
  list_files: {
    declaration: {
      name: "list_files",
      description: "List all files in a directory (scan subdirectories too). Use to discover available documents.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          dir: { type: Type.STRING, description: "Directory path, e.g., project-docs" },
        },
        required: ["dir"],
      },
    },
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
    declaration: {
      name: "read_file",
      description: "Read content of a text file (md, csv, txt, json).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: "File path, e.g., project-docs/02_BA/BRD-Promotion-v1.2.md" },
        },
        required: ["path"],
      },
    },
    async run({ path: p }) {
      const content = await readFile(safe(p), "utf8");
      return { path: p, chars: content.length, content };
    },
  },

  write_file: {
    declaration: {
      name: "write_file",
      description: "Write content to a file. Automatically create directory if not exists. Use in the final step to save the result.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: "Target file path" },
          content: { type: Type.STRING, description: "Full content to write" },
        },
        required: ["path", "content"],
      },
    },
    async run({ path: p, content }) {
      const abs = safe(p);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return { ok: true, path: p, chars: content.length };
    },
  },
};

export function declarationsFor(names) {
  return names.map(n => {
    if (!TOOLS[n]) throw new Error(`Not found tool name "${n}"`);
    return TOOLS[n].declaration;
  });
}

export async function runTool(name, args) {
  if (!TOOLS[name]) return { error: `Not found tool name "${name}"` };
  try {
    return await TOOLS[name].run(args ?? {});
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
}
