// workflow/flow-file.js
// Đọc + KIỂM file luồng khai báo `flows/*.flow.yml`. Không chạy gì — `flow-runner.js` chạy.
//
// ── FILE LUỒNG LÀ GÌ, VÀ KHÔNG LÀ GÌ ────────────────────────────────────
// LÀ: thứ tự các node · cửa duyệt của người · điều kiện dừng · tham số truyền vào.
// KHÔNG LÀ: một ngôn ngữ lập trình. Không có biến, biểu thức, vòng lặp tuỳ ý.
//
// Đây là ranh giới cố ý. Một "mini-language" đủ mạnh để diễn đạt mọi thứ sẽ phức tạp hơn
// chính cái script nó thay thế — lúc đó ta chỉ đổi JS thành một thứ tệ hơn JS. Nên: mỗi
// nguyên thuỷ dưới đây tương ứng MỘT hành vi đã có thật trong hai script điều phối cũ, không
// có nguyên thuỷ nào thêm "cho tổng quát".
//
// Luồng nào KHÔNG diễn đạt nổi bằng những nguyên thuỷ này thì cứ để nguyên là một script và
// gọi nó bằng một BƯỚC `script:` (như `leader-analyst.js`: vòng hỏi–đáp gap-report theo từng
// câu và vòng review `FIX` đi lại cùng node thật sự đặc thù). Bẻ một script đặc thù vào khuôn
// khai báo bằng mọi giá là cách chắc chắn nhất để có một khuôn khai báo không ai hiểu.

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseYamlLite } from "../agents/runtime/yaml-lite.js";
import * as PATHS from "../agents/runtime/paths.js";

/** Thư mục chứa file luồng, tính từ gốc repo. */
export const FLOWS_DIR = "flows";

/** Hành động cho phép trong một nhánh `branch`. */
const BRANCH_ACTIONS = new Set(["continue", "stop", "rework"]);

const STEP_KEYS = new Set([
    "node", "label", "gate", "require_step", "with", "confirm_flag", "confirm_reason",
    "delete_stale", "wait_for_file", "wait_for_hint", "branch_on", "branch", "rerun_if_rework",
    // Bước dạng SCRIPT (Q1.1) — cho phép một luồng khai báo chứa một script đặc thù.
    "script", "args", "pass_flags", "expect_step",
]);

/** Key chỉ có nghĩa với bước dạng node. Khai trên bước script là gõ sai, không phải tuỳ chọn. */
const NODE_ONLY_KEYS = ["with", "confirm_flag", "confirm_reason", "delete_stale", "branch_on", "branch"];

const FLOW_KEYS = new Set([
    "name", "title", "description", "type", "script", "command", "requires_run",
    "flags", "params", "steps", "finish",
]);

/**
 * Parse một file luồng. Trả `{flow, problems}` — KHÔNG throw cho lỗi nội dung, vì UI cần
 * liệt kê được cả luồng hỏng (im lặng bỏ qua thì người dùng chỉ thấy luồng "biến mất").
 * Riêng lỗi CÚ PHÁP yaml thì throw từ `parseYamlLite` — file đó không phải yaml, không có gì để liệt kê.
 */
