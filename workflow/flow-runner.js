// workflow/flow-runner.js
// Chạy một luồng KHAI BÁO (`flows/*.flow.yml`). Đây là bộ điều phối DUY NHẤT.
//
// VÌ SAO CHỈ CÓ MỘT. Trước đây có hai script tự điều phối (`flow-2-*.js`, `flow-3-*.js`),
// mỗi cái tự viết lại thứ tự, cửa duyệt và điều kiện dừng của riêng nó. Cả hai đã bị bỏ:
// giữ song song hai đường cho cùng một việc là đúng tội "0-BUG" trong TODO.update2.md —
// code mới có test xanh, đường chạy thật vẫn là code cũ, không ai biết mình đang chạy đường nào.
//
// TRÁCH NHIỆM. Runner biết về: thứ tự · cửa duyệt · điều kiện dừng · hợp đồng vào/ra ·
// trạng thái phiên. Runner KHÔNG biết node nào làm gì — nó gọi qua `CONTRACT` + registry.
// Thêm node mới KHÔNG cần sửa file này.
//
// Runner KHÔNG gọi `process.exit()`. Nó trả về kết quả, người gọi (shim hoặc `qa.js`) quyết
// định mã thoát — vì `qa.js` chạy nhiều luồng trong một tiến trình, một `exit()` trong này
// sẽ giết cả UI.

import { runTool } from "../agents/runtime/tools.js";
import { loadState, markStep, requireApproved, currentRun, finishRun } from "../agents/runtime/memory.js";
import { initDatabases } from "../agents/runtime/db.js";
import { getConfig } from "../agents/runtime/knowledge.js";
import { requireInputs, verifyProduced } from "../agents/runtime/handover.js";
import { discoverNodes, resolveArgs, callNode, classifyStatus } from "../agents/runtime/node-registry.js";
import { validateFlow, resolveWith, parseArgs, refOf } from "./flow-file.js";
import * as PATHS from "../agents/runtime/paths.js";
import { spawn } from "node:child_process";

/**
 * Chạy một script bước bằng TIẾN TRÌNH CON, không `import`.
 *
 * Các script bước gọi `process.exit()` ở nhiều nhánh (chờ người, thiếu tài liệu, hết vòng
 * review). Import vào đây là để nó giết luôn cả runner — và nếu runner được `qa.js` gọi thì
 * giết cả UI. `qa.js` cũng spawn vì đúng lý do này.
 */
function spawnScript(script, args) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
        child.on("exit", (code) => resolve(code ?? 0));
        child.on("error", (err) => { console.error(`Không chạy được ${script}: ${err.message}`); resolve(1); });
    });
}

/**
 * Tên cờ theo QUY ƯỚC mà runner tự đọc, không phải luồng nào cũng phải khai lại logic:
 * `--no-gate` bỏ cửa duyệt người. Luồng vẫn nên khai nó trong `flags:` để `--help` liệt kê.
 */
export const NO_GATE_FLAG = "no-gate";

/**
 * `--new-run` mở PHIÊN MỚI thay vì tiếp phiên đang mở. Script mở phiên (leader-analyst.js) tự
 * xử lý cờ này, nhưng runner phải BIẾT tới nó — xem chỗ "đã xong thì bỏ qua" bên dưới.
 */
export const NEW_RUN_FLAG = "new-run";

/** Kết quả một lần chạy luồng. `stopped` = dừng có chủ ý (chờ người), KHÁC với `ok: false` = sai. */
const result = (o) => ({ ok: true, stopped: false, reason: null, steps: [], ...o });

/**
 * @param {object} flow          đã parse bởi flow-file.js
 * @param {object} [o]
 * @param {string[]} [o.argv]    đối số dòng lệnh (không gồm `node` và tên file)
 * @param {function} [o.log]
 * @returns {Promise<{ok: boolean, stopped: boolean, reason: string|null, steps: Array}>}
 */
