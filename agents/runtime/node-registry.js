// agents/runtime/node-registry.js
// Tự dò node theo QUY ƯỚC, không theo `import` (P7.2).
//
// VÌ SAO FILE NÀY TỒN TẠI. Thứ tự luồng từng nằm cứng trong hai script viết tay (282 + 266
// dòng, đặt tên đánh số `flow-2`/`flow-3`), nối nhau bằng `import` ở đầu file.
// Hệ quả: thêm một node = **sửa code JS**. Mà mục tiêu là "mô tả → AI sinh file → tự vào
// luồng" — điều đó bất khả thi khi việc "vào luồng" là một dòng `import` ai đó phải gõ.
//
// Ở đây registry được dựng bằng cách QUÉT `agents/*/index.js`. Một node mới xuất hiện trong
// registry chỉ vì thư mục của nó tồn tại và `CONTRACT` của nó hợp lệ. Không ai phải sửa
// file này khi thêm node.
//
// ĐỔI LẤY: mất kiểm tra tĩnh của `import` — gõ sai tên node giờ là lỗi lúc chạy, không phải
// lúc biên dịch. Bù lại bằng `validateContract()` nổ **lúc dò**, trước khi bất cứ bước nào
// chạy, và bằng `flow-file.js` kiểm mọi tên node trong file luồng đối chiếu registry.