export function parseFlowFile(text, { file = "(flow)" } = {}) {
    const problems = [];
    let doc;
    try {
        doc = parseYamlLite(text, { file });
    } catch (err) {
        return { flow: null, problems: [err.message] };
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        return { flow: null, problems: [`${file}: file rỗng hoặc không phải mapping ở mức ngoài cùng.`] };
    }

    for (const key of Object.keys(doc)) {
        // Key lạ = gõ sai tên (`step:` thay vì `steps:`, `gates:` thay vì `gate:`). Nếu ta bỏ
        // qua thì luồng vẫn chạy — chỉ là thiếu hẳn cửa duyệt mà không ai biết. Nên: báo.
        if (!FLOW_KEYS.has(key)) problems.push(`${file}: key lạ ở mức ngoài cùng: "${key}". Cho phép: ${[...FLOW_KEYS].join(", ")}.`);
    }

    const flow = {
        file,
        name: doc.name ?? basename(file).replace(/\.flow\.ya?ml$/i, ""),
        title: doc.title ?? null,
        description: doc.description ?? null,
        type: doc.type ?? "declarative",
        script: doc.script ?? null,
        command: doc.command ?? null,
        requiresRun: doc.requires_run ?? true,
        flags: [],
        params: [],
        steps: [],
        finish: doc.finish ?? null,
    };

    if (!doc.name) problems.push(`${file}: thiếu \`name:\`.`);
    if (flow.type !== "declarative" && flow.type !== "script") {
        problems.push(`${file}: \`type\` phải là "declarative" hoặc "script", nhận "${flow.type}".`);
    }

    // ── Luồng kiểu script: chỉ khai để UI liệt kê/chạy được, không có bước nào ──
    if (flow.type === "script") {
        if (!flow.script) problems.push(`${file}: \`type: script\` phải kèm \`script:\` là đường dẫn file .js.`);
        if (doc.steps) problems.push(`${file}: \`type: script\` không được có \`steps:\` — thứ tự nằm trong chính script đó.`);
        return { flow, problems };
    }

    for (const f of toList(doc.flags)) {
        if (typeof f === "string") { flow.flags.push({ name: f, note: null }); continue; }
        if (!f?.name) { problems.push(`${file}: một phần tử \`flags\` thiếu \`name\`.`); continue; }
        flow.flags.push({ name: String(f.name), note: f.note ?? null });
    }

    for (const p of toList(doc.params)) {
        if (!p?.name) { problems.push(`${file}: một phần tử \`params\` thiếu \`name\`.`); continue; }
        const kind = p.kind ?? "string";
        if (!["string", "list", "boolean", "number"].includes(kind)) {
            problems.push(`${file}: \`params.${p.name}.kind\` = "${kind}" không hợp lệ (string|list|boolean|number).`);
        }
        flow.params.push({
            name: String(p.name),
            kind,
            default: p.default ?? null,
            note: p.note ?? null,
            // `positional: true` cho phép gõ `node qa.js run analyze "Phân tích voucher"` thay vì
            // `--task="Phân tích voucher"`. Người dùng đích của hệ thống này là QA Manual, không
            // phải lập trình viên — bắt họ gõ `--task=` là thêm một rào cản không đổi lấy gì.
            positional: p.positional === true,
        });
    }
    const positionals = flow.params.filter(p => p.positional);
    if (positionals.length > 1) {
        // Hai param vị trí thì không có cách nào biết đối số nào thuộc param nào.
        problems.push(`${file}: có ${positionals.length} param khai \`positional: true\` (${positionals.map(p => p.name).join(", ")}) — chỉ được một.`);
    }

    const steps = toList(doc.steps);
    if (steps.length === 0) problems.push(`${file}: \`steps:\` rỗng — luồng không có bước nào.`);

    steps.forEach((raw, i) => {
        const at = `${file}: bước ${i + 1}`;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            problems.push(`${at}: phải là mapping có \`node:\`.`);
            return;
        }
        for (const key of Object.keys(raw)) {
            if (!STEP_KEYS.has(key)) problems.push(`${at}: key lạ "${key}". Cho phép: ${[...STEP_KEYS].join(", ")}.`);
        }
        // Một bước là NODE hoặc SCRIPT, không phải cả hai và không phải không có gì.
        if (!raw.node && !raw.script) { problems.push(`${at}: thiếu \`node:\` (hoặc \`script:\`).`); return; }
        if (raw.node && raw.script) {
            problems.push(`${at}: khai cả \`node:\` và \`script:\` — một bước chỉ là một trong hai.`);
            return;
        }

        // ── Bước dạng SCRIPT ────────────────────────────────────────────
        //
        // VÌ SAO CẦN LOẠI BƯỚC NÀY. `leader-analyst` không diễn đạt được bằng khai báo (vòng
        // hỏi–đáp theo TỪNG CÂU + vòng review `FIX` đi lại cùng node). Nhưng nếu nó chỉ tồn tại
        // như một luồng riêng thì KHÔNG có luồng nào chạy hết từ tài liệu tới báo cáo, và người
        // dùng phải học 2 lệnh rời. Cho một script làm MỘT BƯỚC là cách nối hai nửa mà không
        // phải bẻ script đặc thù vào khuôn khai báo.
        if (raw.script) {
            for (const key of NODE_ONLY_KEYS) {
                if (raw[key] !== undefined) problems.push(`${at}: \`${key}\` chỉ dùng cho bước \`node:\`, không dùng cho bước \`script:\`.`);
            }
            if (!raw.expect_step) {
                // Đây là ràng buộc quan trọng nhất của loại bước này. Script dừng có chủ ý (chờ
                // người điền gap-report) cũng thoát 0, y như khi nó chạy xong — nên KHÔNG được
                // tin mã thoát. `expect_step` là cách runner biết "xong thật" hay "đang chờ
                // người". Thiếu nó, luồng sẽ chạy bước sau trong khi nửa đầu còn đang chờ.
                problems.push(
                    `${at}: bước \`script:\` PHẢI có \`expect_step:\` — script dừng-chờ-người và ` +
                    `script chạy-xong đều thoát 0, nên runner phải kiểm trạng thái bước trong DB, không tin mã thoát.`
                );
            }
            flow.steps.push({
                index: i,
                kind: "script",
                node: null,
                script: String(raw.script),
                label: raw.label ?? String(raw.script),
                gate: raw.gate ?? null,
                requireStep: raw.require_step ?? null,
                expectStep: raw.expect_step ? String(raw.expect_step) : null,
                args: toList(raw.args).map(String),
                passFlags: toList(raw.pass_flags).map(String),
                rerunIfRework: raw.rerun_if_rework ?? true,
                with: {},
                deleteStale: [],
                waitForFile: raw.wait_for_file ?? null,
                waitForHint: raw.wait_for_hint ?? null,
                confirmFlag: null,
                confirmReason: null,
                branchOn: null,
                branch: [],
            });
            return;
        }

        const step = {
            index: i,
            kind: "node",
            node: String(raw.node),
            script: null,
            expectStep: null,
            args: [],
            passFlags: [],
            label: raw.label ?? String(raw.node),
            gate: raw.gate ?? null,
            requireStep: raw.require_step ?? null,
            with: raw.with && typeof raw.with === "object" && !Array.isArray(raw.with) ? raw.with : {},
            confirmFlag: raw.confirm_flag ?? null,
            confirmReason: raw.confirm_reason ?? null,
            deleteStale: toList(raw.delete_stale).map(String),
            waitForFile: raw.wait_for_file ?? null,
            waitForHint: raw.wait_for_hint ?? null,
            rerunIfRework: raw.rerun_if_rework ?? true,
            branchOn: raw.branch_on ?? null,
            branch: [],
        };
        if (raw.with && (typeof raw.with !== "object" || Array.isArray(raw.with))) {
            problems.push(`${at}: \`with\` phải là mapping "tên tham số: giá trị".`);
        }
        if (raw.confirm_flag && !raw.confirm_reason) {
            // Không có lý do thì thông báo xác nhận sẽ là "cần --confirm-x" — người dùng
            // không biết mình đang cho phép cái gì. Xác nhận mù không phải xác nhận.
            problems.push(`${at}: có \`confirm_flag\` thì PHẢI có \`confirm_reason\` — người duyệt cần biết mình đang cho phép hành động gì.`);
        }
        if (raw.wait_for_file && !raw.wait_for_hint) {
            problems.push(`${at}: có \`wait_for_file\` thì PHẢI có \`wait_for_hint\` — dừng mà không nói phải chạy lệnh gì là dừng vô ích.`);
        }

        const branch = toList(raw.branch);
        if (raw.branch_on && branch.length === 0) problems.push(`${at}: có \`branch_on\` nhưng \`branch:\` rỗng.`);
        if (!raw.branch_on && branch.length > 0) problems.push(`${at}: có \`branch:\` nhưng thiếu \`branch_on:\` (đọc field nào trong \`data\`).`);

        for (const b of branch) {
            if (!b || typeof b !== "object") { problems.push(`${at}: một nhánh \`branch\` không phải mapping.`); continue; }
            if (b.value === undefined || b.value === null) { problems.push(`${at}: một nhánh thiếu \`value:\`.`); continue; }
            const action = b.action ?? "continue";
            if (!BRANCH_ACTIONS.has(action)) {
                problems.push(`${at}: nhánh "${b.value}" có \`action: ${action}\` không hợp lệ (${[...BRANCH_ACTIONS].join("|")}).`);
                continue;
            }
            if (action === "rework" && !b.rework_node) {
                problems.push(`${at}: nhánh "${b.value}" \`action: rework\` phải kèm \`rework_node:\` — đánh lại việc cho AI nào.`);
            }
            if (action === "stop" && !b.message) {
                problems.push(`${at}: nhánh "${b.value}" \`action: stop\` phải kèm \`message:\` — dừng mà không nói vì sao thì người dùng tưởng là treo.`);
            }
            step.branch.push({
                value: String(b.value),
                action,
                message: b.message ?? null,
                reworkNode: b.rework_node ?? null,
                reworkNote: b.rework_note ?? null,
            });
        }

        if (step.branch.length && !step.branch.some(b => b.action === "continue")) {
            // Mọi nhánh đều dừng = bước sau không bao giờ chạy. Đó gần như luôn là gõ thiếu,
            // và nếu đúng là chủ ý thì đừng khai bước sau.
            problems.push(`${at}: không nhánh nào \`action: continue\` — các bước phía sau không bao giờ chạy tới.`);
        }

        flow.steps.push(step);
    });

    if (flow.finish !== null && typeof flow.finish !== "string") {
        problems.push(`${file}: \`finish\` phải là chuỗi trạng thái ("done"), nhận ${typeof flow.finish}.`);
    }

    return { flow, problems };
}