export async function runFlow(flow, { argv = [], log = console.log, error = console.error } = {}) {
    if (flow.type === "script") {
        return result({ ok: false, reason: `"${flow.name}" là luồng kiểu script — chạy trực tiếp: node ${flow.script}` });
    }

    const { flags, params, unknown } = parseArgs(flow, argv);
    if (unknown.length) {
        // Một cờ gõ sai mà bị bỏ qua nghĩa là người dùng TƯỞNG đã bật cái gì đó. Với
        // `--confirm-mcp` thì cái "tưởng" đó là tưởng đã cho phép mở trình duyệt thật.
        return result({
            ok: false,
            reason: `Đối số không khai trong luồng "${flow.name}": ${unknown.join(" ")}\n` +
                `  Cờ cho phép: ${flow.flags.map(f => "--" + f.name).join(" ") || "(không có)"}\n` +
                `  Tham số   : ${flow.params.map(p => `--${p.name}=<${p.kind}>`).join(" ") || "(không có)"}`,
        });
    }

    const noGate = Boolean(flags[NO_GATE_FLAG]);

    // DB trước mọi thứ — tường minh ở đầu lần chạy, không phải lười khởi tạo lúc code nào đó
    // chạm vào lần đầu (cùng lý do như trong flow-2 bản cũ).
    for (const { path, created } of initDatabases()) if (created) log(`Created ${path}`);

    const { nodes, broken } = await discoverNodes();
    for (const b of broken) {
        error(`  [node hỏng] ${b.name}:`);
        b.problems.forEach(p => error(`     ${p}`));
    }

    // Kiểm tĩnh TRƯỚC khi chạy bước nào. Đây là chỗ bù cho việc không còn `import` để bắt lỗi
    // tên node: gõ sai phải nổ ở đây, không phải sau khi 3 node đầu đã tốn LLM call.
    const v = validateFlow(flow, { nodes });
    if (v.problems.length) {
        return result({ ok: false, reason: [`Luồng "${flow.name}" khai sai:`, ...v.problems.map(p => "  " + p)].join("\n") });
    }

    if (flow.requiresRun) {
        const run = await currentRun();
        if (!run) {
            return result({
                ok: false,
                reason: `Chưa có phiên nào đang mở. Luồng "${flow.name}" tiếp tục một phiên có sẵn, không tự mở phiên mới.\n` +
                    `  Mở phiên: node qa.js run analyze "<tên task>"`,
            });
        }
        log(`Run: ${run.run_id}  (feature: "${run.feature ?? "chưa gán"}")  [${run.status}]` +
            (noGate ? `  — CỬA DUYỆT NGƯỜI ĐANG TẮT (--no-gate)` : ""));
    }

    const steps = [];
    const total = flow.steps.length;

    for (const step of flow.steps) {
        const n = `[${step.index + 1}/${total}]`;
        const node = step.kind === "script" ? null : nodes.get(step.node);

        // Đọc LẠI trạng thái mỗi bước, không đọc một lần ở đầu vòng.
        //
        // LỖI TIỀM ẨN ĐÃ CÓ TRƯỚC Q1.1: bản trước load `state` một lần rồi dùng cho cả vòng.
        // Khi các bước hoàn thành trong CÙNG một lần chạy, `require_step` vẫn đọc ảnh chụp cũ
        // và kết luận bước trước "chưa chạy". Chưa nổ vì chưa có luồng nào có 2 bước phụ thuộc
        // nhau hoàn thành trong một lượt — `full` (Q1.2) là luồng đầu tiên như thế: script hoàn
        // thành `qa-analyst`, rồi bước sau `require_step: qa-analyst`.
        const state = await loadState();
        const stepStatus = (agent) => state.steps.find(s => s.agent === agent);

        // ── Đã xong rồi thì bỏ qua: cho phép chạy lại lệnh y nguyên để TIẾP TỤC ──
        // Với bước script thì "đã xong" đo bằng `expect_step`, vì script không phải một node
        // nên nó không có dòng trạng thái riêng trong `run_steps`.
        //
        // `--new-run` PHẢI thắng cái skip này, nếu không nó là cờ chết.
        //
        // `state` ở đây là trạng thái của PHIÊN ĐANG MỞ. Nhưng bước script của `analyze` chính
        // là bước QUYẾT ĐỊNH dùng phiên nào (nó gọi startRun). Bỏ qua nó vì "phiên cũ đã done"
        // là trả lời câu hỏi thứ hai trước khi trả lời câu hỏi thứ nhất — và cấm luôn đường mở
        // phiên mới, đúng vào lúc người ta cần nhất.
        //
        // Gặp thật 2026-08-28: web lên bản v2.0, xoá sạch memory rồi chạy
        //   node qa.js run analyze "<task mới>" --new-run
        // Runner in "[1/1] … đã xong — bỏ qua." và không làm gì cả. `leader-analyst.js` xử lý
        // `--new-run` hoàn toàn đúng (và tên feature cũng đã khác) nhưng KHÔNG BAO GIỜ được gọi.
        // Nhìn từ ngoài: lệnh thoát 0, không lỗi, memory vẫn rỗng.
        const trackedAgent = step.kind === "script" ? step.expectStep : step.node;
        const existing = stepStatus(trackedAgent);
        const needsRerun = existing?.status === "needs_rework" && step.rerunIfRework;
        const forceNewRun = Boolean(flags[NEW_RUN_FLAG]);
        if (existing?.status === "done" && !needsRerun && !forceNewRun) {
            log(`${n} ${step.label} đã xong — bỏ qua.`);
            steps.push({ node: trackedAgent, action: "skipped" });
            continue;
        }

        // ── Điều kiện: bước của node khác phải xong ──
        if (step.requireStep) {
            const dep = stepStatus(step.requireStep);
            if (dep?.status !== "done") {
                return result({
                    ok: false, steps,
                    reason: `${step.node} cần "${step.requireStep}" ở trạng thái done, hiện tại: ${dep?.status ?? "chưa chạy"}.`,
                });
            }
        }

        // ── Cửa duyệt của NGƯỜI ──
        if (step.gate) {
            if (noGate) {
                log(`  [gate] Bỏ qua duyệt "${step.gate}" (--${NO_GATE_FLAG}).`);
            } else {
                try {
                    await requireApproved(step.gate);
                } catch (err) {
                    return result({
                        ok: false, stopped: true, steps,
                        reason: `CỬA DUYỆT NGƯỜI chặn tại "${step.gate}":\n   ` +
                            err.message.split("\n").join("\n   ") +
                            `\n\n   Đây là hành vi đã khai trong cả 6 role.md (Human-Final), không phải lỗi.` +
                            `\n   Demo nhanh không cần duyệt: thêm cờ --${NO_GATE_FLAG}.`,
                    });
                }
            }
        }

        // ── Bước dạng SCRIPT: chạy tiến trình con, rồi KIỂM TRẠNG THÁI, không tin mã thoát ──
        if (step.kind === "script") {
            const scriptArgv = [
                ...step.args.map(a => {
                    const ref = refOf(a);
                    if (!ref) return a;
                    return ref.kind === "flag" ? String(Boolean(flags[ref.name])) : String(params[ref.name] ?? "");
                }).filter(a => a !== ""),
                ...step.passFlags.filter(name => flags[name]).map(name => `--${name}`),
            ];

            log(`${n} Đang chạy ${step.label}…`);
            log(`     node ${step.script} ${scriptArgv.map(a => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);

            const code = await spawnScript(step.script, scriptArgv);
            if (code !== 0) {
                return result({ ok: false, steps, reason: `${step.script} thoát với mã ${code}. Xem log phía trên.` });
            }

            // Mã thoát 0 KHÔNG có nghĩa là xong: script cũng thoát 0 khi nó dừng có chủ ý để
            // chờ người (điền gap-report, duyệt bước). Nguồn sự thật là trạng thái trong DB.
            const after = await loadState();
            const tracked = after.steps.find(s => s.agent === step.expectStep);
            if (tracked?.status !== "done") {
                return result({
                    stopped: true, steps,
                    reason: `Nửa này chưa xong — "${step.expectStep}" đang ở trạng thái ` +
                        `${tracked?.status ?? "chưa chạy"}.\n` +
                        `  Làm theo hướng dẫn script vừa in ở trên, rồi chạy lại đúng lệnh này để tiếp tục.`,
                });
            }

            steps.push({ node: step.expectStep, action: "done", output: tracked.output ?? null });
            if (!noGate && flow.steps.some(s => s.gate === step.expectStep)) {
                log(`     Cần duyệt trước khi đi tiếp: đọc ${tracked.output} rồi chạy  node qa.js approve ${step.expectStep} "<tên bạn>"`);
            }
            continue;
        }

        // ── Hành động ra ngoài thật: phải xác nhận TƯỜNG MINH, mỗi lần ──
        if (step.confirmFlag && !flags[step.confirmFlag]) {
            return result({
                stopped: true, steps,
                reason: `${step.node} cần chạy, nhưng bước này ${step.confirmReason}\n` +
                    `  base_url hiện tại (tầng 2): ${getConfig("base_url", "(chưa cấu hình)")}\n` +
                    `  Đây là hành động ra bên ngoài thật, cần xác nhận tường minh MỖI LẦN.\n` +
                    `  Đồng ý thì chạy lại kèm: --${step.confirmFlag}`,
            });
        }

        // ── Xoá sản phẩm cũ đã lỗi thời ──
        for (const key of step.deleteStale) {
            const path = PATHS[key];
            const exists = await runTool("file_exists", { path });
            if (exists.exists === true) {
                await runTool("delete_file", { path });
                log(`  Đã xoá ${path} cũ (sẽ được sinh lại — bản cũ không còn hợp lệ).`);
            }
        }

        // ── Điểm dừng chờ NGƯỜI/CI tạo file (không agent nào tự chạy Playwright) ──
        if (step.waitForFile) {
            const path = PATHS[step.waitForFile];
            const exists = await runTool("file_exists", { path });
            if (exists.exists !== true) {
                return result({
                    stopped: true, steps,
                    reason: `Chưa có ${path}. Bước "${step.node}" KHÔNG tự tạo file này.\n` +
                        `  Chạy:  ${step.waitForHint}\n` +
                        `  Xong rồi chạy lại đúng lệnh này để tiếp tục.`,
                });
            }
        }

        // ── Hợp đồng vào ──
        try {
            await requireInputs(node.contract);
        } catch (err) {
            return result({ ok: false, steps, reason: err.message });
        }

        // ── Gọi node ──
        log(`${n} Đang chạy ${step.node} — ${step.label}…`);
        const args = { ...resolveArgs(node), ...resolveWith(step.with, { flags, params }) };
        let out;
        try {
            out = await callNode(node, args);
        } catch (err) {
            return result({ ok: false, steps, reason: `${step.node} nổ giữa đường: ${err.message}\n${err.stack ?? ""}` });
        }

        const kind = classifyStatus(out?.status);
        if (kind === null) {
            // Từ vựng `status` là phần của hợp đồng (NODE_STATUS trong node-registry.js).
            // Trả về chuỗi lạ thì runner KHÔNG đoán — đoán sai ở đây là chạy tiếp trên một
            // bước có thể đã thất bại.
            return result({
                ok: false, steps,
                reason: `${step.node} trả về status = ${JSON.stringify(out?.status)} — không có trong từ vựng hợp đồng.\n` +
                    `  Cho phép: xem NODE_STATUS trong agents/runtime/node-registry.js.`,
            });
        }
        if (kind === "FAILED") {
            return result({ ok: false, steps, reason: `${step.node} lỗi: ${out.error ?? "(không có thông báo)"}` });
        }
        if (kind === "NOT_STARTED") {
            return result({ stopped: true, steps, reason: `${step.node}: ${out.error ?? "không có gì để làm"}` });
        }
        if (kind === "WAITING") {
            const formPath = out.data?.formPath;
            return result({
                stopped: true, steps,
                reason: `${step.node} đang chờ BẠN trả lời.` + (formPath ? `\n  Điền vào: ${formPath}\n  Xong rồi chạy lại đúng lệnh này.` : ""),
            });
        }

        // ── Hợp đồng ra: hứa ghi gì thì phải có ──
        const produced = await verifyProduced(node.contract);
        if (!produced.ok) {
            return result({
                ok: false, steps,
                reason: `${step.node} báo thành công nhưng KHÔNG ghi output đã khai: ${produced.missing.join(", ")}\n` +
                    `  Phát hiện tại đây thay vì để node SAU chết vì thiếu file.`,
            });
        }

        // In ra những gì node vừa ghi. Lọc theo "có dấu /" thay vì theo tên field, để node mới
        // không phải đặt tên field theo một quy ước nào mới được hiển thị.
        for (const [k, val] of Object.entries(out.data ?? {})) {
            if (typeof val === "string" && val.includes("/")) log(`     ${k}: ${val}`);
            else if (Array.isArray(val) && val.length && val.every(x => typeof x === "string" && x.includes("/"))) {
                log(`     ${k}: ${val.join(", ")}`);
            }
        }
        for (const note of out.data?.notes ?? []) log(`     [${step.node}] ${note}`);

        // ── Rẽ nhánh theo một field trong `data` ──
        if (step.branchOn) {
            const value = String(out.data?.[step.branchOn]);
            log(`     ${step.branchOn}: ${value}`);
            const taken = step.branch.find(b => b.value === value);
            if (!taken) {
                return result({
                    ok: false, steps,
                    reason: `${step.node} trả về ${step.branchOn} = "${value}" — luồng không khai nhánh nào cho giá trị đó.\n` +
                        `  Đã khai: ${step.branch.map(b => b.value).join(", ")}. Bổ sung nhánh vào ${flow.file} rồi chạy lại.`,
                });
            }
            if (taken.action === "rework") {
                await markStep(taken.reworkNode, { status: "needs_rework", note: taken.reworkNote ?? `Yêu cầu làm lại từ ${step.node}` });
                return result({ stopped: true, steps: [...steps, { node: step.node, action: "rework" }], reason: taken.message ?? `Cần làm lại "${taken.reworkNode}".` });
            }
            if (taken.action === "stop") {
                return result({ stopped: true, steps: [...steps, { node: step.node, action: "stop" }], reason: taken.message });
            }
        }

        const output = out.data?.deliverableFile ?? node.contract.produces?.[0] ?? null;
        await markStep(step.node, { status: "done", output });
        steps.push({ node: step.node, action: "done", output });

        if (!noGate) {
            // Nói trước cái sẽ chặn ở lần chạy sau, để lần dừng đó là dự kiến chứ không phải bất ngờ.
            const gatedLater = flow.steps.some(s => s.gate === step.node);
            if (gatedLater) log(`     Cần duyệt trước khi đi tiếp: đọc ${output} rồi chạy  node agents/approve.js ${step.node} "<tên bạn>"`);
        }
    }

    if (flow.finish) {
        const closed = await finishRun(flow.finish);
        log(`\n>> Hết luồng "${flow.name}". Phiên "${closed?.run_id}" đã đóng (status: ${flow.finish}).`);
    }
    return result({ steps });
}

/**
 * Nạp một luồng theo tên rồi chạy. Dùng bởi shim `workflow/flow-*.js` và `qa.js`.
 * Tách khỏi `runFlow` để `runFlow` vẫn test được với một object luồng dựng tay.
 */
export async function runFlowByName(name, { argv = [], log = console.log, error = console.error } = {}) {
    const { loadFlows } = await import("./flow-file.js");
    const all = await loadFlows();
    const found = all.find(f => f.flow?.name === name);
    if (!found) {
        return result({
            ok: false,
            reason: `Không có luồng nào tên "${name}". Đang có: ${all.map(f => f.flow?.name).filter(Boolean).join(", ") || "(chưa có file luồng nào)"}`,
        });
    }
    if (found.problems.length) {
        return result({ ok: false, reason: [`File luồng "${found.flow.file}" khai sai:`, ...found.problems.map(p => "  " + p)].join("\n") });
    }
    return runFlow(found.flow, { argv, log, error });
}
