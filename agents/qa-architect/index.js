// agents/qa-architect/index.js
// Node: QA Architect — node duy nhất mà sản phẩm của nó là MỘT NODE KHÁC.
//
// LUỒNG: mô tả của người → LLM viết BẢN KHAI (JSON) → kiểm bản khai bằng code → sinh file
// bằng code → kiểm lại thật (node --check + import thử + CONTRACT + đã-nối-dây).
//
// LLM CHỈ VIẾT BẢN KHAI. Nó không viết `index.js`, không chọn đường dẫn, không viết
// `CONTRACT`. Cùng ranh giới đã gỡ được lỗi P4: LLM viết `.feature` (nội dung), code sinh
// `.spec.ts` (cấu trúc). Trước đó LLM viết cả file spec và 13/21 file sinh ra không thực
// hiện hành động nào — mà vẫn trông như đã xong.

import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runTool } from "../runtime/tools.js";
import { runAgentLoop } from "../runtime/agent-loop.js";
import { discoverNodes, validateContract } from "../runtime/node-registry.js";
import { validateSpec, emitNode, insertPathsExport, pathsExportName, deliverableFileName } from "./tools/node-emitter.js";
import { checkWiring } from "./tools/wiring-check.js";
import * as P from "../runtime/paths.js";

const execFileAsync = promisify(execFile);

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const ANATOMY = await readFile(new URL("./knowledge/node-anatomy.md", import.meta.url), "utf8");
const CONTRACT_DOC = await readFile(new URL("../_qa-template/contract.md", import.meta.url), "utf8");
const SKILL = await readFile(new URL("./skills/01_node_spec_writer.md", import.meta.url), "utf8");

const PATHS_FILE = "agents/runtime/paths.js";

// `produces` để RỖNG có chủ ý: đầu ra là `agents/<tên>/...`, chỉ biết được sau khi biết node
// tên gì, nên `verifyProduced()` không kiểm được nó. Bù lại bằng kiểm chặt hơn ở cuối run():
// `node --check` + import thử + validateContract + checkWiring.
export const CONTRACT = {
    agent: "qa-architect",
    requires: [],
    produces: [],
    inputs: {},
};

/**
 * Từ vựng BỊ CHẶN cho `reads`: mọi export chuỗi trong paths.js.
 * Cùng cơ chế `stepCatalogue()` của qa-automation — LLM chỉ được chọn trong danh sách có
 * thật, nên nó không thể bịa một đường dẫn không ai ghi.
 */
export function pathsCatalogue(paths = P) {
    return Object.entries(paths)
        .filter(([, v]) => typeof v === "string")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `- ${k} → ${v}`)
        .join("\n");
}

/** Node đang có + hợp đồng của chúng, để LLM không thiết kế trùng việc. */
export function nodeCatalogue(nodes) {
    return [...nodes.values()].map(n => {
        const c = n.contract;
        return `- ${n.name}: đọc [${(c.requires ?? []).join(", ") || "—"}] → ghi [${(c.produces ?? []).join(", ") || "—"}]`;
    }).join("\n");
}

/** JSON từ LLM: bóc khỏi dấu ``` nếu có, trả `null` khi không parse được (không throw). */
function parseJSON(text) {
    const raw = String(text ?? "").trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
    const body = fenced ? fenced[1] : raw;
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
        return JSON.parse(body.slice(start, end + 1));
    } catch {
        return null;
    }
}

/**
 * @param {object} o
 * @param {string} o.description  mô tả của người dùng
 * @param {boolean} [o.dryRun]    in ra thứ SẼ ghi, không ghi gì
 */
