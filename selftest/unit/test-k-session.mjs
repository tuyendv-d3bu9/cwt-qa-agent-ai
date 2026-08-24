// Test K: phiên (run) + cửa duyệt người. KHÔNG gọi LLM.
// Chạy trên 1 runs.db TẠM trong scratchpad, không đụng memory/working/runs.db thật:
// db.js chỉ cho override đường dẫn knowledge DB, nên ở đây đổi cwd sang thư mục tạm
// -> RUNS_DB "memory/working/runs.db" resolve vào thư mục tạm đó.
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const repo = process.cwd();
const sandbox = path.join(os.tmpdir(), "qa-agent-k-test");
rmSync(sandbox, { recursive: true, force: true });
mkdirSync(path.join(sandbox, "memory", "working"), { recursive: true });

// Trạng thái JSON cũ, để kiểm tra migration một lần (K.2).
writeFileSync(path.join(sandbox, "memory", "working", "workflow.json"), JSON.stringify({
    run_id: null, feature: null, created_at: "2026-08-01T10:00:00.000Z",
    steps: [{ agent: "qa-analyst", status: "done", output: ".qa-run/deliverables/deliverable-analyst.md", human_approved: true, approved_by: "Cũ" }],
}), "utf8");

process.chdir(sandbox);
const M = await import("file:///" + path.join(repo, "agents/runtime/memory.js").split(path.sep).join("/"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// ─────────── K.2 migration từ workflow.json ───────────
const migrated = await M.loadState();
chk("nhập được state cũ từ workflow.json (không mất phiên đang chờ)",
    migrated.steps.length === 1 && migrated.steps[0].agent === "qa-analyst" && migrated.steps[0].human_approved === true,
    JSON.stringify(migrated));
chk("workflow.json cũ được đổi tên, không thể nhập lại lần 2",
    !existsSync(path.join(sandbox, "memory/working/workflow.json")) &&
    existsSync(path.join(sandbox, "memory/working/workflow.json.imported")));

// ─────────── K.3 hai run khác nhau KHÔNG lẫn steps ───────────
const r1 = await M.startRun("Function D - Voucher Checkout");
await M.markStep("qa-analyst", { status: "done", output: "a.md" });
await M.markStep("qa-test-designer", { status: "done", output: "b.md" });

const r2 = await M.startRun("Function E - Refund");
await M.markStep("qa-analyst", { status: "waiting_ask", round: 2, output: "gap.md" });

chk("run_id khác nhau và đọc được (hết cảnh run_id: null)",
    r1.run_id === "function-d-voucher-checkout-" + new Date().toISOString().slice(0, 10) &&
    r2.run_id.startsWith("function-e-refund-"), `${r1.run_id} | ${r2.run_id}`);

const s2 = await M.loadState();
chk(">>> steps của 2 run KHÔNG lẫn vào nhau",
    s2.run_id === r2.run_id && s2.steps.length === 1 && s2.steps[0].status === "waiting_ask",
    JSON.stringify(s2.steps.map(s => s.agent + ":" + s.status)));

const runs = await M.listRuns();
chk("lịch sử giữ được cả 3 run (imported + D + E)", runs.length === 3, JSON.stringify(runs.map(r => r.run_id)));

// cùng feature, cùng ngày -> id phải khác, không đè PK
const r2b = await M.startRun("Function E - Refund");
chk("2 run cùng feature cùng ngày -> id riêng (-r2), không xung đột PK",
    r2b.run_id !== r2.run_id && r2b.run_id.endsWith("-r2"), r2b.run_id);

// ─────────── K.4 cửa duyệt người ───────────
const r3 = await M.startRun("Gate test");
await M.markStep("qa-analyst", { status: "done", output: "deliverable-analyst.md" });

let blocked = null;
try { await M.requireApproved("qa-analyst"); } catch (e) { blocked = e.message; }
chk(">>> node sau bị CHẶN khi bước trước chưa duyệt", blocked !== null);
chk("message chặn nói rõ mở file nào + lệnh duyệt nào",
    blocked?.includes("deliverable-analyst.md") && blocked?.includes("node agents/approve.js qa-analyst"),
    JSON.stringify(blocked));

await M.approveStep("qa-analyst", "Tuyen");
const okStep = await M.requireApproved("qa-analyst");
chk("sau khi duyệt thì đi tiếp được", okStep.human_approved === true && okStep.approved_by === "Tuyen");

let notDone = null;
try { await M.requireApproved("qa-automation"); } catch (e) { notDone = e.message; }
chk("bước chưa chạy -> chặn với lý do 'chưa hoàn thành', không phải 'chưa duyệt'",
    notDone?.includes("chưa hoàn thành"), JSON.stringify(notDone));

// ─────────── bẫy: approval cũ không được dùng cho output mới ───────────
await M.markStep("qa-automation", { status: "done", output: "spec-v1.md" });
await M.approveStep("qa-automation", "Tuyen");
await M.markStep("qa-automation", { status: "needs_rework", note: "verifier: SPEC_ISSUE" });
await M.markStep("qa-automation", { status: "done", output: "spec-v2.md" });

let reGate = null;
try { await M.requireApproved("qa-automation"); } catch (e) { reGate = e.message; }
chk(">>> spec sinh lại sau needs_rework phải duyệt LẠI (approval cũ bị bỏ)",
    reGate !== null, JSON.stringify(reGate));

// duyệt lại, rồi markStep y nguyên -> chạy lại flow không được làm mất duyệt
await M.approveStep("qa-automation", "Tuyen");
await M.markStep("qa-automation", { status: "done", output: "spec-v2.md" });
const afterIdem = (await M.loadState()).steps.find(s => s.agent === "qa-automation");
chk("markStep lặp lại y nguyên -> KHÔNG xoá duyệt (idempotent)", afterIdem.human_approved === true, JSON.stringify(afterIdem));

// ─────────── patch sai khoá phải nổ, không im lặng ───────────
let typo = null;
try { await M.markStep("qa-verifier", { statuss: "done" }); } catch (e) { typo = e.message; }
chk("markStep với khoá sai -> throw (backend JSON cũ nhận rồi bỏ qua)", typo?.includes("statuss"), JSON.stringify(typo));

// ─────────── duyệt bước không tồn tại ───────────
let ghost = null;
try { await M.approveStep("qa-khong-ton-tai", "Tuyen"); } catch (e) { ghost = e.message; }
chk("duyệt bước chưa từng chạy -> throw, không tự tạo bước 'đã duyệt'", ghost !== null, JSON.stringify(ghost));

// ─────────── finishRun + phiên hiện tại ───────────
const done = await M.finishRun("done");
chk("finishRun đóng run hiện tại", done.status === "done" && done.run_id === r3.run_id);
const cur = await M.currentRun();
chk("run đã đóng vẫn là phiên hiện tại (để flow-2 biết phải mở run mới)",
    cur.run_id === r3.run_id && cur.status === "done");

// ─────────── printState chạy được, in cả lịch sử ───────────
const logs = [];
const realLog = console.log;
console.log = (m = "") => logs.push(String(m));
await M.printState();
console.log = realLog;
const printed = logs.join("\n");
chk("printState in run hiện tại + lịch sử run trước (K.5)",
    printed.includes(r3.run_id) && printed.includes("LỊCH SỬ") && printed.includes(r1.run_id),
    printed);

process.chdir(repo);
let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
console.log(`(sandbox: ${sandbox})`);
