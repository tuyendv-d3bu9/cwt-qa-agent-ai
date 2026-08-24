// agents/runtime/tools.js
// Registry of generic FILE operations shared by all 6 agents. Every path passed in
// here goes through safe() — agents must never touch node:fs directly, because some
// paths come from LLM output (e.g. qa-leader's document classification mapping).
//
// TWO CALLERS, ONE REGISTRY:
//   1. JS code            -> runTool(name, args)          — how it has always worked
//   2. the LLM itself     -> declarationsFor([...]) fed to callLLM({tools}), and the
//                            agent loop calls runTool() with the args the model chose
// (2) is why every tool now carries `description` + `parameters` (JSON Schema). Without
// a schema a tool cannot be declared to Gemini at all, which is why agents/runtime/loop.js's
// old runAgent() had nothing real to offer and got deleted. safe() matters MORE under (2),
// not less: under (2) the path is chosen by a model, not written by a programmer.
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

// Shorthand for the overwhelmingly common shape: one required repo-relative path.
const pathParam = (what) => ({
  type: "object",
  properties: { path: { type: "string", description: `Đường dẫn tương đối từ gốc repo tới ${what}.` } },
  required: ["path"],
});

export const TOOLS = {
  list_files: {
    description: "Liệt kê đệ quy mọi file trong một thư mục (bỏ qua file/thư mục ẩn và node_modules). Dùng để biết có những tài liệu nào TRƯỚC KHI đọc, thay vì đọc bừa.",
    parameters: {
      type: "object",
      properties: { dir: { type: "string", description: "Thư mục cần liệt kê, tương đối từ gốc repo. Ví dụ: \"project-docs\"." } },
      required: ["dir"],
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
    description: "Đọc toàn bộ nội dung một file văn bản. Chỉ đọc file thật sự cần: nội dung trả về sẽ nằm trong hội thoại và tính vào chi phí token.",
    parameters: pathParam("file cần đọc"),
    async run({ path: p }) {
      const content = await readFile(safe(p), "utf8");
      return { path: p, chars: content.length, content };
    },
  },

  write_file: {
    description: "Ghi (ghi đè) nội dung văn bản vào một file, tự tạo thư mục cha nếu chưa có.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Đường dẫn file cần ghi, tương đối từ gốc repo." },
        content: { type: "string", description: "Nội dung đầy đủ sẽ GHI ĐÈ file. Không phải phần thêm vào." },
      },
      required: ["path", "content"],
    },
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
    description: "Di chuyển/đổi tên một file. Cả đường dẫn nguồn và đích đều bị kiểm tra phải nằm trong repo.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Đường dẫn hiện tại của file." },
        to: { type: "string", description: "Đường dẫn đích." },
      },
      required: ["from", "to"],
    },
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
    description: "Kiểm tra một đường dẫn có tồn tại hay không. Rẻ hơn read_file rất nhiều khi chỉ cần biết có/không — dùng cái này trước, đừng đọc file rồi bắt lỗi.",
    parameters: pathParam("đường dẫn cần kiểm tra"),
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
    description: "Xoá đúng MỘT file. Không xoá được thư mục (cố tình chặn). Hành động không hoàn tác được.",
    parameters: pathParam("file cần xoá"),
    async run({ path: p }) {
      await unlink(safe(p));
      return { ok: true, path: p };
    },
  },

  read_json: {
    description: "Đọc một file JSON và trả về đã parse sẵn. Dùng thay read_file khi file chắc chắn là JSON.",
    parameters: pathParam("file JSON cần đọc"),
    async run({ path: p }) {
      const content = await readFile(safe(p), "utf8");
      return { path: p, data: JSON.parse(content) };
    },
  },

  write_json: {
    description: "Ghi một object thành file JSON (thụt lề 2 space).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Đường dẫn file JSON cần ghi." },
        // NOTE: Gemini's schema dialect has no "any" type, so an object is declared here.
        // A top-level JSON array therefore cannot be written by the MODEL through this
        // tool — JS callers passing an array still work. Declaring a wrong-but-permissive
        // type would be worse: the model would emit arrays that silently fail validation.
        data: { type: "object", description: "Object sẽ được serialize. Mảng ở cấp cao nhất KHÔNG khai báo được ở đây — bọc vào một object có khoá." },
      },
      required: ["path", "data"],
    },
    async run({ path: p, data }) {
      const abs = safe(p);
      const content = JSON.stringify(data, null, 2);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return { ok: true, path: p, chars: content.length };
    },
  },
};

/**
 * Gemini functionDeclarations for a CHOSEN SUBSET of tools.
 *
 * A subset, never "all", on purpose: qa-analyst has no business calling delete_file, and
 * every extra declaration is prompt tokens spent on every turn of the loop. Each agent
 * declares the least it needs (same principle as step-planner.js's 8-tool MCP whitelist,
 * which replaced dumping all 60+ MCP tools into the prompt).
 *
 * Throws on an unknown name rather than skipping it — a typo'd tool name would otherwise
 * silently hand the agent fewer capabilities than its author intended.
 */
export function declarationsFor(names) {
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error("declarationsFor() cần một mảng tên tool không rỗng.");
  }
  return names.map((name) => {
    const tool = TOOLS[name];
    if (!tool) {
      throw new Error(`Tool "${name}" không có trong registry. Có: ${Object.keys(TOOLS).join(", ")}`);
    }
    return { name, description: tool.description, parameters: tool.parameters };
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