function toList(v) {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

/**
 * Kiểm luồng ĐỐI CHIẾU registry node thật. Đây là chỗ bù lại cho việc mất kiểm tra tĩnh của
 * `import`: gõ sai tên node phải nổ ở đây, TRƯỚC khi bước nào chạy.
 *
 * Tách `problems` (sai, không chạy được) với `external` (input phải đến từ nơi khác —
 * luồng trước hoặc người/CI). Gộp hai loại này lại là cách nhanh nhất khiến người ta bỏ
 * qua cả danh sách.
 */
export function validateFlow(flow, { nodes, paths = PATHS, fileExists = existsSync, root = process.cwd() } = {}) {
    const problems = [];
    const external = [];
    if (!flow || flow.type === "script") return { problems, external };

    const producedSoFar = new Set();

    for (const step of flow.steps) {
        if (step.kind === "script") {
            const at = `${flow.file}: bước ${step.index + 1} (script ${step.script})`;
            // Tên file gõ sai = luồng chết giữa đường, sau khi các bước trước đã tốn LLM call.
            // Bắt ở đây, cùng chỗ bắt tên node gõ sai.
            if (!fileExists(resolve(root, step.script))) {
                problems.push(`${at}: không có file này.`);
            }
            if (step.expectStep && !nodes?.get?.(step.expectStep)) {
                problems.push(`${at}: \`expect_step: ${step.expectStep}\` — không có node nào tên đó.`);
            }
            if (step.gate && !nodes?.get?.(step.gate)) {
                problems.push(`${at}: \`gate: ${step.gate}\` — không có node nào tên đó.`);
            }
            for (const a of step.args) {
                const ref = refOf(a);
                if (ref?.kind === "param" && !flow.params.some(p => p.name === ref.name)) {
                    problems.push(`${at}: \`args\` dùng $param.${ref.name} nhưng luồng không khai param đó.`);
                }
                if (ref?.kind === "flag" && !flow.flags.some(f => f.name === ref.name)) {
                    problems.push(`${at}: \`args\` dùng $flag.${ref.name} nhưng luồng không khai flag đó.`);
                }
            }
            for (const name of step.passFlags) {
                if (!flow.flags.some(f => f.name === name)) {
                    problems.push(`${at}: \`pass_flags\` có "${name}" nhưng luồng không khai flag đó ở \`flags:\`.`);
                }
            }
            continue;
        }

        const at = `${flow.file}: bước ${step.index + 1} (${step.node})`;
        const node = nodes?.get?.(step.node);
        if (!node) {
            problems.push(`${at}: không có node nào tên "${step.node}" trong agents/. (Node hỏng CONTRACT cũng không vào registry — xem \`node qa.js nodes\`.)`);
            continue;
        }
        if (step.gate && !nodes.get(step.gate)) {
            problems.push(`${at}: \`gate: ${step.gate}\` — không có node nào tên đó.`);
        }
        if (step.requireStep && !nodes.get(step.requireStep)) {
            problems.push(`${at}: \`require_step: ${step.requireStep}\` — không có node nào tên đó.`);
        }
        for (const key of step.deleteStale) {
            if (typeof paths[key] !== "string") {
                problems.push(`${at}: \`delete_stale\` có "${key}" — paths.js không có export nào tên đó.`);
            }
        }
        if (step.waitForFile && typeof paths[step.waitForFile] !== "string") {
            problems.push(`${at}: \`wait_for_file: ${step.waitForFile}\` — paths.js không có export nào tên đó.`);
        }
        for (const [param, value] of Object.entries(step.with)) {
            const ref = refOf(value);
            if (!ref) continue;
            if (ref.kind === "flag" && !flow.flags.some(f => f.name === ref.name)) {
                problems.push(`${at}: \`with.${param}\` dùng $flag.${ref.name} nhưng luồng không khai flag đó ở \`flags:\`.`);
            }
            if (ref.kind === "param" && !flow.params.some(p => p.name === ref.name)) {
                problems.push(`${at}: \`with.${param}\` dùng $param.${ref.name} nhưng luồng không khai param đó ở \`params:\`.`);
            }
        }
        if (step.confirmFlag && !flow.flags.some(f => f.name === step.confirmFlag)) {
            problems.push(`${at}: \`confirm_flag: ${step.confirmFlag}\` nhưng luồng không khai flag đó ở \`flags:\`.`);
        }

        for (const req of node.contract.requires ?? []) {
            if (!producedSoFar.has(req)) {
                external.push({ step: step.node, path: req });
            }
        }
        for (const prod of node.contract.produces ?? []) producedSoFar.add(prod);
    }

    return { problems, external };
}

/** `$flag.x` / `$param.x` → `{kind, name}`; giá trị thường → `null`. */
export function refOf(value) {
    if (typeof value !== "string") return null;
    const m = /^\$(flag|param)\.([\w-]+)$/.exec(value.trim());
    return m ? { kind: m[1], name: m[2] } : null;
}

/**
 * Thay `$flag.x` / `$param.x` bằng giá trị thật.
 * @param {object} withBlock
 * @param {{flags: object, params: object}} ctx
 */
export function resolveWith(withBlock, { flags = {}, params = {} } = {}) {
    const out = {};
    for (const [key, value] of Object.entries(withBlock ?? {})) {
        const ref = refOf(value);
        if (!ref) { out[key] = value; continue; }
        out[key] = ref.kind === "flag" ? Boolean(flags[ref.name]) : params[ref.name];
    }
    return out;
}

/**
 * Đọc đối số dòng lệnh theo phần khai `flags`/`params` của chính luồng đó.
 * `--ten-flag` → boolean. `--ten-param=giá trị` → param (kind `list` thì tách theo dấu phẩy).
 * Đối số không khai → trả về trong `unknown` để hàm gọi báo, chứ không im lặng bỏ qua:
 * một cờ gõ sai mà bị bỏ qua nghĩa là người dùng tưởng đã bật cái gì đó.
 */
export function parseArgs(flow, argv) {
    const flags = {};
    const params = {};
    const unknown = [];

    for (const f of flow.flags) flags[f.name] = false;
    for (const p of flow.params) params[p.name] = castParam(p, p.default);

    const positional = flow.params.find(p => p.positional);
    let positionalTaken = false;

    for (const arg of argv) {
        if (!arg.startsWith("--")) {
            // Đối số không có `--`: gán cho param vị trí nếu luồng khai một cái. Đối số vị trí
            // THỨ HAI vẫn vào `unknown` — im lặng bỏ qua nó nghĩa là người dùng gõ hai chuỗi và
            // một chuỗi biến mất không ai báo.
            if (positional && !positionalTaken) {
                params[positional.name] = castParam(positional, arg);
                positionalTaken = true;
                continue;
            }
            unknown.push(arg);
            continue;
        }
        const body = arg.slice(2);
        const eq = body.indexOf("=");
        const name = eq === -1 ? body : body.slice(0, eq);
        const rawValue = eq === -1 ? null : body.slice(eq + 1);

        const param = flow.params.find(p => p.name === name);
        if (param) { params[name] = castParam(param, rawValue); continue; }
        if (flow.flags.some(f => f.name === name)) { flags[name] = rawValue === null ? true : rawValue !== "false"; continue; }
        unknown.push(arg);
    }
    return { flags, params, unknown };
}

function castParam(param, raw) {
    if (raw === null || raw === undefined) {
        return param.kind === "list" && typeof param.default === "string"
            ? splitList(param.default)
            : param.default;
    }
    if (param.kind === "list") return splitList(String(raw));
    if (param.kind === "number") return Number(raw);
    if (param.kind === "boolean") return String(raw) !== "false";
    return String(raw);
}

const splitList = (s) => String(s).split(",").map(x => x.trim()).filter(Boolean);

/** Liệt kê mọi file luồng trong `flows/`. Không throw khi thư mục chưa có. */
export async function listFlowFiles({ root = process.cwd(), dir = FLOWS_DIR } = {}) {
    let entries;
    try {
        entries = await readdir(resolve(root, dir));
    } catch {
        return [];
    }
    return entries
        .filter(n => /\.flow\.ya?ml$/i.test(n))
        .sort()
        // Dấu `/` chứ không phải `\`: cả repo dùng đường dẫn kiểu POSIX tính từ gốc
        // (xem đầu paths.js), và đường dẫn này đi vào thông báo lỗi lẫn `tools.js`.
        .map(n => `${dir}/${n}`);
}

/** Đọc + parse mọi file luồng. Luồng hỏng vẫn trả về kèm `problems` để UI nói ra được. */
export async function loadFlows({ root = process.cwd(), dir = FLOWS_DIR } = {}) {
    const files = await listFlowFiles({ root, dir });
    const flows = [];
    for (const file of files) {
        const text = await readFile(resolve(root, file), "utf8");
        let parsed;
        try {
            parsed = parseFlowFile(text, { file });
        } catch (err) {
            flows.push({ flow: null, problems: [`${file}: ${err.message}`] });
            continue;
        }
        flows.push(parsed);
    }
    return flows;
}

/** Mô tả một luồng cho người đọc trong terminal. */
export function renderFlow(flow, { nodes } = {}) {
    const out = [`${flow.name}${flow.title ? ` — ${flow.title}` : ""}`];
    if (flow.description) out.push(`  ${flow.description}`);
    if (flow.type === "script") {
        out.push(`  (luồng kiểu script: ${flow.script})`);
        return out.join("\n");
    }
    flow.steps.forEach((s, i) => {
        const bits = [];
        if (s.gate) bits.push(`cần duyệt "${s.gate}"`);
        if (s.confirmFlag) bits.push(`cần --${s.confirmFlag}`);
        if (s.waitForFile) bits.push(`chờ file ${s.waitForFile}`);
        if (s.branchOn) bits.push(`rẽ theo ${s.branchOn}: ` + s.branch.map(b => `${b.value}→${b.action}`).join(" · "));
        if (s.kind === "script") {
            out.push(`  ${i + 1}. ${s.label}   (script → ${s.expectStep}${bits.length ? " · " + bits.join(" · ") : ""})`);
            return;
        }
        const missing = nodes && !nodes.get?.(s.node) ? "  [KHÔNG CÓ NODE NÀY]" : "";
        out.push(`  ${i + 1}. ${s.node}${missing}${bits.length ? `   (${bits.join(" · ")})` : ""}`);
    });
    if (flow.finish) out.push(`  → kết thúc: đóng phiên với trạng thái "${flow.finish}"`);
    return out.join("\n");
}