export async function run({ description, dryRun = false } = {}) {
    if (!description || !String(description).trim()) {
        return { status: "error", data: null, error: "Thiếu mô tả node cần sinh." };
    }

    const { nodes } = await discoverNodes();
    const existing = [...nodes.keys()];

    const task =
        `mo_ta=\n${description}\n\n` +
        `node_da_co=\n${nodeCatalogue(nodes)}\n\n` +
        `duong_dan_co_san=\n${pathsCatalogue()}\n`;

    let spec = null;
    const res = await runAgentLoop({
        system: [ROLE, ANATOMY, CONTRACT_DOC, SKILL].join("\n\n"),
        task,
        label: "qa-architect",
        maxRevisions: 2,
        // Cửa tự kiểm THẬT: bản khai sai bị trả lại kèm đúng chỗ sai, và vòng lặp sửa lại.
        // Đây là lý do dùng runAgentLoop thay vì gọi LLM một phát rồi tin.
        selfCheck: async (text) => {
            const parsed = parseJSON(text);
            if (!parsed) {
                return { ok: false, issues: ["Không parse được JSON. Trả về ĐÚNG một object JSON, không kèm giải thích."] };
            }
            const problems = validateSpec(parsed, { existingNodes: existing });
            if (problems.length) return { ok: false, issues: problems };
            spec = parsed;
            return { ok: true };
        },
    });

    if (!spec) {
        return {
            status: "error",
            data: { cost: res.usage },
            error: `Bản khai node không đạt sau ${res.revisions} lần sửa (${res.exhausted ?? "?"}):\n` +
                (res.issues ?? []).map(i => `  - ${i}`).join("\n"),
        };
    }

    const files = emitNode(spec);
    const report = [];
    report.push(`Node: ${spec.name} — ${spec.title}`);
    if (spec.overlaps) report.push(`Trùng việc: ${spec.overlaps}`);
    if (spec.notes) report.push(`Ghi chú: ${spec.notes}`);
    report.push("");

    if (dryRun) {
        report.push(`--dry-run: KHÔNG ghi gì. Sẽ ghi ${Object.keys(files).length} file:`);
        for (const [path, content] of Object.entries(files)) {
            report.push(`  ${path}   (${content.length} ký tự)`);
        }
        report.push(`  ${PATHS_FILE}   (+1 export: ${pathsExportName(spec.name)} → ${P.DELIVERABLES_DIR}/${deliverableFileName(spec.name)})`);
        return { status: "success", data: { spec, files: Object.keys(files), report: report.join("\n"), cost: res.usage }, error: null };
    }

    // ── Ghi file ──────────────────────────────────────────────────────
    for (const [path, content] of Object.entries(files)) {
        const w = await runTool("write_file", { path, content });
        if (w.error) return { status: "error", data: null, error: `Không ghi được ${path}: ${w.error}` };
        report.push(`  đã ghi  ${path}`);
    }

    // ── Đường dẫn đầu ra vào paths.js — MỘT nguồn duy nhất ────────────
    const pathsSrc = await runTool("read_file", { path: PATHS_FILE });
    if (pathsSrc.error) return { status: "error", data: null, error: `Không đọc được ${PATHS_FILE}: ${pathsSrc.error}` };
    const ins = insertPathsExport(pathsSrc.content, spec.name);
    if (ins.added) {
        const w = await runTool("write_file", { path: PATHS_FILE, content: ins.content });
        if (w.error) return { status: "error", data: null, error: `Không ghi được ${PATHS_FILE}: ${w.error}` };
        report.push(`  đã thêm ${PATHS_FILE}: export ${ins.exportName} → ${ins.path}`);
    } else {
        report.push(`  ${PATHS_FILE}: export ${ins.exportName} đã có sẵn`);
    }

    // ── KIỂM THẬT: đây là chỗ phân biệt "đã sinh" với "chạy được" ──────
    report.push("", "Kiểm sau khi sinh:");
    const checks = [];

    for (const path of Object.keys(files).filter(p => p.endsWith(".js"))) {
        try {
            await execFileAsync(process.execPath, ["--check", path]);
            checks.push([true, `node --check ${path}`]);
        } catch (err) {
            checks.push([false, `node --check ${path}: ${String(err.stderr ?? err.message).split("\n")[0]}`]);
        }
    }

    // Import THỬ THẬT. Đây là kiểm duy nhất bắt được lỗi kiểu template cũ
    // (`module.exports` trong package ESM) — không test tĩnh nào thấy nó.
    let imported = null;
    try {
        const { nodes: after, broken } = await discoverNodes();
        imported = after.get(spec.name);
        const brokenSelf = broken.find(b => b.name === spec.name);
        if (brokenSelf) {
            checks.push([false, `import thử: ${brokenSelf.problems.join(" | ")}`]);
        } else if (!imported) {
            checks.push([false, `import thử: node không xuất hiện trong registry (thiếu role.md?)`]);
        } else {
            checks.push([true, `import thử + CONTRACT hợp lệ (entry: ${imported.entry})`]);
        }
    } catch (err) {
        checks.push([false, `import thử nổ: ${err.message}`]);
    }

    // ── Cửa gác 0-BUG: sinh xong mà không luồng nào gọi thì KHÔNG phải xong ──
    const { loadFlows } = await import("../../workflow/flow-file.js");
    const flows = await loadFlows();
    const wiring = checkWiring({ name: spec.name, flows });
    checks.push([wiring.wired, wiring.report]);

    for (const [ok, line] of checks) report.push(`  ${ok ? "OK  " : "CHƯA"}  ${line}`);

    const hardFail = checks.slice(0, -1).some(([ok]) => !ok);

    if (spec.needsDeterministicTools?.length) {
        report.push(
            "",
            `CÒN THIẾU ${spec.needsDeterministicTools.length} TOOL DETERMINISTIC — node chạy được nhưng đầu ra chưa có gì kiểm:`,
            ...spec.needsDeterministicTools.map(t => `  agents/${spec.name}/tools/${t.file} — ${t.what}`),
            `Khung đã được sinh và CỐ Ý NỔ khi bị gọi, để "chưa viết" không im lặng thành "không có vấn đề".`,
        );
    }

    return {
        status: hardFail ? "error" : "success",
        data: {
            spec,
            files: Object.keys(files),
            wired: wiring.wired,
            missingTools: (spec.needsDeterministicTools ?? []).map(t => t.file),
            report: report.join("\n"),
            cost: res.usage,
        },
        error: hardFail ? "Node đã sinh nhưng KHÔNG qua được kiểm sau khi sinh — xem báo cáo." : null,
    };
}
