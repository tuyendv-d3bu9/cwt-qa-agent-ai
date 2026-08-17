// agents/runtime/handover.js
// Enforces rule 3 of the handover contract in memory/README.md:
//   "Mỗi node khai rõ input bắt buộc. Workflow kiểm tra input tồn tại TRƯỚC KHI gọi
//    node, thay vì để node chết lúc runtime."
//
// Before this existed, a node called with a missing input got as far as its own
// read_file, then failed with whatever error that produced — sometimes several LLM
// calls in. The contract was written down in every role.md but nothing checked it.
//
// Generic on purpose: no node and no file path is named here. Each node declares its
// own CONTRACT; this module only checks declarations.

import { runTool } from "./tools.js";

/**
 * @typedef {Object} Contract
 * @property {string}   agent     - node name, matching the checkpoint step name
 * @property {string[]} requires  - paths that MUST exist before the node runs
 * @property {string[]} produces  - paths the node is expected to write
 */

/**
 * Check a node's declared inputs. Returns the missing ones instead of throwing, so the
 * caller decides whether that is a hard stop or a "run the previous step first" hint.
 */
export async function checkInputs(contract) {
    const missing = [];
    for (const path of contract.requires ?? []) {
        const res = await runTool("file_exists", { path });
        if (res.error || res.exists !== true) missing.push(path);
    }
    return { ok: missing.length === 0, missing };
}

/**
 * Hard gate: refuse to call a node whose declared inputs are not all present.
 * The message names the node, the missing files and the contract, so the fix is
 * obvious without reading code.
 */
export async function requireInputs(contract) {
    const { ok, missing } = await checkInputs(contract);
    if (ok) return;
    throw new Error(
        [
            `Không thể chạy "${contract.agent}" — thiếu input bắt buộc theo hợp đồng handover:`,
            ...missing.map(p => `  - ${p}`),
            `  Xem "Hợp đồng bàn giao" trong memory/README.md và Input/Output contract trong agents/${contract.agent}/role.md.`,
            `  Chạy bước trước cho xong (hoặc tạo file trên) rồi chạy lại.`,
        ].join("\n")
    );
}

/**
 * Check after the fact that a node wrote what it promised. A node returning success
 * while its declared output is absent is a contract violation, and silently continuing
 * would push a confusing failure onto the NEXT node.
 */
export async function verifyProduced(contract) {
    const missing = [];
    for (const path of contract.produces ?? []) {
        const res = await runTool("file_exists", { path });
        if (res.error || res.exists !== true) missing.push(path);
    }
    return { ok: missing.length === 0, missing };
}
