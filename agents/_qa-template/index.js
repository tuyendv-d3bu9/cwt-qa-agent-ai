// agents/<node-name>/index.js
// Node: <Node Name>
// Đọc: role.md, skills/, knowledge/ trong CHÍNH thư mục node này.
//
// ĐÂY LÀ TEMPLATE — `agents/runtime/node-registry.js` bỏ qua mọi thư mục bắt đầu bằng `_`,
// nên file này không bao giờ bị nạp như một node thật.
//
// LỖI TỪNG CÓ Ở ĐÂY (P7.0): bản cũ kết thúc bằng `module.exports = { run }` trong khi
// `package.json` khai `"type": "module"`. Mọi node sinh ra từ template này sẽ chết ngay
// lúc `import` với `ReferenceError: module is not defined`. Không test nào bắt được, vì
// không ai import template. Giữ ESM (`export`) ở đây.

import { runTool } from "../runtime/tools.js";
import * as P from "../runtime/paths.js";

// ─────────────────────────────────────────────────────────────────────
// HỢP ĐỒNG — bắt buộc. Xem contract.md cạnh file này để biết từng field.
//
// `requires`/`produces` cho `runtime/handover.js` chặn trước/kiểm sau.
// `inputs` cho `runtime/node-registry.js` biết TRUYỀN GÌ vào `run()`:
//   tên tham số của run()  →  tên export trong runtime/paths.js
// Không có `inputs` thì flow-runner không gọi được node, vì nó không thể đoán
// node muốn tham số tên gì.
// ─────────────────────────────────────────────────────────────────────
export const CONTRACT = {
    agent: "<node-name>",          // PHẢI trùng tên thư mục
    requires: [/* P.TASK_ASSIGNMENT */],
    produces: [/* P.DELIVERABLE_... */],
    inputs: {/* taskFile: "TASK_ASSIGNMENT" */},
    // entry: "run",               // chỉ khai khi hàm vào KHÔNG tên là "run"
};

/**
 * @param {object} input — hình dạng xem "Input/Output contract" trong role.md
 * @returns {Promise<{status: string, data: object|null, error: string|null}>}
 *   status: "success" đã xong · "error" thất bại · "waiting_input" đang chờ NGƯỜI trả lời.
 *   Ba giá trị này là những gì `workflow/flow-runner.js` hiểu; trả về chuỗi khác thì
 *   runner coi là lỗi hợp đồng và dừng, chứ không đoán.
 */
export async function run(input) {
    // TODO: phần việc chính của node.
    //
    // Node kiểu-LLM thì gọi `runAgentLoop` (agents/runtime/agent-loop.js) với skill của
    // chính node này — ĐỪNG gọi LLM một phát rồi tin ngay: vòng observe→act→observe là lý
    // do agent-loop.js tồn tại.
    //
    // Việc có ĐÚNG/SAI (đếm, chấm điểm, so khớp, sinh code) thì phải là tool deterministic
    // trong tools/ của node này, KHÔNG để LLM tự phán. Xem bảng "ai viết cái gì" trong
    // agents/qa-automation/knowledge/playwright-conventions.md.

    return {
        status: "success",
        data: {},
        error: null,
    };
}