import { readdir, access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import * as PATHS from "./paths.js";

/** Thư mục chứa node, tính từ gốc repo. */
export const AGENTS_DIR = "agents";

/**
 * Các giá trị `status` mà node được phép trả về, và ý nghĩa với `flow-runner.js`.
 * Đây là PHẦN CỦA HỢP ĐỒNG, không phải chi tiết của runner — nên nó nằm cạnh việc
 * validate hợp đồng, để node mới sinh ra đọc một chỗ là đủ.
 */
export const NODE_STATUS = {
    /** Xong, đi tiếp. `qa-leader.runSetup` trả "ready" chứ không phải "success" — cả hai đều là xong. */
    DONE: ["success", "ready"],
    /** Dừng luồng, đang chờ NGƯỜI. Không phải lỗi. */
    WAITING: ["waiting_input", "waiting_ask"],
    /** Thất bại. */
    FAILED: ["error"],
    /** Không có gì để làm (ví dụ `project-docs/` rỗng) — dừng, nhưng không đánh là fail. */
    NOT_STARTED: ["not_started"],
};

/** Phân loại một `status` node trả về. Trả `null` khi ngoài từ vựng → runner coi là vi phạm hợp đồng. */
export function classifyStatus(status) {
    for (const [kind, values] of Object.entries(NODE_STATUS)) {
        if (values.includes(status)) return kind;
    }
    return null;
}

/**
 * Kiểm hình dạng CONTRACT. Trả về mảng vấn đề (rỗng = hợp lệ) — KHÔNG throw, để hàm gọi
 * quyết định đây là "bỏ node này ra" hay "dừng cả hệ thống".
 *
 * Mỗi luật ở đây tương ứng một cách hỏng ĐÃ hoặc SẼ xảy ra thật:
 *   - `agent` lệch tên thư mục → trạng thái ghi vào `run_steps` dưới một tên, cửa duyệt tra
 *     dưới tên khác → duyệt xong vẫn bị chặn, không hiểu tại sao.
 *   - `inputs` trỏ tới export không có trong paths.js → node nhận `undefined`, rồi
 *     `read_file({path: undefined})` chết ở tít bên trong.
 *   - `inputs` có path không nằm trong `requires` → node đọc một file mà không khai là cần,
 *     nên `requireInputs()` cho qua rồi node chết. Cửa gác mất tác dụng đúng chỗ cần có.
 *
 * @param {object} contract
 * @param {{dirName: string, module: object, paths?: object}} ctx
 */
export function validateContract(contract, { dirName, module, paths = PATHS }) {
    const problems = [];
    const at = `agents/${dirName}/index.js`;

    if (!contract || typeof contract !== "object") {
        return [`${at}: không export \`CONTRACT\`. Xem agents/_qa-template/contract.md.`];
    }

    if (contract.agent !== dirName) {
        problems.push(
            `${at}: CONTRACT.agent = "${contract.agent}" nhưng thư mục tên "${dirName}". ` +
            `Tên này là khoá của bảng \`run_steps\` (trạng thái + cửa duyệt) — lệch là duyệt một tên, tra một tên khác.`
        );
    }

    for (const field of ["requires", "produces"]) {
        const v = contract[field];
        if (!Array.isArray(v)) { problems.push(`${at}: CONTRACT.${field} phải là mảng (mảng rỗng vẫn hợp lệ).`); continue; }
        const bad = v.filter(p => typeof p !== "string" || !p.trim());
        if (bad.length) problems.push(`${at}: CONTRACT.${field} có phần tử không phải đường dẫn: ${JSON.stringify(bad)}.`);
    }

    const inputs = contract.inputs;
    if (inputs === undefined || inputs === null || typeof inputs !== "object" || Array.isArray(inputs)) {
        problems.push(
            `${at}: CONTRACT.inputs phải là object map "tên tham số của run()" → "tên export trong paths.js" ` +
            `(object rỗng {} vẫn hợp lệ nếu node không nhận đường dẫn nào).`
        );
    } else {
        const requires = Array.isArray(contract.requires) ? contract.requires : [];
        for (const [param, pathKey] of Object.entries(inputs)) {
            if (typeof pathKey !== "string") {
                problems.push(`${at}: CONTRACT.inputs.${param} phải là TÊN export trong paths.js (chuỗi), không phải ${typeof pathKey}.`);
                continue;
            }
            const value = paths[pathKey];
            if (typeof value !== "string") {
                problems.push(`${at}: CONTRACT.inputs.${param} = "${pathKey}" — paths.js không có export nào tên đó (hoặc nó không phải chuỗi).`);
                continue;
            }
            if (!requires.includes(value)) {
                problems.push(
                    `${at}: CONTRACT.inputs.${param} trỏ tới "${value}" nhưng đường dẫn đó KHÔNG có trong \`requires\`. ` +
                    `Node đọc file mà không khai là cần nó → requireInputs() cho qua rồi node chết bên trong.`
                );
            }
        }
    }

    const entryName = contract.entry ?? "run";
    if (typeof module?.[entryName] !== "function") {
        problems.push(`${at}: CONTRACT.entry = "${entryName}" nhưng file không export function tên đó.`);
    }

    return problems;
}

/**
 * Một thư mục trong `agents/` là **ứng viên node** khi và chỉ khi nó có `role.md`.
 *
 * Đây không phải luật tôi bịa cho tiện: `role.md` là thứ định nghĩa một node trong repo này
 * (cả 6 node đều có role.md + skills/ + knowledge/ + tools/). Bản đầu tôi quét mọi thư mục
 * con và `agents/runtime/` — một thư mục THƯ VIỆN — bị báo là "node hỏng, không import được
 * index.js". Một cảnh báo sai như thế nguy hiểm hơn là vô ích: nó dạy người đọc bỏ qua
 * danh sách hỏng, đúng lúc danh sách đó cần được đọc.
 *
 * Có `role.md` mà thiếu `index.js` hoặc CONTRACT sai thì VẪN vào danh sách `broken` — đó là
 * một node thật đang hỏng, khác hẳn một thư viện bị nhận nhầm.
 */
async function isNodeCandidate(root, dirName) {
    try {
        await access(resolve(root, AGENTS_DIR, dirName, "role.md"));
        return true;
    } catch {
        return false;
    }
}

/**
 * Quét thư mục agent và nạp mọi node hợp lệ.
 *
 * Bỏ qua thư mục bắt đầu bằng `_` (`_qa-template`), thư mục `.`, và thư mục không có
 * `role.md`. Đây là toàn bộ cơ chế "template không bị coi là node" — không có danh sách
 * loại trừ nào phải bảo trì.
 *
 * @param {object} [o]
 * @param {string} [o.root]     gốc repo (mặc định: cwd)
 * @param {function} [o.listDirs]  ({root}) => string[] — tiêm để test không cần đĩa thật
 * @param {function} [o.load]      (dirName) => Promise<module> — tiêm để test
 * @returns {Promise<{nodes: Map<string, object>, broken: Array, problems: string[]}>}
 *   `nodes`  — dùng được. `broken` — có CONTRACT sai, KHÔNG dùng được nhưng vẫn liệt kê để
 *   UI nói ra được là node nào hỏng (im lặng bỏ qua thì người dùng chỉ thấy "không có node này").
 */
export async function discoverNodes({ root = process.cwd(), listDirs, load } = {}) {
    let dirs;
    if (listDirs) {
        dirs = await listDirs({ root });
    } else {
        const entries = (await readdir(resolve(root, AGENTS_DIR), { withFileTypes: true }))
            .filter(e => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
            .map(e => e.name);
        const flags = await Promise.all(entries.map(name => isNodeCandidate(root, name)));
        dirs = entries.filter((_, i) => flags[i]);
    }

    const importer = load ?? (async (dirName) =>
        import(pathToFileURL(resolve(root, AGENTS_DIR, dirName, "index.js")).href));

    const nodes = new Map();
    const broken = [];
    const problems = [];

    for (const dirName of [...dirs].sort()) {
        let module;
        try {
            module = await importer(dirName);
        } catch (err) {
            // Một node không import nổi (lỗi cú pháp, thiếu file) phải nói ra ĐÚNG như thế.
            // Bản trước của template chết đúng ở đây với "module is not defined" (P7.0).
            broken.push({ name: dirName, problems: [`agents/${dirName}/index.js: không import được — ${err.message}`] });
            continue;
        }

        const contract = module.CONTRACT;
        const nodeProblems = validateContract(contract, { dirName, module });
        if (nodeProblems.length) {
            broken.push({ name: dirName, problems: nodeProblems });
            problems.push(...nodeProblems);
            continue;
        }

        nodes.set(dirName, {
            name: dirName,
            dir: join(AGENTS_DIR, dirName),
            contract,
            entry: contract.entry ?? "run",
            module,
        });
    }

    return { nodes, broken, problems };
}

/**
 * Dựng đối số gọi `run()` của một node từ `CONTRACT.inputs` + khối `with:` của bước.
 *
 * `with` được phép ĐÈ một đường dẫn (ví dụ chạy lại verifier trên một file kết quả khác),
 * và là nơi duy nhất cấp các tham số không phải path (`vlmAll`, `reportTypes`, `jira`…).
 */
export function resolveArgs(node, { with: withArgs = {}, paths = PATHS } = {}) {
    const args = {};
    for (const [param, pathKey] of Object.entries(node.contract.inputs ?? {})) {
        args[param] = paths[pathKey];
    }
    return { ...args, ...withArgs };
}

/** Gọi node qua đúng entry đã khai. Không bắt lỗi — người gọi (flow-runner) quyết định. */
export async function callNode(node, args) {
    return node.module[node.entry](args);
}

/**
 * Những node có đầu vào phụ thuộc (trực tiếp hoặc bắc cầu) vào đầu ra của `name`.
 *
 * VÌ SAO CẦN. Người dùng nói *"test case sinh ra dở, làm lại"*. Sinh lại một mình
 * `qa-test-designer` là chưa đủ: `qa-automation` đã sinh 21 spec TỪ bảng test case cũ, và
 * `qa-verifier` đã kết luận TRÊN những spec đó. Nếu chỉ đánh lại một bước thì runner bỏ qua
 * các bước sau (chúng vẫn `done`) → **bảng test case mới đi cùng spec cũ**, và không có gì báo.
 *
 * Tính từ `CONTRACT` (`produces` → `requires`), KHÔNG từ một danh sách thứ tự gõ cứng: node
 * người dùng tự thêm sau này cũng phải được tính đúng mà không ai phải sửa file này.
 *
 * @param {string} name
 * @param {Map<string, object>} nodes  registry từ discoverNodes()
 * @returns {string[]} tên các node ở hạ nguồn (không gồm chính `name`), thứ tự ổn định
 */
export function downstreamOf(name, nodes) {
    const start = nodes.get(name);
    if (!start) return [];

    // Bắc cầu: sinh lại designer làm automation cũ → verifier đọc output của automation →
    // reporter đọc output của verifier. Một vòng lan truyền một tầng là không đủ.
    const tainted = new Set((start.contract.produces ?? []));
    const affected = new Set();

    for (let pass = 0; pass < nodes.size + 1; pass++) {
        let grew = false;
        for (const node of nodes.values()) {
            if (node.name === name || affected.has(node.name)) continue;
            const requires = node.contract.requires ?? [];
            if (!requires.some(r => tainted.has(r))) continue;
            affected.add(node.name);
            for (const p of node.contract.produces ?? []) {
                if (!tainted.has(p)) { tainted.add(p); grew = true; }
            }
            grew = true;
        }
        if (!grew) break;
    }

    return [...affected].sort();
}
